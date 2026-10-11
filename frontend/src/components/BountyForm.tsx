// SPEC §8.15b — the ＋ Bounty sheet (admins): title, points, a note and an optional picture, sent as POST /bounties then
// PUT /bounties/{id}/photo (§7B.8). The server pushes everyone else; a refusal shows inside the sheet, and if only the
// picture fails the bounty stands. Holds only its draft.
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Thumb } from './PhotoField';
import { shrinkPicked, usePhotoPick } from './usePhotoPick';
import { errorText, post, upload } from '../api';
import { useApp } from '../state';
import { BOUNTY_NOTE_MAX, BOUNTY_TITLE_MAX, POINTS_MAX, POINTS_MIN, type Bounty } from '../../../src/shared/bounties';

export const POINT_CHOICES = Array.from({ length: POINTS_MAX - POINTS_MIN + 1 }, (_, i) => POINTS_MIN + i);

export function BountyForm({ onClose }: { onClose: () => void }) {
  const { refresh } = useApp();
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(POINTS_MIN);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const pick = usePhotoPick(async ([f]) => {
    try { setPhoto(await shrinkPicked(f)); setError(null); } catch (e) { setError(errorText(e)); }
  });
  useEffect(() => {
    if (!photo) { setSrc(null); return; }
    const url = URL.createObjectURL(photo);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function send() {
    setBusy(true); setError(null);
    let id = posted; // after a failed picture, Post again sends only the picture
    if (!id) {
      try { id = (await post<Bounty>('/bounties', { title, points, note })).id; setPosted(id); }
      catch (e) { setError(errorText(e)); setBusy(false); return; }
    }
    try {
      if (photo) await upload('PUT', `/bounties/${id}/photo`, photo);
      refresh(); onClose();
    } catch (e) {
      setError(`Posted, but the picture did not go through: ${errorText(e)} Add it again from the bounty's card.`);
      refresh();
    } finally { setBusy(false); }
  }

  return (
    <Modal title="＋ Bounty" onClose={onClose} dirty={!!title || !!note || !!photo} error={error}
      footer={<>
        <button className="primary" disabled={!title.trim() || busy} onClick={send}>{busy ? 'Posting…' : 'Post'}</button>
        <button onClick={onClose}>Cancel</button>
      </>}>
      <p className="muted">Anyone can take it. Points count once an admin says OK.</p>
      <label>Title
        <input value={title} maxLength={BOUNTY_TITLE_MAX} placeholder="e.g. Clean the downstairs toilet" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>Points
        <select value={points} onChange={(e) => setPoints(Number(e.target.value))}>
          {POINT_CHOICES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label>Note
        <input value={note} maxLength={BOUNTY_NOTE_MAX} placeholder="e.g. sink, seat and floor" onChange={(e) => setNote(e.target.value)} />
      </label>
      {pick.input}
      {src && <Thumb src={src} alt={`The picture for ${title || 'this bounty'}`} />}
      <button type="button" onClick={pick.open}>📷 {photo ? 'Replace photo' : 'Add photo'}</button>
    </Modal>
  );
}
