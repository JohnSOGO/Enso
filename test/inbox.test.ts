// SH1–SH2 (SPEC §7H.2) — shareText and photoTypeOf, pure.
import { describe, expect, it } from 'vitest';
import { INBOX_TEXT_MAX, inboxKind, photoTypeOf, shareMessage, shareText, shareWindowStart } from '../src/shared/inbox';

const bytes = (...b: (number | string)[]) => new Uint8Array(b.flatMap((x) => (typeof x === 'string' ? [...x].map((ch) => ch.charCodeAt(0)) : [x])));

describe('SH1 shareText', () => {
  it('a single link is the url', () => expect(shareText([' https://a.b/c '])).toEqual({ url: 'https://a.b/c', text: null }));
  it('a link inside text becomes the url, the text kept', () =>
    expect(shareText(['see https://x.y/z. ok'])).toEqual({ url: 'https://x.y/z', text: 'see https://x.y/z. ok' }));
  it('a link and a text', () => expect(shareText(['https://a.b', 'hi'])).toEqual({ url: 'https://a.b', text: 'hi' }));
  it('blanks are nothing', () => expect(shareText(['', '  '])).toBeNull());
  it('plain text', () => expect(shareText(['milk'])).toEqual({ url: null, text: 'milk' }));
  it('long text is cut', () => expect(shareText(['x'.repeat(INBOX_TEXT_MAX + 1)])!.text).toHaveLength(INBOX_TEXT_MAX));
});

describe('SH2 photoTypeOf', () => {
  it('knows each photo by its bytes', () => {
    expect(photoTypeOf(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(photoTypeOf(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(photoTypeOf(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp');
    expect(photoTypeOf(bytes(0, 0, 0, 0x18, 'ftyp', 'heic'))).toBe('image/heic');
  });
  it('text is not a photo', () => expect(photoTypeOf(new TextEncoder().encode('hello world!'))).toBeNull());
});

it('kind, message and window', () => {
  expect(inboxKind({ photo_key: 'k', url: 'u' })).toBe('photo');
  expect(inboxKind({ photo_key: null, url: 'u' })).toBe('link');
  expect(inboxKind({ photo_key: null, url: null })).toBe('text');
  expect(shareMessage(1)).toBe('✅ Saved to your Enso Inbox');
  expect(shareMessage(3)).toBe('✅ 3 saved to your Enso Inbox');
  expect(shareWindowStart('2026-10-19T12:00:00.000Z')).toBe('2026-10-19T11:00:00.000Z');
});
