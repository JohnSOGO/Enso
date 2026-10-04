// SPEC §7C.3–7C.4, §8.11 — a thing's photo inside the thing form: the PhotoField plus the
// read-photo request that fills the form's empty fields. Nothing is uploaded here: the form PUTs or
// DELETEs the photo on Save.
// Also `FromThing`, the "From Things to do" block of the event form (§8.4, §7C.2).
import { useEffect, useState } from 'react';
import { apiUrl, errorText, get, upload } from '../api';
import type { PhotoReading, Thing } from '../../../src/shared/things';
import { PhotoField, Thumb } from './PhotoField';
import s from './ThingPhoto.module.css';

/** A saved thing's photo — `?v=` busts the private cache when the photo or thing changes. */
export const photoSrc = (t: Thing) => apiUrl(`/things/${t.id}/photo?v=${encodeURIComponent(t.updatedAt)}`);

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
  async function read(photo: Blob) {
    const n = onReading(await upload<PhotoReading>('POST', '/things/read-photo', photo));
    return n ? `Filled ${n} empty field${n > 1 ? 's' : ''} from the photo — check them.` : 'Nothing new to fill in from the photo.';
  }
  return <PhotoField savedSrc={savedSrc} pending={pending} alt="The thing's photo" onPick={onPick} onRemove={onRemove} read={read} />;
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
