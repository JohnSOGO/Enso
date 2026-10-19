// SPEC §8.5b RM6 — the When chips, the "later than now" check and the listed state (pure).
import { expect, it } from 'vitest';
import { reminderState, reminderTimeError, whenChoice } from '../src/shared/reminders';

const TZ = 'America/Los_Angeles'; // PDT = UTC−7 on 2026-10-19
const at = (hhmm: string) => `2026-10-19T${String(Number(hhmm.slice(0, 2)) + 7).padStart(2, '0')}:${hhmm.slice(3)}:00.000Z`;

it('RM6 whenChoice picks today while still ahead, else tomorrow', () => {
  expect(whenChoice('work', at('14:00'), TZ)).toEqual({ date: '2026-10-19', time: '17:30' });
  expect(whenChoice('work', '2026-10-20T02:00:00.000Z', TZ)).toEqual({ date: '2026-10-20', time: '17:30' }); // 19:00 local
  expect(whenChoice('tonight', at('14:00'), TZ)).toEqual({ date: '2026-10-19', time: '20:00' });
  expect(whenChoice('tonight', '2026-10-20T02:00:00.000Z', TZ)).toEqual({ date: '2026-10-19', time: '20:00' });
  expect(whenChoice('tonight', '2026-10-20T04:00:00.000Z', TZ)).toEqual({ date: '2026-10-20', time: '20:00' }); // 21:00 local
  expect(whenChoice('hour', at('14:02'), TZ)).toEqual({ date: '2026-10-19', time: '15:05' });
  expect(whenChoice('morning', at('14:00'), TZ)).toEqual({ date: '2026-10-20', time: '08:00' });
  expect(whenChoice('morning', '2026-10-20T04:00:00.000Z', TZ)).toEqual({ date: '2026-10-20', time: '08:00' });
});

it('reminderTimeError refuses a time not after now', () => {
  expect(reminderTimeError('2026-10-19', '15:00', TZ, at('14:00'))).toBeNull();
  expect(reminderTimeError('2026-10-19', '14:00', TZ, at('14:00'))).toBe('Pick a time later than now.');
  expect(reminderTimeError('2026-10-19', 'soon', TZ, at('14:00'))).toBe('Pick a date and a time.');
});

it('reminderState: done hidden, ringing, due, missed', () => {
  const base = { done: false, ringing: false, openDueAt: null, startAt: at('15:00') };
  expect(reminderState({ ...base, done: true }, at('14:00'))).toBeNull();
  expect(reminderState({ ...base, ringing: true, openDueAt: at('15:00') }, at('15:10'))).toBe('ringing');
  expect(reminderState(base, at('14:00'))).toBe('due');
  expect(reminderState({ ...base, openDueAt: at('15:10') }, at('15:05'))).toBe('due'); // snoozed
  expect(reminderState(base, at('17:00'))).toBe('missed');
});
