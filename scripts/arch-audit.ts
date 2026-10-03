// `npm run arch:audit` — every source file's size against its cap (SPEC §2.5).
// The warning band (≥ WARN_AT of cap) is a signal to the COORDINATING session:
// extract or bless-and-raise (docs/modularity.md). It is never a test failure.
// Exit code 1 only when a file is already over its cap (the test fails too then).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEILINGS, GLOBAL_FILE_CAP, WARN_AT, capOf, scan } from './arch.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { files } = scan(root);

const rows = files
  .map((f) => ({ ...f, cap: capOf(f.path), pinned: f.path in CEILINGS }))
  .map((f) => ({ ...f, ratio: f.lines / f.cap }))
  .sort((a, b) => b.ratio - a.ratio);

const over = rows.filter((r) => r.ratio > 1);
const band = rows.filter((r) => r.ratio >= WARN_AT && r.ratio <= 1);
const state = rows.filter((r) => r.topLevelState > 0);

const pct = (r: number) => `${Math.round(r * 100)}%`.padStart(5);
const mark = (r: number) => (r > 1 ? 'OVER' : r >= WARN_AT ? 'WARN' : '');

console.log(`Architecture headroom — ${files.length} source files, global cap ${GLOBAL_FILE_CAP}, warning band ≥ ${pct(WARN_AT).trim()}\n`);
console.log(`${'file'.padEnd(48)} ${'lines'.padStart(5)} ${'cap'.padStart(5)}   use`);
for (const r of rows.slice(0, 15)) {
  const name = r.path + (r.pinned ? ' *' : '');
  console.log(`${name.padEnd(48)} ${String(r.lines).padStart(5)} ${String(r.cap).padStart(5)} ${pct(r.ratio)}  ${mark(r.ratio)}`);
}
console.log(`  (* = individually pinned ceiling; top 15 by use shown)\n`);

if (state.length) console.log(`Top-level mutable state: ${state.map((r) => `${r.path} (${r.topLevelState})`).join(', ')}\n`);

if (over.length) {
  console.log(`OVER CAP: ${over.map((r) => r.path).join(', ')} — consult placement-advisor (extract vs bless-and-raise).`);
  process.exit(1);
}
console.log(band.length
  ? `In the warning band: ${band.map((r) => r.path).join(', ')} — a decision for the coordinating session, not the author.`
  : 'Quiet: nothing in the warning band.');
