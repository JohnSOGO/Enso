// SPEC §8.8 — the list item form modal: text, note, Assigned to (one member or Nobody), Save / Cancel / Delete.
// Owns the `Item` shape; HouseholdLists imports both from here, never the reverse.
import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { del, errorText, patch } from '../api';
import { useApp } from '../state';
import { NOTE_MAX, TEXT_MAX } from '../../../src/shared/lists';

/** One item as GET /lists/{id} returns it (§10). */
export interface Item {
  id: string; listId: string; text: string; note: string | null; assigneeId: string | null;
  createdBy: string; createdAt: string; checkedAt: string | null; checkedBy: string | null;
}

/** Member chips are tap targets (≥ 44 px), as in the chore form. */
const chip = { padding: '4px 10px', minHeight: 44 } as const;

/** Item form (§8.8): text, note, Assigned to, Save / Cancel / Delete. */
export function ItemForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const { members } = useApp();
  const init = useMemo(() => ({ text: item.text, note: item.note ?? '', assigneeId: item.assigneeId }), [item]);
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onSaved(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  // assigneeId only when changed: an item assigned to a since-disabled member can still be edited.
  const fields = () => ({ text: f.text, note: f.note, ...(f.assigneeId !== init.assigneeId ? { assigneeId: f.assigneeId } : {}) });
  const save = () => run(() => patch(`/list-items/${item.id}`, fields()));

  return (
    <Modal title={`Edit: ${item.text}`} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        <button className="primary" disabled={busy || !f.text.trim()} onClick={save}>Save</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={busy}>
        <label className="field"><span>Text</span>
          <input value={f.text} maxLength={TEXT_MAX} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
        <label className="field"><span>Note</span>
          <textarea rows={4} value={f.note} maxLength={NOTE_MAX} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <div className="field" role="radiogroup" aria-label="Assigned to">
          <span className="muted" style={{ fontSize: '.8rem' }}>Assigned to</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            <label className="chip" style={chip}>
              <input type="radio" name="assignee" checked={f.assigneeId === null} onChange={() => setF({ ...f, assigneeId: null })} /> Nobody
            </label>
            {members.filter((m) => !m.disabledAt || m.id === f.assigneeId).map((m) => (
              <label key={m.id} className="chip" style={{ ...chip, borderColor: m.color }}>
                <input type="radio" name="assignee" checked={f.assigneeId === m.id} onChange={() => setF({ ...f, assigneeId: m.id })} /> {m.displayName}
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
