// SPEC §7C.4 — reads one photo with the Claude API. The ONLY importer of `@anthropic-ai/sdk`, and only
// lazily (inside readPhoto), so the cron tick and every other route never load it. It returns the raw
// fields or an honest failure; it never decides what is saved — the route cleans the answer with
// cleanPhotoReading (src/shared/things.ts) and the person reviews it.

export const PHOTO_MODEL = 'claude-opus-5-5';

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

/**
 * One structured-output request: `client.beta.messages.parse` (the beta path, because the server-side
 * refusal fallback is a beta parameter) with `output_config.format` from the SDK's zod helper.
 * `fetch` is for tests only, so no test ever reaches the real API.
 */
export async function readPhoto(input: ReadPhotoInput, opts: { fetch?: typeof fetch } = {}): Promise<ReadPhotoResult> {
  if (!(READABLE as readonly string[]).includes(input.mediaType)) {
    return { ok: false, kind: 'failed', reason: `Claude can't read ${input.mediaType} pictures; send a JPEG.` };
  }
  const [{ default: Anthropic }, { betaZodOutputFormat }, { z }] = await Promise.all([
    import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod'), import('zod'),
  ]);
  const Reading = z.object({
    title: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(),
    place: z.string().nullable(), address: z.string().nullable(), phone: z.string().nullable(), cost: z.string().nullable(),
    url: z.string().nullable(), note: z.string().nullable(),
  });
  // A parse failure becomes null instead of throwing, so stop_reason (a refusal's partial text) is checked first.
  const strict = betaZodOutputFormat(Reading);
  const format = { ...strict, parse: (text: string) => { try { return strict.parse(text); } catch { return null; } } };
  const client = new Anthropic({ apiKey: input.apiKey, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
  try {
    const res = await client.beta.messages.parse({
      model: PHOTO_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: input.mediaType as Readable, data: base64(input.bytes) } },
          { type: 'text', text: prompt(input.today, input.tz) },
        ],
      }],
    });
    if (res.stop_reason === 'refusal') {
      return { ok: false, kind: 'refused', reason: res.stop_details?.explanation || res.stop_details?.category || 'refused' };
    }
    if (res.stop_reason === 'max_tokens') return { ok: false, kind: 'failed', reason: 'The reading was cut off before it finished.' };
    if (!res.parsed_output) return { ok: false, kind: 'failed', reason: 'The reading came back in an unexpected shape.' };
    return { ok: true, raw: res.parsed_output };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, kind: 'failed', reason: `Claude API error${err.status ? ` ${err.status}` : ''}: ${err.message}` };
    }
    return { ok: false, kind: 'failed', reason: err instanceof Error && err.message ? err.message : String(err) };
  }
}
