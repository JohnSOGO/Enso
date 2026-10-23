// SPEC §6.3 "Who opens an event" (EO1–EO3) and "Private events" (PV1) — the pure rules.
import { describe, expect, it } from 'vitest';
import { canOpenEvent, isMaskedFor, maskOccurrence, PRIVATE_COLOR, PRIVATE_TITLE } from '../src/shared/event-access';
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

describe('private events (pure)', () => {
  it('PV1 masked only for a private event the viewer may not open', () => {
    const adultsOnly = { assignedTo: ['mem_p', 'mem_q'], createdBy: 'mem_p' };
    expect(isMaskedFor({ ...adultsOnly, private: true }, kid)).toBe(true);
    expect(isMaskedFor({ ...adultsOnly, private: false }, kid)).toBe(false);
    expect(isMaskedFor({ ...adultsOnly, private: true }, parent)).toBe(false);
    expect(isMaskedFor({ assignedTo: ['mem_k'], createdBy: 'mem_p', private: true }, kid)).toBe(false);
    const o = { date: '2030-03-07', startTime: '19:00', endTime: '22:00', title: 'Date night', emoji: '🍷', assignedTo: ['mem_p'], createdBy: 'mem_p',
      color: '#FF6B35', creatorName: 'Mom', hasReminder: true, hasNotes: true, recurring: true };
    expect(maskOccurrence(o)).toEqual({ date: '2030-03-07', startTime: '19:00', endTime: '22:00', title: PRIVATE_TITLE, emoji: null, assignedTo: [],
      createdBy: null, color: PRIVATE_COLOR, creatorName: '', hasReminder: false, hasNotes: false, recurring: false, masked: true });
  });
});
