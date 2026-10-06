// SPEC §7.8 — POST /events/read-photo: a screenshot read with Claude to fill the new-event form. Nothing is saved
// and the screenshot is never stored (⚑ Q187); the answer is cleaned by src/shared/event-reading.ts.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY } from '../../shared/things';
import { cleanEventReading, type EventReading } from '../../shared/event-reading';
import { householdPlace, nowIso } from '../db';
import { fail, photoBody } from '../http';
import { requireMember } from '../session';
import { readEventPhoto } from '../event-reader';
import { spendPhotoRead } from '../photo-reads';

export const eventPhotos = new Hono<AppEnv>();

eventPhotos.post('/events/read-photo', requireMember, async (c) => {
  // §7C.4 check order: signed in → size/type → daily cap → key present → count the read → call the model.
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const spent = await spendPhotoRead(c.env.DB, nowIso(), c.get('member').id, c.env.ANTHROPIC_API_KEY);
  if (!spent.ok && spent.why === 'used_up') {
    return fail(c, 429, 'rate_limited', `Photos can be read ${READS_PER_DAY} times a day, and today's are used up. Try again tomorrow, or fill the event in by hand.`);
  }
  if (!spent.ok) return fail(c, 503, 'photo_reading_off', "Reading photos isn't set up yet.");
  const r = await readEventPhoto({
    apiKey: spent.apiKey, tz: spent.tz, today: spent.today, bytes: photo.bytes, mediaType: photo.type, home: await householdPlace(c.env.DB),
  });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'photo_refused', "Couldn't read that photo.");
  if (!r.ok) return fail(c, 502, 'photo_reading_failed', `Couldn't read that photo: ${r.reason}`);
  return c.json<EventReading>(cleanEventReading(r.raw, spent.today));
});
