// SPEC §8.8 — the list item form modal: text, note, owner, Mark done / Not done, Save / Cancel / Delete.
// Owns the `Item` shape; HouseholdLists imports both from here, never the reverse.
import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { del, errorText, patch } from '../api';
import { useApp } from '../state';
import type { List } from '../../../src/shared/vocab';
import { NOTE_MAX, TEXT_MAX } from '../../../src/shared/lists';

export interface Item {
  id: string; list: List; text: string; note: string | null; ownerId: string | null;
  createdBy: string; createdAt: string; checkedAt: string | null; checkedBy: string | null;
}

/** Wish list item form (§8.8): text, note, owner, Mark done / Not done, Save / Cancel / Delete. */
export function ItemForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const { members } = useApp();
  const init = useMemo(() => ({ text: item.text, note: item.note ?? '', ownerId: item.ownerId }), [item]);
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const done = item.checkedAt !== null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onSaved(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  // ownerId only when changed: an item owned by a since-disabled member can still be edited.
  const fields = () => ({ text: f.text, note: f.note, ...(f.ownerId !== init.ownerId ? { ownerId: f.ownerId } : {}) });
  const save = () => run(() => patch(`/list-items/${item.id}`, fields()));
  const toggleDone = () => run(() => patch(`/list-items/${item.id}`, { ...fields(), checked: !done }));

  return (
    <Modal title={`Edit: ${item.text}`} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        <button className="primary" disabled={busy || !f.text.trim()} onClick={save}>Save</button>
        <button disabled={busy || !f.text.trim()} onClick={toggleDone}>{done ? 'Not done' : 'Mark done'}</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={busy}>
        <label className="field"><span>Text</span>
          <input value={f.text} maxLength={TEXT_MAX} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
        <label className="field"><span>Note</span>
          <textarea rows={4} value={f.note} maxLength={NOTE_MAX} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <div className="field" role="radiogroup" aria-label="Whose is it">
          <span className="muted" style={{ fontSize: '.8rem' }}>Whose (none = household)</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            <label className="chip" style={{ padding: '4px 8px' }}>
              <input type="radio" name="owner" checked={f.ownerId === null} onChange={() => setF({ ...f, ownerId: null })} /> Household
            </label>
            {members.filter((m) => !m.disabledAt || m.id === f.ownerId).map((m) => (
              <label key={m.id} className="chip" style={{ padding: '4px 8px', borderColor: m.color }}>
                <input type="radio" name="owner" checked={f.ownerId === m.id} onChange={() => setF({ ...f, ownerId: m.id })} /> {m.displayName}
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
        <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete “${item.text}”?`)) run(() => del(`/list-items/${item.id}`)); }}>Delete</button>
      </div>
    </Modal>
  );
}
