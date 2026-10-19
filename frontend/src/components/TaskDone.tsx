// SPEC §7G.6 — Finish's done check: "Before we call it done, does it look like this?" with a tick per done line,
// 📷 Check with a photo (Claude reads it against the list; the yes lines come back ticked, the person decides), then
// All done 🎉 or Not yet, keep going. With no list, Finish is one tap. TaskSummaryView: the summary after Finish or Stop.
import { useEffect, useRef, useState } from 'react';
import { errorText, post, upload } from '../api';
import { Modal } from './Modal';
import { useTaskSend } from './TaskCheckin';
import { shrinkPicked, usePhotoPick } from './usePhotoPick';
import { spanText } from '../../../src/shared/task-replies';
import type { DoneCheck, Task } from '../../../src/shared/tasks';

export function TaskSummaryView({ task }: { task: Task }) {
  const s = task.summary;
  return (
    <div className="card" style={{ padding: 10, marginBottom: 12 }} aria-label="Summary">
      <p><b>{task.title}</b> · {task.outcome === 'finished' ? '✅ Finished' : '⏸ Stopped for now'}</p>
      <p className="muted">Worked {spanText(s.workedMin)} of {spanText(s.elapsedMin)} · {s.checkins} check-in{s.checkins === 1 ? '' : 's'}</p>
      {s.moods && <p style={{ fontSize: '1.2rem' }}>{s.moods}</p>}
      <p>{s.pattern}</p>
      {s.doneCheck && <p className="muted">Done check: {s.doneCheck.ticked} of {s.doneCheck.total}</p>}
    </div>
  );
}

const LOOK_MARK = { yes: '✅', no: '❌', unsure: '❔' } as const;

export function TaskDone({ task, onClose }: { task: Task; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { busy, send } = useTaskSend(setError);
  const [ticked, setTicked] = useState<number[]>([]);
  const [check, setCheck] = useState<DoneCheck | null>(null);
  const [reading, setReading] = useState(false);
  const finish = () => send(() => post(`/tasks/${task.id}/finish`, { ticked }));
  const once = useRef(false);
  useEffect(() => { if (!task.doneLooks.length && !once.current) { once.current = true; finish(); } }); // §7G.6 no list: one tap
  const photo = usePhotoPick(async ([f]) => {
    setReading(true); setError(null);
    try {
      const r = await upload<DoneCheck>('POST', `/tasks/${task.id}/check-photo`, await shrinkPicked(f));
      setCheck(r); setTicked(r.lines.flatMap((l, i) => (l.looks === 'yes' ? [i] : [])));
    } catch (e) { setError(errorText(e)); } finally { setReading(false); }
  });
  if (!task.doneLooks.length) return null;
  const toggle = (i: number) => setTicked(ticked.includes(i) ? ticked.filter((x) => x !== i) : [...ticked, i]);

  return (
    <Modal title={`✅ ${task.title}`} onClose={onClose} error={error}
      footer={<>
        <button className="primary" disabled={busy || reading} onClick={finish}>All done 🎉</button>
        <button disabled={busy} onClick={onClose}>Not yet, keep going</button>
      </>}>
      <p style={{ marginBottom: 8 }}>Before we call it done, does it look like this?</p>
      {task.doneLooks.map((l, i) => (
        <label key={i} className="row" style={{ marginBottom: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={ticked.includes(i)} onChange={() => toggle(i)} /> {l}
          {check && <span title={check.lines[i]?.looks}>{LOOK_MARK[check.lines[i]?.looks ?? 'unsure']}</span>}
        </label>
      ))}
      {photo.input}
      <button disabled={busy || reading} onClick={photo.open} style={{ marginTop: 6 }}>{reading ? 'Looking…' : '📷 Check with a photo'}</button>
      {check && <p className="muted" style={{ marginTop: 8 }}>💪 {check.note}</p>}
    </Modal>
  );
}
