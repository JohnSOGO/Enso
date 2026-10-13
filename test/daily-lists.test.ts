// M4ah acceptance — every day lists and Ping owners (SPEC §7A.4, DL1–DL11; DL-M is migration-0050.test.ts) + the pure rules.
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { Client, member, owner, tickAt } from './helpers';
import { PING_LATE_MIN, dailyOrder, listPingTitle, pingDue, todaysItems } from '../src/shared/lists';
import { addMinutes, dayStartUtc, localToUtc } from '../src/shared/time';
import { opsPingsAfter } from '../src/worker/deliveries';

describe('every day list rules (pure)', () => {
  it('todaysItems reads a tick from before today as open, nothing else', () => {
    const items = [{ id: 'a', checked_at: '2026-10-13T06:59:00.000Z' }, { id: 'b', checked_at: '2026-10-13T07:00:00.000Z' }, { id: 'c', checked_at: null }];
    expect(todaysItems(items, '2026-10-13T07:00:00.000Z').map((i) => i.checked_at)).toEqual([null, '2026-10-13T07:00:00.000Z', null]);
  });
  it('dailyOrder: timed first, earliest first, then the rest as given', () => {
    expect(dailyOrder([{ id: 'a', time: null }, { id: 'b', time: '18:00' }, { id: 'c', time: '07:30' }]).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
  it(`pingDue: at or past the time, under ${PING_LATE_MIN} minutes late`, () => {
    expect(pingDue('08:00', '07:59')).toBe(false);
    expect(pingDue('08:00', '08:00')).toBe(true);
    expect(pingDue('08:00', '08:59')).toBe(true);
    expect(pingDue('08:00', '09:00')).toBe(false);
  });
  it('listPingTitle is the list emoji and name', () => {
    expect(listPingTitle({ name: 'Reminders', emoji: null })).toBe('📋 Reminders');
    expect(listPingTitle({ name: 'Reminders', emoji: '⏰' })).toBe('⏰ Reminders');
  });
  it('dayStartUtc is local midnight', () => {
    expect(dayStartUtc('2026-10-13T15:00:00.000Z', 'America/Los_Angeles')).toBe('2026-10-13T07:00:00.000Z');
  });
});

describe('M4ah every day lists API (§7A.4)', () => {
  let o: Client;
  let list: string;
  let tz: string;
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM deliveries; DELETE FROM list_items; DELETE FROM lists WHERE created_by IS NOT NULL');
    o = await owner();
    tz = (await env.DB.prepare('SELECT timezone FROM settings WHERE id = 1').first<{ timezone: string }>())!.timezone;
    list = (await o.post('/lists', { name: 'Reminders' })).json.id;
  });
  const setList = (b: object) => o.patch(`/lists/${list}`, { name: 'Reminders', ...b });
  const add = async (text: string, extra: object = {}) => (await o.post(`/lists/${list}/items`, { text, ...extra })).json;
  const view = async () => (await o.get(`/lists/${list}`)).json;
  const checkAt = (id: string, at: string) => env.DB.prepare('UPDATE list_items SET checked_at = ?, checked_by = NULL WHERE id = ?').bind(at, id).run();
  const yesterday = () => addMinutes(dayStartUtc(new Date().toISOString(), tz), -60);
  const pings = async () => (await env.DB.prepare(
    `SELECT member_id, channel, title, message, list_item_id FROM deliveries ORDER BY member_id`).all<any>()).results;

  it('DL1 daily and pingOwners are list settings', async () => {
    const r = await setList({ daily: true, pingOwners: true });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ daily: true, pingOwners: true });
    expect((await o.get('/lists')).json.find((l: any) => l.id === list)).toMatchObject({ daily: true, pingOwners: true });
    expect((await view()).list).toMatchObject({ daily: true, pingOwners: true });
    expect((await setList({ daily: 'yes' })).status).toBe(400);
    expect((await setList({})).json).toMatchObject({ daily: true, pingOwners: true }); // absent = unchanged
  });

  it('DL2 an item time: HH:MM, refused otherwise, null clears', async () => {
    const a = await add('Meds', { time: '08:00' });
    expect(a.item.time).toBe('08:00');
    expect((await o.post(`/lists/${list}/items`, { text: 'Walk', time: '8am' })).status).toBe(400);
    expect((await o.patch(`/list-items/${a.item.id}`, { time: '25:00' })).status).toBe(400);
    expect((await o.patch(`/list-items/${a.item.id}`, { time: null })).json.time).toBeNull();
  });

  it('DL3 every day list: ticked yesterday is open again, counted, and adding it is existing', async () => {
    await setList({ daily: true });
    const a = await add('Meds');
    await checkAt(a.item.id, yesterday());
    const v = await view();
    expect(v.open.map((i: any) => i.id)).toEqual([a.item.id]);
    expect(v.checked).toEqual([]);
    expect((await o.get('/lists')).json.find((l: any) => l.id === list).openCount).toBe(1);
    expect((await o.post(`/lists/${list}/items`, { text: 'meds' })).json.result).toBe('existing');
  });

  it('DL4 every day list: ticked today is in checked; adding it re-opens', async () => {
    await setList({ daily: true });
    const a = await add('Meds');
    await o.patch(`/list-items/${a.item.id}`, { checked: true });
    expect((await view()).checked.map((i: any) => i.id)).toEqual([a.item.id]);
    expect((await o.post(`/lists/${list}/items`, { text: 'meds' })).json.result).toBe('reopened');
  });

  it('DL5 a list that is not every day keeps yesterday\'s tick', async () => {
    const a = await add('Meds');
    await checkAt(a.item.id, yesterday());
    expect((await view()).checked.map((i: any) => i.id)).toEqual([a.item.id]);
  });

  it('DL6 every day list order: timed earliest first, then the rest', async () => {
    await setList({ daily: true });
    const b = await add('B', { time: '18:00' });
    const c = await add('C', { time: '07:30' });
    const a = await add('A');
    expect((await view()).open.map((i: any) => i.id)).toEqual([c.item.id, b.item.id, a.item.id]);
  });

  describe('Ping owners (tick)', () => {
    const day = '2026-10-20';
    const at = (hhmm: string) => localToUtc(day, hhmm, tz);

    it('DL7 + DL8 at its time, one push to the owner, once', async () => {
      const m = await member(o);
      await setList({ daily: true, pingOwners: true });
      const a = await add('Take meds', { time: '08:00', assigneeId: m.id });
      await tickAt(o, at('07:59'));
      expect(await pings()).toEqual([]);
      await tickAt(o, at('08:00'));
      expect(await pings()).toEqual([{ member_id: m.id, channel: 'push', title: '📋 Reminders', message: 'Take meds', list_item_id: a.item.id }]);
      await tickAt(o, at('08:05'));
      expect(await pings()).toHaveLength(1);
    });

    it('DL9 no owner (or a disabled one) → every active member', async () => {
      const m = await member(o);
      const gone = await member(o);
      await env.DB.prepare('UPDATE members SET disabled_at = ? WHERE id = ?').bind(at('00:00'), gone.id).run();
      await setList({ daily: true, pingOwners: true });
      await add('Trash out', { time: '08:00' });
      await tickAt(o, at('08:00'));
      const active = (await env.DB.prepare('SELECT id FROM members WHERE disabled_at IS NULL ORDER BY id').all<{ id: string }>()).results.map((r) => r.id);
      expect(active).toContain(m.id);
      expect((await pings()).map((p: any) => p.member_id)).toEqual(active);
    });

    it('DL10 no ping when ticked today, Ping owners off, not every day, or too late', async () => {
      await setList({ daily: true, pingOwners: true });
      const a = await add('Ticked', { time: '08:00' });
      await checkAt(a.item.id, at('07:00'));
      await add('Late', { time: '07:00' });
      await tickAt(o, at('08:00'));
      expect(await pings()).toEqual([]);
      await checkAt(a.item.id, at('06:00'));
      await env.DB.exec("UPDATE list_items SET time = NULL WHERE text = 'Late'");
      await setList({ daily: true, pingOwners: false });
      await tickAt(o, at('08:01'));
      await setList({ daily: false, pingOwners: true });
      await tickAt(o, at('08:02'));
      expect(await pings()).toEqual([]);
    });

    it('DL11 list pings are not founder pings: not counted, not on the FunHouse', async () => {
      await setList({ daily: true, pingOwners: true });
      const me = (await o.get('/me')).json.id;
      await add('Meds', { time: '08:00', assigneeId: me });
      await tickAt(o, at('08:00'));
      expect(await pings()).toHaveLength(1);
      expect(await opsPingsAfter(env.DB, null, at('00:00'), 50)).toEqual([]);
      const now = new Date().toISOString();
      const item = (await env.DB.prepare('SELECT id FROM list_items LIMIT 1').first<{ id: string }>())!.id;
      await env.DB.batch(Array.from({ length: 30 }, (_, i) => env.DB.prepare(
        `INSERT INTO deliveries (id, alert_number, channel, member_id, message, title, list_item_id, status, created_at, updated_at)
         VALUES (?, 1, 'push', ?, 'x', '📋 Reminders', ?, 'failed', ?, ?)`).bind(`dlv_dl11_${i}`, me, item, now, now)));
      const r = await new Client().post('/ops/notify', { text: 'still pings' }, { authorization: 'Bearer test-ops-token' });
      expect(r.status, JSON.stringify(r.json)).toBe(201);
    });
  });
});
