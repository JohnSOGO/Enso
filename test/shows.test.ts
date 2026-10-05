// SPEC §7F.3 W13–W14 — the pure rules: cleaning a look-up's answer and the row's best way to watch.
import { describe, expect, it } from 'vitest';
import { SHOW_TITLE_MAX, THEATERS_MAX, WATCH_MAX, bestWatch, cleanShowReading, showKey } from '../src/shared/shows';

const AT = '2026-10-05T03:00:00.000Z';

describe('§7F cleanShowReading', () => {
  it('W13 ratings, kind, ways to watch and limits', () => {
    const r = cleanShowReading({
      title: 'x'.repeat(300), kind: 'film', rtCritics: '92%', rtAudience: 140,
      watch: [
        { how: 'cable', where: 'Comcast' }, { how: 'stream', where: 'Netflix', note: 'with ads' }, { how: 'stream', where: ' netflix ' },
        { how: 'theater', where: 'A' }, { how: 'theater', where: 'B' }, { how: 'theater', where: 'C' }, { how: 'theater', where: 'D' },
        { how: 'rent', where: '   ' },
      ],
    }, 'clips.example.com/v', AT);
    expect(r.title).toHaveLength(SHOW_TITLE_MAX);
    expect(r.kind).toBeNull();
    expect(r.rtCritics).toBe(92);
    expect(r.rtAudience).toBeNull();
    expect(r.watch).toEqual([
      { how: 'stream', where: 'Netflix', note: 'with ads' },
      { how: 'theater', where: 'A', note: null }, { how: 'theater', where: 'B', note: null }, { how: 'theater', where: 'C', note: null },
    ]);
    expect(r.watch.filter((w) => w.how === 'theater')).toHaveLength(THEATERS_MAX);
    expect(r.url).toBe('https://clips.example.com/v');
    expect(r.checkedAt).toBe(AT);
  });

  it('W13 never more than WATCH_MAX ways; nothing usable → nulls', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ how: 'buy', where: `Store ${i}` }));
    expect(cleanShowReading({ watch: many }, null, AT).watch).toHaveLength(WATCH_MAX);
    expect(cleanShowReading(null, null, AT)).toEqual({
      title: null, kind: null, year: null, rtCritics: null, rtAudience: null, watch: [], summary: null, note: null, url: null, checkedAt: AT,
    });
  });
});

describe('§7F bestWatch and showKey', () => {
  it('W14 theater, then stream, tv, rent, buy', () => {
    const w = (how: 'theater' | 'stream' | 'tv' | 'rent' | 'buy') => ({ how, where: how, note: null });
    expect(bestWatch([w('rent'), w('stream'), w('theater')])?.how).toBe('theater');
    expect(bestWatch([w('buy'), w('tv'), w('stream')])?.how).toBe('stream');
    expect(bestWatch([w('buy'), w('rent'), w('tv')])?.how).toBe('tv');
    expect(bestWatch([w('buy'), w('rent')])?.how).toBe('rent');
    expect(bestWatch([])).toBeNull();
  });

  it('the key ignores case and spacing, not the year', () => {
    expect(showKey(' The  Bear ', null)).toBe(showKey('the bear', ''));
    expect(showKey('Dune', '2021')).not.toBe(showKey('Dune', '1984'));
  });
});
