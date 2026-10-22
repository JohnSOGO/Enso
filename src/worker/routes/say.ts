// SPEC §8.18 — POST /say/hear: a recorded clip written down (speech-to-text.ts). POST /say: what was said to the Ensō button, read by Claude (say-reader.ts) and cleaned
// (cleanSayReading). The §7C.4 check order (signed in → the text → daily cap → key → count → read). Nothing saved;
// the words are never stored or logged.
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { READS_PER_DAY } from '../../shared/things';
import { SAY_TEXT_MAX, cleanSayReading } from '../../shared/say-reading';
import { utcToLocal, weekdayOf } from '../../shared/time';
import { afterOf } from '../../shared/reminders';
import { isAdmin } from '../../shared/roles';
import { all, first, nowIso } from '../db';
import { audioBody, body, fail } from '../http';
import { requireMember } from '../session';
import { readSay } from '../say-reader';
import { hearClip } from '../speech-to-text';
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
  const p = await first<{ kind: string | null; time: string | null }>(c.env.DB, 'SELECT after_kind AS kind, after_time AS time FROM member_prefs WHERE member_id = ?', me.id);
  const after = afterOf({ admin: isAdmin(me), kind: p?.kind ?? null, time: p?.time ?? null }); // §8.5b: "after work" is theirs
  const r = await readSay({
    apiKey: spent.apiKey, text, today: spent.today, weekday: DAY_NAME[weekdayOf(spent.today)], nowTime: utcToLocal(now, spent.tz).time,
    tz: spent.tz, me: me.display_name, members: members.map((m) => m.name), after,
  });
  if (!r.ok && r.kind === 'refused') return fail(c, 422, 'say_refused', "Ensō couldn't help with that.");
  if (!r.ok) return fail(c, 502, 'say_failed', `Ensō couldn't read that: ${r.reason}`);
  const reading = cleanSayReading(r.raw, { tz: spent.tz, now, meId: me.id, members });
  if (!reading) return fail(c, 502, 'say_failed', "Ensō didn't understand that. Try saying it another way.");
  return c.json(reading);
});

// §8.18 part 2 ⚑ Q375 — a recorded clip written down; not a Claude read, no cap of its own (⚑ Q376).
say.post('/say/hear', requireMember, async (c) => {
  if (!c.env.AI) return fail(c, 503, 'hear_off', "Ensō can't write down recordings: it isn't set up.");
  const clip = await audioBody(c);
  if (clip instanceof Response) return clip;
  const r = await hearClip(c.env.AI, clip.bytes);
  if (!r.ok) return fail(c, 502, 'hear_failed', "Ensō couldn't write that down. Try again, or use the keyboard's 🎤.");
  return c.json({ text: r.text });
});
