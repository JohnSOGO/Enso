// SPEC §7G.3, §8.2 — a task check-in's answers: the five (or Finished! · +15 · +30 · Stop once time is up), and the
// break chooser. Used by FireActions (the Ringing bar and an alert card), TaskCard and TaskSaid. Each answer goes to
// /tasks and its reply opens the 💪 Enso box (state's showTask), which outlives the row that answered.
import { useState } from 'react';
import { errorText, patch, post } from '../api';
import { useApp } from '../state';
import { TASK_MOOD, type TaskMood } from '../../../src/shared/vocab';
import { MOOD_EMOJI, MOOD_LABEL, TASK_BREAK_CHOICES, TASK_BREAK_MIN, type Task } from '../../../src/shared/tasks';

/** One /tasks call whose `{ task, said }` answer opens the 💪 Enso box; `busy` while it runs. */
export function useTaskSend(onError: (m: string | null) => void, onActed?: () => void) {
  const { refresh, showTask } = useApp();
  const [busy, setBusy] = useState(false);
  async function send(call: () => Promise<{ task: Task; said: string }>, mood?: TaskMood) {
    setBusy(true); onError(null);
    try { const r = await call(); showTask({ kind: 'said', said: r.said, task: r.task, mood }); onActed?.(); }
    catch (e) { onError(errorText(e)); }
    finally { setBusy(false); refresh(); }
  }
  return { busy, send };
}

export function BreakChooser({ onPick, disabled }: { onPick: (min: number) => void; disabled?: boolean }) {
  return (
    <span className="row wrap" role="group" aria-label="Break length">
      {TASK_BREAK_CHOICES.map((m) => (
        <button key={m} disabled={disabled} className={m === TASK_BREAK_MIN ? 'primary' : undefined} onClick={() => onPick(m)}>☕ {m} min</button>
      ))}
    </span>
  );
}

export function TaskCheckin({ taskId, timeUp, onError, onActed }: {
  taskId: string; timeUp: boolean; onError: (m: string | null) => void; onActed?: () => void;
}) {
  const { showTask } = useApp();
  const { busy, send } = useTaskSend(onError, onActed);
  const [resting, setResting] = useState(false);
  const answer = (mood: TaskMood, breakMin?: number) => send(() => post(`/tasks/${taskId}/checkin`, { mood, breakMin }), mood);
  const more = (addMin: number) => send(() => patch(`/tasks/${taskId}`, { addMin }));

  if (resting) return <BreakChooser disabled={busy} onPick={(m) => { setResting(false); answer('break', m); }} />;
  if (timeUp) {
    return (
      <span className="row wrap">
        <button className="primary" disabled={busy} onClick={() => showTask({ kind: 'finish', taskId })}>Finished!</button>
        <button disabled={busy} onClick={() => more(15)}>+15 min</button>
        <button disabled={busy} onClick={() => more(30)}>+30 min</button>
        <button disabled={busy} onClick={() => send(() => post(`/tasks/${taskId}/stop`))}>Stop for now</button>
      </span>
    );
  }
  return (
    <span className="row wrap" role="group" aria-label="How's it going?">
      {TASK_MOOD.map((m) => (
        <button key={m} disabled={busy} onClick={() => (m === 'break' ? setResting(true) : answer(m))}>{MOOD_EMOJI[m]} {MOOD_LABEL[m]}</button>
      ))}
    </span>
  );
}
