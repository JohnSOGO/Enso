// Shapes of the architecture scan (SPEC §2.5). No Node imports, so the workerd-side
// test can type its ARCH binding from here without pulling in node:fs.

/** `allowed`: exact repo paths (or `package:<name>`) a file under `from` may import even though a ban matches them. */
export interface Layer { from: string; banned: string[]; allowed?: string[]; why: string }

export interface ScannedFile {
  path: string;          // repo-relative, forward slashes
  lines: number;
  imports: string[];     // repo-relative paths for local imports, `package:<name>` otherwise
  topLevelState: number; // top-level `let` / `var` declarations
  impure: string[];      // IMPURE tokens present (only meaningful under src/shared/)
}

export interface ArchScan {
  files: ScannedFile[];
  ownershipMd: string;
  caps: { WORKING_BUFFER: number; GLOBAL_FILE_CAP: number; WARN_AT: number; CEILINGS: Record<string, number> };
  layers: Layer[];
  impureTokens: string[];
}
