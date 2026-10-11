// SPEC §8.6 SM5 — Settings → About shows the opening screen's tagline: the one in SettingsAbout.tsx, which
// frontend/index.html (plain HTML, it paints before any script) must carry word for word.
import { describe, expect, it } from 'vitest';

/** A .tsx module, so it is loaded at run time (the Worker typecheck has no JSX), like recipe-transcript.test.ts. */
const ABOUT = '../frontend/src/components/SettingsAbout.tsx';
const { TAGLINE } = (await import(/* @vite-ignore */ ABOUT)) as { TAGLINE: readonly string[] };
/** The opening screen's HTML as text (Vite `?raw`), loaded the same way. */
const INDEX = '../frontend/index.html?raw';
const { default: INDEX_HTML } = (await import(/* @vite-ignore */ INDEX)) as { default: string };

describe('SM5 About tagline', () => {
  it('the opening screen carries each half of the About tagline', () => {
    expect(TAGLINE.length).toBe(2);
    for (const t of TAGLINE) expect(INDEX_HTML).toContain(`<span>${t}</span>`);
  });
});
