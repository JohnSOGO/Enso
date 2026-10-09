// SPEC §7.8 EP4–EP6, §7.9a EU1–EU5 — the reading's pure rules: cleanEventReading, readingToForm and readingOverForm.
import { describe, expect, it } from 'vitest';
import { cleanEventReading, readingOverForm, readingToForm, type EventFill, type EventReading } from '../src/shared/event-reading';
import { ALERT_TITLE_MAX } from '../src/shared/alert-limits';

const none: EventReading = { title: null, startDate: null, endDate: null, startTime: null, endTime: null, location: null, notes: null };
const opened: EventFill = { title: '', date: '2026-10-06', allDay: false, startTime: '09:00', endTime: '', endDate: '2026-10-06', address: '', notes: '' };

describe('§7.8 cleanEventReading (EP4)', () => {
  it('drops unreal dates and times, swaps reversed dates, drops a lone end time, cuts the title', () => {
    expect(cleanEventReading({ startDate: '2026-02-30', endDate: '2026-03-01' }, '2026-10-06'))
      .toEqual({ ...none, endDate: '2026-03-01' });
    expect(cleanEventReading({ startDate: '2026-10-20', endDate: '2026-10-10' }, '2026-10-06'))
      .toMatchObject({ startDate: '2026-10-10', endDate: '2026-10-20' });
    expect(cleanEventReading({ startTime: '25:00', endTime: '16:00' }, '2026-10-06')).toMatchObject({ startTime: null, endTime: null });
    expect(cleanEventReading({ startTime: '14:00', endTime: '4pm' }, '2026-10-06')).toMatchObject({ startTime: '14:00', endTime: null });
    expect(cleanEventReading({ title: 'x'.repeat(300), notes: '  ', location: 7 }, '2026-10-06'))
      .toEqual({ ...none, title: 'x'.repeat(ALERT_TITLE_MAX) });
    expect(cleanEventReading(null, '2026-10-06')).toEqual(none);
  });
});

describe('§7.8 readingToForm (EP5, EP6)', () => {
  it('EP5 a timed reading sets the times; a date-only one is all day; a multi-day one keeps its end; the location fills the address', () => {
    const timed = readingToForm(opened, opened, { ...none, title: 'Party', startDate: '2026-10-17', startTime: '14:00', endTime: '16:00' });
    expect(timed.form).toEqual({ ...opened, title: 'Party', date: '2026-10-17', startTime: '14:00', endTime: '16:00', endDate: '2026-10-17' });
    expect(timed.filled).toBe(5);
    const day = readingToForm(opened, opened, { ...none, startDate: '2026-10-17' });
    expect(day.form).toMatchObject({ date: '2026-10-17', allDay: true, endDate: '2026-10-17' });
    const multi = readingToForm(opened, opened, { ...none, startDate: '2026-10-10', endDate: '2026-10-12' });
    expect(multi.form).toMatchObject({ date: '2026-10-10', allDay: true, endDate: '2026-10-12' });
    const notes = readingToForm(opened, opened, { ...none, location: 'Sky Zone, 3030 Plaza Bonita Rd', notes: 'RSVP to Jen' });
    expect(notes.form.address).toBe('Sky Zone, 3030 Plaza Bonita Rd');
    expect(notes.form.notes).toBe('RSVP to Jen');
    expect(notes.filled).toBe(2);
    expect(readingToForm(opened, opened, none)).toEqual({ form: opened, filled: 0 });
  });

  it('EP6 fields the person changed are kept; only filled fields are counted', () => {
    const typed = { ...opened, title: 'Mia party', date: '2026-10-18', endDate: '2026-10-18' };
    const r = readingToForm(typed, opened, { ...none, title: 'Birthday', startDate: '2026-10-17', startTime: '14:00', notes: 'Bring socks' });
    expect(r.form).toEqual({ ...typed, startTime: '14:00', notes: 'Bring socks' });
    expect(r.filled).toBe(2);
  });

  it('keeps extra form fields untouched', () => {
    const form = { ...opened, emoji: '🎂' };
    expect(readingToForm(form, opened, { ...none, title: 'Party' }).form).toEqual({ ...form, title: 'Party' });
  });
});

describe('§7.9a readingOverForm — an existing event updated from later info', () => {
  const timed: EventFill = { title: 'Mia party', date: '2026-10-17', allDay: false, startTime: '14:00', endTime: '16:00', endDate: '2026-10-17', address: 'Sky Zone', notes: 'Bring socks' };
  const allDay: EventFill = { ...timed, allDay: true, startTime: '09:00', endTime: '', endDate: '2026-10-18' };

  it('EU1 date, times and location replaced; title kept; notes added under', () => {
    const r = readingOverForm(timed, { ...none, title: 'MOVED', startDate: '2026-10-18', startTime: '15:00', endTime: '17:00', location: 'Pump It Up, 123 Main St', notes: 'Moved because of rain' });
    expect(r.form).toEqual({ ...timed, date: '2026-10-18', endDate: '2026-10-18', startTime: '15:00', endTime: '17:00', address: 'Pump It Up, 123 Main St', notes: 'Bring socks\n\nMoved because of rain' });
    expect(r.filled).toBe(6);
  });

  it('EU2 a date alone keeps a timed event timed with its times', () => {
    expect(readingOverForm(timed, { ...none, startDate: '2026-10-24' }).form).toEqual({ ...timed, date: '2026-10-24', endDate: '2026-10-24' });
  });

  it('EU3 a start time alone makes an all-day event timed, end blank, date kept', () => {
    expect(readingOverForm(allDay, { ...none, startTime: '10:30' }).form).toEqual({ ...allDay, allDay: false, startTime: '10:30', endTime: '' });
  });

  it('EU4 new start and end dates on an all-day event stay all day', () => {
    expect(readingOverForm(allDay, { ...none, startDate: '2026-11-01', endDate: '2026-11-03' }).form).toEqual({ ...allDay, date: '2026-11-01', endDate: '2026-11-03' });
  });

  it('EU5 notes already there are not repeated; an empty reading changes nothing', () => {
    expect(readingOverForm(timed, { ...none, notes: 'Bring socks' })).toEqual({ form: timed, filled: 0 });
    expect(readingOverForm(timed, none)).toEqual({ form: timed, filled: 0 });
  });
});
