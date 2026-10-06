// SPEC §7.8 EP4–EP6 — the screenshot reading's pure rules: cleanEventReading and readingToForm.
import { describe, expect, it } from 'vitest';
import { cleanEventReading, readingToForm, type EventFill, type EventReading } from '../src/shared/event-reading';
import { ALERT_TITLE_MAX } from '../src/shared/alert-limits';

const none: EventReading = { title: null, startDate: null, endDate: null, startTime: null, endTime: null, location: null, notes: null };
const opened: EventFill = { title: '', date: '2026-10-06', allDay: false, startTime: '09:00', endTime: '', endDate: '2026-10-06', notes: '' };

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
  it('EP5 a timed reading sets the times; a date-only one is all day; a multi-day one keeps its end; location leads the notes', () => {
    const timed = readingToForm(opened, opened, { ...none, title: 'Party', startDate: '2026-10-17', startTime: '14:00', endTime: '16:00' });
    expect(timed.form).toEqual({ ...opened, title: 'Party', date: '2026-10-17', startTime: '14:00', endTime: '16:00', endDate: '2026-10-17' });
    expect(timed.filled).toBe(5);
    const day = readingToForm(opened, opened, { ...none, startDate: '2026-10-17' });
    expect(day.form).toMatchObject({ date: '2026-10-17', allDay: true, endDate: '2026-10-17' });
    const multi = readingToForm(opened, opened, { ...none, startDate: '2026-10-10', endDate: '2026-10-12' });
    expect(multi.form).toMatchObject({ date: '2026-10-10', allDay: true, endDate: '2026-10-12' });
    const notes = readingToForm(opened, opened, { ...none, location: 'Sky Zone, 3030 Plaza Bonita Rd', notes: 'RSVP to Jen' });
    expect(notes.form.notes).toBe('📍 Sky Zone, 3030 Plaza Bonita Rd\nRSVP to Jen');
    expect(notes.filled).toBe(1);
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
