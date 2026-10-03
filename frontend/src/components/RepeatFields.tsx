// SPEC §8.4 — the event form's Repeat section: repeat select, weekday chips, until;
// and the Recurrence ⇄ form mapping.
import { WEEKDAY, type Weekday } from '../../../src/shared/vocab';
import { positionInMonth, type Recurrence } from '../../../src/shared/recurrence';

export type Repeat = 'none' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'MONTHLY_POS' | 'YEARLY';

export interface RepeatValue { repeat: Repeat; byDay: Weekday[]; until: string }

const DAY_LABEL: Record<Weekday, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };

const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', [-1]: 'last' };
const WEEKDAY_NAME: Record<Weekday, string> = { SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday' };

/** "3rd Friday" / "last Friday" — the nth weekday this date is in its month. */
function positionText(date: string): string {
  const p = positionInMonth(date);
  return `${ORDINAL[p.setPos]} ${WEEKDAY_NAME[p.weekday]}`;
}

/** The Repeat choice a stored recurrence shows as. */
export function repeatOf(r: Recurrence | null): Repeat {
  return !r ? 'none' : r.freq === 'WEEKLY' && r.interval === 2 ? 'BIWEEKLY' : r.freq === 'MONTHLY' && r.setPos ? 'MONTHLY_POS' : r.freq;
}

/** The recurrence to save for this Repeat section, starting on `date`. */
export function toRecurrence(v: RepeatValue, date: string): Recurrence | null {
  let recurrence: Recurrence | null = null;
  if (v.repeat !== 'none') {
    const freq = v.repeat === 'BIWEEKLY' ? 'WEEKLY' : v.repeat === 'MONTHLY_POS' ? 'MONTHLY' : v.repeat;
    recurrence = { freq };
    if (v.repeat === 'BIWEEKLY') recurrence.interval = 2;
    if (v.repeat === 'MONTHLY_POS') {
      const pos = positionInMonth(date);
      recurrence.byDay = [pos.weekday];
      recurrence.setPos = pos.setPos;
    }
    if (freq === 'WEEKLY') recurrence.byDay = WEEKDAY.filter((d) => v.byDay.includes(d));
    if (v.until) recurrence.until = v.until;
  }
  return recurrence;
}

interface Props {
  value: RepeatValue;
  date: string; // the event's start date
  onChange: (change: Partial<RepeatValue>) => void;
}

export function RepeatFields({ value, date, onChange }: Props) {
  return (
    <>
      <label className="field"><span>Repeat</span>
        <select value={value.repeat} onChange={(e) => onChange({ repeat: e.target.value as Repeat })}>
          <option value="none">Never</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="BIWEEKLY">Every 2 weeks</option>
          <option value="MONTHLY">Monthly on day {Number(date.slice(8, 10))}</option>
          <option value="MONTHLY_POS">Monthly on the {positionText(date)}</option>
          <option value="YEARLY">Yearly</option>
        </select>
      </label>
      {(value.repeat === 'WEEKLY' || value.repeat === 'BIWEEKLY') && (
        <div className="row wrap" style={{ marginBottom: 12 }} role="group" aria-label="Days of the week">
          {WEEKDAY.map((d) => (
            <label key={d} className="chip" style={{ padding: '4px 8px' }}>
              <input type="checkbox" checked={value.byDay.includes(d)}
                onChange={(e) => onChange({ byDay: e.target.checked ? [...value.byDay, d] : value.byDay.filter((x) => x !== d) })} />
              {DAY_LABEL[d]}
            </label>
          ))}
        </div>
      )}
      {value.repeat !== 'none' && (
        <label className="field"><span>Repeat until (optional)</span>
          <input type="date" min={date} value={value.until} onChange={(e) => onChange({ until: e.target.value })} />
        </label>
      )}
    </>
  );
}
