// SPEC §8.11 — Lists → Things to do: ＋ Add, the open things in the server's order (soonest end
// first, any-time last), and "Done & let go" collapsed. Tapping a row opens the thing form.
import { useEffect, useState } from 'react';
import { ThingForm, shortDate } from './ThingForm';
import { errorText, get } from '../api';
import { useApp } from '../state';
import type { Thing } from '../../../src/shared/things';
import ls from './Lists.module.css';
import s from './ThingsToDo.module.css';

const RANGE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const utc = (d: string) => new Date(`${d}T12:00:00Z`);

/** "Oct 10 – 20", "until Nov 5", "from Oct 3", "any time" — or for a planned thing 📅 its date. */
function when(t: Thing): string {
  if (t.status === 'planned') return t.plannedDate ? `📅 ${shortDate(t.plannedDate, true)}` : '📅 planned';
  if (t.status === 'done') return 'done';
  if (t.status === 'dropped') return 'let go';
  if (t.windowStart && t.windowEnd) return RANGE.formatRange(utc(t.windowStart), utc(t.windowEnd));
  if (t.windowEnd) return `until ${shortDate(t.windowEnd)}`;
  if (t.windowStart) return `from ${shortDate(t.windowStart)}`;
  return 'any time';
}

export function ThingsToDo() {
  const { version } = useApp();
  const [data, setData] = useState<{ open: Thing[]; closed: Thing[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Thing | 'new' | null>(null);

  useEffect(() => {
    get<{ open: Thing[]; closed: Thing[] }>('/things').then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  const row = (t: Thing, closed: boolean) => (
    <li key={t.id} className={`${ls.row} ${closed ? ls.done : ''}`}>
      <button className={`${ls.item} ${ls.main}`} onClick={() => setEditing(t)}>
        <span className={`${ls.title} ${s.text}`}>{t.title}</span>
        <span className={`muted ${s.when}`}>{when(t)}</span>
        {t.hasPhoto && <span className={s.glyph} role="img" aria-label="has a photo" title="Has a photo">📷</span>}
        {t.status === 'idea' && (t.remindStart || t.remindOn) && (
          <span className={s.glyph} role="img" aria-label="reminder set" title="Reminder set">⏰</span>
        )}
      </button>
    </li>
  );

  return (
    <>
      <button className={s.add} onClick={() => setEditing('new')}>＋ Add a thing to do</button>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {data === null && !error && <p className="muted">Loading…</p>}
      {data && (
        <>
          {data.open.length === 0 && <p className="muted">Nothing to do yet.</p>}
          <ul className={ls.list}>{data.open.map((t) => row(t, false))}</ul>
          {data.closed.length > 0 && (
            <details className={ls.checked}>
              <summary>Done &amp; let go ({data.closed.length})</summary>
              <ul className={ls.list}>{data.closed.map((t) => row(t, true))}</ul>
            </details>
          )}
        </>
      )}
      {editing && <ThingForm thing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
