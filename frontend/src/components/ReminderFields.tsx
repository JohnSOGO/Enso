// SPEC §8.4 — the event form's Reminder section: reminder select incl. the evening-before option,
// Remind via Phone/House, repeat-the-alert select; and the reminder ⇄ form mapping.
import { type Channel } from '../../../src/shared/vocab';

export interface ReminderValue { remind: string; push: boolean; house: boolean; renotify: string }

/** A stored event reminder, as the API returns and accepts it. */
export interface Reminder { offsetMin: number; channels: Channel[]; renotifyMin: number | null }

const REMIND_OPTIONS: [string, string][] = [
  ['none', 'None'], ['0', 'At start'], ['5', '5 min before'], ['15', '15 min before'],
  ['30', '30 min before'], ['60', '1 hour before'], ['1440', '1 day before'],
];
/** §8.4 ⚑ — 780 min before the all-day start of 09:00. Offered for all-day events; a timed one keeping it says what it is. */
const EVENING_BEFORE = '780';
const RENOTIFY_OPTIONS: [string, string][] = [['off', 'Off'], ['5', 'Every 5 min'], ['10', 'Every 10 min'], ['15', 'Every 15 min'], ['30', 'Every 30 min']];

/** The Reminder section a stored reminder (or none) shows as. */
export function reminderOf(reminder: Reminder | null | undefined): ReminderValue {
  return {
    remind: reminder ? String(reminder.offsetMin) : 'none',
    push: reminder ? reminder.channels.includes('push') : true,
    house: reminder ? reminder.channels.includes('house') : false,
    renotify: reminder?.renotifyMin ? String(reminder.renotifyMin) : 'off',
  };
}

/** The reminder to save for this Reminder section (null when None). */
export function toReminder(v: ReminderValue): Reminder | null {
  const channels: Channel[] = [...(v.push ? ['push' as const] : []), ...(v.house ? ['house' as const] : [])];
  return v.remind === 'none' ? null : {
    offsetMin: Number(v.remind), channels, renotifyMin: v.renotify === 'off' ? null : Number(v.renotify),
  };
}

interface Props {
  value: ReminderValue;
  allDay: boolean; // the evening-before option is offered for all-day events
  onChange: (change: Partial<ReminderValue>) => void;
}

export function ReminderFields({ value, allDay, onChange }: Props) {
  return (
    <>
      <label className="field"><span>Reminder</span>
        <select value={value.remind} onChange={(e) => onChange({ remind: e.target.value })}>
          {REMIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {(allDay || value.remind === EVENING_BEFORE) && <option value={EVENING_BEFORE}>{allDay ? 'The evening before (8 pm)' : '13 hours before'}</option>}
        </select>
      </label>
      {value.remind !== 'none' && (
        <>
          <div className="row wrap" style={{ marginBottom: 12 }} role="group" aria-label="Remind via">
            <label className="chip" style={{ padding: '4px 8px' }}><input type="checkbox" checked={value.push} onChange={(e) => onChange({ push: e.target.checked })} /> 📱 Phone</label>
            <label className="chip" style={{ padding: '4px 8px' }}><input type="checkbox" checked={value.house} onChange={(e) => onChange({ house: e.target.checked })} /> 🔊 House</label>
          </div>
          <label className="field"><span>Repeat the alert until handled</span>
            <select value={value.renotify} onChange={(e) => onChange({ renotify: e.target.value })}>
              {RENOTIFY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </>
      )}
    </>
  );
}
