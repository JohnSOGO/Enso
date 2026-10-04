import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import { scan } from './scripts/arch.ts';

export default defineConfig(async () => {
  // The real migrations folder — tests never carry their own copy of the schema.
  const migrations = await readD1Migrations(path.resolve('migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // SPEC §2.5 — the source tree measured in Node; test/architecture.test.ts asserts on it.
            ARCH: JSON.parse(JSON.stringify(scan(path.resolve('.')))),
            SETUP_TOKEN: 'test-setup-token',
            DEV_ENDPOINTS: '1',
            // §7C.4 — pinned empty so a local .dev.vars key can never reach the real Anthropic API from a test.
            ANTHROPIC_API_KEY: '',
            // §7E — pinned empty too: no test reaches the real YouTube API (recipe tests set a fake key per call).
            YOUTUBE_API_KEY: '',
            // §7E.2c — a TEST-ONLY bearer for the SogoAI helper and a fake host. With CF_ACCESS_* empty
            // (below) captions from home are not configured; test/home-captions.test.ts and the from-video
            // tests override per call, with a fetch spy answering https://sogoai.test.
            CAPTIONS_TOKEN: 'test-captions-token',
            HOME_CAPTIONS_URL: 'https://sogoai.test',
            // §9.4 — a TEST-ONLY bearer for POST /ops/notify; test/ops.test.ts overrides it (empty) per call.
            OPS_NOTIFY_TOKEN: 'test-ops-token',
            // §9.2 — pinned so a test can never speak in the real house: a fake host, and the secrets
            // empty (House is then not configured). test/house.test.ts overrides them per call, with a
            // fetch spy answering https://ha.test.
            HA_URL: 'https://ha.test',
            HA_TOKEN: '',
            CF_ACCESS_CLIENT_ID: '',
            CF_ACCESS_CLIENT_SECRET: '',
            // §9.1 — a TEST-ONLY VAPID keypair (generated once for the suite, signs nothing real), so the
            // production key never signs in a test. test/push.test.ts never lets a push leave the isolate.
            VAPID_PUBLIC_KEY: 'BLGCPcQjOX27VgoqsiHeYtez_W8_HKCafPsFXE5T6QR57UKLYhGF-6BlOWhEzHJSabBTOuhbU-vwJz_lkh3JyY8',
            VAPID_PRIVATE_KEY: 'oHFJb1nU31AUYrn6RZYi_221HJDr_1-9RDnb5QgP348',
            VAPID_SUBJECT: 'https://enso.test',
          },
          // C13 (SPEC §4.2e): an UNMIGRATED database the migration test applies step by step.
          d1Databases: { MIGRATION_DB: 'migration-db' },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
