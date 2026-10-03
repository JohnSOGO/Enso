// SPEC §7C.3–7C.4, §8.11 — a thing's photo inside the thing form: pick (the phone offers camera or
// library), shrink, thumbnail, full size on tap (inside the dialog), remove / replace, and the
// read-photo request. Nothing is uploaded here: the form PUTs or DELETEs the photo on Save.
// Also `FromThing`, the "From Things to do" block of the event form (§8.4, §7C.2).
import { useEffect, useRef, useState } from 'react';
import { apiUrl, errorText, get, upload } from '../api';
import type { PhotoReading, Thing } from '../../../src/shared/things';
import s from './ThingPhoto.module.css';

/** A saved thing's photo — `?v=` busts the private cache when the photo or thing changes. */
export const photoSrc = (t: Thing) => apiUrl(`/things/${t.id}/photo?v=${encodeURIComponent(t.updatedAt)}`);

/** The thumbnail: a tap shows it full size within the dialog, another tap shrinks it back. */
function Thumb({ src, alt }: { src: string; alt: string }) {
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
  onPick: (photo: Blob) => void;
  onRemove: () => void;
  /** Fills the form's empty fields; returns how many it filled. */
  onReading: (r: PhotoReading) => number;
}

export function ThingPhoto({ savedSrc, pending, onPick, onRemove, onReading }: Props) {
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
    setStep('Reading the photo…');
    try {
      const reading = await upload<PhotoReading>('POST', '/things/read-photo', photo);
      if (!live.current) return;
      const n = onReading(reading);
      setSaid(n ? `Filled ${n} empty field${n > 1 ? 's' : ''} from the photo — check them.` : 'Nothing new to fill in from the photo.');
    } catch (e) {
      if (live.current) setError(`${errorText(e)} The photo is still attached.`);
    } finally {
      if (live.current) setStep(null);
    }
  }

  const src = pendingUrl ?? savedSrc;
  return (
    <div className={s.photo}>
      {src && <Thumb src={src} alt="The thing's photo" />}
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

/** "From Things to do" in the event form (§8.4): the thing's title and photo, compact. */
export function FromThing({ thingId }: { thingId: string }) {
  const [thing, setThing] = useState<Thing | null>(null);
  const [gap, setGap] = useState<string | null>(null);
  useEffect(() => {
    get<Thing>(`/things/${thingId}`).then(setThing).catch((e) => setGap(errorText(e)));
  }, [thingId]);
  return (
    <div className={s.from}>
      <span className="muted">From Things to do</span>
      {thing && <b className={s.fromTitle}>{thing.title}</b>}
      {gap && <span className="muted">— couldn't load it: {gap}</span>}
      {thing?.hasPhoto && <Thumb src={photoSrc(thing)} alt={`Photo for ${thing.title}`} />}
    </div>
  );
}
