# Ensō — working agreement

Adds to the global `~/.claude/CLAUDE.md` (its loop, worktrees, warning band and
FunHouse notices all apply here); does not restate it. Run, test and deploy steps are
in `README.md`. Modularity doctrine: `docs/modularity.md`. **Start a new session with
`docs/where-things-stand.md`**: what runs where, where secrets live, the deploy routine, and what is owed.

## The loop: spec → placement → build → audit

`SPEC.md` is the source of truth. **Every change starts there.**

1. **Spec first.** Write the behavior, schema (a new numbered migration plus a §4.2x
   section), API row, screen, and the acceptance check that proves it. Bump the
   version line. A product or UI decision the spec doesn't already settle is
   MojoSOGO's: ask, or build it as a ⚑ DEFAULT and list it in §13.
2. **Placement, before any code is explored or written.** Look the owner up in
   `docs/module-ownership.md`.
   - **Light path:** the owner is obvious, there's no cap pressure and no new file.
     Name the owner in the commit message and go.
   - **Full path:** a new file or owner, a file near its cap, an unclear owner, or
     anything touching rules (`src/shared/`), schema, or the house/push contracts.
     The coordinating session asks the **`placement-advisor`**. If the owner is
     full, the **`reorganizer`** opens a seam in its own commit first. The verdict
     goes into the worker's brief, and the receipt into `docs/placement-receipts.md`.
   - When unsure which path, it is the full path.
3. **Build to the spec**, inside the named owner and only to the spec. If something
   isn't written there, it isn't built (§0.6). Parallel slices each get their own
   worktree and file boundary.
4. **Make the spec true again.** Update §14 (status and deviations) and anything that
   building showed to be wrong. Commit spec and code together.
5. **Verify and audit.** `npm run typecheck && npm test` pass, run by the coordinating
   session itself. Then `npm run arch:audit`. A file newly in the warning band is the
   *next* agent's job (`placement-advisor` for one file, `code-steward` for several),
   never the author's.

If the code and the spec disagree, that's a bug in one of them. Decide which, correct
the spec first, then make the code match. Never let the drift sit. Run `code-steward`
at each milestone.

The three agents (`placement-advisor`, `reorganizer`, `code-steward`) are defined in
`.claude/agents/` and run as subagents (the Agent tool). In the project app, the thread
doing the work is the coordinating session: it calls them itself, never skips them on
the full path, and records each receipt they return.

## Wu wei — act without forcing

Go with the grain of what is already here.

- **The smallest change that makes the code match the spec.** No speculative
  abstraction, no "while I'm here", no framework where a function will do.
- **Extend the existing owner before making a new one.** An alarm is an event with
  `is_alarm = 1`; a market day rides on the holiday-emoji slot. When something new
  fits an existing shape, let it.
- **Derive, don't restate** (§0.5). If a value can be computed or imported, a second
  copy is effort spent creating a future bug. The caps live only in `scripts/arch.ts`;
  the file list is scanned from disk.
- **When it resists, stop.** A change that needs force means the spec or the placement
  is missing something: fighting the engine's purity, a vocabulary string outside
  `vocab.ts`, a special case stacked on a special case, a file pushed past its cap.
  Go back to step 1 or 2.
- **Leave out what isn't needed.** §12 stays absent, not stubbed. Deleting what a
  refinement made redundant is part of the change.

## Git

Non-trivial work goes on a topic branch (`feature/`, `fix/`, `docs/`, `refactor/`,
`chore/`) and merges to `main` once complete and verified.

## Sign-off

FunHouse `sig` for this project: `⭕🔁🏠` (the loop, turning, at home).
