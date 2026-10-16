// SPEC §6.3 "Who opens an event" (EO1–EO3) — the pure rule.
import { describe, expect, it } from 'vitest';
import { canOpenEvent } from '../src/shared/event-access';
import { canChange } from '../src/shared/roles';

const kid = { id: 'mem_k', admin: false }, parent = { id: 'mem_p', admin: true };

describe('who opens an event (pure)', () => {
  it('EO1 nobody assigned, assigned, creator or admin may open it', () => {
    expect(canOpenEvent({ assignedTo: [], createdBy: 'mem_x' }, kid)).toBe(true);
    expect(canOpenEvent({ assignedTo: ['mem_k'], createdBy: 'mem_x' }, kid)).toBe(true);
    expect(canOpenEvent({ assignedTo: ['mem_x'], createdBy: 'mem_k' }, kid)).toBe(true);
    expect(canOpenEvent({ assignedTo: ['mem_x'], createdBy: 'mem_x' }, parent)).toBe(true);
  });

  it('EO2 anyone else may not', () => {
    expect(canOpenEvent({ assignedTo: ['mem_x', 'mem_y'], createdBy: 'mem_x' }, kid)).toBe(false);
  });

  it('EO3 whoever may change an event may open it', () => {
    for (const createdBy of ['mem_k', 'mem_x', null]) for (const assignedTo of [[], ['mem_x'], ['mem_k']]) for (const v of [kid, parent]) {
      if (canChange(createdBy, { id: v.id, role: v.admin ? 'owner' : 'member' })) expect(canOpenEvent({ assignedTo, createdBy }, v)).toBe(true);
    }
  });
});
