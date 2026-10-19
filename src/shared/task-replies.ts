// SPEC §7G.3–7G.6 — everything the 💪 Task buddy says: the check-in question (and its spoken twin for a private task),
// the reply to each answer, and the lines for Start, Pause, Resume, Finish, Stop and the changes. Varied, warm, never
// sarcastic or guilt-giving, never about a missed check-in. Pure; picked from the session, never at random.
import type { TaskMood } from './vocab';
import { TASK_LONG_WORK_MIN, TASK_SOON_MIN, remainingMs, taskState, timeUp, workedMs, type TaskSession } from './tasks';
import { ms } from './time';

/** "hour", "2 hours", "hour and a half", "30 minutes" — as in "That's your {limit}!". */
export function limitText(min: number): string {
  if (min === 60) return 'hour';
  if (min === 90) return 'hour and a half';
  if (min % 60 === 0) return `${min / 60} hours`;
  return `${min} minutes`;
}

/** "42 minutes", "1 hour 5 minutes". */
export function spanText(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  const mins = `${m} minute${m === 1 ? '' : 's'}`;
  return h === 0 ? mins : `${h} hour${h === 1 ? '' : 's'}${m ? ` ${mins}` : ''}`;
}

/** A stable small number from a string: picks a line, so the same session and count always say the same. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/** One line of `pool` for this key, never `avoid` (the last thing said) when there is another. */
export function pick(pool: readonly string[], key: string, avoid?: string): string {
  const fresh = pool.filter((l) => !avoid?.startsWith(l));
  const from = fresh.length ? fresh : pool;
  return from[hash(key) % from.length];
}

const nameOf = (s: TaskSession, title: string) => (s.private ? 'Your task' : title);

const QUESTIONS = ["{T}: how's it going?", '{T}: how are you doing?', "{T}: how's it coming along?"];

/**
 * §7G.3 — a check-in's whole text, and what a speaker says (a private task is never named aloud). `alertNumber`
 * 2 is the one gentle nudge.
 */
export function checkinText(s: TaskSession, title: string, intervalMin: number, now: string, alertNumber: number): { text: string; house: string } {
  const T = nameOf(s, title);
  const house = (text: string) => (s.private ? 'Time for a task check-in.' : text);
  const nudge = alertNumber >= 2;
  if (taskState(s) === 'break') {
    const text = nudge ? `Whenever you're ready, ${T} is waiting. No rush.` : `Break's over! Ready to get back to ${T}?`;
    return { text, house: house(text) };
  }
  if (timeUp(s, now) && s.limit_min !== null) {
    const text = nudge ? `Still there? Tell me how ${T} went whenever you're ready.`
      : `That's your ${limitText(s.limit_min)}! Nice work showing up for ${T}. Did you finish, or would you like a little more time?`;
    return { text, house: house(text) };
  }
  if (nudge) {
    const text = `Still working on ${T}? No rush checking in. I'm here when you need me.`;
    return { text, house: house(text) };
  }
  let text = QUESTIONS[s.checkins.length % QUESTIONS.length].replace('{T}', T);
  const left = remainingMs(s, now);
  if (left !== null && left <= intervalMin * 60_000) text += ` About ${Math.max(1, Math.round(left / 60_000))} min to go.`;
  else if (s.since_break && ms(now) - ms(s.since_break) >= TASK_LONG_WORK_MIN * 60_000 && s.limit_min === null) {
    text += " You've been at it a while. A longer break might feel good.";
  }
  return { text, house: house(text) };
}

const GREAT = [
  "That's what I like to hear! You're building momentum. Keep it going!",
  "Love it! You're in the zone. Ride that wave!",
  'Yes! Look at you go. Keep that energy up!',
  "Fantastic! This is what progress feels like. Let's keep rolling!",
];
const STREAK = [
  "Another great one! You're on a roll. Keep it going!",
  "Great again? You're making this look easy!",
  "That's a whole run of great check-ins. Seriously impressive!",
  "You're on fire today. Keep riding that momentum!",
];
const BOUNCE = [
  'Look at you, back in the groove. That bounce-back counts!',
  'You found your way back in. That takes real effort, nice work!',
  "Back on track! That's exactly how it's done.",
  'From tricky to moving again. Love to see it!',
];
const STEADY = [
  "Progress doesn't have to be fast. You're still moving forward, and that counts!",
  'Slow and steady is still steady. Keep chipping away!',
  "Every bit you do adds up. You're doing it!",
  'Steady wins. Keep that rhythm going!',
];
const DISTRACTED = [
  "Thanks for checking in! Let's get back to it. What's one small thing you can tackle right now?",
  "It happens to everyone. Let's ease back in with one tiny step.",
  'No worries! Wandering is normal. Pick one little thing and start there.',
  "Thanks for being honest! Let's get the next small win.",
];
const STRUGGLING = [
  "Okay, sounds like this one's putting up a fight. You've already made an effort. Let's make the next step smaller.",
  "Hard parts are still progress. What's the smallest piece you could do next?",
  "That's frustrating, and you're still here. Let's shrink the next step until it feels doable.",
  "Tough going. Take a breath. One small step is plenty right now.",
];
const AGAIN = [
  'Looks like getting started again has been tricky. Want to try just five focused minutes?',
  "This one keeps slipping away, and that's okay. How about five minutes, then we'll see?",
  'Getting back in is the hardest part. Try one short burst, just five minutes.',
  "Let's change it up: set everything else aside for five minutes and do just one thing.",
];
const BREAK = [
  "Good call! Breaks are part of getting things done. Enjoy a little downtime, and I'll check back in {n} minutes.",
  "Rest is part of the work. Enjoy it! I'll ping you in {n} minutes.",
  "Smart move. Stretch, grab some water, and I'll see you in {n} minutes.",
  "Take it easy for {n} minutes. You've earned it!",
];

const hard = (m: TaskMood | undefined) => m === 'distracted' || m === 'struggling';

/** §7G.4 — Enso's reply to an answer, from the mood and how the session has gone so far (`s` is before this answer). */
export function taskReply(s: TaskSession, mood: TaskMood, breakMin: number): string {
  const prev = s.checkins.map((c) => c.mood).filter((m) => m !== 'break');
  const last = prev[prev.length - 1];
  const key = `${s.id}|${s.checkins.length}`, avoid = s.checkins[s.checkins.length - 1]?.said;
  if (mood === 'break') return pick(BREAK, key, avoid).replace('{n}', String(breakMin));
  const back = taskState(s) === 'break' ? 'Welcome back! ' : '';
  if (mood === 'great' || mood === 'steady') {
    const pool = hard(last) ? BOUNCE : mood === 'steady' ? STEADY : prev.slice(-2).length === 2 && prev.slice(-2).every((m) => m === 'great') ? STREAK : GREAT;
    return back + pick(pool, key, avoid);
  }
  const line = pick(hard(last) ? AGAIN : mood === 'distracted' ? DISTRACTED : STRUGGLING, key, avoid);
  const step = s.done_looks.length ? ` Want to start with just this: “${s.done_looks[s.checkins.length % s.done_looks.length]}”?` : '';
  return back + line + step;
}

const PAUSE = ['Paused. Take the time you need.', "Paused. I'll be right here when you're ready.", "All paused. No check-ins until you're back."];
const RESUME = ["Welcome back! Let's pick up where we left off.", "Good to have you back. Let's keep going!", "Back at it! Let's make some progress."];
const FINISH = [
  "{T} is done? That's awesome! You put in the work and got it handled. Enjoy that feeling!",
  'Done and dusted! {T} is handled. Take a moment to enjoy it!',
  "You did it! {T} is finished. That's a real win.",
];
const STOP = [
  'You put some time into it today, and that matters. We can pick it up another time.',
  'Every bit of effort counts. {T} will be here when you want to come back to it.',
  "Good effort today. Stopping is fine; you can pick {T} up again any time.",
];

/** §7G.5 "How long have I been working?" — from minutes, so the PWA answers from a Task as given. */
export function howLongText(workedMin: number, elapsedMin: number, remainingMin: number | null): string {
  const tail = remainingMin === null ? '' : remainingMin > 0 ? `, ${spanText(remainingMin)} to go` : ", and you've reached your time";
  return `You've worked ${spanText(workedMin)} (${spanText(elapsedMin)} since you started)${tail}.`;
}

/** Lines for the session changes (§7G.2, §7G.5, §7G.6), keyed so repeats vary. */
export const taskSaid = {
  start: (title: string, intervalMin: number, limitMin: number | null) =>
    `Sounds good! I'll check on you every ${intervalMin} minute${intervalMin === 1 ? '' : 's'} while you work on ${title}${limitMin ? ` for the next ${limitText(limitMin)}` : ''}. Let's make some progress!`,
  pause: (s: TaskSession) => pick(PAUSE, `${s.id}|p${s.checkins.length}`),
  resume: (s: TaskSession) => pick(RESUME, `${s.id}|r${s.checkins.length}`),
  finish: (s: TaskSession, title: string) => {
    const line = pick(FINISH, s.id).replace('{T}', title);
    const t = s.done_ticked?.length ?? 0, n = s.done_looks.length;
    return n && t < n ? `${line} You checked ${t} of ${n}, and you get to call it.` : line;
  },
  stop: (s: TaskSession, title: string) => pick(STOP, s.id).replace('{T}', title),
  interval: (min: number) => `Got it. I'll check on you every ${min} minute${min === 1 ? '' : 's'}.`,
  soon: (min: number) => `Deal. I'll check back in ${min} minutes.`,
  more: (min: number) => `You've got ${min} more minutes. Let's use them well!`,
  quiet: () => "Okay, I won't announce this one on the speakers anymore.",
  howLong: (s: TaskSession, now: string) => {
    const left = remainingMs(s, now);
    return howLongText(Math.round(workedMs(s, now) / 60_000), Math.round((ms(now) - ms(s.started_at)) / 60_000), left === null ? null : Math.round(left / 60_000));
  },
  unknown: () => "I didn't catch that. Try 'pause', 'break', 'every 10 minutes' or 'done'.",
};

/** What the reply box offers after an answer (§7G.3): soon (Check on me in 5 min), more (+15 min), rest (☕ Take a break). */
export type ReplyOffer = 'soon' | 'more' | 'rest';
export function replyOffers(mood: TaskMood, timed: boolean): ReplyOffer[] {
  if (mood === 'distracted') return ['soon'];
  if (mood === 'struggling') return timed ? ['soon', 'more', 'rest'] : ['soon', 'rest'];
  return [];
}
export const SOON_LABEL = `Check on me in ${TASK_SOON_MIN} min`;

/** §5.4 — a check-in is answered through /tasks, never Ack. */
export const TASK_ACK_REFUSED = "Answer this check-in with how it's going.";
