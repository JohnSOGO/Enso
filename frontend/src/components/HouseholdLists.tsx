// SPEC §8.8 — the 🛒 Lists tab: the list button and its ListPicker popup (Things to do + Movies & shows + every
// list with its emoji + ＋ New list…, opened by each tap of the tab), ⋯ options, composing ThingsToDo (§8.11), Shows (§8.14) and HouseholdListOptions, and the list panel (add box with ItemPhoto's 📷,
// rows, Done). Every list behaves the same (Q24). The server decides added / existing / reopened and who may manage
// a list (§7A.1); this screen shows what it returns. A snapped photo waits here until Add, then is saved (§7A.3).
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ThingsToDo } from './ThingsToDo';
import { Shows } from './Shows';
import { ItemForm, type Item } from './HouseholdListItemForm';
import { ListOptions, NewListForm, type ListSummary } from './HouseholdListOptions';
import { ListPicker, pickerEntries } from './ListPicker';
import { ItemPhoto, type Snap } from './ItemPhoto';
import { errorText, get, patch, post, upload } from '../api';
import { useApp } from '../state';
import { SHOPPING_LIST_ID, TEXT_MAX } from '../../../src/shared/lists';
import { canChange } from '../../../src/shared/roles';
import type { ListAddResult } from '../../../src/shared/vocab';
import ls from './Lists.module.css';
import s from './HouseholdLists.module.css';

interface ListData { list: Omit<ListSummary, 'openCount'>; open: Item[]; checked: Item[] }

/** Remembered per device: a list id, THINGS or SHOWS. (An old `today` falls back to Shopping: chores have their own tab, §8.15.) */
const STORE_KEY = 'enso.list';
const THINGS = 'things';
const SHOWS = 'shows';

function remembered(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

const byName = (a: ListSummary, b: ListSummary) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/** §8.8 ⚑ Q117 — under a name read from a snapped photo. */
const SNAP_HINT = 'Read from your photo — check it.';

/** The shell: the list button and popup, ⋯ options, and the chosen view. `pickRequest` > 0 changes on each tab tap (⚑ Q158). */
export function HouseholdLists({ pickRequest }: { pickRequest: number }) {
  const { me, version } = useApp();
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [thingsOpen, setThingsOpen] = useState<number | null>(null);
  const [showsWant, setShowsWant] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(remembered);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [picking, setPicking] = useState(pickRequest > 0);
  useEffect(() => { if (pickRequest > 0) setPicking(true); }, [pickRequest]);

  const loadLists = useCallback(() => {
    get<ListSummary[]>('/lists').then((l) => { setLists(l); setError(null); }).catch((e) => setError(errorText(e)));
    // The open count only; a failure leaves the option without a count (ThingsToDo shows the error when opened).
    get<{ open: unknown[] }>('/things').then((t) => setThingsOpen(t.open.length)).catch(() => setThingsOpen(null));
    get<{ want: unknown[] }>('/shows').then((t) => setShowsWant(t.want.length)).catch(() => setShowsWant(null));
  }, []);
  useEffect(() => { loadLists(); }, [loadLists, version]);
  useEffect(() => { if (choice) try { localStorage.setItem(STORE_KEY, choice); } catch { /* storage may be blocked: the choice just isn't remembered */ } }, [choice]);

  // A remembered list that no longer exists falls back to Shopping, else the first list (§8.8).
  const special = choice === THINGS || choice === SHOWS;
  const current = special || lists === null ? undefined
    : lists.find((l) => l.id === choice) ?? lists.find((l) => l.id === SHOPPING_LIST_ID) ?? lists[0];
  const view = special ? choice : current?.id ?? '';

  const entries = pickerEntries(lists ?? [], [
    { value: THINGS, emoji: '✅', label: 'Things to do', count: thingsOpen },
    { value: SHOWS, emoji: '🎬', label: 'Movies & shows', count: showsWant },
  ]);
  const shown = entries.find((e) => e.value === view);

  function created(l: ListSummary) {
    setLists((all) => [...(all ?? []), l].sort(byName));
    setChoice(l.id);
    setCreating(false);
    loadLists();
  }

  return (
    <div className={s.screen}>
      <div className={s.picker}>
        <button className={s.chosen} aria-haspopup="dialog" onClick={() => setPicking(true)}>
          <span aria-hidden className={s.pickEmoji}>{shown?.emoji ?? '🛒'}</span>
          <span className={s.pickName}>{shown?.label ?? (lists === null ? 'Loading…' : 'No lists')}</span>
          {shown?.count != null && <span className={`muted ${s.pickCount}`}>{shown.count}</span>}
          <span aria-hidden className="muted">▾</span>
        </button>
        {current && canChange(current.createdBy, me) && (
          <button className={s.more} aria-label="List options" title="List options" onClick={() => setManaging(true)}>⋯</button>
        )}
      </div>

      {error && <div role="alert" className="alert-error">{error}</div>}
      {/* Keyed by list: switching lists starts a fresh panel (empty add box, no note, reloads). */}
      {view === THINGS ? <ThingsToDo />
        : view === SHOWS ? <Shows onChanged={loadLists} />
        : current ? <ListPanel key={current.id} list={current} onItemsChanged={loadLists} />
        : lists && <p className="muted">No lists yet. Tap the list button, then ＋ New list…, to make one.</p>}

      {picking && (
        <ListPicker entries={entries} chosen={view} onClose={() => setPicking(false)}
          onPick={(v) => { setChoice(v); setPicking(false); }}
          onNew={() => { setPicking(false); setCreating(true); }} />
      )}

      {creating && <NewListForm onClose={() => setCreating(false)} onCreated={created} />}
      {managing && current && (
        <ListOptions list={current} onClose={() => setManaging(false)} onChanged={loadLists}
          onDeleted={() => { setManaging(false); loadLists(); }} />
      )}
    </div>
  );
}

/** One list's body: add box, open rows, Done, and the item form. */
function ListPanel({ list, onItemsChanged }: { list: ListSummary; onItemsChanged: () => void }) {
  const { me, version, tz, memberById } = useApp();
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  /** §7A.3: the snapped photo waiting for Add. Switching list drops it (the panel is keyed by list). */
  const [waiting, setWaiting] = useState<Blob | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    get<ListData>(`/lists/${list.id}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e)));
  }, [list.id]);
  useEffect(() => { load(); }, [load, version]);
  /** After any item change: this list, and the picker's open counts. */
  const changed = () => { load(); onItemsChanged(); };

  /** A snap: the photo waits; its name replaces the box's text (⚑ Q118), or the refusal shows. */
  function snapped(snap: Snap) {
    setError(null);
    if (snap.photo) setWaiting(snap.photo);
    if (snap.name !== undefined) { setText(snap.name); setSaid(SNAP_HINT); } else setError(snap.error);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError(null); setSaid(null);
    try {
      const r = await post<{ item: Item; result: ListAddResult }>(`/lists/${list.id}/items`, { text });
      setText('');
      if (r.result === 'existing') setSaid(`${r.item.text} is already on the list`);
      if (r.result === 'reopened') setSaid(`${r.item.text} is back on the list`);
      // §7A.3 ⚑ Q119: the waiting photo goes to the item, whether added, re-opened or already there.
      if (waiting) {
        try {
          await upload('PUT', `/list-items/${r.item.id}/photo`, waiting);
        } catch (err) {
          setError(`${r.item.text} was added, but its photo wasn't saved: ${errorText(err).replace(/[.\s]+$/, '')}. Open ✎ to add it again.`);
        }
        setWaiting(null);
      }
      changed();
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
      ? { ...d, open: d.open.filter((i) => i.id !== item.id), checked: [{ ...item, checkedAt: new Date().toISOString(), checkedBy: me.id }, ...d.checked] }
      : { ...d, open: [{ ...item, checkedAt: null }, ...d.open], checked: d.checked.filter((i) => i.id !== item.id) }));
    try { await patch(`/list-items/${item.id}`, { checked }); } catch (e) { setError(errorText(e)); }
    changed();
  }

  const whoWhen = (i: Item) => {
    const who = i.checkedBy ? memberById(i.checkedBy)?.displayName ?? 'unknown member' : 'unknown member';
    const at = new Date(i.checkedAt!);
    const recent = Date.now() - at.getTime() < 6 * 86_400_000;
    const when = at.toLocaleDateString(undefined, recent ? { weekday: 'short', timeZone: tz } : { month: 'short', day: 'numeric', timeZone: tz });
    return `${when} · ${who}`;
  };

  const assigneeChip = (i: Item) => {
    if (!i.assigneeId) return null;
    const m = memberById(i.assigneeId);
    return <span className={`chip ${s.assignee}`} style={m ? { borderColor: m.color } : undefined}>{m?.displayName ?? 'unknown member'}</span>;
  };

  // Every row alike (Q24): tapping ticks (or, under Done, puts back); ✎ opens the item form.
  const row = (i: Item, done: boolean) => (
    <li key={i.id} className={`${ls.row} ${done ? ls.done : ''}`}>
      <button className={`${ls.item} ${ls.main}`}
        aria-label={done ? `Put ${i.text} back on the list` : `Tick ${i.text}`}
        onClick={() => setChecked(i, !done)}>
        <span aria-hidden className={ls.box}>{done ? '☑' : '☐'}</span>
        <span className={`${ls.title} ${s.text}`}>{i.text}</span>
        {i.note && <span className={s.glyph} aria-hidden title="Has a note">📝</span>}
        {i.hasPhoto && <span className={s.glyph} aria-hidden title="Has a photo">📷</span>}
        {done ? <span className={`muted ${s.whoWhen}`}>{whoWhen(i)}</span> : assigneeChip(i)}
      </button>
      <button className={`plain ${s.edit}`} aria-label={`Edit ${i.text}`} title={`Edit ${i.text}`} onClick={() => setEditing(i)}>✎</button>
    </li>
  );

  return (
    <>
      <form className="row" onSubmit={add}>
        <input ref={input} value={text} maxLength={TEXT_MAX} placeholder={`Add to ${list.name}…`}
          aria-label={`Add to ${list.name}`} enterKeyHint="enter"
          onChange={(e) => { setText(e.target.value); setSaid(null); if (!e.target.value) setWaiting(null); }} />
        <ItemPhoto waiting={waiting} onSnap={snapped} onDrop={() => setWaiting(null)} />
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
              <summary>Done ({data.checked.length})</summary>
              <ul className={ls.list}>{data.checked.map((i) => row(i, true))}</ul>
            </details>
          )}
        </>
      )}

      {editing && <ItemForm item={editing} onClose={() => { setEditing(null); setSaid(null); }} onSaved={changed} />}
    </>
  );
}
