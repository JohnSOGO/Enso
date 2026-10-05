// SPEC §8.15 — the area editor inside a chore's What done looks like sheet: name, expectations (one per line),
// photos (add up to AREA_PHOTOS_MAX, shrunk like a thing's photo; ✕ to remove). Save sends the area, then each new
// photo, then each removal; a refusal shows here and keeps the editor open. The server validates (§7B.6).
import { useEffect, useRef, useState } from 'react';
import { Grow } from './Grow';
import { Thumb } from './PhotoField';
import { apiUrl, del, errorText, patch, post, upload } from '../api';
import { AREA_NAME_MAX, AREA_PHOTOS_MAX, type ChoreArea } from '../../../src/shared/chore-areas';
import s from './ChoreAreas.module.css';

export const areaPhotoSrc = (photoId: string) => apiUrl(`/chore-area-photos/${photoId}`);

/** A picked photo not yet saved, with its object URL for the thumbnail. */
interface Pending { blob: Blob; url: string }

export function ChoreAreaForm({ choreId, area, onDirty, onSaved, onCancel }: {
  choreId: string; area: ChoreArea | null; onDirty: (dirty: boolean) => void; onSaved: () => void; onCancel: () => void;
}) {
  const [saved, setSaved] = useState(area);
  const [name, setName] = useState(area?.name ?? '');
  const [lines, setLines] = useState(area?.expectations.join('\n') ?? '');
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const dirty = name !== (area?.name ?? '') || lines !== (area?.expectations.join('\n') ?? '') || removed.length > 0 || pending.length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  const kept = (saved?.photos ?? []).filter((id) => !removed.includes(id));
  const room = AREA_PHOTOS_MAX - kept.length - pending.length;

  async function picked(file: File | undefined) {
    if (!file) return;
    setError(null); setBusy('Getting the photo ready…');
    try {
      const { shrinkPhoto } = await import('../shrink-photo');
      const blob = await shrinkPhoto(file);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setPending((p) => [...p, { blob, url }]);
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }

  async function save() {
    setBusy('Saving…'); setError(null);
    try {
      const fields = { name, expectations: lines.split('\n') };
      let a = saved ? await patch<ChoreArea>(`/chore-areas/${saved.id}`, fields) : await post<ChoreArea>(`/chores/${choreId}/areas`, fields);
      setSaved(a); // a retry after a photo failure edits this area instead of adding another
      for (const p of pending) {
        a = await upload<ChoreArea>('POST', `/chore-areas/${a.id}/photos`, p.blob);
        setSaved(a);
        setPending((left) => left.filter((x) => x !== p));
      }
      for (const id of removed) {
        await del(`/chore-area-photos/${id}`);
        setRemoved((left) => left.filter((x) => x !== id));
      }
      onSaved();
    } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  }

  async function remove() {
    if (!saved || !confirm(`Delete the area "${saved.name}" and its photos?`)) return;
    setBusy('Deleting…'); setError(null);
    try { await del(`/chore-areas/${saved.id}`); onSaved(); } catch (e) { setError(errorText(e)); setBusy(null); }
  }

  return (
    <div className={s.editor}>
      {error && <div role="alert" className="alert-error">{error}</div>}
      <fieldset disabled={!!busy}>
        <label className="field"><span>Area</span>
          <input value={name} maxLength={AREA_NAME_MAX} placeholder="e.g. Sink" autoFocus={!area} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field"><span>Expectations</span>
          <Grow value={lines} placeholder="One per line, e.g. No dishes left in the sink" onChange={(e) => setLines(e.target.value)} />
        </label>
        <div className="field" role="group" aria-label="Photos">
          <span className="muted" style={{ fontSize: '.8rem' }}>Photos of it done right</span>
          <div className={s.photos}>
            {kept.map((id, i) => (
              <span key={id} className={s.photo}>
                <Thumb src={areaPhotoSrc(id)} alt={`${name || 'Area'} photo ${i + 1}`} />
                <button type="button" className="plain" aria-label={`Remove photo ${i + 1}`} title={`Remove photo ${i + 1}`}
                  onClick={() => setRemoved((r) => [...r, id])}>✕</button>
              </span>
            ))}
            {pending.map((p, i) => (
              <span key={p.url} className={s.photo}>
                <Thumb src={p.url} alt={`${name || 'Area'} photo ${kept.length + i + 1}`} />
                <button type="button" className="plain" aria-label={`Remove photo ${kept.length + i + 1}`} title={`Remove photo ${kept.length + i + 1}`}
                  onClick={() => setPending((left) => left.filter((x) => x !== p))}>✕</button>
              </span>
            ))}
          </div>
          <input ref={input} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden
            onChange={(e) => { picked(e.target.files?.[0]); e.target.value = ''; }} />
          {room > 0 && <button type="button" onClick={() => input.current?.click()}>📷 Add photo</button>}
        </div>
      </fieldset>
      {busy && <p className="muted" role="status">{busy}</p>}
      <div className="row wrap">
        <button className="primary" disabled={!!busy || !name.trim()} onClick={save}>Save</button>
        <button disabled={!!busy} onClick={() => { if (!dirty || confirm('Discard your changes?')) onCancel(); }}>Cancel</button>
        {saved && <button className="danger" disabled={!!busy} onClick={remove}>Delete area</button>}
      </div>
    </div>
  );
}
