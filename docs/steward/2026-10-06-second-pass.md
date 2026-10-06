# Code-steward, second pass (2026-10-06, main at v1.33.1)

**Verdict: minor drift.** All five fixes from pass 1 landed exactly as placed, and the routes no longer import the cron. Typecheck is green, all 662 tests pass, and the audit finds nothing over its cap or in the warning band. What's left is mostly paperwork, plus one small code consolidation in the recipe area.

## Did items 1–5 land well?

Yes, all five did. Each commit has its placement and reorganizer receipts and landed where its verdict said. No code commits are missing a receipt.

Small leftovers the steward accepted:

- The six "close as removed" fire updates stay with their own owners. Each has a different scope.
- The recipe picture still has two `photo_key` writers. That's by design.
- GET /messes still decides in the route who may see an owed mess. There's only one copy, so it can't drift. It moves into the shared rules the next time that file is touched.

## Ranked backlog

| # | What | Severity | Who does it | Size |
|---|------|----------|-------------|------|
| 1 | Fix where SPEC §12 and §14 contradict the code. See "Where the spec contradicts the code" below. | MED | docs | S |
| 2 | Recipe read and re-read still copy their failure handling. The refused / failed mapping is written 4 times, the YouTube "video unavailable" mapping twice, and the Q78 rule "comments turned off is not an error" twice. One shared set of helpers fixes it, and the Q78 rule moves into `shared/recipe-reading.ts`. | LOW-MED | reorganizer | S |
| 3 | The deliveries "kind" question was never recorded. Founder pings are still counted by ruling everything else out, so a future kind of push could quietly count. It needs a ⚑ question in §13. | LOW | docs | S |
| 4 | (pass 1 #6) The title ≤ 120 limit is written 5 times and the 1–1440 range 3 times. `normalizeInviteCode` sits in a route. | LOW | when those files are next touched | S |
| 5 | (pass 1 #7) Map rows have drifted: the `photo-reader.ts` row is garbled, and the `machines.ts` row reads like a changelog. The persist line in `modularity.md` is out of date. SPEC §2's hand-written worker tree is missing about 7 files. | LOW | docs | S |
| 6 | (pass 1 #8) The web-tool version strings are copied into 3 readers. | LOW | when next touched | S |
| 7 | (pass 1 #9) Photo picking is hand-rolled in 4 components. | LOW | when next touched | S-M |
| 8 | (pass 1 #10) A migration 0028 test and a RepeatFields mapping test are still owed. | LOW | worker | S |

The steward's suggested next step: make one docs-only commit for 1, 3 and 5, then do item 2.

## Where the spec contradicts the code

- §12 says the recipe picture is "read-only", but upload and delete shipped in v1.32.0.
- §12's quiet-hours line names only timers as the exception, but machine alert hours are a second one.
- §14's heading is still dated 2026-10-03.
- §14 says "M7 not started" in one place and "M7 live" in another.
- §14 describes M5 Web Push twice.
- `where-things-stand.md` still says v1.19.0 at the top.

## Close to their caps, nothing owed

Calendar.tsx is at 85%, routes/recipes.ts at 85% of its new pin, Settings.tsx 85%, engine.ts 85%, things.ts 84%, EventForm.tsx 83% and chores.ts 80%.

## More from the same pass, run on SogoGamerPC

A second steward run over the same main found these as well. None of them changes behavior.

- **A. One shared "creator or admin may change it" rule.** It's written separately in 4 routes (alarms, alerts, chores, events) and 4 forms. "Admin" is spelled as the literal `'owner'` about 28 times. The fix is a shared `isAdmin` / `canChange`, with placement deciding where they live, then the reorganizer moving the code. Severity MED.
- **B. More spec drift** (this joins item 1 above):
  - §5.7 says machine alerts go to the owner, but they go to every active member. An agent that trusts §5.7 could "fix" that into a regression.
  - §5.7 says tick never writes fire-less deliveries, but mess asks are fire-less deliveries.
  - §5.6 is missing step 3b, the mess asks.
- **C. Photo size constants live in `things.ts` but serve 6 features.** The SogoAI home helper compiles the size cap into its own build. If someone raises the cap and doesn't rebuild the helper, it keeps rejecting the bigger photos, and the tests stay green. The fix is a `src/shared/photos.ts`, plus a deploy-step note saying to rebuild home/ whenever anything it bundles changes. Severity LOW-MED.
- **D. Two wire values are retyped by hand in the PWA.** The list-add result and the delivery-status badges should be typed from vocab.ts. Severity LOW.
- **E. The first-pass report isn't in the repo.** It lives only in the project's shared folder, so a checkout on the PC can't find it. Both reports should go into the repo under `docs/steward/`.
