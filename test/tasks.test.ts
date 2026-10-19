// SPEC §7G.7 TB1–TB6 — the 💪 Task buddy's pure rules: reading words (task-say.ts), time and state (tasks.ts), the
// moves (task-moves.ts), and everything Enso says (task-replies.ts).
import { describe, expect, it } from 'vitest';
import { readTaskSay, readTaskStart } from '../src/shared/task-say';
import { cleanDoneCheck, nextCheckinDue, taskPattern, taskState, timeUp, workedMs, type TaskSession, type TaskTimer } from '../src/shared/tasks';
import { checkinMove, editMove, endMove, pauseMove, resumeMove, startMove } from '../src/shared/task-moves';
import { checkinText, limitText, replyOffers, taskReply } from '../src/shared/task-replies';
import { newTimerFire, type FireRow } from '../src/shared/engine';
import { addMinutes } from '../src/shared/time';

const T = '2026-10-19T17:00:00.000Z';
const at = (min: number) => addMinutes(T, min);
const TIMER: TaskTimer = { title: 'Clean the garage', interval_min: 15, channels: ['push', 'house'], running: true };
const fresh = (over: Partial<TaskSession> = {}): TaskSession => ({
  ...startMove('task_1', 'mem_a', { title: 'Clean the garage', limitMin: null, intervalMin: 15, doneLooks: [], channels: ['push'], private: false }, T).session,
  ...over,
});
const fire = (due: string): FireRow => ({ id: 'fire_1', ...newTimerFire('task_1', due), state: 'ringing', alert_count: 1, last_alerted_at: due });

describe('TB1 readTaskStart', () => {
  it('reads the example sentences', () => {
    expect(readTaskStart("I'm starting to clean the garage.")).toEqual({ title: 'Clean the garage', limitMin: null, intervalMin: null });
    expect(readTaskStart("Enso, I'm going to work on my coding project for two hours.")).toEqual({ title: 'My coding project', limitMin: 120, intervalMin: null });
    expect(readTaskStart('I need to finish the laundry')).toMatchObject({ title: 'The laundry', limitMin: null });
    expect(readTaskStart('Enso, keep me on track while I organize the office')).toMatchObject({ title: 'Organize the office' });
    expect(readTaskStart("I'm starting a task. Check on me every 15 minutes.")).toEqual({ title: null, limitMin: null, intervalMin: 15 });
    expect(readTaskStart('clean the garage for an hour and a half, every 10 min')).toEqual({ title: 'Clean the garage', limitMin: 90, intervalMin: 10 });
    expect(readTaskStart('I’m working on taxes for half an hour, check in every fifteen minutes')).toEqual({ title: 'Taxes', limitMin: 30, intervalMin: 15 });
    expect(readTaskStart('Garage for 1.5 hours, ping me every hour')).toEqual({ title: 'Garage', limitMin: 90, intervalMin: 60 });
  });
});

describe('TB2 readTaskSay', () => {
  it('each command of §7G.5', () => {
    expect(readTaskSay('Enso, pause my task')).toEqual({ do: 'pause' });
    expect(readTaskSay("I'm back")).toEqual({ do: 'resume' });
    expect(readTaskSay("I'm taking a 20-minute break")).toEqual({ do: 'break', min: 20 });
    expect(readTaskSay('break')).toEqual({ do: 'break', min: null });
    expect(readTaskSay('Check on me every 10 minutes instead')).toEqual({ do: 'interval', min: 10 });
    expect(readTaskSay('Give me another 30 minutes')).toEqual({ do: 'add', min: 30 });
    expect(readTaskSay('15 more minutes')).toEqual({ do: 'add', min: 15 });
    expect(readTaskSay('Stop announcing this task on Alexa')).toEqual({ do: 'quiet' });
    expect(readTaskSay('How long have I been working?')).toEqual({ do: 'howlong' });
    expect(readTaskSay('I finished!')).toEqual({ do: 'finish' });
    expect(readTaskSay('stop')).toEqual({ do: 'stop' });
    expect(readTaskSay("I'm stuck")).toEqual({ do: 'mood', mood: 'struggling' });
    expect(readTaskSay('got distracted')).toEqual({ do: 'mood', mood: 'distracted' });
    expect(readTaskSay('going great')).toEqual({ do: 'mood', mood: 'great' });
    expect(readTaskSay('banana')).toBeNull();
  });
});

describe('TB3 time and state', () => {
  it('working time counts only working stretches; a timed check-in never passes the limit', () => {
    const s = fresh({ worked_ms: 5 * 60_000, working_since: at(0) });
    expect(workedMs(s, at(20))).toBe(25 * 60_000);
    const onBreak = fresh({ worked_ms: 5 * 60_000, working_since: null, break_until: at(30) });
    expect(taskState(onBreak)).toBe('break');
    expect(workedMs(onBreak, at(20))).toBe(5 * 60_000);
    const timed = fresh({ limit_min: 30, worked_ms: 25 * 60_000, working_since: at(0) });
    expect(nextCheckinDue(timed, at(0), 15)).toBe(at(5));
    expect(nextCheckinDue(fresh(), at(0), 15)).toBe(at(15));
    expect(timeUp(timed, at(5))).toBe(true);
    expect(timeUp(timed, at(4))).toBe(false);
  });

  it('moves: a break stops the clock and moves the check-in; pause stops it; resume and a new interval re-plan', () => {
    const s = fresh();
    const b = checkinMove(s, TIMER, fire(at(15)), 'break', 15, at(15));
    if (typeof b === 'string') throw new Error(b);
    expect(b).toMatchObject({ session: { break_until: at(30), working_since: null, worked_ms: 15 * 60_000 }, closeFire: { close_reason: 'acked' }, newFire: { due_at: at(30) } });
    const back = checkinMove(b.session, TIMER, fire(at(30)), 'great', 10, at(32));
    if (typeof back === 'string') throw new Error(back);
    expect(back.session).toMatchObject({ break_until: null, working_since: at(32) });
    expect(back.newFire!.due_at).toBe(at(47));
    expect(back.said.startsWith('Welcome back! ')).toBe(true);
    const p = pauseMove(back.session, TIMER, null, at(40));
    if (typeof p === 'string') throw new Error(p);
    expect(p).toMatchObject({ session: { paused_at: at(40), worked_ms: 23 * 60_000 }, timer: { running: false } });
    expect(p.newFire).toBeUndefined();
    expect(pauseMove(p.session, TIMER, null, at(41))).toBe('not_working');
    const r = resumeMove(p.session, TIMER, null, at(50));
    if (typeof r === 'string') throw new Error(r);
    expect(r.newFire!.due_at).toBe(at(65));
    const e = editMove(r.session, TIMER, fire(at(65)), { intervalMin: 10 }, at(51));
    if (typeof e === 'string') throw new Error(e);
    expect(e).toMatchObject({ timer: { interval_min: 10 }, closeFire: { close_reason: 'superseded' }, newFire: { due_at: at(61) } });
    const q = editMove(r.session, TIMER, null, { quiet: true }, at(51));
    expect(typeof q !== 'string' && q.timer.channels).toEqual(['push']);
    const more = editMove(r.session, TIMER, null, { addMin: 30 }, at(51));
    expect(typeof more !== 'string' && more.session.limit_min).toBe(54); // 24 worked (rounded up) + 30
    const end = endMove(r.session, TIMER, fire(at(65)), 'finished', [2, 0, 9], at(60));
    expect(end).toMatchObject({ session: { outcome: 'finished', done_ticked: [] }, closeFire: { close_reason: 'done' }, timer: { running: false } });
    expect(endMove((end as any).session, TIMER, null, 'stopped', null, at(61))).toBe('ended');
  });
});

describe('TB4 checkinText', () => {
  it('working, time up, break over, the nudges, Private', () => {
    expect(checkinText(fresh(), 'Clean the garage', 15, at(15), 1)).toEqual({ text: "Clean the garage: how's it going?", house: "Clean the garage: how's it going?" });
    const one = fresh({ checkins: [{ at: at(15), mood: 'great', said: 'x' }] });
    expect(checkinText(one, 'Clean the garage', 15, at(30), 1).text).toBe('Clean the garage: how are you doing?');
    const timed = fresh({ limit_min: 60, working_since: at(0) });
    expect(checkinText(timed, 'Garage', 15, at(50), 1).text).toBe("Garage: how's it going? About 10 min to go.");
    expect(checkinText(timed, 'Garage', 15, at(60), 1).text).toBe("That's your hour! Nice work showing up for Garage. Did you finish, or would you like a little more time?");
    expect(checkinText(timed, 'Garage', 15, at(60), 2).text).toBe("Still there? Tell me how Garage went whenever you're ready.");
    expect(checkinText(fresh(), 'Garage', 15, at(95), 1).text).toBe("Garage: how's it going? You've been at it a while. A longer break might feel good.");
    expect(checkinText(fresh(), 'Garage', 15, at(15), 2).text).toBe("Still working on Garage? No rush checking in. I'm here when you need me.");
    const brk = fresh({ working_since: null, break_until: at(30) });
    expect(checkinText(brk, 'Garage', 15, at(30), 1).text).toBe("Break's over! Ready to get back to Garage?");
    expect(checkinText(fresh({ private: true }), 'Garage', 15, at(15), 1)).toEqual({ text: "Your task: how's it going?", house: 'Time for a task check-in.' });
    expect([limitText(60), limitText(90), limitText(120), limitText(30)]).toEqual(['hour', 'hour and a half', '2 hours', '30 minutes']);
  });
});

describe('TB5 taskReply', () => {
  const log = (...moods: TaskSession['checkins'][number]['mood'][]) => moods.map((mood, i) => ({ at: at(i), mood, said: `said ${i}` }));
  it('by mood and history, never the last line again', () => {
    expect(taskReply(fresh(), 'great', 10)).toMatch(/!/);
    expect(taskReply(fresh({ checkins: log('great', 'great') }), 'great', 10)).toMatch(/roll|again|run of great|fire/);
    expect(taskReply(fresh({ checkins: log('distracted') }), 'steady', 10)).toMatch(/back|groove|track|moving again/i);
    expect(taskReply(fresh({ checkins: log('distracted') }), 'struggling', 10)).toMatch(/five/);
    expect(taskReply(fresh(), 'break', 15)).toMatch(/15 minutes/);
    const withList = fresh({ done_looks: ['Floor clear', 'Bikes on hooks'] });
    expect(taskReply(withList, 'struggling', 10)).toContain('“Floor clear”');
    for (let i = 0; i < 12; i++) {
      const prev = taskReply(fresh({ id: `task_${i}` }), 'great', 10);
      const s = fresh({ id: `task_${i}`, checkins: [{ at: T, mood: 'steady', said: prev }] });
      expect(taskReply(s, 'steady', 10)).not.toBe(prev);
    }
    expect(replyOffers('distracted', false)).toEqual(['soon']);
    expect(replyOffers('struggling', true)).toEqual(['soon', 'more', 'rest']);
    expect(replyOffers('great', true)).toEqual([]);
  });
});

describe('TB6 taskPattern and the photo check', () => {
  it('patterns', () => {
    expect(taskPattern(['great', 'great', 'great'])).toBe('Strong momentum all the way');
    expect(taskPattern(['steady', 'steady'])).toBe('Steady and consistent');
    expect(taskPattern(['distracted', 'struggling', 'great'])).toBe('A tough patch, then a strong finish');
    expect(taskPattern(['distracted', 'struggling', 'distracted'])).toBe('A tricky one, and you kept showing up');
    expect(taskPattern([])).toBe('Heads down, no check-ins needed');
    expect(taskPattern(['great', 'break'])).toBe('Strong momentum all the way · 1 break');
  });
  it('cleanDoneCheck: one look per line, odd answers unsure', () => {
    expect(cleanDoneCheck({ lines: [{ n: 1, looks: 'yes' }, { n: 3, looks: 'maybe' }], note: ' Looking good! ' }, ['a', 'b', 'c'])).toEqual({
      lines: [{ text: 'a', looks: 'yes' }, { text: 'b', looks: 'unsure' }, { text: 'c', looks: 'unsure' }], note: 'Looking good!',
    });
  });
});
