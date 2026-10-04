// SPEC §5.8 — every row is a test.
import { describe, expect, it } from 'vitest';
import {
  alertMessage, applyAction, applyTimerCmd, inside, newChoreFire, newThingFire, newTimerFire, nextTimerDue, planReminderFires,
  stepFire, timerWindow, timerWindowError, type AlertConfig, type FireRow, type NewFire, type ReminderEvent,
} from '../src/shared/engine';
import { localToUtc } from '../src/shared/time';

const D = '2026-10-06T';
const at = (hhmm: string) => `${D}${hhmm}:00.000Z`;
const withId = (f: NewFire, id = 'fire_1'): FireRow => ({ id, ...f });
const TZ = 'America/Los_Angeles';

describe('timer — interval 60, renotify 15, maxAlerts 4', () => {
  const cfg: AlertConfig = { channels: ['push'], renotifyMin: 15, maxAlerts: 4, intervalMin: 60 };
  const start = applyTimerCmd({ id: 'tmr_1', running: false }, null, 'start', 60, 'mem_a', at('12:00'));
  let fire = withId(start.newFire!);

  it('T1 start → running, fire due 13:00 scheduled', () => {
    expect(start.timer.running).toBe(true);
    expect(fire.due_at).toBe(at('13:00'));
    expect(fire.state).toBe('scheduled');
  });

  it('T2 12:59 → no change', () => {
    const r = stepFire(fire, cfg, at('12:59'));
    expect(r.alert).toBe(false);
    expect(r.fire).toEqual(fire);
  });

  it('T3 13:00 → ringing, alert 1', () => {
    const r = stepFire(fire, cfg, at('13:00'));
    expect(r.alert).toBe(true);
    expect(r.fire.state).toBe('ringing');
    expect(r.fire.alert_count).toBe(1);
    fire = r.fire;
  });

  it('T4 13:14 → no change', () => {
    expect(stepFire(fire, cfg, at('13:14')).alert).toBe(false);
  });

  it('T5 13:15 → alert 2', () => {
    const r = stepFire(fire, cfg, at('13:15'));
    expect(r.alert).toBe(true);
    expect(r.fire.alert_count).toBe(2);
    fire = r.fire;
  });

  it('T6 13:30, 13:45 → alerts 3 and 4', () => {
    for (const [t, n] of [['13:30', 3], ['13:45', 4]] as const) {
      const r = stepFire(fire, cfg, at(t));
      expect(r.alert).toBe(true);
      expect(r.fire.alert_count).toBe(n);
      fire = r.fire;
    }
  });

  it('T7 14:00 → max reached, stays ringing silently', () => {
    const r = stepFire(fire, cfg, at('14:00'));
    expect(r.alert).toBe(false);
    expect(r.fire.state).toBe('ringing');
  });

  let next: FireRow;
  it('T8 ack 14:05 → closed/acked, next due 15:05', () => {
    const r = applyAction(fire, 'ack', cfg, 'mem_a', at('14:05'));
    if ('error' in r) throw new Error(r.error);
    expect(r.fire.state).toBe('closed');
    expect(r.fire.close_reason).toBe('acked');
    expect(r.fire.closed_by).toBe('mem_a');
    expect(r.next!.due_at).toBe(at('15:05'));
    next = withId(r.next!, 'fire_2');
  });

  it('T9 early ack at 14:30 on the scheduled fire → next due 15:30', () => {
    const r = applyAction(next, 'ack', cfg, 'mem_a', at('14:30'));
    if ('error' in r) throw new Error(r.error);
    expect(r.fire.close_reason).toBe('acked');
    expect(r.next!.due_at).toBe(at('15:30'));
    next = withId(r.next!, 'fire_3');
  });

  it('T10 stop at 14:40 → not running, open fire closed/stopped, no next', () => {
    const r = applyTimerCmd({ id: 'tmr_1', running: true }, next, 'stop', 60, 'mem_a', at('14:40'));
    expect(r.timer.running).toBe(false);
    expect(r.closeFire!.close_reason).toBe('stopped');
    expect(r.newFire).toBeUndefined();
  });

  it('T11 snooze on a timer fire → invalid_action', () => {
    expect(applyAction(fire, 'snooze', cfg, 'mem_a', at('14:00'))).toEqual({ error: 'invalid_action' });
  });

  it("the user's own example (renotify off): start 12:00, rings 13:00 once, ack 13:45 → next 14:45", () => {
    const quiet: AlertConfig = { ...cfg, renotifyMin: null };
    let f = withId(applyTimerCmd({ id: 't', running: false }, null, 'start', 60, 'm', at('12:00')).newFire!);
    const r1 = stepFire(f, quiet, at('13:00'));
    expect(r1.alert).toBe(true);
    f = r1.fire;
    expect(stepFire(f, quiet, at('13:30')).alert).toBe(false);
    const r2 = applyAction(f, 'ack', quiet, 'm', at('13:45'));
    if ('error' in r2) throw new Error(r2.error);
    expect(r2.next!.due_at).toBe(at('14:45'));
  });

  it('start is idempotent; stop when stopped does nothing', () => {
    expect(applyTimerCmd({ id: 't', running: true }, null, 'start', 60, 'm', at('12:00')).newFire).toBeUndefined();
    expect(applyTimerCmd({ id: 't', running: false }, null, 'stop', 60, 'm', at('12:00')).closeFire).toBeUndefined();
  });

  it('timers are never missed — an overdue timer still rings', () => {
    const f = withId(applyTimerCmd({ id: 't', running: false }, null, 'start', 60, 'm', at('08:00')).newFire!);
    const r = stepFire(f, cfg, at('14:00'));
    expect(r.fire.state).toBe('ringing');
    expect(r.alert).toBe(true);
  });
});

describe('reminders — household tz America/Los_Angeles', () => {
  const weekly: ReminderEvent = {
    id: 'evt_1', start_date: '2026-10-06', start_time: '19:00',
    recurrence: { freq: 'WEEKLY' }, exdates: [], remind_offset_min: 0,
  };
  const cfg: AlertConfig = { channels: ['push'], renotifyMin: null, maxAlerts: 4 };
  const window = ['2026-10-06T00:00:00.000Z', '2026-10-07T12:00:00.000Z'] as const;

  it('R1 weekly Tue 19:00, offset 0 → one fire due 2026-10-07T02:00Z', () => {
    const fires = planReminderFires(weekly, TZ, ...window);
    expect(fires).toHaveLength(1);
    expect(fires[0].occurrence_date).toBe('2026-10-06');
    expect(fires[0].due_at).toBe('2026-10-07T02:00:00.000Z');
  });

  it('R2 offset 30 → due 01:30Z', () => {
    const fires = planReminderFires({ ...weekly, remind_offset_min: 30 }, TZ, ...window);
    expect(fires[0].due_at).toBe('2026-10-07T01:30:00.000Z');
  });

  it('R3 daily 08:00 across the DST change', () => {
    const daily: ReminderEvent = { ...weekly, start_date: '2026-10-30', start_time: '08:00', recurrence: { freq: 'DAILY' } };
    const fires = planReminderFires(daily, TZ, '2026-10-31T00:00:00.000Z', '2026-11-02T00:00:00.000Z');
    expect(fires.map((f) => [f.occurrence_date, f.due_at])).toEqual([
      ['2026-10-31', '2026-10-31T15:00:00.000Z'],
      ['2026-11-01', '2026-11-01T16:00:00.000Z'],
    ]);
  });

  const ringing = (): FireRow => ({
    ...withId(planReminderFires(weekly, TZ, ...window)[0]),
    state: 'ringing', alert_count: 1, last_alerted_at: '2026-10-07T02:03:00.000Z',
  });

  it('R8 due + 61 min → closed/missed, no alert', () => {
    const f = withId(planReminderFires(weekly, TZ, ...window)[0]);
    const r = stepFire(f, cfg, '2026-10-07T03:01:00.000Z');
    expect(r.alert).toBe(false);
    expect(r.fire.close_reason).toBe('missed');
  });

  it('R9 due + 59 min → ringing, alert', () => {
    const f = withId(planReminderFires(weekly, TZ, ...window)[0]);
    const r = stepFire(f, cfg, '2026-10-07T02:59:00.000Z');
    expect(r.alert).toBe(true);
    expect(r.fire.state).toBe('ringing');
  });

  it('R9a due + 60 min exactly → ringing, alert (boundary is not missed)', () => {
    const f = withId(planReminderFires(weekly, TZ, ...window)[0]);
    const r = stepFire(f, cfg, '2026-10-07T03:00:00.000Z');
    expect(r.alert).toBe(true);
    expect(r.fire.state).toBe('ringing');
  });

  it('R10 snooze at 19:03 local → scheduled, due 19:13 local, alert_count 0', () => {
    const r = applyAction(ringing(), 'snooze', cfg, 'mem_a', '2026-10-07T02:03:00.000Z');
    if ('error' in r) throw new Error(r.error);
    expect(r.fire.state).toBe('scheduled');
    expect(r.fire.due_at).toBe('2026-10-07T02:13:00.000Z');
    expect(r.fire.alert_count).toBe(0);
  });

  it('done closes a ringing reminder', () => {
    const r = applyAction(ringing(), 'done', cfg, 'mem_a', '2026-10-07T02:05:00.000Z');
    if ('error' in r) throw new Error(r.error);
    expect(r.fire.close_reason).toBe('done');
  });

  it('R11 ack on a reminder → invalid_action', () => {
    expect(applyAction(ringing(), 'ack', cfg, 'mem_a', '2026-10-07T02:05:00.000Z')).toEqual({ error: 'invalid_action' });
  });

  it('R12 planning twice gives identical output', () => {
    expect(planReminderFires(weekly, TZ, ...window)).toEqual(planReminderFires(weekly, TZ, ...window));
  });

  it('no reminder configured → no fires', () => {
    expect(planReminderFires({ ...weekly, remind_offset_min: null }, TZ, ...window)).toEqual([]);
  });

  it('all-day event reminds at 09:00 local', () => {
    const allDay: ReminderEvent = { ...weekly, start_time: null, recurrence: null };
    const fires = planReminderFires(allDay, TZ, '2026-10-06T00:00:00.000Z', '2026-10-07T00:00:00.000Z');
    expect(fires[0].due_at).toBe(localToUtc('2026-10-06', '09:00', TZ));
  });
});

describe('chore fires (§5.3, §5.4, §5.7)', () => {
  const cfg: AlertConfig = { channels: ['push'], renotifyMin: 15, maxAlerts: 4 };
  const due = '2026-10-05T14:30:00.000Z';
  const fire = withId(newChoreFire('run_1', due));

  it('a chore fire carries its run and no event or timer', () => {
    expect(fire).toMatchObject({ kind: 'chore', chore_run_id: 'run_1', event_id: null, timer_id: null, state: 'scheduled' });
  });

  it('a chore is never missed: hours overdue (an outage) it still rings', () => {
    const r = stepFire(fire, cfg, '2026-10-05T20:00:00.000Z');
    expect(r.alert).toBe(true);
    expect(r.fire.state).toBe('ringing');
    expect(r.fire.close_reason).toBeNull();
  });

  it('done on a ringing chore fire closes it done, with no next fire', () => {
    const ringing = stepFire(fire, cfg, due).fire;
    const r = applyAction(ringing, 'done', cfg, 'mem_a', '2026-10-05T14:40:00.000Z');
    if ('error' in r) throw new Error(r.error);
    expect(r.fire).toMatchObject({ state: 'closed', close_reason: 'done', closed_by: 'mem_a' });
    expect(r.next).toBeUndefined();
  });

  it('snooze/ack on a chore, or done while still scheduled → invalid_action', () => {
    const ringing = stepFire(fire, cfg, due).fire;
    expect(applyAction(ringing, 'snooze', cfg, 'mem_a', due)).toEqual({ error: 'invalid_action' });
    expect(applyAction(ringing, 'ack', cfg, 'mem_a', due)).toEqual({ error: 'invalid_action' });
    expect(applyAction(fire, 'done', cfg, 'mem_a', due)).toEqual({ error: 'invalid_action' });
  });

  it('message names the person and, for a multi-step chore, the step', () => {
    expect(alertMessage('chore', 'Laundry', 1, { personName: 'Sam', stepTitle: 'Start washer', stepCount: 3 })).toBe('Chore for Sam: Laundry — Start washer');
    expect(alertMessage('chore', 'Trash', 1, { personName: 'Kai', stepTitle: 'Trash', stepCount: 1 })).toBe('Chore for Kai: Trash');
    expect(alertMessage('chore', 'Trash', 2, { personName: null, stepTitle: 'Trash', stepCount: 1 })).toBe('Chore: Trash (alert 2)');
    expect(alertMessage('reminder', 'Meds', 1)).toBe('Reminder: Meds');
  });
});

describe('thing fires (§5.3, §5.4, §7C.2)', () => {
  const cfg: AlertConfig = { channels: ['push'], renotifyMin: null, maxAlerts: 4 };
  const due = '2026-10-10T16:00:00.000Z';
  const fire = withId(newThingFire('thg_1', '2026-10-10', due));

  it('a thing fire carries its thing and reminder date, and nothing else', () => {
    expect(fire).toMatchObject({ kind: 'thing', thing_id: 'thg_1', occurrence_date: '2026-10-10', event_id: null, timer_id: null, chore_run_id: null, state: 'scheduled' });
  });

  it('like a reminder it goes missed after an outage (> 60 min), and rings at exactly 60', () => {
    expect(stepFire(fire, cfg, '2026-10-10T17:01:00.000Z')).toMatchObject({ alert: false, fire: { close_reason: 'missed' } });
    expect(stepFire(fire, cfg, '2026-10-10T17:00:00.000Z')).toMatchObject({ alert: true, fire: { state: 'ringing' } });
  });

  it('done and snooze work on a ringing thing fire; ack does not', () => {
    const ringing = stepFire(fire, cfg, due).fire;
    const done = applyAction(ringing, 'done', cfg, 'mem_a', '2026-10-10T16:05:00.000Z');
    expect(done).toMatchObject({ fire: { state: 'closed', close_reason: 'done', closed_by: 'mem_a' } });
    const snooze = applyAction(ringing, 'snooze', cfg, 'mem_a', '2026-10-10T16:05:00.000Z');
    expect(snooze).toMatchObject({ fire: { state: 'scheduled', due_at: '2026-10-10T16:15:00.000Z', alert_count: 0 } });
    expect(applyAction(ringing, 'ack', cfg, 'mem_a', due)).toEqual({ error: 'invalid_action' });
    expect(applyAction(fire, 'done', cfg, 'mem_a', due)).toEqual({ error: 'invalid_action' });
  });

  it('message: "To do: {title}", plus " — starts today" for the start reminder', () => {
    expect(alertMessage('thing', 'Fall fair', 1, undefined, true)).toBe('To do: Fall fair — starts today');
    expect(alertMessage('thing', 'Fall fair', 1)).toBe('To do: Fall fair');
  });
});

describe('time conversion', () => {
  it('R13 spring-forward gap 02:30 → 03:00 PDT', () => {
    expect(localToUtc('2027-03-14', '02:30', TZ)).toBe('2027-03-14T10:00:00.000Z');
  });
  it('R14 ambiguous 01:30 → earlier (PDT)', () => {
    expect(localToUtc('2026-11-01', '01:30', TZ)).toBe('2026-11-01T08:30:00.000Z');
  });
});

describe('timer with an active time range (TW) — LA, 08:00–21:00, interval 60', () => {
  const L = (time: string, date = '2026-10-06') => localToUtc(date, time, TZ);
  const win = timerWindow('08:00', '21:00', TZ)!;
  const cfg: AlertConfig = { channels: ['push'], renotifyMin: 15, maxAlerts: 4, intervalMin: 60, window: win };
  const ackNext = (f: FireRow, c: AlertConfig, now: string) => {
    const r = applyAction(f, 'ack', c, 'mem_a', now);
    if ('error' in r) throw new Error(r.error);
    return r.next!.due_at;
  };
  const scheduledAt = (due: string) => withId(newTimerFire('tmr_1', due));
  const ringingSince = (due: string, count = 1, last = due): FireRow => ({ ...scheduledAt(due), state: 'ringing', alert_count: count, last_alerted_at: last });

  it('timerWindow is undefined unless both ends are set', () => {
    expect(timerWindow(null, null, TZ)).toBeUndefined();
    expect(timerWindow('08:00', null, TZ)).toBeUndefined();
    expect(win).toEqual({ from: '08:00', to: '21:00', tz: TZ });
  });

  it('TW1 start at 06:00 → due 09:00', () => {
    const r = applyTimerCmd({ id: 'tmr_1', running: false }, null, 'start', 60, 'mem_a', L('06:00'), win);
    expect(r.timer.running).toBe(true);
    expect(r.newFire!.due_at).toBe(L('09:00'));
  });

  it('TW2 ack at 20:30 → next day 09:00', () => {
    expect(ackNext(ringingSince(L('20:00')), cfg, L('20:30'))).toBe(L('09:00', '2026-10-07'));
  });

  it('TW3 ack at 19:30 → 20:30', () => {
    expect(ackNext(ringingSince(L('19:00')), cfg, L('19:30'))).toBe(L('20:30'));
  });

  it('TW4 ringing at 21:00 → scheduled, due next day 09:00, alert_count 0, no alert', () => {
    const r = stepFire(ringingSince(L('20:00'), 4, L('20:45')), cfg, L('21:00'));
    expect(r.alert).toBe(false);
    expect(r.fire).toMatchObject({ state: 'scheduled', due_at: L('09:00', '2026-10-07'), alert_count: 0, last_alerted_at: null, close_reason: null });
  });

  it('TW5 a renotify that would fall after 21:00 → no alert, deferred', () => {
    const f = ringingSince(L('20:50'));
    expect(stepFire(f, cfg, L('20:59')).alert).toBe(false); // not yet 15 min
    const r = stepFire(f, cfg, L('21:05'));
    expect(r.alert).toBe(false);
    expect(r.fire).toMatchObject({ state: 'scheduled', due_at: L('09:00', '2026-10-07'), alert_count: 0 });
  });

  it('TW6 a stale scheduled fire due 22:00 seen at 22:00 → deferred, no alert', () => {
    const r = stepFire(scheduledAt(L('22:00')), cfg, L('22:00'));
    expect(r.alert).toBe(false);
    expect(r.fire).toMatchObject({ state: 'scheduled', due_at: L('09:00', '2026-10-07') });
    // Not yet due outside the window → left alone until it comes due.
    const early = scheduledAt(L('22:00'));
    expect(stepFire(early, cfg, L('21:30')).fire).toBe(early);
  });

  it('TW7 due 09:00 inside the window rings as before', () => {
    const r = stepFire(scheduledAt(L('09:00')), cfg, L('09:00'));
    expect(r.alert).toBe(true);
    expect(r.fire).toMatchObject({ state: 'ringing', alert_count: 1 });
  });

  it('TW8 overnight 22:00–06:00: ack at 05:30 → 23:00 the same day', () => {
    const night: AlertConfig = { ...cfg, window: timerWindow('22:00', '06:00', TZ)! };
    expect(ackNext(ringingSince(L('05:00')), night, L('05:30'))).toBe(L('23:00'));
    expect(ackNext(ringingSince(L('22:30')), night, L('23:00'))).toBe(L('00:00', '2026-10-07'));
  });

  it('TW9 no window → base + interval, and a timer still rings at any hour', () => {
    expect(nextTimerDue(L('20:30'), 60)).toBe(L('21:30'));
    const plain: AlertConfig = { ...cfg, window: undefined };
    expect(stepFire(scheduledAt(L('23:00')), plain, L('23:00')).alert).toBe(true);
    expect(ackNext(ringingSince(L('20:00')), plain, L('20:30'))).toBe(L('21:30'));
  });

  it('TW10 timerWindowError: from = to, and interval ≥ window', () => {
    expect(timerWindowError({ from: '08:00', to: '08:00' }, 60)).toMatch(/different/);
    expect(timerWindowError({ from: '08:00', to: '09:00' }, 60)).toMatch(/shorter/);
    expect(timerWindowError({ from: '08:00', to: '09:00' }, 59)).toBeNull();
    expect(timerWindowError({ from: '22:00', to: '06:00' }, 60)).toBeNull();
    expect(timerWindowError({ from: '22:00', to: '06:00' }, 480)).toMatch(/480 min/);
  });

  it('TW11 DST ends 2026-11-01: ack Sat 20:30 PDT → Sun 09:00 PST', () => {
    expect(ackNext(ringingSince(L('20:00', '2026-10-31')), cfg, L('20:30', '2026-10-31'))).toBe('2026-11-01T17:00:00.000Z');
  });

  it('TW12 inside: from ≤ local < to; overnight wraps midnight', () => {
    expect([L('08:00'), L('20:59'), L('21:00'), L('07:59')].map((t) => inside(t, win))).toEqual([true, true, false, false]);
    const night = timerWindow('22:00', '06:00', TZ)!;
    expect([L('23:00'), L('05:59'), L('06:00'), L('21:59')].map((t) => inside(t, night))).toEqual([true, true, false, false]);
  });
});
