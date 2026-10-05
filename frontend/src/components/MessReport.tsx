// SPEC §8.15a — 📸 Report a mess: a photo (required), which chore (optional) and a note, sent as POST /messes with
// the photo as the body (§7B.7). The server asks everyone else; a refusal shows inside the sheet.
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { PhotoField } from './PhotoField';
import type { Chore } from './Chores';
import { errorText, get, upload } from '../api';
import { useApp } from '../state';
import { MESS_NOTE_MAX } from '../../../src/shared/messes';

export function MessReport({ onClose }: { onClose: () => void }) {
  const { refresh } = useApp();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [chores, setChores] = useState<Chore[]>([]);
  const [choreId, setChoreId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { get<Chore[]>('/chores').then(setChores).catch(() => setChores([])); }, []);

  async function send() {
    if (!photo) return;
    setBusy(true); setError(null);
    try {
      const q = new URLSearchParams({ ...(choreId ? { choreId } : {}), ...(note.trim() ? { note: note.trim() } : {}) }).toString();
      await upload('POST', `/messes${q ? `?${q}` : ''}`, photo);
      refresh(); onClose();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title="Report a mess" onClose={onClose} dirty={!!photo || !!note} error={error}
      footer={<>
        <button className="primary" disabled={!photo || busy} onClick={send}>{busy ? 'Reporting…' : 'Report'}</button>
        <button onClick={onClose}>Cancel</button>
      </>}>
      <p className="muted">A photo of the mess you cleaned up. Everyone else is asked whether it was theirs.</p>
      <PhotoField savedSrc={null} pending={photo} alt="The mess" onPick={setPhoto} onRemove={() => setPhoto(null)} />
      <label>Which chore?
        <select value={choreId} onChange={(e) => setChoreId(e.target.value)}>
          <option value="">None</option>
          {[...chores].sort((a, b) => a.title.localeCompare(b.title)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <label>Note
        <input value={note} maxLength={MESS_NOTE_MAX} placeholder="e.g. pans left on the stove" onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}
