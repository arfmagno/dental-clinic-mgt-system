import { useEffect, useRef, useState } from 'react';
import { compressPhoto, PhotoError } from '../services/photoService';

interface Props {
  value: string;
  onChange(dataUrl: string): void;
}

/** Optional patient photo: take one with the camera, or upload a file. Always compressed before storing. */
export function PhotoPicker({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  async function accept(blob: Blob) {
    setBusy(true);
    setError('');
    try {
      onChange(await compressPhoto(blob));
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : 'Could not process that image.');
    } finally {
      setBusy(false);
    }
  }

  async function openCamera() {
    setError('');
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
    canvas.toBlob((b) => b && void accept(b), 'image/jpeg', 0.9);
    stop();
    setCamera(false);
  }

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
      ) : (
        <div className="row photo-row">
          <div className="avatar large">{value ? <img src={value} alt="Patient" /> : <span aria-hidden>👤</span>}</div>
          <div className="stack tight">
            <div className="row wrap">
              <button type="button" className="btn" onClick={openCamera} disabled={busy}>Take photo</button>
              <button type="button" className="btn" onClick={() => (fileRef.current?.removeAttribute('capture'), fileRef.current?.click())} disabled={busy}>Upload</button>
              {value && <button type="button" className="btn ghost" onClick={() => onChange('')}>Remove</button>}
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
