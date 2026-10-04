// SPEC §2.5 — the ONE home of the architecture caps and layering bans, plus the scan
// that measures the source tree against them. vitest.config.ts hands scan() to
// test/architecture.test.ts; scripts/arch-audit.ts prints it. Neither restates a number.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import type { ArchScan, Layer, ScannedFile } from './arch-types.ts';

export type { ArchScan, ScannedFile } from './arch-types.ts';

/** Room left above a file's size when its ceiling is pinned. */
export const WORKING_BUFFER = 40;
/** Backstop for every source file without its own ceiling. */
export const GLOBAL_FILE_CAP = 300;
/** Share of a cap where `arch:audit` starts warning. A report, never a test failure. */
export const WARN_AT = 0.9;

/** Individually pinned caps: size when pinned + WORKING_BUFFER. Move one only with a receipt. */
export const CEILINGS: Record<string, number> = {
  'frontend/src/components/Settings.tsx': 167 + WORKING_BUFFER,
  'frontend/src/components/Calendar.tsx': 262 + WORKING_BUFFER,
  'frontend/src/components/EventForm.tsx': 183 + WORKING_BUFFER,
  'src/worker/routes/events.ts': 107 + WORKING_BUFFER,
};

/** Layering bans: files under `from` must not import anything matching `banned`. */
export const LAYERS: Layer[] = [
  { from: 'src/shared/', banned: ['src/worker/', 'frontend/', 'scripts/', 'home/', 'package:'], why: 'shared is pure and dependency-free (§0.3)' },
  { from: 'src/worker/', banned: ['frontend/', 'scripts/', 'home/'], why: 'the Worker stands alone' },
  { from: 'frontend/src/', banned: ['src/worker/', 'scripts/', 'home/'], why: 'the PWA talks to the Worker over HTTP only' },
  {
    from: 'home/', banned: ['src/', 'frontend/', 'scripts/', 'package:'],
    allowed: ['src/worker/youtube-captions.ts', 'src/shared/item-reading.ts', 'package:node:http'],
    why: 'youtube-captions.ts, item-reading.ts, its own siblings, node:http and Node globals only (§7E.2c, §7A.3)',
  },
];

/** Forbidden inside src/shared/ (§0.3): the engine never reads the clock or does I/O. */
export const IMPURE = ['Date.now(', 'new Date()', 'fetch(', 'D1Database'];

export const SOURCE_ROOTS = ['src', 'frontend/src', 'scripts', 'home'];
export const SOURCE_EXT = ['.ts', '.tsx', '.mjs', '.css'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.wrangler']);


const toRepo = (root: string, abs: string) => relative(root, abs).split(sep).join('/');

function walk(root: string, dir: string, out: string[]) {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(root, abs, out);
    else if (SOURCE_EXT.some((x) => name.endsWith(x))) out.push(toRepo(root, abs));
  }
}

/** Same count as `wc -l` on a file ending in a newline. */
export const countLines = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

function resolveImport(from: string, spec: string, known: Set<string>): string {
  if (!spec.startsWith('.')) return `package:${spec}`;
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (known.has(c)) return c;
  }
  return base; // outside the scanned roots (e.g. a JSON file); still checked by prefix
}

export function scan(root: string): ArchScan {
  const paths: string[] = [];
  for (const r of SOURCE_ROOTS) walk(root, join(root, r), paths);
  const known = new Set(paths);
  const files = paths.sort().map((path): ScannedFile => {
    const text = readFileSync(join(root, path), 'utf8');
    const specs = [...text.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
    return {
      path,
      lines: countLines(text),
      imports: [...new Set(specs.map((s) => resolveImport(path, s, known)))],
      topLevelState: (text.match(/^(?:export\s+)?(?:let|var)\s/gm) ?? []).length,
      impure: IMPURE.filter((t) => text.includes(t)),
    };
  });
  return {
    files,
    ownershipMd: readFileSync(join(root, 'docs/module-ownership.md'), 'utf8'),
    caps: { WORKING_BUFFER, GLOBAL_FILE_CAP, WARN_AT, CEILINGS },
    layers: LAYERS,
    impureTokens: IMPURE,
  };
}

export const capOf = (path: string) => CEILINGS[path] ?? GLOBAL_FILE_CAP;
