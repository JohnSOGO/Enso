// MU-M (SPEC §4.2zzo) — 0068 adds model_calls: a row with only the required columns takes the defaults.
import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

declare global {
  namespace Cloudflare {
    interface Env { MIGRATION_DB: D1Database }
  }
}

it('0068 adds model_calls with zero counts by default', async () => {
  const db = env.MIGRATION_DB;
  const at = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith('0068'));
  expect(at).toBeGreaterThan(0);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, at + 1));
  await db.prepare(`INSERT INTO model_calls (at, feature, provider, model, ok) VALUES ('T', 'say', 'anthropic', 'm', 1)`).run();
  expect(await db.prepare('SELECT id, ms, input_tokens, web_searches, audio_seconds, audio_bytes FROM model_calls').first())
    .toEqual({ id: 1, ms: 0, input_tokens: 0, web_searches: 0, audio_seconds: null, audio_bytes: 0 });
});
