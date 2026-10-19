// SPEC §7G.4, §8.5a — the "💪 Enso" box, rendered once by App.tsx from state's taskSheet: Enso's reply with its offers
// (Check on me in 5 min, +15 min, ☕ Take a break) and OK, the summary once the task has ended, or Finish's done check.
import { useEffect, useState } from 'react';
import { get, patch, post } from '../api';
import { useApp } from '../state';
import { Modal } from './Modal';
import { BreakChooser, useTaskSend } from './TaskCheckin';
import { TaskDone, TaskSummaryView } from './TaskDone';
import { SOON_LABEL, replyOffers } from '../../../src/shared/task-replies';
import { TASK_SOON_MIN, type Task } from '../../../src/shared/tasks';

export function TaskSaid() {
  const { taskSheet, showTask } = useApp();
  const [error, setError] = useState<string | null>(null);
  const { busy, send } = useTaskSend(setError);
  const [resting, setResting] = useState(false);
  const [finishing, setFinishing] = useState<Task | null>(null);
  const finishId = taskSheet?.kind === 'finish' ? taskSheet.taskId : null;
  useEffect(() => {
    setFinishing(null); setResting(false); setError(null);
    if (!finishId) return;
    get<{ active: Task | null }>('/tasks').then((r) => {
      if (r.active?.id === finishId) setFinishing(r.active); else showTask(null);
    }).catch(() => showTask(null));
  }, [finishId, taskSheet, showTask]);

  if (!taskSheet) return null;
  const close = () => showTask(null);
  if (taskSheet.kind === 'finish') return finishing ? <TaskDone task={finishing} onClose={close} /> : null;
  const { said, task, mood } = taskSheet;
  const offers = task.state === 'ended' || !mood ? [] : replyOffers(mood, task.limitMin !== null);
  const id = task.id;
  return (
    <Modal title="💪 Enso" onClose={close} error={error}
      footer={<button className="primary" onClick={close} disabled={busy}>OK</button>}>
      <p style={{ fontSize: '1.05rem', marginBottom: 12 }}>{said}</p>
      {task.state === 'ended' && <TaskSummaryView task={task} />}
      {resting ? <BreakChooser disabled={busy} onPick={(m) => send(() => post(`/tasks/${id}/checkin`, { mood: 'break', breakMin: m }), 'break')} />
        : !!offers.length && (
          <div className="row wrap">
            {offers.includes('soon') && <button disabled={busy} onClick={() => send(() => patch(`/tasks/${id}`, { nextInMin: TASK_SOON_MIN }))}>{SOON_LABEL}</button>}
            {offers.includes('more') && <button disabled={busy} onClick={() => send(() => patch(`/tasks/${id}`, { addMin: 15 }))}>+15 min</button>}
            {offers.includes('rest') && <button disabled={busy} onClick={() => setResting(true)}>☕ Take a break</button>}
          </div>
        )}
    </Modal>
  );
}
