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
            RELAY_TOKEN: 'test-relay-token',
            DEV_ENDPOINTS: '1',
            // §7C.4 — pinned empty so a local .dev.vars key can never reach the real Anthropic API from a test.
            ANTHROPIC_API_KEY: '',
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
