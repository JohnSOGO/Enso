// SPEC §8.4 RH1 — the event form's Every hour repeat rings up to 12 times (Q292); other choices keep the API default.
// A .tsx module, so it is loaded at run time: the Worker typecheck has no JSX.
import { expect, it } from 'vitest';

type Value = { remind: string; renotify: string; push: boolean; house: boolean; funhouse: boolean };
type Reminder = { offsetMin: number; channels: string[]; renotifyMin: number | null; maxAlerts?: number };
const FIELDS = '../frontend/src/components/ReminderFields.tsx';
const { toReminder, reminderOf } = (await import(/* @vite-ignore */ FIELDS)) as {
  toReminder: (v: Value) => Reminder | null; reminderOf: (r: Reminder | null) => Value;
};

const base: Value = { remind: '0', renotify: 'off', push: true, house: false, funhouse: false };

it('RH1: Every hour saves 12 alerts; other repeats leave maxAlerts to the API', () => {
  expect(toReminder({ ...base, renotify: '60' })).toEqual({ offsetMin: 0, channels: ['push'], renotifyMin: 60, maxAlerts: 12 });
  expect(toReminder({ ...base, renotify: '30' })).toEqual({ offsetMin: 0, channels: ['push'], renotifyMin: 30 });
  expect(reminderOf({ offsetMin: 0, channels: ['push'], renotifyMin: 60, maxAlerts: 12 }).renotify).toBe('60');
});
