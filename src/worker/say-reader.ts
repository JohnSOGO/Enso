// SPEC §8.18 — reads what was said to the Ensō button via claude.ts: the prompt (clean up the words, then a reminder,
// "Ensō already does this", "can't do it yet", or "outside what Ensō is for"), the list of what else Ensō does, the
// scope (§1.3), and the schema; askClaude → the
// raw answer or an honest failure. No Hono, no D1; never decides what is saved (the route cleans with cleanSayReading
// and the person says Yes). WHEN A TAB OR SECTION IS ADDED, ADD IT TO ENSO_DOES; WHEN SPEC §1.3 CHANGES, CHANGE
// ENSO_SCOPE (the code-steward checks both).
import { askClaude } from './claude';
import { FEATURE_REQUEST_SIZE, SAY_KIND } from '../shared/vocab';
import { AFTER_LABEL, WHEN_CHOICE, type After } from '../shared/reminders';
import type { z as Zod } from 'zod';

/** Everything else Ensō does, and where it lives, so a request for something that exists is pointed there. */
export const ENSO_DOES = [
  'Calendar tab: events with times, places, who is going, things to bring; public holidays (days off set by admins), 📈 options expiration, the weather and 🌑🌓🌕🌗 moon phases, each one turned on or off per person in Settings → Calendar → Optional calendar items; an event reminder before it (also every hour until Done, or at a random time in a window); fill an event from a screenshot, copied text or a link; 📍 saved places (Settings → Calendar → Saved places: an address with arrival notes and match words, used on an event that names it).',
  'Alerts tab → 📌 Reminders: a one-off reminder that rings until Done, or random times inside a window on chosen days until Done.',
  'Alerts tab → ⏰ Alarms: rings at a set time on chosen days of the week, every week.',
  'Alerts tab → ⏱ Rolling timers: a countdown that restarts when acknowledged ("check on the dog every hour"), with active hours.',
  'Alerts tab → 🧺 Washing machines: clothes washer, dryer and dish washer loads, with a done alert.',
  'Alerts tab → 🍳 Cooking machines: cooking timers (air fryer, oven…).',
  'Alerts tab → 💪 Task buddy: checks in on you every N minutes while you work on something.',
  'Alerts tab, at the top: 📢 Announce (say something on Phone / House speakers / FunHouse) and 🤫 Quiet the house.',
  'Chores tab: chores on chosen days that rotate between people, steps that hand off, rooms with "what done looks like" photos, Whose mess? reports, bounties and the score, and 💵 IOUs (money family members owe each other, in dollars: OK / Got it or Decline (the one who added it is told and can ask again; a declined one stays on the record), pay back or let go, payback plans every week, 2 weeks or month with a phone ping on the day; recorded only, no money moves).',
  'Lists tab: Shopping, Wish list and any custom list, every day lists with a time, ✅ Things to do (with Plan it), 🎬 Movies & shows, 📥 Inbox (shared from the iPhone Share sheet).',
  'Recipes tab: recipes from a link or video, with photos and each person\'s emoji.',
  'Settings: Me (name, color, clock, after work time), Calendar options and days off, Phone alerts, Speakers (house announcements on Echo speakers), Alerts history, Household (rooms), Members and invites, Status, About, 💡 Requests (admins: what the Ensō button saved).',
] as const;

/** SPEC §1.3 — what Ensō is for. An ask outside it is "outside", never "request". */
export const ENSO_SCOPE = {
  fits: [
    "the family's calendar and plans, and who is going",
    'reminders, alarms and timers for the people in the house',
    'chores, rooms, messes, bounties and who did what',
    "IOUs: money the household's members owe each other, in dollars, and paying it back (Ensō records it; it never moves money)",
    'the house itself: its machines (washer, dryer, dish washer, cooking), its speakers and announcements, quiet times',
    "the household's lists: shopping, wishes, to-dos, every day lists, movies and shows, things shared in",
    'recipes and cooking',
    'the members of the household and their settings',
  ],
  outside: [
    'buying, ordering or paying (stores, Amazon, deliveries, bills); Ensō keeps the list, not the cart',
    'money beyond who owes whom in the house: moving or sending money (Venmo, bank transfers, cards), banking, budgets, investing, trading',
    'work or school systems, or other apps, websites or accounts to log into or control',
    'general questions, chat, search or news',
    "people outside the household, or anything to do with them that isn't the household's own plan",
  ],
} as const;

const sayReadingSchema = (z: typeof Zod) => z.object({
  heard: z.string(),
  kind: z.enum(SAY_KIND),
  say: z.string(),
  reminder: z.object({
    title: z.string(), date: z.string().nullable(), time: z.string().nullable(),
    days: z.array(z.string()), from: z.string().nullable(), to: z.string().nullable(), who: z.array(z.string()),
  }).nullable(),
  event: z.object({ title: z.string(), date: z.string().nullable(), time: z.string().nullable(), who: z.array(z.string()) }).nullable(),
  where: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  size: z.enum(FEATURE_REQUEST_SIZE).nullable(),
});

export interface ReadSayInput { apiKey: string; text: string; today: string; weekday: string; nowTime: string; tz: string; me: string; members: string[]; after: After }

export type ReadSayResult = { ok: true; raw: Record<string, unknown> } | { ok: false; kind: 'refused' | 'failed'; reason: string };

/** The When chips' times (§8.5b), the speaker's own After for "after work" / "after school". */
const chipTime = (id: 'tonight' | 'morning') => WHEN_CHOICE.find((c) => c.id === id)!.time;
const whenWords = (a: After) =>
  `"${AFTER_LABEL[a.kind].toLowerCase()}" is ${a.time}, "tonight" ${chipTime('tonight')}, "tomorrow morning" ${chipTime('morning')}`;

export const sayPrompt = (i: Omit<ReadSayInput, 'apiKey' | 'text'>) =>
  `Above is what ${i.me} said (spoken, so it may be misheard) to Ensō, a family's calendar, reminder and house app. ` +
  `Today is ${i.weekday} ${i.today}, ${i.nowTime}, in the household's time zone, ${i.tz}. The family members are: ${i.members.join(', ')} ` +
  `(people may be said by a nickname or real name: match the closest member; ${i.me}'s own name, or "me", is "me").\n\n` +
  `First fix the words: spelling, grammar and anything plainly misheard; put that in "heard" (the same language and meaning, nothing added).\n\n` +
  `Then pick one kind:\n` +
  `- "reminder" when it is a reminder Ensō's 📌 Reminders can make: either once at a date and time (date YYYY-MM-DD, time HH:MM 24-hour, ` +
  `the next such time after now; ${whenWords(i.after)}), or rings once at a random time inside a ` +
  `window on chosen days until Done (days as two-letter codes SU MO TU WE TH FR SA, "weekdays" = MO–FR; from and to HH:MM, from before to; ` +
  `date and time null). Title: a short line of what to do, with the useful details kept ("Book car check: fix headlight, fan stays on after parking"). ` +
  `who: "me", "everyone", or the members' names as listed. Fill "say" with one friendly sentence of what Ensō will do, spoken to ${i.me} ` +
  `("I'll remind you on weekdays between 8 and 11am to book the car check.").\n` +
  `- "event" when it is something for the calendar: a plan on a day, with a time or all day, and who is going ` +
  `("dinner on the 23rd at 8pm for John and Michelle"). event: title (short, like "Dinner"), date YYYY-MM-DD (the next such day), ` +
  `time HH:MM 24-hour or null for all day, who: "me" or the members' names (nobody named = "me"). "say": one sentence of what Ensō ` +
  `will add ("I'll add dinner on Friday the 23rd at 8pm for you and Michelle.").\n` +
  `- "exists" when Ensō already does it somewhere else and it is not a reminder or an event (those Ensō makes right here): "where" names the place from the list below, ` +
  `like "Alerts → ⏱ Rolling timers", and "say" tells them so in one sentence.\n` +
  `- "request" when Ensō can't do it yet: "title" a short name for the feature, "summary" one line of what it would do, ` +
  `"size" "small" when it fits beside what exists in one screen, else "big" (a new area, many screens, outside services, or unclear). ` +
  `"say" one sentence. Only for asks that fit what Ensō is for (below).\n` +
  `- "outside" when the ask does not fit what Ensō is for (below): "title" and "summary" as for a request, so John can ` +
  `look at it, "size" as for a request, and "where" the place from the list when part of it fits (like "Lists → Shopping" ` +
  `for groceries to order), else null. "say" one sentence. When unsure whether it fits, it fits: use "request" with "big".\n` +
  `Null for every field the kind doesn't use.\n\nWhat else Ensō does:\n${ENSO_DOES.map((l) => `- ${l}`).join('\n')}\n\n` +
  `What Ensō is for: one household's home life. It fits when it is about:\n${ENSO_SCOPE.fits.map((l) => `- ${l}`).join('\n')}\n` +
  `It does not fit when it is about:\n${ENSO_SCOPE.outside.map((l) => `- ${l}`).join('\n')}`;

/** One structured-output request through askClaude. `fetch` is for tests only. */
export async function readSay(input: ReadSayInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadSayResult> {
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [{ type: 'text', text: input.text }],
    prompt: sayPrompt(input), schema: sayReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
