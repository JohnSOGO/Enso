// SPEC §7.5, §4.2zze WM1–WM2 — Weather and Moon phases as optional calendar items: on by default, each person's own.
import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { owner } from './helpers';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

describe('WM1 migration 0058', () => {
  it('an existing member gets both switches on', async () => {
    const db = env.MIGRATION_DB;
    const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0058'));
    expect(at).toBeGreaterThan(0);
    await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at));
    await db.prepare(`INSERT INTO members (id, email, display_name, color, role, password_hash, created_at) VALUES ('mem_w', 'w@x', 'W', '#123456', 'owner', 'x', '2026-10-01T04:00:00.000Z')`).run();
    await db.prepare(`INSERT INTO member_prefs (member_id) VALUES ('mem_w')`).run();
    await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
    expect(await db.prepare(`SELECT show_weather, show_moon FROM member_prefs WHERE member_id = 'mem_w'`).first()).toEqual({ show_weather: 1, show_moon: 1 });
  });
});

describe('WM2 PATCH /me { showWeather, showMoon }', () => {
  it('starts on, saves a boolean for this member, refuses anything else', async () => {
    const A = await owner();
    const me = (await A.get('/me')).json;
    expect([me.showWeather, me.showMoon]).toEqual([1, 1]);
    const off = (await A.patch('/me', { showWeather: false, showMoon: false })).json;
    expect([off.showWeather, off.showMoon]).toEqual([0, 0]);
    expect((await A.patch('/me', { showMoon: 'no' })).status).toBe(400);
    expect((await A.get('/me')).json.showMoon).toBe(0);
  });
});
