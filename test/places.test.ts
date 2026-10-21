// PL1–PL3 (SPEC §7.9b) — saved places' pure rules: cleanPlace, matchPlace (longest word wins) and placeOverForm.
import { describe, expect, it } from 'vitest';
import { cleanPlace, matchPlace, placeOverForm } from '../src/shared/places';

const incognito = { name: 'Incognito SD', words: ['Incognito'], address: '2335 Mirador, Vista, CA 92084', notes: 'Park in the lower drive.' };
const vista = { name: 'Vista Park', words: ['Vista'], address: '1 Park Way, Vista', notes: null };

describe('§7.9b saved places', () => {
  it('PL1 cleanPlace trims, drops repeat words and names the bad field', () => {
    expect(cleanPlace({ name: ' Incognito SD ', address: ' 2335 Mirador ', notes: ' ', words: [' Incognito ', 'incognito', 'SD Venue'] }))
      .toEqual({ name: 'Incognito SD', address: '2335 Mirador', notes: null, words: ['Incognito', 'SD Venue'] });
    expect(cleanPlace({ name: '', address: 'x' })).toMatch(/^name/);
    expect(cleanPlace({ name: 'x', address: 'a'.repeat(201) })).toMatch(/^address/);
    expect(cleanPlace({ name: 'x', address: 'y', words: ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff'] })).toMatch(/^words/);
    expect(cleanPlace({ name: 'x', address: 'y', words: ['ab'] })).toMatch(/^words/);
    expect(cleanPlace({ name: 'x', address: 'y', words: 'x' })).toMatch(/^words/);
    expect(cleanPlace({ notes: null }, { name: 'n', address: 'a', notes: 'old', words: ['w12'] })).toEqual({ name: 'n', address: 'a', notes: null, words: ['w12'] });
  });

  it('PL2 matchPlace finds a word anywhere, ignoring case; the longest word wins', () => {
    const places = [vista, incognito];
    expect(matchPlace(places, ['Incognito: Masquerade'])).toBe(incognito);
    expect(matchPlace(places, ['https://incognitosd.com/events/x'])).toBe(incognito);
    expect(matchPlace(places, ['Park day in Vista at Incognito'])).toBe(incognito);
    expect(matchPlace(places, [null, 'Soccer'])).toBeNull();
  });

  it('PL3 placeOverForm sets the address and adds the arrival notes once', () => {
    const first = placeOverForm({ title: 't', address: 'Somewhere', notes: 'Bring ID' }, incognito);
    expect(first).toEqual({ form: { title: 't', address: incognito.address, notes: `Bring ID\n\n${incognito.notes}` }, filled: 2 });
    expect(placeOverForm(first.form, incognito).filled).toBe(0);
    expect(placeOverForm({ address: '', notes: '' }, incognito).form.notes).toBe(incognito.notes);
  });
});
