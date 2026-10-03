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
