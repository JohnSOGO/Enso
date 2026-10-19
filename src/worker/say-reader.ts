// SPEC §8.18 — reads what was said to the Ensō button via claude.ts: the prompt (clean up the words, then a reminder,
// "Ensō already does this", or "can't do it yet"), the list of what else Ensō does, and the schema; askClaude → the
// raw answer or an honest failure. No Hono, no D1; never decides what is saved (the route cleans with cleanSayReading
// and the person says Yes). WHEN A TAB OR SECTION IS ADDED, ADD IT TO ENSO_DOES (the code-steward checks).
import { askClaude } from './claude';
import { SAY_KIND } from '../shared/vocab';
import type { z as Zod } from 'zod';

/** Everything else Ensō does, and where it lives, so a request for something that exists is pointed there. */
export const ENSO_DOES = [
  'Calendar tab: events with times, places, who is going, things to bring, weather; an event reminder before it (also every hour until Done, or at a random time in a window); fill an event from a screenshot, copied text or a link.',
  'Alerts tab → 📌 Reminders: a one-off reminder that rings until Done, or random times inside a window on chosen days until Done.',
  'Alerts tab → ⏰ Alarms: rings at a set time on chosen days of the week, every week.',
  'Alerts tab → ⏱ Rolling timers: a countdown that restarts when acknowledged ("check on the dog every hour"), with active hours.',
  'Alerts tab → 🧺 Washing machines: clothes washer, dryer and dish washer loads, with a done alert.',
  'Alerts tab → 🍳 Cooking machines: cooking timers (air fryer, oven…).',
  'Alerts tab → 💪 Task buddy: checks in on you every N minutes while you work on something.',
  'Chores tab: chores on chosen days that rotate between people, steps that hand off, rooms with "what done looks like" photos, Whose mess? reports, bounties and the score.',
  'Lists tab: Shopping, Wish list and any custom list, every day lists with a time, ✅ Things to do (with Plan it), 🎬 Movies & shows, 📥 Inbox (shared from the iPhone Share sheet).',
  'Recipes tab: recipes from a link or video, with photos and each person\'s emoji.',
  'Settings: Me (name, color, clock, after work time), Calendar options and days off, Phone alerts, Speakers (house announcements on Echo speakers), Alerts history, Household (rooms), Members and invites, Status, About; quiet the house; Announce on every speaker.',
] as const;

const sayReadingSchema = (z: typeof Zod) => z.object({
  heard: z.string(),
  kind: z.enum(SAY_KIND),
  say: z.string(),
  reminder: z.object({
    title: z.string(), date: z.string().nullable(), time: z.string().nullable(),
    days: z.array(z.string()), from: z.string().nullable(), to: z.string().nullable(), who: z.array(z.string()),
  }).nullable(),
  where: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  size: z.enum(['small', 'big']).nullable(),
});

export interface ReadSayInput { apiKey: string; text: string; today: string; weekday: string; nowTime: string; tz: string; me: string; members: string[] }

export type ReadSayResult = { ok: true; raw: Record<string, unknown> } | { ok: false; kind: 'refused' | 'failed'; reason: string };

export const sayPrompt = (i: Omit<ReadSayInput, 'apiKey' | 'text'>) =>
  `Above is what ${i.me} said (spoken, so it may be misheard) to Ensō, a family's calendar, reminder and house app. ` +
  `Today is ${i.weekday} ${i.today}, ${i.nowTime}, in the household's time zone, ${i.tz}. The family members are: ${i.members.join(', ')}.\n\n` +
  `First fix the words: spelling, grammar and anything plainly misheard; put that in "heard" (the same language and meaning, nothing added).\n\n` +
  `Then pick one kind:\n` +
  `- "reminder" when it is a reminder Ensō's 📌 Reminders can make: either once at a date and time (date YYYY-MM-DD, time HH:MM 24-hour, ` +
  `the next such time after now; "after work" is 17:30, "tonight" 20:00, "tomorrow morning" 08:00), or rings once at a random time inside a ` +
  `window on chosen days until Done (days as two-letter codes SU MO TU WE TH FR SA, "weekdays" = MO–FR; from and to HH:MM, from before to; ` +
  `date and time null). Title: a short line of what to do, with the useful details kept ("Book car check: fix headlight, fan stays on after parking"). ` +
  `who: "me", "everyone", or the members' names as listed. Fill "say" with one friendly sentence of what Ensō will do, spoken to ${i.me} ` +
  `("I'll remind you on weekdays between 8 and 11am to book the car check.").\n` +
  `- "exists" when Ensō already does it somewhere else (not a reminder): "where" names the place from the list below, ` +
  `like "Alerts → ⏱ Rolling timers", and "say" tells them so in one sentence.\n` +
  `- "request" when Ensō can't do it yet: "title" a short name for the feature, "summary" one line of what it would do, ` +
  `"size" "small" when it fits beside what exists in one screen, else "big" (a new area, many screens, outside services, or unclear). ` +
  `"say" one sentence.\n` +
  `Null for every field the kind doesn't use.\n\nWhat else Ensō does:\n${ENSO_DOES.map((l) => `- ${l}`).join('\n')}`;

/** One structured-output request through askClaude. `fetch` is for tests only. */
export async function readSay(input: ReadSayInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadSayResult> {
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [{ type: 'text', text: input.text }],
    prompt: sayPrompt(input), schema: sayReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
