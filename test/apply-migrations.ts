import { applyD1Migrations, env } from 'cloudflare:test';

// Setup files run outside isolated storage, so migrations apply once per test file's database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
