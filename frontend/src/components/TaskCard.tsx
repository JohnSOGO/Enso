// SPEC §8.5a, §7G.5 — my open task session: its state, interval, working time and time to go; the check-in's answers
// while it rings and on Check in now; Pause / Resume, Finish, Stop, +15 min; and the Tell Enso box (readTaskSay → the
// matching /tasks call; "how long" is answered in place).
import { useState } from 'react';
import { patch, post } from '../api';
import { useApp } from '../state';
import { TaskCheckin, useTaskSend } from './TaskCheckin';
import { readTaskSay } from '../../../src/shared/task-say';
import { howLongText, spanText, taskSaid } from '../../../src/shared/task-replies';
import { TASK_BREAK_CHOICES, TASK_BREAK_MIN, type Task } from '../../../src/shared/tasks';

export function TaskCard({ task }: { task: Task }) {
  const { localTime, showTask } = useApp();
  const [error, setError] = useState<string | null>(null);
  const { busy, send } = useTaskSend(setError);
  const [asking, setAsking] = useState(false);
  const [words, setWords] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const id = task.id, path = `/tasks/${id}`;
  const ringing = task.openFire?.state === 'ringing';
  const waiting = ringing && task.openFire!.alertCount >= 2;
  const state = task.state === 'break' ? `On a break until ${localTime(task.breakUntil!)}` : task.state === 'paused' ? 'Paused'
    : waiting ? 'Waiting for you' : 'Working';
  const finish = () => (task.doneLooks.length ? showTask({ kind: 'finish', taskId: id }) : send(() => post(`${path}/finish`, { ticked: [] })));

  /** §7G.5 — Tell Enso: the words → the same calls as the buttons. */
  const tell = () => {
    const c = readTaskSay(words);
    setAnswer(null);
    if (!c) { setAnswer(taskSaid.unknown()); return; }
    setWords('');
    if (c.do === 'howlong') {
      setAnswer(howLongText(task.workedMin, task.elapsedMin, task.remainingMin));
    } else if (c.do === 'pause') send(() => post(`${path}/pause`));
    else if (c.do === 'resume') send(() => post(`${path}/resume`));
    else if (c.do === 'break') send(() => post(`${path}/checkin`, { mood: 'break', breakMin: (TASK_BREAK_CHOICES as readonly number[]).includes(c.min ?? 0) ? c.min : TASK_BREAK_MIN }), 'break');
    else if (c.do === 'interval') send(() => patch(path, { intervalMin: c.min }));
    else if (c.do === 'add') send(() => patch(path, { addMin: c.min }));
    else if (c.do === 'quiet') send(() => patch(path, { quiet: true }));
    else if (c.do === 'finish') finish();
    else if (c.do === 'stop') send(() => post(`${path}/stop`));
    else send(() => post(`${path}/checkin`, { mood: c.mood }), c.mood);
  };

  return (
    <section className="card" style={{ padding: 12, marginBottom: 12 }} aria-label="My task">
      <h2 style={{ fontSize: '1.05rem' }}>💪 {task.title}{task.private && ' 🤫'}</h2>
      <p className="muted" style={{ marginBottom: 8 }}>
        {state} · every {task.intervalMin} min · worked {spanText(task.workedMin)}
        {task.limitMin !== null && (task.timeUp ? " · time's up" : ` · ${spanText(task.remainingMin ?? 0)} to go`)}
      </p>
      {(ringing || asking) && task.state !== 'paused' && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ marginBottom: 6 }}>How's it going?</p>
          <TaskCheckin taskId={id} timeUp={task.timeUp} onError={setError} onActed={() => setAsking(false)} />
        </div>
      )}
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {!ringing && !asking && task.state === 'working' && <button disabled={busy} onClick={() => setAsking(true)}>Check in now</button>}
        {task.state === 'paused' || task.state === 'break'
          ? <button className="primary" disabled={busy} onClick={() => send(() => post(`${path}/resume`))}>{task.state === 'break' ? 'Back to it' : 'Resume'}</button>
          : <button disabled={busy} onClick={() => send(() => post(`${path}/pause`))}>Pause</button>}
        {task.limitMin !== null && <button disabled={busy} onClick={() => send(() => patch(path, { addMin: 15 }))}>+15 min</button>}
        <button className="primary" disabled={busy} onClick={finish}>Finish</button>
        <button className="danger" disabled={busy} onClick={() => send(() => post(`${path}/stop`))}>Stop</button>
      </div>
      <div className="row">
        <input aria-label="Tell Enso" placeholder="Tell Enso: 20 minute break, every 10 minutes…" value={words}
          onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && words.trim()) tell(); }} style={{ flex: 1 }} />
        <button disabled={busy || !words.trim()} onClick={tell}>Say</button>
      </div>
      {answer && <p style={{ marginTop: 8 }}>💪 {answer}</p>}
      {error && <div role="alert" className="alert-error">{error}</div>}
    </section>
  );
}
