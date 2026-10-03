// SPEC §8.5 — fields shared by the alarm, timer and chore forms: day chips + days text,
// channel checkboxes, repeat-alert options. Each form keeps its own state and labels.
import { WEEKDAY, type Weekday } from '../../../src/shared/vocab';

export const SHORT: Record<Weekday, string> = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
export const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];
export const WEEKENDS: Weekday[] = ['SU', 'SA'];
const same = (a: Weekday[], b: Weekday[]) => a.length === b.length && b.every((d) => a.includes(d));

export function daysText(days: Weekday[]): string {
  if (days.length === 7) return 'Every day';
  if (same(days, WEEKDAYS)) return 'Weekdays';
  if (same(days, WEEKENDS)) return 'Weekends';
  return WEEKDAY.filter((d) => days.includes(d)).map((d) => SHORT[d]).join(' ');
}

/** Days-of-the-week chips with "Every day" / "Weekdays" shortcuts. */
export function DayChips({ days, onChange }: { days: Weekday[]; onChange: (days: Weekday[]) => void }) {
  const toggleDay = (d: Weekday) => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);
  return (
    <div className="field" role="group" aria-label="Days of the week">
      <span className="muted" style={{ fontSize: '.8rem' }}>Days</span>
      <div className="row wrap" style={{ marginTop: 4 }}>
        {WEEKDAY.map((d) => (
          <label key={d} className="chip" style={{ padding: '4px 8px' }}>
            <input type="checkbox" checked={days.includes(d)} onChange={() => toggleDay(d)} /> {SHORT[d]}
          </label>
        ))}
      </div>
      <div className="row wrap" style={{ marginTop: 6 }}>
        <button type="button" onClick={() => onChange([...WEEKDAY])}>Every day</button>
        <button type="button" onClick={() => onChange([...WEEKDAYS])}>Weekdays</button>
      </div>
    </div>
  );
}

/** The 📱 Phone / 🔊 House "Alert via" checkboxes. */
export function ChannelChecks({ push, house, onChange }: {
  push: boolean; house: boolean; onChange: (c: { push: boolean; house: boolean }) => void;
}) {
  return (
    <div className="row wrap" style={{ marginBottom: 12 }} role="group" aria-label="Alert via">
      <label className="chip" style={{ padding: '4px 8px' }}><input type="checkbox" checked={push} onChange={(e) => onChange({ push: e.target.checked, house })} /> 📱 Phone</label>
      <label className="chip" style={{ padding: '4px 8px' }}><input type="checkbox" checked={house} onChange={(e) => onChange({ push, house: e.target.checked })} /> 🔊 House</label>
    </div>
  );
}

/** Repeat-alert choices: 'off' or minutes as a string. */
export const RENOTIFY: [string, string][] = [['off', 'Off (ring once)'], ['5', 'Every 5 min'], ['10', 'Every 10 min'], ['15', 'Every 15 min'], ['30', 'Every 30 min']];

export function RenotifySelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field"><span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {RENOTIFY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
