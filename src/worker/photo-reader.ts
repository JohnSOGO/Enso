// SPEC §7C.4, §7A.3 — reads one photo via claude.ts (the only importer of the Anthropic SDK, and only lazily):
// a thing's flyer (readPhoto) or a snapped list item (readItemPhoto). This file owns the flyer prompt, both
// schemas and the image block (the item prompt is IDENTIFY_PROMPT, src/shared/item-reading.ts). It returns the raw
// answer or an honest failure; it never decides what is saved — the routes clean the answer (cleanPhotoReading,
// cleanItemName) and the person reviews it.
import { askClaude, type ClaudeBlock } from './claude';
import { IDENTIFY_PROMPT } from '../shared/item-reading';
import type { z as Zod } from 'zod';

/** A thing's reading (§7C.4, §7C.4b): every PhotoReading field, each a string or null. Shared with link-reader.ts. */
export const thingReadingSchema = (z: typeof Zod) => z.object({
  title: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(),
  place: z.string().nullable(), address: z.string().nullable(), phone: z.string().nullable(), cost: z.string().nullable(),
  url: z.string().nullable(), note: z.string().nullable(),
});

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

/** The photo as an image block, or the failure when Claude can't read its type. */
function imageBlock(bytes: ArrayBuffer, mediaType: string): ClaudeBlock | { ok: false; kind: 'failed'; reason: string } {
  if (!(READABLE as readonly string[]).includes(mediaType)) {
    return { ok: false, kind: 'failed', reason: `Claude can't read ${mediaType} pictures; send a JPEG.` };
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType as Readable, data: base64(bytes) } };
}

/** One photo, one structured-output request through askClaude. `fetch` is for tests only. */
export async function readPhoto(input: ReadPhotoInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadPhotoResult> {
  const image = imageBlock(input.bytes, input.mediaType);
  if ('ok' in image) return image;
  const res = await askClaude({
    apiKey: input.apiKey,
    fetch: opts.fetch,
    content: [image],
    prompt: prompt(input.today, input.tz),
    schema: thingReadingSchema,
  });
  return res.ok ? { ok: true, raw: res.value } : res;
}

export type ReadItemPhotoResult = { ok: true; name: string } | { ok: false; kind: 'refused' | 'failed'; reason: string };

/** A snapped list item (§7A.3): one request with IDENTIFY_PROMPT and the schema { name } → the raw name (the route
 *  runs cleanItemName), or an honest failure. `fetch` is for tests only. */
export async function readItemPhoto(input: { apiKey: string; bytes: ArrayBuffer; mediaType: string },
  opts: { fetch?: typeof fetch } = {}): Promise<ReadItemPhotoResult> {
  const image = imageBlock(input.bytes, input.mediaType);
  if ('ok' in image) return image;
  const res = await askClaude({
    apiKey: input.apiKey, fetch: opts.fetch, content: [image], prompt: IDENTIFY_PROMPT,
    schema: (z) => z.object({ name: z.string() }),
  });
  return res.ok ? { ok: true, name: res.value.name } : res;
}
