// SPEC §7G.2, §8.5a — starting a task: say it in one sentence ("Clean the garage for an hour, check on me every 15
// minutes") and Read it fills the fields; What, How long, Check on me every, What does done look like?, the channel
// ticks and 🤫 Private, from my last session's settings. Start → POST /tasks; its reply opens the 💪 Enso box.
import { useState } from 'react';
import { post } from '../api';
import { ChannelChecks, channelsOf, flagsOf, pickOneWay } from './AlertFields';
import { useTaskSend } from './TaskCheckin';
import { readTaskStart } from '../../../src/shared/task-say';
import { limitText } from '../../../src/shared/task-replies';
import {
  TASK_DONE_LOOK_MAX, TASK_DONE_LOOKS_MAX, TASK_INTERVAL_CHOICES, TASK_LIMIT_CHOICES,
} from '../../../src/shared/tasks';
import { ALERT_TITLE_MAX } from '../../../src/shared/alert-limits';
import type { Channel } from '../../../src/shared/vocab';

export interface TaskDefaults { intervalMin: number; channels: Channel[]; private: boolean }

const withChoice = (list: readonly number[], n: number | null) => (n === null || list.includes(n) ? [...list] : [...list, n].sort((a, b) => a - b));

export function TaskStart({ defaults }: { defaults: TaskDefaults }) {
  const [say, setSay] = useState('');
  const [f, setF] = useState({
    title: '', limitMin: null as number | null, intervalMin: defaults.intervalMin, done: '',
    ...flagsOf(defaults.channels), private: defaults.private,
  });
  const [error, setError] = useState<string | null>(null);
  const { busy, send } = useTaskSend(setError);

  const read = () => {
    const r = readTaskStart(say);
    setF({ ...f, title: r.title ?? f.title, limitMin: r.limitMin ?? f.limitMin, intervalMin: r.intervalMin ?? f.intervalMin });
  };
  const start = () => {
    const channels = channelsOf(f);
    if (!channels.length) { setError(pickOneWay('check in')); return; }
    const doneLooks = f.done.split('\n').map((l) => l.trim()).filter(Boolean);
    send(() => post('/tasks', { title: f.title, limitMin: f.limitMin, intervalMin: f.intervalMin, doneLooks, channels, private: f.private }));
  };

  return (
    <section aria-label="Start a task">
      <label className="field"><span>What are you starting?</span>
        <textarea rows={2} value={say} placeholder="Clean the garage for an hour, check on me every 15 minutes"
          onChange={(e) => setSay(e.target.value)} />
      </label>
      <div className="row" style={{ marginBottom: 12 }}><button disabled={!say.trim()} onClick={read}>Read it</button></div>
      <label className="field"><span>What</span>
        <input value={f.title} maxLength={ALERT_TITLE_MAX} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </label>
      <div className="row wrap">
        <label className="field"><span>How long</span>
          <select value={f.limitMin ?? ''} onChange={(e) => setF({ ...f, limitMin: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Open-ended</option>
            {withChoice(TASK_LIMIT_CHOICES, f.limitMin).map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : limitText(m).replace(/^hour/, '1 hour')}</option>)}
          </select>
        </label>
        <label className="field"><span>Check on me every</span>
          <select value={f.intervalMin} onChange={(e) => setF({ ...f, intervalMin: Number(e.target.value) })}>
            {withChoice(TASK_INTERVAL_CHOICES, f.intervalMin).map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>What does done look like? (one per line)</span>
        <textarea rows={3} value={f.done} placeholder={'Floor clear\nBikes on hooks\nTrash out'}
          onChange={(e) => setF({ ...f, done: e.target.value.split('\n').slice(0, TASK_DONE_LOOKS_MAX).map((l) => l.slice(0, TASK_DONE_LOOK_MAX)).join('\n') })} />
      </label>
      <ChannelChecks label="Check in via" value={f} onChange={(c) => setF({ ...f, ...c })} />
      <label className="chip" style={{ padding: '4px 8px', marginBottom: 12, display: 'inline-flex' }}>
        <input type="checkbox" checked={f.private} onChange={(e) => setF({ ...f, private: e.target.checked })} /> 🤫 Private (never said out loud)
      </label>
      {error && <div role="alert" className="alert-error">{error}</div>}
      <div className="row"><button className="primary" disabled={busy || !f.title.trim()} onClick={start}>Start</button></div>
    </section>
  );
}
