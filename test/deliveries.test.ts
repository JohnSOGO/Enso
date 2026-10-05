// SPEC §9.4, §6.6, §7B.7, §9.3 — which deliveries rows count toward the founder's hourly ping limit. Rows are
// written through the one owner (src/worker/deliveries.ts) at a far-future instant so nothing else counts.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import { houseDelivery, opsPingsSince, pushDelivery } from '../src/worker/deliveries';
import { NOTICE_TITLE } from '../src/shared/phone-login';
import { MESS_ASK_TITLE } from '../src/shared/messes';
import { owner } from './helpers';

it('counts a founder ping, and not an announcement, a sign-in notice or a mess ask', async () => {
  const db = env.DB;
  const memberId = (await (await owner()).get('/me')).json.id as string;
  const now = '2099-01-01T00:00:00.000Z';
  await db.prepare(`INSERT INTO messes (id, reported_by, created_at) VALUES ('mes_dlv_test', ?, ?)`).bind(memberId, now).run();
  const write = (d: { stmt: D1PreparedStatement }) => d.stmt.run();

  // An announcement (§9.3): a push and a house row, no title.
  await write(pushDelivery(db, { memberId, message: 'MojoSOGO says: dinner' }, now));
  await write(houseDelivery(db, { message: 'MojoSOGO says: dinner', speakers: null }, now));
  // A sign-in notice (§6.6) and a mess ask (§7B.7): fire-less titled pushes that are not pings.
  await write(pushDelivery(db, { memberId, message: 'New sign-in', title: NOTICE_TITLE, notice: 'new_sign_in' }, now));
  await write(pushDelivery(db, { memberId, message: 'Was it you?', title: MESS_ASK_TITLE, messId: 'mes_dlv_test' }, now));
  expect(await opsPingsSince(db, now)).toBe(0);

  // A founder ping (§9.4).
  await write(pushDelivery(db, { memberId, message: 'build done', title: '🤖 Claude' }, now));
  expect(await opsPingsSince(db, now)).toBe(1);
  // Before `since` it is outside the window.
  expect(await opsPingsSince(db, '2099-01-01T00:00:00.001Z')).toBe(0);
});
