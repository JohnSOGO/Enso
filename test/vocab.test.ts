// M1-VOCAB — every SQL CHECK (... IN (...)) list in force must equal its vocab.ts tuple.
// This is the only test allowed to read SQL as text. It reads the MIGRATED schema
// (sqlite_master of env.DB, which test/apply-migrations.ts has migrated), so a table a
// later migration rebuilt or dropped is compared as it stands now (SPEC §3).
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import * as vocab from '../src/shared/vocab';

/** column → the vocab tuple its CHECK list must match */
const EXPECTED: Record<string, readonly string[]> = {
  role: vocab.ROLE,
  kind: vocab.ALERT_KIND,
  state: vocab.FIRE_STATE,
  close_reason: vocab.CLOSE_REASON,
  channel: vocab.CHANNEL,
  status: vocab.DELIVERY_STATUS,
  timing: vocab.CHORE_TIMING,
};

it('every CHECK IN-list in the migrated schema matches vocab.ts', async () => {
  const tables = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL").all<{ sql: string }>();
  const sql = tables.results.map((t) => t.sql).join('\n');
  const found = [...sql.matchAll(/CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/g)];
  expect(found.length).toBeGreaterThan(0);
  const columns = new Set<string>();
  for (const [, column, list] of found) {
    if (!list.includes("'")) continue; // numeric flags like is_alarm IN (0, 1) are not vocabularies
    expect(EXPECTED[column], `no vocab mapping for CHECK on column "${column}"`).toBeDefined();
    expect([...list.matchAll(/'([^']*)'/g)].map((m) => m[1]), `CHECK list for ${column}`).toEqual([...EXPECTED[column]]);
    columns.add(column);
  }
  expect([...columns].sort()).toEqual(Object.keys(EXPECTED).sort());
});
