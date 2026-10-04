# Placement receipts

One entry per full-path placement decision (new owner row, extract, or
bless-and-raise), newest first. Light-path placements go in the commit message only.
The receipt records the decision; `docs/module-ownership.md` and `scripts/arch.ts`
carry its result.

---

## 2026-10-04 — Each person's house speakers (placement-advisor; feature/house-speakers)

PLACEMENT RECEIPT
- Feature:      §9.2a — each member ticks the house speakers (Home Assistant's Echos and Voice PE) they want to be
  alerted on; a house delivery is written with the speakers of everyone it is for and spoken only there. Migration
  0024 (§4.2w).
- New owners:   `src/shared/speakers.ts` (the rules and the Speaker wire type; pure; imports only vocab);
  `src/worker/speaker-choices.ts` (the one read of members' choices, shared by tick, /announce, /me and
  /house/speakers; D1 reads only); `frontend/src/components/HouseSpeakers.tsx` (hosted by Settings → Me).
- Widened:      house.ts (the drain speaks on the row's speakers; classifyHouse over the called surfaces, `failed`
  when none was called; houseSpeakerList returns HA's raw text); routes/household.ts (`GET /house/speakers`);
  routes/auth.ts (`/me` houseSpeakers); tick.ts and routes/announce.ts (the two house-row writers, changed together);
  vocab.ts (SPEAKER_KIND); state.tsx (Me.houseSpeakers).
- Rejected:     the choices read in house.ts (the drain must not decide speakers), db.ts (generic helpers only) or
  tick.ts (83 %, and household.ts must not import tick); a one-route routes/house.ts.
- Caps:         no reorganizer, no re-pin. tick.ts stays below the band only because the read lives elsewhere.

---

## 2026-10-04 — Snap an item: a list item's photo, named by SogoAI first, Claude second (placement-advisor; feature/snap-item)

PLACEMENT RECEIPT
- Feature:      §7A.3 — 📷 on every list's add row; the server names the photographed item (SogoAI's local vision
  model through the existing helper and tunnel, the Claude API only when SogoAI gives no name); the name fills the
  add box; the photo is kept with the list item (R2) and shown in the ✎ form. Migration 0023 (§4.2v).
- New owners:   `src/shared/item-reading.ts` (the prompt, cleanItemName, the helper's IdentifyReport and its check,
  the ItemReading wire type; pure; imports lists, things (photo limits) and vocab); `src/worker/routes/item-photos.ts`
  (`POST /list-items/read-photo` and `/list-items/{id}/photo`, mounted in index.ts before lists); `home/identify.ts`
  (one LM Studio request → an IdentifyReport; never decides); `frontend/src/components/ItemPhoto.tsx` (the 📷 on the
  add row; no list state).
- Widened:      routes/lists.ts (itemView hasPhoto / updatedAt; `export const loadItem` and ITEM_GONE; an item's or a
  list's delete deletes its items' photos from R2); home-captions.ts (identifyFromHome through access.ts);
  photo-reader.ts (readItemPhoto; claude.ts stays the only SDK importer); home/captions-helper.ts (POST /identify,
  the body read in main() up to IDENTIFY_BODY_MAX); HouseholdLists.tsx (the waiting photo, the hint, the PUT after
  Add, the 📷 row marker); HouseholdListItemForm.tsx (PhotoField as built, saved on Save); vocab.ts
  (IDENTIFY_FAILURE, ITEM_READ_VIA).
- Structure:    `scripts/arch.ts` home/ layer `allowed` gains `src/shared/item-reading.ts` (approved by the
  coordinator). `npm run build:home` stays one file importing only `node:http`: 6.2 kB → 9.8 kB; esbuild keeps one
  line of things.ts (PHOTO_MAX_BYTES), so the things import stays.
- Unchanged:    the POST items / PATCH item bodies, shared/lists.ts, shared/things.ts, thing-photos.ts, things.ts,
  photo-reads.ts, http.ts, house.ts, claude.ts, env.ts, ThingPhoto.tsx, PhotoField.tsx, ThingForm.tsx,
  shrink-photo.ts, api.ts, package.json scripts, captions-helper.cmd.
- Deviation:    `src/worker/access.ts` was on the do-not-touch list; its `AccessRequest.body` type widened from
  `string` to `string | ArrayBuffer` (one line, type only, no behaviour change) so identifyFromHome can send the
  image bytes through it — a string body cannot carry binary, and base64 would have broken the helper's
  `image/*` + byte-cap contract.

## 2026-10-04 — The photo field gets its own owner, ready for list-item photos (reorganizer; refactor/photo-field-seam)

REORG RECEIPT
- Trigger:      the "📷 snap an item" feature puts a list item's photo in the list item's ✎ form, which needs the
  same photo field the thing form uses; that field was file-local to ThingPhoto.tsx, tied to the read-photo call.
  This is preparation for list-item photos.
- Seam moved:   the generic photo field — Thumb (tap for full size inside the dialog), the hidden file input
  (camera/library), lazy shrinkPhoto, the waiting photo's object URL lifecycle, Add / Replace / Remove, the
  step/said/error display, the live ref — from `frontend/src/components/ThingPhoto.tsx` to
  `frontend/src/components/PhotoField.tsx` [NEW owner row], with its styles (.photo, .thumbButton, .thumb, .full)
  from ThingPhoto.module.css to PhotoField.module.css. PhotoField takes an optional
  `read?: (photo: Blob) => Promise<string>` (resolves to the status text, rejects with the refusal) and has no API
  path of its own. ThingPhoto keeps the /things/read-photo call, the "Filled n empty fields…" wording, photoSrc and
  FromThing, and passes the read into PhotoField.
- Room opened:  ThingPhoto.tsx 109 → 48 lines; PhotoField.tsx new at 89; ThingPhoto.module.css 16 → 10,
  PhotoField.module.css new at 7; no CEILINGS entry (all under GLOBAL_FILE_CAP 300).
- Behavior:     PRESERVED — `npm run typecheck && npm test` all green (46 files, 483 tests), `npm run build` ok
  (shrink-photo still its own lazy chunk), `npm run arch:audit` quiet. Verified by reading: every visible text, aria
  name, alt text ("The thing's photo", "Photo for …"), the " The photo is still attached." suffix, the step order
  (Getting the photo ready… → onPick → Reading the photo… → said / refusal) and the class names' rules are
  unchanged; ThingForm.tsx and EventForm.tsx untouched; ThingPhoto's exports (ThingPhoto, photoSrc, FromThing)
  unchanged. One unobservable difference: if the form closes while the read is in flight, onReading now runs
  inside the read before the live check (setState on an unmounted ThingForm, a no-op in React).
- Sources read: CLAUDE.md, docs/modularity.md, docs/module-ownership.md, docs/placement-receipts.md, scripts/arch.ts,
  test/architecture.test.ts (rows), ThingPhoto.tsx + .module.css, ThingForm.tsx (fill, the ThingPhoto call),
  EventForm.tsx (import).
- Restraint:    no list-item photo, no new API path, no change to ThingForm, shrink-photo or FromThing's markup;
  Thumb exported from PhotoField only because FromThing already used it.
- New owner row: | `frontend/src/components/PhotoField.tsx` | A photo inside a form (§8.8, §8.11): hidden file input
  (camera/library), lazy shrink-photo, the waiting photo's object URL, Thumb (tap for full size inside the dialog),
  Add / Replace / Remove, an optional read step with its status and refusal — no API path of its own |

## 2026-10-04 — photoBody to http.ts, the photo-read budget to its own owner (reorganizer; refactor/access-photo-reads-seams, 2 of 2)

REORG RECEIPT
- Trigger:      the "📷 snap an item" feature adds a second photo reader; it needs the same photo-body check and the
  same household daily photo-read budget, both of which were file-local to routes/thing-photos.ts.
- Seam moved:   (a) photoBody (type / size / empty → 400) from `src/worker/routes/thing-photos.ts` to
  `src/worker/http.ts` [EXISTING owner, row widened]; (b) the photo_reads daily cap — householdToday (today in the
  household zone, via db.ts's householdTz, replacing thing-photos' file-local copy of the same query),
  photoReadsUsedUp, recordPhotoRead — from `src/worker/routes/thing-photos.ts` to `src/worker/photo-reads.ts`
  [NEW owner row].
- Room opened:  thing-photos.ts 83 → 64 lines; http.ts 25 → 41; photo-reads.ts new at 24; no CEILINGS entry (all
  under GLOBAL_FILE_CAP 300).
- Behavior:     PRESERVED — `npm run typecheck && npm test` all green, things-api tests unchanged. The §7C.4 order
  (signed in → size/type → daily cap → key present → count the read → call the model) and every status, error
  code and message are identical; same SQL (settings timezone, COUNT over [local midnight, next local midnight),
  INSERT INTO photo_reads), the same `now` for the day and the recorded read.
- Sources read: docs/module-ownership.md, docs/placement-receipts.md, scripts/arch.ts, routes/thing-photos.ts,
  http.ts, db.ts, SPEC.md §7C.4 (by grep).
- Restraint:    the 429 message and READS_PER_DAY's meaning stay in the route; claude.ts, photo-reader.ts, lists,
  the frontend and home/ untouched; recipe_reads' own cap not merged in.
- New owner row: | `src/worker/photo-reads.ts` | The household's daily photo-read budget (§7C.4, §7A.3): today in
  the household zone, used-up check over photo_reads, record one read |

## 2026-10-04 — The Access fetch gets its own owner (reorganizer; refactor/access-photo-reads-seams, 1 of 2)

REORG RECEIPT
- Trigger:      the "📷 snap an item" feature adds a third Worker→home-through-Cloudflare-Access caller; house.ts and
  home-captions.ts each carried their own copy of the Access fetch, and a third copy would be the wrong move.
- Seam moved:   the Access fetch (the two CF-Access headers plus the caller's, redirect 'manual',
  AbortSignal.timeout, 2xx only → { ok: true, text } or "HTTP n: body ≤ 200" / "error: message") from
  `src/worker/house.ts` (ha()) and `src/worker/home-captions.ts` (readCaptionsFromHome) to `src/worker/access.ts`
  (callThroughAccess) [NEW owner row].
- Room opened:  house.ts 122 → 109 lines; home-captions.ts 53 → 40 lines; access.ts new at 42; no CEILINGS entry
  (all under GLOBAL_FILE_CAP 300).
- Behavior:     PRESERVED — `npm run typecheck && npm test` all green, house.test.ts and home-captions*.test.ts
  unchanged. Same URLs, methods, headers (CF-Access pair, Authorization, Content-Type), bodies, timeouts
  (ECHO 15 s, SATELLITE 25 s, HOME_CAPTIONS 20 s), redirect 'manual', status mapping (2xx → ok), reason texts,
  and both still never throw. Two edge cases unify, neither reachable by a test: a failed body read now gives ''
  for both callers (house's old rule; home-captions used to say "error: …" — now "HTTP n: " or the not-JSON reason,
  still a failure), and an error with an empty message reads "error: <String(e)>" for both (home-captions' old
  rule; house used to print "error: "). No 2xx/non-2xx outcome changes for either caller.
- Sources read: CLAUDE.md, docs/module-ownership.md, docs/placement-receipts.md, scripts/arch.ts,
  test/architecture.test.ts, test/home-captions.test.ts, test/ha-helpers.ts, house.ts, home-captions.ts,
  shared/recipe-reading.ts (parseCaptionsReport). docs/modularity.md not re-read this run.
- Restraint:    config readers (houseConfigOf, homeCaptionsConfigOf), classifyHouse, speak and the parse of the
  captions report stay where they were; claude.ts, photo-reader.ts and home/ untouched.
- New owner row: | `src/worker/access.ts` | Calling home through Cloudflare Access (§9.2, §7E.2c, §7A.3): the two
  CF-Access headers, redirect 'manual', AbortSignal.timeout, 2xx only → { ok: true, text } or an honest reason
  ("HTTP n: body ≤ 200" / "error: message"); never throws, never names a secret, never decides; no D1, no Hono |

## 2026-10-04 — Ping the founder's phone from a Claude session (placement-advisor; feature/ops-notify, v1.17.0)

PLACEMENT RECEIPT
- Feature:      §9.4, decided by MojoSOGO 2026-10-04: a Claude Code session on his machines pushes a message to
  the founder's phone from the command line (beside the FunHouse device and the house voice).
- Rules:        NEW owner `src/shared/ops.ts` (pure, imports nothing) — OPS_TEXT_MAX, OPS_TITLE_MAX,
  OPS_TITLE_DEFAULT, OPS_NOTIFY_PER_HOUR, opsNotifyError, opsTitle, opsWindowStart.
- Route:        NEW owner `src/worker/routes/ops.ts` — `POST /ops/notify`: OPS_NOTIFY_TOKEN unset/empty → 503
  `ops_notify_off`, then a file-local constant-time SHA-256 compare (the same approach as home/captions-helper.ts's
  sameSecret, deliberately not imported from home/) → 401; validate → 400; the founder via FOUNDER_SQL; the hourly
  limit counted from deliveries rows → 429 with no row; one fire-less `push` delivery with `title`;
  sendPushDeliveries; 201 `{ deliveries: [{ id, status, detail }] }`. No session, no house row.
- Founder:      `routes/members.ts` FOUNDER_SQL `const` → `export const`; nothing else changed there.
- Push:         `src/worker/push.ts` title passthrough only — the SELECT reads `d.title`; a fire-less delivery's
  title is `d.title ?? ANNOUNCE_TITLE`; tag, Topic and actions unchanged.
- Storage:      migration 0022 `deliveries.title TEXT` (§4.2u).
- Config:       `env.ts` OPS_NOTIFY_TOKEN; vitest pins `test-ops-token`; index.ts mounts ops.
- Untouched:    announce.ts, shared/announce.ts, vocab.ts, house.ts, tick.ts, web-push.ts, the frontend, sw.js.
- Caps:         two new small files under the global cap; no CEILINGS entry added.

## 2026-10-04 — Captions from home, asked in-line (placement-advisor; feature/inline-home-captions, v1.16.0)

PLACEMENT RECEIPT
- Feature:      §7E.2c, decided by MojoSOGO 2026-10-04: no polling. When YouTube blocks the Worker's captions
  request, from-video asks SogoAI in-line through Cloudflare Access and the `sogoai` tunnel, reads the recipe once
  and saves it complete. The job queue and everything that served it are deleted.
- Call:         NEW owner `src/worker/home-captions.ts`, a leaf sibling of house.ts — homeCaptionsConfigOf,
  readCaptionsFromHome (one GET, Access headers + Bearer CAPTIONS_TOKEN, redirect 'manual', 2xx only,
  HOME_CAPTIONS_TIMEOUT_MS = 20 s, parseCaptionsReport); never throws, never names a secret, never decides; no D1,
  no Hono.
- Route:        `src/worker/routes/recipes.ts` from-video — the file-local captionsFor (readCaptions → on blocked,
  HOME_CAPTIONS_OFF when not configured, else readCaptionsFromHome), run beside the comments; §7E.2 check order and
  the counting unchanged; no queue, no UPDATE after the INSERT.
- Re-read:      `src/worker/recipe-reread.ts` loses END_CAPTIONS_JOB, `given.transcript` and the uncounted read
  (countFor: string); the transcript route behaves as before.
- Rules:        `src/shared/recipe-reading.ts` keeps wantsHomeCaptions, CaptionsReport, parseCaptionsReport,
  CAPTIONS_REPORT_REASON_MAX, homeCaptionsError; adds HOME_CAPTIONS_OFF; deletes the CAPTIONS_JOB_* limits, the
  give-up / no-recipe / edited texts and homeRereadMayReplace. `vocab.ts` deletes CAPTIONS_JOB; `recipes.ts` deletes
  the four row columns and captionsPending.
- Deleted:      `src/worker/captions-jobs.ts`, `src/worker/routes/captions.ts` (and their rows), the index.ts mount
  and the scheduled() give-up.
- Storage:      migration 0021 drops 0020's index and four columns (§4.2t); 0020 and its test untouched.
- Config:       `env.ts` HOME_CAPTIONS_URL; wrangler.toml var `https://sogoai.sogodojo.com`; vitest pins
  `https://sogoai.test` (CF_ACCESS_* stay empty, so home is not configured by default).
- Helper:       `home/captions-helper.ts` rewritten as a server — `handle` (no node:http) + `main` (the only
  node:http user, 127.0.0.1:8790). Structure rule approved by the coordinator: the home/ layer's `allowed` gains
  `package:node:http` (SPEC §2.5); test/architecture.test.ts already matches it exactly (resolveImport gives
  `package:node:http`), so it is unchanged.
- PWA:          `RecipeView.tsx` loses the poll, the pending line and the `captionsPending` guard; Recipes.tsx and
  RecipeTranscript.tsx untouched.
- Caps:         every touched file under the global cap; no CEILINGS entry added; arch:audit quiet.

## 2026-10-04 — Captions from home: the SogoAI helper (placement-advisor; feature/home-captions, v1.15.0)

PLACEMENT RECEIPT
- Feature:      §7E.2c — a helper on the home PC polls the Worker for blocked captions, reads them from home with
  the same youtube-captions.ts, reports them; the Worker re-reads the recipe.
- Rules:        `src/shared/vocab.ts` (CAPTIONS_JOB); `src/shared/recipe-reading.ts` (the CAPTIONS_JOB_* limits,
  CAPTIONS_REPORT_REASON_MAX, wantsHomeCaptions, parseCaptionsReport, homeCaptionsError, the give-up / no-recipe /
  edited texts, homeRereadMayReplace); `src/shared/recipes.ts` (the four row columns, `captionsPending`).
- Storage:      migration 0020 (§4.2s). NEW owner `src/worker/captions-jobs.ts` — every write of the job columns
  (queue, conditional claim with stale reclaim and attempts, end statement, give up); `index.ts` scheduled() runs
  giveUpCaptionsJobs beside tick (tick.ts untouched).
- Routes:       NEW owner `src/worker/routes/captions.ts` — claim / report behind a file-local CAPTIONS_TOKEN bearer
  (503 when unset, never open). Queueing stays in routes/recipes.ts from-video, its one place.
- Re-read:      `src/worker/recipe-reread.ts`, feature additions only: its success UPDATE ends any job.
- Helper:       NEW owner `home/captions-helper.ts` under a NEW source root `home/` with its own layer (imports
  nothing but `src/worker/youtube-captions.ts`, via the new `Layer.allowed`; no packages); the other layers ban
  `home/`. Structure rules approved by the coordinator.
- PWA:          `RecipeView.tsx` only (pending line, hidden transcript box, view-local 10 s poll); Recipes.tsx and
  RecipeTranscript.tsx untouched.
- Caps:         every touched file under the global cap; no CEILINGS entry added.

---

## 2026-10-04 — Recipe re-read seam (reorganizer; prepares the SogoAI captions helper)

REORG RECEIPT
- Trigger:      placement-advisor: the re-read path gains a second caller, the SogoAI home captions helper with
  its own routes file; a route file can't import another route's handler body, so the re-read leaves
  `POST /recipes/:id/transcript` first.
- Seam moved:   everything after the keys check — the video + creator's comments re-fetch side by side, counting
  the read, readRecipe, cleanRecipeReading, the found false refusal and the §7E.2b UPDATE — from
  `src/worker/routes/recipes.ts` to `src/worker/recipe-reread.ts` as `rereadRecipe(db, keys, row, given,
  countFor, now)` → `{ ok: true } | { ok: false, kind, reason }` [NEW owner row].
- Room opened:  src/worker/routes/recipes.ts: 234 → 224 lines; ceiling none (global 300) → none (global 300).
  recipe-reread.ts: 43 lines under the global cap. No CEILINGS entry added.
- Behavior:     PRESERVED — verified via `npm run typecheck && npm test && npm run build && npm run arch:audit`
  (444 tests, all green, tests unchanged; R16–R18 included). The route keeps steps 1–6 (recipe, video, text,
  readsUsedUp, keys / readingOff) and maps each kind to today's status, code and message. The read is counted
  only when countFor is set (the route passes the member id, as before), after YouTube answered and before
  Claude. Claude's captions slot still gets the pasted text (`given.transcript ?? given.pasted`; the route
  passes transcript null), and source still comes from sourcesOf with transcript null. updated_at is still a
  fresh nowIso() at the UPDATE, recipe_reads.at still the route's `now`.
- Sources read: CLAUDE.md, docs/module-ownership.md, scripts/arch.ts, src/worker/routes/recipes.ts,
  src/worker/recipe-reader.ts, src/shared/recipe-reading.ts, this file.
- Restraint:    /recipes/from-video, readsUsedUp, readingOff and the body checks stay in the route; youtube*.ts,
  recipe-reader.ts, claude.ts, the shared files, frontend and tests are untouched; no captions-helper job code.
- New owner row: `src/worker/recipe-reread.ts` — re-reading a video recipe in place (§7E.2b, §7E.2c); returns an
  outcome kind + reason, never HTTP; no Hono.

---

## 2026-10-04 — Recipe reading seam (reorganizer; prepares the SogoAI home-PC captions helper)

REORG RECEIPT
- Trigger:      placement-advisor: the SogoAI home-PC captions helper lands in the §7E.2 reading rules, but
  `src/shared/recipes.ts` sat at 292/300 lines, in the warning band — extract the reading rules first.
- Seam moved:   the §7E.2 / §7E.2b video-reading rules (TRANSCRIPT_MAX, PASTED_MAX, SCREENSHOTS_MAX,
  COMMENTS_LOOKED_AT, CREATOR_COMMENTS_MAX, RECIPE_READS_PER_DAY, UNTITLED_VIDEO; VideoText, sourcesOf,
  SCREENSHOT_TYPES, Screenshot, parseScreenshots, hasRecipeText, RecipeReading, creatorComments,
  cleanTranscript, cleanRecipeReading and their private helpers), bodies verbatim, from `src/shared/recipes.ts`
  to `src/shared/recipe-reading.ts` [NEW owner row].
- Room opened:  src/shared/recipes.ts: 292 → 164 lines; ceiling none (global 300) → none (global 300), out of
  the warning band. recipe-reading.ts: 134 lines under the global cap. No CEILINGS entry added.
- Behavior:     PRESERVED — verified via `npm run typecheck && npm test && npm run build && npm run arch:audit`;
  bodies moved verbatim, only import lines and two header comments changed in importers; no re-exports; the
  source vocabulary (RECIPE_SOURCE order), the §7E.2 check order, the daily read cap and the cleaning limits
  are untouched. Imports go one way: recipe-reading → recipes (limits), things, vocab; recipes.ts dropped
  its `./things` import and never imports recipe-reading.
- Sources read: CLAUDE.md, docs/module-ownership.md, scripts/arch.ts, src/shared/recipes.ts, the importers,
  SPEC.md §2 / §7E.2, this file.
- Restraint:    §7E.1 (the link → id), §7E.3 (typed input, the clash), rows and the wire stay in recipes.ts;
  youtube.ts, youtube-captions.ts, claude.ts, recipe-emoji.ts and the recipe components other than
  RecipeTranscript.tsx's import line are untouched; no feature code for the captions helper.
- New owner row: `src/shared/recipe-reading.ts` — reading a recipe from a video (§7E.2, §7E.2b); pure;
  imports recipes (limits), things (photo limits) and vocab only; recipes.ts never imports it.

---

## 2026-10-04 — Paste (or screenshot) the transcript (placement-advisor; course change from MojoSOGO)

- **Ask:** production captions are refused from Cloudflare ("LOGIN_REQUIRED: Sign in to confirm you're not a
  bot"). MojoSOGO copies YouTube's transcript himself and Claude re-reads the recipe from it. Mid-build he
  added: he can't copy text on his phone, only screenshot — so 1–4 screenshots, with pasted text kept as the
  secondary way (a computer).
- **Verdict:** extend the existing owners plus ONE new UI file. `vocab.ts` RECIPE_SOURCE gains `transcript`
  after `captions`. `src/shared/recipes.ts` (pure) gains PASTED_MAX, cleanTranscript, and for screenshots
  SCREENSHOTS_MAX / SCREENSHOT_TYPES / parseScreenshots, reusing things.ts PHOTO_TYPES (less HEIC) and
  PHOTO_MAX_BYTES, never restated; VideoText gains `pasted` / `screenshots` so sourcesOf derives the source.
  `routes/recipes.ts` gains `POST /recipes/{id}/transcript` and ONE file-local `readsUsedUp` helper that
  from-video now shares. `recipe-reader.ts` (added to the boundary by the course change) takes optional
  screenshots as image blocks plus one prompt line; it stays the only home of the prompt. NEW
  `frontend/src/components/RecipeTranscript.tsx`, hosted by RecipeView.
- **Wire choice:** screenshots travel as base64 inside the JSON body (`{ text?, screenshots?: [{ type, data }] }`),
  not multipart and not the raw-body `upload` helper: one request carries up to four images and the text,
  and the base64 goes to Claude's image block as it came, so photo-reader.ts's private base64 helper was
  neither copied nor extracted. The phone shrinks each picture to JPEG with shrink-photo (which also turns
  an Apple HEIC into a JPEG, or says it can't); HEIC reaching the server is refused before any read.
- **Storage:** screenshots are read, never stored — no R2, no migration (§12 keeps photos to Things to do).
- **Deferred:** a retry of the captions attempt as YouTube's iOS client. LOGIN_REQUIRED is IP reputation,
  and nothing in the test suite can reach YouTube from Cloudflare's addresses, so it was not built.
- **Untouched:** youtube.ts, youtube-captions.ts, claude.ts, photo-reader.ts, Recipes.tsx, RecipeForm.tsx,
  Grow.tsx, scripts/arch.ts, migrations/. No ceilings moved. recipes.ts lands at 292 / 300 — in the
  warning band; that is the coordinator's next decision, not this change's.

---

## 2026-10-04 — The video creator's comments as a recipe source (placement-advisor)

- **Ask:** MojoSOGO decided recipes are often in the creator's first (usually pinned) comment, so the
  creator's own comments are read as a third source beside the description and captions.
- **Verdict:** extend the existing owners; no new file. `src/worker/youtube.ts` gains `channelId` on
  `lookUpVideo` and `lookUpComments` (`commentThreads.list`, 403 `commentsDisabled` → `none`), with ONE
  private helper for the fetch / quota / error / key-scrub mapping shared by both (its kinds are a local
  type, not vocab). `src/shared/recipes.ts` (pure) gains `COMMENTS_LOOKED_AT`, `CREATOR_COMMENTS_MAX`,
  `creatorComments` (exact channel match only, null channel → null, reusing the surrogate-safe cut),
  `comments` on VideoText / hasRecipeText / sourcesOf, and `comments_error` / `commentsError` on the row and
  the wire. `vocab.ts` RECIPE_SOURCE gains `comments` before `typed` (no CHECK, no rebuild). Migration 0019
  (§4.2r) adds `recipes.comments_error`. `routes/recipes.ts` runs captions and comments side by side as the
  new §7E.2 step 8, neither fatal. `recipe-reader.ts` adds the "Creator's comments:" section.
  `RecipeView.tsx` names the sources through a label map and adds the comments marker.
- **Untouched:** youtube-captions.ts, claude.ts, env.ts, scripts/arch.ts, recipe-emoji.ts, Recipes.tsx,
  RecipeEmoji.tsx, RecipeForm.tsx. No ceilings moved: recipes.ts had room after the recipe-emoji seam below.

---

## 2026-10-04 — Recipe emoji seam, preparing for reading creator comments (reorganizer)

- **Trigger:** the placement for reading a video's creator comments (§7E) names `src/shared/recipes.ts`
  as the owner, and it sat at 253 / 300 lines carrying two concerns (the recipe rules and §7E.5).
- **Seam moved:** USED_EMOJIS_MAX, myEmoji, byMyEmoji, usedEmojis and their private helpers byText /
  newestFirst, from `src/shared/recipes.ts` to the NEW owner `src/shared/recipe-emoji.ts` (pure; imports
  recipes types only). `RecipeEmoji` / `RecipeEmojiRow` stay in recipes.ts (recipeFromRow and the wire).
- **Room opened:** recipes.ts 253 → 218 lines (recipe-emoji.ts 36) under the global cap (300); no CEILINGS entry added.
- **Behavior:** preserved; bodies moved verbatim, importers (Recipes.tsx, RecipeEmoji.tsx,
  test/recipes.test.ts) repointed; typecheck, tests, build and arch:audit green.
- **Restraint:** nothing else in recipes.ts moved; no creator-comment code added.

---

## 2026-10-03 — Each person's emoji on a recipe (placement-advisor)

- **Ask:** MojoSOGO decided each person can give a recipe their own single emoji (or none, changeable);
  the row shows mine, the view shows everyone's with names, and a Newest | By emoji toggle (remembered
  on the phone) groups the rows by my emoji with unrated ones last.
- **Verdict:** extend the existing owners. A new additive table `recipe_emojis` (migration 0018,
  §4.2q, PK (recipe_id, member_id), written by upsert); `PUT/DELETE /recipes/{id}/emoji` in the
  existing `src/worker/routes/recipes.ts`, the member from the session, validated by the existing
  `emojiError`, never touching `recipes.updated_at`, every recipe answered carrying `emojis` through
  one helper; `RecipeEmoji` / `RecipeEmojiRow`, `recipeFromRow(row, emojis = [])`, `myEmoji`,
  `byMyEmoji` and `usedEmojis` in the existing `src/shared/recipes.ts` (still pure, lists + vocab
  only); one NEW owner, `frontend/src/components/RecipeEmoji.tsx` (the picker); small edits to
  `RecipeView.tsx`, `Recipes.tsx` and `Recipes.module.css`.
- **Why not reuse the event emoji column or optins:** an event's emoji is one per event, shared;
  this is one per person per recipe, so it is its own table. `emoji.ts`, `vocab.ts`, `lists.ts`,
  `routes/optins.ts`, `event-rows.ts`, `state.tsx`, `api.ts`, `App.tsx`, `RecipeForm.tsx` and
  `scripts/arch.ts` are untouched. No ceilings moved; `src/shared/recipes.ts` stays under the global
  cap (253 / 300 lines).

---

## 2026-10-03 — Recipes, a fifth tab (placement-advisor)

- **Ask:** MojoSOGO decided a new 🍳 Recipes tab: paste a YouTube link and the Worker reads the
  recipe from the video's own text (YouTube Data API v3 snippet + an unofficial captions attempt +
  Claude, never inventing one from the title), or type one by hand; a ▶ link and the hotlinked
  thumbnail; Add ingredients to Shopping; household-shared.
- **Verdict:** eight NEW owners, each one concern — `src/shared/recipes.ts` (the rules; pure,
  imports lists + vocab only, `INGREDIENT_MAX` derived from the lists' `TEXT_MAX`),
  `src/worker/youtube.ts` (Data API), `src/worker/youtube-captions.ts` (the unofficial attempt,
  never throws, deletable alone), `src/worker/recipe-reader.ts` (prompt + schema via `claude.ts`),
  `src/worker/routes/recipes.ts` (CRUD + the §7E.2 pipeline), and the PWA's `Recipes.tsx`,
  `RecipeView.tsx`, `RecipeForm.tsx`. Small edits only to `vocab.ts` (`RECIPE_SOURCE`,
  `CAPTIONS_FAILURE`), `env.ts`, `vitest.config.ts`, `index.ts`, `App.tsx` (one NAV entry, one render
  line) and `App.module.css` (the tab grid derives its columns from the tabs).
- **Why not extend Things to do or lists:** a recipe is neither an idea with a window nor a list
  item; it has its own source pipeline and its own wire shape. Add to Shopping reuses the existing
  `POST /lists/{SHOPPING_LIST_ID}/items`, once per ingredient from the PWA — no bulk route, and R11
  asserts every ingredient the rules can produce is accepted by that route.
- **Why the two seams first:** `claude.ts` and `Grow.tsx` were opened (receipt below) so Recipes
  imports them instead of reaching into the photo reader or the thing form. `claude.ts`,
  `photo-reader.ts`, `thing-photos.ts`, `routes/lists.ts`, `shared/lists.ts`, `shared/things.ts`,
  `ThingForm.tsx`, `Grow.tsx`, `HouseholdLists.tsx`, `state.tsx`, `api.ts` and `scripts/arch.ts` are
  untouched. No ceilings moved.

---

## 2026-10-03 — Two seams opened before Recipes (reorganizer)

- **Trigger:** placement-advisor, preparing for Recipes: the Claude plumbing in
  `photo-reader.ts` and the auto-growing `Grow` textarea in `ThingForm.tsx` are each needed by a
  second owner, so each moves out first, in its own behaviour-preserving commit (two-commit rule).
- **Seam 1 (NEW owner row):** the shared Anthropic call (CLAUDE_MODEL, the lazy SDK + zod
  imports, the client with an injectable `fetch`, `beta.messages.parse` with the refusal fallback
  beta, the refusal / cut off / unexpected shape / API error → honest-failure mapping) moved from
  `src/worker/photo-reader.ts` to `src/worker/claude.ts` (`askClaude`). `claude.ts` is now the
  only importer of `@anthropic-ai/sdk` and zod, still only lazily; photo-reader keeps `readPhoto`'s
  signature, its prompt, schema and image block. Its row is narrowed to match.
- **Seam 2 (NEW owner row):** `Grow` moved from `frontend/src/components/ThingForm.tsx` to
  `frontend/src/components/Grow.tsx`, exported unchanged; ThingForm imports it.
- **Behaviour:** preserved — the photo-reader tests in `test/things-api.test.ts` pass unchanged
  (same request body, headers, refusal and API-error results). No ceilings moved: neither file is
  pinned. Recipes itself is not built here.

---

## 2026-10-03 — Sun-timed alerts: the goat alert (placement-advisor)

- **Ask:** MojoSOGO decided a daily alert 30 minutes before local sunset, "Put the goats away —
  sunset at 6:42": each person opts in (off by default), Phone + House, never on the calendar,
  findable only in Optional calendar items; sunset computed locally (NOAA) from the household
  place, ZIP 92056 (33.20 / −117.29).
- **Verdict:** one NEW owner, `src/shared/sun.ts` (pure; `Place`, `sunsetUtc`; imports only
  `time.ts`, never the engine). Everything else is a small edit to existing owners: migration
  0016 (`settings.latitude` / `longitude`, `events.start_sun`), `SUN_EVENT` in `vocab.ts`,
  `planReminderFires(…, place)` and `alertMessage(…, sunsetAt)` in `engine.ts`, the settings read
  and the reminder branch of `sourceOf` in `tick.ts`, `start_sun IS NULL` beside each
  `is_alarm = 0` in `routes/events.ts`, `startSun` on `/fires`, and the Ringing bar label.
- **Why an optional event + `start_sun`, not an opt-in alarm or a hidden flag:** optional events
  already carry everything the goat alert needs — the per-person opt-in, the audience rule (push
  to who has it on, House only when that audience is not empty), Optional calendar items, Done /
  Snooze / renotify / missed. Alarms are never optional and have no opt-in; a hidden flag would
  be a second "not on the calendar" mechanism. A start that IS the sunset is the one new fact, so
  it is one column whose vocabulary lives in `vocab.ts`. `optins.ts`, `routes/optins.ts` and the
  Settings screen are untouched.
- **No all-day fallback:** with no place or no sunset that day (polar) the occurrence is skipped
  — never planned at 09:00. At alert time a sunset that cannot be computed reads "{title} —
  before sunset", visibly not a time.
- **Ringing bar:** a sun reminder's row shows ` · sunset` where an all-day one shows ` · all day`
  (`/fires` carries `startSun`).
- **Production insert:** the coordinator creates the goat event by SQL, never a migration or a
  seed; the statement is in SPEC §14 and must run from a UTF-8 file so the 🐐 survives.

---

## 2026-10-03 — Rolling timer active time range (placement-advisor)

- **Ask:** MojoSOGO decided that a rolling timer may have an optional "Active from HH:MM to
  HH:MM" (household tz): it never rings outside it, its countdown restarts when the window opens
  (60 min on 08:00–21:00 first rings at 09:00), a fire ringing at the close goes quiet and
  resumes after the opening, and no window keeps today's behavior.
- **Verdict:** no new owner. The rule lives in the EXISTING `src/shared/engine.ts` — `TimerWindow`,
  `timerWindow`, `timerWindowError`, `inside`, `nextTimerDue`, `AlertConfig.window`, and a trailing
  optional `window` on `applyTimerCmd`; ack and start both use `nextTimerDue`. The engine stays
  pure and uses only `localToUtc` / `utcToLocal` / `addDays` from `time.ts` (§4.1 DST rules).
- **One guard:** `stepFire` gets a new first rule for timers with a window, so every path that
  could ring — first ring, renotify, a stale fire after an outage, a window edited under a
  planned fire — is stopped in one place. The route does not re-plan the open fire on PATCH.
- **The snooze shape, not a close reason:** the same fire goes back to `scheduled`, due at the
  next opening + interval, `alert_count` 0. No new CLOSE_REASON, no vocab change, no fires
  rebuild, no new fire row.
- **One `householdTz`:** exported from `src/worker/db.ts` for the timer routes; the private copies
  in `routes/alarms.ts`, `routes/chores.ts` and `routes/thing-photos.ts` are left alone (folding
  them in is a separate tidy). `tick.ts` changes only `sourceOf`'s timer branch, reading the tz in
  the same SELECT. Migration 0015 adds two nullable columns with no CHECK; the route validates.

---

## 2026-10-03 — M4l The laundry loop (placement-advisor)

- **Ask:** MojoSOGO decided the laundry loop (the dishwasher deferred): Washer and Dryer on the
  Alarms tab, each free / running / done-waiting; start = whose load + a 30/45/60/90 chip; at
  done-at remind the owner by Phone + House every 15 min up to 4 times; Move to dryer; Fold & out;
  Clear. The weekly Laundry chore (§7B) stays as it is.
- **Verdict:** three NEW owners — `src/shared/machines.ts` (rules and message text, pure, takes
  `now`; imports engine + vocab + time, never the reverse), `src/worker/routes/machines.ts` (the
  `/machines` routes, one batch per transition) and `frontend/src/components/Machines.tsx` (the
  section and the chooser) — plus `migrations/0014_machines.sql` (the `machines` table and the
  `fires` rebuild with kind `machine` + `machine_id`, `uq_machine_open`). Small edits: vocab.ts
  (`machine` kind, MACHINE, MACHINE_STATE), engine.ts (newMachineFire, `machine_id: null` in
  every constructor, an explicit machine branch in alertMessage, `PUSH_ACTIONS.machine = []`,
  applyAction refuses machine fires), tick.ts (insertFire column, a `sourceOf('machine')` branch
  — sourceOf now takes `now`, for the derived "load is waiting"), routes/alerts.ts (`/fires`
  label + owner + machineId), index.ts, Alarms.tsx, RingingBar.tsx, state.tsx.
- **Why not timers:** a timer restarts on Ack and speaks "Timer: …"; a load is handed off from
  one machine to the next and occupies it — bolting handoff and occupancy onto timers would put
  a special case in every timer path. **Why not chore runs:** a run is UNIQUE per chore and date
  and follows the weekly rotation; a load is whoever's load it is, any number of times a day.
- **Reused:** the whole fire pipeline — stepFire (renotify 15 / max 4, never missed), audience
  → push rows + one house row, tick steps 3 and 4, the Ringing bar. push.ts and house.ts are
  untouched; no new ACTION, no new CLOSE_REASON, no new tick planning step (the route inserts the
  fire at start/move, the way timers do).
- **Threats it avoids:** the **fall-through "Chore:" text** (alertMessage's final else is the
  chore sentence — machine has its own explicit branch, tested); a **Ringing bar Done that 409s**
  (machine rows get Move to dryer / Fold & out instead); a **second close path** (applyAction
  refuses machine fires; only the `/machines` routes close them); **double fires on concurrent
  taps** (each machine-row write is guarded by its `started_at` as read inside the same batch as
  the fire writes — a stale guard aborts and rolls back the whole batch → 409 `conflict` — and
  `uq_machine_open` backs it in the schema).
- **Considerations:** no CHECK on `machines.id` (the route validates with isOneOf against MACHINE);
  seeds carry literal timestamps; done-waiting and "load is waiting" are derived, never stored.
  No reorganizer needed: every touched owner had room; CEILINGS untouched.

---

## 2026-10-03 — House delivery direct, the relay retired (placement-advisor)

- **Ask:** MojoSOGO retired the LAN relay. The Worker calls Home Assistant itself at
  `https://ha.sogodojo.com` — a Cloudflare Tunnel (HA's Cloudflared add-on) behind Cloudflare
  Access — with `CF-Access-Client-Id`, `CF-Access-Client-Secret` and `Authorization: Bearer <HA token>`.
- **Verdict:** NEW `src/worker/house.ts`, the sibling of `push.ts`: houseConfigOf (all seven
  settings or null → `house_not_configured`), the drain (exhausted rows fail; up to 5 queued or
  stale-claimed rows, each claimed conditionally just before speaking and spoken only if
  `meta.changes === 1`), speak (the relay's two payloads, 15 s / 25 s ⚑, `redirect: 'manual'`,
  only a 2xx is ok), classifyHouse (`Exclude<DeliveryStatus,'queued'|'claimed'>`), houseState
  (derived from deliveries, never stored; HOUSE_STATE in vocab.ts). EXISTING: tick.ts (step 4),
  routes/announce.ts (read the 201 first, then waitUntil an id-restricted drain),
  routes/household.ts (`/status` `house`), index.ts (relay route removed), env.ts, vocab.ts
  (RELAY_REPORT_STATUS out), the PWA badge/Status (never re-derived), wrangler.toml [vars],
  vitest.config.ts (HA_URL pinned to `https://ha.test`, secrets pinned empty),
  `migrations/0013_retire_relay.sql`, scripts/arch.ts (relay root and bans out; CEILINGS untouched).
  DELETED: `relay/`, `routes/relay.ts`, `test/relay-contract.test.ts`.
- **Threats it avoids:** **double speech** (a tick and an announcement draining one row — the
  conditional per-row claim); **an Access 302 read as ok** (`redirect: 'manual'` + 2xx-only);
  **missing config succeeding quietly** (`house_not_configured`, visibly failed, zero fetches,
  and a "House not set up" badge); **tests reaching the real house** (HA_URL pinned to a fake
  host with empty secrets; tests set fake secrets per call over a fetch spy that refuses every
  other host).
- **Considerations:** a classified `failed` is final (HA or the tunnel down) — retries cover only
  stale claims, as with the relay. No reorganizer needed: house.ts is new, and every touched
  owner had room.

---

## 2026-10-03 — M4k Announcements (placement-advisor)

- **Ask:** Send a house announcement now from the Alarms tab: "<sender> says: <msg>" on Echos +
  Voice PE via the relay, optional push to members.
- **Verdict:** `src/shared/announce.ts`, `src/worker/routes/announce.ts`,
  `frontend/src/components/Announce.tsx` [NEW owner rows]; `src/worker/push.ts`,
  `src/worker/index.ts`, `frontend/src/components/Alarms.tsx` [EXISTING];
  `migrations/0012_announcements.sql` (deliveries.fire_id nullable).
- **Considerations:** an announcement is a delivery with no fire (deliveries is already the relay
  queue; push already has a fire-less payload). Rejected a fire kind 'announce' (widens
  ALERT_KIND, born-closed fire with made-up close_reason) and a new table (second queue). Parity
  fix: PushPayload gains tag so fire-less pushes don't collapse into each other. No reorganizer
  needed. Follow-up for code-steward: delivery INSERT SQL now in tick.ts and routes/announce.ts.

---

## 2026-10-03 — Re-pin after M5 (coordinator)

- `Settings.tsx` ceiling 187 + 40 → **167 + 40**: M5 replaced the placeholder PhoneAlerts with
  `PhoneAlerts.tsx` (a refinement that deleted 20 lines).

---

## 2026-10-03 — M5 Web Push (placement-advisor)

- **Verdict:** NEW `src/worker/web-push.ts` (only importer of `@block65/webcrypto-web-push`;
  per-origin VAPID header cache against a passed-in `now`), NEW `frontend/src/push-client.ts`
  (SW registration + subscribe/unsubscribe, no React), NEW `PhoneAlerts.tsx` (replaces the
  placeholder in Settings). EXISTING `push.ts` (delivery + results + test send), engine.ts
  (`pushActions`), routes/household.ts (`/push/*`), main.tsx (registration call), App.tsx
  (badge text). Static, no row: `frontend/public/sw.js`, `frontend/public/_headers`.
- **Next seam:** `/push/*` → `src/worker/routes/push.ts` when another push route arrives or
  household.ts passes ~200. RingingBar should read `pushActions` (code-steward follow-up).
- **Reorganizer:** none; Settings only shrinks — coordinator re-pins it down after merge.

---

## 2026-10-03 — Re-pin after M4i (coordinator)

- `Settings.tsx` ceiling 219 + 40 → **187 + 40**: M4i deleted the holiday checkboxes and the
  school-holidays section (refinement deletes). Bless-and-raise not needed; nothing extracted.

---

## 2026-10-03 — M4i calendar tidy (placement-advisor)

- **Verdict:** NEW `src/shared/emoji.ts` (the one-emoji rule: one grapheme, Extended_Pictographic
  or Regional_Indicator, ≤ 16 bytes — not \p{Emoji}, which lets "1" through, nor
  \p{Emoji_Presentation}, which rejects 🗑️); NEW `ReminderFields.tsx` (R5, before the
  feature); EXISTING event-rows, events, optins, household (school routes deleted), auth (/me
  prefs), state.tsx, EventForm, Calendar(.module.css), DaySheet, OptionalItems (built-in rows),
  Settings (deletions only), theme.css, seed-dev.mjs; NEW migration 0010.
- **R5:** EventForm 214/235 (in the band) → reminder section verbatim into ReminderFields.tsx,
  no visible text change; merging it into AlertFields stays MojoSOGO's call (changes labels).
- **Settings:** deletions shrink it to ~187/259 — no reorganizer; the MeSettings.tsx seam is
  retired; re-pin Settings down after merge.

---

## 2026-10-03 — M4h optional events + certain weeks (placement-advisor)

- **Verdict:** NEW `src/shared/optins.ts` (the one opt-in rule: isOnFor + audience incl. House;
  tick's private `recipients()` moves here and is deleted), `src/worker/event-rows.ts` (event
  row/input/insert + all event_optins SQL; opened by R1), `src/worker/routes/optins.ts`,
  `frontend/src/components/RepeatFields.tsx` (opened by R2), `OptionalItems.tsx`. EXISTING
  recurrence.ts (setPos lists), events.ts, alerts.ts (/fires filter), tick.ts, EventForm,
  Settings (+2 lines).
- **Reorganizer R1/R2 (R4 refactor: room for M4h):** events.ts was both routes and a library
  for alarms.ts/things.ts → `event-rows.ts`, cap re-pinned down; EventForm's Repeat section →
  `RepeatFields.tsx`, cap re-pinned down.
- **Next seams named:** Settings MeSection + PhoneAlerts → `MeSettings.tsx`; EventForm's reminder
  block deduped onto AlertFields (changes visible labels — a MojoSOGO/code-steward item).

---

## 2026-10-03 — M4g Things to do (placement-advisor)

- **Verdict:** NEW `src/shared/things.ts` (rules, pure; imports engine, never the reverse),
  `src/worker/routes/things.ts` (CRUD + Plan it), `src/worker/routes/thing-photos.ts` (R2 +
  read-photo), `src/worker/photo-reader.ts` (the only importer of `@anthropic-ai/sdk`, lazily),
  `frontend/src/components/{ThingsToDo,ThingForm,ThingPlan,ThingPhoto}.tsx`,
  `frontend/src/shrink-photo.ts`. EXISTING: engine, tick (thing reminder planning), alerts
  (/fires join), events.ts (thingId + exported `insertEventStatement`, budget ≤ 210),
  EventForm (≤ 250, `<FromThing>`), index.ts (stop clobbering Cache-Control), env, api.ts,
  HouseholdLists, RingingBar. Reorganizer: none.
- **Breakages found before building:** M1-VOCAB `status` collision (things vs deliveries →
  keyed by table.column); C13 expected rows gain `thing_id`; RingingBar's exhaustive icon
  map; the /api middleware overwriting the photo's Cache-Control; D13 needs the cap checked
  before the key; vitest pins `ANTHROPIC_API_KEY: ''` so a local key can't reach the API.
- **Next fire kind:** opens the pre-named seam tick.ts → `src/worker/fires.ts` first
  (sourceOf now has three per-kind branches).

---

## 2026-10-03 — M4e Lists of your own (placement-advisor)

- **Rules:** `src/shared/lists.ts` (pure; imports only `./time`, `./vocab`) gains
  `LIST_NAME_MAX`, `LISTS_MAX`, `listNameClash` (keyed by `itemKey`, mirrors
  `renameClash`), `canManageList(createdBy, member)` (creator or admin via the `Role`
  type; seeded lists, `createdBy` null, admins only) and `SHOPPING_LIST_ID` — the one
  place the seeded id is named outside the migration.
- **Schema:** `migrations/0007_custom_lists.sql`, §4.2f verbatim; 0001–0006 untouched.
  `LIST`/`List` leave `vocab.ts`; M1-VOCAB reads the migrated `sqlite_master`.
- **Route:** `src/worker/routes/lists.ts` (same file) owns list CRUD and item CRUD;
  rename/delete permission only through `canManageList`; every item read/write joins
  `lists.deleted_at IS NULL`.
- **PWA:** `HouseholdLists.tsx` keeps the shell + list panel (picker replaces the
  toggle); `HouseholdListItemForm.tsx` takes "Assigned to";
  `HouseholdListOptions.tsx` [NEW owner row] holds the new-list and ⋯ options modals.
  Styles stay in `HouseholdLists.module.css` (no new module CSS).
- **Tests:** `test/lists.test.ts` L1–L19, `test/migration-0007.test.ts` [NEW] L20,
  `test/vocab.test.ts` reads the migrated schema.

---

## 2026-10-03 — R3 refactor: room in HouseholdLists for M4e (reorganizer)

- **Trigger:** M4e placement — `HouseholdLists.tsx` at 216/300 (global cap) estimated
  ~320 with M4e (list picker, create/rename/delete lists, one assignee) in place.
- **Seam moved:** `ItemForm` + the `Item` interface → `HouseholdListItemForm.tsx`
  [NEW owner row], the seam pre-named in the Phase A receipt. `HouseholdLists.tsx`
  imports both; the type moved with the form so the import runs one way (no cycle).
- **Room opened:** `HouseholdLists.tsx` 216 → 158 lines; new file 67. No `CEILINGS`
  change (neither file is pinned; both under the global cap).
- **Behavior:** preserved (typecheck, tests, build green); code moved verbatim, no
  logic, props or imports-at-runtime changed.
- **Restraint:** shell, `ListPanel`, rows and add box untouched; no feature code added.

---

## 2026-10-03 — R2 refactor: room in Settings for M4d Invites (reorganizer)

- **Trigger:** M4d placement — `Settings.tsx` pinned at 264/304 would cross its
  ceiling with the §8.9 invite experience (link + QR + share).
- **Seam moved:** the invites block of `HouseholdSection` → `Invites.tsx` [NEW owner
  row]; `useAction` → `useAction.tsx` [NEW owner row], imported by both.
- **Room opened:** `Settings.tsx` 264 → 219 lines; ceiling `264 + WORKING_BUFFER` →
  `219 + WORKING_BUFFER` (304 → 259).
- **Behavior:** preserved (typecheck, tests, build green). Accepted difference: an
  invite error renders above the invites block, not at the top of Household; invite
  actions now have their own busy flag.
- **Restraint:** Me, Days off, Members, School holidays, Status untouched; no feature
  code added.

---

## 2026-10-03 — M4c Chores (placement-advisor)

- **Ask:** place chores (§7B): pure rules, engine changes, tick planning, API, Alarms →
  Chores section + form, Lists → Today, Ringing-bar chore rows; split into a server
  slice and a UI slice with disjoint files.
- **Verdict:** NEW `src/shared/chores.ts` (whose turn, planning, advance/undo, fire
  context, input validation — pure; imports engine, never the reverse),
  `src/worker/routes/chores.ts` (CRUD, today, done/undo, in-place re-plan; exports
  `completeStep`), `frontend/src/components/{Chores,ChoreForm,ChoresToday,AlertFields}.tsx`.
  EXISTING: `engine.ts` (fire shape + `chore_run_id`, `applyAction` chore/done gate,
  chore message text in `alertMessage`), `tick.ts` (planning, `sourceOf` chore branch,
  recipients fallback), `routes/alerts.ts` (fires-action chore branch → `completeStep`;
  `/fires` chore fields), `index.ts`, `Alarms.tsx`, `App.tsx`, `HouseholdLists.tsx`,
  `RingingBar.tsx`, `state.tsx`, `test/vocab.test.ts`.
- **Reorganizer (UI only, before the UI build):** extract day chips / days text /
  channels / repeat options from `Alarms.tsx` + `Timers.tsx` into `AlertFields.tsx`;
  split `HouseholdLists.tsx` into shell + `ListPanel`; move shared tick-row CSS into
  `Lists.module.css`.
- **Spec gaps found and fixed before dispatch:** `/fires` chore fields; edit re-plans
  runs in place (deleting runs would break `fires.chore_run_id`); `advanceRun`/`undoRun`
  take the open fire; push `done` action for chores.
- **Caps:** nothing near a cap; largest projected `HouseholdLists.tsx` ~215/300.
  Pre-named seams: `tick.ts` → `src/worker/fires.ts`; `chores.ts` → `chore-input.ts`;
  `routes/chores.ts` → `chore-runs.ts`.

---

## 2026-10-03 — Phase A Lists (placement-advisor)

- **Ask:** place household lists (shopping, wish list): item rules, routes, screen, styling.
- **Verdict:** `src/shared/lists.ts` [NEW] (normalization, add/reopen decision, limits,
  30-day window — pure); `src/worker/routes/lists.ts` [NEW] (CRUD; no match logic);
  `frontend/src/components/HouseholdLists.tsx` [NEW] (tab, toggle, rows, item modal);
  `Lists.module.css` reused unchanged — screen-only styles in
  `HouseholdLists.module.css`. Small edits to existing owners: `vocab.ts` (`LIST`),
  `worker/index.ts` (mount), `App.tsx` (tab), `test/vocab.test.ts` (EXPECTED).
- **Why:** add-or-reopen is a decision → rules stage. The screen is not named
  `Lists.tsx` because the existing shared `Lists.module.css` would read as its own.
  Matching is in JS with one normalizer, never SQLite `lower()`/`NOCASE` (ASCII-only).
- **Caps:** no pinned file touched; App.tsx 101/300. If `HouseholdLists.tsx` reaches the
  band, the seam is the item modal → `HouseholdListItemForm.tsx`.
- **Reorganizer:** none needed.

---

## 2026-10-03 — Adopt the architecture guard (bootstrap)

- **Decision:** created the ownership map with one row per existing file (no code
  moved), the `scripts/arch.ts` caps module, and `test/architecture.test.ts`.
- **Placed by:** the coordinating session. There was no map for placement-advisor to
  read yet, so the bootstrap describes what already exists instead of placing
  anything new.
- **Caps:** `GLOBAL_FILE_CAP` 300, `WORKING_BUFFER` 40. Pinned at size + buffer:
  `Settings.tsx` 264, `Calendar.tsx` 262, `EventForm.tsx` 243, `routes/events.ts`
  201. Day one: green, nothing in the warning band (highest 87 %).
- **New owners:** `scripts/arch.ts`, `scripts/arch-types.ts`, `scripts/arch-audit.ts`
  (Tooling).
