// SPEC §8.8 — Lists → Today: today's chore runs, Mine | Everyone, tap a row to tick the current
// step, ↶ to undo the last one. Whose turn and what rings next come from the server (§7B).
import { useEffect, useState } from 'react';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import type { ChoreTiming } from '../../../src/shared/vocab';
import type { ChoreStep } from '../../../src/shared/chores';
import ls from './Lists.module.css';
import s from './ChoresToday.module.css';

/** One run as GET /chores/today returns it (§10). */
export interface Run {
  id: string; choreId: string; title: string; doneMeans: string | null; timing: ChoreTiming; time: string;
  step: number; steps: ChoreStep[]; assigneeId: string | null; personId: string | null;
  doneAt: string | null; doneBy: string | null; nextDueAt: string | null; ringing: boolean;
}

const SCOPES = [['mine', 'Mine'], ['everyone', 'Everyone']] as const;
type Scope = (typeof SCOPES)[number][0];
const STORE_KEY = 'enso.today';

function initialScope(): Scope {
  try { return localStorage.getItem(STORE_KEY) === 'everyone' ? 'everyone' : 'mine'; } catch { return 'mine'; }
}

export function ChoresToday() {
  const { me, version, refresh, localTime, memberById } = useApp();
  const [scope, setScope] = useState<Scope>(initialScope);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem(STORE_KEY, scope); } catch { /* storage may be blocked */ } }, [scope]);
  useEffect(() => {
    get<{ date: string; runs: Run[] }>('/chores/today')
      .then((d) => { setRuns(d.runs); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);

  async function act(r: Run, what: 'done' | 'undo') {
    setBusy(r.id); setError(null);
    try { await post(`/chore-runs/${r.id}/${what}`); } catch (e) { setError(`${r.title}: ${errorText(e)}`); }
    finally { setBusy(null); refresh(); }
  }

  const sorted = (runs ?? [])
    .filter((r) => scope === 'everyone' || r.personId === me.id)
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const open = sorted.filter((r) => !r.doneAt);
  const done = sorted.filter((r) => r.doneAt);

  const when = (r: Run) => {
    if (r.ringing) return <span className="badge bad">ringing</span>;
    const waiting = r.step > 0 && r.steps[r.step - 1]?.waitMin && r.nextDueAt;
    return waiting ? `rings ${localTime(r.nextDueAt!)}` : `${r.timing} ${r.time}`;
  };
  const chipFor = (id: string | null) => {
    const m = id ? memberById(id) : undefined;
    return <span className="chip" style={m ? { borderColor: m.color } : undefined}>{id ? m?.displayName ?? 'unknown member' : 'anyone'}</span>;
  };

  const row = (r: Run) => {
    const finished = !!r.doneAt;
    const multi = r.steps.length > 1;
    const body = (
      <>
        <span aria-hidden className={ls.box}>{finished ? '☑' : '☐'}</span>
        <span className={s.what}>
          <span className={ls.title}>
            {r.title}
            {multi && !finished && <span className="muted"> — {r.step + 1}/{r.steps.length} {r.steps[r.step]?.title}</span>}
          </span>
          {r.doneMeans && <span className={`muted ${s.doneMeans}`}>{r.doneMeans}</span>}
        </span>
        {!finished && <span className={`muted ${s.when}`}>{when(r)}</span>}
        {chipFor(finished ? r.doneBy : r.personId)}
      </>
    );
    return (
      <li key={r.id} className={`${ls.row} ${finished ? ls.done : ''}`}>
        {finished
          ? <div className={`${ls.item} ${ls.main}`}>{body}</div>
          : (
            <button className={`${ls.item} ${ls.main}`} disabled={busy === r.id} onClick={() => act(r, 'done')}
              aria-label={`Done: ${r.title}${multi ? ` — ${r.steps[r.step]?.title}` : ''}`}>
              {body}
            </button>
          )}
        {r.step > 0 && (
          <button className={`plain ${s.undo}`} disabled={busy === r.id} onClick={() => act(r, 'undo')}
            aria-label={`Undo last step of ${r.title}`} title={`Undo last step of ${r.title}`}>↶</button>
        )}
      </li>
    );
  };

  return (
    <>
      <div className={s.scope} role="group" aria-label="Whose chores">
        {SCOPES.map(([id, label]) => (
          <button key={id} aria-pressed={scope === id} className={scope === id ? s.on : ''} onClick={() => setScope(id)}>{label}</button>
        ))}
      </div>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {runs === null && !error && <p className="muted">Loading…</p>}
      {runs && (
        <>
          {open.length === 0 && <p className="muted">{scope === 'mine' ? 'Nothing for you today.' : 'No chores today.'}</p>}
          <ul className={ls.list}>{open.map(row)}</ul>
          {done.length > 0 && (
            <details className={ls.checked}>
              <summary>Done today ({done.length})</summary>
              <ul className={ls.list}>{done.map(row)}</ul>
            </details>
          )}
        </>
      )}
    </>
  );
}
