// SPEC §7E.6 RL1–RL2 — what kind of link was pasted, cleaned, and the site's name (pure).
import { describe, expect, it } from 'vitest';
import { pageTitle, recipeLinkOf, siteName } from '../src/shared/recipe-link';

describe('§7E.6 recipeLinkOf and siteName', () => {
  it('RL1 a video, a cleaned page, or null', () => {
    expect(recipeLinkOf('https://youtu.be/dQw4w9WgXcQ?si=x')).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ' });
    expect(recipeLinkOf('https://www.facebook.com/reel/1437627654879504/?fs=e&s=TIeQ9V&fs=e&mibextid=wwXIfr&fs=e'))
      .toEqual({ kind: 'page', link: 'https://www.facebook.com/reel/1437627654879504/' });
    expect(recipeLinkOf('m.facebook.com/watch?v=1&mibextid=x')).toEqual({ kind: 'page', link: 'https://www.facebook.com/watch?v=1' });
    expect(recipeLinkOf('https://www.facebook.com/permalink.php?story_fbid=5&id=7&rdid=abc'))
      .toEqual({ kind: 'page', link: 'https://www.facebook.com/permalink.php?story_fbid=5&id=7' });
    expect(recipeLinkOf('https://cooking.example.com/soup?utm_source=x&id=7&fbclid=y#top'))
      .toEqual({ kind: 'page', link: 'https://cooking.example.com/soup?id=7' });
    expect(recipeLinkOf('https://cooking.example.com/soup')).toEqual({ kind: 'page', link: 'https://cooking.example.com/soup' });
    for (const bad of ['http://localhost/soup', 'http://192.168.1.4/soup', 'hello', '', 42, null]) expect(recipeLinkOf(bad)).toBeNull();
  });
  it('RL1 the same reel with other share junk is the same link', () => {
    expect(recipeLinkOf('https://m.facebook.com/reel/1437627654879504/?s=other')).toEqual(
      recipeLinkOf('https://www.facebook.com/reel/1437627654879504/?fs=e&mibextid=wwXIfr'));
  });
  it('RL2 known sites by name, else the host without www.', () => {
    expect(siteName('https://www.facebook.com/reel/1/')).toBe('Facebook');
    expect(siteName('https://www.instagram.com/reel/abc/')).toBe('Instagram');
    expect(siteName('https://www.allrecipes.com/recipe/1/soup/')).toBe('allrecipes.com');
  });
  it("pageTitle: og:title, else the page's title, else Recipe from {site}", () => {
    const page = (title: string | null, meta: string[] = []) => ({ ok: true as const, page: { title, meta, jsonLd: [], text: '' } });
    expect(pageTitle(page('Log in', ['og:title: Garlic noodles']), 'Facebook')).toBe('Garlic noodles');
    expect(pageTitle(page('Best soup'), 'x')).toBe('Best soup');
    expect(pageTitle({ ok: false, reason: 'the site answered 403' }, 'Facebook')).toBe('Recipe from Facebook');
  });
});
