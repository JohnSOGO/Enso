// SPEC §7C.4 — reads one photo via claude.ts (the only importer of the Anthropic SDK, and only lazily).
// This file owns the photo prompt, its schema and its image block. It returns the raw fields or an
// honest failure; it never decides what is saved — the route cleans the answer with cleanPhotoReading
// (src/shared/things.ts) and the person reviews it.
import { askClaude } from './claude';

/** Media types the Claude API reads as an image block. The phone sends JPEG (§7C.3). */
const READABLE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type Readable = (typeof READABLE)[number];

export interface ReadPhotoInput {
  apiKey: string;
  bytes: ArrayBuffer;
  mediaType: string;
  today: string; // local YYYY-MM-DD in the household zone
  tz: string;
}

export type ReadPhotoResult =
  | { ok: true; raw: Record<string, unknown> }
  | { ok: false; kind: 'refused' | 'failed'; reason: string };

function base64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

const prompt = (today: string, tz: string) =>
  `This is a photo of a flyer, poster, ticket or screenshot about something a household might want to do. ` +
  `Today is ${today} in the household's time zone, ${tz}. Read it and fill in: title (short name of the thing), ` +
  `startDate and endDate (YYYY-MM-DD; turn dates like "Sat Oct 12" into full dates, choosing the next such date ` +
  `on or after today; a single day has the same start and end), place (the venue's name), address (its street ` +
  `address), phone (a phone number), cost (prices or cost, as one line), url (a web link printed on it), note (anything ` +
  `else useful, such as times or what to bring). Give every detail the photo shows, copied exactly as written. ` +
  `Use null for anything not shown.`;

/** One photo, one structured-output request through askClaude. `fetch` is for tests only. */
export async function readPhoto(input: ReadPhotoInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadPhotoResult> {
  if (!(READABLE as readonly string[]).includes(input.mediaType)) {
    return { ok: false, kind: 'failed', reason: `Claude can't read ${input.mediaType} pictures; send a JPEG.` };
  }
  const res = await askClaude({
    apiKey: input.apiKey,
    fetch: opts.fetch,
    content: [
      { type: 'image', source: { type: 'base64', media_type: input.mediaType as Readable, data: base64(input.bytes) } },
    ],
    prompt: prompt(input.today, input.tz),
    schema: (z) => z.object({
      title: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(),
      place: z.string().nullable(), address: z.string().nullable(), phone: z.string().nullable(), cost: z.string().nullable(),
      url: z.string().nullable(), note: z.string().nullable(),
    }),
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}
