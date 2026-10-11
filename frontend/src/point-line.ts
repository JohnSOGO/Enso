// SPEC §8.16 ⚑ Q237 — naming what was tapped: describeTap walks the DOM from the tapped element to the pieces,
// pointLine joins them into the one line MojoSOGO pastes into a thread. No React, no state, no server.

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
  /** The build stamp (§8.1) and the screen size, e.g. "430×932". */
  stamp: string;
  size: string;
}

export const GROUP_CHARS = 30;
export const NAME_CHARS = 40;

const cut = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** The pasteable line: tab › modals › groups › "name" kind · stamp · size, empty pieces left out. */
export function pointLine(p: PointPieces): string {
  const name = cut(p.name, NAME_CHARS);
  const path = [cut(p.tab, NAME_CHARS), ...p.modals.map((m) => cut(m, NAME_CHARS)), ...p.groups.map((g) => cut(g, GROUP_CHARS)),
    name ? `"${name}" ${p.kind}` : p.kind].filter(Boolean);
  return [`📍 ${path.join(' › ')}`, p.stamp, p.size].filter(Boolean).join(' · ');
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

/** The tapped element → the pieces. `tab`, `stamp` and `size` come from the caller. */
export function describeTap(target: Element, tab: string, stamp: string, size: string): PointPieces {
  let thing = target.closest(ACTIONABLE) ?? target;
  // A label stands for the control it holds.
  if (thing.tagName === 'LABEL') thing = thing.querySelector('input, select, textarea') ?? thing;
  const holder = thing.closest('dialog');
  const open = [...thing.ownerDocument.querySelectorAll('dialog[open]')];
  const modals = holder ? open.slice(0, open.indexOf(holder) + 1).map((d) => d.getAttribute('aria-label') ?? '') : [];
  const groups: string[] = [];
  for (let el = thing.parentElement; el && el !== holder && el.tagName !== 'BODY'; el = el.parentElement) {
    const legend = el.tagName === 'FIELDSET' ? el.querySelector(':scope > legend') : null;
    const named = el.getAttribute('aria-label') ?? (legend ? ownText(legend) : el.tagName === 'LI' ? rowWords(el, thing) : '');
    if (named.trim()) groups.unshift(named);
  }
  return { tab, modals, groups, name: nameOf(thing), kind: kindOf(thing), stamp, size };
}
