// SPEC §7C.2, §8.11 — Plan it: a date (+ optional time) → POST /things/{id}/plan, which creates the
// calendar event. Whether the date fits the window is the server's call; its refusal shows inside.
import { useState } from 'react';
import { Modal } from './Modal';
import { errorText, post } from '../api';
import { useApp } from '../state';
import type { Thing } from '../../../src/shared/things';

export function ThingPlan({ thing, onClose, onPlanned }: { thing: Thing; onClose: () => void; onPlanned: () => void }) {
  const { today } = useApp();
  const now = today();
  // Starts on the window's first day, or today once that has passed.
  const [date, setDate] = useState(thing.windowStart && thing.windowStart > now ? thing.windowStart : now);
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function plan() {
    setBusy(true); setError(null);
    try {
      await post(`/things/${thing.id}/plan`, time ? { date, time } : { date });
      onPlanned();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Plan it: ${thing.title}`} onClose={onClose} error={error}
      footer={<>
        <button className="primary" disabled={busy || !date} onClick={plan}>Put it on the calendar</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={busy}>
        <label className="field"><span>Date</span>
          <input type="date" value={date} min={thing.windowStart ?? undefined} max={thing.windowEnd ?? undefined}
            onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field"><span>Time (optional)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </fieldset>
    </Modal>
  );
}
