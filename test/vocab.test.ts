// M1-VOCAB — every SQL CHECK (... IN (...)) list must equal its vocab.ts tuple.
// This is the only test allowed to read SQL as text.
import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';
import * as vocab from '../src/shared/vocab';

const sql = env.TEST_MIGRATIONS.flatMap((m) => m.queries).join('\n');

/** column → the vocab tuple its CHECK list must match */
const EXPECTED: Record<string, readonly string[]> = {
  role: vocab.ROLE,
  kind: vocab.ALERT_KIND,
  state: vocab.FIRE_STATE,
  close_reason: vocab.CLOSE_REASON,
  channel: vocab.CHANNEL,
  status: vocab.DELIVERY_STATUS,
  list: vocab.LIST,
};

it('every CHECK IN-list in the migrations matches vocab.ts', () => {
  const found = [...sql.matchAll(/CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/g)];
  expect(found.length).toBeGreaterThan(0);
  const seen = new Set<string>();
  for (const [, column, list] of found) {
    if (!list.includes("'")) continue; // numeric flags like is_alarm IN (0, 1) are not vocabularies
    const values = [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(EXPECTED[column], `no vocab mapping for CHECK on column "${column}"`).toBeDefined();
    expect(values, `CHECK list for ${column}`).toEqual([...EXPECTED[column]]);
    seen.add(column);
  }
  expect([...seen].sort()).toEqual(Object.keys(EXPECTED).sort());
});
