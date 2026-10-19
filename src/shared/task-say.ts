// SPEC §7G.2, §7G.5 — reading a task in words, typed or dictated: the start sentence ("clean the garage for an hour,
// check on me every 15 minutes") and what is said to a running task ("pause", "20 minute break", "another 30
// minutes"). Pure; it only reads — what a command does is task-moves.ts.
import type { TaskMood } from './vocab';
import { ALERT_TITLE_MAX } from './alert-limits';

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, 'twenty-five': 25, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90,
};
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(WORDS).sort((x, y) => y.length - x.length).join('|')})`;
const UNIT = '(minutes?|mins?|hours?|hrs?|h)';

/** A number said as digits or a word, times its unit (hours → minutes), whole minutes. */
function minutesOf(n: string | undefined, unit: string | undefined): number {
  const v = n === undefined ? 1 : /^\d/.test(n) ? Number(n) : WORDS[n.toLowerCase()];
  return Math.round(v * (unit && /^h/i.test(unit) ? 60 : 1));
}

const tidy = (t: string) => t.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

const LEAD_INS = [
  /^(?:i'?m|i am) starting (?:a |my )?(?:new )?task\b/i,
  /^(?:i'?m|i am) (?:starting|beginning) (?:to |on )?/i,
  /^(?:i'?m|i am) going to (?:work on |start (?:on )?|do )?/i,
  /^(?:i'?m|i am) (?:working on|doing|gonna) /i,
  /^i (?:need|want|have) to (?:finish |do |get )?/i,
  /^(?:please )?keep me on track while i (?:work on )?/i,
  /^help me (?:to )?/i,
  /^(?:let'?s|time to) /i,
];

export interface TaskStartReading { title: string | null; limitMin: number | null; intervalMin: number | null }

/** §7G.2 — the start box → its title, limit and interval; whatever wasn't said is null. */
export function readTaskStart(text: string): TaskStartReading {
  let t = tidy(text).replace(/^(?:hey |ok |okay )?ens[oō]\b[,!.]?\s*/i, '');
  let intervalMin: number | null = null, limitMin: number | null = null;
  const every = new RegExp(`[,;.]?\\s*(?:and )?(?:(?:please )?(?:check (?:on|in with) me|check in|ping me|remind me)\\s+)?every\\s+(?:${NUM}\\s*)?${UNIT}(?:\\s+instead)?\\b\\.?`, 'i');
  const m1 = t.match(every);
  if (m1) { intervalMin = minutesOf(m1[1], m1[2]); t = t.replace(m1[0], ' '); }
  const forLong = new RegExp(`[,]?\\s*for\\s+(?:the next\\s+)?(?:(an? hour and a half)|(half an? hour)|${NUM}\\s*${UNIT})\\b`, 'i');
  const m2 = t.match(forLong);
  if (m2) { limitMin = m2[1] ? 90 : m2[2] ? 30 : minutesOf(m2[3], m2[4]); t = t.replace(m2[0], ' '); }
  t = tidy(t).split(/(?<=[.!?])\s/)[0];
  for (const re of LEAD_INS) { if (re.test(t)) { t = t.replace(re, ''); break; } }
  t = t.replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '');
  const title = t ? (t[0].toUpperCase() + t.slice(1)).slice(0, ALERT_TITLE_MAX) : null;
  return { title, limitMin: limitMin && limitMin > 0 ? limitMin : null, intervalMin: intervalMin && intervalMin > 0 ? intervalMin : null };
}

export type TaskSay =
  | { do: 'pause' } | { do: 'resume' } | { do: 'break'; min: number | null } | { do: 'interval'; min: number }
  | { do: 'add'; min: number } | { do: 'quiet' } | { do: 'howlong' } | { do: 'finish' } | { do: 'stop' } | { do: 'mood'; mood: TaskMood };

/** §7G.5 — what was said to a running task → its command, or null when it isn't one. First match wins. */
export function readTaskSay(text: string): TaskSay | null {
  const t = tidy(text).toLowerCase().replace(/^(?:hey )?ens[oō]\b[,!.]?\s*/, '');
  if (/how (?:long|much time)|time left/.test(t)) return { do: 'howlong' };
  if (/stop (?:announcing|speaking|saying)|don'?t (?:announce|say it)|no (?:more )?(?:alexa|speakers?|announc)|^(?:be )?quiet\b/.test(t)) return { do: 'quiet' };
  const brk = t.match(new RegExp(`${NUM}[\\s-]*${UNIT}[\\s-]+break|break for (?:${NUM}\\s*)?${UNIT}?`));
  if (brk) return { do: 'break', min: brk[1] ? minutesOf(brk[1], brk[2]) : brk[4] ? minutesOf(brk[3], brk[4]) : brk[3] ? minutesOf(brk[3], undefined) : null };
  if (/\bbreak\b/.test(t)) return { do: 'break', min: null };
  const every = t.match(new RegExp(`every\\s+(?:${NUM}\\s*)?${UNIT}`));
  if (every) return { do: 'interval', min: minutesOf(every[1], every[2]) };
  const add = t.match(new RegExp(`(?:another|add|plus|extra)\\s+${NUM}(?:\\s*${UNIT})?|${NUM}(?:\\s*${UNIT})?\\s+more\\b`));
  if (add) return { do: 'add', min: add[1] ? minutesOf(add[1], add[2]) : minutesOf(add[3], add[4]) };
  if (/\bpause\b|\bhold on\b/.test(t)) return { do: 'pause' };
  if (/\b(?:resume|unpause|continue)\b|i'?m back|back to it|let'?s go/.test(t)) return { do: 'resume' };
  if (/\b(?:done|finished|finish|completed?)\b/.test(t)) return { do: 'finish' };
  if (/\b(?:stop|quit|give up)\b/.test(t)) return { do: 'stop' };
  if (/\b(?:distracted|sidetracked|wandered|lost focus)\b/.test(t)) return { do: 'mood', mood: 'distracted' };
  if (/\b(?:struggl\w*|stuck|frustrat\w*|overwhelm\w*|hard)\b/.test(t)) return { do: 'mood', mood: 'struggling' };
  if (/\b(?:great|awesome|amazing|crushing|good)\b/.test(t)) return { do: 'mood', mood: 'great' };
  if (/\b(?:steady|ok|okay|fine|slow\w*|plugging)\b/.test(t)) return { do: 'mood', mood: 'steady' };
  return null;
}
