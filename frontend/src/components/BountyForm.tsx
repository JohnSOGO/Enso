// SPEC §8.15b — the ＋ Bounty sheet (admins): title, points and a note, sent as POST /bounties (§7B.8). The server
// pushes everyone else; a refusal shows inside the sheet. Holds only its draft.
import { useState } from 'react';
import { Modal } from './Modal';
import { errorText, post } from '../api';
import { useApp } from '../state';
import { BOUNTY_NOTE_MAX, BOUNTY_TITLE_MAX, POINTS_MAX, POINTS_MIN } from '../../../src/shared/bounties';

export const POINT_CHOICES = Array.from({ length: POINTS_MAX - POINTS_MIN + 1 }, (_, i) => POINTS_MIN + i);

export function BountyForm({ onClose }: { onClose: () => void }) {
  const { refresh } = useApp();
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(POINTS_MIN);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null);
    try { await post('/bounties', { title, points, note }); refresh(); onClose(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title="＋ Bounty" onClose={onClose} dirty={!!title || !!note} error={error}
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
    </Modal>
  );
}
