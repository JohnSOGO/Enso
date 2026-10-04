// SPEC §2.5 — the architecture guard. The scan and the caps arrive from vitest.config.ts
// (scripts/arch.ts runs in Node there; this test runs inside workerd and has no fs).
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ArchScan } from '../scripts/arch-types';

declare global {
  namespace Cloudflare {
    interface Env { ARCH: ArchScan }
  }
}

const arch = env.ARCH;
const { files, caps, layers, impureTokens } = arch;

/** Rows of docs/module-ownership.md: the backticked path in the first column of each table row. */
const rows = [...arch.ownershipMd.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
const toRegex = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
const owners = rows.map((row) => ({ row, re: toRegex(row) }));

describe('ownership map (docs/module-ownership.md)', () => {
  it('scans a real tree', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(rows.length).toBeGreaterThan(20);
  });

  it('every source file has an owner row', () => {
    const orphans = files.map((f) => f.path).filter((p) => !owners.some((o) => o.re.test(p)));
    expect(orphans, 'add an owner row to docs/module-ownership.md — that row is the placement decision').toEqual([]);
  });

  it('every owner row names something on disk', () => {
    const stale = owners.filter((o) => !files.some((f) => o.re.test(f.path))).map((o) => o.row);
    expect(stale, 'stale rows in docs/module-ownership.md').toEqual([]);
  });
});

describe('layering (LAYERS in scripts/arch.ts)', () => {
  it('no import crosses a ban', () => {
    const violations: string[] = [];
    for (const f of files) {
      for (const layer of layers.filter((l) => f.path.startsWith(l.from))) {
        for (const imp of f.imports) {
          if (layer.allowed?.includes(imp)) continue;
          if (layer.banned.some((b) => imp.startsWith(b))) violations.push(`${f.path} → ${imp} (${layer.why})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('src/shared/ is pure: no clock reads, no I/O (§0.3)', () => {
    const impure = files
      .filter((f) => f.path.startsWith('src/shared/') && f.impure.length)
      .map((f) => `${f.path}: ${f.impure.join(', ')}`);
    expect(impure, `forbidden: ${impureTokens.join(' ')}`).toEqual([]);
  });
});

describe('size and state caps', () => {
  it('every pinned ceiling names a real file', () => {
    expect(Object.keys(caps.CEILINGS).filter((p) => !files.some((f) => f.path === p))).toEqual([]);
  });

  it('no file is over its line cap', () => {
    const over = files
      .map((f) => ({ f, cap: caps.CEILINGS[f.path] ?? caps.GLOBAL_FILE_CAP }))
      .filter(({ f, cap }) => f.lines > cap)
      .map(({ f, cap }) => `${f.path}: ${f.lines} > ${cap}`);
    expect(
      over,
      'Crossing a cap is the trigger to consult placement-advisor: extract a seam (re-pin DOWN) or bless-and-raise ' +
        `(re-pin at size + ${caps.WORKING_BUFFER} with a receipt). Never silently bump the number.`,
    ).toEqual([]);
  });

  it('no top-level let/var — cross-cutting state belongs in an owner module', () => {
    expect(files.filter((f) => f.topLevelState > 0).map((f) => `${f.path} (${f.topLevelState})`)).toEqual([]);
  });
});
