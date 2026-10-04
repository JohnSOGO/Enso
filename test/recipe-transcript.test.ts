// M4r acceptance (SPEC §7E.2b) — the pure transcript rules: R19 cleanTranscript, parseScreenshots, and R20 the
// source vocabulary checked producer against consumers (sourcesOf → recipeFromRow and the view's READ_FROM).
import { describe, expect, it } from 'vitest';
import {
  PASTED_MAX, SCREENSHOTS_MAX, SCREENSHOT_TYPES, TRANSCRIPT_MAX, cleanTranscript, parseScreenshots, recipeFromRow, sourcesOf,
  type RecipeRow, type VideoText,
} from '../src/shared/recipes';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '../src/shared/things';

/** The view's own names for the sources (the consumer). A .tsx module, so it is loaded at run time: the Worker
 *  typecheck has no JSX, and the PWA typecheck already holds READ_FROM to Record<RecipeSource less typed, string>. */
const VIEW = '../frontend/src/components/RecipeView.tsx';
const { READ_FROM } = (await import(/* @vite-ignore */ VIEW)) as { READ_FROM: Record<string, string> };

/** What YouTube's transcript panel copies: timestamps on their own lines, its spoken durations, a chapter title. */
const COPIED = [
  'Intro', '0:00', '0 seconds', 'hey everyone welcome back', '0:04', '4 seconds', "today we're making   pancakes",
  'Ingredients', '1:05', '1 minute, 5 seconds', 'two cups of flour', '1:12 and a pinch of salt', '',
  '1:02:03', '1 hour, 2 minutes, 3 seconds', 'fry until golden',
].join('\r\n');

describe('R19 cleanTranscript', () => {
  it('keeps the speech and the chapter titles; drops timestamps and spoken durations', () => {
    expect(cleanTranscript(COPIED)).toBe([
      'Intro', 'hey everyone welcome back', "today we're making pancakes", 'Ingredients', 'two cups of flour',
      'and a pinch of salt', 'fry until golden',
    ].join('\n'));
  });
  it('cuts to TRANSCRIPT_MAX, never inside an emoji', () => {
    const cut = cleanTranscript(`${'a'.repeat(TRANSCRIPT_MAX - 1)}🍅 more`)!;
    expect(cut).toBe('a'.repeat(TRANSCRIPT_MAX - 1));
    expect(cleanTranscript('b'.repeat(TRANSCRIPT_MAX + 50))!.length).toBe(TRANSCRIPT_MAX);
  });
  it('nothing left → null', () => {
    for (const t of ['', '   \n\t', '0:00\n0:05\n12:34', '0:00\n3 seconds\n1:00\n1 minute']) expect(cleanTranscript(t)).toBeNull();
  });
  it('PASTED_MAX is the larger, raw limit', () => expect(PASTED_MAX).toBeGreaterThan(TRANSCRIPT_MAX));
});

describe('parseScreenshots', () => {
  const ok = { type: 'image/jpeg', data: btoa('fake jpeg bytes') };
  it('takes 0–SCREENSHOTS_MAX of the readable photo types; HEIC is not one', () => {
    expect(parseScreenshots(undefined)).toEqual([]);
    expect(parseScreenshots(Array(SCREENSHOTS_MAX).fill(ok))).toHaveLength(SCREENSHOTS_MAX);
    expect(SCREENSHOT_TYPES).toEqual(PHOTO_TYPES.filter((t) => t !== 'image/heic'));
    for (const type of SCREENSHOT_TYPES) expect(parseScreenshots([{ ...ok, type }])).toHaveLength(1);
  });
  it('refuses more than the max, HEIC, a damaged body and one over the photo size limit', () => {
    expect(parseScreenshots(Array(SCREENSHOTS_MAX + 1).fill(ok))).toMatch(/At most/);
    expect(parseScreenshots([{ ...ok, type: 'image/heic' }])).toMatch(/must be one of/);
    expect(parseScreenshots('nope')).toMatch(/list/);
    for (const data of ['', 'abc', 'not base64!', 42]) expect(parseScreenshots([{ ...ok, data }])).toMatch(/damaged/);
    const over = 'A'.repeat(Math.ceil((PHOTO_MAX_BYTES + 1) / 3) * 4);
    expect(parseScreenshots([{ ...ok, data: over }])).toMatch(/too large/);
    expect(parseScreenshots([{ ...ok, data: 'A'.repeat(Math.floor(PHOTO_MAX_BYTES / 3) * 4) }])).toHaveLength(1); // just under
  });
});

describe('R20 producer vs consumers — every source sourcesOf can emit is understood', () => {
  const row = (source: string): RecipeRow => ({
    id: 'rcp_1', title: 'Soup', video_id: 'dQw4w9WgXcQ', video_title: null, channel: null, ingredients: '[]', steps: '[]',
    servings: null, time_text: null, found: 0, source, captions_error: null, comments_error: null, created_by: 'mem_1',
    created_at: 't', updated_at: 't', deleted_at: null,
  });
  // Every combination of what a reading can be given, so the emitted set comes from calling sourcesOf.
  const KEYS = ['description', 'transcript', 'comments', 'pasted', 'screenshots'] as const;
  const emitted = new Set<string>();
  for (let m = 0; m < 1 << KEYS.length; m++) {
    const t: VideoText = { description: null, transcript: null, comments: null };
    KEYS.forEach((k, i) => {
      if (!(m & (1 << i))) return;
      if (k === 'screenshots') t.screenshots = [{ type: 'image/jpeg', data: btoa('x') }];
      else t[k] = 'some text';
    });
    for (const s of sourcesOf(t)) emitted.add(s);
  }

  it('reaches every source a reading can have (all but typed)', () => {
    expect(emitted.size).toBe(Object.keys(READ_FROM).length);
    expect(emitted.has('transcript')).toBe(true);
  });
  it.each([...emitted])('%s survives recipeFromRow and the view names it', (s) => {
    expect(recipeFromRow(row(JSON.stringify([s]))).source).toEqual([s]);
    expect(READ_FROM[s]).toBeTruthy();
  });
});
