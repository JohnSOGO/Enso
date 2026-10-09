// SPEC §7.8, §7.9 — POST /events/read-photo and /events/read-text: a screenshot, copied text or a pasted link read
// with Claude to fill the event form. Nothing is saved and neither is stored (⚑ Q187); the answer is cleaned by
// src/shared/event-reading.ts.
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY } from '../../shared/things';
import { cleanEventReading, EVENT_TEXT_MAX, type EventReading } from '../../shared/event-reading';
import { householdPlace, nowIso } from '../db';
import { body, fail, photoBody } from '../http';
import { readableLink } from '../../shared/link-reading';
import { requireMember } from '../session';
import { readEventLink, readEventPhoto, readEventText, type ReadEventResult } from '../event-reader';
import { spendPhotoRead } from '../photo-reads';

export const eventPhotos = new Hono<AppEnv>();

/** §7C.4 check order after the input: daily cap → key present → count the read → call the model → cleaned. */
/** What was read → its refusal and failure codes (§7.8, §7.9). */
const FAILS = {
  photo: ['photo_refused', 'photo_reading_failed'],
  text: ['photo_refused', 'photo_reading_failed'],
  link: ['link_refused', 'link_reading_failed'],
} as const;

async function readWith(c: Context<AppEnv>, what: keyof typeof FAILS, ask: (a: { apiKey: string; tz: string; today: string }) => Promise<ReadEventResult>) {
  const spent = await spendPhotoRead(c.env.DB, nowIso(), c.get('member').id, c.env.ANTHROPIC_API_KEY);
  if (!spent.ok && spent.why === 'used_up') {
    return fail(c, 429, 'rate_limited', `Photos can be read ${READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or fill the event in by hand.`);
  }
  if (!spent.ok) return fail(c, 503, 'photo_reading_off', "Reading photos isn't set up yet.");
  const r = await ask(spent);
  if (!r.ok && r.kind === 'refused') return fail(c, 422, FAILS[what][0], `Couldn't read that ${what}.`);
  if (!r.ok) return fail(c, 502, FAILS[what][1], `Couldn't read that ${what}: ${r.reason}`);
  return c.json<EventReading>(cleanEventReading(r.raw, spent.today));
}

eventPhotos.post('/events/read-photo', requireMember, async (c) => {
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  return readWith(c, 'photo', async (s) => readEventPhoto({ ...s, bytes: photo.bytes, mediaType: photo.type, home: await householdPlace(c.env.DB) }));
});

eventPhotos.post('/events/read-text', requireMember, async (c) => {
  const raw = (await body(c)).text;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || text.length > EVENT_TEXT_MAX) return fail(c, 400, 'invalid_input', `Paste some text, up to ${EVENT_TEXT_MAX} characters.`);
  const url = !/\s/.test(text) && readableLink(text); // §7.9 ⚑ Q197: a paste that is just one link reads the page
  if (url) return readWith(c, 'link', async (s) => readEventLink({ ...s, url, home: await householdPlace(c.env.DB) }));
  return readWith(c, 'text', async (s) => readEventText({ ...s, text, home: await householdPlace(c.env.DB) }));
});
