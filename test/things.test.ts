// SPEC §7C — the pure thing rules (src/shared/things.ts). D2 and D11 are rows of §7C.5.
import { describe, expect, it } from 'vitest';
import {
  TITLE_MAX, canPlanOn, cleanPhotoReading, isStartReminder, openOrder, parseThingInput, planThingFires, plannedEventNotes,
  remindersFor, type ThingReminderSource,
} from '../src/shared/things';
import { localToUtc } from '../src/shared/time';

const TZ = 'America/Los_Angeles';
const fair: ThingReminderSource = { id: 'thg_1', status: 'idea', window_start: '2026-10-10', remind_start: 1, remind_on: '2026-10-15' };

describe('parseThingInput (§7C.1)', () => {
  const ok = { title: 'Fall fair', windowStart: '2026-10-10', windowEnd: '2026-10-20' };

  it('normalizes a thing: trimmed title, empty → null, push by default', () => {
    expect(parseThingInput({ ...ok, title: '  Fall fair ', note: '', place: null })).toEqual({
      title: 'Fall fair', note: null, place: null, url: null, window_start: '2026-10-10', window_end: '2026-10-20',
      remind_start: false, remind_on: null, channels: ['push'],
    });
  });

  it('D2 window end before start; link ftp://x; empty title → a message naming the field', () => {
    expect(parseThingInput({ ...ok, windowEnd: '2026-10-09' })).toMatch(/windowEnd/);
    expect(parseThingInput({ ...ok, url: 'ftp://x' })).toMatch(/url/);
    expect(parseThingInput({ ...ok, title: '' })).toMatch(/title/);
    expect(parseThingInput({ ...ok, title: 'x'.repeat(TITLE_MAX + 1) })).toMatch(/title/);
  });

  it('limits, dates, reminders and channels', () => {
    expect(parseThingInput({ ...ok, note: 'x'.repeat(2001) })).toMatch(/note/);
    expect(parseThingInput({ ...ok, place: 'x'.repeat(201) })).toMatch(/place/);
    expect(parseThingInput({ ...ok, url: `https://x.com/${'x'.repeat(500)}` })).toMatch(/url/);
    expect(parseThingInput({ ...ok, remindOn: '2026-02-30' })).toMatch(/remindOn/);
    expect(parseThingInput({ title: 'Any time', remindStart: true })).toMatch(/remindStart/);
    expect(parseThingInput({ ...ok, remindOn: '2026-10-15', channels: [] })).toMatch(/channels/);
    expect(parseThingInput({ ...ok, channels: ['fax'] })).toMatch(/channels/);
    expect(parseThingInput({ ...ok, status: 'maybe' })).toMatch(/status/);
    expect(parseThingInput({ ...ok, channels: [] })).toMatchObject({ channels: [] }); // no reminder → none needed
    expect(parseThingInput({ ...ok, url: 'HTTPS://example.com/fair', channels: ['house', 'push'] }))
      .toMatchObject({ url: 'HTTPS://example.com/fair', channels: ['push', 'house'] });
    expect(parseThingInput({ title: 'Until', windowEnd: '2026-11-05' })).toMatchObject({ window_start: null, window_end: '2026-11-05' });
  });
});

describe('reminders (§7C.2)', () => {
  it('remindersFor: the start date and the picked date, in date order; one per date', () => {
    expect(remindersFor(fair)).toEqual([{ date: '2026-10-10', start: true }, { date: '2026-10-15', start: false }]);
    expect(remindersFor({ ...fair, remind_on: '2026-10-10' })).toEqual([{ date: '2026-10-10', start: true }]);
    expect(remindersFor({ ...fair, remind_start: 0, remind_on: null })).toEqual([]);
  });

  it('isStartReminder only on window_start with remind_start on', () => {
    expect(isStartReminder(fair, '2026-10-10')).toBe(true);
    expect(isStartReminder(fair, '2026-10-15')).toBe(false);
    expect(isStartReminder({ ...fair, remind_start: 0 }, '2026-10-10')).toBe(false);
  });

  it('planThingFires: 09:00 local, inside [from, to), idempotent', () => {
    const from = '2026-10-10T00:00:00.000Z', to = '2026-10-11T12:00:00.000Z';
    const fires = planThingFires(fair, TZ, from, to);
    expect(fires).toEqual([expect.objectContaining({
      kind: 'thing', thing_id: 'thg_1', occurrence_date: '2026-10-10', due_at: localToUtc('2026-10-10', '09:00', TZ), state: 'scheduled',
    })]);
    expect(planThingFires(fair, TZ, from, to)).toEqual(fires);
    // `from` is inclusive: a tick exactly at 09:00 plans (and then rings) it.
    expect(planThingFires(fair, TZ, '2026-10-10T16:00:00.000Z', to)).toHaveLength(1);
    expect(planThingFires(fair, TZ, '2026-10-10T16:00:01.000Z', to)).toEqual([]);
  });

  it('only ideas have reminders', () => {
    const window = ['2026-10-10T00:00:00.000Z', '2026-10-20T00:00:00.000Z'] as const;
    expect(planThingFires(fair, TZ, ...window)).toHaveLength(2);
    for (const status of ['planned', 'done', 'dropped'] as const) expect(planThingFires({ ...fair, status }, TZ, ...window)).toEqual([]);
  });
});

describe('Plan it and order (§7C.2, §10)', () => {
  it('canPlanOn: inside the window; any date for any time; real dates only', () => {
    const w = { window_start: '2026-10-10', window_end: '2026-10-20' };
    expect(canPlanOn(w, '2026-10-14')).toBe(true);
    expect(canPlanOn(w, '2026-10-10')).toBe(true);
    expect(canPlanOn(w, '2026-10-20')).toBe(true);
    expect(canPlanOn(w, '2026-10-25')).toBe(false);
    expect(canPlanOn(w, '2026-10-09')).toBe(false);
    expect(canPlanOn({ window_start: null, window_end: null }, '2030-01-01')).toBe(true);
    expect(canPlanOn({ window_start: null, window_end: '2026-11-05' }, '2026-11-06')).toBe(false);
    expect(canPlanOn({ window_start: null, window_end: null }, '2026-02-30')).toBe(false);
  });

  it('plannedEventNotes: note, place, link — the note is cut so place and link fit', () => {
    expect(plannedEventNotes({ note: 'Bring cash', place: 'Fairgrounds', url: 'https://fair.example' }))
      .toBe('Bring cash\nFairgrounds\nhttps://fair.example');
    expect(plannedEventNotes({ note: null, place: null, url: null })).toBeNull();
    const long = plannedEventNotes({ note: 'n'.repeat(2000), place: 'P', url: 'https://u' })!;
    expect(long).toHaveLength(2000);
    expect(long.endsWith('\nP\nhttps://u')).toBe(true);
  });

  it('openOrder: soonest window end first; open-ended and any-time last', () => {
    const t = (title: string, windowEnd: string | null) => ({ title, windowEnd });
    expect(openOrder([t('any', null), t('nov', '2026-11-05'), t('oct', '2026-10-20'), t('also any', null)]).map((x) => x.title))
      .toEqual(['oct', 'nov', 'also any', 'any']);
  });
});

describe('cleanPhotoReading (§7C.4)', () => {
  it('D11 invalid date dropped, dates swapped, javascript: link dropped, title cut to 120', () => {
    const today = '2026-10-03';
    expect(cleanPhotoReading({ title: 'T'.repeat(300), startDate: '2026-02-30', endDate: '2026-10-12', url: 'javascript:alert(1)', place: ' ', note: null }, today))
      .toEqual({ title: 'T'.repeat(120), startDate: null, endDate: '2026-10-12', place: null, url: null, note: null });
    expect(cleanPhotoReading({ title: 'Fair', startDate: '2026-10-20', endDate: '2026-10-10', url: 'https://fair.example', place: 'Fairgrounds', note: 'Cash only' }, today))
      .toEqual({ title: 'Fair', startDate: '2026-10-10', endDate: '2026-10-20', place: 'Fairgrounds', url: 'https://fair.example', note: 'Cash only' });
  });

  it('anything not a string is null; a missing answer is all nulls', () => {
    expect(cleanPhotoReading({ title: 42, startDate: 'Oct 12', url: ['x'] }, '2026-10-03'))
      .toEqual({ title: null, startDate: null, endDate: null, place: null, url: null, note: null });
    expect(cleanPhotoReading(null, '2026-10-03')).toEqual({ title: null, startDate: null, endDate: null, place: null, url: null, note: null });
  });
});
