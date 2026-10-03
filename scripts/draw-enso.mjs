// SPEC §8.10 — draws the Ensō mark (our own drawing, never a stock image) into
// frontend/public/icon.svg. One brush stroke round: it lands thick at the top right, swells,
// and tapers to a dry tip, leaving the traditional opening at the top right.
// Usage: node scripts/draw-enso.mjs   (then re-render the PNGs from the SVG)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BG = '#0F172A';   // --bg
const INK = '#F8FAFC';  // --text
const C = 50, R = 31;   // centre and mean radius in a 100×100 box
const START = 70, SWEEP = 332, STEPS = 200;

const rad = (d) => (d * Math.PI) / 180;
const pt = (deg, r) => [C + r * Math.cos(rad(deg)), C - r * Math.sin(rad(deg))];
// Brush width: lands at 10, swells to ~15 through the heavy body, then lifts away to a fine tip.
const width = (t) => (10 + 5.5 * Math.sin(Math.PI * Math.min(t / 0.6, 1) * 0.85)) * (1 - Math.pow(t, 3) * 0.9);
// A hand-drawn circle is never perfect: a slight drift inward and a gentle wobble.
const radius = (t) => R + 0.9 * Math.sin(t * Math.PI * 2.6) - 1.4 * t;

const outer = [], inner = [];
for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS, a = START + SWEEP * t, w = width(t), r = radius(t);
  outer.push(pt(a, r + w / 2));
  inner.push(pt(a, r - w / 2));
}
// Round head where the brush lands: a half circle from the inner edge back to the outer edge.
const head = [];
const w0 = width(0), r0 = radius(0);
for (let i = 1; i < 12; i++) {
  const phi = Math.PI * (i / 12);
  const [hx, hy] = pt(START, r0);
  const tx = Math.sin(rad(START)), ty = Math.cos(rad(START)); // tangent pointing backwards along the stroke
  const nx = Math.cos(rad(START)), ny = -Math.sin(rad(START));
  head.push([hx + (w0 / 2) * (-Math.cos(phi) * nx + Math.sin(phi) * tx), hy + (w0 / 2) * (-Math.cos(phi) * ny + Math.sin(phi) * ty)]);
}
const f = (p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
const d = `M${f(outer[0])} ` + outer.slice(1).map((p) => `L${f(p)}`).join(' ') + ' '
  + inner.reverse().map((p) => `L${f(p)}`).join(' ') + ' ' + head.map((p) => `L${f(p)}`).join(' ') + ' Z';

// Dry brush: where the ink runs out, bristles separate — thin streaks of background along the tail.
const streak = (off, from, to) => {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = from + (to - from) * (i / 40);
    pts.push(pt(START + SWEEP * t, radius(t) + off * width(t)));
  }
  return `<path d="M${pts.map(f).join(' L')}" fill="none" stroke="${BG}" stroke-width="0.7" stroke-linecap="round" opacity="0.85"/>`;
};
const dry = [streak(0.18, 0.55, 0.93), streak(-0.12, 0.62, 0.9), streak(0.33, 0.7, 0.88), streak(-0.3, 0.5, 0.78)].join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${BG}"/><path d="${d}" fill="${INK}"/>${dry}</svg>\n`;
const out = fileURLToPath(new URL('../frontend/public/icon.svg', import.meta.url));
writeFileSync(out, svg);
console.log(`wrote ${out} (${svg.length} bytes)`);
