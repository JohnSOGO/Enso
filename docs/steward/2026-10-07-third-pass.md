# Steward pass 3 — after v1.35.0 (2026-10-07)

**Health:** minor drift. Typecheck green, 690/690 tests, arch:audit quiet. Both code commits since pass 2 have placement receipts.

Backlog, by value (nothing is fixed until MojoSOGO picks):

1. **A flaky test** (MED, small, test-only). `test/roles-api.test.ts` A9 sends ~44 requests under vitest's 5 s default and failed once under the full run on SogoGamerPC. Split it into "own" and "admin's", each with a 30 s timeout (the things-api / recipes precedent).
2. **One sentence, one source** (LOW-MED, small). The refusal "Only the creator or an admin can change this …" is still typed out in routes events/alarms/alerts/chores and in EventForm/Alarms/ChoreForm. Use `cannotChangeText`. The timer form goes read-only but shows no sentence (§6.3 asks for it). The roles.ts comment lists too few kinds.
3. **Spec contradiction on lists** (LOW, MojoSOGO decides). §6.3 says lists use the one sentence; §7A.1 and lists.ts say "Only the person who made this list or an admin…" / "Only an admin can…" (seeded lists). Recommended: name lists as §6.3's exception, no code change.
4. **Notes limit restated** (LOW, small). `event-rows.ts` validates notes against http.ts's default 2000 and a literal, not `EVENT_NOTES_MAX`. Same move pass 2 made for titles.

Deliberately left alone: a shared photo-read budget helper (messages differ by spec), a forbid helper / shared tick check (advisor rejected), a read-only note component, recipes.ts (87%, not in the band; the emoji routes are the ready seam), PWA tests for the read-only forms.
