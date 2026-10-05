// M1-VOCAB â€” every SQL CHECK (... IN (...)) list in force must equal its vocab.ts tuple.
// This is the only test allowed to read SQL as text. It reads the MIGRATED schema
// (sqlite_master of env.DB, which test/apply-migrations.ts has migrated), so a table a
// later migration rebuilt or dropped is compared as it stands now (SPEC Â§3). Keyed by
// table.column: two tables may each have a `status` with different vocabularies.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import * as vocab from '../src/shared/vocab';

/** table.column â†’ the vocab tuple its CHECK list must match */
const EXPECTED: Record<string, readonly string[]> = {
  'members.role': vocab.ROLE,
  'fires.kind': vocab.ALERT_KIND,
  'fires.state': vocab.FIRE_STATE,
  'fires.close_reason': vocab.CLOSE_REASON,
  'deliveries.channel': vocab.CHANNEL,
  'deliveries.status': vocab.DELIVERY_STATUS,
  'chores.timing': vocab.CHORE_TIMING,
  'things.status': vocab.THING_STATUS,
  'events.start_sun': vocab.SUN_EVENT,
  'login_requests.status': vocab.LOGIN_REQUEST_STATUS,
  'deliveries.notice': vocab.NOTICE_KIND,
  'shows.kind': vocab.SHOW_KIND,
  'shows.status': vocab.SHOW_STATUS,
};

it('every CHECK IN-list in the migrated schema matches vocab.ts', async () => {
  const tables = await env.DB.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL").all<{ name: string; sql: string }>();
  const seen = new Set<string>();
  for (const { name, sql } of tables.results) {
    for (const [, column, list] of sql.matchAll(/CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/g)) {
      if (!list.includes("'")) continue; // numeric flags like is_alarm IN (0, 1) are not vocabularies
      const key = `${name}.${column}`;
      expect(EXPECTED[key], `no vocab mapping for CHECK on "${key}"`).toBeDefined();
      expect([...list.matchAll(/'([^']*)'/g)].map((m) => m[1]), `CHECK list for ${key}`).toEqual([...EXPECTED[key]]);
      seen.add(key);
    }
  }
  expect([...seen].sort()).toEqual(Object.keys(EXPECTED).sort());
});
