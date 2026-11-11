export const PHOTO_MAX_INPUT_BYTES = 10 * 1024 * 1024; // refuse huge originals outright
const MAX_SIDE = 640; // px; plenty for an ID-style portrait
const TARGET_BYTES = 70 * 1024; // compressed result is kept at or under this where possible

export class PhotoError extends Error {}

/**
 * Validates, downsizes and re-encodes an uploaded or captured image to a small JPEG data URL
 * that is stored on the device (and synced as part of the patient row).
 */
export async function compressPhoto(file: Blob): Promise<string> {
  checkPhotoFile(file);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoError('That image could not be read.');
  }

  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let best = '';
  for (let pass = 0; pass < 4; pass++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('Image processing is not available.');
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.8, 0.65, 0.5, 0.4]) {
      best = canvas.toDataURL('image/jpeg', quality);
      if (dataUrlBytes(best) <= TARGET_BYTES) {
        bitmap.close();
        return best;
      }
    }
    scale *= 0.75; // still too big: shrink and retry
  }
  bitmap.close();
  return best;
}

const dataUrlBytes = (url: string) => Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);

/** Refuses non-images and huge originals before any work is done. */
export function checkPhotoFile(file: Blob) {
  if (!file.type.startsWith('image/')) throw new PhotoError('Please choose an image file.');
  if (file.size > PHOTO_MAX_INPUT_BYTES) throw new PhotoError('Image is too large (max 10 MB).');
}

/** Where a square crop sits on the original: its centre (fractions of the image) and the zoom (1 = the largest square that fits). */
export interface Framing {
  cx: number;
  cy: number;
  zoom: number;
}

/** The square side and top-left corner, in source pixels, for a framing. Pure, for testing. */
export function cropRect(w: number, h: number, f: Framing): { x: number; y: number; side: number } {
  const side = Math.min(w, h) / Math.max(1, f.zoom);
  const x = Math.min(w - side, Math.max(0, f.cx * w - side / 2));
  const y = Math.min(h - side, Math.max(0, f.cy * h - side / 2));
  return { x, y, side };
}

/** Cuts the framed square out of the original image (at most MAX_SIDE px) as a PNG blob. */
export async function cropSquare(url: string, w: number, h: number, f: Framing): Promise<Blob> {
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new PhotoError('That image could not be read.');
  }
  const { x, y, side } = cropRect(w, h, f);
  const out = Math.max(1, Math.round(Math.min(MAX_SIDE, side)));
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('Image processing is not available.');
  ctx.drawImage(img, x, y, side, side, 0, 0, out, out);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new PhotoError('Could not process that image.');
  return blob;
}
