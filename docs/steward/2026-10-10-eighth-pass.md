# Steward pass 8 — 2026-10-10 (after v1.42.0 and v1.43.0)

**Scope:** whole tree, focused on 494afb2..00598da (PR #34 dish washer + Clothes washer/dryer rename, migration 0037;
PR #35 Owner unknown on Done now). **Health:** SOUND — both releases landed in their existing owners.

**Checks:** typecheck green; 736/736 tests across 88 files; arch:audit quiet (machines.ts 246/300, band at 270).

**Placement audit:** 2 receipts against 3 code commits (d10bc81 rides the v1.42.0 receipt). Everything landed where
the verdicts said; no machine-id literals outside the owners; nothing else decides "free" from owner_id. Clean.

## Findings

1. **§7D.6 said Done now preselects "me" for the dish washer** (LOW, spec drift). v1.43.0 preselects Owner unknown on
   every machine. *Fixed in the same commit as this report:* §7D.6 now says Start preselects me, Done now preselects
   Owner unknown, and an unowned dish-washer card reads "started by owner unknown".
2. **machines.ts: hold the alert-hours seam** (LOW, standing note). 246/300. The §7D.5 block (DayHours/MachineHours,
   DEFAULT_MACHINE_HOURS, hoursOn, machineQuietUntil, machineHoursOf, parseMachineHours, ~45 lines) is extract-first
   to `src/shared/machine-hours.ts` on the next §7D change — not before.

**Carried, unchanged:** pass-7 items 2–6, pass-5 items 1–2, pass-3 items 1 and 3.

**Deliberately not flagged:** the hard-coded "dryer" in MojoSOGO's verbatim Owner-unknown texts; the Fold & out wording
in a laundry-only refusal; the move route's null-`to` path to the invalid_state refusal; doneMessage's null (inactive)
vs undefined (unknown) owner, pinned by UK1.
