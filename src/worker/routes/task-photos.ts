// SPEC §7G.6 — POST /tasks/{id}/check-photo: Finish's done check, a photo read by Claude against my task's done list.
// The §7C.4 check order (signed in → the task is mine → a list → size/type → daily cap → key → count → read); the
// photo is read once and never stored. The answer is only offered: the person ticks and decides.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY } from '../../shared/things';
import { cleanDoneCheck } from '../../shared/tasks';
import { nowIso } from '../db';
import { fail, photoBody } from '../http';
import { requireMember } from '../session';
import { readDonePhoto } from '../photo-reader';
import { spendPhotoRead } from '../photo-reads';
import { loadMine } from './tasks';

export const taskPhotos = new Hono<AppEnv>();

taskPhotos.post('/tasks/:id/check-photo', requireMember, async (c) => {
  const t = await loadMine(c);
  if (t instanceof Response) return t;
  const lines = t.session.done_looks;
  if (!lines.length) return fail(c, 400, 'invalid_input', 'This task has no "what done looks like" to check against.');
  const photo = await photoBody(c);
  if (photo instanceof Response) return photo;
  const spent = await spendPhotoRead(c.env.DB, nowIso(), c.get('member').id, c.env.ANTHROPIC_API_KEY);
  if (!spent.ok) {
    return spent.why === 'used_up'
      ? fail(c, 429, 'rate_limited', `Photos and links can be read ${READS_PER_DAY} times a day, and today's are used up. Tick the lines by hand.`)
      : fail(c, 503, 'photo_reading_off', "Reading photos isn't set up yet. Tick the lines by hand.");
  }
  const r = await readDonePhoto({ apiKey: spent.apiKey, bytes: photo.bytes, mediaType: photo.type, title: t.timer.title, lines });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'photo_refused', "Couldn't read that photo.");
  if (!r.ok) return fail(c, 502, 'photo_reading_failed', `Couldn't read that photo: ${r.reason}`);
  return c.json(cleanDoneCheck(r.raw, lines));
});
