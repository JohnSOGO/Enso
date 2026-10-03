# HomeReminderCalendar — working agreement

Adds to the global `~/.claude/CLAUDE.md`; does not restate it. Run, test and relay
setup are in `README.md`.

## The spec leads. The code follows.

`SPEC.md` is the source of truth. **Every change starts there.**

1. **Write the spec change first** — the behavior, schema (a new numbered migration
   plus a §4.2x section), API row, screen, and the acceptance check that proves it.
   Bump the version line. A product or UI decision that the spec doesn't already
   settle is MojoSOGO's: ask, or build it as a ⚑ DEFAULT and list it in §13.
2. **Then build to the spec** — and only to the spec. If something isn't written
   there, it isn't built (§0.6).
3. **Then make the spec true again** — update §14 (status and deviations) and anything
   building showed to be wrong. Commit the spec and the code together, so history never
   shows one without the other.

If the code and the spec disagree, that's a bug in one of them. Decide which one,
correct the spec first, then make the code match. Never let the drift sit.

## Wu wei — act without forcing

Go with the grain of what is already here.

- **The smallest change that makes the code match the spec.** No speculative
  abstraction, no "while I'm here", no framework where a function will do.
- **Extend the existing owner before making a new one.** An alarm is an event with
  `is_alarm = 1`; a market day rides on the holiday-emoji slot. When something new
  fits an existing shape, let it.
- **Derive, don't restate** (§0.5). If a value can be computed or imported, a second
  copy is effort spent creating a future bug.
- **When it resists, stop.** A change that needs force — fighting the engine's
  purity, adding a vocabulary string outside `vocab.ts`, adding a special case on top of
  another special case — means the spec is missing something. Go back to step 1.
- **Leave out what isn't needed.** §12 stays absent, not stubbed. Deleting what a
  refinement made redundant is part of the change.

## Checks before calling it done

`npm run typecheck && npm test` must pass. Every new spec acceptance row is a test, or a
named manual check in §11.
