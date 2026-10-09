// SPEC §7.8, §7.9 — reads an event from a screenshot or copied text via claude.ts: the prompt and the schema,
// photo-reader.ts's image block (or the text), then askClaude → the raw answer or an honest failure. No Hono, no D1; never decides what is filled or
// saved (the route cleans with cleanEventReading and the person reviews the form).
import { askClaude } from './claude';
import { imageBlock } from './photo-reader';
import { nearestClause } from '../shared/link-reading';
import type { Place } from '../shared/sun';
import type { z as Zod } from 'zod';

const eventReadingSchema = (z: typeof Zod) => z.object({
  title: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(),
  startTime: z.string().nullable(), endTime: z.string().nullable(), location: z.string().nullable(), notes: z.string().nullable(),
});

export interface ReadEventPhotoInput {
  apiKey: string;
  bytes: ArrayBuffer;
  mediaType: string;
  today: string; // local YYYY-MM-DD in the household zone
  tz: string;
  /** The household's place, for a place name that could be several places (⚑ Q188). */
  home: Place | null;
}

export type ReadEventResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; kind: 'refused' | 'failed'; reason: string };

const SOURCE = {
  photo: 'This is a screenshot or photo of',
  text: 'Above is text copied from',
} as const;

export const eventPrompt = (today: string, tz: string, home: Place | null, source: keyof typeof SOURCE = 'photo') =>
  `${SOURCE[source]} an invitation, flyer, text message, email, map or similar about an event a household ` +
  `wants on its calendar. Today is ${today} in the household's time zone, ${tz}. Read it and fill in: title (a short ` +
  `name for the event), startDate and endDate (YYYY-MM-DD; turn dates like "Sat Oct 12" into full dates, choosing the ` +
  `next such date on or after today; a single day has the same start and end), startTime and endTime (HH:MM, 24-hour; ` +
  `null when no time is shown), location (the venue's name and street address as one line), notes (anything else ` +
  `useful, such as who it's from, what to bring, how to RSVP, a phone number or a link, copied as written). ` +
  `${nearestClause(home)}${home ? ' If a place name could mean more than one place, take the one nearest the household.' : ''} Use null for anything not shown.`;

/** One screenshot, one structured-output request through askClaude. `fetch` is for tests only. */
export async function readEventPhoto(input: ReadEventPhotoInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadEventResult> {
  const image = imageBlock(input.bytes, input.mediaType);
  if ('ok' in image) return image;
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [image],
    prompt: eventPrompt(input.today, input.tz, input.home), schema: eventReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}

/** §7.9 — copied text, the same prompt and schema with no image. `fetch` is for tests only. */
export async function readEventText(input: Omit<ReadEventPhotoInput, 'bytes' | 'mediaType'> & { text: string }, opts: { fetch?: typeof fetch } = {}): Promise<ReadEventResult> {
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [{ type: 'text', text: input.text }],
    prompt: eventPrompt(input.today, input.tz, input.home, 'text'), schema: eventReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
