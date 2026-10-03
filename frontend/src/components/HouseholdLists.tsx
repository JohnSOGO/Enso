// SPEC §8.8 — the 🛒 Lists tab: Today | Shopping | Wish list toggle, add box, item rows (the item form modal is HouseholdListItemForm).
// The server decides added / existing / reopened (§7A.1); this screen shows what it returns.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChoresToday } from './ChoresToday';
import { ItemForm, type Item } from './HouseholdListItemForm';
import { del, errorText, get, patch, post } from '../api';
import { useApp } from '../state';
import { LIST, isOneOf, type List } from '../../../src/shared/vocab';
import { TEXT_MAX } from '../../../src/shared/lists';
import ls from './Lists.module.css';
import s from './HouseholdLists.module.css';

interface ListData { open: Item[]; checked: Item[] }
type AddResult = 'added' | 'existing' | 'reopened';

const LABELS: Record<List, { name: string; placeholder: string; checked: string }> = {
  shopping: { name: 'Shopping', placeholder: 'Add item…', checked: 'Recently bought' },
  wishlist: { name: 'Wish list', placeholder: 'Add an idea…', checked: 'Done' },
};
const STORE_KEY = 'enso.list';
/** The toggle's views (§8.8): Today (chores) then each list. */
const VIEWS = ['today', ...LIST] as const;
type View = (typeof VIEWS)[number];
const viewName = (v: View) => (v === 'today' ? 'Today' : LABELS[v].name);

// ⚑ The spec does not settle the default with nothing stored; it stays Shopping (LIST[0]).
function initialView(): View {
  try { const v = localStorage.getItem(STORE_KEY); return isOneOf(VIEWS, v) ? v : LIST[0]; } catch { return LIST[0]; }
}

/** The shell: Today | Shopping | Wish list toggle and the remembered choice. */
export function HouseholdLists() {
  const [view, setView] = useState<View>(initialView);

  useEffect(() => { try { localStorage.setItem(STORE_KEY, view); } catch { /* storage may be blocked */ } }, [view]);

  return (
    <div className={s.screen}>
      <div className={s.toggle} style={{ gridTemplateColumns: `repeat(${VIEWS.length}, 1fr)` }} role="group" aria-label="Which list">
        {VIEWS.map((v) => (
          <button key={v} aria-pressed={v === view} className={v === view ? s.on : ''} onClick={() => setView(v)}>{viewName(v)}</button>
        ))}
      </div>
      {/* Keyed by list: switching lists starts a fresh panel (empty add box, no note, reloads). */}
      {view === 'today' ? <ChoresToday /> : <ListPanel key={view} list={view} />}
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
