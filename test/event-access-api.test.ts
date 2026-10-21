// SPEC §6.3 "Who opens an event" (EO4–EO6) — through the real Worker: only the people going open the details.
import { beforeAll, describe, expect, it } from 'vitest';
import { Client, member, owner } from './helpers';
import { cannotOpenText } from '../src/shared/event-access';

let o: Client, a: Client, k: Client, A: string, K: string;
beforeAll(async () => {
  o = await owner();
  ({ client: a, id: A } = await member(o));
  ({ client: k, id: K } = await member(o));
});

const ev = (c: Client, assignedTo: string[]) => c.post('/events', { title: 'Dinner out', notes: 'Table for 3', startDate: '2030-03-07', startTime: '19:00', assignedTo });

describe('§6.3 who opens an event', () => {
  it('EO4 someone not going gets 403 on the details but still sees the summary', async () => {
    const e = (await ev(o, [A])).json;
    const r = await k.get(`/events/${e.id}`);
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'forbidden', message: cannotOpenText });
    const occ = (await k.get('/calendar?from=2030-03-07&to=2030-03-07')).json.occurrences.find((x: any) => x.eventId === e.id);
    expect(occ).toMatchObject({ title: 'Dinner out', startTime: '19:00', assignedTo: [A] });
    expect(occ.notes).toBeUndefined();
  });

  it('EO5 the people going, the creator and an admin open it', async () => {
    const byOwner = (await ev(o, [A])).json;
    expect((await a.get(`/events/${byOwner.id}`)).json.notes).toBe('Table for 3');
    expect((await o.get(`/events/${byOwner.id}`)).status).toBe(200);
    const byA = (await ev(a, [K])).json; // A made it for K only: A still opens it, and so does the admin
    expect((await a.get(`/events/${byA.id}`)).status).toBe(200);
    expect((await o.get(`/events/${byA.id}`)).status).toBe(200);
  });

  it('EO6 an event with nobody assigned is everyone\'s', async () => {
    const e = (await ev(o, [])).json;
    expect((await k.get(`/events/${e.id}`)).status).toBe(200);
  });

  it('NS1 (§8.4a) hasNotes only for an event with notes the member may open', async () => {
    const mine = (await ev(o, [K])).json, locked = (await ev(o, [A])).json;
    const bare = (await o.post('/events', { title: 'No notes', startDate: '2030-03-07', startTime: '08:00', assignedTo: [K] })).json;
    const occ = (await k.get('/calendar?from=2030-03-07&to=2030-03-07')).json.occurrences;
    const has = (id: string) => occ.find((x: any) => x.eventId === id).hasNotes;
    expect([has(mine.id), has(bare.id), has(locked.id)]).toEqual([true, false, false]);
  });
});
