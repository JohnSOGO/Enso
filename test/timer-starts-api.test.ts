// SPEC §5.5a TS3–TS5 — the start announcement through the API and the tick.
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { member, owner, tickAt } from './helpers';
import { localToUtc } from '../src/shared/time';
import { ANNOUNCE_NEEDS_WINDOW } from '../src/shared/timer-start';

const TZ = 'America/Los_Angeles';
const L = (time: string, date = '2026-10-06') => localToUtc(date, time, TZ);
const base = { intervalMin: 60, channels: ['push', 'house'], activeFrom: '08:00', activeTo: '21:00' };
const said = async (message: string) =>
  (await env.DB.prepare('SELECT * FROM deliveries WHERE message = ? ORDER BY channel').bind(message).all<any>()).results;

describe('timer start announcement (§5.5a)', () => {
  it('TS3 announceStart needs a window; it shows in the view; clearing the window of an announcing timer is refused', async () => {
    const o = await owner();
    const none = await o.post('/timers', { title: 'No day', intervalMin: 60, channels: ['push'], announceStart: true });
    expect(none.status).toBe(400);
    expect(none.json.message).toBe(ANNOUNCE_NEEDS_WINDOW);
    expect((await o.post('/timers', { ...base, title: 'Plain' })).json.announceStart).toBe(false);
    const t = await o.post('/timers', { ...base, title: 'Squats', announceStart: true });
    expect(t.status).toBe(201);
    expect(t.json.announceStart).toBe(true);
    expect((await o.get('/timers')).json.find((x: any) => x.id === t.json.id).announceStart).toBe(true);
    expect((await o.patch(`/timers/${t.json.id}`, { activeFrom: null, activeTo: null })).status).toBe(400);
    expect((await o.patch(`/timers/${t.json.id}`, { activeFrom: null, activeTo: null, announceStart: false })).status).toBe(200);
    expect((await o.patch(`/timers/${t.json.id}`, { announceStart: 'yes' })).status).toBe(400);
  });

  it('TS4 the tick at the opening announces once, on the timer\'s channels, to everyone', async () => {
    const o = await owner();
    await member(o);
    const t = await o.post('/timers', { ...base, title: 'Pushups', announceStart: true });
    await o.post(`/timers/${t.json.id}/commands`, { cmd: 'start' });
    const words = 'Pushups timer started — every 60 minutes';
    await tickAt(o, L('07:59', '2026-10-07'));
    expect(await said(words)).toHaveLength(0);
    await tickAt(o, L('08:01', '2026-10-07'));
    const rows = await said(words);
    const active = (await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE disabled_at IS NULL').first<any>()).n;
    expect(rows.filter((d: any) => d.channel === 'push')).toHaveLength(active);
    expect(rows.filter((d: any) => d.channel === 'house')).toHaveLength(1);
    for (const d of rows) expect(d).toMatchObject({ fire_id: null, title: null, alert_number: 1 });
    const row = await env.DB.prepare('SELECT announced_on FROM timers WHERE id = ?').bind(t.json.id).first<any>();
    expect(row.announced_on).toBe('2026-10-07');
    await tickAt(o, L('08:02', '2026-10-07'));
    expect(await said(words)).toHaveLength(rows.length);
    await o.post(`/timers/${t.json.id}/commands`, { cmd: 'stop' });
  });

  it('TS5 too late, stopped, or not announcing: nothing', async () => {
    const o = await owner();
    const late = await o.post('/timers', { ...base, title: 'Late', announceStart: true });
    await o.post(`/timers/${late.json.id}/commands`, { cmd: 'start' });
    const stopped = await o.post('/timers', { ...base, title: 'Stopped', announceStart: true });
    const quiet = await o.post('/timers', { ...base, title: 'Quiet' });
    await o.post(`/timers/${quiet.json.id}/commands`, { cmd: 'start' });
    await tickAt(o, L('09:30', '2026-10-08'));
    for (const title of ['Late', 'Stopped']) expect(await said(`${title} timer started — every 60 minutes`)).toHaveLength(0);
    await tickAt(o, L('08:10', '2026-10-09'));
    expect(await said('Stopped timer started — every 60 minutes')).toHaveLength(0);
    expect(await said('Quiet timer started — every 60 minutes')).toHaveLength(0);
    expect(await said('Late timer started — every 60 minutes')).not.toHaveLength(0); // the next day it does
    for (const id of [late.json.id, quiet.json.id]) await o.post(`/timers/${id}/commands`, { cmd: 'stop' });
    expect(stopped.status).toBe(201);
  });
});
