# Placement receipts

One entry per full-path placement decision (new owner row, extract, or
bless-and-raise), newest first. Light-path placements go in the commit message only.
The receipt records the decision; `docs/module-ownership.md` and `scripts/arch.ts`
carry its result.

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
