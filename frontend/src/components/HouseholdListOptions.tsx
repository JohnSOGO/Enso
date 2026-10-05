// SPEC §8.8 — Lists tab list management: the new-list form and the ⋯ list options (rename, emoji,
// delete with its open-item count). Owns the `ListSummary` shape; HouseholdLists imports both
// from here, never the reverse. Who may open the options is canManageList (§7A.1), decided by
// the caller; the server checks the same function.
import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { del, errorText, patch, post } from '../api';
import { LIST_NAME_MAX, defaultListEmoji } from '../../../src/shared/lists';

/** One row of GET /lists (§10). */
export interface ListSummary { id: string; name: string; emoji: string | null; createdBy: string | null; openCount: number }

/** A list's Emoji field: one emoji, or empty for the default picked from the name (§7A.1 ⚑ Q157); the server checks it. */
function EmojiField({ value, name, disabled, onChange }: { value: string; name: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="field"><span>Emoji (empty = {defaultListEmoji(name)})</span>
      <input value={value} disabled={disabled} autoComplete="off" placeholder={defaultListEmoji(name)} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** The emoji to send: empty → null (the default). */
const emojiOut = (v: string) => v.trim() || null;

/** The new list form (§8.8): Name, Emoji, Create; errors inside the dialog. */
export function NewListForm({ onClose, onCreated }: { onClose: () => void; onCreated: (l: ListSummary) => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const l = await post<Omit<ListSummary, 'openCount'>>('/lists', { name, emoji: emojiOut(emoji) });
      onCreated({ ...l, openCount: 0 });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New list" onClose={onClose} dirty={name.trim() !== '' || emoji.trim() !== ''} error={error}
      footer={<>
        <button type="submit" form="new-list-form" className="primary" disabled={busy || !name.trim()}>Create</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <form id="new-list-form" onSubmit={create}>
        <label className="field"><span>Name</span>
          <input value={name} maxLength={LIST_NAME_MAX} autoFocus disabled={busy} enterKeyHint="done"
            placeholder="Hardware store" onChange={(e) => setName(e.target.value)} />
        </label>
        <EmojiField value={emoji} name={name} disabled={busy} onChange={setEmoji} />
      </form>
    </Modal>
  );
}

/** The ⋯ list options (§8.8): Rename, Emoji + Save; Delete list asks first and says how many open items go with it. */
export function ListOptions({ list, onClose, onChanged, onDeleted }: {
  list: ListSummary; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [emoji, setEmoji] = useState(list.emoji ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = name !== list.name || emojiOut(emoji) !== list.emoji;

  async function act(fn: () => Promise<unknown>, after: () => void) {
    setBusy(true); setError(null);
    try { await fn(); after(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dirty || busy) return;
    act(() => patch(`/lists/${list.id}`, { name, emoji: emojiOut(emoji) }), () => { onChanged(); onClose(); });
  };

  const remove = () => {
    const n = list.openCount;
    const goes = n === 0 ? 'It has no open items.' : n === 1 ? 'Its 1 open item goes with it.' : `Its ${n} open items go with it.`;
    if (confirm(`Delete the list “${list.name}”? ${goes}`)) act(() => del(`/lists/${list.id}`), onDeleted);
  };

  return (
    <Modal title={`List options: ${list.name}`} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        <button type="submit" form="list-options-form" className="primary" disabled={busy || !dirty || !name.trim()}>Save</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <form id="list-options-form" onSubmit={rename}>
        <label className="field"><span>Rename</span>
          <input value={name} maxLength={LIST_NAME_MAX} disabled={busy} enterKeyHint="done" onChange={(e) => setName(e.target.value)} />
        </label>
        <EmojiField value={emoji} name={name} disabled={busy} onChange={setEmoji} />
      </form>
      <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
        <button className="danger" disabled={busy} onClick={remove}>Delete list</button>
      </div>
    </Modal>
  );
}
