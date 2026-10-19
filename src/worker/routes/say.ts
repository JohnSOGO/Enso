// SPEC §8.18 — POST /say: what was said to the Ensō button, read by Claude (say-reader.ts) and cleaned
// (cleanSayReading). The §7C.4 check order (signed in → the text → daily cap → key → count → read). Nothing saved;
// the words are never stored or logged.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY } from '../../shared/things';
import { SAY_TEXT_MAX, cleanSayReading } from '../../shared/say-reading';
import { utcToLocal, weekdayOf } from '../../shared/time';
import { all, nowIso } from '../db';
import { body, fail } from '../http';
import { requireMember } from '../session';
import { readSay } from '../say-reader';
import { spendPhotoRead } from '../photo-reads';

const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const say = new Hono<AppEnv>();

say.post('/say', requireMember, async (c) => {
  const b = await body(c);
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text) return fail(c, 400, 'invalid_input', 'Say or type what you want first.');
  if (text.length > SAY_TEXT_MAX) return fail(c, 400, 'invalid_input', `That's too long: keep it under ${SAY_TEXT_MAX} characters.`);
  const me = c.get('member'), now = nowIso();
  const spent = await spendPhotoRead(c.env.DB, now, me.id, c.env.ANTHROPIC_API_KEY);
  if (!spent.ok) {
    return spent.why === 'used_up'
      ? fail(c, 429, 'rate_limited', `Ensō can't read any more today (${READS_PER_DAY} a day, shared with photos and links). Try again tomorrow.`)
      : fail(c, 503, 'photo_reading_off', "Ensō can't read what you said yet: it isn't set up.");
  }
  const members = (await all<{ id: string; display_name: string }>(c.env.DB, 'SELECT id, display_name FROM members WHERE disabled_at IS NULL ORDER BY created_at'))
    .map((m) => ({ id: m.id, name: m.display_name }));
  const r = await readSay({
    apiKey: spent.apiKey, text, today: spent.today, weekday: DAY_NAME[weekdayOf(spent.today)], nowTime: utcToLocal(now, spent.tz).time,
    tz: spent.tz, me: me.display_name, members: members.map((m) => m.name),
  });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'say_refused', "Ensō couldn't help with that.");
  if (!r.ok) return fail(c, 502, 'say_failed', `Ensō couldn't read that: ${r.reason}`);
  const reading = cleanSayReading(r.raw, { tz: spent.tz, now, meId: me.id, members });
  if (!reading) return fail(c, 502, 'say_failed', "Ensō didn't understand that. Try saying it another way.");
  return c.json(reading);
});
