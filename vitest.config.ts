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
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
