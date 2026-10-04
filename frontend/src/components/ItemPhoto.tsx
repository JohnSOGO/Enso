// SPEC §8.8, §7A.3 — the 📷 on a list's add row: pick a photo (camera or library), shrink it (lazy shrink-photo),
// POST /list-items/read-photo while busy, then hand the waiting photo and the name — or the refusal — to the list
// panel. Shows the waiting photo as a small thumbnail with ✕ (the whole thumbnail is the ✕ button). Holds no list
// state: the panel fills the box, keeps the waiting photo and saves it after Add.
import { useEffect, useRef, useState } from 'react';
import { errorText, upload } from '../api';
import type { ItemReading } from '../../../src/shared/item-reading';
import s from './ItemPhoto.module.css';

/** What a snap gave: the shrunk photo (null when it couldn't be shrunk), and the name or why there is none. */
export type Snap = { photo: Blob; name: string; error?: undefined } | { photo: Blob | null; name?: undefined; error: string };

interface Props {
  /** The photo waiting for Add, or null. */
  waiting: Blob | null;
  onSnap: (snap: Snap) => void;
  /** ✕ on the waiting photo. */
  onDrop: () => void;
}

export function ItemPhoto({ waiting, onSnap, onDrop }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!waiting) { setUrl(null); return; }
    const u = URL.createObjectURL(waiting);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [waiting]);

  async function picked(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    let photo: Blob | null = null;
    try {
      const { shrinkPhoto } = await import('../shrink-photo');
      photo = await shrinkPhoto(file);
      const r = await upload<ItemReading>('POST', '/list-items/read-photo', photo);
      if (live.current) onSnap({ photo, name: r.name });
    } catch (e) {
      if (live.current) onSnap({ photo, error: errorText(e) });
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <>
      {url && (
        <button type="button" className={`plain ${s.waiting}`} aria-label="Drop the photo" title="Drop the photo" onClick={onDrop}>
          <img src={url} alt="" className={s.thumb} />
          <span aria-hidden className={s.drop}>✕</span>
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden
        onChange={(e) => { picked(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className={s.snap} disabled={busy} aria-busy={busy}
        aria-label={busy ? 'Reading the photo…' : 'Snap an item'} title={busy ? 'Reading the photo…' : 'Snap an item'}
        onClick={() => input.current?.click()}>{busy ? '…' : '📷'}</button>
    </>
  );
}
