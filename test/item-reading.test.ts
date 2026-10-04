// SN12 (SPEC §7A.3) — the pure rules for naming a snapped item: the prompt, cleanItemName and parseIdentifyReport.
import { describe, expect, it } from 'vitest';
import {
  IDENTIFY_BODY_MAX, IDENTIFY_PROMPT, IDENTIFY_REASON_MAX, IDENTIFY_TEXT_MAX, IDENTIFY_UNKNOWN, ITEM_NAME_ASK,
  cleanItemName, parseIdentifyReport,
} from '../src/shared/item-reading';
import { TEXT_MAX } from '../src/shared/lists';
import { PHOTO_MAX_BYTES } from '../src/shared/things';
import { IDENTIFY_FAILURE } from '../src/shared/vocab';

describe('SN12 the prompt and the limits', () => {
  it('asks for a short shopping-list name of at most ITEM_NAME_ASK characters, or exactly UNKNOWN', () => {
    expect(ITEM_NAME_ASK).toBe(60);
    expect(IDENTIFY_UNKNOWN).toBe('UNKNOWN');
    expect(IDENTIFY_PROMPT).toBe('This is a photo of a household item someone needs to buy again. Reply with ONLY a short shopping-list ' +
      'name for it (brand + product + size if visible), max 60 characters. If you cannot tell what it is, reply exactly: UNKNOWN.');
  });

  it("the helper's body cap is a stored photo's", () => {
    expect(IDENTIFY_BODY_MAX).toBe(PHOTO_MAX_BYTES);
  });
});

describe('SN12 cleanItemName', () => {
  const cases: [unknown, string | null][] = [
    ['Heinz Tomato Ketchup 32 oz', 'Heinz Tomato Ketchup 32 oz'],
    ['  "Heinz Tomato Ketchup 32 oz."  ', 'Heinz Tomato Ketchup 32 oz'],
    ['`Dawn   dish soap`', 'Dawn dish soap'],
    ['“Kirkland paper towels”', 'Kirkland paper towels'],
    ['<think>\n\n</think>\n\nBounty paper towels', 'Bounty paper towels'],
    ['<think>it looks like a bottle\nof soap</think>Dove body wash', 'Dove body wash'],
    ['\n\nAA batteries\nThis is a pack of batteries.', 'AA batteries'],
    ['UNKNOWN', null],
    ['unknown.', null],
    ['"UNKNOWN"', null],
    ['<think>no idea</think>\nUNKNOWN', null],
    ['<think>still thinking', null],
    ['""', null],
    ['   ', null],
    ['', null],
    [null, null],
    [42, null],
  ];
  for (const [raw, want] of cases) {
    it(`${JSON.stringify(raw)} → ${JSON.stringify(want)}`, () => {
      expect(cleanItemName(raw)).toBe(want);
    });
  }

  it(`cut to TEXT_MAX (${TEXT_MAX}), never inside a surrogate pair`, () => {
    expect(cleanItemName('a'.repeat(TEXT_MAX + 30))).toBe('a'.repeat(TEXT_MAX));
    const emoji = cleanItemName(`${'a'.repeat(TEXT_MAX - 1)}🍅 tomatoes`)!;
    expect(emoji).toBe('a'.repeat(TEXT_MAX - 1));
  });
});

describe('SN12 parseIdentifyReport', () => {
  it('a text report → ok, the text cut to IDENTIFY_TEXT_MAX (empty text is still a report)', () => {
    expect(parseIdentifyReport({ ok: true, text: 'Heinz' })).toEqual({ ok: true, text: 'Heinz' });
    expect(parseIdentifyReport({ ok: true, text: '' })).toEqual({ ok: true, text: '' });
    expect(parseIdentifyReport({ ok: true, text: 'x'.repeat(IDENTIFY_TEXT_MAX + 5) })).toEqual({ ok: true, text: 'x'.repeat(IDENTIFY_TEXT_MAX) });
  });

  it('each IDENTIFY_FAILURE kind with a reason → a failure, the reason cut to IDENTIFY_REASON_MAX', () => {
    for (const kind of IDENTIFY_FAILURE) {
      expect(parseIdentifyReport({ ok: false, kind, reason: ' why ' })).toEqual({ ok: false, kind, reason: 'why' });
    }
    const long = parseIdentifyReport({ ok: false, kind: 'failed', reason: 'r'.repeat(IDENTIFY_REASON_MAX + 9) });
    expect(typeof long === 'object' && !long.ok && long.reason.length).toBe(IDENTIFY_REASON_MAX);
  });

  it('anything else → a message, never a throw', () => {
    for (const bad of [null, 'text', [], {}, { ok: 'yes' }, { ok: true }, { ok: true, text: 5 }, { ok: false, kind: 'blocked', reason: 'x' },
      { ok: false, kind: 'failed' }, { ok: false, kind: 'failed', reason: '  ' }]) {
      expect(typeof parseIdentifyReport(bad), JSON.stringify(bad)).toBe('string');
    }
  });
});
