import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { checkPhotoFile, compressPhoto, cropSquare, PhotoError, type Framing } from '../services/photoService';
import { Icon } from './Icon';

interface Props {
  value: string;
  onChange(dataUrl: string): void;
}

const FRAME = 168; // px, the on-screen crop frame
const MAX_ZOOM = 3;
const CENTERED: Framing = { cx: 0.5, cy: 0.5, zoom: 1 };

interface Source {
  url: string;
  w: number;
  h: number;
}

/** Keeps the frame covered: the centre can't move closer to an edge than half the visible span. */
function clampFraming(f: Framing, s: Source): Framing {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, f.zoom));
  const scale = (FRAME / Math.min(s.w, s.h)) * zoom;
  const hx = FRAME / 2 / (s.w * scale);
  const hy = FRAME / 2 / (s.h * scale);
  return { zoom, cx: Math.min(1 - hx, Math.max(hx, f.cx)), cy: Math.min(1 - hy, Math.max(hy, f.cy)) };
}

async function loadSize(url: string): Promise<Source> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new PhotoError('That image could not be read.');
  }
  return { url, w: img.naturalWidth, h: img.naturalHeight };
}

/**
 * Optional patient photo. Before there is one: Camera or Upload. Once there is one: drag (or use the
 * arrow keys) to reposition, zoom with the slider, and only two icon buttons, Retake and Delete.
 * The stored photo is a square crop of the original, re-cut from the original on every adjustment.
 */
export function PhotoPicker({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastWay, setLastWay] = useState<'camera' | 'upload'>('camera');
  const [source, setSource] = useState<Source | null>(null);
  const [framing, setFraming] = useState<Framing>(CENTERED);
  const drag = useRef<{ x: number; y: number; start: Framing } | null>(null);
  const commitTimer = useRef<number | undefined>(undefined);
  const objectUrl = useRef<string | null>(null);

  // An existing photo (editing a patient) is the source until a new one is taken.
  useEffect(() => {
    if (value && !source) loadSize(value).then(setSource, () => undefined);
    // only on mount: our own crops must not become the source
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  // Release the camera and the original image when the picker unmounts.
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      window.clearTimeout(commitTimer.current);
    },
    [],
  );

  async function commit(s: Source, f: Framing) {
    try {
      onChange(await compressPhoto(await cropSquare(s.url, s.w, s.h, f)));
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : 'Could not process that image.');
    }
  }
  const commitSoon = (s: Source, f: Framing) => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => void commit(s, f), 200);
  };

  async function accept(blob: Blob) {
    setBusy(true);
    setError('');
    try {
      checkPhotoFile(blob);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      const s = await loadSize(objectUrl.current);
      setSource(s);
      setFraming(CENTERED);
      await commit(s, CENTERED);
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : 'Could not process that image.');
    } finally {
      setBusy(false);
    }
  }

  function upload() {
    setLastWay('upload');
    fileRef.current?.removeAttribute('capture');
    fileRef.current?.click();
  }

  async function openCamera() {
    setError('');
    setLastWay('camera');
    if (!navigator.mediaDevices?.getUserMedia) return fileRef.current?.setAttribute('capture', 'user'), fileRef.current?.click();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setCamera(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError('Camera not available. You can upload a photo instead.');
    }
  }

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob((b) => b && void accept(b), 'image/jpeg', 0.92);
    stop();
    setCamera(false);
  }

  function remove() {
    window.clearTimeout(commitTimer.current);
    setSource(null);
    setFraming(CENTERED);
    onChange('');
  }

  const move = (f: Framing, now = false) => {
    if (!source) return;
    const next = clampFraming(f, source);
    setFraming(next);
    if (now) void commit(source, next);
    else commitSoon(source, next);
  };

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!source) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: framing };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !source) return;
    const scale = (FRAME / Math.min(source.w, source.h)) * d.start.zoom;
    setFraming(clampFraming({ ...d.start, cx: d.start.cx - (e.clientX - d.x) / (source.w * scale), cy: d.start.cy - (e.clientY - d.y) / (source.h * scale) }, source));
  }
  function onPointerUp() {
    if (!drag.current || !source) return;
    drag.current = null;
    void commit(source, framing);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!source) return;
    const step = 0.04 / framing.zoom;
    const delta: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    move({ ...framing, cx: framing.cx + d[0], cy: framing.cy + d[1] });
  }

  const hasPhoto = Boolean(value);
  const shown = hasPhoto && source;
  const scale = shown ? (FRAME / Math.min(source.w, source.h)) * framing.zoom : 1;

  return (
    <div className="photo-picker">
      {camera ? (
        <div className="camera">
          <video ref={videoRef} playsInline muted />
          <div className="row">
            <button type="button" className="btn primary" onClick={snap}>Capture</button>
            <button type="button" className="btn" onClick={() => (stop(), setCamera(false))}>Cancel</button>
          </div>
        </div>
      ) : hasPhoto ? (
        <div className="row photo-row">
          <div
            className="photo-frame"
            style={{ width: FRAME, height: FRAME }}
            role="group"
            aria-label="Patient photo: drag or use the arrow keys to reposition"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            {shown ? (
              <img
                src={source.url}
                alt="Patient"
                draggable={false}
                style={{
                  width: source.w * scale,
                  height: source.h * scale,
                  transform: `translate(${FRAME / 2 - framing.cx * source.w * scale}px, ${FRAME / 2 - framing.cy * source.h * scale}px)`,
                }}
              />
            ) : (
              <img src={value} alt="Patient" className="cover" draggable={false} />
            )}
          </div>
          <div className="stack tight photo-tools">
            <div className="row">
              <button type="button" className="btn icon" title={lastWay === 'upload' ? 'Choose another photo' : 'Retake photo'} aria-label={lastWay === 'upload' ? 'Choose another photo' : 'Retake photo'} onClick={() => (lastWay === 'upload' ? upload() : void openCamera())} disabled={busy}>
                <Icon name={lastWay === 'upload' ? 'upload' : 'camera'} />
              </button>
              <button type="button" className="btn icon danger-text" title="Delete photo" aria-label="Delete photo" onClick={remove} disabled={busy}>
                <Icon name="trash" />
              </button>
            </div>
            {shown && (
              <label className="zoom">
                <Icon name="search" size={16} />
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={framing.zoom}
                  aria-label="Zoom"
                  onChange={(e) => move({ ...framing, zoom: Number(e.target.value) })}
                />
              </label>
            )}
            <small className="muted">Drag the photo to reposition it.</small>
          </div>
        </div>
      ) : (
        <div className="row photo-row">
          <div className="avatar large"><span aria-hidden>👤</span></div>
          <div className="stack tight">
            <div className="row wrap">
              <button type="button" className="btn" onClick={openCamera} disabled={busy}><Icon name="camera" size={18} /> Camera</button>
              <button type="button" className="btn" onClick={upload} disabled={busy}><Icon name="upload" size={18} /> Upload</button>
            </div>
            <small className="muted">Optional. Photos are resized and compressed, and stored on this device.</small>
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Photo file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void accept(f);
        }}
      />
      {busy && <small className="muted">Processing…</small>}
      {error && <small className="error" role="alert">{error}</small>}
    </div>
  );
}
