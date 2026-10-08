// SPEC §5.5a TS1–TS2 — a rolling timer's start announcement, the pure rules.
import { describe, expect, it } from 'vitest';
import { timerWindow } from '../src/shared/engine';
import { timerStartDue, timerStartMessage, windowOpening } from '../src/shared/timer-start';
import { localToUtc } from '../src/shared/time';

const TZ = 'America/Los_Angeles', DAY = '2026-10-06';
const L = (time: string, date = DAY) => localToUtc(date, time, TZ);
const day = timerWindow('08:00', '21:00', TZ)!, night = timerWindow('22:00', '06:00', TZ)!;

describe('TS1 windowOpening', () => {
  it('is the opening date within an hour of it, else null', () => {
    for (const t of ['08:00', '08:59', '09:00']) expect(windowOpening(L(t), day)).toBe(DAY);
    expect(windowOpening(L('09:01'), day)).toBeNull();
    expect(windowOpening(L('07:59'), day)).toBeNull();
    expect(windowOpening(L('22:45'), night)).toBe(DAY);
    expect(windowOpening(L('22:30', '2026-10-07'), night)).toBe('2026-10-07');
  });
  it('the small hours of an overnight window belong to the day before (and are past the late hour)', () => {
    const late = timerWindow('23:30', '06:00', TZ)!;
    expect(windowOpening(L('00:15', '2026-10-07'), late)).toBe(DAY);
    expect(windowOpening(L('02:00', '2026-10-07'), night)).toBeNull();
  });
});

describe('TS2 timerStartDue and timerStartMessage', () => {
  const on = { running: true, announceStart: true, announcedOn: null };
  it('due once per opening, only for a running, announcing timer with a window', () => {
    expect(timerStartDue(on, day, L('08:05'))).toBe(DAY);
    expect(timerStartDue({ ...on, announcedOn: DAY }, day, L('08:05'))).toBeNull();
    expect(timerStartDue({ ...on, announcedOn: '2026-10-05' }, day, L('08:05'))).toBe(DAY);
    expect(timerStartDue({ ...on, running: false }, day, L('08:05'))).toBeNull();
    expect(timerStartDue({ ...on, announceStart: false }, day, L('08:05'))).toBeNull();
    expect(timerStartDue(on, undefined, L('08:05'))).toBeNull();
  });
  it('words', () => {
    expect(timerStartMessage('Pushups', 60)).toBe('Pushups timer started — every 60 minutes');
    expect(timerStartMessage('Plank', 1)).toBe('Plank timer started — every 1 minute');
  });
});
