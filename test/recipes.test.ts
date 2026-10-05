// M4o acceptance (SPEC §7E) — the pure recipe rules: R1 (youtubeVideoId), R9 (cleanRecipeReading),
// parseRecipeInput, hasRecipeText / sourcesOf, R15 creatorComments, the clash, recipeFromRow; M4p (§7E.5) RE8 byMyEmoji, RE9 usedEmojis.
import { describe, expect, it } from 'vitest';
import {
  INGREDIENTS_MAX, INGREDIENT_MAX, RECIPE_TITLE_MAX, STEPS_MAX, parseRecipeInput, recipeFromRow, recipeVideoClash, thumbnailUrl, watchUrl,
  youtubeVideoId, type Recipe, type RecipeRow,
} from '../src/shared/recipes';
import {
  CREATOR_COMMENTS_MAX, UNTITLED_VIDEO, cleanRecipeReading, creatorComments, hasRecipeText, sourcesOf,
} from '../src/shared/recipe-reading';
import { USED_EMOJIS_MAX, byMyEmoji, myEmoji, usedEmojis } from '../src/shared/recipe-emoji';
import { TEXT_MAX } from '../src/shared/lists';

const ID = 'dQw4w9WgXcQ';

describe('R1 youtubeVideoId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}`],
    [`http://www.youtube.com/watch?v=${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`],
    [`https://www.youtube.com/watch?v=${ID}&t=42s`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?si=AbCdEfGh12345678`],
    [`youtu.be/${ID}?t=10`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://youtube.com/shorts/${ID}?si=xyz`],
    [`https://www.youtube.com/embed/${ID}?start=30`],
    [`https://www.youtube.com/live/${ID}?feature=shared`],
    [`  https://www.youtube.com/watch?v=${ID}  `],
  ])('%s → the id', (url) => {
    expect(youtubeVideoId(url)).toBe(ID);
  });

  it.each([
    ['https://vimeo.com/123456789'],
    [`https://www.youtube.com.evil.example/watch?v=${ID}`],
    [`https://notyoutube.com/watch?v=${ID}`],
    ['https://www.youtube.com/watch?v=dQw4w9WgXc'], // 10 characters
    [`https://www.youtube.com/watch?v=${ID}x`], // 12
    ['https://www.youtube.com/watch?v=dQw4w9WgX!Q'],
    ['https://www.youtube.com/channel/UC1234567890'],
    [`https://www.youtube.com/watch`],
    [`javascript:alert(1)`],
    [`ftp://youtu.be/${ID}`],
    [''],
    ['not a link'],
  ])('%s → null', (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });

  it('refuses non-strings', () => {
    expect(youtubeVideoId(undefined)).toBeNull();
    expect(youtubeVideoId(42)).toBeNull();
  });

  it('derives the watch link and the thumbnail from the id (never stored)', () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});

describe('hasRecipeText / sourcesOf', () => {
  it('no description, no captions and no creator comment → nothing to read', () => {
    expect(hasRecipeText({ description: null, transcript: null, comments: null })).toBe(false);
    expect(hasRecipeText({ description: '  \n ', transcript: '', comments: ' ' })).toBe(false);
    expect(sourcesOf({ description: ' ', transcript: null, comments: null })).toEqual([]);
  });
  it('any one is enough; the sources say which', () => {
    expect(hasRecipeText({ description: 'flour', transcript: null, comments: null })).toBe(true);
    expect(hasRecipeText({ description: null, transcript: 'add salt', comments: null })).toBe(true);
    expect(hasRecipeText({ description: null, transcript: null, comments: '2 eggs' })).toBe(true);
    expect(sourcesOf({ description: 'flour', transcript: 'add salt', comments: '2 eggs' })).toEqual(['description', 'captions', 'comments']);
    expect(sourcesOf({ description: 'flour', transcript: 'add salt', comments: null })).toEqual(['description', 'captions']);
    expect(sourcesOf({ description: null, transcript: 'add salt', comments: null })).toEqual(['captions']);
    expect(sourcesOf({ description: null, transcript: null, comments: '2 eggs' })).toEqual(['comments']);
  });
});

describe("R15 creatorComments — only the video's own channel", () => {
  const CH = 'UC_creator';
  const c = (authorChannelId: string | null, text: string) => ({ authorChannelId, text });
  it("keeps only the creator's top-level comments, in order; viewers are dropped", () => {
    expect(creatorComments([c('UC_viewer', 'Looks great!'), c(CH, ' Recipe: 2 eggs '), c(null, 'anon'), c(CH, 'Bake 20 min')], CH))
      .toBe('Recipe: 2 eggs\n\nBake 20 min');
    expect(creatorComments([c('UC_viewer', '2 eggs, 1 cup flour')], CH)).toBeNull();
    expect(creatorComments([c(CH, '   ')], CH)).toBeNull();
    expect(creatorComments([], CH)).toBeNull();
  });
  it('an unknown channel → null, never anyone else\'s comment', () => {
    for (const ch of [null, '']) {
      expect(creatorComments([c(null, 'x'), c('', 'y'), c('UC_viewer', 'z')], ch)).toBeNull();
    }
  });
  it('cut to CREATOR_COMMENTS_MAX, never inside an emoji', () => {
    expect(creatorComments([c(CH, 'x'.repeat(CREATOR_COMMENTS_MAX + 50))], CH)).toHaveLength(CREATOR_COMMENTS_MAX);
    const cut = creatorComments([c(CH, `a${'🍅'.repeat(CREATOR_COMMENTS_MAX)}`)], CH)!;
    expect(cut.length).toBeLessThanOrEqual(CREATOR_COMMENTS_MAX);
    expect(/[\uD800-\uDBFF]$/.test(cut)).toBe(false);
  });
});

describe('R9 cleanRecipeReading', () => {
  it('found:false → no ingredients, no steps, the video title, whatever Claude listed', () => {
    const r = cleanRecipeReading({ found: false, title: 'Pancakes', ingredients: ['milk'], steps: ['mix'], servings: '4', time: '5 min' }, 'My vlog');
    expect(r).toEqual({ title: 'My vlog', ingredients: [], steps: [], servings: null, time: null, found: false });
  });
  it('a non-boolean found counts as not found; no video title → the fallback', () => {
    expect(cleanRecipeReading({ found: 'yes', ingredients: ['milk'] }, null)).toMatchObject({ found: false, ingredients: [], title: UNTITLED_VIDEO });
    expect(cleanRecipeReading(null, '  ')).toMatchObject({ found: false, title: UNTITLED_VIDEO });
  });
  it('trims, collapses whitespace, cuts to the limits, drops empties and non-strings, caps the counts', () => {
    const r = cleanRecipeReading({
      found: true, title: `  ${'T'.repeat(300)} `,
      ingredients: ['  2 cups\n flour ', '', '   ', 42, null, 'x'.repeat(500), ...Array.from({ length: 80 }, (_, i) => `item ${i}`)],
      steps: Array.from({ length: 70 }, (_, i) => `step ${i}`), servings: ' 4 ', time: '',
    }, 'v');
    expect(r.title).toHaveLength(RECIPE_TITLE_MAX);
    expect(r.ingredients[0]).toBe('2 cups flour');
    expect(r.ingredients[1]).toHaveLength(INGREDIENT_MAX);
    expect(r.ingredients).toHaveLength(INGREDIENTS_MAX);
    expect(r.steps).toHaveLength(STEPS_MAX);
    expect(r).toMatchObject({ servings: '4', time: null, found: true });
  });
  it('found:true with nothing usable is found:false (found ⇔ ingredients or steps)', () => {
    expect(cleanRecipeReading({ found: true, title: 'Soup', ingredients: ['  '], steps: [] }, 'Video')).toMatchObject({ found: false, title: 'Video' });
  });
  it('never cuts inside an emoji', () => {
    const [cut] = cleanRecipeReading({ found: true, ingredients: [`a${'🍅'.repeat(70)}`] }, 'v').ingredients;
    expect(cut.length).toBeLessThanOrEqual(INGREDIENT_MAX);
    expect(/[\uD800-\uDBFF]$/.test(cut)).toBe(false);
  });
  it('INGREDIENT_MAX is the Shopping item limit', () => {
    expect(INGREDIENT_MAX).toBe(TEXT_MAX);
  });
});

describe('parseRecipeInput', () => {
  it('normalizes lines and drops empty ones', () => {
    expect(parseRecipeInput({ title: ' Soup ', ingredients: [' 1 onion ', '', '  '], steps: ['Chop  it'], servings: '', time: ' 1 h ' }))
      .toEqual({ title: 'Soup', ingredients: ['1 onion'], steps: ['Chop it'], servings: null, time: '1 h' });
  });
  it('names the offending field', () => {
    expect(parseRecipeInput({ title: '' })).toMatch(/title/);
    expect(parseRecipeInput({ title: 'x'.repeat(RECIPE_TITLE_MAX + 1) })).toMatch(/title/);
    expect(parseRecipeInput({ title: 'S', ingredients: 'flour' })).toMatch(/ingredients/);
    expect(parseRecipeInput({ title: 'S', ingredients: ['y'.repeat(INGREDIENT_MAX + 1)] })).toMatch(/ingredients.*120/);
    expect(parseRecipeInput({ title: 'S', steps: Array.from({ length: STEPS_MAX + 1 }, () => 's') })).toMatch(/steps/);
    expect(parseRecipeInput({ title: 'S', servings: 4 })).toMatch(/servings/);
    expect(parseRecipeInput({ title: 'S', time: 't'.repeat(61) })).toMatch(/time/);
  });
});

describe('the clash and the wire shape', () => {
  const row = (over: Partial<RecipeRow> = {}): RecipeRow => ({
    id: 'rcp_1', title: 'Soup', video_id: ID, video_title: 'Soup video', channel: 'Chef', link: null, ingredients: '["1 onion"]', steps: '["Chop"]',
    servings: '2', time_text: '1 h', found: 1, source: '["description","captions"]', captions_error: null, comments_error: null, created_by: 'mem_1',
    created_at: 't', updated_at: 't', deleted_at: null, ...over,
  });
  it('recipeVideoClash finds the live recipe holding the video', () => {
    expect(recipeVideoClash(ID, [row({ id: 'a', video_id: null }), row({ id: 'b' })])?.id).toBe('b');
    expect(recipeVideoClash('aaaaaaaaaaa', [row()])).toBeNull();
  });
  it('recipeFromRow derives the links and keeps only known sources', () => {
    expect(recipeFromRow(row({ source: '["captions","bogus","description"]' }))).toMatchObject({
      watchUrl: watchUrl(ID), thumbnailUrl: thumbnailUrl(ID), ingredients: ['1 onion'], time: '1 h', found: true,
      source: ['description', 'captions'],
    });
    expect(recipeFromRow(row({ video_id: null, source: '["typed"]', ingredients: 'not json' }))).toMatchObject({
      watchUrl: null, thumbnailUrl: null, ingredients: [], source: ['typed'],
    });
    expect(recipeFromRow(row({ source: '["comments"]', comments_error: 'quota' }))).toMatchObject({
      source: ['comments'], commentsError: 'quota', captionsError: null,
    });
  });
});

describe("M4p each person's emoji (§7E.5)", () => {
  const ME = 'mem_me', YOU = 'mem_you';
  const rec = (id: string, createdAt: string, mine: string | null, yours: string | null = null): Recipe => ({
    id, title: id, videoId: null, videoTitle: null, channel: null, link: null, watchUrl: null, thumbnailUrl: null, ingredients: [], steps: [],
    servings: null, time: null, found: false, source: ['typed'], captionsError: null, commentsError: null, createdBy: ME, createdAt, updatedAt: createdAt,
    emojis: [...(mine ? [{ memberId: ME, emoji: mine }] : []), ...(yours ? [{ memberId: YOU, emoji: yours }] : [])],
  });

  it("recipeFromRow keeps only its own recipe's emojis; none by default", () => {
    const row = { id: 'rcp_1', title: 'Soup', video_id: null, video_title: null, channel: null, link: null, ingredients: '[]', steps: '[]',
      servings: null, time_text: null, found: 0, source: '["typed"]', captions_error: null, comments_error: null, created_by: ME, created_at: 't',
      updated_at: 't', deleted_at: null } satisfies RecipeRow;
    expect(recipeFromRow(row).emojis).toEqual([]);
    expect(recipeFromRow(row, [
      { recipe_id: 'rcp_1', member_id: ME, emoji: '🌶' }, { recipe_id: 'rcp_2', member_id: ME, emoji: '⭐' },
      { recipe_id: 'rcp_1', member_id: YOU, emoji: '⭐' },
    ]).emojis).toEqual([{ memberId: ME, emoji: '🌶' }, { memberId: YOU, emoji: '⭐' }]);
  });

  it('myEmoji is mine or null', () => {
    expect(myEmoji(rec('a', 't', '🌶', '⭐'), ME)).toBe('🌶');
    expect(myEmoji(rec('a', 't', null, '⭐'), ME)).toBeNull();
  });

  it('RE8 byMyEmoji: biggest group first; ties by newest, then emoji; newest first within; unrated last', () => {
    const list = [
      rec('u1', '2026-10-09', null, '🌶'), // unrated by me (yours doesn't count)
      rec('s1', '2026-10-08', '⭐'),
      rec('c1', '2026-10-01', '🌶'),
      rec('c2', '2026-10-05', '🌶'),
      rec('p1', '2026-10-03', '🍕'),
      rec('u2', '2026-10-02', null),
    ];
    expect(byMyEmoji(list, ME).map((r) => r.id)).toEqual(['c2', 'c1', 's1', 'p1', 'u1', 'u2']);
    // for the other member it is their own grouping
    expect(byMyEmoji(list, YOU).map((r) => r.id)).toEqual(['u1', 's1', 'c2', 'p1', 'u2', 'c1']);
    expect(list.map((r) => r.id)).toEqual(['u1', 's1', 'c1', 'c2', 'p1', 'u2']); // the input is not reordered
  });

  it('RE8 equal groups with an equal newest fall back to the emoji string; equal times to the id', () => {
    const list = [rec('a', '2026-10-01', '🍕'), rec('b', '2026-10-01', '⭐'), rec('d', '2026-10-01', null), rec('e', '2026-10-01', null)];
    const [x, y] = ['🍕', '⭐'].sort();
    expect(byMyEmoji(list, ME).map((r) => myEmoji(r, ME))).toEqual([x, y, null, null]);
    expect(byMyEmoji(list, ME).slice(2).map((r) => r.id)).toEqual(['e', 'd']);
    expect(byMyEmoji([], ME)).toEqual([]);
  });

  it('RE9 usedEmojis: most used first, ties by the string, at most USED_EMOJIS_MAX', () => {
    const many = [...'🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍'];
    expect(new Set(many).size).toBe(14);
    const list = [
      ...many.map((e, i) => rec(`r${i}`, 't', e)),
      rec('x1', 't', null, '🍍'), rec('x2', 't', '🍍'),
    ];
    const used = usedEmojis(list);
    expect(used).toHaveLength(USED_EMOJIS_MAX);
    expect(used[0]).toBe('🍍');
    expect(used.slice(1)).toEqual(many.filter((e) => e !== '🍍').sort().slice(0, USED_EMOJIS_MAX - 1));
    expect(usedEmojis([])).toEqual([]);
  });
});
