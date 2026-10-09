// SPEC §7C.3, §8.8 — picking photos: the hidden file input (the phone offers camera or library) and its open(),
// plus shrinkPicked, the lazy shrink-photo. Delivers the raw files; never uploads, holds no photo, URL or status.
import { useRef } from 'react';

/** The hidden `type=file accept=image/*` input and open(); onPick gets ≥ 1 file, then the input is reset. */
export function usePhotoPick(onPick: (files: File[]) => void, { multiple }: { multiple?: boolean } = {}) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input ref={ref} type="file" accept="image/*" multiple={multiple} className="visually-hidden" tabIndex={-1} aria-hidden
      onChange={(e) => { const files = [...(e.target.files ?? [])]; if (files.length) onPick(files); e.target.value = ''; }} />
  );
  return { input, open: () => ref.current?.click() };
}

/** A picked file (or a clipboard image) shrunk to the upload JPEG; shrink-photo loads only when first used. */
export const shrinkPicked = async (file: Blob): Promise<Blob> => (await import('../shrink-photo')).shrinkPhoto(file);
