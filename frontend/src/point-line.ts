// SPEC §8.16 ⚑ Q237 — naming what was tapped: describeTap walks the DOM from the tapped element to the pieces,
// selectorFor gives it a CSS selector, pickText joins them into the lines MojoSOGO pastes into a thread (shaped like
// Ozymandias's "PDASH pick"). No React, no state, no server.

export interface PointPieces {
  /** The open tab as on the tab bar, e.g. "⚙ Settings". */
  tab: string;
  /** Each open modal's title, bottom to top, up to the one holding the tap. */
  modals: string[];
  /** Named groups around the tap, outside in (aria-label, fieldset legend, a list row's first words). */
  groups: string[];
  /** The thing's own name; '' when it has none. */
  name: string;
  kind: 'button' | 'checkbox' | 'field' | 'select' | 'link' | 'picture' | 'text';
  /** The thing's CSS selector (selectorFor). */
  selector: string;
}

export const GROUP_CHARS = 30;
export const NAME_CHARS = 40;

const cut = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Under this window width the Screen line says "(phone)". */
export const PHONE_WIDTH = 700;

/** The pasteable text, a line per piece; Where is left out when empty, as is an empty stamp. */
export function pickText(p: PointPieces, stamp: string, width: number, height: number): string {
  const name = cut(p.name, NAME_CHARS);
  const where = [...p.modals.map((m) => cut(m, NAME_CHARS)), ...p.groups.map((g) => cut(g, GROUP_CHARS))].filter(Boolean);
  return [
    `Enso pick: ${cut(p.tab, NAME_CHARS)}`,
    where.length ? `Where: ${where.join(' > ')}` : '',
    `Element: ${name ? `${p.kind} "${name}"` : p.kind}`,
    `Selector: ${p.selector}`,
    `Screen: ${width}x${height}${width < PHONE_WIDTH ? ' (phone)' : ''}`,
    stamp,
  ].filter(Boolean).join('\n');
}

/** The part of an element selectorFor reads, so it can be tested without a browser. */
export interface SelectorNode {
  tagName: string;
  id: string;
  classList: Iterable<string>;
  parentElement: SelectorNode | null;
  children: ArrayLike<SelectorNode>;
}

const escapeCss = (v: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/[^\w-]/g, (c) => `\\${c}`));

/** Outward from the thing to the nearest id: tag, its first two classes (not the pick outline's), :nth-of-type(n) when a sibling shares the tag. */
export function selectorFor(el: SelectorNode): string {
  const parts: string[] = [];
  for (let node: SelectorNode | null = el; node && node.tagName !== 'HTML'; node = node.parentElement) {
    if (node.id && !/^\d/.test(node.id)) { parts.unshift(`#${escapeCss(node.id)}`); break; }
    let part = node.tagName.toLowerCase() + [...node.classList].filter((c) => !c.startsWith('enso-pick')).slice(0, 2).map((c) => `.${escapeCss(c)}`).join('');
    const same = node.parentElement ? Array.from(node.parentElement.children).filter((c) => c.tagName === node!.tagName) : [];
    if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
    parts.unshift(part);
    if (node.tagName === 'BODY') break;
  }
  return parts.join(' > ');
}

const ACTIONABLE = 'button, a, input, select, textarea, label, img, [role=button], [role=checkbox], [role=switch], [aria-label]';

/** Text of an element without the form controls inside it (a label's own words, not its select's options). */
function ownText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('input, select, textarea, option').forEach((c) => c.remove());
  return copy.textContent ?? '';
}

function kindOf(el: Element): PointPieces['kind'] {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (tag === 'input') {
    const type = (el as HTMLInputElement).type;
    if (type === 'checkbox' || type === 'radio') return 'checkbox';
    return type === 'button' || type === 'submit' ? 'button' : 'field';
  }
  if (role === 'checkbox' || role === 'switch') return 'checkbox';
  if (tag === 'button' || role === 'button') return 'button';
  if (tag === 'textarea') return 'field';
  if (tag === 'select') return 'select';
  if (tag === 'a') return 'link';
  if (tag === 'img') return 'picture';
  return 'text';
}

function nameOf(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const labels = (el as HTMLInputElement).labels;
  if (labels?.length) return ownText(labels[0]);
  const text = ownText(el).trim();
  if (text) return text;
  return el.getAttribute('title') ?? el.getAttribute('placeholder') ?? el.getAttribute('alt') ?? '';
}

/** A list row's own words: its text outside the part holding the tapped thing. */
const rowWords = (row: Element, thing: Element) =>
  [...row.childNodes].filter((n) => !n.contains(thing)).map((n) => (n instanceof Element ? ownText(n) : n.textContent ?? '')).join(' ');

/** The thing a tap names: the nearest actionable element around it; a label stands for the control it holds. */
export function pickedThing(target: Element): Element {
  const thing = target.closest(ACTIONABLE) ?? target;
  return thing.tagName === 'LABEL' ? thing.querySelector('input, select, textarea') ?? thing : thing;
}

/** The tapped element → the pieces. `tab` comes from the caller. */
export function describeTap(target: Element, tab: string): PointPieces {
  const thing = pickedThing(target);
  const holder = thing.closest('dialog');
  const open = [...thing.ownerDocument.querySelectorAll('dialog[open]')];
  const modals = holder ? open.slice(0, open.indexOf(holder) + 1).map((d) => d.getAttribute('aria-label') ?? '') : [];
  const groups: string[] = [];
  for (let el = thing.parentElement; el && el !== holder && el.tagName !== 'BODY'; el = el.parentElement) {
    const legend = el.tagName === 'FIELDSET' ? el.querySelector(':scope > legend') : null;
    const named = el.getAttribute('aria-label') ?? (legend ? ownText(legend) : el.tagName === 'LI' ? rowWords(el, thing) : '');
    if (named.trim()) groups.unshift(named);
  }
  return { tab, modals, groups, name: nameOf(thing), kind: kindOf(thing), selector: selectorFor(thing) };
}
