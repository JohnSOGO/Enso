// SPEC §8.4 RT5 — the form's Random time tick maps to and from the stored reminder.
// A .tsx module, so it is loaded at run time: the Worker typecheck has no JSX.
import { expect, it } from 'vitest';

type Value = { remind: string; renotify: string; push: boolean; house: boolean; funhouse: boolean; random: boolean; randomFrom: string; randomTo: string };
type Reminder = { offsetMin: number; channels: string[]; renotifyMin: number | null; randomFrom?: string | null; randomTo?: string | null };
const FIELDS = '../frontend/src/components/ReminderFields.tsx';
const { toReminder, reminderOf, reminderError } = (await import(/* @vite-ignore */ FIELDS)) as {
  toReminder: (v: Value) => Reminder | null; reminderOf: (r: Reminder | null) => Value; reminderError: (v: Value) => string | null;
};

const base: Value = { remind: '0', renotify: 'off', push: true, house: false, funhouse: false, random: false, randomFrom: '09:00', randomTo: '17:00' };

it('RT5: ticked saves the window, unticked saves none; a stored window shows ticked; From after To is refused', () => {
  expect(toReminder({ ...base, random: true })).toEqual({ offsetMin: 0, channels: ['push'], renotifyMin: null, randomFrom: '09:00', randomTo: '17:00' });
  expect(toReminder(base)).toEqual({ offsetMin: 0, channels: ['push'], renotifyMin: null });
  expect(reminderOf(null)).toMatchObject({ random: false, randomFrom: '09:00', randomTo: '17:00' });
  expect(reminderOf({ offsetMin: 0, channels: ['push'], renotifyMin: null, randomFrom: '10:00', randomTo: '12:00' })).toMatchObject({ random: true, randomFrom: '10:00', randomTo: '12:00' });
  expect(reminderError({ ...base, random: true, randomFrom: '17:00', randomTo: '09:00' })).toBe('Random time: From must be before To.');
  expect(reminderError({ ...base, randomFrom: '17:00', randomTo: '09:00' })).toBeNull();
});
