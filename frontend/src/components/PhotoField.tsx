// SPEC §8.8, §8.11 — a photo inside a form: pick (the phone offers camera or library), shrink,
// thumbnail, full size on tap (inside the dialog), remove / replace, and an optional read step with
// its status and refusal. No API path of its own: the form saves the photo, the caller does the read.
import { useEffect, useRef, useState } from 'react';
import { errorText } from '../api';
import s from './PhotoField.module.css';

/** The thumbnail: a tap shows it full size within the dialog, another tap shrinks it back. */
export function Thumb({ src, alt }: { src: string; alt: string }) {
  const [big, setBig] = useState(false);
  return (
    <button type="button" className={`plain ${s.thumbButton}`} onClick={() => setBig(!big)}
      aria-label={big ? 'Show the photo smaller' : 'Show the photo full size'} aria-pressed={big}>
      <img src={src} alt={alt} className={big ? s.full : s.thumb} />
    </button>
  );
}

interface Props {
  /** The saved photo still attached, or null. */
  savedSrc: string | null;
  /** A picked, shrunk photo not yet saved. */
  pending: Blob | null;
  /** The thumbnail's alt text. */
  alt: string;
  onPick: (photo: Blob) => void;
  onRemove: () => void;
  /** Reads the picked photo: resolves to the status text, rejects with the refusal. */
  read?: (photo: Blob) => Promise<string>;
}

export function PhotoField({ savedSrc, pending, alt, onPick, onRemove, read }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!pending) { setPendingUrl(null); return; }
    const url = URL.createObjectURL(pending);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  async function picked(file: File | undefined) {
    if (!file) return;
    setError(null); setSaid(null); setStep('Getting the photo ready…');
    let photo: Blob;
    try {
      const { shrinkPhoto } = await import('../shrink-photo');
      photo = await shrinkPhoto(file);
    } catch (e) {
      if (live.current) { setError(errorText(e)); setStep(null); }
      return;
    }
    if (!live.current) return;
    onPick(photo);
    if (!read) { setStep(null); return; }
    setStep('Reading the photo…');
    try {
      const text = await read(photo);
      if (!live.current) return;
      setSaid(text);
    } catch (e) {
      if (live.current) setError(`${errorText(e)} The photo is still attached.`);
    } finally {
      if (live.current) setStep(null);
    }
  }

  const src = pendingUrl ?? savedSrc;
  return (
    <div className={s.photo}>
      {src && <Thumb src={src} alt={alt} />}
      <input ref={input} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden
        onChange={(e) => { picked(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="row wrap">
        <button type="button" disabled={!!step} onClick={() => input.current?.click()}>{src ? 'Replace photo' : '📷 Add photo'}</button>
        {src && <button type="button" disabled={!!step} onClick={() => { setSaid(null); setError(null); onRemove(); }}>Remove photo</button>}
      </div>
      {step && <p className="muted" role="status">{step}</p>}
      {said && <p className="muted" role="status">{said}</p>}
      {error && <div role="alert" className="alert-error">{error}</div>}
    </div>
  );
}
