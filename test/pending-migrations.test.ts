// SPEC §10.1 DG1–DG3 — the deploy gate refuses while a migration is pending, and fails closed.
import { describe, expect, it } from 'vitest';
import { deployGate } from '../scripts/pending-migrations';

describe('deployGate', () => {
  it('DG1 "No migrations to apply" → clear', () => {
    expect(deployGate('⛅️ wrangler 4.40.0\n✅ No migrations to apply!')).toEqual({ ok: true });
  });
  it('DG2 a pending listing → refuse, naming the file and the migrate command', () => {
    const g = deployGate('Migrations to be applied:\n┌──────────────────────────┐\n│ name                     │\n│ 0051_timer_away_day.sql  │\n└──────────────────────────┘');
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.message).toContain('0051_timer_away_day.sql');
      expect(g.message).toContain('npm run db:migrate:remote');
      expect(g.message).toContain('npx wrangler deploy');
    }
  });
  it('DG3 an error or empty text → refuse', () => {
    expect(deployGate('✘ [ERROR] A request to the Cloudflare API failed.').ok).toBe(false);
    expect(deployGate('').ok).toBe(false);
  });
});
