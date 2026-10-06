# Code-steward, first pass (2026-10-05, main at v1.33.0)

**Verdict: real debt, in five places.** No file is over its cap, the layers are clean and most owners are where they should be. But a few days of building without placement left five problems that get worse with every feature. All five are behavior-preserving extractions that the existing API tests already cover.

On SogoGamerPC, against main at 62f5231, typecheck passes, all 658 tests pass and `arch:audit` finds nothing over its cap. The only file in the warning band is `routes/recipes.ts` at 274/300. Those numbers match what the steward measured itself.

## Ranked backlog

| # | What | Severity | Who does it | Size, risk |
|---|------|----------|-------------|------------|
| 1 | Move the recipe read pipelines (from video, from page, re-read) and the read budget out of `routes/recipes.ts` into `src/worker/recipe-reads.ts`. The route ends up around 170 lines and gets pinned down. | HIGH | reorganizer | M, low-med |
| 2 | Move the fire and chore-run statements and `sourceOf` out of `tick.ts` into a new `fire-rows.ts`. Today three routes import from the cron orchestrator, so the dependency points the wrong way. The machine "every speaker" rule moves into `shared/machines.ts`. | HIGH | reorganizer (placement-advisor names the row) | M, med |
| 3 | Give the deliveries table one owner, `deliveries.ts`. Five files write it 7 different ways, and `ops.ts` counts founder pings by ruling everything else out, so the next new delivery kind could quietly use up the hourly ping limit (a latent bug). | MED | reorganizer | S-M, low |
| 4 | Create one `photo-store.ts` for private photos in R2. Key, put, serve and replace are copied into 6 places, and the recipe picture has two writers. | MED | reorganizer | S-M, low |
| 5 | Move the mess rules (who can answer, settle or delete) out of `routes/messes.ts` and into `shared/messes.ts`. The "can answer" rule is written 3 times, once in the PWA. This is cheapest now, while the feature is a day old. | MED | reorganizer | S, low |
| 6 | Move the timer and event limits and `normalizeInviteCode` into shared. This also covers the 8 route-to-route imports. Do it when those files are next touched. | LOW | placement-advisor, then worker | S |
| 7 | Trim the module-ownership map rows. Several have turned into changelogs or have drifted, and the `photo-reader.ts` row is garbled. | LOW | docs only | S |
| 8 | Add web search and web fetch tool builders to `claude.ts`. The version strings are copied into 3 readers. | LOW | reorganizer | S |
| 9 | Add a `usePhotoPick` hook. Four components hand-roll what `PhotoField` already does. Do it when those files are next touched. | LOW | placement-advisor | S-M |
| 10 | Add a migration 0028 test and a RepeatFields mapping test. | LOW | worker | S |

Its advice: do 1 to 5 before the next big feature, and 6 to 10 only when those files are next touched.

## routes/recipes.ts

At **274/300 (91%)** it's the only file in the warning band, and it's the busiest code file (11 commits). It holds CRUD, emoji and two whole read pipelines. It also writes `INSERT INTO recipe_reads` 4 times across two files and maps errors to HTTP codes the same way 3 times. The 2026-10-05 receipt named the `recipe-reads.ts` seam, but nobody took it. The steward's verdict is to extract, not raise the cap.

Files approaching the band (80–89%), with nothing owed yet: tick.ts 257/300, Calendar.tsx 258/302, engine.ts 255/300, Settings.tsx 176/207, things.ts 252/300, EventForm.tsx 186/223, chores.ts 241/300. The steward says to leave engine.ts and things.ts alone because each is one cohesive concern.

## Code commits with no placement receipt

There are 14, all from before placement was enforced:

- Recipes: v1.32.2 `1e478e6`, v1.32.1 `0a6ad57`, v1.32.0 `a93d113`, v1.31.0 `77c4ef5`, v1.30.0 `68786f3`, v1.29.2 `54e09db`, v1.29.1 `9c52930`
- Washer/dryer: v1.26.0 `9ae12ab`, v1.25.0 `11753e9`, v1.24.0 `52bc6c1`
- Others: v1.22.1 `ebcccbe` (shows), v1.21.1 `0ecf855` (closest location), v1.19.1 `b353be1` (speakers), `3e88d17`

Four more features have receipts that the session wrote itself because no advisor existed yet: v1.23.0 Lists popup, v1.27.0 machine hours, v1.28.0 Chores tab and v1.29.0 recipes from any link.

The steward sampled every receipt-less commit. Most landed in the right owner. Two placements are questionable, and both are folded into items 2 and 4:

- `77c4ef5` writes recipe pictures to R2 from `recipe-reread.ts`.
- `9ae12ab` put the machine "every speaker" rule in `tick.ts`.

The one enforced-era receipt (Whose mess?) checks out: every file landed where the verdict said.

## Spec and docs drift

- SPEC §12 still says there are "four attachments" and that the recipe picture is read-only, but v1.32.0 shipped upload and delete for it.
- SPEC §12's quiet-hours line names only timers as the exception, but machine alert hours are a second one.
- SPEC §14's heading still says 2026-10-03.
- `docs/where-things-stand.md` still says v1.19.0, and its Owed list is missing the newer real-iPhone checks.
