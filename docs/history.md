# Ensō — build history

Moved out of `SPEC.md` in SPEC 2.78 (2026-10-11) so the spec holds only behavior. Section numbers are kept, so
"SPEC §14" and "SPEC §11 M4g" in older notes, commits and receipts point here.

## 11. Milestones

Every milestone ends with `npm run typecheck && npm test` green, plus its own
checks.

**M0 — Skeleton**
- Scaffold per §2.2, wrangler.toml per §10.1, `0001_init.sql`, `/health`,
  `/dev/tick` stub, PWA shell served by the Worker.
- ✅ `npm run dev` → `GET localhost:8787/api/v1/health` returns `{ok:true, db:true}`,
  and the page loads.
- ✅ A Workers-pool test applies `migrations/` and queries `settings`.

**M1 — Shared pure modules**
- `vocab.ts`, `time.ts`, `recurrence.ts`, `holidays.ts`, `engine.ts`.
- ✅ Every row of §5.8 (T1–T11, R1–R14, R9a) and §7.3 acceptance is a passing test.
- ✅ **M1-VOCAB:** every SQL `CHECK (… IN (…))` list in the migrated schema matches its
  `vocab.ts` tuple. The test parses the migration files, and is the only place
  allowed to read SQL as text.

**M2 — Accounts**
- Setup, login/logout, sessions, invites, signup, roles, rate limit; Settings → Me /
  Household (members, invites).
- ✅ API tests:
  - setup works once, then returns 410
  - a used code returns `invalid_code`
  - an expired code returns `invalid_code`
  - a member cannot create an invite (403)
  - the 6th bad login returns 429
  - a disabled member cannot log in

**M3 — Calendar**
- `/calendar`, event CRUD + exdates, continuous view, day sheet, event form,
  holidays, school-holiday editor.
- ✅ API test: a weekly event returns the right occurrences across the DST change.
- ✅ Manual, in Chrome at **320px, 480px and 1024px** wide (DevTools device mode is
  fine):
  - no horizontal scroll
  - Sep 7 2026 (Labor Day) shows the yellow cell + 🛠️
  - the tone changes at Oct 1
  - Today scrolls back
  - the form's Save is reachable on a short screen

**M4 — In-app alerts**
- `tick()`, scheduled handler, `/fires`, actions, timers API + screen, Ringing bar.
- ✅ API test driving `/dev/tick` with explicit times replays T1–T10 end to end
  through the database.
- ✅ Manual: create a 1-min timer, tick, see it ring in the bar, Ack, and see
  "next" update.

**M4a — Scheduled alarms**
- Migration 0002, `/alarms` API, Alarms tab (Scheduled + Rolling timers), alarm form;
  `/calendar` excludes alarms.
- ✅ API tests: an alarm Mon/Wed/Fri 08:00 is absent from `/calendar`, listed by
  `/alarms` with its days, and rings via `/dev/tick` at 08:00 local on a Wednesday
  but not on a Tuesday; an alarm with no days is rejected with a message.

**M4b — Lists**
- Migration 0005, `LIST` vocab, `/lists` API, the Lists tab (§7A, §8.8).
- ✅ API tests L1–L12 (§7A.2). (Superseded in part by M4e: fixed lists → household lists.)
- ✅ Manual at 320 px: four tabs fit on one line; add five shopping items in a row
  without touching anything but the keyboard; tick one, find it under Recently bought,
  put it back.

**M4e — Lists of your own**
- Migration 0007 (lists table, `list_items` rebuilt with `list_id` + `assignee_id`), the
  list picker, new/rename/delete list, assignee on every item (§7A, §8.8). `LIST` leaves
  `vocab.ts`; M1-VOCAB reads the migrated schema.
- ✅ API tests L1–L20.
- ✅ Manual at 320 px: create "Hardware store" from the picker, add two items, assign one,
  tick it, rename the list, delete it.

**M4g — Things to do**
- Migration 0008, `THING_STATUS` + `thing` kind, `src/shared/things.ts`, tick planning of
  thing reminders, `/things` API, R2 photos, photo reading, Lists → Things to do (§7C, §8.11).
- Setup: `wrangler r2 bucket create enso-photos`; `wrangler secret put ANTHROPIC_API_KEY`.
- ✅ Tests D1–D13.
- ✅ Manual on the iPhone: photograph a real flyer → the fields fill → save → a reminder
  rings on its day → Plan it puts it on the calendar.

**M4h — Optional events + "certain weeks"** (street sweeping)
- Migration 0009, `setPos` lists in `recurrence.ts`, opt-in visibility in `/calendar`,
  `/fires` and tick recipients, `/optional-events` + `/events/{id}/optin`, the event form
  (certain weeks, evening before, Optional / On for me), Settings → Me list (§7.5, §8.4, §8.6).
- ✅ §4.3 acceptance incl. 1st & 3rd Thursday; tests O1–O9.
- ✅ Production: "Street sweeping" exists — 1st & 3rd Thursday, all-day, optional,
  reminder the evening before at 8 pm by phone; on for MojoSOGO; everyone else can turn it on.

**M4i — Calendar tidy** (v1.2.0)
- Migration 0010, school holidays removed everywhere, event emoji, day icons beside the
  date at every width, public holidays + 📈 as rows of Optional calendar items (§7.2, §7.5,
  §7.6, §8.4, §8.6).
- ✅ Tests E1–E3; existing holiday/market tests unchanged; no `school` left in code.
- ✅ Production: Street sweeping gets 🧹; a new optional **🗑️ Take out trash**, every Sunday
  at **18:00**, ringing at 18:00 by phone, on for MojoSOGO (decided by MojoSOGO).

**M4j — Thing details** (v1.3.0)
- Migration 0011; address / phone / cost on things (input, wire shape, Plan-it notes);
  photo reading returns them; the thing form's text fields auto-size (§7C.1, §7C.4, §8.11).
- ✅ Tests: the three fields round-trip, their limits 400 with a message, `cleanPhotoReading`
  trims them, Plan-it notes include them.

**M4k — Announcements** (v1.6.0)
- Migration 0012 (`deliveries.fire_id` nullable), `announce.ts`, `POST /announce`, the push
  `tag`, the 📢 Announce box on the Alarms tab (§4.2k, §8.5, §9.1, §9.3).
- ✅ Tests AN1–AN8.
- ✅ Manual: an announcement with House ticked is spoken on the Echos and the Voice PE as
  "{name} says: …"; with Phone ticked it arrives on another member's phone.

**M4n — Sun-timed alerts: the goat alert** (v1.10.0)
- Migration 0016 (`settings.latitude` / `longitude`, `events.start_sun`), `SUN_EVENT`,
  `src/shared/sun.ts`, sunset planning in `planReminderFires`, the sunset text, sun events off
  `/calendar` and the event routes, `startSun` on `/fires` and `· sunset` in the Ringing bar
  (§4.2o, §5.1, §5.7, §7.7, §8.2, §10).
- ✅ Tests S1–S3, G1–G7, SA-M; M1-VOCAB passes with `events.start_sun`.
- ✅ Manual: after the production insert (§14), Shelly and John turn it on in Optional
  calendar items; a real goat alert arrives on their phones and is spoken in the house.

**M4o — Recipes** (v1.11.0)
- Migration 0017 (`recipes`, `recipe_reads`), `RECIPE_SOURCE` / `CAPTIONS_FAILURE`,
  `src/shared/recipes.ts`, `youtube.ts`, `youtube-captions.ts`, `recipe-reader.ts`, the `/recipes`
  routes, the 🍳 Recipes tab with its view and form (§4.2p, §7E, §8.12, §10).
- ✅ Tests R1–R12, RC-M.
- ✅ Manual: the five tabs at 320 px; a real video read on the deployed URL (keys set), its
  ingredients added to Shopping.

**M4p — Each person's recipe emoji** (v1.12.0)
- Migration 0018 (`recipe_emojis`), `PUT/DELETE /recipes/{id}/emoji`, `emojis` on every recipe,
  `myEmoji` / `byMyEmoji` / `usedEmojis`, `RecipeEmoji.tsx`, the Newest | By emoji chips
  (§4.2q, §7E.5, §8.12, §10).
- ✅ Tests RE1–RE9, RE-M.
- ✅ Manual: the chips, the picker and the rows at 320 px; Shelly's and John's emojis both show.

**M4q — The creator's comments** (v1.13.0)
- Migration 0019 (`recipes.comments_error`), `comments` in `RECIPE_SOURCE`, `lookUpComments`,
  `creatorComments`, the comments step in from-video, the prompt's comments section, the source
  note (§4.2r, §7E.2, §8.12, §10).
- ✅ Tests R13–R15, CM-M.
- ✅ Manual: a real video whose recipe is only in the creator's pinned comment, read on the
  deployed URL.

**M4r — The transcript, by hand** (v1.14.0)
- `POST /recipes/{id}/transcript` (screenshots and/or text), `transcript` in `RECIPE_SOURCE`,
  `cleanTranscript`, `PASTED_MAX`, `parseScreenshots`, `SCREENSHOTS_MAX`, the screenshots line in the
  prompt, `RecipeTranscript.tsx` in the recipe view (§7E.2b, §8.12, §10, §12). No migration.
- ✅ Tests R16–R20, R19b.
- ✅ Manual: screenshots of a YouTube transcript taken on the iPhone, read on a "watch it" recipe on
  the deployed URL; the picker and thumbnails at 320 px.

**M4s — Captions from home** (v1.15.0; asked in-line since v1.16.0)
- `home-captions.ts` (Worker → Access → the `sogoai` tunnel → SogoAI, in-line in from-video),
  `HOME_CAPTIONS_URL`, the SogoAI helper as a `127.0.0.1:8790` server and `npm run build:home`; migration
  0020 added the job columns and 0021 drops them (§2, §2.4, §2.5, §4.2s, §4.2t, §7E.2c).
- ✅ Tests H-C1–H-C9, CJ-M, CJ-D.
- ✅ Manual: the helper running on SogoAI as a startup task behind the tunnel; a video blocked from
  Cloudflare read on the deployed URL, saved complete with `captions` in its source.

**M4t — Ping the founder's phone** (v1.17.0)
- Migration 0022 (`deliveries.title`), `src/shared/ops.ts`, `POST /ops/notify`, the title passthrough
  in `push.ts`, `OPS_NOTIFY_TOKEN`, the README's one-liners (§2.4, §4.2u, §9.1, §9.4, §10).
- ✅ Tests ON1–ON9, ON-M.
- ✅ Manual: the secret and the token file set; a ping from a Claude session arrives on the founder's
  iPhone with its title.

**M4x — Movies & shows** (v1.22.0)
- Migration 0026 (`shows`), `SHOW_KIND` / `SHOW_STATUS` / `WATCH_HOW`, `src/shared/shows.ts`,
  `src/shared/show-reading.ts`, `src/worker/show-reader.ts`, the `/shows` routes (`routes/shows.ts`), optional content
  blocks on `askClaudeResearch`, Lists → Movies & shows (`Shows.tsx`, `ShowForm.tsx`) (§3, §4.2y, §7F, §8.8, §8.14,
  §10, §12, §13 Q144–Q155).
- Tests W1–W14, W-M.
- Manual: a real title, a real clip link and a real screenshot looked up on the deployed URL (the first runs against
  the real API); the list and the form at 320 px.

**M4v — Each person's speakers** (v1.19.0)
- Migration 0024 (`member_prefs.house_speakers`, `deliveries.speakers`), `SPEAKER_KIND`, `src/shared/speakers.ts`,
  `src/worker/speaker-choices.ts`, `GET /house/speakers`, `PATCH /me { houseSpeakers }`, the drain speaking on a
  row's speakers, and 🔊 Speak my alerts on in Settings → Me (`HouseSpeakers.tsx`) (§3, §4.2w, §8.6, §9.2, §9.2a,
  §9.3, §10, §13 Q125–Q129).
- ✅ Tests HS1–HS10, HS-M; H1 follows the new classifyHouse.
- Manual: Home Assistant's real list seen in Settings → Me on the iPhone at 320 px; each person ticks theirs; a
  reminder for John alone heard only on his speakers.

**M4u — Snap an item** (v1.18.0)
- Migration 0023 (`list_items.photo_key`), `src/shared/item-reading.ts`, `IDENTIFY_FAILURE` / `ITEM_READ_VIA`,
  `POST /list-items/read-photo` and `/list-items/{id}/photo` (`routes/item-photos.ts`), `identifyFromHome`,
  `readItemPhoto`, the helper's `POST /identify` + `home/identify.ts` (LM Studio on SogoAI), the 📷 on every
  list's add row (`ItemPhoto.tsx`), the 📷 row marker and the photo in the item form (§2, §2.4, §2.5, §3, §4.2v,
  §7A.1, §7A.3, §8.8, §10, §12).
- ✅ Tests SN1–SN15, SN-M.
- ✅ Manual: the helper updated on SogoAI with `IDENTIFY_MODEL`; a real item snapped on the iPhone named by
  SogoAI, added, and its photo seen in the ✎ form; the add row at 320 px.

**M4l — The laundry loop** (v1.8.0)
- Migration 0014 (`machines` + the `fires` rebuild), `MACHINE` / `MACHINE_STATE` + the
  `machine` kind, `src/shared/machines.ts`, the `/machines` routes, machine rows in the
  Ringing bar, the Machines cards + chooser on the Alarms tab (§4.2m, §7D, §8.2, §8.5).
- ✅ Tests L1–L13 (§7D.4); M1-VOCAB passes with the rebuilt `fires`.
- ✅ Manual: at 320 px the two cards and the chooser fit with no sideways scroll; on the
  iPhone a start is two taps; a real done reminder is spoken in the house.

**M4d — Invites**
- `/auth/invite-preview`, the invites list states, the invite card (QR, Share, Copy),
  the join page at `/join`, the welcome card (§6.2a, §8.9).
- ✅ API tests I1–I6.
- ✅ Manual: on the PC create an invite; scan the QR with a phone on the home network;
  the join page greets the invitee by name; join; the welcome card shows once; the
  invite shows **joined** in Settings.

**M4c — Chores**
- Migration 0006 (incl. the `fires` rebuild), `CHORE_TIMING` + `chore` vocab,
  `src/shared/chores.ts`, tick planning, `/chores` + `/chore-runs` API, the Chores
  section + chore form (§8.5), Lists → Today (§8.8), chore rows in the Ringing bar.
- ✅ Tests C1–C14 (§7B.5); M1-VOCAB passes with the rebuilt `fires`.
- ✅ Manual at 320 px: create the Laundry loop; on Today tick step 1, see "rings …";
  undo it; the four tabs still fit.

**M5 — Web Push** (v1.4.0)
- Spike done 2026-10-03 (library chosen, encryption round-trips under workerd, §2.1).
- VAPID keys generated and set (`VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` as vars,
  `VAPID_PRIVATE_KEY` as a secret — piped, never typed through `!`), `sw.js`, Phone alerts row
  in Settings → Me, sending with results, `POST /push/test` (§9.1). P1–P9.
- ✅ Manual, **on the deployed URL**:
  - Android: the notification shows Done/Snooze; tapping Done closes the fire.
  - iPhone home-screen app: the notification arrives, and tapping it opens the
    Ringing bar.
  - A revoked subscription produces a `failed` delivery, visible in Settings →
    Status.

**M6 — House delivery** (the LAN relay until v1.7.0; now direct, §9.2)
- `src/worker/house.ts` (drain, speak via HA through Cloudflare Tunnel + Access,
  `classifyHouse`, `houseState`), tick step 4, `POST /announce` speaking at once, `/status`
  `house`, the "House failing" / "House not set up" badge, migration 0013, tunnel + secrets
  setup steps in README.
- ✅ H1–H9 (§9.2).
- ✅ Manual: an announcement from the Alarms tab is spoken on the Echos **and** the Voice
  PE through the tunnel.
- ✅ Manual: a 1-min timer (or a scheduled reminder) with channel House is spoken.
- ✅ Manual: with the tunnel down, the next house delivery is `failed` and the
  "House failing" badge appears.

**M7 — Production** — `https://enso.sogodojo.com`
- `wrangler d1 create enso` → its id in `wrangler.toml`; `db:migrate:remote`.
- `wrangler.toml`: `[[routes]] pattern = "enso.sogodojo.com", custom_domain = true` (the
  `sogodojo.com` zone is on the same Cloudflare account, like AskRoxy).
- Secrets (§2.4): `SETUP_TOKEN`, 32+ random characters, set with
  `wrangler secret put`; House needs `HA_TOKEN`, `CF_ACCESS_CLIENT_ID` and
  `CF_ACCESS_CLIENT_SECRET` (§9.2). **`DEV_ENDPOINTS` is never set in production** (no `/dev/*`).
  VAPID keys arrive with M5 (§9.1).
- **Production starts clean** (decided by MojoSOGO 2026-10-03): no events, alarms, chores,
  timers, list items or accounts. It carries over from the local dev database only the
  household's settings (name, time zone, days off) and its school holidays. Public
  holidays need nothing — they are computed. Shopping and Wish list exist (migration
  0007), empty.
- The owner is created on the live site with the setup token (§6.1); everyone else joins
  by invite (§6.2a). The local dev database and its test accounts are untouched.
- ✅ The owner can set up, invite a second member, and both receive a shared
  reminder on phone and house.

---

## 14. Prototype status (2026-10-10)

Built: M0–M4 and M4a fully (alarms, with their API tests), plus the later §7 work:
household days off (§7.3), grouped multi-day bars (§7.1), monthly-by-weekday repeat
(§4.3) and the 📈 options-expiration marker (§7.4). M6 was first built as a LAN relay
(relay + API + contract test + logon launcher); v1.7.0 retired it for direct House delivery
(below). **M5 Web Push** is built (v1.3.0, refined in v1.4.0; §9.1): `web-push.ts` sends (VAPID header per
origin, reused for 1 h; parallel sends to one origin share one signing), `push.ts` records
results, `POST /push/test`, `sw.js` (no fetch listener; `_headers` serves it `no-cache` —
checked under `wrangler dev`), the Phone alerts row in Settings → Me. P1–P9 green against a fake
push service, with the payload decrypted by an independent RFC 8291 decryptor (253 tests).
Built as: keys missing → every push delivery `push_not_configured` (checked before
subscriptions); a test push whose every phone fails → 502 with the failure, not `{ sent: 0 }`;
missing keys on `/push/test` → 503; a failed notification action shows a second notification
saying so. **Needs a real phone:** Turn on → Send a test on the iPhone home-screen app and on
Android, the lock-screen reminder, Android Done/Snooze buttons, the Blocked and
add-to-Home-Screen states, and a revoked subscription showing `failed` in Status. **Deviation:** §10's
"refetch when a push arrives" is not built — an open app picks the alert up on its 30 s poll, and a
reopened app reloads (§8.10). The §2.5 architecture guard is in place (map, test, `arch:audit`). M4b Lists is built
with its API tests (L1–L12) and its 320 px manual check passed on 2026-10-03. M4c
Chores is built (C1–C14 green; migration 0006 applied to the local dev database with
existing fires and deliveries intact; the Laundry loop exercised end to end through the
live local API — ring, house message, Done → wait, Undo). **Its 320 px manual check is
still to do** (the browser extension was unavailable). M4d Invites is built (I1–I6 and
the link round-trip tests green; `uqr` builds into its own 10 kB lazy chunk, absent from
the entry chunk). Its manual check — a real QR scanned by a phone at home — is still to do.
**M4f installed app + always fresh** is built: manifest named Ensō with PNG icons, iPhone
home-screen tags, `AppRefresh` (reload on resume unless a dialog is open; pull to refresh)
— verified with real touch events in an emulated phone; its on-iPhone check is still to do.
The ensō mark (scripts/draw-enso.mjs) and the opening screen are built; the 7 iPhone launch
images are rendered from it. Its on-iPhone check is still to do.
**M6 House delivery, direct** (v1.7.0; 273 tests incl. H1–H9 and the rewritten AN3): the LAN
relay is retired (`relay/`, `/relay/*`, `RELAY_TOKEN`, `settings.relay_last_seen` all gone); the
Worker speaks through Cloudflare Tunnel + Access (`src/worker/house.ts`, §9.2) — on each tick
(step 4) and, for an announcement, at once inside `waitUntil`. Tests run against a fake HA at
`https://ha.test` with fake secrets; the pinned test config is "not configured". Built as: with
House not configured, every takeable house row becomes `failed` `house_not_configured` (attempts
unchanged — nothing was tried); a result is written only while the row still carries this drain's
claim. Migration 0013 is applied only in tests so far. **Still owed (manual):** the tunnel, the
Access policy and the three secrets set up (README); a real announcement spoken through the
tunnel on the Echos + Voice PE; a scheduled House reminder spoken; the 🔇 badges and the Status
line seen at 320 px.
**M4k Announcements** (v1.6.0; 266 tests incl. AN1–AN8): 📢 Announce at the top of the Alarms
tab → `POST /announce` → a fire-less `house` delivery the relay spoke (the Worker since v1.7.0) as "{name} says: …" and/or
a push to every other active member, sent at once; migration 0012 makes `deliveries.fire_id`
nullable (applied only in tests so far); the push payload gains `tag`. Built as: Phone only with
nobody else to push to → 409 `no_recipients` rather than a quiet success. **Still to check:**
the box at 320 px and on the iPhone, an announcement spoken on the Echos + Voice PE, and one
arriving on another member's phone.
**Timer active time range** (v1.9.0; 308 tests incl. TW1–TW12, the `/timers` window rows, a
tick across close and open, and TW-M): migration 0015 (`timers.active_from` / `active_to`, no
CHECK), `TimerWindow` / `timerWindow` / `timerWindowError` / `inside` / `nextTimerDue` and
`stepFire` rule 0 in `engine.ts` (the snooze shape — no new close reason, no new fire),
`householdTz` exported once from `db.ts`, `sourceOf`'s timer branch builds `cfg.window`, and the
timer form's Active from / to with the row's `· 08:00–21:00` and a day-naming Next. Built as: a
time that is not `HH:MM`, or only one end set, is 400 "Active from and to must both be HH:MM
times, or both empty."; the form adds a dim "Both empty = always." line under the two inputs.
Migration 0015 is applied only in tests so far. **Still owed (manual):** the form and row at
320 px, and a real timer going quiet at its window's end and ringing after it opens.
**Machine card fix** (v1.8.1): whose load and "done ~20:35" sit on the button line, wrapping —
at 320 px the old one-line layout cut the time off. Two-tap start checked at 320 px.
**M4l The laundry loop** (v1.8.0; 290 tests incl. L1–L13): migration 0014 (`machines`, seeded
free; `fires` rebuilt with kind `machine` + `machine_id`, `uq_machine_open`), `machines.ts`, the
`/machines` routes, the Machines cards + chooser on the Alarms tab, machine rows in the Ringing
bar (Move to dryer / Fold & out). Built as: each transition's machine-row writes are guarded by
the row's `started_at` as read inside the same batch as the fire writes, so a stale tap rolls
the whole batch back (tested with the second of two rows stale) → 409 `conflict`; `sourceOf`
now takes `now` (the dryer's "load is waiting" is derived at alert time); the chooser is a
modal; Clear asks once; a disabled owner's load alerts everyone with "The laundry in the … is
done". Migration 0014 is applied only in tests so far. **Still owed (manual):** the cards and
the chooser at 320 px, a two-tap start on the iPhone, and a real done reminder spoken in the
house.
**M4p Each person's recipe emoji** (v1.12.0; 415 tests incl. RE1–RE9 and RE-M): migration 0018
(`recipe_emojis`), `PUT/DELETE /recipes/{id}/emoji` (the member from the session; `emojiError`; the
recipe's `updatedAt` untouched), `emojis` on every recipe through one route helper (the list in one
joined query), `myEmoji` / `byMyEmoji` / `usedEmojis` in `src/shared/recipes.ts`, `RecipeEmoji.tsx` in
the view, my emoji on each row and the Newest | By emoji chips (`enso.recipeSort`). Built as: equal
By emoji groups compare their newest recipe's `createdAt` alone (with the id too, the emoji string could
never decide); `things-api.test.ts` now warms the SDK in `beforeAll` like the recipe tests (its request test
timed out at 5 s under the full parallel run, on main too). Migration 0018 is
applied only in tests so far. **Still owed:** apply 0018 in production; the chips, the picker and the
rows checked at 320 px and on the iPhone.
**M4o Recipes** (v1.11.0; 394 tests incl. R1–R12 and RC-M): migration 0017 (`recipes`,
`recipe_reads`, `uq_recipe_video`), `RECIPE_SOURCE` / `CAPTIONS_FAILURE`, `src/shared/recipes.ts`,
`youtube.ts` (Data API v3), `youtube-captions.ts` (the unofficial attempt), `recipe-reader.ts` (via
`claude.ts`, untouched), the `/recipes` routes, and the 🍳 Recipes tab with `RecipeView` and `RecipeForm`;
the tab bar is now one equal grid column per tab. Tests reach only fakes: the pinned config has both
keys empty (R2 asserts zero fetches), and the pipeline tests run the real Worker with fake keys and a
fetch spy that refuses every host but the four fakes. Built as: `source` is a JSON list of
`RECIPE_SOURCE` (so no CHECK); `captions_error` keeps the reason text; found is recomputed on every
save as "has ingredients or steps"; the read is counted at step 8 even when Claude is then skipped
(§7E.2); a cut never ends inside an emoji's surrogate pair (found by R11's producer-vs-consumer
check). The recipe tests warm the lazily imported SDK in `beforeAll` — under the full parallel run
the first Claude call's import alone took over 5 s. Migration 0017 is applied only in tests so far.
**Still owed:** apply 0017 in production; set `YOUTUBE_API_KEY` in a real PowerShell window (§2.4);
the five tabs, the paste box, the view and the form checked at 320 px and on the iPhone; a real video
read on the deployed URL (does YouTube let the Worker read captions, or is `captions_error` always
set from Cloudflare's addresses?), and its ingredients added to Shopping.
**M4n Sun-timed alerts — the goat alert** (v1.10.0; 330 tests incl. S1–S3, G1–G7, SA-M and
M1-VOCAB with `events.start_sun`): migration 0016 (`settings.latitude` / `longitude` set to
33.20 / −117.29, `events.start_sun`), `SUN_EVENT`, `src/shared/sun.ts` (NOAA general solar position
algorithm), `planReminderFires(…, place)` skipping an occurrence with no sunset, the sunset text,
sun events off `/calendar` and the event routes, `startSun` on `/fires`, `· sunset` in the Ringing
bar. Built as: `alertMessage`'s trailing `sunsetAt` is `string | null` — `null` reads "— before
sunset"; `sourceOf` reads the place and tz in the reminder SELECT (a join on the settings row).
S1 is checked against an independent implementation of the NOAA spreadsheet formulas in the test;
the general algorithm agrees within ±1 min on the S1 dates (elsewhere in the year it can differ
by up to ~1.4 min, e.g. 2026-09-22, the general algorithm's known accuracy). `migration-0013.test.ts`
now applies migrations only through 0013, so a later settings column does not break H9.
Migration 0016 is applied only in tests so far. **Still owed:** apply 0016 in production, run the
insert below, Shelly and John opt in, and a real goat alert arrives and is spoken.
**Production insert (coordinator only, after 0016 is applied; never a migration or a seed).** Run
it from a **UTF-8 file** (`wrangler d1 execute enso --remote --file goat.sql`) so the 🐐 survives —
never typed into a console. Replace `evt_<16 base32>` with a fresh id (`evt_` + 16 lower-case Crockford
base32 characters, `0123456789abcdefghjkmnpqrstvwxyz`, as `newId` makes) and both `<now>` with the current UTC ISO instant:

```sql
INSERT INTO events (id, title, notes, start_date, start_time, end_date, end_time, recurrence, assigned_to,
  remind_offset_min, remind_channels, renotify_min, max_alerts, created_by, created_at, updated_at,
  is_alarm, optional, emoji, start_sun)
VALUES ('evt_<16 base32>', 'Put the goats away', NULL, '2026-10-03', NULL, '2026-10-03', NULL, '{"freq":"DAILY"}', '[]',
  30, '["push","house"]', 15, 3, (SELECT id FROM members WHERE role = 'owner' ORDER BY created_at LIMIT 1),
  '<now>', '<now>', 0, 1, '🐐', 'sunset');
```

No `event_optins` row is inserted: it is off for everyone until each person turns it on in
Optional calendar items (Shelly and John will).
**M4u Snap an item** (v1.18.0, §7A.3; 540 tests incl. SN1–SN15 and SN-M): decided by MojoSOGO 2026-10-04. 📷 beside
Add on every list (`ItemPhoto.tsx`) → `POST /list-items/read-photo` (`routes/item-photos.ts`): SogoAI first —
`identifyFromHome` POSTs the image through Access to the helper's new `POST /identify`, which asks LM Studio's
`IDENTIFY_MODEL` (`home/identify.ts`) — and the Claude API (`readItemPhoto`) only when SogoAI gives no name, counted
against the shared 40-a-day `photo_reads`. The rules are `src/shared/item-reading.ts`; `IDENTIFY_FAILURE` and
`ITEM_READ_VIA` join vocab. The name fills the box with "Read from your photo — check it."; after Add the waiting
photo is PUT to the item. Migration 0023 (`list_items.photo_key`, §4.2v); `/list-items/{id}/photo` PUT / GET / DELETE;
deleting an item or a list deletes its photos from R2; items carry `hasPhoto` and `updatedAt`; 📷 row marker; the
photo in the ✎ form (PhotoField, saved on Save). `build:home` is still one file importing only `node:http` (6.2 →
9.8 kB). **Deviations:** `src/worker/access.ts`'s `AccessRequest.body` type widened to `string | ArrayBuffer` (type
only) — a string body can't carry the image's bytes. The helper's `main()` reads every request's body (keeping
nothing past 4 MB) before `handle()` checks the path, method and bearer, so the 413 can come after them as specified.
**Still owed (coordinator):** deploy, then apply 0023 in production; update the helper on SogoAI (the new `.mjs`,
`IDENTIFY_MODEL=qwen-uncensored` in its env file, restart; README); a real item snapped on the iPhone and named by
SogoAI; the add row, thumbnail and ✎ form photo checked at 320 px (not checked in a browser in this build).
**M4w Sign in with my phone** (v1.20.0, live 2026-10-04, 0025 applied in production; §6.6, §8.13; decided by MojoSOGO 2026-10-04; 568
tests incl. PL1–PL15 and PL-M): **Sign in with my phone** on the sign-in page (`PhoneSignIn.tsx`, hosted by
`SignIn.tsx`) → `POST /auth/phone-login` → the identical 202 + waiting cookie for every well-formed email (a
decoy row with `member_id` NULL for an unknown, disabled or rate-limited one) and, inside `waitUntil`, a push with
`notice 'login'` and `url` `/approve-login#{id}`; the push opens `ApproveLogin.tsx` (sw.js navigates or opens the
`url`); the right number approves and the waiting browser's next poll claims the row once and gets its session.
Rules in `src/shared/phone-login.ts`, routes in `src/worker/routes/phone-login.ts`; `LOGIN_REQUEST_STATUS`,
`LOGIN_VIEW`, `NOTICE_KIND` join vocab; migration 0025 (§4.2x); the push payload gains `url`; `/ops/notify`'s hourly
count ignores notices; a password sign-in sends "New sign-in on …" to a member with a phone. Built as (not in the
brief): `LOGIN_VIEW` is a vocab tuple (the wire's four statuses, derived, never stored); the column is
`match_number` (`MATCH` is an SQLite operator); a used request polls `expired` but shows `approved` on the phone
(`approveView`); the new-sign-in notice is sent before the login answers rather than in `waitUntil` (a test logging
in must see a settled state — and a member without a phone gets no row); the waiting cookie is `Path`-scoped to
`/api/v1/auth/phone-login`. sw.js's new `notificationclick` branch has no automated test (no test covers sw.js).
**Still owed (coordinator):** merge (0024 / §4.2w and the app version belong to `feature/house-speakers` — bump the
app version at merge), deploy, then apply 0025 in production; on the real iPhone: a PC asks, the push arrives,
tapping it opens the approve page (also from a signed-out phone and with the app already open), the right number
signs the PC in, a wrong one refuses; the sign-in page's new button and both screens checked at 320 px (not checked
in a browser in this build).
**M4t Ping the founder's phone** (v1.17.0, §9.4): decided by MojoSOGO 2026-10-04. `POST /ops/notify` (`routes/ops.ts`,
rules in `src/shared/ops.ts`) — Bearer `OPS_NOTIFY_TOKEN` in constant time (unset → 503 `ops_notify_off`), one
fire-less `push` delivery to the founder (`FOUNDER_SQL`, now exported from `routes/members.ts`) carrying its own
`title` (migration 0022, §4.2u), sent at once; 30 an hour, counted from deliveries rows. `push.ts` shows a fire-less
delivery as `title ?? "📢 Announcement"`. README: the token file and the PowerShell / curl one-liners. Tests
ON1–ON9 and ON-M reach only a fake push service. Built as (a guard the brief did not name): before setup there is no
founder → 409 `no_recipients`, nothing written. **Still owed (coordinator):** deploy, apply 0022 in production,
`wrangler secret put OPS_NOTIFY_TOKEN` and the token file, then a real ping arriving on his iPhone with its title.
**Captions from home, in-line** (v1.16.0, §7E.2c): decided by MojoSOGO 2026-10-04 — no polling. When
YouTube blocks the Worker's captions request, from-video asks SogoAI in-line (`home-captions.ts`: one GET
through Cloudflare Access and the `sogoai` tunnel to `HOME_CAPTIONS_URL`, the `enso-worker` service
token plus Bearer `CAPTIONS_TOKEN`, 20 s), reads the recipe once and saves it complete, counted once.
The job queue is deleted: `captions-jobs.ts`, `routes/captions.ts` (`/captions/claim`, `/captions/report`),
the cron give-up, `CAPTIONS_JOB`, the job texts, `captionsPending` and the PWA's pending line and 10 s
poll. Migration 0021 drops 0020's columns and index (§4.2t). The helper is now a `127.0.0.1:8790` server
(`handle` + a `node:http` `main`); §2.5 allows `package:node:http` in `home/`. Tests H-C1–H-C9, CJ-M,
CJ-D reach only fakes. **Still owed:** deploy the Worker, then apply 0021 in production, then swap the
helper on SogoAI (its env file holds `CAPTIONS_TOKEN` only); a real blocked video read on the deployed
URL, saved with `captions` in its source.
**M4s Captions from home** (v1.15.0, §7E.2c): the first build polled — a job queue on the recipe row
(migration 0020), `POST /captions/claim` / `/captions/report`, and a helper that polled every 10 s.
Superseded by v1.16.0 above; 0020 stays (applied migrations are
never edited) and 0021 drops it.
**M4r The transcript, by hand** (v1.14.0): `POST /recipes/{id}/transcript` (§7E.2b) taking 1–4
screenshots (base64 in JSON, read as image blocks, never stored) and/or pasted text, `transcript` in
`RECIPE_SOURCE`, `cleanTranscript` / `PASTED_MAX` / `parseScreenshots` / `SCREENSHOTS_MAX` in
`src/shared/recipes.ts`, the screenshots line in `recipe-reader.ts`, `RecipeTranscript.tsx` in the recipe
view (§8.12). No migration. The daily-cap check is one helper shared with from-video. Tests
R16–R20 reach only fakes. **Not done:** a retry of the captions attempt as YouTube's iOS client —
LOGIN_REQUIRED is IP reputation, and no test can reach Cloudflare's addresses, so it is deferred.
**Still owed:** real transcript screenshots from the iPhone read on the deployed URL; the picker,
thumbnails and paste box checked at 320 px on the iPhone (the file picker's Photo Library / Take Photo
sheet is iOS-only).
**M4q The creator's comments** (v1.13.0): migration 0019 (`recipes.comments_error`), `comments`
in `RECIPE_SOURCE`, `lookUpComments` in `youtube.ts` (one shared failure mapping with `lookUpVideo`),
`creatorComments` in `src/shared/recipes.ts`, the comments step run beside the captions attempt, the
prompt's "Creator's comments" section and the source note. Tests reach only fakes (every from-video
world answers `commentThreads`). Migration 0019 is applied only in tests so far. **Still owed:** apply
0019 in production; a real video whose recipe is only in the creator's comment read on the deployed URL.
**Captions fix** (v1.12.1): captions are read through YouTube's player endpoint as its Android app;
the website route returned empty caption files for every video. Four real videos read from the home
PC, and verified in production 2026-10-04: "Blending Chicken" re-read from the description and
captions (5 ingredients, 6 steps — it had been "watch it").
**Pings on the FunHouse** (v1.50.0, §9.4a; asked by MojoSOGO 2026-10-11; FP1–FP6): `GET /ops/pings` lists the founder
pings of the last hour, and `home/funhouse-poller.ts` on the dev PC polls it every 15 s and hands Claude's (🤖 / 🧵) to
the FunHouse bridge on 127.0.0.1:8765, one a poll. Project threads in the cloud ping with the title "🧵 Thread needs
you" once their environment carries `ENSO_OPS_NOTIFY_TOKEN` and allows enso.sogodojo.com. Q228–Q229 are ⚑ defaults.
**Still owed:** start the poller on the dev PC (README); a real thread ping seen on the phone and the FunHouse.
**Settings menu** (v1.49.0, §8.6; asked by MojoSOGO 2026-10-11; SM1–SM4): the Settings tab is a grid of eight
buttons like the Lists popup (shared `PickGrid`): Me, Calendar items, Phone alerts, Speakers, Alerts, Household,
Members, Status (the admin two hidden from others). Each opens its area in a modal; closing returns to the grid. Log
out is under the grid. A tapped alert notification opens Alerts on its card. No setting changed; §8.6 no longer lists
push subscriptions under Status, which was never built there (Phone alerts shows this phone's state). Q226–Q227 are
⚑ defaults. **Still owed:** check the grid and each area on the iPhone at 320 px.
**My alerts** (v1.48.0, §9.5, §4.2zn; asked by MojoSOGO 2026-10-11; MA1–MA8, MA-M): Settings → Alerts lists every
push I got (newest 200), each line with a red ❌, Clear all at the top, a tap opens its card with the whole message,
time, source and result. Tapping a phone notification opens the app on that card. Migration 0041. Q221–Q225 are ⚑
defaults. **Still owed:** tap a real Ozymandias ping on the iPhone and land on its card.
**Alert when done** (v1.47.0, §7D.7, §4.2zm; asked by MojoSOGO 2026-10-11; AL1–AL6, AL-M): starting a machine (or
Done now) asks *Alert when done* — Nobody · phones only, or a member (preselected to whose load). With nobody, every
phone hears it and no speaker does; with someone, as before. Owner unknown on Done now means nobody. Loads already
running keep alerting their owner. Migration 0040. Q217–Q220 are ⚑ defaults. **Still owed:** start the dish washer
with Nobody and hear only phones.
**Phone first, then the house** (v1.46.0, §9.2d; asked by MojoSOGO 2026-10-10; PF1–PF3): an alert with Phone and House
that repeats rings phones only the first time and adds the speakers from the second alert. House-only and one-shot
alerts speak at once. Q215–Q216 are ⚑ defaults. **Still owed:** hear it on a real repeating alert.
**I'm away on an alert** (v1.46.0, §9.2c, §4.2zl; asked by MojoSOGO 2026-10-10; AW1–AW4, AW-M): every Ringing bar
row has **Away**: that alert stops speaking on the house speakers, stays open, and phones keep reminding until it is
done. Migration 0039. Q213–Q214 are ⚑ defaults. Built as: the Away answer returns the caller's fire even when it is an
optional reminder hidden from their own list (§7.5). **Still owed:** tap Away on a real repeating alert and hear the
speakers stay quiet while the phone keeps buzzing.
**Quiet the house** (v1.45.0, §9.2b, §4.2zk; asked by MojoSOGO 2026-10-10; HQ1–HQ6, HQ-M): Alarms → 🤫 Quiet the
house for 1 hour, 2 hours, 4 hours or the rest of today. While quiet no speaker says anything (alerts, timer
starts, announcements); phones get every alert as before. It ends on its own, or with Turn off now, and shows who
set it. Migration 0038. Q209–Q212 are ⚑ defaults. **Still owed:** quiet the house on the iPhone and see a phone
alert arrive while the speakers stay silent.
**Tab bar flush + build stamp** (v1.44.0, §8.1; asked by MojoSOGO 2026-10-10): the app frame is fixed to the
whole screen so the tab bar sits on the bottom edge of the installed iPhone app, and the opening screen's build
stamp shows all the time under the tabs (Q208 ⚑). No migration. **Still owed:** see it on the iPhone.
**Owner unknown on Done now** (v1.43.0, §7D.2–7D.3; asked by MojoSOGO 2026-10-10; UK1–UK2): Done now on a free
machine no longer assumes an owner (Owner unknown is preselected). A load with no owner alerts "Clothes washer
finished; Owner unknown; Please cycle to dryer" / "Clothes dryer finished: Owner unknown: Please unload", moves on
unowned, and the card and Ringing bar say "owner unknown". The clothes washer's 45 min chip is dropped. No migration.
**Still owed:** a Done now with nobody named, heard on a speaker.
**Clothes washer, clothes dryer and dish washer** (v1.42.0, §7D.6, §4.2zj; asked by MojoSOGO 2026-10-10; DW1–DW4,
DW-M): Washer and Dryer are now labelled Clothes washer and Clothes dryer (ids and data unchanged), and a third card,
🍽️ Dish washer, starts, rings when done, Done now / Still loaded / Clear like the laundry, and ends with Emptied. The
card shows who started it ("started by Sam"). The clothes washer's chips are 30 / 60 / 90 / 120. Migration 0037. Q204–Q207 are ⚑ defaults. **Still owed:** a real
dish washer load started and emptied on the iPhone.
**Weather on the calendar** (v1.41.0, §7.11, §4.2zi; asked by MojoSOGO 2026-10-10; WX1–WX6, WX-M): the next 7 days
each show the forecast emoji in the cell's corner, and the day sheet says the words, high and low. Open-Meteo, once a
day from the minute tick, at the household place. Migration 0036. Q200–Q203 are ⚑ defaults. **Still owed:** see it
live on the iPhone after the first refresh.
**Things to bring** (v1.40.0, §7.10; asked by MojoSOGO 2026-10-10; EB1–EB5, EB-M): an event has an optional list
of things to bring, edited under the Address, and its reminder says "— bring: a, b and c" on the phone and the
speakers. Migration 0035. Q198–Q199 are ⚑ defaults. **Still owed:** hearing a real reminder with a list.
**Paste a link into an event** (v1.39.0, §7.9; asked by MojoSOGO 2026-10-09; EA6–EA7): Paste now finds a copied
link on the iPhone (`text/uri-list`), and a paste that is one link reads the page (fetch, look-up, fill) on the same
budget. No migration. Q197 is a ⚑ default. **Still owed:** pasting the incognitosd.com event link on the iPhone.
**Update an event from later info** (v1.38.0, §7.9a; asked by MojoSOGO 2026-10-09; EU1–EU5): 📷 Screenshot and
📋 Paste sit above the Title on new and existing events; on an existing one what was copied updates the form
(title kept, notes added under), and nothing saves until Save. Paste moved there from the Address box and now
fills the whole form (Q195). No migration. Q196 is a ⚑ default. **Still owed:** pasting a "moved to…" text onto a
real event on the iPhone.
**An event's address, paste to fill** (v1.37.0, §7.9, §4.2zg; asked by MojoSOGO 2026-10-09; EA1–EA5, EA-M): an
optional Address on every event with 📋 Paste (the clipboard's picture through `/events/read-photo`, its text through
the new `POST /events/read-text`, both on the 40-a-day budget) and Open in Maps. A screenshot's location now fills the
Address instead of the first line of Notes (Q190). Migration 0034. Q193–Q195 are ⚑ defaults. **Still owed:** Paste
tried on the iPhone with a copied text and a copied screenshot.
**Rolling timer day start** (v1.36.0, §5.5a, §4.2zf; asked by MojoSOGO 2026-10-08; TS1–TS5, TS-M): a timer with
active hours can **📢 Announce the start of each day** — when its window opens the house and phones hear
"Pushups timer started — every 60 minutes"; then it rings after the interval and each Ack starts the next one,
as before. Migration 0033. Q191–Q192 are ⚑ defaults. **Still owed:** hearing it at a real window opening.
**Own entries only** (v1.35.0, §6.3; asked by MojoSOGO 2026-10-07 before adding two kids as plain members; A8–A12):
writes to someone else's thing, show, recipe or list item (and their photos, Plan it, a recipe re-read) and to the areas
of someone else's chore are now 403 `forbidden` for a non-admin; checking a list item, want / watched on a show, alarm
acks, chore steps, the machines and mess answers stay open to everyone. The forms go read-only for those entries
(`cannotChangeText` in `shared/roles.ts`). Q10, Q66, Q154, Q163 and Q175 changed accordingly. No migration. This applies to
every non-admin member, adults too. **Still owed:** a kid's phone check (ack an alarm, answer a mess, tick Shopping).
**Fill in an event from a screenshot** (v1.34.0, §7.8; asked by MojoSOGO 2026-10-06; EP1–EP6): 📷 Fill in from a
screenshot in the new-event form, `POST /events/read-photo` on the shared 40-a-day photo budget, fields the person
hasn't changed filled (timed or All day), the location as the first line of Notes. No migration. Q187–Q190 are ⚑
defaults. **Still owed:** a real invite screenshot read on the iPhone.
**Steward pass 2, everything** (v1.33.2; approved by MojoSOGO 2026-10-06; behavior unchanged): each code item was placed
by the placement-advisor and moved by the reorganizer in its own commit. There are four new owners: `src/shared/roles.ts`
(ADMIN_ROLE, isAdmin, canChange: one creator-or-admin rule for routes and forms), `src/shared/photos.ts` (photo limits,
bundled into home/), `src/shared/alert-limits.ts` (title and interval limits) and `frontend/src/components/usePhotoPick.tsx`.
`canSee` joined the mess rules, normalizeInviteCode moved to `invite-link.ts`, the recipe read failures became one union
with the Q78 rule as `commentsError`, the web-tool builders moved into `claude.ts`, and the list-add result is now
vocabulary. New tests: migration 0028 and the RepeatFields mappings. Reports: `docs/steward/`.
**Steward pass 1, items 1–5** (v1.33.1; approved by MojoSOGO 2026-10-05; behavior unchanged): the first
code-steward pass's top five, each placed by the placement-advisor and moved by the reorganizer in its own commit.
New owners `src/worker/recipe-reads.ts` (the recipe read pipelines and budget; `routes/recipes.ts` 274 → 229),
`fire-rows.ts` (fire and chore-run rows and `sourceOf`; `tick.ts` 257 → 108), `deliveries.ts` (every deliveries
INSERT and the founder-ping count, now under test), `photo-store.ts` (private R2 photos); the mess permissions
moved into `src/shared/messes.ts`, shared by the route and the PWA. Report: `steward/2026-10-05-first-pass.md`.
**Whose mess?** (v1.33.0, §7B.7, §8.15a, §4.2ze; asked by MojoSOGO 2026-10-05, after an AREC; MS1–MS14, MS-M):
📸 Report a mess in the Chores tab, That was me / Not me asked by push up to 4 times 15 min apart and by an in-app
banner, To talk about for unclaimed messes with the outcome recorded by an admin, and a Balances card of who owes
whom. Migration 0032. Q177–Q185 (all but Q183's asks) are ⚑ defaults. **Still owed:** apply 0032 in production;
the camera from the button and a push opening the banner on the real iPhone.
**Whole pictures in the recipe list** (v1.32.1–1.32.2, §8.12; asked by MojoSOGO 2026-10-05): a recipe's own picture
is scaled to fit the usual 64 × 36 row slot, never cropped, and every row keeps one height (Q176, decided).
**A recipe's picture by hand** (v1.32.0, §8.12; asked by MojoSOGO 2026-10-05; RL13): 📷 Add photo in the recipe
form sets the recipe's picture with nothing read. Q175 is a ⚑ default.
**A recipe's screenshot as its picture** (v1.31.0, §7E.2b, §8.12, §4.2zd; asked by MojoSOGO 2026-10-05; RL12, RP-M):
the first screenshot of a read that succeeds is kept in R2 and shown whole at the top of the recipe and as its row
picture. Migration 0031. Q174 is a ⚑ default. **Still owed:** apply 0031 in production.
**Screenshots in the recipe form** (v1.30.0, §8.12, §7E.2b; asked by MojoSOGO 2026-10-05; RL11): ✎ Edit on any
recipe, typed ones included, offers Fill in from screenshots; a typed recipe's screenshots are read by Claude alone.
Q173 is a ⚑ default.
**US units** (v1.29.2, §7E.2; asked by MojoSOGO 2026-10-05; RL10): readings convert metric to °F, ounces / pounds,
cups / spoons and inches. Q172 is a ⚑ default.
**Recipes in English** (v1.29.1, §7E.2; asked by MojoSOGO 2026-10-05; RL10): every recipe reading — video,
transcript or link — is saved in English, a Spanish reel's recipe translated. Q171 is a ⚑ default.
**Recipes from any link** (v1.29.0, §7E.6, §4.2zc; asked by MojoSOGO 2026-10-05; RL1–RL9, RL-M): the paste box
takes any link and detects its kind — a YouTube video reads as before; a Facebook reel or post, a recipe site or
any page is fetched (a login wall kept, never fatal) and looked up by Claude with web fetch and search, then
filled with the recipe schema. The link is cleaned of share and tracking junk and is the duplicate key.
`/recipes/from-video` is now the same handler as `/recipes/from-link`. Migration 0030. Q167–Q170 are ⚑ defaults.
Tests reach only fakes. **Still owed:** apply 0030 in production; the Facebook reel from the ask read on the
deployed URL (Facebook may show the Worker a login wall; then Claude's own fetch and search are what is left,
and the screenshots fallback).
**Chores tab + what done looks like** (v1.28.0, §7B.6, §8.15, §4.2zb; asked by MojoSOGO 2026-10-05; CA1–CA8,
CA-M): chores have their own 🧹 tab (Today, All chores) and left Alarms and the Lists popup; each chore has a
**What done looks like** sheet of areas with photos and expectations, editable by anyone. Migration 0029. Q163–Q166
are ⚑ defaults. Checked at 320 px in an emulated phone: the six tabs fit, the sheet and the area editor
lay out. **Still owed:** apply 0029 in production; the same on the iPhone, with a real camera photo.
**Machine alert hours** (v1.27.0, §7D.5, §5.3 rule 0b, §4.2za; asked by MojoSOGO 2026-10-05; L19–L21): washer and dryer
alerts sound only weekdays 5:30–8:30pm and weekends 9am–9pm, editable by admins on the Machines section; outside
them an alert waits and the reminders start over at the opening. Migration 0028. Q162 is a ⚑ default.
**Machine alerts to all devices** (v1.26.0, §7D.3; asked by MojoSOGO 2026-10-05; L4, HS11): washer and dryer
alerts push every active member and are spoken on every speaker HA lists (Everywhere left out), whatever anyone
ticked. Q161's Everywhere rule is a ⚑ default.
**Done now** (v1.25.0, §7D.2, §8.5; asked by MojoSOGO 2026-10-05; L16–L17): the app tolerates loads nobody recorded.
A free machine's **Done now** asks whose load and marks it done now; a running one's finishes early. The done alerts
ring at once. No migration. Q160 is a ⚑ default awaiting MojoSOGO.
**Still loaded** (v1.24.0, §7D.2–7D.3, §8.5; asked by MojoSOGO 2026-10-05; L14–L15): a done washer or dryer card
offers **Still loaded**, which closes its fire `superseded` and starts a new one now, so the 15-minute reminders run
again from the first, telling the household to move the load to the dryer or take it out. No migration. Q159 is a ⚑
default awaiting MojoSOGO.
**Lists popup** (v1.23.0, §8.8, §7A.1; asked by MojoSOGO 2026-10-05; L21–L22 and LE-M): tapping 🛒 Lists in the tab
bar opens a popup of buttons, one per list with its emoji and open count, the remembered list marked; the old
`<select>` is gone. Lists gain an emoji (migration 0027, §4.2z), set in the new-list form and ⋯ options, else picked
from the name. Checked locally at 375 px (two columns, names wrap to two lines, the remembered list marked). Q157–Q158 are ⚑ defaults awaiting MojoSOGO.
**M4x Movies & shows** (v1.22.0, §7F, §8.14; asked by MojoSOGO 2026-10-05; 596 tests incl. W1–W14 and W-M): Lists →
**Movies & shows** — type a title, paste a link or snap a picture, and **Find** has Claude look it up (web search ≤ 5
with `user_location` country US, web fetch ≤ 3) and fill the show form: Rotten Tomatoes critics / audience, how to watch
in the US (theaters closest to home, streaming, tv, rent, buy), summary. Nothing is saved until Save; Check again
refreshes a saved one; Watched records who and when. Counted in the 40-a-day `photo_reads` budget. Migration 0026
(§4.2y). Placement: `spendPhotoRead` (photo-reads.ts) and `householdPlace` (db.ts) opened first in their own commit.
Built as (not in the first draft of the spec): **Add it by hand** after a failed or empty look-up, so a show can always
be added. Checked locally at 320 px (rows one line, 44 px, no sideways scroll; the form fits) with the look-up off; the
look-up itself is tested only against a fake Claude. **Still owed:** a real title, clip link and screenshot looked up on
the deployed URL (the first run against the real API); v1.22.1 reads a YouTube link's comments (W15); Q144–Q156 are ⚑ defaults awaiting MojoSOGO; follow-ups in §12.2.
**Fill a thing from a link** (v1.21.0, §7C.4b, §8.11; asked by MojoSOGO 2026-10-04; D14–D22 green; v1.21.1 picks the location closest to home): under the thing
form's Link, **🔗 Fill in from this link** fetches the page from the Worker (title, meta, JSON-LD, text), has Claude
look it up with web search (≤ 3) and web fetch (≤ 2), then fills the empty fields marked *from link — check it*.
Counted in the 40-a-day `photo_reads` budget. No migration. Tests reach only a fake site and a fake Claude; the
pairing of server tools and the two requests has **not yet been run against the real API**. **Still owed:** a real
event link read on the deployed URL; Q138–Q142 are ⚑ defaults awaiting MojoSOGO.
**M4v Each person's speakers** (v1.19.0, §9.2a; 552 tests incl. HS1–HS10 and HS-M): decided by MojoSOGO
2026-10-04. Settings → Me lists Home Assistant's Echos and Voice PE, asked live through the tunnel with one
`/api/template` call; each person ticks theirs. A house delivery is written with the speakers of everyone it is for
(the union; anyone not chosen, or nobody at all, → the default speakers, as before) and spoken only there; a surface
with no speaker is not called. Built as: `classifyHouse` takes the called surfaces' results and is `failed` when none
was called (never a quiet `sent`); the screen shows "not chosen" with every box unticked and names the defaults.
Migration 0024 applied in production and v1.19.0 deployed 2026-10-04. The real list (15 Alexa entries + the
Voice PE) seen on MojoSOGO's phone; v1.19.1 hides the Alexa apps and labels the rest Alexa (Q130). **Still owed:** the real speaker list seen
on the iPhone (the template's `integration_entities('alexa_media')` may list more than the four Echos); each person's
ticks; a reminder for one person heard only on their speakers.
**Identify fix** (v1.18.1): SogoAI's qwen3.6 thinks even with ` /no_think`; at `max_tokens` 100 it was cut off
with an empty answer every time, which silently sent every photo to the paid Claude fallback. Now 1024
(`IDENTIFY_MAX_TOKENS`), and a cut-off empty answer is an honest `failed` ("ran out of room"). Verified through
the tunnel with a real photo. **Verified by MojoSOGO 2026-10-04 on his phone:** a soy-sauce bottle read by SogoAI
as "Signature Select Less Sodium Soy Sauce", added to Shopping with its photo kept; no Claude read used.
**Verified by MojoSOGO 2026-10-03:** 📢 announcements spoken through the tunnel (Echos + Voice PE
`ok`); John opted in to 🐐 Put the goats away (first real alert 2026-10-04 18:00, sunset 18:30).
**Push fix** (v1.7.1): no `Topic` header — Apple refused pushes carrying one (BadWebPushTopic)
since v1.6.0. Verified 2026-10-03: a test push arrived on MojoSOGO's iPhone home-screen app.
**Emoji instead of a dot** (v1.5.1): on phones an event whose emoji shows beside the date has no
dot (§7.1); checked at 320 px.
**Open from the thing form** (v1.5.0): ↗ link, 🗺️ maps, 📞 call beside the fields, checked at
320 px (44 px buttons, no sideways scroll). Still to check on the iPhone: Maps and the call sheet open.
**Link fix** (v1.4.1; 260 tests): one `webLink` rule — a bare `www.….com` from a flyer or typed
is kept with `https://` added; other schemes are refused (§7C.1).
**M4j thing details** are built (v1.3.0; 245 tests): address / phone / cost, photo reading
fills them, the form's text fields grow to fit. Title and Link stay one line.
**M4i calendar tidy** is built (v1.2.0; 243 tests; 0010 applied locally with nothing but the
school table lost; no "school" left in code). Checked at 320 and 440 px: day icons sit on the
date's line inside the cell (15🧹, 16📈, 18🗑️). Known limit: on the **1st** of a month the
month tag ("OCT") fills the line, so that day's icon is clipped (still in the day sheet).
**M4h optional events + certain weeks** is built (O1–O9 + §4.3 rows green, 225 tests; 0009
applied locally with nothing lost; v1.1.0). Built as: reminders of optional events are planned
for everyone and only deliveries and /fires are filtered; a non-optional event's House rule is
unchanged; a single-week list stays "certain weeks" in the form. **Owed (warning band):**
`EventForm.tsx` is at 91 % of its cap — the next addition there opens the named seam first
(the reminder block onto AlertFields), a placement decision, not the next author's.
**M4g Things to do** is built (D1–D13 green, 213 tests; 0008 applied to local data with
every fire and delivery intact; create → photo → Plan it exercised on the live local API).
Built as: a status set to `planned` directly is refused (use Plan it); Plan it on a non-idea
is 409; the planned event carries no reminder and is all-day unless a time is given; a
picked reminder date equal to the start date is one reminder (the start one). Photo
reading uses `client.beta.messages.parse` (the beta path carries `fallbacks`).
**M7: live at https://enso.sogodojo.com (2026-10-03)** — production D1 `enso` (all 7
migrations), carry-over of settings + 5 school holidays, secrets SETUP_TOKEN and
RELAY_TOKEN only, the same build as the home-network server. Owner setup and the shared
phone + house reminder check are still to do. Local dev keeps its own database through
`preview_database_id` (local D1 state is keyed by that id). M4e Lists of your own is built (L1–L20 green; 0007 verified against the
local dev data). Admins (§6.3, A1–A7) are built; `Settings.tsx` is at 89 % of its ceiling after the
members-list controls — the next addition there is a placement decision.

Deviations from this spec, deliberately:

- **Service worker (M5):** a plain static `sw.js` for push only — no `vite-plugin-pwa`, no
  fetch handler, no caching — so §8.10's always-fresh holds.
- `compatibility_date` is `2026-08-20` — the bundled workerd rejects later dates.
- §10 "Freshness" polls every 30 s. The `phone-ui` skill says *never poll*; polling
  was kept because a ringing timer must appear without a user action. Revisit when
  push lands (a push can trigger the refresh instead). ⚑
- Fixed while building (already reflected above): `login_failures` table; the
  reminder unique index covers only **open** fires (a closed `removed` fire must not
  block its rescheduled replacement); all-day reminders fire at 09:00 local ⚑.
