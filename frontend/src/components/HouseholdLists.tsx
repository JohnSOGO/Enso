// SPEC §8.8 — the 🛒 Lists tab: Shopping | Wish list toggle, add box, item rows, item form modal.
// The server decides added / existing / reopened (§7A.1); this screen shows what it returns.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { del, errorText, get, patch, post } from '../api';
import { useApp } from '../state';
import { LIST, isOneOf, type List } from '../../../src/shared/vocab';
import { NOTE_MAX, TEXT_MAX } from '../../../src/shared/lists';
import ls from './Lists.module.css';
import s from './HouseholdLists.module.css';

export interface Item {
  id: string; list: List; text: string; note: string | null; ownerId: string | null;
  createdBy: string; createdAt: string; checkedAt: string | null; checkedBy: string | null;
}
interface ListData { open: Item[]; checked: Item[] }
type AddResult = 'added' | 'existing' | 'reopened';

const LABELS: Record<List, { name: string; placeholder: string; checked: string }> = {
  shopping: { name: 'Shopping', placeholder: 'Add item…', checked: 'Recently bought' },
  wishlist: { name: 'Wish list', placeholder: 'Add an idea…', checked: 'Done' },
};
const STORE_KEY = 'enso.list';

function initialList(): List {
  try { const v = localStorage.getItem(STORE_KEY); return isOneOf(LIST, v) ? v : LIST[0]; } catch { return LIST[0]; }
}

/** The shell: Shopping | Wish list toggle and the remembered choice. */
export function HouseholdLists() {
  const [list, setList] = useState<List>(initialList);

  useEffect(() => { try { localStorage.setItem(STORE_KEY, list); } catch { /* storage may be blocked */ } }, [list]);

  return (
    <div className={s.screen}>
      <div className={s.toggle} role="group" aria-label="Which list">
        {LIST.map((l) => (
          <button key={l} aria-pressed={l === list} className={l === list ? s.on : ''} onClick={() => setList(l)}>{LABELS[l].name}</button>
        ))}
      </div>
      {/* Keyed by list: switching lists starts a fresh panel (empty add box, no note, reloads). */}
      <ListPanel key={list} list={list} />
    </div>
  );
}

/** One list's body: add box, open rows, Recently bought / Done, and the item form. */
function ListPanel({ list }: { list: List }) {
  const { me, version, tz, memberById } = useApp();
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    get<ListData>(`/lists/${list}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e)));
  }, [list]);
  useEffect(() => { load(); }, [load, version]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError(null); setSaid(null);
    try {
      const r = await post<{ item: Item; result: AddResult }>(`/lists/${list}/items`, { text });
      setText('');
      if (r.result === 'existing') setSaid(`${r.item.text} is already on the list`);
      if (r.result === 'reopened') setSaid(`${r.item.text} is back on the list`);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  /** Optimistic: the row moves at once; the server's answer then replaces the local copy. */
  async function setChecked(item: Item, checked: boolean) {
    setSaid(null);
    setData((d) => d && (checked
      ? { open: d.open.filter((i) => i.id !== item.id), checked: [{ ...item, checkedAt: new Date().toISOString(), checkedBy: me.id }, ...d.checked] }
      : { open: [{ ...item, checkedAt: null }, ...d.open], checked: d.checked.filter((i) => i.id !== item.id) }));
    try { await patch(`/list-items/${item.id}`, { checked }); } catch (e) { setError(errorText(e)); }
    load();
  }

  async function remove(item: Item) {
    setSaid(null);
    setData((d) => d && { open: d.open.filter((i) => i.id !== item.id), checked: d.checked.filter((i) => i.id !== item.id) });
    try { await del(`/list-items/${item.id}`); } catch (e) { setError(errorText(e)); }
    load();
  }

  const whoWhen = (i: Item) => {
    const who = i.checkedBy ? memberById(i.checkedBy)?.displayName ?? 'unknown member' : 'unknown member';
    const at = new Date(i.checkedAt!);
    const recent = Date.now() - at.getTime() < 6 * 86_400_000;
    const when = at.toLocaleDateString(undefined, recent ? { weekday: 'short', timeZone: tz } : { month: 'short', day: 'numeric', timeZone: tz });
    return `${when} · ${who}`;
  };

  const isWish = list === 'wishlist';
  const ownerChip = (i: Item) => {
    const m = i.ownerId ? memberById(i.ownerId) : undefined;
    if (!i.ownerId) return null;
    return <span className="chip" style={m ? { borderColor: m.color } : undefined}>{m?.displayName ?? 'unknown member'}</span>;
  };

  const row = (i: Item, done: boolean) => (
    <li key={i.id} className={`${ls.row} ${done ? ls.done : ''}`}>
      <button className={`${ls.item} ${ls.main}`}
        aria-label={isWish ? `Open ${i.text}` : done ? `Put ${i.text} back on the list` : `Tick ${i.text}`}
        onClick={() => (isWish ? setEditing(i) : setChecked(i, !done))}>
        {!isWish && <span aria-hidden className={ls.box}>{done ? '☑' : '☐'}</span>}
        <span className={`${ls.title} ${s.text}`}>{i.text}</span>
        {isWish && ownerChip(i)}
        {isWish && i.note && <span aria-label="Has a note" title="Has a note">📝</span>}
        {done && <span className={`muted ${s.whoWhen}`}>{whoWhen(i)}</span>}
      </button>
      <button className={`plain ${s.remove}`} aria-label={`Remove ${i.text}`} title={`Remove ${i.text}`} onClick={() => remove(i)}>✕</button>
    </li>
  );

  return (
    <>
      <form className="row" onSubmit={add}>
        <input ref={input} value={text} maxLength={TEXT_MAX} placeholder={LABELS[list].placeholder}
          aria-label={`Add to ${LABELS[list].name}`} enterKeyHint="enter" onChange={(e) => { setText(e.target.value); setSaid(null); }} />
        <button type="submit" className="primary" disabled={busy || !text.trim()}>Add</button>
      </form>
      <p className={`muted ${s.said}`} aria-live="polite">{said ?? ''}</p>

      {error && <div role="alert" className="alert-error">{error}</div>}
      {data === null && !error && <p className="muted">Loading…</p>}
      {data && (
        <>
          {data.open.length === 0 && <p className="muted">Nothing on the list.</p>}
          <ul className={ls.list}>{data.open.map((i) => row(i, false))}</ul>
          {data.checked.length > 0 && (
            <details className={ls.checked}>
              <summary>{LABELS[list].checked} ({data.checked.length})</summary>
              <ul className={ls.list}>{data.checked.map((i) => row(i, true))}</ul>
            </details>
          )}
        </>
      )}

      {editing && <ItemForm item={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}

/** Wish list item form (§8.8): text, note, owner, Mark done / Not done, Save / Cancel / Delete. */
function ItemForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
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
