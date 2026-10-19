// SPEC §8.5a, §7G — Alarms → 💪 Task buddy: GET /tasks on every refresh; my open session's card, else the start form;
// then Recent (my last 10 ended), each stopped one with Pick it up again. Holds only what it loaded.
import { useEffect, useState } from 'react';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import { TaskCard } from './TaskCard';
import { TaskStart, type TaskDefaults } from './TaskStart';
import { useTaskSend } from './TaskCheckin';
import { spanText } from '../../../src/shared/task-replies';
import type { Task } from '../../../src/shared/tasks';

export function Tasks() {
  const { version, tz } = useApp();
  const [data, setData] = useState<{ active: Task | null; recent: Task[]; defaults: TaskDefaults } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, send } = useTaskSend(setError);
  useEffect(() => { get('/tasks').then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e))); }, [version]);
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>Tell me what you're working on and I'll check in now and then. Your teammate, not your boss.</p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (data.active ? <TaskCard task={data.active} /> : <TaskStart key={data.recent[0]?.id ?? 'first'} defaults={data.defaults} />)}
      {!!data?.recent.length && (
        <section aria-label="Recent tasks" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>Recent</h2>
          {data.recent.map((t) => (
            <div key={t.id} className="row" style={{ marginBottom: 6, alignItems: 'center' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                {t.outcome === 'finished' ? '✅' : '⏸'} <b>{t.title}</b>
                <span className="muted"> · {day(t.startedAt)} · {spanText(t.summary.workedMin)} {t.summary.moods}</span>
              </span>
              {t.outcome === 'stopped' && !data.active && <button disabled={busy} onClick={() => send(() => post(`/tasks/${t.id}/again`))}>Pick it up again</button>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
