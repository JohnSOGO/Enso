// SPEC §7C.3 — shrink a picked image on the phone before it is uploaded or read: longest side
// PHOTO_LONG_SIDE px, JPEG at PHOTO_QUALITY, via canvas. No app state.
import { PHOTO_LONG_SIDE, PHOTO_QUALITY } from '../../src/shared/things';

const CANT_DECODE = "This browser can't open that picture (HEIC photos open only on Apple devices). Try a JPEG or PNG.";

type Source = { image: CanvasImageSource; width: number; height: number; done: () => void };

/** Decode with createImageBitmap (honours EXIF rotation); fall back to an <img> where it is missing or fails. */
async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: b, width: b.width, height: b.height, done: () => b.close() };
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error(CANT_DECODE)); img.src = url; });
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

/** Resolves to an image/jpeg Blob no larger than PHOTO_LONG_SIDE on its longest side; rejects with a plain message. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const src = await decode(file);
  try {
    if (!src.width || !src.height) throw new Error(CANT_DECODE);
    const scale = Math.min(1, PHOTO_LONG_SIDE / Math.max(src.width, src.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(src.width * scale);
    canvas.height = Math.round(src.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("This browser can't shrink pictures (no canvas).");
    ctx.drawImage(src.image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, fail) =>
      canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't turn the picture into a JPEG."))), 'image/jpeg', PHOTO_QUALITY));
  } finally {
    src.done();
  }
}
