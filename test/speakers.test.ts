// SPEC §9.2a, HS1–HS3 — the pure speaker rules.
import { expect, it } from 'vitest';
import { SPEAKERS_MAX, speakerKind, speakerList, speakersError, speakersFor, splitSpeakers } from '../src/shared/speakers';
import { SPEAKER_KIND } from '../src/shared/vocab';

it('HS1: speakerKind and speakersError', () => {
  expect(speakerKind('media_player.game_room')).toBe('echo');
  expect(speakerKind('assist_satellite.voice_pe')).toBe('satellite');
  for (const id of ['light.x', 'media_player.Game Room', '', 'media_player.', null, 3]) expect(speakerKind(id), String(id)).toBeNull();
  // Every kind speakerKind can emit is a SPEAKER_KIND.
  for (const id of ['media_player.a', 'assist_satellite.b']) expect(SPEAKER_KIND).toContain(speakerKind(id));

  expect(speakersError(null)).toBeNull();
  expect(speakersError([])).toBeNull();
  expect(speakersError(['media_player.a', 'assist_satellite.b'])).toBeNull();
  const tooMany = Array.from({ length: SPEAKERS_MAX + 1 }, (_, i) => `media_player.s${i}`);
  for (const v of [tooMany, ['media_player.a', 'media_player.a'], ['light.x'], 'media_player.a', { a: 1 }, [3]]) {
    expect(speakersError(v), JSON.stringify(v)).toBeTruthy();
  }
});

it('HS2: speakersFor — anyone not chosen → null; the union in first-seen order; nobody → null', () => {
  expect(speakersFor([null])).toBeNull();
  expect(speakersFor([['a'], null])).toBeNull();
  expect(speakersFor([['a', 'b'], ['b', 'c']])).toEqual(['a', 'b', 'c']);
  expect(speakersFor([[], []])).toEqual([]);
  expect(speakersFor([])).toBeNull();
  expect(splitSpeakers(['media_player.a', 'assist_satellite.v', 'media_player.b']))
    .toEqual({ echo: ['media_player.a', 'media_player.b'], satellite: ['assist_satellite.v'] });
});

it('HS3: speakerList reads Home Assistant\'s answer', () => {
  const answer = JSON.stringify([
    { id: 'media_player.sogo', name: 'Sogo' },
    { id: 'assist_satellite.voice_pe', name: 'Office Voice PE' },
    { id: 'light.kitchen', name: 'Kitchen' },
    { id: 'media_player.game_room', name: 'Game Room' },
    { id: 'media_player.sogo', name: 'Sogo again' },
    { id: 'media_player.toasty', name: '  ' },
  ]);
  expect(speakerList(answer)).toEqual([
    { id: 'media_player.game_room', name: 'Game Room', kind: 'echo' },
    { id: 'media_player.toasty', name: 'media_player.toasty', kind: 'echo' },
    { id: 'media_player.sogo', name: 'Sogo', kind: 'echo' },
    { id: 'assist_satellite.voice_pe', name: 'Office Voice PE', kind: 'satellite' },
  ]);
  expect(speakerList('oops')).toBeNull();
  expect(speakerList('{"a":1}')).toBeNull();
  expect(speakerList('[]')).toEqual([]);
});
