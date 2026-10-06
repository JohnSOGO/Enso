// SPEC §6.3 — what a member's role allows (pure).
import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, canChange, isAdmin } from '../src/shared/roles';

describe('role rules (pure)', () => {
  const admin = { id: 'mem_a', role: 'owner' as const }, m = { id: 'mem_m', role: 'member' as const };

  it('canChange: creator or admin; no creator (a seeded list) admins only', () => {
    expect(canChange('mem_m', m)).toBe(true);
    expect(canChange('mem_x', m)).toBe(false);
    expect(canChange('mem_x', admin)).toBe(true);
    expect(canChange(null, m)).toBe(false);
    expect(canChange(null, admin)).toBe(true);
  });

  it('isAdmin: role owner reads Admin; ADMIN_ROLE is that role', () => {
    expect(ADMIN_ROLE).toBe('owner');
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(m)).toBe(false);
  });
});
