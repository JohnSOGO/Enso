// SPEC §8.16 PA1 — pickText and selectorFor, the pure half of naming what was tapped (frontend/src/point-line.ts).
// Loaded at run time like test/repeat-fields.test.ts: the Worker typecheck does not cover the PWA.
import { describe, expect, it } from 'vitest';

interface PointPieces { tab: string; modals: string[]; groups: string[]; name: string; kind: string; selector: string }
interface Node { tagName: string; id: string; classList: string[]; parentElement: Node | null; children: Node[] }
const LINE = '../frontend/src/point-line.ts';
const { pickText, selectorFor, GROUP_CHARS, NAME_CHARS } = (await import(/* @vite-ignore */ LINE)) as {
  pickText: (p: PointPieces, stamp: string, width: number, height: number) => string;
  selectorFor: (el: Node) => string; GROUP_CHARS: number; NAME_CHARS: number;
};

const pieces = (more: Partial<PointPieces> = {}): PointPieces => ({
  tab: '⚙ Settings', modals: ['🔔 Alerts'], groups: ['Morning pills'], name: 'FunHouse', kind: 'checkbox',
  selector: 'dialog > label:nth-of-type(2) > input', ...more,
});

describe('pickText — §8.16 PA1', () => {
  it('a line per piece: tab, Where, Element, Selector, Screen, stamp', () => {
    expect(pickText(pieces(), 'v1.55.0 · 1a2b3c4', 430, 932)).toBe([
      'Enso pick: ⚙ Settings',
      'Where: 🔔 Alerts > Morning pills',
      'Element: checkbox "FunHouse"',
      'Selector: dialog > label:nth-of-type(2) > input',
      'Screen: 430x932 (phone)',
      'v1.55.0 · 1a2b3c4',
    ].join('\n'));
  });

  it('keeps several modals bottom to top, then groups outside in', () => {
    expect(pickText(pieces({ modals: ['🍳 Recipes', 'Edit recipe'], groups: ['Ingredients', 'Eggs'] }), '', 1024, 768))
      .toContain('Where: 🍳 Recipes > Edit recipe > Ingredients > Eggs');
  });

  it('leaves out an empty Where and stamp; no name is the kind alone; wide is not a phone', () => {
    expect(pickText(pieces({ modals: [], groups: ['', '  '], name: '', kind: 'text', selector: 'main > p' }), '', 1024, 768))
      .toBe('Enso pick: ⚙ Settings\nElement: text\nSelector: main > p\nScreen: 1024x768');
  });

  it('cuts a name to NAME_CHARS and a group to GROUP_CHARS, and folds whitespace', () => {
    const text = pickText(pieces({ modals: [], groups: ['a'.repeat(50)], name: `  two\n  words ${'b'.repeat(60)}` }), '', 390, 844);
    expect(text).toContain(`Where: ${'a'.repeat(GROUP_CHARS - 1)}…`);
    expect(text).toContain(`Element: checkbox "${`two words ${'b'.repeat(60)}`.slice(0, NAME_CHARS - 1)}…"`);
  });
});

/** A tiny element tree: el(tag, id, classes, ...children), parents wired up. */
function el(tagName: string, id = '', classList: string[] = [], ...children: Node[]): Node {
  const node: Node = { tagName, id, classList, parentElement: null, children };
  children.forEach((c) => { c.parentElement = node; });
  return node;
}

describe('selectorFor — §8.16 PA1', () => {
  it('stops at the nearest id; nth-of-type only where a sibling shares the tag; first two classes', () => {
    const input = el('INPUT');
    const label2 = el('LABEL', '', ['row', 'tight', 'third'], input);
    const tree = el('DIV', 'app', [], el('LABEL'), label2, el('P'));
    expect(selectorFor(input)).toBe('#app > label.row.tight:nth-of-type(2) > input');
  });

  it('goes up to body when there is no id, and leaves out the pick outline class', () => {
    const button = el('BUTTON', '', ['enso-pick-hover', 'plain']);
    el('BODY', '', [], el('MAIN', '', [], button));
    expect(selectorFor(button)).toBe('body > main > button.plain');
  });

  it('skips an id that starts with a digit', () => {
    const span = el('SPAN', '9x');
    el('BODY', '', [], el('SECTION', 'top', [], span));
    expect(selectorFor(span)).toBe('#top > span');
  });
});
