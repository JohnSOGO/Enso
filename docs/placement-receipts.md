# Placement receipts

One entry per placement-advisor verdict (every code change since 2026-10-05), plus
reorganizer and code-steward runs, newest first.
The receipt records the decision; `docs/module-ownership.md` and `scripts/arch.ts`
carry its result.

---

## 2026-10-27 — Steward pass, v1.112.0 scope (code-steward)

- **Run:** post-release, v1.112.0 (🎣 Why it scored), with v1.111.1 and v1.112.1 since the last pass
- **Verdict:** SOUND
- **Top finding:** none owed; two LOW fold-ins: FishingWhy.tsx copies fishing.ts's `hm` and writes the time line
  itself (move it into fishingReasons, one FS5b assertion); the Home lit-mode receipt sits mid-file titled v1.111.2
  (shipped v1.112.1) and where-things-stand still says v1.112.0
- **Handoffs:** 2 to worker (time line into fishingReasons; receipt order/version and where-things-stand), 0 to
  reorganizer, 0 to placement-advisor; offered to MojoSOGO, none fixed without his pick
- **Restraint:** inline styles on `plain` buttons (the codebase's pattern), the shared high/low tide sentence, the
  window carrying windMph/waveFt/note, FishingWhy reusing Lists.module.css: all cheap and local

---

## 2026-10-27 — Why this fishing window, v1.112.0 (placement-advisor)

- **Ask:** MojoSOGO: tapping a fishing line opens a popup that says, in plain words, why the window scored, with the
  spot's public site at the bottom.
- **Verdict:** the words are a pure `fishingReasons` in `src/shared/fishing.ts` (beside `fishingText`, same `hm`);
  `FishingWindow` carries the day's `windMph` / `waveFt` and the spot's `note` (set in `windowsAt`). NEW
  `frontend/src/components/FishingWhy.tsx`, the shared Modal only, site link in its `footer`. `DaySheet.tsx` holds
  the open window in `useState` and its fishing lines become buttons. Seam fishing.ts into `fishing-words.ts` if it
  passes ~200 lines.
- **Why:** the reasons are fishing rules in words, tested pure like `fishingText`; the frontend only draws them.
- **Caps:** fishing.ts ~133/300, DaySheet ~76, FishingWhy ~27.

---

## 2026-10-27 — Steward follow-ups: moon-phase rule, weather onto daily-refresh, v1.111.1 (placement-advisor)

- **Ask:** MojoSOGO picked 1, 2, 3 of the v1.111.0 steward pass: (1) move fishing-days.ts's new/full ±1-day regex on
  moon names into a pure rule; (2) the map rows; (3) move weatherTick onto claimDailyRefresh/fetchRead.
- **Verdict:** (1) `src/shared/fishing.ts` gets `phaseNear` (pure; matches emoji against moon.ts `PHASES`, now
  exported); fishing-days.ts calls it; one test row (FS4b). (3) `src/worker/weather-days.ts` uses
  `claimDailyRefresh('weather_tried_at', …)` and `fetchRead('weather', …)`; the `tried` union in
  `src/worker/daily-refresh.ts` widens; the local timeout const is deleted. (2) docs only.
- **Why:** the bonus is a fishing decision, so it belongs in the rules stage; a `kind` on MoonPhase would leak onto the
  /calendar wire. The weather claim and timeout were the third copy of a shape that already has an owner.
- **Caps:** fishing.ts ~100/300, weather-days ~38, daily-refresh 27, moon 60.
- **Reorganizer:** none needed.

---

## 2026-10-27 — Steward pass, v1.111.0 scope (code-steward)

- **Run:** post-release, v1.111.0 (🎣 good fishing times, plus the calendar-items.ts descriptor)
- **Verdict:** MINOR DRIFT
- **Top finding:** fishing-days.ts decides the lake's ±1-day new/full-moon rule from moon.ts display names; move it into
  fishing.ts as a pure helper with a test
- **Handoffs:** 3 to worker (moon-phase rule; tick/Settings/OptionalItems map rows; weather-days onto daily-refresh),
  0 to reorganizer, 0 to placement-advisor; offered to MojoSOGO, none fixed without his pick
- **Restraint:** shownFor's two-item special case, the duplicated GREAT check, the ping's regex, computing fishing per
  call and per member: all cheap and local

---

## 2026-10-27 — built-in calendar items descriptor (reorganizer)

- **Trigger:** placement-advisor 2026-10-27 (fishing AREC): the five built-in calendar items were listed by hand in
  four places; extract-first into one descriptor list before a sixth is added.
- **Seam moved:** each item's pref, column, DayData key, label and title, from `src/worker/routes/auth.ts`,
  `frontend/src/state.tsx`, `frontend/src/components/Calendar.tsx` and `frontend/src/components/OptionalItems.tsx` to
  `src/shared/calendar-items.ts` [NEW row].
- **Room opened:** auth.ts 190 → 186, OptionalItems.tsx 61 → 58, state.tsx 129 → 130, Calendar.tsx 217 → 217; no caps moved.
- **Behavior:** preserved (same /me fields, PATCH keys, shownFor output, Settings rows and order); typecheck, test and
  arch:audit green.
- **Restraint:** only the five items moved; clock24h, houseSpeakers and after stay where they are.

---

## 2026-10-27 — 🎣 Good fishing times, v1.111.0 (placement-advisor)

- **Ask:** MojoSOGO approved "All": a fixed spots table with drive-time range per member, a pure tide/sun/solunar/wind
  scorer, a daily NOAA tide + Open-Meteo marine fetch, a 🎣 calendar item (6th built-in), an evening-before ping
  opt-in; step B CDFW trout plants + SD Parks iCal + Free Fishing Days as 🐟 lines (SPEC §7.14, §7.14b, §4.2zzm).
- **Verdict:** REORGANIZER FIRST (calendar-items.ts, done above). Then NEW src/shared/fishing-spots.ts, fishing.ts,
  moon-times.ts, coast.ts, fish-events.ts; src/worker/coast-days.ts (step 3h), fish-events-rows.ts (step 3i),
  fishing-days.ts, fishing-pings.ts (step 3j); frontend FishingSettings.tsx. EXISTING sun.ts (+sunriseUtc), auth.ts
  (/me), routes/events.ts (one fishingBetween call), household.ts (/settings place), tick.ts, env.ts, deliveries.ts
  (fishing_on, founder ping), DayCell.tsx, DaySheet.tsx, Settings.tsx, say-reader.ts (ENSO_DOES).
- **Flow stage:** rules (shared) → persist (coast-days, fish-events-rows) → read (fishing-days) → deliver
  (fishing-pings) → render.
- **Why:** moon.ts owns phases only, so rise/transit is its own owner; weather.ts is not widened (coast data stays
  separate so a surf or tide-pool item reuses it). The alert is a fire-less ping (the list/IOU shape), not an engine
  fire kind (engine.ts at 88%). Deviation: the once-a-day claim is shared by coast and fish events in
  `src/worker/daily-refresh.ts` [NEW row] (their third use of weather's rule), not copied twice; weather-days.ts untouched.
- **Caps:** routes/events.ts 129/147, tick.ts 121/148, auth.ts 192/300; nothing newly in the band.

---

## 2026-10-27 — Steward pass, fishing AREC (code-steward)

- **Run:** AREC for a feature spanning several areas (🎣 fishing times)
- **Verdict:** MINOR DRIFT
- **Top finding:** a 6th built-in calendar switch is shotgun surgery across 8 files, so open a descriptor list first
  (done: calendar-items.ts); keep /calendar to one call so routes/events.ts stays out of the band
- **Handoffs:** reorganizer (built-ins descriptor); placement-advisor (coast/fishing placement)
- **Restraint:** no engine fire kind, no generic geo module, no surf/tide-pool stubs

---

## 2026-10-27 — Steward pass, v1.110.0 scope (code-steward)

- **Run:** post-release, v1.110.0 (🍳 Recipes into the Lists popup as a fixed view)
- **Verdict:** SOUND
- **Top finding:** none
- **Handoffs:** none
- **Restraint:** the four-way `special` check / view ternary in HouseholdLists.tsx (one lookup at a fifth fixed view or the next touch);
  the 🍳 picker count refreshing only on the next lists load (as ✅ Things to do); HouseholdLists.tsx at 85%, below the band

---

## 2026-10-27 — Recipes into Lists, v1.110.0 (placement-advisor + code-steward AREC)

- **Ask:** the 🍳 Recipes tab goes; Recipes becomes the fourth fixed view in the 🛒 Lists popup ("🍳 Recipes (n)" after
  📥 Inbox, n = recipe count), rendering Recipes.tsx; a remembered `recipes` tab opens Lists on Recipes; ENSO_DOES
  wording follows (SPEC §8.1, §8.8, §8.12, Q393). No data, API or migration change.
- **Verdict:** EXISTING frontend/src/components/HouseholdLists.tsx (RECIPES fixed view, its count from GET /recipes,
  the render branch, an exported rememberRecipesView so `enso.list` stays its key); App.tsx (NAV to six tabs; a stored
  `recipes` tab maps to `lists` + rememberRecipesView()); say-reader.ts ENSO_DOES (Recipes folded into the Lists line).
  Recipes.tsx keeps its body (outer padding wrapper dropped: the Lists screen pads it); ListPicker.tsx unchanged.
- **Why:** HouseholdLists already composes the ThingsToDo / Shows / Inbox fixed views and pickerEntries takes any fixed
  entry, so Recipes is one more of the same shape. Steward: no data-loss risk (tables, R2 `recipes/`, API unchanged);
  nothing similar to build with it. Noted for the next touch: with four fixed views the `special` check and the view
  ternary could become one lookup.
- **Caps:** HouseholdLists.tsx ~250/300; App.tsx ~170/300; Recipes.tsx 112/300; say-reader.ts 114/300. Nothing new in
  the band. Reorganizer: none.

---

## 2026-10-27 — 🏡 Home active mode lit, v1.112.1 (placement-advisor)

- **Ask:** MojoSOGO: "Highlight the mode that is active; do not show a second text" (the AC card, §8.19).
- **Verdict:** EXISTING frontend/src/components/HomeRoom.tsx (DeviceCard): the mode line removed, an inline ACTIVE_MODE
  style beside STATUS on the pressed button; nothing to extract.
- **Why:** presentation only; the server still decides `c.mode`; the change removes code.
- **Caps:** HomeRoom.tsx 113/300.
---

## 2026-10-27 — 🏡 Home status larger, v1.109.2 (placement-advisor)

- **Ask:** MojoSOGO: "make status larger font and easier to see" (the 🏡 Home device cards).
- **Verdict:** EXISTING frontend/src/components/HomeRoom.tsx (`DeviceCard`), inline styles as the file already uses.
- **Why:** presentation only, inside the component that draws the line; no rule, data or server change.
- **Caps:** HomeRoom.tsx ~105/300.
---

## 2026-10-27 — Steward FIXes, v1.109.1 (worker + reorganizer, steward findings 1–3)

- **Ask:** MojoSOGO picked FIX on the v1.109.0 steward backlog.
- **Verdict:** EXISTING HomeRoom.tsx (✏ Devices only once `devices` is read) and HomeDevicePicker.tsx (Save off until
  the pick list is read); SPEC §8.19 save-order wording; HOUSE_NOT_CONFIGURED from house.ts to ha.ts (re-exported by
  house.ts for its callers), so routes/home-devices.ts imports only ha.ts.
- **Why:** each fix inside the file whose map row already owns it; the constant belongs with haConfigOf, whose null it
  names. No new owner, no file in the band.

---

## 2026-10-27 — Steward pass, v1.109.0 scope (code-steward)

- **Run:** post-release, v1.109.0 (🏡 Home, HA devices by room)
- **Verdict:** MINOR DRIFT
- **Top finding:** ✏ Devices offered before the room's devices load, so Save can send [] and wipe the room
  (HomeRoom.tsx / HomeDevicePicker.tsx, med)
- **Handoffs:** 0 to placement-advisor, 2 to worker (the picker guard; the §8.19 save-order wording), 1 to reorganizer
  (HOUSE_NOT_CONFIGURED into ha.ts, low)
- **Restraint:** speaker-picker shape copied once (third-use trigger stands); shared JSON-read helpers; UI mode words;
  PUT race; nothing in the warning band
---

## 2026-10-27 — 🏡 Home, Home Assistant devices by room, v1.109.0 (placement-advisor, code-steward, reorganizer)

- **Ask:** MojoSOGO: "have a button for home automation; opens to button list of defined rooms in Enso; then assigned
  items to room". A 🏡 Home tab: rooms → each room's HA devices (first: the Midea AC), live state and control; the
  room's creator or an admin assigns devices (SPEC §1.3, §4.2zzl, §8.19, §9.2e; migration 0065).
- **Steward (pre-build, AREC):** not a duplicate; fits §1.3 (widened by one phrase, ENSO_SCOPE with it); not §12 (Ensō
  never creates in HA). Shared pieces: one HA client (extract first), the speaker-picker shape copied once (generalize
  at a third use), the chores → room nullable-owner pattern. Verdict: build with extract-first.
- **Verdict:** REORGANIZER FIRST (54814a8): the private `ha()` out of house.ts into NEW src/worker/ha.ts (HaConfig,
  haConfigOf with only the four HA settings, haCall GET/POST); HouseConfig = HaConfig + the speech settings, no
  behaviour change. Then NEW src/shared/home-devices.ts (rules; DEVICE_DOMAIN / DEVICE_ACTION in vocab.ts), NEW
  src/worker/home-devices.ts (HA I/O, raw text only), NEW src/worker/routes/home-devices.ts (the four rows; loadRoom
  exported from routes/rooms.ts), NEW HomeTab.tsx / HomeRoom.tsx / HomeDevicePicker.tsx. EXISTING routes/rooms.ts
  (a room delete also takes room_devices), index.ts (mount), App.tsx (NAV), say-reader.ts (ENSO_SCOPE / ENSO_DOES).
- **Why:** devices are not speakers (per-person delivery targets), so a new pure leaf, not a second concern in
  speakers.ts. Importing house.ts would tie devices to the speech module and to the Echo settings; ha.ts is the
  one-concern seam both use. rooms.ts plus the device routes would reach ~89% of its cap with a second concern (live HA
  I/O). Services are a fixed list per domain and only a device in a room is controlled, because the HA token has full
  access to the house.
- **Rejected:** device rules in speakers.ts; device routes in rooms.ts; importing houseConfigOf; a generic HA service
  passthrough.
- **Open → ⚑ defaults:** Q389 (7th tab 🏡 Home), Q390 (any member runs, creator/admin picks), Q391 (a device in another
  room → 400), Q392 (HA down shown inline, no badge).
---

## 2026-10-27 — HA calls into src/worker/ha.ts (reorganizer)

- **Trigger:** placement-advisor's extract-first verdict for 🏡 Home (rooms → HA devices): the HA call lived privately
  in house.ts, which owns House delivery.
- **Seam moved:** the HA config (HA_URL, HA_TOKEN, CF Access pair) and the one Bearer call through access.ts, from
  `src/worker/house.ts` to `src/worker/ha.ts` [NEW row]
- **Room opened:** house.ts 138 → 126 lines; no pinned cap (global 300). ha.ts 26 lines.
- **Behavior:** preserved (54814a8) — typecheck, npm test (1073/1073) and arch:audit green on the commit alone;
  houseConfigOf still needs all seven settings, same POST paths, headers, bodies and timeouts, all exports kept.
- **Restraint:** only the config and the call moved; speak, the speaker template, drain and houseState stay.
---

## 2026-10-27 — Steward pass, v1.108.0 scope (code-steward)

- **Run:** post-release, v1.108.0 (🏫 school days off + shownFor gate)
- **Verdict:** SOUND
- **Top finding:** shownFor (sole reader of all five built-in switches) has no test (low)
- **Handoffs:** 0 to reorganizer, 2 to worker (shownFor test; dated owed entry for the 2027–28 SCHOOL_DAYS swap), 1 to
  placement-advisor (routes/events.ts 87%: the next built-in comes with the descriptor step)
- **Restraint:** switch list written out in five places is the already-logged 6th-item descriptor trigger, not
  re-flagged; no file in the warning band
---

## 2026-10-27 — 🏫 School days off, optional built-in item, v1.108.0 (placement-advisor, code-steward, reorganizer)

- **Ask:** MojoSOGO: "Here are the school days off schedule. Add as optional calendar." The Vista Unified 2026–27 days
  off as an optional calendar item, one switch per member, on by default (SPEC §7.13, §7.2, §7.5, §8.6). This reverses
  the 2026-10-03 removal (migration 0010), at his ask.
- **Verdict:** NEW src/shared/school.ts (SCHOOL_DAYS + schoolDaysBetween, pure, imports only time.ts, like markets.ts
  and moon.ts). EXISTING routes/events.ts (`schoolDays`, one import, one key), auth.ts (`showSchool`), migration 0064,
  state.tsx, OptionalItems.tsx, DayCell.tsx (`lead`: holiday, 🏫, 📈, at most two), DaySheet.tsx. REORGANIZER FIRST
  (its own commit): one `shownFor(data, me)` gate in Calendar.tsx, applied at the hand-off, not in buildDays (cached
  chunks would keep a stale `me`); DayCell and DaySheet drop their show* checks. This was the carried 5th-item trigger.
- **Why:** a pure leaf with no fan-in; without the gate four copies of the same show* check would become five across
  two files.
- **Steward (AREC pass):** not already in Ensō (§7.3 household days off is which public holidays count; optional events
  §7.5 would need 13 events and 13 switches). Same need: all five built-ins share the switch → /me → OptionalItems →
  gate path; a shared descriptor list of built-ins (key, pref, label, emoji, where it shows) is the next step if a 6th
  arrives — backlog, not built. Its "ask John first" for the reversal is met: the ask is his own.
- **Caps:** routes/events.ts ~128/147 (87%, just under the band); Calendar.tsx ~217/300; school.ts ~40; others well under.

---

## 2026-10-24 — IOU waiting push + IOU banner, v1.107.0 (placement-advisor, code-steward)

- **Ask:** MojoSOGO: "when an iou payment is made, an ack is required so put it at the top of the app and send an alert
  to the phone only". (1) When an IOU row starts waiting on someone (a payment, a tab payment from ＋ IOU, an IOU, or Ask
  again), that person gets one private push, phone only (deliveries.iou_row_id). (2) A banner on every screen with the
  rows waiting on me, with OK / Got it and Decline (SPEC §7B.9, §8.15c, §8.15a). No migration.
- **Verdict:** EXISTING src/shared/ious.ts (WAITING_TITLE / waitingText / waitingMessage, pure, next to declinedMessage).
  EXISTING src/worker/routes/ious.ts: one file-local pushOne (+ askOne) used by POST /ious, POST /iou-payments, …/again
  and the existing /decline; the one it waits on comes from waitsOn; push only when !countsAtOnce and the person is
  active. EXISTING frontend/src/components/Ious.tsx exports useIous / useIouAction / IouAnswerButtons / okable, hoisted
  out of IousSection, matching Messes.tsx. NEW frontend/src/components/IouBanner.tsx renders the rows where !okError.
  EXISTING frontend/src/App.tsx mounts it under MessBanner. Reorganizer NONE.
- **Why:** the words are a rule; the route only persists and sends, as decline already did. iou_row_id already makes the
  push private (privatePush: no founder ping, no FunHouse, others' Status). Only a push row is written, so deliveries.ts,
  push.ts, alert-history.ts and household.ts are unchanged. The banner copies MessBanner, so the card and the banner
  can't drift. Spec gaps settled as ⚑ Q385: one push per tap; banner under the mess banner; Decline keeps its confirm.
- **Steward (AREC pass):** traps checked (iouRowId on every push; no "already pushed" check, so Ask again re-asks; banner
  filters by okError, not canSee). Same need elsewhere, listed for John, not built: a banner for 🪙 earnings waiting on an
  admin (already pushed); bounty Not yet doesn't tell the doer. Backlog: `roomCents` for the thrice-written
  owedCents − waitingPaid in routes/ious.ts (low).
- **Caps:** src/shared/ious.ts ~258/300 (nearest the band); routes/ious.ts ~197; Ious.tsx ~140; IouBanner.tsx ~33; App.tsx ~165.

---

## 2026-10-23 — steward picks 1 and 2: useRecord start/cancel race, suite testTimeout (placement-advisor)

- **Ask:** v1.106.2, MojoSOGO "1 and 2" from the steward pass after v1.105.1. (1) A cancel() or stop() during the
  getUserMedia await was lost, so recording began after the popup closed. (2) testTimeout 30_000 (eight files sign in
  inside the test body).
- **Verdict:** (1) EXISTING `frontend/src/components/useSpeech.ts` useRecord: a generation ref bumped by end() and
  unmount; start() gives up (stops the stream's tracks) when it changed across the await; a pending ref ignores a second
  start during the popup. No unit test (no hook test setup; a new framework for one fix). (2) EXISTING `vitest.config.ts`
  `test.testTimeout`. Map rows unchanged. Reorganizer NONE.
- **Why:** the race lives in useRecord's own life cycle; EnsoButton.tsx is untouched. The timeout is suite-wide config.
- **Caps:** useSpeech.ts ~92/300; vitest.config.ts not capped. Spec unchanged (§8.18 part 2 already says Cancel drops
  a recording in progress); history entry added.

---

## 2026-10-23 — privatePush NULL fix, v1.106.1 (placement-advisor)

- **Ask:** steward finding #1 after v1.106.0: `privatePush`'s `t.fire_id IN (…)` is NULL for fire-less rows, so
  `NOT privatePush` dropped them. Replace with a correlated EXISTS; test PV7.
- **Verdict:** EXISTING src/worker/deliveries.ts (privatePush's only home); PV7 in test/event-access-api.test.ts.
- **Why:** one line inside the predicate; its callers (FOUNDER_PING, household.ts /status) get it unchanged.
  alert-history.ts alertSource needs no edit (a private fire is never a founder ping).
- **Caps:** deliveries.ts 82/300; no file near the band.

## 2026-10-23 — steward pass after v1.106.0 (code-steward)

- **Run:** post-release, covering v1.106.0 🔒 Private events (726701f EventFlags seam by the reorganizer, the feat
  commit: event-access isMaskedFor / maskOccurrence, migration 0063, /calendar + /optional-events masking, DaySheet,
  EventFlags box, deliveries.ts privatePush widened to private events' fires). Report:
  /mnt/project-files/steward/2026-10-23-v1-106-pass.md.
- **Verdict:** MINOR DRIFT. Typecheck green; 1063/1063; arch:audit quiet (top EventForm 197/223). 2 receipts match 2
  code commits; 0 without a receipt; AREC on file.
- **Top finding:** HIGH: privatePush's new `t.fire_id IN (SELECT … private = 1)` is NULL for every fire-less delivery
  once any private event has a fire, so FOUNDER_PING matched nothing (the /ops/notify cap, /ops/pings) and /status
  hid other members' fire-less deliveries. Fixed in v1.106.1 (correlated EXISTS, PV7).
- **Handoffs:** 0 reorganizer, 0 placement-advisor. 1 worker (#1, done in v1.106.1). The 5 v1.105.1 worker items stay
  open (useRecord cancel race MED, testTimeout, rawBody, say-reading row, [ai] warning).
- **Restraint:** no split. Reminders/alarms titles and House speech for private events are AREC / ⚑ Q384 choices left
  to John. The event-access header wording fixed with v1.106.1.


## 2026-10-23 — Private events: masked /calendar rows (placement-advisor)

- **Ask:** A `private` event flag (migration 0063, a 🔒 Private checkbox, carried through event-rows and routes/events);
  a viewer who may not open a private event gets only its date and times in /calendar, titled "Private" (SPEC §6.3
  Private events, v1.106.0). Also: where masking goes in other surfaces.
- **Verdict:** EXISTING src/shared/event-access.ts (isMaskedFor, PRIVATE_TITLE, maskOccurrence; row widened); EXISTING
  src/worker/event-rows.ts (column, view, parse, insert); EXISTING src/worker/routes/events.ts (the /calendar loop,
  PATCH column); EXISTING src/worker/routes/optins.ts (same mask on /optional-events); EXISTING
  frontend/src/components/DaySheet.tsx (🔒 Private, not openable when `masked`); NEW frontend/src/components/EventFlags.tsx
  (Optional and Private boxes), extracted from EventForm.tsx first by the reorganizer; NEW migrations/0063 + test.
  say-reader.ts: REUSE-add-nothing (ENSO_DOES names it). Steward sibling: EXISTING src/worker/deliveries.ts privatePush
  takes a private event's fires (Status), the one private-push rule (§7B.9).
- **Why:** what a private event shows to whom is a decision, so it goes beside canOpenEvent in the pure leaf that owns
  event visibility, not inline in the /calendar loop (events.ts 125/147). The PWA reads the server's `masked` flag
  because stripped assignees make canOpenEvent true on the phone. EventForm.tsx is the audit's top file, so its flags
  moved to a field component.
- **Caps:** event-access.ts ~35/300; events.ts 127/147; EventForm.tsx 197/223; EventFlags.tsx ~20/300. None newly in the band.


## 2026-10-23 — EventFlags seam for Private events (reorganizer)

- **Ask:** placement-advisor's extract-first for Private events: EventForm.tsx is the audit's top file (198/223).
- **Done:** the Optional box moved, unchanged, into NEW `frontend/src/components/EventFlags.tsx` (value/onChange like
  ReminderFields); EventForm renders `<EventFlags>`; owner row added. Behavior unchanged; typecheck and tests green.


## 2026-10-23 — steward pass after v1.105.1 (code-steward)

- **Run:** post-release, covering v1.104.0 (record, then write it down: speech-to-text.ts NEW, POST /say/hear,
  http.ts audioBody, useRecord, [ai] binding, vitest remoteBindings:false) and v1.105.0–1.105.1 (the Ensō answer:
  want / steps / sayBack / SAY_CHECK in say-reading.ts, the prompt in say-reader.ts, EnsoButton.tsx render). Also
  reconciles v1.102.0, v1.103.0 and the PC's RM1–RM4 timeouts. Report: /mnt/project-files/steward/2026-10-23-v1-105-pass.md.
- **Verdict:** SOUND. Typecheck green; 1056/1056; arch:audit quiet (top EventForm 198/223). 5 receipts match 5 code
  commits; 0 code commits without a receipt.
- **Top finding:** MED: useRecord's cancel() during the getUserMedia await is lost; start() then records up to 60 s
  with the popup closed and uploads a clip EnsoButton drops. Fix: a generation ref start() checks after the await.
- **Handoffs:** 0 reorganizer, 0 placement-advisor. 5 to worker: #1 the useRecord cancel race (useSpeech.ts);
  #2 `testTimeout: 30_000` in vitest.config.ts (eight files sign in inside the test body: two PBKDF2 runs under the 5 s
  default under full-suite load); #3 a shared rawBody for photoBody / audioBody on the next touch of http.ts; #4 rewrite
  the say-reading.ts map row; #5 try `remote = true` on [ai] to silence the AI-binding warning (157 a run).
- **Restraint:** no EnsoButton split (hotspot, 13 changes in 8 days, coherent at 173/300; seam = the answer view); no
  cap on /say/hear (⚑ Q379); speech-to-text.ts stays the IO boundary. Still carried: NOTE_MARKS_VIA / NoteMarksVia,
  LM_STUDIO_URL re-export; isShareKey / InboxSetup apiUrl; deleteEventStatements, renotifyText, updateEventStatement;
  show* gating at a 5th calendar item; ious.ts at 81%.

---

## 2026-10-23 — "I will … Did I get that right?" said back (placement-advisor)

- **Ask:** SPEC §8.18 parts 3–4, v1.105.1, refines Q380 (MojoSOGO "have it say I will … and then the reexplain and then
  ask, did I get that right?"). For reminder / event / exists, `say` = "I will " + steps joined + " Did I get that right?";
  no steps → Claude's say + the question; request → requestSay + the question; outside unchanged. Prompt asks steps that
  read after "I will"; requestSteps / outsideSteps reworded. The PWA shows "I will:" and the question (not on Outside).
- **Verdict:** EXISTING src/shared/say-reading.ts (sayBack, SAY_CHECK in cleanSayReading), src/worker/say-reader.ts
  (prompt), frontend/src/components/EnsoButton.tsx (render, imports SAY_CHECK), test/say-api.test.ts. Reorganizer NONE.
- **Flow stage:** rules (the sentence); IO (prompt); render (label and question).
- **Why:** say-reading.ts owns `say`, the fixed lines and steps, and the sentence derives from the steps. Rejected:
  building it in the worker (a rule in IO) or in the PWA (a second copy of the question, §0.5).
- **Caps:** say-reading.ts ~135/300, say-reader.ts ~116/300, EnsoButton.tsx ~175/300. None in band.

---

## 2026-10-23 — "You want" / "I'll do" on the Ensō answer (placement-advisor)

- **Ask:** AREC arec-enso-answer-gist.md, SPEC §8.18 parts 3–4 + SY13, v1.105.0 (⚑ Q380). POST /say's one structured
  reading also gives `want` (one-line gist) and `steps` (1–4 lines of what Yes does), cleaned like `say` (want → heard,
  steps → [say]); request and outside always get the fixed steps (requestSteps / outsideSteps). The popup shows You want /
  I'll do / a smaller I heard; the spoken sentence is unchanged.
- **Verdict:** EXISTING owners: src/worker/say-reader.ts (prompt + schema), src/shared/say-reading.ts (type, clamps,
  fallbacks, fixed steps beside requestSay / outsideSay), frontend/src/components/EnsoButton.tsx (+ module.css, render),
  test/say-api.test.ts (SY13). routes/say.ts untouched. Reorganizer NONE.
- **Flow stage:** rules (say-reading.ts cleaner) → IO (say-reader.ts prompt) → render (EnsoButton.tsx).
- **Why:** two more fields of a wire shape with one owner and an existing clamp-and-fallback cleaner. Rejected: a new
  say-steps.ts (splits one reading), fixed steps in the route (a rule in a route), steps derived in the PWA (re-deciding),
  a second Claude call (reads cost). Clamp names SAY_STEPS_MAX / SAY_STEP_MAX, never the recipe STEPS_MAX / STEP_MAX.
- **Caps:** say-reading.ts ~118/300, say-reader.ts ~113/300, EnsoButton.tsx ~172/300, say-api.test.ts ~252. None in band.

---

## 2026-10-23 — Record, then speech to text (Ensō button) (placement-advisor)

- **Ask:** AREC arec-record-voice.md, SPEC §8.18 part 2, v1.104.0 (⚑ Q378–Q379). Tap the mark to record (MediaRecorder:
  mp4 on iPhone, webm elsewhere), tap again to stop; the clip is POSTed raw to `POST /api/v1/say/hear` (member only,
  ≤ 2 MB / 60 s); Workers AI Whisper returns `{ text }`, which goes after what the box holds. Nothing stored or logged.
- **Verdict:** NEW `src/worker/speech-to-text.ts` (hearClip, like say-reader.ts wraps Claude); EXISTING routes/say.ts
  (the route), http.ts (audioBody beside photoBody), shared/say-reading.ts (constants), env.ts (AI), useSpeech.ts
  (useRecord replaces useListen), EnsoButton.tsx (uploads the clip). Reorganizer NONE.
- **Fallback:** SpeechRecognition dropped entirely (known iPhone bugs); no recorder → the keyboard-🎤 hint (⚑ Q333).
- **Flow stage:** route say.ts → IO speech-to-text.ts → render useSpeech.ts + EnsoButton.tsx.
- **Why:** an AI call inside the route would mix IO into validation. Rejected: claude.ts (another provider),
  photo-reads.ts (the Claude read cap must not be spent on clips), fetch inside useSpeech.ts (its row says no fetch).
  No daily cap (⚑ Q379), so no migration.
- **Caps:** say.ts ~60, speech-to-text.ts ~28, http.ts ~56, useSpeech.ts 85 (shrank), EnsoButton.tsx 170. None in band.
- **Sources read:** placement-advisor.md, arec-record-voice.md, scripts/arch.ts, module-ownership.md, routes/say.ts,
  http.ts, useSpeech.ts, EnsoButton.tsx, env.ts, index.ts, wrangler.toml, vitest.config.ts, SPEC.md.

---

## 2026-10-23 — guessed event emoji, one shared keyword table (placement-advisor)

- **Ask:** v1.103.0, SPEC 3.86 §7.6 Guessed emoji, §7A.1, §7C.2, §8.4 (MojoSOGO 2026-10-23, ⚑ Q376/Q377). A pure `guessEmoji(text)`
  (one keyword table: whole words or `*` stems, lower-cased, first row wins, else null) that the list default also uses
  (`defaultListEmoji = guessEmoji(name) ?? 📋`, NAME_EMOJIS folded in). A new event's Emoji box shows and saves the guess
  from the title until the person types or clears it, with a "✨ guessed" note. Editing never guesses. Plan it guesses
  from the thing's title. No schema or API change.
- **Verdict:** EXISTING `src/shared/emoji.ts` (guessEmoji and the table; it still imports nothing). EXISTING
  `src/shared/lists.ts` (defaultListEmoji delegates, same signature; DEFAULT_LIST_EMOJI stays; now imports emoji.ts). NEW
  row `frontend/src/components/EventEmojiField.tsx` (the box, `shownEmoji(value, own, title)` used by both the box and
  EventForm's toPayload, and the ✨ guessed note). EventForm.tsx only hosts it, with an `emojiOwn` flag (blank false,
  fromEvent true). Reorganizer NONE.
- **Addendum (steward):** POST /things/:id/plan (EXISTING `src/worker/routes/things.ts`, route) passes
  `emoji: guessEmoji(t.title)` into its `parseEventInput` body, §7C.2. The guess stays out of `event-rows.ts` so alarms and
  the PWA's own choice are untouched. Rows compile once with Unicode boundaries, all inside `emoji.ts`.
- **Flow stage:** rules (guessEmoji); render (the box); route (Plan it).
- **Why:** §7.6 owns event emoji, and the guess and the one-emoji rule are one cohesive concern. Fan-in is small and there
  is no cycle. Rejected: a new emoji-guess.ts (classitis, and the spec names emoji.ts); lists.ts (events would import list
  rules); recipe-emoji.ts (a different concern: each person's opinion, never guessed). The box got its own leaf because
  EventForm is at 199 of 223: inline it would enter the warning band. One derivation (shownEmoji) for what is shown and
  what is saved; no effect writes into form.emoji. EventFillBar is untouched, since fills set the title and the guess
  follows. Merged-table ordering is behavior: 🎂 birthday before the gift row (a "Birthday" list becomes 🎂), shopping
  before hardware, travel before book.
- **Caps:** emoji.ts ~110/300, lists.ts ~105/300, EventEmojiField.tsx ~17/300, EventForm.tsx 198/223, things.ts ~126/300.
  None newly in the band.
- **Steward (AREC):** only the list table guessed before; recipes must never be guessed; reminders/alarms have no Emoji
  box (John's call, not built). Substring false positives (carpet, vacation, prefix, restore) fixed by whole words.

---

## 2026-10-22 — private-push predicate, session.ts row, note_marks asking key (placement-advisor)

- **Ask:** v1.102.0, from the v1.101.0 steward backlog (MojoSOGO "Yes": 1, 3, 4c). (1) One IOU-notice privacy rule shared
  by FOUNDER_PING and `/status`, plus a test (§7B.9 Q359, §9.4). (3) The session.ts map row names sha256hex (docs only).
  (4c) The note_marks key is derived from the prompt and schema too, so a change to the question re-asks (§8.4a,
  §4.2zzi, Q375). No migration.
- **Verdict:** (1) EXISTING `src/worker/deliveries.ts`: export `privatePush(t)` =
  `(${t}.iou_plan_id IS NOT NULL OR ${t}.iou_row_id IS NOT NULL)`; FOUNDER_PING uses `NOT privatePush('deliveries')`;
  `/status` in EXISTING `src/worker/routes/household.ts` uses `(NOT privatePush('d') OR d.member_id = ?)`, one bind
  fewer. Test IO15b in `test/ious-api.test.ts`. (3) map wording only. (4c) EXISTING `src/worker/note-marks-rows.ts`:
  export `noteMarksKey(text)` = sha256hex(JSON.stringify([NOTE_MARKS_PROMPT, NOTE_MARKS_SCHEMA, text])), used by both the
  read and the store; NA8 seeds with it, and a new case shows a bare-text-hash row is a miss. Model swaps accepted and
  written into the spec. Reorganizer NONE.
- **Flow stage:** persist (the delivery predicates; the note_marks key); route (only applies the predicate).
- **Why:** (1) a fixed string can't serve both readers (FOUNDER_PING uses bare columns, `/status` needs the `d.` alias);
  an alias-taking predicate leaves one copy, and a later bounty "Not yet" column goes in one place. Rejected the
  steward's `MINE_ONLY` with `d.` built in. (4c) Rejected a shared `noteMarksKeyText` (shared/note-marks.ts is imported
  by the PWA and home/; the key is a Worker storage concern); exported from the leaf so NA8 seeds with the real key.
  Rejected reporting the model from the helper: on a hit nothing calls the home. (3) 4 of 5 sha256hex callers hash
  credentials; no crypto leaf.
- **Caps:** deliveries.ts ~80/300, household.ts ~109/300, note-marks-rows.ts ~37/300. None in the band.

## 2026-10-22 — steward pass after v1.101.0 (code-steward)

- **Run:** post-release, covering v1.99.1 ("found nothing more" plus photo-polish docs), v1.100.0 (declined IOUs,
  migration 0061) and v1.101.0 (remembered note highlights, migration 0062, note-marks-rows.ts).
- **Verdict:** SOUND. Typecheck green; 1032/1032 (156 files, main tree); arch:audit quiet (top EventForm 199/223, engine
  88%, ious.ts 81%). 3 receipts checked against 3 code commits, all landed as their verdicts said; 0 code commits without
  a receipt.
- **Top finding:** LOW-MED: whether an IOU push is private is decided twice, in FOUNDER_PING (deliveries.ts) and again in
  the household.ts `/status` clause (iou_plan_id, now iou_row_id). Export one fragment from deliveries.ts and use it in
  `/status`. No test checks that `/status` hides other members' declined notices. The bounty "Not yet" push will need the same.
- **Handoffs:** 0 to reorganizer. 3 to worker: the private-push fragment plus its test (#1); delete NOTE_MARKS_VIA and
  NoteMarksVia and drop identify.ts's LM_STUDIO_URL re-export with the next touch of those files (#2; correction:
  ITEM_READ_VIA is not dead, ItemReadVia types ItemReading.via); reword the session.ts map row to credential hashing
  including sha256hex (#3). 0 to placement-advisor unless MojoSOGO picks a cache-clearing rule for note_marks after a
  prompt or model change (#4).
- **Restraint:** no crypto leaf out of session.ts (4 of 5 sha256hex callers are credential hashing, the concern
  session.ts already owns); the sameSecret copy in ops.ts / captions-helper.ts (a recorded 2026-10-04 decision, home/
  isolation); the note_marks prune index; ious.ts at 81% (seam already named); the SPEC header date nit. Still carried:
  isShareKey / InboxSetup apiUrl; deleteEventStatements, renotifyText, updateEventStatement; the failed Out of scope log;
  show* gating at a 5th calendar item; the identify-through-model-manager decision (with MojoSOGO).

## 2026-10-22 — remembered note marks (placement-advisor)

- **Ask:** v1.101.0, SPEC §8.4a "Remembered" + §4.2zzi (MojoSOGO 2026-10-22: "Have it remember previous highlight on
  subsequent opens"): POST /notes/marks looks up the text's SHA-256 in a new `note_marks` table (migration 0062). A hit
  answers `{ via: 'sogoai', marks }` with no home call, even when the helper is not set up. A sogoai answer with ≥1 mark
  that stands is stored (INSERT OR REPLACE), and rows older than NOTE_MARKS_KEEP_DAYS (⚑ Q374, 180) are pruned on each
  store. An empty answer or a failure is never stored.
- **Verdict:** NEW row `src/worker/note-marks-rows.ts` (rememberedMarks / rememberMarks: hash via session.ts sha256hex,
  stored JSON re-checked with rawMarksOf + validMarks on read, a miss when none stand, the prune in the store's batch,
  never throws on write); EXISTING `src/worker/routes/notes.ts` (wiring: lookup after the 400s and before the unset check,
  store after validMarks when non-empty); EXISTING `src/shared/note-marks.ts` (NOTE_MARKS_KEEP_DAYS, and rawMarksOf
  pulled out of parseNoteMarksReport so the shape filter is not copied); `migrations/0062_note_marks.sql` +
  `test/migration-0062.test.ts`. Reorganizer NONE.
- **Flow stage:** persist (the leaf), with route wiring. The keep window is a shared limit. No render change.
- **Why:** one D1 table per leaf (weather-days.ts, *-rows.ts); a route owning the table, its key, (de)serialization and
  pruning would be four concerns. Rejected: a new hash helper (session.ts already exports sha256hex); home-captions.ts (no
  D1 by contract); shared/note-marks.ts for the store (pure, shared with home/). Re-validation on read keeps a stale or
  bad row from leaking marks not in the text. The answer shape is unchanged, so useNoteMarks and NotesSheet stay as they
  are. The acceptance gap it flagged is NA8 in SPEC (test/notes-api.test.ts).
- **Caps:** routes/notes.ts ~30/300; note-marks-rows.ts ~35/300 (new); shared/note-marks.ts ~110/300. Nothing in the band.
- **Steward note:** sha256hex lives in session.ts while most of its importers are not about sessions; a small crypto leaf
  is a seam for a later steward pass, not a reorganizer before this feature.
## 2026-10-22 — Declined IOUs: decline, tell the maker, ask again (placement-advisor)

- **Ask:** 💡 request req_4yjr3bp1kvm32y44, AREC arec-iou-declined.md; SPEC 3.83 §7B.9 / §8.15c / §4.2zzh, Q371–Q373,
  v1.100.0. The one a waiting IOU or payment waits on can Decline it: kept, shown under Declined, one private push to the
  maker (`deliveries.iou_row_id`); the maker can Ask again (a payment re-checked against what is owed). Migration 0061.
- **Verdict:** src/shared/ious.ts (rules), src/worker/routes/ious.ts (validate and persist), src/worker/deliveries.ts and
  src/worker/routes/household.ts (the `iou_row_id` private push), frontend/src/components/Ious.tsx (render),
  src/worker/say-reader.ts (ENSO_DOES), migrations/0061 [EXISTING]. Reorganizer NONE.
- **Flow stage:** rules ious.ts → route/persist routes/ious.ts + migration → deliver deliveries.ts + `/status` filter →
  render Ious.tsx.
- **Why:** Declined is a fourth state of the existing OK step (waitsOn / okError / deleteError / pairsOf), so "counts in
  nothing" is enforced once in ious.ts. The private push copies the `iou_plan_id` shape (PushRow field, FOUNDER_PING
  exclusion, `/status` privacy clause). Rejected: a new iou-decline module (splits one concern), decline rules in the
  route (layer leak), a new channel or FunHouse row (money stays private).
- **Caps:** ious.ts ~245/300 (watch: band at 270; seam if needed = the plan half → src/shared/iou-plans.ts),
  routes/ious.ts ~180, deliveries.ts ~78, household.ts ~110, Ious.tsx ~120, say-reader.ts ~108. Nothing in the band.
- **Siblings:** iou-pings.ts reads owed through ious.ts (declined rows never OK'd, so excluded); alert-history.ts
  alertSource falls through to the title; tab payments covered; 🪙 bounty Not yet has the same need, left for John.
- **Sources read:** placement-advisor.md, arec-iou-declined.md, scripts/arch.ts, module-ownership.md,
  placement-receipts.md, deliveries.ts, household.ts, iou-pings.ts, alert-history.ts, SPEC.md, migrations/.

## 2026-10-21 — "found nothing more" source line (placement-advisor)

- **Ask:** v1.99.1 patch, SPEC §8.4a ⚑ Q369 (steward item 3, MojoSOGO "1,3"): when the home AI answered (`state: 'ai'`)
  with zero marks, the muted line says "✨ Home AI found nothing more" instead of "✨ Highlights by the home AI".
- **Verdict:** frontend/src/components/NotesSheet.tsx `sourceLine` [EXISTING], one branch on `v.marks.length === 0`
  (the AI's raw marks, as the request says). Reorganizer NONE.
- **Flow stage:** render; display copy for a state the PWA already holds. Not vocab.ts (display copy, not vocabulary).
- **Why:** the NotesSheet row already owns the line saying which highlights show (Q369). Rejected: useNoteMarks.ts
  (fetches, not copy), src/shared/note-marks.ts (pure rules, no decision changes).
- **Caps:** NotesSheet.tsx ~120/300. Nothing in the band.
- **Sources read:** placement-advisor.md, placement-receipts.md, module-ownership.md, scripts/arch.ts, NotesSheet.tsx,
  useNoteMarks.ts, SPEC §8.4a, decisions.md Q369.

## 2026-10-21 — steward pass after v1.99.0 (code-steward)

- **Run:** post-release, v1.98.1 (fill count once, EF-C), v1.98.2 (useSpeech: one reused recognizer), v1.99.0 (§8.4a notes
  by the home AI: helper POST /note-marks gated by the PC model manager, Worker POST /notes/marks, useNoteMarks/mergeMarks;
  lm-studio.ts seam out of identify.ts; live fixes 0ce2f79 manager 5 s / Worker 25 s and fb91c06 prompt opt-out dropped).
- **Verdict:** MINOR DRIFT. Typecheck green; 1024/1024 (154 files, main tree); arch:audit quiet (top EventForm 199/223,
  engine 88%). 5 receipts reconciled against 6 code commits, all landed as verdicts said; 1 without a receipt (fb91c06,
  a one-line prompt patch in its owner, clean). Both v1.98.0-pass worker handoffs taken in v1.98.1.
- **Top finding:** MED: the model id and helper facts were half-updated. SPEC §5 and where-things-stand say `photo-polish`;
  SPEC §2 line 220, Q115 and README (setup commands included) still say `qwen-uncensored`. README's start-up log line, SPEC
  HOME_CAPTIONS_URL row, §7A.3 404 path list and §7E.2c helper env/imports paragraph are stale too.
- **Handoffs:** 0 to reorganizer; 4 to worker (docs fix #1; history entry plus a NOTE_MARKS_PROMPT guard comment #2 — the
  history half done in the same commit as this receipt; delete dead NOTE_MARKS_VIA and ITEM_READ_VIA with the next vocab.ts
  touch; drop identify.ts's LM_STUDIO_URL re-export with the next identify.ts change); 1 to placement-advisor after
  MojoSOGO decides whether identify.ts consults the model manager (sibling of note-marks: it still JIT-loads with ttl Q317;
  gating it trades loads for paid Claude reads, IDENTIFY_FAILURE gains `busy`). For MojoSOGO: wording when the AI answers
  with no marks that stand (it currently reads "✨ Highlights by the home AI" over patterns only, which is how the
  empty-answer bug looked like success).
- **Restraint:** the §8.4a module split (deep leaves, no classitis); NA5 contract (calls the producer, already correct);
  useNoteMarks' ref cache; display copy in NotesSheet; captions-helper outcome() path checks; receipt-spacing nits;
  EventForm/engine under the band. Carried: isShareKey / InboxSetup apiUrl; deleteEventStatements, renotifyText,
  updateEventStatement; failed Out of scope log; show* gating at a 5th calendar item.

## 2026-10-21 — LM Studio chat-completions call (reorganizer)

- **Trigger:** v1.99.0 §8.4a notes highlights via SogoAI needs a second LM Studio call. The placement-advisor said
  extract first, on cohesion not cap: identify.ts mixed naming an item with the LM Studio call.
- **Seam moved:** LM_STUDIO_URL and the POST / HTTP status / choices[0] content and finish_reason parse / reason strings,
  from `home/identify.ts` to `home/lm-studio.ts` (`chatCompletion(payload, { timeoutMs, fetch })`) [NEW row]. Commit 52b872c.
- **Room opened:** home/identify.ts 75 → 53 lines; no pin before or after (under GLOBAL_FILE_CAP 300).
- **Behavior:** preserved. typecheck, npm test (151 files / 1004 tests) and arch:audit green; build:home succeeds. Request
  URL, headers, body, the 15 s timeout and all four failure reasons unchanged; LM_STUDIO_URL still importable from identify.ts.
- **Restraint:** only the transport moved; the prompt, payload, IDENTIFY_* constants, the 'off' check and the IdentifyReport
  shape stay in identify.ts.

## 2026-10-21 — Notes highlights: home AI first, patterns as the fallback (placement-advisor)

- **Ask:** v1.99.0, SPEC §8.4a Highlights rewritten to AI first with a pattern fallback (MojoSOGO 2026-10-21: "AI with
  PAT fallback; make sure you interface with model manager"; confirms Q364 the other way). POST /note-marks on the SogoAI
  helper, which goes ahead only when the PC model manager (127.0.0.1:8793 /state) is idle with IDENTIFY_MODEL already
  loaded (no lease); POST /api/v1/notes/marks; the PWA shows patterns at once and swaps in AI marks, with a source line.
- **Verdict:** NEW home/lm-studio.ts (reorganizer first), home/model-manager.ts, home/note-marks.ts,
  src/shared/note-marks.ts, src/worker/routes/notes.ts, frontend/src/components/useNoteMarks.ts. EXISTING
  home/captions-helper.ts (the route), src/shared/vocab.ts (NOTE_MARK, NOTE_MARKS_FAILURE, NOTE_MARKS_WHY, NOTE_MARKS_VIA),
  scripts/arch.ts (home/ allow-list + src/shared/note-marks.ts), src/worker/home-captions.ts (noteMarksFromHome, keeps the
  kind), src/worker/index.ts (mount), frontend/src/notes-marks.ts (Mark from vocab; mergeMarks), NotesSheet.tsx (wiring
  and source line). Reorganizer REQUIRED (small, cohesion and not the cap).
- **Flow stage:** deliver (home, home-captions), rules (shared/note-marks, vocab), route (routes/notes), render (PWA).
- **Why:** the manager is a contract between processes, so it gets its own leaf, as access.ts does for Access. A second
  LM Studio caller would have copied identify's URL and response parse, so the seam opened first. The wire shape and the
  substring check live in one pure module both sides import (the parseIdentifyReport precedent); the kinds in vocab.ts.
  The Worker decides which marks stand (validMarks), as with cleanItemName. A new routes file: notes belong to neither
  events (events.ts pinned) nor list items. A fetch-state hook keeps NotesSheet the part that renders; api.ts stays
  transport. Rejected: one home file doing manager and LM Studio; taking a manager lease (it starts ComfyUI and sets its
  lastModel); the Mark kinds staying in the frontend; identifyFromHome's kind-dropping failure shape.
- **Spec settled (⚑):** every place an AI phrase appears is marked, a phrase across a line break dropped, AI leads and
  patterns fill (Q368); the source line wording (Q369); 5 s / 15 s / 25 s (Q370; 2 s first, raised after the live /state measured ~2.7 s); `unset` when the Worker has no helper settings.
- **Caps:** identify.ts 53/300; lm-studio.ts 37, model-manager.ts ~30, note-marks.ts (home) ~45, src/shared/note-marks.ts
  ~100, routes/notes.ts ~25, useNoteMarks.ts ~40 (all /300); captions-helper.ts ~150/300; home-captions.ts ~85/300;
  index.ts ~120/300; notes-marks.ts ~90/300; NotesSheet.tsx ~120/300. Nothing pinned touched.

## 2026-10-21 — Listen again on iPhone, one recognizer (placement-advisor)

- **Ask:** v1.98.2 patch, SPEC §8.18 part 2 (⚑ Q338/Q360). MojoSOGO after v1.97.1: "Only first set still", "Microphone
  symbol is on, but is not generating text". The iPhone's webkitSpeechRecognition only gives results to the first
  instance in the page; useListen keeps ONE recognizer, made on the first start with its handlers set once, and calls
  start() on it again for each listen and phrase restart, never while it is still ending.
- **Verdict:** frontend/src/components/useSpeech.ts (useListen) [EXISTING]. Reorganizer NONE.
- **Flow stage:** render (how the PWA listens).
- **Why:** the map row already gives useSpeech the recognizer in a ref; an instance per run becomes one lazy instance.
  Return shape unchanged, so EnsoButton.tsx is untouched. No vocab, shared rule, fetch or module-level `let`.
- **Caps:** useSpeech.ts 133/300. Nothing in the band.
- **Sources read:** .claude/agents/placement-advisor.md, useSpeech.ts (diff), module-ownership.md, scripts/arch.ts.
## 2026-10-21 — v1.98.1 "Filled N fields" counts once (placement-advisor)

- **Ask:** steward finding after v1.98.0 (§7.9, §7.9b), MojoSOGO picked FIX: EventFillBar summed the reading's and the
  place's counts, so a field both set counted twice.
- **Verdict:** EXISTING owners. src/shared/event-reading.ts exports its private `changed` as `fieldsChanged(a, b)`
  (readingToForm / readingOverForm use it); EventFillBar.tsx counts `fieldsChanged(latest.current, next)` after the
  place. Docs: ThingForm.tsx header rewritten whole; the event-reading, EventFillBar and ThingForm map rows updated
  (ThingForm names PlacePicker; EventFillBar's pasted sentence rewritten). One test (EF-C). Reorganizer NONE.
- **Why:** the count belongs with the fill rules in shared, so the PWA reuses it instead of working it out again.
- **Caps:** event-reading.ts ~86/300, EventFillBar.tsx ~96/300.

## 2026-10-21 — steward pass after v1.98.0 (code-steward)

- **Run:** post-release, v1.96.1 (per-try `refused`), v1.97.0 (notes full screen, §8.4a), v1.97.1 (second talk heard on
  iPhone), v1.98.0 (📍 saved places, §7.9b, migration 0060).
- **Verdict:** SOUND. Typecheck green; 1003/1003; arch:audit quiet (top EventForm.tsx 199/223, engine.ts 88%). 4 receipts
  reconciled against 4 code commits; 0 without a receipt; the v1.96.0 EnsoButton handoff was taken in v1.96.1.
- **Top finding:** LOW: EventFillBar's "Filled N fields" counts Address/Notes twice when a reading fills them and a saved
  place then replaces them (sum of two counts, not fields changed).
- **Handoffs:** 0 to reorganizer; 2 to worker (the fill-bar count, a patch; ThingForm's map row and header line to name
  PlacePicker, with the next ThingForm change); 0 to placement-advisor.
- **Restraint:** two GET /places per event form; usePlaces living in PlacePicker.tsx; ThingForm's three set calls on a
  pick; no component test for the place UI (rules are pure and tested); EventForm and engine just under the band.
- **Carried:** isShareKey / InboxSetup apiUrl; deleteEventStatements, renotifyText, updateEventStatement; where a failed
  Out of scope log shows; gating show* at a 5th calendar item.

## 2026-10-21 — Saved places, the address book (placement-advisor)

- **Ask:** SPEC §7.9b, v1.98.0, migration 0060. A `places` table, an API, a Settings section, and a picker in the event
  and thing forms, plus place matching on 📷/📋 readings.
- **Verdict:** NEW src/shared/places.ts, src/worker/routes/places.ts, frontend/src/components/Places.tsx, PlacePicker.tsx.
  EXISTING Settings.tsx, AddressField.tsx, EventFillBar.tsx, ThingForm.tsx, index.ts. Reorganizer NONE.
- **Flow stage:** rules, route/persist, render.
- **Why:** the matching and filling rule is shared by the event form, the fill bar and the thing form, so it lives in one
  pure module, never in the components. Rejected: the limits in alert-limits.ts (places don't ring); any growth in
  EventForm (200/223, on the band's edge: the picker goes in AddressField through a `value={form}` partial `onChange`,
  one line rewritten); place logic in things.ts; a hook in state.tsx (only two pickers read it; both GETs per form are fine).
- **Caps:** EventForm 200/223 unchanged; ThingForm 232/300; Settings 66/99; EventFillBar ~97/300; AddressField ~30/300;
  index.ts 118/300. Nothing newly in the band.
- **Sources read:** placement-advisor.md, scripts/arch.ts, modularity.md, module-ownership.md, placement-receipts.md,
  Settings.tsx, AddressField.tsx, EventFillBar.tsx, EventForm.tsx, ThingForm.tsx, roles.ts, event-reading.ts, things.ts,
  src/worker/index.ts.
- **Steward (AREC check):** no existing address book; fits §1.3; share one matcher + picker with things now; the
  household's sun place (coordinates) later, not merged; rooms left alone; ENSO_DOES learns places.
## 2026-10-21 — Second listen hears nothing on iPhone: wait for the old recognizer's end (placement-advisor)

- **Ask:** v1.97.1 fix, SPEC §8.18 part 2 (⚑ Q338/Q360). MojoSOGO, with a screenshot: "it works the first time, but
  when I do it a second time the text doesn't show up in the box". useListen.start() aborted the live recognizer and
  started a new one at once; iOS webkitSpeechRecognition gives a new recognizer nothing until the old one has ended
  (stop() only calls rec.stop(), so the first one is still ending). Fix: track whether a recognizer is live; start()
  while one is live aborts it and runs the new one from its onend, ignoring its late results, with a short timeout
  fallback.
- **Verdict:** frontend/src/components/useSpeech.ts [EXISTING]. Reorganizer NONE.
- **Flow stage:** render (client capture of intent; no server change).
- **Why:** the recognizer's lifecycle is useSpeech's one concern; fan-in is 1 (EnsoButton.tsx), whose contract doesn't
  change. Rejected: delaying the talk tap in EnsoButton (a recognizer quirk in the screen) and a separate hook. The live
  flag and timer are refs; stop() and unmount cancel a pending start; exactly one of onend and the timeout launches it.
- **Caps:** useSpeech.ts ~120/300. Nothing in the band.
- **Sources read:** .claude/agents/placement-advisor.md, useSpeech.ts, EnsoButton.tsx, module-ownership.md,
  scripts/arch.ts, placement-receipts.md.
## 2026-10-21 — Notes full-screen sheet, highlights, list tools, 📝 in the day sheet (placement-advisor)

- **Ask:** v1.97.0, SPEC §8.4a (with §8.3, §8.4, §8.8, §10 `/calendar`). MojoSOGO: "In Calendar, let me tap to see the
  notes and then expand the notes with like a full screen pop-up with basic edit features" and "auto highlight
  pertinent information". 📝 after an event title in the day sheet (`hasNotes`); ⤢ on the Notes box opens a full-screen
  sheet: read mode with highlights and ☐/☑ tap to tick; ✏️ Edit with • List, ☐ Box and the list going on at Enter; Done
  hands the text back. Read only for members who can't change it. The list item note uses the same piece.
- **Verdict:** NEW rows frontend/src/notes-marks.ts, frontend/src/notes-edit.ts, frontend/src/components/NotesSheet.tsx
  (NotesField + NotesSheet). EXISTING: Modal.tsx (`full` prop); one-line wiring in routes/events.ts, Calendar.tsx,
  DaySheet.tsx, EventForm.tsx, HouseholdListItemForm.tsx. Reorganizer NONE.
- **Flow stage:** render (plus one derived boolean on the /calendar summary).
- **Why:** only the PWA highlights or edits notes, so the helpers sit in frontend/src beside day-lines.ts, not in
  src/shared; highlighting and line editing are two concerns, so two leaf files. One NotesField serves both forms and
  keeps EventForm (200/223) from growing. `full` on Modal, not a second dialog (would copy portal, dirty-close,
  focus-return, iPhone rules). Links only through `webLink`. Found: the forms' `<fieldset disabled>` would disable ⤢ for
  read-only members, so NotesField sits outside it; `hasNotes` would reveal a 🔒 event has notes, so it is sent true
  only when canOpenEvent passes (Q362); asking the local AI is a separate flow (own spec + AREC), not in notes-marks.ts.
- **Caps:** EventForm.tsx 199/223, events.ts 125/147, Calendar.tsx 200/300, DaySheet.tsx 67/300, Modal.tsx 79/300,
  HouseholdListItemForm.tsx 99/300, NotesSheet.tsx ~125/300. Nothing in the band.
- **Sources read:** placement-advisor.md, CLAUDE.md, scripts/arch.ts, module-ownership.md, placement-receipts.md,
  EventForm.tsx, Modal.tsx, Modal.module.css, HouseholdListItemForm.tsx, DaySheet.tsx, Calendar.tsx, routes/events.ts,
  vocab.ts, things.ts (webLink), ThingForm.tsx.

## 2026-10-20 — Voice not captured after one refused try: per-try `refused` (placement-advisor)

- **Ask:** v1.96.1 fix, SPEC §8.18 part 2 (⚑ Q338/Q360). MojoSOGO: "sometimes the text box is not selected and the VtT
  is not captured". Split the sticky `unavailable` into no-recognizer `unavailable` and a per-try `refused` cleared by
  start(); talk() blurs the focused box before listening and retries after a refusal; drop the unused `.words` CSS rule
  and the `const words = typed` alias.
- **Verdict:** frontend/src/components/useSpeech.ts + EnsoButton.tsx + EnsoButton.module.css [EXISTING]. Reorganizer NONE.
- **Flow stage:** render (client capture of intent; no server change).
- **Why:** the recognizer's state is useSpeech's one concern; the talk gesture and hint are EnsoButton's. Rejected: a
  retry layer in state.tsx (one consumer); a new hook (classitis for ~10 lines). run()'s catch sets `refused` (the
  constructor exists); `autoFocus` stays tied to `unavailable` so a refusal doesn't bring the keyboard's mic back.
- **Caps:** useSpeech.ts ~106/300, EnsoButton.tsx ~175/300. Nothing in the band.
- **Sources read:** useSpeech.ts, EnsoButton.tsx, EnsoButton.module.css, scripts/arch.ts, module-ownership.md.

## 2026-10-20 — steward pass after v1.96.0 (code-steward)

- **Run:** post-release, v1.95.0 (tap to talk; mic asked on the first talk tap, Q360; hold to talk, the Splash mic ask,
  the 🎤 badge and useMicAsk removed), v1.95.1 (talk mark in the popup footer), v1.96.0 (✏️ Edit on answers, Q361).
- **Verdict:** SOUND. Typecheck green; 983/983; arch:audit quiet (top EventForm.tsx 200/223, engine.ts 88%). 4 receipts
  reconciled against 4 code commits; 0 without a receipt. No leftover reference to the removed mic code.
- **Top finding:** LOW: docs/where-things-stand.md still told you to try hold to talk and the opening mic popup; fixed in
  the same docs commit as this receipt.
- **Handoffs:** 0 to reorganizer; 1 to worker inside the next EnsoButton change (unused `.words` CSS rule, the
  `words = typed` alias); 0 to placement-advisor.
- **Restraint:** EnsoButton's size and phase switch (one coherent owner); Splash.tsx at 21 lines; the redundant
  listenFrom call in fixWords; the mic refusal lasting until reload (as the spec says); no component test for the popup.
- **Carried:** isShareKey / InboxSetup apiUrl; deleteEventStatements, renotifyText, updateEventStatement; where a failed
  Out of scope log shows; gating show* at a 5th calendar item.

## 2026-10-20 — Ensō answer screen ✏️ Edit back to the box (placement-advisor)

- **Ask:** SPEC §8.18 part 3, v1.96.0, ⚑ Q361, MojoSOGO 2026-10-20 "Edit": on every answer (Yes / Clarify / Cancel, and
  OK / Clarify for outside) add ✏️ Edit, back to the listen phase with the box holding `reading.heard`, Before cleared,
  not listening; Done re-reads.
- **Verdict:** frontend/src/components/EnsoButton.tsx [EXISTING]. Reorganizer NONE.
- **Flow stage:** render (capture intent); re-reading goes through the existing POST /say.
- **Why:** EnsoButton owns the reading phases, `clarify()` and `footer()`; Edit is a third way out of `answer` reusing
  `begin()` and `listenFrom(text, false)`. `edit` is already the textarea's handler, so the new one is `fixWords`.
  Leaving an outside answer by Edit, like Clarify, logs nothing (only `close()` does); the spec says so.
- **Caps:** EnsoButton.tsx 170 → ~173/300. Nothing in the band.
- **Sources read:** scripts/arch.ts, module-ownership.md, placement-receipts.md, EnsoButton.tsx, SPEC.md.

## 2026-10-20 — Ensō talk mark moves to the popup footer (placement-advisor)

- **Ask:** v1.95.1 patch, SPEC §8.18 part 2 (⚑ Q360), MojoSOGO 2026-10-20 "Move logo": move the in-popup round Ensō
  talk mark from the row above the text box to the far right of the popup footer, after Done / 🗑 Clear / Cancel
  (margin-left:auto); the hint line stays above the box.
- **Verdict:** frontend/src/components/EnsoButton.tsx + EnsoButton.module.css [EXISTING]. Reorganizer NONE.
- **Flow stage:** render.
- **Why:** pure relocation of an existing control inside the one owner of the Ensō popup; talk() and useListen unchanged.
  Modal's `.foot` is already a wrapping flex row, so `margin-left:auto` right-aligns it with Modal untouched. Rejected:
  a Modal "end slot" prop (speculative widening of a high-fan-in component for one caller). `.talkRow` deleted.
- **Caps:** EnsoButton.tsx ~172/300; EnsoButton.module.css ~25/300. Nothing in the band.
- **Sources read:** EnsoButton.tsx, EnsoButton.module.css, Modal.tsx, Modal.module.css, scripts/arch.ts,
  module-ownership.md (EnsoButton row).

## 2026-10-20 — Ensō tap opens, in-popup mark talks; mic ask moved off opening (placement-advisor)

- **Ask:** SPEC §8.18 parts 1–2, §8.10, §8.1; replaces ⚑ Q340 (hold to talk) and ⚑ Q342 (mic ask at opening) with
  ⚑ Q360. MojoSOGO 2026-10-20: the mark above the tab bar only opens the popup. A round Ensō mark in the popup starts
  listening on a tap (the first one is when the phone asks for the mic, through the recognizer's start) and stops on the
  next tap, pulsing while it listens. Splash's mic ask, the "🎤 Turn on voice" badge and useMicAsk are removed.
- **Verdict:** frontend/src/components/EnsoButton.tsx (+ .module.css) [EXISTING]; deletions in Splash.tsx, App.tsx,
  useSpeech.ts [EXISTING]; Splash.module.css deleted (voice styles only). Reorganizer NONE.
- **Flow stage:** render.
- **Why:** EnsoButton already owns the mark, the popup and useListen's start/stop. The new mark is a second trigger for
  the same state, so no new owner is needed. The recognizer's start() asks for the mic by itself, so useMicAsk and its
  permission query, localStorage flag and NO_POPUP_MS timing are deleted with nothing taking their place. Rejected: a
  separate MicButton component (one button, one handler); keeping useMicAsk "in case" (§0.5 dead code).
- **Caps:** EnsoButton.tsx 186 → ~178/300; useSpeech.ts 148 → ~102/300; Splash.tsx 49 → 21/300; App.tsx shrinks.
  None in the band.
- **Sources read:** scripts/arch.ts, module-ownership.md rows (App, Splash, EnsoButton, useSpeech), placement-receipts.md
  (head), EnsoButton.tsx, EnsoButton.module.css, useSpeech.ts, Splash.tsx, Splash.module.css, App.tsx, index.html.

## 2026-10-20 — Status hides others' IOU payback pings; IOU comment and prefill fixes (placement-advisor)

- **Ask:** v1.94.1 patch (steward HIGH). GET /status recentDeliveries showed every member the household's last 20
  deliveries, IOU payback pings included, against SPEC §7B.9 "Who sees it". Add `(d.iou_plan_id IS NULL OR
  d.member_id = ?)` as Q308 did for task check-ins (⚑ Q359). Plus the alertSource docstring, the deliveries.ts map row
  rewritten whole, IouForm prefill via centsText. Test IO15.
- **Verdict:** src/worker/routes/household.ts [EXISTING]; alert-history.ts (comment), IouForm.tsx, test/ious-api.test.ts
  [EXISTING]. Reorganizer NONE.
- **Flow stage:** route (a read filter), render (form prefill).
- **Why:** household.ts `/status` already owns the recentDeliveries visibility filter (Q308); same shape over one more
  column. The WHERE is parenthesized because the Q308 clause is an OR. Rejected: a shared visibility helper for two
  clauses in one query.
- **Caps:** household.ts ~109/300, alert-history.ts 48/300, IouForm.tsx 95/300. None in the band.
- **Sources read:** household.ts, scripts/arch.ts, module-ownership.md rows, alert-history.ts, ious.ts, IouForm.tsx,
  migrations/0059, deliveries.ts, SPEC §7B.9, decisions.md Q308.

## 2026-10-20 — steward pass after v1.94.0 (code-steward)

- **Run:** post-release, v1.94.0 (family IOUs, §7B.9, §8.15c, migration 0059, Q349–Q358), plus v1.93.1–v1.93.2. Ran on
  bcacfee.
- **Verdict:** MINOR DRIFT. Typecheck green; 982/982; arch:audit quiet (top EventForm.tsx 200/223, engine.ts 88%,
  ious.ts 221/300). 3 code commits, 3 matching receipts; 0 without a receipt.
- **Top finding:** HIGH: `GET /status` recentDeliveries showed every member IOU payback pings, against §7B.9. Fixed in
  v1.94.1 (Q359, IO15), with the LOW items: where-things-stand "Last updated", the alertSource docstring and
  deliveries.ts row, the IouForm prefill.
- **Restraint:** iou-pings per-plan queries each tick (family scale, indexed); the repeated plan-ending UPDATE and
  direction SELECT; Ious.tsx sharing Messes.module.css; UI label maps; the 6-entry Chores menu; tick.ts length.
- **Carried:** isShareKey / InboxSetup apiUrl; deleteEventStatements, renotifyText, updateEventStatement; where a
  failed Out of scope log shows; gating show* at a 5th calendar item.

## 2026-10-20 — IOUs: ledger, agree rule, fire-less payback ping (placement-advisor)

- **Ask:** New feature, family IOUs (SPEC §7B.9, §8.15c, §4.2zzf; §1.3 widened). Migration 0059 (ious, iou_payments,
  iou_plans, deliveries.iou_plan_id). Pure rules for parsing dollars, "whoever it costs agrees", the queue per direction
  (never netted), plan due dates, behind and the 09:00 ping. Nine routes. A tick step sending one fire-less push per due
  day to the one who owes. Ious.tsx and IouForm.tsx as a sixth 💵 entry in Chores. Vocab IOU_PAY_HOW, IOU_PLAN_EVERY.
  ENSO_DOES and ENSO_SCOPE. Replaces the same morning's alarm-event verdict. Split the bill / off the tab (Q357–Q358)
  landed in the same owners (ious.ts parse + tabSplit; POST /ious writes the tab payment).
- **Verdict:** NEW rows src/shared/ious.ts, src/worker/routes/ious.ts, src/worker/iou-pings.ts,
  frontend/src/components/Ious.tsx, IouForm.tsx. EXISTING deliveries.ts, tick.ts, index.ts, vocab.ts, say-reader.ts,
  Chores.tsx. Reorganizer NONE (the deleteEventStatements extract is withdrawn: no event or fire).
- **Flow stage:** rules (ious.ts), route + persist (routes/ious.ts), persist + deliver (iou-pings.ts, deliveries.ts),
  render (Ious.tsx, IouForm.tsx).
- **Why:** Alarms speak on the house and FunHouse follows the phone; money must never be spoken. list-pings.ts is the
  exact shape: pushDelivery only, no fire, plus a FOUNDER_PING exclusion column, so "never spoken" holds by
  construction. Every decision sits in one pure module the PWA shares. Plan dates reuse recurrence.ts occurrences().
  Rejected: alarm event (speaks), the ping inside tick.ts (pinned 148), a separate plans route file. MONTHLY skips
  months without the start day, so a monthly plan starts on the 1st–28th (Q353). Steward MED: FOUNDER_PING gains
  `iou_plan_id IS NULL` with a test (IO11).
- **Caps:** tick.ts 111 → 114 / 148. deliveries.ts 74 → 77. index.ts 114 → 116. vocab.ts 101 → 105. say-reader.ts
  107 → 108. Chores.tsx 115 → 118. New: ious.ts 221, routes/ious.ts 148, iou-pings.ts 38, Ious.tsx 108,
  IouForm.tsx 95. Nothing newly in the band.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md, docs/placement-receipts.md, src/worker/tick.ts,
  deliveries.ts, list-pings.ts, index.ts, say-reader.ts, routes/my-alerts.ts, src/shared/recurrence.ts,
  alert-history.ts, frontend/src/components/Chores.tsx, migrations/, SPEC.md.

## 2026-10-20 — Steward pass, IOU AREC (money, §1.3 widening) (code-steward)

- **Run:** on-demand, scoped AREC for the family IOU system (real USD, record-only).
- **Verdict:** SOUND. No touched file in the warning band (hand-computed; node_modules was missing then).
- **Top finding:** MED: deliveries.ts FOUNDER_PING excludes fire-less push sources by enumeration; a new `iou_plan_id`
  must be added there, or IOU pushes become founder pings relayed to ops and FunHouse. Done in v1.94.0 (IO11).
- **Handoffs:** lift messes.ts balancesOf into weighted pair netting only if netting is chosen (it was not: Q352).
- **Restraint:** Chores menu size, tick.ts growth, per-source delivery FK columns, merging bounty and mess code.

## 2026-10-19 — log why Build now failed (placement-advisor)

- **Ask:** v1.93.2 patch, SPEC §8.18 part 6 Build now (steward backlog, MojoSOGO "Fix"): when POST
  /feature-requests/:id/build gets {ok:false, reason} from fireBuild, log `console.error('build now not started', r.id,
  reason)`, then return the existing 502.
- **Verdict:** src/worker/routes/feature-requests.ts [EXISTING]
- **Flow stage:** route
- **Why:** The route holds r.id and already maps the failure to the 502; logging at the call site matches phone-login.ts
  / cook-rows.ts. build-fire.ts stays a leaf that returns `reason` without logging. reason is "HTTP <status>" / "error:
  <name>", never the token. SY11 gets a console.error spy inside its `build()` helper (the helper's restoreAllMocks
  would drop one set in the test body); it pins id + reason and no token.
- **Caps:** feature-requests.ts ~55/300. Nothing newly in the band.
- **Sources read:** feature-requests.ts, build-fire.ts, scripts/arch.ts, test/say-api.test.ts, console.error call
  sites, this file (head).

## 2026-10-19 — steward pass after v1.93.0 (code-steward)

- **Run:** post-release, v1.93.0 (weather and moon as optional calendar items, migration 0058, Q348), plus v1.92.1–v1.92.2
  (opening-screen mic popup; weather and moon bottom-right) and the other thread's v1.92.1–v1.92.3 (Ringing bar audience,
  audienceOf in fire-rows.ts, Q347). Ran on caeaa17 with v1.93.1 (steward fixes) in flight.
- **Verdict:** MINOR DRIFT. Typecheck green; tests green (3 event-address failures were a concurrent package.json write,
  green on rerun); arch:audit quiet (top EventForm.tsx 200/223, engine.ts 88%). 5 code commits, 6 matching receipts, each
  built as placed; 0 without a receipt; the 2 Ringing-bar receipts were appended at the bottom (moved in v1.93.1).
- **Top finding:** MED: the carried ENSO_DOES / receipts order / where-things-stand items, fixed in v1.93.1 (plus the
  "Last updated" line).
- **Handoffs:** 0 to reorganizer. 2 to worker: the optins.ts map row and isForMe docstring (no longer the /fires rule;
  NEW); the 4 fragment map rows (say-reading, routes/say, EventForm, auth). 2 to placement-advisor then worker (carried):
  log fireBuild's dropped reason; where a failed Out of scope log shows. 1 at its trigger (NEW): gate the show* calendar
  items once in Calendar.tsx's DayData build when a 5th built-in item is asked for. Still carried: isShareKey /
  InboxSetup apiUrl; deleteEventStatements, renotifyText, updateEventStatement.
- **Restraint:** /fires calling sourceOf per row; alerts.ts rebuilding a FireRow; DayCell churn (layout, 106 lines);
  useMicAsk's fast-failure edge; no PWA tests for the show* hiding; EventForm at the band edge; renumbering merges from
  parallel threads (process).

## 2026-10-19 — v1.93.1: ENSO_DOES Calendar line and 🤫 Quiet the house (placement-advisor)

- **Ask:** Patch v1.93.1, SPEC §8.18 (steward backlog item 1, MojoSOGO "Fix"). ENSO_DOES's Calendar line gains public
  holidays and days off, 📈, weather and 🌑🌓🌕🌗 moon phases, each turned on or off per person in Settings → Calendar →
  Optional calendar items; "🔇 Quiet the house" becomes "🤫" to match the UI.
- **Verdict:** src/worker/say-reader.ts [EXISTING]
- **Flow stage:** rules (the prompt text the say reader sends to Claude)
- **Why:** ENSO_DOES has one home, named by SPEC §8.18. Two string literals; no new concern, import or layer change. UI
  emoji is 🤫 (HouseQuiet.tsx); the path exists (Settings.tsx → OptionalItems.tsx). Days off is admin-only, so the
  wording doesn't call it a per-person switch. No test pins the strings.
- **Caps:** say-reader.ts ~108/300. No file newly in the band.
- **Sources read:** say-reader.ts, scripts/arch.ts, test/ grep, HouseQuiet.tsx, Alarms.tsx, Settings.tsx, OptionalItems.tsx.

## 2026-10-19 — Weather and moon as optional calendar items; tighter rows (placement-advisor)

- **Ask:** Minor v1.93.0 (SPEC §7.5, §7.11, §7.12, §8.6; ⚑ Q348; MojoSOGO 2026-10-19 "Reduce spacing; add weather and
  moon as optional"). Migration 0058 adds member_prefs.show_weather / show_moon (DEFAULT 1); PATCH /me accepts
  showWeather / showMoon and memberView returns them; OptionalItems gets 🌤️ Weather and 🌕 Moon phases rows after 📈
  with 32px rows; DayCell and DaySheet hide weather / moon when off. AREC: BUILD (arec-weather-moon-optional.md).
- **Verdict:** migrations/0058 + src/worker/routes/auth.ts + frontend/src/state.tsx, components/OptionalItems.tsx,
  DayCell.tsx, DaySheet.tsx [EXISTING]
- **Flow stage:** persist (prefs) + route (the /me boolean loop) + render (switches and hiding)
- **Why:** Same shape as showPublicHolidays / showOptionsExpiration: the existing loop, view and phone-side gate take it
  with no new mechanism. A server-side /calendar filter was rejected (holidays filter on the phone; two ways would split
  the pattern); a separate prefs module would duplicate /me. The fields stay numbers like the other show* flags. In
  DayCell the moon shares the .wx group (Q346), so each half is gated on its own.
- **Caps:** auth.ts ~190/300, state.tsx ~130, OptionalItems.tsx ~61, DayCell.tsx ~106, DaySheet.tsx ~68. None in band.
- **Sources read:** the AREC, scripts/arch.ts, docs/module-ownership.md, this file (head), auth.ts, show* usages,
  migrations/005*, the test list.

## 2026-10-19 — mic ask at opening without a tap; buttons only when no popup (placement-advisor)

- **Ask:** Patch v1.92.2 (SPEC §8.10 Voice first, ⚑ Q342; MojoSOGO 2026-10-19 "I have to double tap approve for
  microphone… just ask at open with system popup"). The opening screen calls getUserMedia by itself so the phone's own
  popup shows. useMicAsk.ask() returns 'needs-tap' when refused faster than NO_POPUP_MS (400 ms, no popup shown), and
  only then does Splash show 🎤 Allow microphone / Deny.
- **Verdict:** frontend/src/components/useSpeech.ts (useMicAsk) + frontend/src/components/Splash.tsx [EXISTING]
- **Flow stage:** render
- **Why:** useMicAsk already owns whether the mic is allowed and the ask; telling "popup shown" from "refused without
  one" is the same question. Splash owns what the opening screen shows. Separate mic module rejected, as in v1.92.1.
  Known edge: a fast failure (no mediaDevices, or a fast refusal on the tap path) is never recorded as 'denied', so
  the header badge stays; acceptable. Knock-on: §8.10 paragraph and the Splash / useSpeech ownership rows rewritten.
- **Caps:** useSpeech.ts 148/300, Splash.tsx 49/300. No file newly in the band.
- **Sources read:** useSpeech.ts, Splash.tsx, scripts/arch.ts, docs/module-ownership.md, this file (head), SPEC §8.10.

## 2026-10-19 — Day cell weather and moon to bottom-right (placement-advisor)

- **Ask:** Move the day cell's forecast group (`.wx`) to bottom-right at every width, and the moon phase out of the
  day-icon slot into that group after the weather emoji (alone there with no forecast), freeing both day icons for
  holiday, 📈 and unassigned event emoji. Patch v1.92.2, SPEC §7.2, §7.11, §7.12, ⚑ Q346.
- **Verdict:** frontend/src/components/DayCell.tsx + DayCell.module.css [EXISTING]
- **Flow stage:** render
- **Why:** The DayCell row already owns the day icons, the weather and the moon drawing; this is layout inside one
  concern. moonPhases and weather still arrive prepared from /calendar; rules, routes and DaySheet unchanged. Knock-on:
  the DayCell row in module-ownership.md stops calling the moon a day icon.
- **Caps:** DayCell.tsx ~103/300, DayCell.module.css 59. No file newly in the band.
- **Sources read:** docs/module-ownership.md (DayCell, moon.ts rows), scripts/arch.ts, DayCell.tsx, DayCell.module.css

## 2026-10-19 — mic ask trusts the flag only without a permissions query; splash labels (placement-advisor)

- **Ask:** Patch v1.92.1 (SPEC §8.10 Voice first, §8.1 badge, ⚑ Q342). The iOS home-screen app forgets the mic, so
  `enso.voiceOn` must not hide the ask when permissions.query says 'prompt'. Relabel the opening-screen buttons
  "🎤 Allow microphone" / "Deny" (Deny = this opening only).
- **Verdict:** frontend/src/components/useSpeech.ts (useMicAsk) + frontend/src/components/Splash.tsx [EXISTING]
- **Flow stage:** render
- **Why:** useMicAsk already decides whether the mic is allowed, and the fix is to its starting state only. Splash.tsx
  owns the opening screen's buttons. Both are small, single-concern, low fan-in (App.tsx, Splash.tsx); a new
  mic-permission module was rejected. The header badge follows the hook's `show` with no code change.
- **Caps:** useSpeech.ts ~137/300, Splash.tsx ~38/300. No file newly in the band.
- **Sources read:** useSpeech.ts, Splash.tsx, scripts/arch.ts (caps), docs/module-ownership.md, this file (head), repo
  grep for useMicAsk / voiceOn / labels.

## 2026-10-19 — steward pass after v1.92.0 (code-steward)

- **Run:** post-release, v1.92.0 (moon phases, §7.12, Q345: src/shared/moon.ts, /calendar moonPhases, DayCell / DaySheet
  / Calendar), the first release built by the daily feature-request session. Ran on ca9e716.
- **Verdict:** MINOR DRIFT. Typecheck green, 963/963, arch:audit quiet (top EventForm.tsx 200/223, engine.ts 88%,
  events.ts 123/147); 1 code commit, 1 matching receipt, built as placed; 0 without a receipt.
- **Top finding:** MED: ENSO_DOES's Calendar line (say-reader.ts:14) does not list moon phases, holidays or 📈, so the
  same ask said again reads as a new request instead of "already does this".
- **Handoffs:** 0 to reorganizer. 4 to worker: ENSO_DOES Calendar line (with the carried 🔇 → 🤫); the three receipts at
  the bottom of this file (v1.84.1, v1.84.2, v1.92.0) moved to the top, and the build-session brief told "top, newest
  first" and "update ENSO_DOES"; where-things-stand TRYs and Q range up to Q345; the three map rows rewritten whole
  (carried). 2 to placement-advisor then worker (carried): log fireBuild's dropped reason; where a failed Out of scope
  log shows. Still carried: isShareKey / InboxSetup apiUrl; deleteEventStatements, renotifyText, updateEventStatement.
- **Restraint:** moon.ts's coarse lunation window (bounded, MN3 covers it); §7.12's position (by topic); the repeated
  { name, emoji } shape in DayData; one more D1 read on /calendar; EventForm at the band edge.

## 2026-10-19 — steward pass after v1.91.0 (code-steward)

- **Run:** post-release, v1.90.0 (the event reading, the speaker's After, no selection while held), v1.90.1 (🎤 Turn
  on voice badge, useMicAsk), v1.90.2 (the opening screen asks; Splash.tsx after a reorganizer extract) and v1.91.0
  (Build now: canBuild / buildRefusal, build-fire.ts, POST /feature-requests/{id}/build). Ran on a8001b6. Report:
  /mnt/project-files/steward/2026-10-19-v1-91-pass.md.
- **Verdict:** MINOR DRIFT. Typecheck green, 959/959, arch:audit quiet (top EventForm.tsx 200/223, engine.ts 88%);
  5 code commits, 5 matching receipts, each built as placed; 0 without a receipt.
- **Top finding:** LOW: map rows added to rather than rewritten in v1.90.0 (say-reading.ts, routes/say.ts,
  EventForm.tsx), and the say-reading row still lacks outside / outsideSay / FeatureAsk.
- **Handoffs:** 0 to reorganizer. 3 to worker: map rows rewritten whole; where-things-stand TRYs for hold to talk,
  the event reading and Build now, with Q range to Q344; carried ENSO_DOES 🔇 → 🤫. 2 to placement-advisor then worker:
  log fireBuild's dropped failure reason (spec line first); carried, where a failed Out of scope log shows. Still
  carried: isShareKey / InboxSetup apiUrl, v1.84.x receipts order, the window receipt's version; deleteEventStatements,
  renotifyText, updateEventStatement at their triggers.
- **Restraint:** EnsoButton.tsx hotspot (186/300, 6 commits/week), seam kept for ~250; EventForm at the band edge, a
  verdict on its next edit; the PWA's isAdmin && canBuild; Build now re-fire (spec: moves no status); Splash waiting
  on permissions.query; no browser tests (SY-M); the hard-coded routine beta header.

## 2026-10-19 — Build now: start the build session from the Ensō popup (placement-advisor)

- **Ask:** v1.91.0, SPEC §8.18 part 3 "Not yet" row and part 6 "Build now" (⚑ Q344), SY11, the API row POST
  /feature-requests/{id}/build, §2.4 BUILD_FIRE_URL / BUILD_FIRE_TOKEN. After a small save an admin is asked "Build it
  now?"; Build now posts the id and title to the routine's fire address; only from new (409), 503 `build_now_off`, 502
  `build_failed`, 202 `{ started: true }`.
- **Verdict:** rule `src/shared/feature-requests.ts` (canBuild, buildRefusal) [EXISTING]; route
  `src/worker/routes/feature-requests.ts` [EXISTING]; deliver `src/worker/build-fire.ts` [NEW row]; render
  `frontend/src/components/EnsoButton.tsx` [EXISTING]; config `src/worker/env.ts`, wrangler.toml.
- **Flow stage:** rules + route + deliver + render, split along the flow.
- **Why:** the admin + New check is needed by both the route and the popup, so it lives once beside okMove / dismissMove
  (a predicate, not a Move: build changes no status); the PWA reads the server's status, never the size. The fire has its
  own secret, beta headers, timeout and failure mapping, so a leaf like home-captions.ts. Rejected: access.ts (Access-only
  auth), claude.ts (the SDK, model answers), ops.ts / deliveries.ts / push.ts, inline in the route.
- **Caps:** routes/feature-requests.ts 39 → 51; shared/feature-requests.ts 69 → 77; build-fire.ts new 35; env.ts 47 → 49;
  EnsoButton.tsx 170 → 186 (/ 300). Nothing in the band.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; docs/placement-receipts.md; SPEC.md §2.4, §8.18; the four
  owners above.

## 2026-10-19 — Voice first on the opening screen: Splash.tsx (placement-advisor)

- **Ask:** v1.90.2, SPEC §8.10 "Voice first" ⚑ Q342 and the revised §8.1 🎤 badge bullet: signed in, on a phone that can
  listen with the mic not yet allowed, the opening screen stays with 🎤 Turn on voice / Not now; ask() then the app
  opens; Not now opens it with the header badge, and the next opening asks again.
- **Verdict:** NEW row `frontend/src/components/Splash.tsx` (the remove-timer moved out of App.tsx first by the
  reorganizer, then the portal ask) + EXISTING `useSpeech.ts` (useMicAsk gains `checked`, exports MicAsk) and `App.tsx`
  (one useMicAsk in App(), passed to Shell and Splash).
- **Flow stage:** render (browser permission only; no route, rule or persist).
- **Why:** App.tsx's row is the §8.1 frame; the splash timer was an unlisted second concern and the voice ask would add
  more. Rejected: leaving it in App(); the ask in useSpeech.ts (speech, not a screen); state.tsx (per-phone); a second
  useMicAsk in Splash (two states that could disagree); persisting Not now (the spec asks again next opening).
- **Caps:** App.tsx 182 → 172 / 300; Splash.tsx new ~38 / 300; useSpeech.ts 132 → ~136 / 300. Nothing in the band.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; docs/placement-receipts.md; SPEC.md §8.1, §8.10;
  App.tsx; useSpeech.ts.

## 2026-10-19 — opening screen timer into Splash.tsx (reorganizer)

- **Trigger:** placement-advisor extract-first verdict for the upcoming opening-screen change (§8.10): its code should own
  a file of its own rather than grow App().
- **Seam moved:** the splash-removal effect and SPLASH_MIN_MS from `frontend/src/App.tsx` to
  `frontend/src/components/Splash.tsx` (`<Splash ready={me !== undefined} />`, rendered once at App level after every
  branch's body) [NEW row]
- **Room opened:** App.tsx: 182 → 171 lines; no CEILINGS pin (under GLOBAL_FILE_CAP 300), so cap 300 → 300
- **Behavior:** preserved — typecheck, npm test and arch:audit green; same 0.8 s minimum from page start, `.gone` then
  remove after 300 ms, timer cleared on unmount; App still renders nothing while `/me` is loading.
- **Restraint:** only the timer moved; index.html's #splash markup and styles, and App's sign-in / join / approve
  branches, are untouched.

## 2026-10-19 — Ask for the microphone up front: 🎤 Turn on voice (placement-advisor)

- **Ask:** v1.90.1, SPEC §8.1 status badges, ⚑ Q342. A "🎤 Turn on voice" badge shows while the phone can listen but
  the mic is not yet allowed (permission 'prompt', or no permissions query and voice never turned on). A tap asks for the
  mic (getUserMedia, tracks stopped) and the badge goes once the mic is allowed. If refused, it stays and a tap explains.
- **Verdict:** EXISTING. `frontend/src/components/useSpeech.ts` (new `useMicAsk()`: show / refused / ask, the
  permission `change` listener, the `enso.voiceOn` flag) and `frontend/src/App.tsx` (the badge in the badges row, the
  explain overlay when refused). No new row; the useSpeech.ts row text is updated.
- **Flow stage:** render (phone-only browser permission; no route, no rule, no persist).
- **Why:** mic permission is part of the phone's own speech, and the hook needs useSpeech's private `recognizerCtor()`.
  A new hook file was rejected (would export or copy it); a badge component was rejected (App.tsx draws each badge
  inline); state.tsx was rejected (per-phone, not app state). A grant through the Ensō button on a phone with no
  permissions query not setting the flag was left out, since the spec doesn't ask for it.
- **Caps:** useSpeech.ts 103 → ~135 / 300; App.tsx 174 → ~182 / 300. Neither enters the band.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; docs/placement-receipts.md; SPEC.md §8.1; docs/decisions.md
  Q342; useSpeech.ts; App.tsx.

## 2026-10-19 — steward pass after v1.89.0 (code-steward)

- **Run:** post-release, v1.87.1 (useSpeech one phrase at a time with restart, EnsoButton always-on box / 🗑 Clear / 8 s
  hint / admin 💡 Requests, 84 px mark), v1.88.0 (§1.3 scope, ENSO_SCOPE, the `outside` reading and status, migration
  0057, OPEN_STATUSES / LISTED_STATUSES / canOk, bound IN lists, Out of scope badge) and v1.89.0 (hold to talk, §8.18
  rewritten whole, CLAUDE.md whole-spec and AREC rules, L19 timeout). Ran on bc0da27, before v1.90.0.
- **Verdict:** MINOR DRIFT. Typecheck green, 955/955, arch:audit quiet (top engine.ts / EventForm.tsx 88%); 3 code
  commits, 3 matching receipts, built as placed. ENSO_SCOPE equals SPEC §1.3 line for line; ENSO_DOES true apart from
  one emoji; v1.87 items 2 and 3 closed.
- **Top finding:** MED, carried: sayPrompt hard-coded "after work" 17:30 / tonight / morning. Fixed in v1.90.0 (his FIX)
  before this receipt landed.
- **Handoffs:** 1 to placement-advisor then worker (a ⚑ line for where a failed Out of scope log shows: close() posts
  after closing). 3 to worker: ENSO_DOES "🔇 Quiet the house" → 🤫; docs (say-reading.ts map row lacks outside /
  outsideSay / FeatureAsk; where-things-stand lacks the hold-to-talk TRY and Q339–Q341); carried isShareKey /
  InboxSetup apiUrl, v1.84.x receipts at the bottom, device-check lines v1.76–v1.84, the window receipt's version. 0 to
  reorganizer. Still carried: deleteEventStatements, renotifyText, updateEventStatement at their triggers. Report:
  /mnt/project-files/steward/2026-10-19-v1-89-pass.md.
- **Restraint:** EnsoButton.tsx is the hotspot (3 commits) but one popup; the seam (hold gesture + box sync) is named
  for ~250 lines. outsideSay's short scope line; size kept on outside requests; `open = isListed` naming; double
  unlockSpeech; RESTARTS=30; Clarify then Cancel not logging (per spec); no browser-speech tests (SY-M manual).

## 2026-10-19 — Say it, it does it: the event reading, the speaker's After, no selection while held (placement-advisor)

- **Ask:** v1.90.0, SPEC 3.57 §8.18 parts 1, 3 and 7, SY9 / SY10, ⚑ Q340 revised, ⚑ Q341. (A) a fifth reading `event`
  whose Yes opens the new-event form filled in. (B) "after work" / "after school" is the speaker's own After, and
  tonight / morning are the When chips' times (steward v1.87 item 1). (C) holding the mark selects nothing on screen and
  shows no copy / save menu; the text box stays editable.
- **Verdict:** EXISTING. `src/shared/vocab.ts` (SAY_KIND + 'event'), `src/shared/say-reading.ts` (SayEvent and its
  branch), `src/worker/say-reader.ts` (event schema, prompt lines, `after: After`, AFTER_LABEL and WHEN_CHOICE imported),
  `src/worker/routes/say.ts` (one member_prefs read → afterOf), `frontend/src/components/EnsoButton.tsx` and
  `.module.css` (Yes on event → EventForm; the holding class on <html>), `frontend/src/components/EventForm.tsx`
  (`start?: SayEvent` merged in blank(), dirty when given). No new row; row texts updated.
- **Flow stage:** rules (say-reading) → the reading (say-reader) → route (say.ts) → render (EnsoButton, EventForm).
- **Why:** each part fits its owner's single concern and reuses existing shapes (whoOf, isDate / isTime, blank()'s
  date-derived fields). Rejected: a helper for the event start and re-pinning EventForm (the merge is a few lines); a
  shared After row helper (afterOf is the one rule; auth.ts and members.ts fold the columns into different joins; a
  fourth single-member reader would put `memberAfter` in db.ts); passing chip times through the route (imported in
  say-reader instead). The bad-time case was settled in §8.18 before building (left out → all day).
- **Caps:** EventForm.tsx 196 → 200 / 223 (band starts at 201); EnsoButton.tsx ~170 / 300; say-reading.ts ~92 / 300;
  say-reader.ts ~106 / 300; say.ts ~46 / 300.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; docs/placement-receipts.md; SPEC.md §8.18 and SY1–SY10;
  say-reading.ts, say-reader.ts, routes/say.ts, routes/members.ts, shared/reminders.ts, session.ts, EventForm.tsx,
  EnsoButton.tsx and its CSS.

## 2026-10-19 — Hold to talk on the Ensō mark (placement-advisor)

- **Ask:** Pressing the Ensō mark opens the popup listening; letting go after ≥ 0.5 s sends what was heard; a shorter
  tap stays open; nothing heard → stays open with the hint; no long-press callout (SPEC 3.55 §8.18 "Hold to talk",
  v1.89.0, ⚑ Q340).
- **Verdict:** frontend/src/components/EnsoButton.tsx + EnsoButton.module.css [EXISTING]
- **Flow stage:** render (capture intent)
- **Why:** The gesture reuses EnsoButton's existing begin/send path. Hold start and the latest send live in refs, and
  unlockSpeech moves into the release gesture, same as on Done. No new phase, rule or server change. useSpeech stays
  free of UI policy. A separate useHold hook was rejected: one gesture, one user, about 25 lines. Worker notes: stop
  the click after pointerup from opening again (keyboard still opens); an empty release goes to the hint, not send()'s
  error; pointercancel never sends; suppress the img callout too.
- **Caps:** EnsoButton.tsx 136 → ~160 / 300; nothing newly in the band.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md (EnsoButton, useSpeech, App rows), docs/placement-receipts.md,
  SPEC.md §8.18 Hold to talk, docs/decisions.md Q340, frontend/src/components/EnsoButton.tsx.

## 2026-10-19 — Out of scope: the fourth reading and the `outside` status (placement-advisor)

- **Ask:** v1.88.0, SPEC 3.54: §1.3 Scope, §8.18 item 4 "Outside what Ensō is for" with Clarify / OK and logging on
  leave, the 💡 Requests "Out of scope" badge, §4.2zzd migration 0057 (rebuild feature_requests for status `outside`),
  the §10 rows POST /say `outside` and POST /feature-requests `outside?`, SY7 / SY8, ⚑ Q339. Also steward items 2
  (ENSO_DOES Settings line, 💡 Requests) and 3 (one status set for the SQL).
- **Verdict:** EXISTING. `src/shared/vocab.ts`, `src/shared/feature-requests.ts`, `src/shared/say-reading.ts`,
  `src/worker/say-reader.ts`, `src/worker/feature-request-rows.ts`, `src/worker/routes/feature-requests.ts` (pass-through
  only), `frontend/src/components/EnsoButton.tsx`, `frontend/src/components/FeatureRequests.tsx`, and
  `migrations/0057_feature_request_outside.sql` with its test. No new row; row texts updated.
- **Flow stage:** rules (feature-requests, say-reading) → the reading (say-reader) → route / persist
  (routes/feature-requests, feature-request-rows) → render (EnsoButton, FeatureRequests).
- **Why:** The v1.87.0 split holds and every part fits its owner's row. The one real stability threat is overloading
  isOpen: widening it to include outside would leak outside rows into the ops build queue and closeMove, against SY8.
  So shared/feature-requests.ts gets two named sets, OPEN_STATUSES (the build queue, closeMove) and LISTED_STATUSES
  (always listed, Dismiss); okMove widens to needs_john | outside. The rows file builds its IN lists from those sets with
  bound placeholders (steward DRY item 3). FeatureRequests.tsx stops re-deriving open-ness and uses the shared sets.
  outsideSay is fixed text in say-reading.ts, like requestSay. ENSO_SCOPE sits beside ENSO_DOES as §1.3 directs.
  Rejected: a separate out-of-scope module (too small); deciding the logging in the route (only the PWA knows the
  person left without Clarify); a status from the route (the route only passes `outside`; statusFor decides).
- **Caps:** feature-requests.ts ~70/300, say-reading.ts ~85/300, say-reader.ts ~90/300, feature-request-rows.ts
  ~55/300, routes/feature-requests.ts 39/300, EnsoButton.tsx ~135/300, FeatureRequests.tsx ~63/300, vocab.ts 101/300.
  Nothing newly in the band.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md, docs/placement-receipts.md, SPEC.md §1.3, §4.2zzd, §8.18,
  the eight target files, and the usages of closeMove / openFeatureRequests / isOpen.

## 2026-10-19 — Ensō popup: always-on text box, Clear, 8 s hint, iOS listening, admin Requests (placement-advisor)

- **Ask:** v1.87.1 patch, SPEC §8.18 "Tap it" (⚑ Q338): the box is always there and filled by heard words, 🗑 Clear
  restarts listening, the keyboard-🎤 hint after 8 s with nothing heard, the voice is woken on the Done tap, iOS
  recognition is non-continuous with restart and accumulated finals, and admins get 💡 Requests in the popup
  (FeatureRequests in a Modal). Also the button 60 → 84 px (CSS only, Q332).
- **Verdict:** frontend/src/components/useSpeech.ts + frontend/src/components/EnsoButton.tsx [EXISTING]
- **Flow stage:** render (capturing intent; the phone's own speech I/O)
- **Why:** Each part fits one owner's row as it stands. Recognizer behavior goes to useSpeech (the Web Speech wrapper,
  no app state). Box, Clear, timer, unlock timing and the Requests entry go to EnsoButton (the popup). The 8 s timer
  sits in EnsoButton, and useSpeech only reports `heard`, so the hook stays free of UI policy. Requests reuses
  FeatureRequests and the shared isAdmin as Settings.tsx does; no copy of the list and no new owner. A shared
  "requests launcher" module was rejected: two call sites of an existing component do not need one. No worker, shared
  or schema change.
- **Caps:** EnsoButton.tsx 106 → ~125 / 300; useSpeech.ts 74 → ~100 / 300; nothing newly in the band.
- **Sources read:** docs/module-ownership.md (EnsoButton, useSpeech, FeatureRequests, Settings, Modal rows),
  scripts/arch.ts, SPEC.md §8.18, docs/placement-receipts.md, EnsoButton.tsx, useSpeech.ts, isAdmin usages.

## 2026-10-19 — steward pass after v1.87.0 (code-steward)

- **Run:** post-release, v1.86.0 (🎲 window reminders, §8.5c: shared/reminders.ts windowError / nextWindowRing / windowEnd,
  routes/reminders.ts, routes/alarms.ts, event-rows.ts endWindowStatements, alerts.ts, Reminders.tsx) and v1.87.0 (the Ensō
  button and feature requests, §8.18, migration 0056: shared/say-reading.ts, shared/feature-requests.ts, say-reader.ts,
  routes/say.ts, feature-request-rows.ts, routes/feature-requests.ts, ops.ts /ops/requests, EnsoButton.tsx, useSpeech.ts,
  FeatureRequests.tsx, ReminderForm exported, Settings.tsx, App.tsx).
- **Verdict:** MINOR DRIFT. Typecheck green, 952/952, arch:audit quiet (top engine.ts / EventForm.tsx 88%); 2 code commits,
  2 matching receipts, built as placed; map rows true; no stale Q numbers after the 645c828 renumber.
- **Top finding:** MED. sayPrompt hard-codes "after work" 17:30 / tonight 20:00 / morning 08:00, copying WHEN_CHOICE and
  ignoring the speaker's own `after` (§8.5b RM7, Q315–Q316); §8.18 does not settle it. Also MED: ENSO_DOES puts Announce
  and Quiet the house under Settings (they sit on the Alerts tab, Alarms.tsx:178–179) and omits 💡 Requests.
- **Handoffs:** 1 to placement-advisor then worker (the §8.18 line, and say.ts as the third after_kind / after_time reader,
  the trigger for a helper), 4 to worker (the ENSO_DOES wording; one OPEN_STATUSES and FEATURE_REQUEST_SIZE in say-reader;
  carried isShareKey / InboxSetup apiUrl; carried docs: v1.84.x receipts to the top, device-check lines v1.76–v1.84, the
  window receipt's v1.85.0 → v1.86.0), 0 to reorganizer. Still carried: deleteEventStatements, renotifyText,
  updateEventStatement at their triggers. Report: /mnt/project-files/steward/2026-10-19-v1-87-pass.md.
- **Restraint:** Reminders.tsx 181/300 (ReminderForm.tsx seam at ~270); DAY_NAME in say.ts vs RepeatFields' WEEKDAY_NAME
  (two bundles, a third gets shared); `dirty = !!start`; whoOf "everyone" → []; READS_PER_DAY from shared/things; no tests
  for the browser speech (SY-M); endWindowStatements' read in the action path; ops.ts carrying the request queue (98/300,
  one ops-token surface).

## 2026-10-19 — The Ensō button, just say it, and feature requests (placement-advisor)

- **Ask:** v1.87.0, SPEC §8.18 (SY1–SY6, SY-M, ⚑ Q331–Q337), §4.2zzc migration 0056 feature_requests, §10 POST /say,
  GET/POST /feature-requests, POST /feature-requests/{id}/ok|dismiss, GET /ops/requests, PATCH /ops/requests/{id}.
  Flagged as big to John first; he chose GO. Redesigns an earlier, uncommitted "Just say it" placement (the box moved
  from Reminders to a global button; /say saves nothing; the popup speaks, with Yes / Clarify / Cancel).
- **Verdict:** NEW rows: `src/shared/say-reading.ts`, `src/shared/feature-requests.ts`, `src/worker/say-reader.ts`,
  `src/worker/routes/say.ts`, `src/worker/feature-request-rows.ts`, `src/worker/routes/feature-requests.ts`,
  `frontend/src/components/EnsoButton.tsx`, `frontend/src/components/useSpeech.ts`,
  `frontend/src/components/FeatureRequests.tsx`. EXISTING: `routes/ops.ts` (the ops-token surface: /ops/requests behind
  the file-local guard), `vocab.ts` (FEATURE_REQUEST_STATUS / FEATURE_REQUEST_SIZE / SAY_KIND), `index.ts` (mount),
  `App.tsx` (mount EnsoButton once), `Reminders.tsx` (export ReminderForm, optional `start`), `Settings.tsx` (💡
  Requests, admins). REUSE-add-nothing: photo-reads.ts spendPhotoRead, claude.ts askClaude, shared/reminders.ts checks.
- **Flow stage:** rules (say-reading, feature-requests) → route (say, feature-requests, ops) → persist
  (feature-request-rows) → render (EnsoButton, useSpeech, FeatureRequests, Reminders).
- **Why:** the same split as event-reading / event-reader / event-photos and tasks / task-rows / routes/tasks;
  feature-request-rows.ts keeps ops.ts from importing a route; ops.ts stays one ops-token surface and its guard stays
  private; exporting ReminderForm follows AlarmForm / TimerForm (extracting it at 177/300 would be classitis; the seam
  stays named for 270); EnsoButton renders the form itself so App's Overlay union does not grow; the cleaner checks a
  reminder with the reminders route's own checks so Yes → Save cannot be refused. Threats named: shared Claude spend
  (the daily budget), and ENSO_DOES in say-reader.ts going stale (the code-steward checks it).
- **Caps:** App.tsx ~175/300, Reminders.tsx ~190/300, Settings.tsx ~65/99, ops.ts ~100/300, index.ts ~115/300,
  vocab.ts ~105/300; new files each under 150. Nothing in the band; no CEILINGS change.
- **Reorganizer:** none needed.
- **Sources read:** docs/module-ownership.md, docs/modularity.md, scripts/arch.ts, docs/placement-receipts.md, SPEC
  §8.18, §4.2zzc and the §10 rows, App.tsx, Reminders.tsx, Settings.tsx, routes/ops.ts, photo-reads.ts, vocab.ts.

---

## 2026-10-19 — steward pass after v1.85.0 (code-steward)

- **Run:** post-release, v1.85.0 (📥 Send to Enso, §7H / §8.8a, migration 0055: shared/inbox.ts, routes/share.ts,
  routes/inbox.ts, Inbox.tsx, InboxSetup.tsx, HouseholdLists.tsx 📥 view, vocab INBOX_KIND, photo-store `inbox`), also
  reconciling the v1.84.1 (identify ttl) and v1.84.2 (Modal scroll-to-top) patches.
- **Verdict:** SOUND. Typecheck green, 941/941, arch:audit quiet (HouseholdLists.tsx 81%); 3 code commits, 3 matching
  receipts, built as placed; map rows true.
- **Top finding:** LOW. The newest receipts were appended at the bottom of this file, not the top (newest first); the
  Send to Enso one is moved up here, the v1.84.1 and v1.84.2 ones still sit at the bottom.
- **Handoffs:** 3 to worker (move the two v1.84.x receipts up; derive isShareKey from SHARE_KEY_PREFIX + one SHARE_KEY_LEN
  and build InboxSetup's address via apiUrl; carried device-check lines for v1.76–v1.84), 0 to reorganizer, 0 to
  placement-advisor. Still carried: deleteEventStatements, renotifyText, updateEventStatement at their triggers.
- **Restraint:** HouseholdLists' three fixed views (a fourth is the trigger for a views table); the recent-day formatter
  copied in Inbox.tsx and HouseholdLists.tsx (two copies, a helper at the third); three one-line clipboard writes;
  photoTypeOf in inbox.ts, not photos.ts (home/ bundle); share-body parsing kept in the route file; the count fetch of
  full /inbox; untested >10-photo and batch-failure cleanup branches.

## 2026-10-19 — 🎲 Window reminders (placement-advisor)

- **Ask:** v1.85.0, SPEC §8.5c (RW1–RW4, ⚑ Q327–Q330), §10 GET/POST/PATCH /reminders `window`. A reminder rings once a
  day at a random time inside From–To on chosen days until Done or Ack. No migration.
- **Verdict:** EXISTING owners, no new row. Rules: src/shared/reminders.ts (windowError, nextWindowRing via
  engine.planReminderFires, reminderState never missed for a window, windowEnd). Route and persist: routes/reminders.ts
  (window body, widened SELECT, `window` in the view, PATCH writes recurrence + random columns), routes/alarms.ts
  (excludes rows with a random window), event-rows.ts (endWindowStatements: reads the event, asks windowEnd, returns the
  recurrence UPDATE plus removeFutureFires); alerts.ts spreads them into its actions batch. Render: Reminders.tsx,
  reusing AlertFields' DayChips and daysText. REUSE-add-nothing: daysText, the day chips, randomTimeIn, tick's
  superseded step.
- **Flow stage:** rules → route + persist → render.
- **Why:** the alarm event, the engine's random pick and the tick's superseded step already deliver this, so only the
  decisions are new, and they are pure and sit beside the reminder rules. Rejected: daysText in shared (duplicate of
  AlertFields); the end-series check inline in alerts.ts (a rule in a route); a helper in routes/reminders.ts (a
  route-to-route import); widening sourceOf. The spec gap it named (PATCH with a window) was settled as ⚑ Q330.
- **Caps:** shared/reminders.ts ~105/300, routes/reminders.ts ~130/300, alerts.ts 227/300, event-rows.ts ~165/300,
  alarms.ts 123/300, Reminders.tsx ~185/300 (seam if it reaches the band: ReminderForm.tsx). No CEILINGS change.
- **Reorganizer:** none needed.
- **Sources read:** docs/module-ownership.md, docs/modularity.md, scripts/arch.ts, docs/placement-receipts.md (top 4),
  SPEC §8.5c and §10, src/shared/reminders.ts, routes/reminders.ts, routes/alarms.ts, routes/alerts.ts, event-rows.ts,
  engine.ts (planReminderFires), tick.ts (superseded), Reminders.tsx, AlertFields.tsx.

---

## 2026-10-19 — 📥 Send to Enso, the share inbox (placement-advisor)

- **Ask:** v1.85.0, SPEC §7H (§7H.1 key, §7H.2 POST /share, §7H.3 the Inbox, §7H.4 the Shortcut, SH1–SH9, SH-M), §4.2zzb
  migration 0055 (share_keys, inbox_items), §8.8a the Inbox screen and Set up, ⚑ Q319–Q326.
- **Verdict:** NEW `src/shared/inbox.ts` (the limits, shareWindowStart, SHARE_KEY_PREFIX, shareText, photoTypeOf,
  inboxKind, shareMessage, InboxItem); NEW `src/worker/routes/share.ts` (POST /share by Bearer key, the body parsed by content
  type in the file; GET/POST/DELETE /share/key); NEW `src/worker/routes/inbox.ts` (GET /inbox, DELETE /inbox/{id},
  GET /inbox/{id}/photo); NEW `frontend/src/components/Inbox.tsx` and `InboxSetup.tsx`. EXISTING `vocab.ts` (INBOX_KIND),
  `photo-store.ts` (PhotoPrefix `inbox`), `index.ts` (mount both), `HouseholdLists.tsx` (the 📥 Inbox fixed view and its
  count), migrations/0055 and its test.
- **Flow stage:** rules (inbox.ts) → route + persist (share.ts, inbox.ts, photo-store.ts) → render (Inbox.tsx, InboxSetup.tsx,
  HouseholdLists.tsx).
- **Why:** no owner covered a key-authenticated way in or a member's own inbox (so no duplicate of an existing feature). Each
  decision (url versus text, what a photo is by its bytes, kind, the limits, the reply) is pure and lives in shared. Kind is
  derived and its strings live in vocab. The random key is made in the route; shared holds only its format. Two route files:
  the bearer door (the ops.ts precedent) and session reads of my own items are separate concerns. Rejected: photoTypeOf in
  shared/photos.ts (home/ bundles it, so changing it means rebuilding the helper); reusing http.ts photoBody (it trusts the
  declared type and caps at 4 MB, while §7H checks bytes and caps at 12 MB); a key guard in session.ts (cookie sessions only;
  sha256hex reused); the setup inside Inbox.tsx; a share-body.ts made now (file-local until it is over about 60 lines).
- **Caps:** inbox.ts ~55/300, routes/share.ts ~125/300, routes/inbox.ts ~45/300, photo-store.ts 36/300, index.ts ~111/300,
  HouseholdLists.tsx ~243/300 (below the band; a fourth fixed view is the signal to look at a special-views table),
  Inbox.tsx ~75, InboxSetup.tsx ~70. Nothing newly in the band; no CEILINGS change.
- **Reorganizer:** none needed.
- **Sources read:** the §7H draft, docs/module-ownership.md, docs/modularity.md, scripts/arch.ts, docs/placement-receipts.md
  (latest four), src/worker/photo-store.ts, src/worker/index.ts, src/worker/http.ts, src/shared/photos.ts,
  frontend/src/components/HouseholdLists.tsx, frontend/src/components/ListPicker.tsx; grep of session.ts, db.ts, ops.ts, SPEC.md.

## 2026-10-19 — Steward pass 31, since pass 30 (code-steward)

- **Run:** post-release, v1.84.0 (After work / After school per person for 📌 Reminders, §8.5b: migration 0054,
  shared/reminders.ts afterOf / afterError, vocab AFTER_KIND, routes/auth.ts + routes/members.ts `after`, state.tsx,
  Reminders.tsx, SettingsMe.tsx).
- **Verdict:** SOUND. Typecheck green, 925/925, arch:audit quiet; 1 code commit, 1 matching receipt, built as placed.
- **Top finding:** none new. Carried LOW: where-things-stand.md lacks the owed device checks for v1.76–v1.84.
- **Handoffs:** 1 to worker (the device-check lines, carried), 0 to reorganizer, 0 to placement-advisor. Still
  carried: deleteEventStatements, renotifyText, updateEventStatement at their triggers.
- **Restraint:** the after SELECT + afterOf in auth.ts and members.ts (two readers; a third gets a helper); the
  migration's frozen founder subquery; whenChoice's optional afterTime; the PWA choosing whose `after` to show.

---

## 2026-10-19 — After work / After school per person (placement-advisor)

- **Ask:** v1.84.0, SPEC §8.5b "After work / After school is each person's own" (RM7, RM8, ⚑ Q315–Q316), §4.2zza
  migration 0054 (member_prefs.after_kind / after_time, founder 15:30), §10 PATCH /me afterKind / afterTime and GET
  /members `after`.
- **Verdict:** EXISTING owners, no new row. Rules: src/shared/reminders.ts (AFTER_DEFAULT, AFTER_LABEL, afterOf,
  afterError, whenChoice's afterTime) and src/shared/vocab.ts (AFTER_KIND). Route/persist: migrations/0054 + test,
  routes/auth.ts (PATCH /me, memberView `after`), routes/members.ts (GET /members `after`). Render: state.tsx
  (Me / Member `after`), Reminders.tsx (one ticked member's after, else mine), SettingsMe.tsx (Work / School + time).
- **Flow stage:** rules + route/persist + render.
- **Why:** the default-by-role rule is a decision beside the When chips it feeds; it takes `admin: isAdmin(m)` and
  does not import roles.ts. The '17:30' in WHEN_CHOICE derives from the admin default. Rejected: a new member-prefs
  module; the default in the routes; the PWA computing it. Accepted duplicate: the after-column SELECT in auth.ts and
  members.ts (a third reader means a shared helper).
- **Caps:** all at GLOBAL_FILE_CAP 300; nothing new in the band.
- **Reorganizer:** none needed.

---

## 2026-10-19 — Steward pass 30, since pass 29 (code-steward)

- **Run:** post-release, v1.83.0 (📌 Reminders §8.5b: shared reminders.ts, routes/reminders.ts, Reminders.tsx; touches
  alarms.ts, event-rows.ts, vocab.ts, index.ts, Alarms.tsx); also covers v1.82.0 (💪 running mark) and v1.82.1 (Alerts label).
- **Verdict:** SOUND. Typecheck green, 922/922, arch:audit quiet; 3 code commits, 3 matching receipts, built as placed.
- **Top finding:** LOW: the soft-delete batch (UPDATE deleted_at + removeFutureFires) is now in events.ts, alarms.ts and
  reminders.ts → one `deleteEventStatements` in event-rows.ts.
- **Handoffs:** 3 to worker (deleteEventStatements at the next event-route touch; one renotifyText for the three PWA
  renotify label tables; owed device checks v1.76–v1.83 in where-things-stand.md, carried), 0 to reorganizer, 0 to
  placement-advisor. Still carried: updateEventStatement with the next event-column change, plus pass 29's task items.
- **Restraint:** reminders.ts stays a sibling of alarms.ts; two positional optionals on insertEventStatement are accepted
  (a third becomes an options object); the API's 1–240 renotify range matches alarms; Alarms.tsx churn is watched.

---

## 2026-10-19 — 📌 Reminders, one-off until Done (placement-advisor)

- **Ask:** v1.83.0, SPEC §8.5b, §4.2a note, §10 /reminders rows (⚑ Q311–Q314). A reminder is an is_alarm event with
  recurrence NULL and max_alerts REMINDER_MAX_ALERTS 12, with no migration. /reminders CRUD with a derived due /
  ringing / missed state (done not listed), and a 400 for a time not after now. /alarms stops listing reminders.
  whenChoice for the four chips. An Alarms-tab 📌 Reminders section with a list and a form.
- **Verdict:** NEW `src/shared/reminders.ts` (REMINDER_MAX_ALERTS, REMINDER_RENOTIFY, WHEN_CHOICE + whenChoice,
  reminderTimeError, reminderState); NEW `src/worker/routes/reminders.ts`; NEW `frontend/src/components/Reminders.tsx`
  (the section and the file-local form, owning the `Reminder` shape). EXISTING `routes/alarms.ts` (SELECT_ALARMS
  `AND e.recurrence IS NOT NULL`), `event-rows.ts` (insertEventStatement gains `isAlarm = false`), `vocab.ts`
  (REMINDER_STATE), `index.ts` (mount), `Alarms.tsx` (📌 Reminders first in SECTIONS). No engine, tick, fire-rows or
  delivery change; no migration.
- **Flow stage:** rules (shared reminders.ts) → route + persist (routes/reminders.ts, event-rows.ts) → render (Reminders.tsx).
- **Why:** the alarm shape already rings, repeats and closes on Done, so the reminder adds no new pipeline. The state
  and the time check are decisions: pure, in shared/ (bountyStatus / taskState precedent). Rejected:
  REMINDER_MAX_ALERTS in alert-limits.ts (input limits only; TASK_MAX_ALERTS lives in tasks.ts); state in the route;
  folding /reminders into alarms.ts; a third inline INSERT INTO events; the form in Alarms.tsx; a separate
  ReminderForm.tsx. Spec gap named and closed before building: an absent `renotifyMin` repeats every 30 (⚑ Q312).
- **Caps:** alarms.ts ~123/300, event-rows.ts ~153/300, Alarms.tsx ~184/300; new reminders.ts ~50, routes/reminders.ts
  ~105, Reminders.tsx ~150. Nothing in the band; no CEILINGS change.
- **Reorganizer:** none needed.

---

## 2026-10-19 — v1.82.1: the Alarms tab's visible label becomes "Alerts" (placement-advisor)

- **Ask:** v1.82.1 patch, SPEC §8.1 / §8.5 / Welcome card, ⚑ Q310. The visible label "Alarms" becomes "Alerts" in the NAV tab bar entry (App.tsx), the tab's h1 (Alarms.tsx) and the Welcome card line (Welcome.tsx). The `'alarms'` id, code names and the inner "⏰ Alarms" section button are unchanged.
- **Verdict:** EXISTING `frontend/src/App.tsx`, `frontend/src/components/Alarms.tsx`, `frontend/src/components/Welcome.tsx`. REUSE-add-nothing: no new row, no shared change, no migration.
- **Flow stage:** render.
- **Why:** these labels are PWA-only display text and already live with their sibling labels (NAV is "the one list of tabs"). Rejected: moving them to vocab.ts, which holds shared wire and validation vocabulary and has no UI labels. Renaming the id or components was also rejected: a visible-text patch does not need a code-wide rename.
- **Caps:** App.tsx ~174/300, Alarms.tsx ~182/300, Welcome.tsx small; nothing in the band.
- **Sources read:** docs/placement-receipts.md (head), frontend/src/App.tsx (1–45), src/shared/vocab.ts (searched for labels), a repo-wide search for the visible "Alarms" label in code, tests, SPEC and docs.

---

## 2026-10-19 — My running task on the tab bar and the Alarms menu (placement-advisor)

- **Ask:** v1.82.0, ⚑ Q309, SPEC §8.1 / §8.5a / §10. GET /status gains `myTask: { title, state } | null` (my open session only); while set, ⏰ Alarms on the tab bar shows a small 💪 and the 💪 Task buddy button shows "🟢 Working" / "☕ On a break" / "⏸ Paused". MojoSOGO: "I need an icon on task buddy if it is running so i know".
- **Verdict:** EXISTING `src/worker/routes/household.ts` (/status: myOpenTask + taskState, no new SELECT), `frontend/src/state.tsx` (Status.myTask typed `Exclude<TaskState, 'ended'>`), `frontend/src/App.tsx` + `App.module.css` (the mark in the NAV render; NAV unchanged), `frontend/src/components/PickGrid.tsx` + `PickGrid.module.css` (optional `note` on PickEntry / PickFace), `frontend/src/components/Alarms.tsx` (file-local state → note text for the 'tasks' entry), `test/tasks-api.test.ts`. No new row, no shared change, no migration.
- **Flow stage:** route + persist (read) → render.
- **Why:** the state is already decided by tasks.ts taskState over the row task-rows.ts myOpenTask reads; /status only composes. Rejected: a smaller SELECT (a second copy of "my open task", §0.5); reusing numeric `count` (widens a field four importers use); the state words in vocab / shared tasks.ts (PWA-only display text); changing TaskCard's own state line; a NAV column for one tab. Freshness needs no code: task moves already refresh() via useTaskSend.
- **Caps:** household.ts ~108/300, state.tsx ~126/300, App.tsx ~174/300, Alarms.tsx ~182/300, PickGrid.tsx ~34/300; nothing in the band.
- **Sources read:** docs/module-ownership.md, scripts/arch.ts, docs/placement-receipts.md, household.ts, task-rows.ts, shared/tasks.ts, App.tsx, Alarms.tsx, PickGrid.tsx, state.tsx, the CSS modules, Task*.tsx, test/tasks-api.test.ts.

## 2026-10-19 — Steward pass 29, since pass 28 (code-steward)

- **Run:** post-release, v1.81.0 (💪 Task buddy: shared tasks / task-moves / task-replies / task-say, worker task-rows + routes/tasks + routes/task-photos, migration 0053, six Task*.tsx); also covers v1.80.1 (tick step 1 → fire-rows reminderInserts).
- **Verdict:** SOUND. Typecheck green, 915/915, arch:audit quiet; 2 code commits, 2 matching receipts, built as placed; the map rows for fire-rows, tick, alerts, push, household and my-alerts describe the code.
- **Top finding:** LOW, photo-reader.ts readDonePhoto restates TASK_LOOKS as `z.enum(['yes','no','unsure'])` → `z.enum(TASK_LOOKS)` (show-reader precedent).
- **Handoffs:** 5 to worker (the TASK_LOOKS schema; TASK_MAX_ALERTS for the hard-coded 2 in checkinText and TaskCard plus one TASK_ID_PREFIX for NOT_TASK, with the next §7G change; applyTaskMove into one guarded batch, optional; a push.test case for a task check-in's empty actions; owed device checks v1.76–v1.81 in where-things-stand.md), 0 to reorganizer, 0 to placement-advisor. Carried: updateEventStatement with the next event-column change.
- **Restraint:** the four shared task modules stay split by concern; task-photos.ts stays its own route; the machine/cook/task id-prefix branches across 9 files are accepted at three instances (a fourth gets a placement question about a shared fire descriptor); sourceOf's breadth, fireViews' per-row task read, the founder default in GET /tasks and engine.ts at 88% are watched, not flagged.

## 2026-10-19 — 💪 Task buddy (placement-advisor)

- **Ask:** v1.81.0, SPEC §7G, §4.2zz, §8.2, §8.5, §8.5a, §5.4, §9.5, §10. A task session rides on a rolling timer
  (`task_…`) plus a task_sessions row (migration 0053). Check-ins are its timer fires with whole-sentence texts (Private
  spoken as "Time for a task check-in."); five answers and varied replies; readTaskStart / readTaskSay; pause, break,
  resume and changes; Finish's done check with a Claude photo read; summary. Hidden from /timers and from other
  members' /fires and Status; Ack refused on it. A fifth Alarms button; a reply box that outlives the ringing row.
- **Verdict:** NEW `src/shared/tasks.ts` (model, limits, validation, derived state, Task wire, cleanDoneCheck),
  `src/shared/task-moves.ts` (transitions → session / timer / fires / said), `src/shared/task-replies.ts` (every text),
  `src/shared/task-say.ts` (readers), `src/worker/task-rows.ts`, `src/worker/routes/tasks.ts`,
  `src/worker/routes/task-photos.ts`, and the PWA's `Tasks.tsx`, `TaskStart.tsx`, `TaskCard.tsx`, `TaskCheckin.tsx`,
  `TaskDone.tsx`, `TaskSaid.tsx`. EXISTING: vocab.ts, fire-rows.ts (Source say / houseSay over an inline task_sessions
  read), tick.ts, routes/alerts.ts, push.ts, alert-history.ts + routes/my-alerts.ts, photo-reader.ts (readDonePhoto),
  index.ts, state.tsx (taskSheet / showTask), App.tsx, Alarms.tsx, FireActions.tsx, RingingBar.tsx. The three spec
  gaps it named were settled as ⚑ defaults before building: no push buttons (Q307), `taskTimeUp` on GET /fires, and
  other members' Status leaving task check-ins out (Q308, so routes/household.ts too).
- **Flow stage:** rules (four shared modules), route + persist (two route files, task-rows.ts), deliver (tick / push
  take whole texts from Source; no task names in tick), render (six components, state.tsx).
- **Why:** one tasks.ts would be ~450 lines, so it splits by concern up front (model / moves / words out / words in);
  the transitions are rules, so they are shared as in cooking.ts; a `taskSource` in task-rows.ts was rejected (a
  fire-rows ⇄ task-rows cycle); the done-check reader joins photo-reader.ts; the reply box is cross-cutting client state.
- **Caps:** tick.ts 115/148, alerts.ts 227/300, fire-rows.ts 202/300; new files ≤ ~190; arch:audit quiet, nothing in the
  band. Built as placed; task-replies.ts also imports time.ts (for `ms`), recorded in its ownership row.

## 2026-10-19 — Ringing bar rows only for their audience: audienceOf shared by tick and /fires (placement-advisor)

- **Ask:** SPEC §8.2 widens to every Ringing bar row (reminder, timer, chore, thing, machine, cooking): each shows only to its alert's audience = audience(...).push as tick step 2 computes it from sourceOf; nobody named → everyone. Follows the isForMe receipt above (MojoSOGO: "no cross contamination between users on upper alert").
- **Verdict:** src/worker/fire-rows.ts (`audienceOf(src, activeIds)`), applied in src/worker/routes/alerts.ts fireViews; tick.ts step 2 adopts it [EXISTING]
- **Flow stage:** rules (optins.ts audience, unchanged) → mapping (fire-rows.ts) → route view (alerts.ts)
- **Why:** The danger is the /fires filter drifting from who actually gets pushed; the Source → AudienceInput mapping goes next to sourceOf so tick and /fires share one copy. A `fireIsFor` boolean was rejected (tick needs the full audience; it would hide a query per fire). activeMemberIds is fetched once per request. The per-row isForMe/onEventIds path in fireViews is deleted. Spec edges settled: a gone source still shows (so it can be closed); all-assigned-disabled → nobody; push does not depend on channel.
- **Caps:** fire-rows.ts about 207/300; alerts.ts about 229/300; tick.ts about 112/148. None enters the band.
- **Sources read:** fire-rows.ts, alerts.ts, tick.ts, optins.ts, docs/module-ownership.md, scripts/arch.ts, audience/activeMemberIds callers.

## 2026-10-19 — /fires hides reminders not assigned to me: isForMe in optins.ts (placement-advisor)

- **Ask:** v1.92.3 patch, SPEC §8.2 Ringing bar: GET /fires also hides a reminder fire from a member outside its audience (event assigned_to is non-empty and doesn't include them), using the same "for me" rule as audience() (§5.7, §7.5).
- **Verdict:** `src/shared/optins.ts` (new pure `isForMe`, also used by audience's narrowing) + `src/worker/routes/alerts.ts` (fireViews selects e.assigned_to, filters with isForMe) [EXISTING]
- **Flow stage:** rules (optins.ts) + route (alerts.ts applies it at read time)
- **Why:** optins.ts already owns "who an event/fire is for" (isOnFor + audience with its assigned-or-everyone narrowing). One predicate shared by push recipients and the Ringing bar keeps them from drifting. Inline in alerts.ts was rejected (restates the rule in a route); a new module was rejected (same concern). audience() keeps its push order and house/funhouse results; isOnFor stays for /calendar; assignedTo does not leak into the /fires shape; Away (hideOff=false) unaffected; `?state=open` narrows too. RingingBar.tsx needs no change.
- **Caps:** optins.ts about 33/300; alerts.ts 228/300 (no ceiling). No file newly in the warning band.
- **Sources read:** src/shared/optins.ts, src/worker/routes/alerts.ts, scripts/arch.ts, docs/module-ownership.md, SPEC.md §8.2, isOnFor/audience usages, test/optional-events.test.ts, RingingBar.tsx.

## 2026-10-19 — Moon phases (placement-advisor)

- **Ask:** Compute and show the four principal moon phases on the calendar: moon.ts, /calendar moonPhases, cell icon, day sheet line (SPEC §7.12, §7.2, §10).
- **Verdict:** src/shared/moon.ts + test/moon.test.ts [NEW row]; src/worker/routes/events.ts, frontend/src/components/Calendar.tsx, DayCell.tsx, DaySheet.tsx [EXISTING]
- **Flow stage:** rules (moon.ts); persist/route (events.ts only returns it); render (Calendar, DayCell, DaySheet)
- **Why:** One distinct pure concern, so a focused leaf beats widening holidays.ts or weather.ts. The route fetches the tz and returns the data, and the PWA only draws it, which keeps the rule in shared. Rejected homes: holidays.ts (a different concern with a rules table), a frontend-side computation (the PWA would re-derive what the server returns), and a new route (it is part of the /calendar payload).
- **Caps:** events.ts about 124/147 (under the warning band); Calendar.tsx 198/300; DayCell.tsx 102/300; DaySheet.tsx 66/300; moon.ts 60/300. No CEILINGS change.
- **Sources read:** .claude/agents/placement-advisor.md, scripts/arch.ts, arch:audit output, docs/module-ownership.md, SPEC.md §7.2 and §7.12, events.ts, DayCell.tsx.

## 2026-10-19 — Popups open scrolled to the top (placement-advisor)

- **Ask:** Every popup opens scrolled to the top. On iPhone, when the field showModal focused sits below a big picture, focus moves to the dialog with preventScroll (SPEC §8 iPhone rules, v1.84.2 patch, ⚑ Q318).
- **Verdict:** `frontend/src/components/Modal.tsx` + `frontend/src/components/Modal.module.css` [EXISTING]
- **Flow stage:** render
- **Why:** Open-time scroll and focus are part of the one `<dialog>` primitive's concern. Modal.tsx is the only `showModal` in frontend/src, so one change covers every popup. Fixing it in each picture-bearing form (edit form, recipe) was rejected: that would put copies of the same fix in several places and let them drift apart. Props are unchanged, so the high fan-in carries no risk. Logic stays in the existing mount effect, and the error scrollIntoView effect is untouched.
- **Caps:** Modal.tsx goes from 64 to about 75 out of 300 (GLOBAL_FILE_CAP, no CEILINGS entry). No file enters the band.
- **Sources read:** frontend/src/components/Modal.tsx, frontend/src/components/Modal.module.css, scripts/arch.ts (caps), docs/module-ownership.md (Modal row), grep of frontend/src for showModal/<dialog.

## 2026-10-19 — identify payload carries LM Studio ttl (placement-advisor)

- **Ask:** SPEC §7A.3 v1.84.1 (patch, Q317 ⚑ default): `identifyPayload` also sends `ttl: IDENTIFY_TTL_S` (86400), so LM Studio keeps the vision model it loaded on demand in memory for 24 h after the last photo. The spec's max_tokens 100 is corrected to IDENTIFY_MAX_TOKENS 1024 (the code already matches).
- **Verdict:** `home/identify.ts` (+ `test/home-identify.test.ts` SN14) [EXISTING]
- **Flow stage:** deliver
- **Why:** The row for `home/identify.ts` already owns the one LM Studio request and its payload fields (temperature, max_tokens). ttl is one more of those fields, so this is still one concern with no new owner. It is a delivery setting, not a decision, so src/shared/ was rejected as a home. Fan-in is the helper and its test only. The value is a named constant so it is written once.
- **Caps:** home/identify.ts about 75/300; test/home-identify.test.ts about 88/300; no file in the warning band.
- **Sources read:** home/identify.ts, scripts/arch.ts (caps), docs/module-ownership.md (identify row), test/home-identify.test.ts (line count).

## 2026-10-16 — tick step 1 reminder planning (reorganizer)

- **Trigger:** steward pass 28 item 1, MojoSOGO 2026-10-16 "SPLIT": tick.ts 131/148, two lines from the band (133).
- **Seam moved:** step 1 (the reminding-event SELECT, its row type and the planReminderFires mapping) from
  `src/worker/tick.ts` to a new `reminderInserts` in `src/worker/fire-rows.ts` [EXISTING], beside choreRunInserts.
- **Room opened:** tick.ts: 131 → 115 lines; cap 148 → 148 (115 + WORKING_BUFFER is above the old cap, so the pin
  stays; never raised). fire-rows.ts 165 → 188/300, no pin.
- **Behavior:** preserved — typecheck, npm test and arch:audit green; same SELECT text, same mapping, same
  INSERT OR IGNORE statements in the same order (reminders, then chore runs, then things) in one batch.
- **Restraint:** only step 1; 1b and 1c already delegate their row work and stay as one-line calls in tick.

---

## 2026-10-16 — Steward pass 28, since pass 27 (code-steward)

- **Run:** post-release, v1.80.0 (event-access.ts canOpenEvent, GET /events/:id 403 guard, DaySheet locked row).
- **Verdict:** SOUND. Typecheck green, 899/899, arch:audit quiet; 1 code commit, 1 matching receipt. canOpenEvent is the single source for server and PWA; /calendar and /optional-events send only summary fields.
- **Top finding:** tick.ts 131/148 (carried over): move step 1 into `reminderInserts` in src/worker/fire-rows.ts.
- **Handoffs:** 1 to reorganizer (tick move), 3 to worker (receipt order, now fixed here; owed phone checks v1.76–v1.80 in where-things-stand.md; updateEventStatement with the next event-column change), 0 to placement-advisor.
- **Restraint:** event-access.ts stays its own small owner rather than joining roles.ts; engine.ts 88% with no split point yet.

---

## 2026-10-16 — Only an event's people open its details (placement-advisor)

- **Ask:** MojoSOGO: someone not on an event sees only its name and who's going; only the people on it open the details.
  Rule: nobody assigned, assigned, the creator, or an admin. GET /events/{id} refuses everyone else with 403; the day-sheet
  row is not tappable for them and shows 🔒; /calendar summary unchanged (v1.80.0, SPEC §6.3, §8.3, §10).
- **Verdict:** NEW `src/shared/event-access.ts` (canOpenEvent + cannotOpenText; pure, imports nothing). EXISTING
  `src/worker/routes/events.ts` (GET guard), `frontend/src/components/DaySheet.tsx` (locked row), `Lists.module.css` (`.locked`).
  No new wire field.
- **Why:** a rule both Worker and PWA need → shared, one copy; no `canOpen` on /calendar since occurrences already carry
  assignedTo and createdBy (§0.5). Rejected roles.ts (its header keeps feature rules out), optins.ts (whether an event
  exists, not its details), participants.ts (frontend-only). Takes `admin: isAdmin(m)` like the roles doctrine; canChange ⇒
  canOpenEvent pinned by a pure test. DaySheet is the only PWA opener of an event.
- **Caps:** routes/events.ts 118 → 121/147 (band 133 not entered); DaySheet.tsx 61 → 66/300; event-access.ts ~11/300.
  No CEILINGS change.

---

## 2026-10-16 — Event reminder Random time window (placement-advisor)

- **Ask:** An event reminder can have a Random time window (`remind_random_from` / `remind_random_to`, migration 0052);
  the due time is a deterministic hash pick of (event id, occurrence date) inside [from, to) on the local date of
  `start − offset`. Wire `reminder.randomFrom` / `randomTo`; UI a Random time tick with From / To (SPEC §8.4, §5.1, §4.2zy; v1.79.0).
- **Verdict:** NEW row `src/shared/random-time.ts` (randomWindowError, randomTimeIn). EXISTING `src/shared/engine.ts`
  (ReminderEvent + planReminderFires), `src/worker/event-rows.ts`, `src/worker/routes/events.ts` (PATCH columns),
  `src/worker/tick.ts` (select), `frontend/src/components/ReminderFields.tsx`; `migrations/0052` + its test.
- **Why:** the pick and the window check are rules, so shared and pure; route and form ask the same check. Rejected:
  inlining in engine.ts (258/300 → ~273, into the band); validation only in event-rows (the form would repeat it);
  picking in tick.ts (a rule in orchestration, tick at 130/148). Alarms and Plan it untouched (NULL columns).
- **Caps:** engine.ts ~263/300; event-rows.ts ~155/300; random-time.ts ~25/300; ReminderFields.tsx ~90/300;
  routes/events.ts ≤117/147; tick.ts ≤132/148. Nothing newly in the band.

---

## 2026-10-15 — List item CRUD out of routes/lists.ts (reorganizer)

- **Trigger:** steward pass 26 flagged `src/worker/routes/lists.ts` at 270/300 (warning band, list CRUD and item CRUD in one file); MojoSOGO approved "SPLIT" on 2026-10-15.
- **Seam moved:** the item handlers (`POST /lists/{id}/items`, `PATCH` / `DELETE /list-items/{id}`), loadItem, ITEM_GONE, assigneeParam, timeParam and TEXT/NOTE/TIME messages from `src/worker/routes/lists.ts` to `src/worker/routes/list-items.ts` [NEW row]. Mounted in index.ts directly after `lists`; item-photos.ts now imports loadItem / ITEM_GONE from list-items.ts.
- **Dependency:** one way, list-items.ts → lists.ts (ItemRow, itemView, loadItems, currentItems, listParam). GET /lists/{id} needs itemView and currentItems too, and an item belongs to a list, so the list file is the base and nothing in lists.ts imports from list-items.ts.
- **Room opened:** lists.ts: 270 → 162 lines; list-items.ts 120; no CEILINGS pin existed, none added (both well under the global 300).
- **Behavior:** preserved. typecheck, npm test (123 files / 887 tests) and arch:audit are green, and nothing is in the warning band. Handler bodies, SQL, messages and status codes moved verbatim. Route registration order is unchanged: item-photos comes first, so `/list-items/read-photo` and `/list-items/{id}/photo` are still matched before `/list-items/{id}`, and the new routes don't overlap any method or path in lists.ts.
- **Restraint:** only the item writes moved. The item row, itemView and currentItems stay with GET /lists/{id}, which reads them. No helper was split out into a third file.

---

## 2026-10-15 — Deploy refuses while a D1 migration is pending (placement-advisor)

- **Ask:** MojoSOGO picked "GRD": `npm run deploy` must refuse while the remote D1 `enso` has a pending migration (v1.77.0 went out 2026-10-14 without 0050; every delivery insert failed all day). SPEC §10.1 `predeploy` row, §2.2 layout, DG1–DG3.
- **Verdict:** NEW `scripts/pending-migrations.ts` (deployGate: the pure, fail-closed verdict and the refusal text) and NEW `scripts/predeploy.ts` (one spawnSync of wrangler with `shell: true` for Windows, print, exit code), a `predeploy` line in package.json, `test/pending-migrations.test.ts`.
- **Flow stage:** release tooling (`scripts/`); the decision in the pure file, process I/O in the runner.
- **Why:** tests run inside workerd, which cannot load `node:child_process`, so the parser sits apart (the `scripts/arch-types.ts` precedent). Rejected: one combined file (untestable); adding to arch.ts / arch-audit.ts (a second concern); changing the `deploy` string (npm's pre-hook gates it). Fail closed: only the exact "No migrations to apply" clears. README has no deploy section, so the routine is recorded in docs/where-things-stand.md step 2 only (CLAUDE.md's "deploy steps are in README.md" is stale; a doc fix).
- **Caps:** both new files under 30/300; no existing source file grows; no CEILINGS change.

---

## 2026-10-15 — A timer's day ending ends Away (placement-advisor)

- **Ask:** A rolling timer fire with Away tapped stays away forever: Rule 0 reuses the same fire row into the next window, so away_by carries over and tick writes no push or house rows ("Stairs and pushups", 10-13 → silent on 10-14). Fix: when Rule 0 carries a timer fire to the next window, clear away_by/away_at; migration 0051 clears the open timer fires already stuck (SPEC §9.2c Q214, §5.3 Rule 0, acceptance AW5).
- **Verdict:** EXISTING `src/shared/engine.ts` (Rule 0's result gains `dayEnded: true`; stepFire's return type widens and FireRow is unchanged), EXISTING `src/worker/tick.ts` (step 2: on `dayEnded`, `UPDATE fires SET away_by = NULL, away_at = NULL` in the same batch), new `migrations/0051_*.sql` + `test/migration-0051.test.ts` (data repair: scheduled timer fires with away_by set).
- **Flow stage:** rules (engine Rule 0 says the day ended) → persist (tick writes the clear; migration repairs live rows).
- **Why:** The decision belongs to the rule that makes it, and that rule is pure, so it returns a flag rather than knowing about Away. Rejected: tick working out the rollover itself (a rule in orchestration); a separate `rolledToNextWindow(fire, next)` predicate (a second copy of Rule 0's conditions that can drift); widening FireRow or `updateFire` in fire-rows.ts (pulls Away into the engine, or adds a flag parameter for one caller). The inline UPDATE follows tick's existing superseded UPDATE. SPEC.md's copy of the stepFire signature updated.
- **Caps:** engine.ts ~258/300; tick.ts ~130/148 (band at 133). Neither enters the band, and no CEILINGS change.

---

## 2026-10-15 — Event reminder "Every hour" repeat, up to 12 alerts (placement-advisor)

- **Ask:** MojoSOGO "Saturday reminder 9:00am for Shelly, repeat hourly until she ACKs" → §8.4 Event form, Reminder section: Repeat alert every gains "Every hour", which saves `renotifyMin` 60 with `maxAlerts = HOURLY_MAX_ALERTS` (12, ⚑ Q292). Every other choice sends no maxAlerts (API default 4). No backend change.
- **Verdict:** EXISTING `frontend/src/components/ReminderFields.tsx` (RENOTIFY_OPTIONS + '60'; `HOURLY_MAX_ALERTS` const; `Reminder.maxAlerts?`; `toReminder` sets it only for '60').
- **Flow stage:** render (capture intent). The route (event-rows.ts) already validates `maxAlerts` 1–20 and returns it on GET.
- **Why:** the row already owns the repeat select and the reminder ⇄ form mapping. The 12 is a form default, not vocabulary or a rule, so vocab.ts and src/shared/ were rejected. AlertFields.tsx RENOTIFY was rejected because alarms, timers and chores are outside this spec. Omitting maxAlerts on PATCH resets an hourly event to 4 on the server, which is the behavior the spec wants. EventForm.tsx is unchanged.
- **Caps:** ReminderFields.tsx about 71/300. No CEILINGS change and nothing newly in the band.

## 2026-10-14 — Steward pass 26, whole tree (code-steward)

- **Run:** after the v1.77.0 release (SPEC 3.38 §7A.4 every day lists + Ping owners, migration 0050); also covers v1.76.0 (weather.ts heatOf + DayCell).
- **Verdict:** MINOR DRIFT. Typecheck green, 881/881. arch:audit: only routes/lists.ts in the band (270/300). 2 receipts matched to 2 code commits.
- **Top finding:** MED, routes/lists.ts in the band. Extract, not bless: item handlers (POST /lists/:id/items, PATCH/DELETE /list-items/:id), loadItem, ITEM_GONE and the item validators → `src/worker/routes/list-items.ts`, before the next §7A change.
- **Handoffs:** 1 to reorganizer (the list-items extract), 1 docs (where-things-stand device checks for v1.76/v1.77). Both wait for MojoSOGO's pick.
- **Restraint:** the repeated `list.daily ? todaysItems` line; pingDue not crossing midnight (Q289); the inline owner fallback (Q288); ListPanel staying in HouseholdLists.tsx; the files at 80–86% did not grow.

## 2026-10-13 — v3.38 §7A.4 Every day lists and Ping owners (placement-advisor)

- **Ask:** MojoSOGO 2026-10-13 "In reminders give option to ping owners. Time & Checkbox each day" → every day lists: a tick lasts for today only; items may have a time and go by it; with Ping owners on, a once-a-day push to the item's owner (or every active member) at its time. Phone only, never a founder ping (SPEC §7A.4, §4.2zw migration 0050, §8.8, §10 /lists rows, §9.4 step 5; ⚑ Q287–Q291; v1.77.0).
- **Verdict:** EXISTING `src/shared/lists.ts` (todaysItems, dailyOrder, pingDue, PING_LATE_MIN, listPingTitle) and `src/shared/time.ts` (dayStartUtc, one home for the route's and the tick's midnight); `migrations/0050_daily_lists.sql` + test/migration-0050.test.ts; EXISTING `src/worker/routes/lists.ts` (validation, views, GET/openCount/resolveAdd through todaysItems, openCount counted in TS); NEW row `src/worker/list-pings.ts` (listPingTick, tick step 3f); EXISTING `src/worker/tick.ts` (one call), `src/worker/deliveries.ts` (listItemId; FOUNDER_PING adds `list_item_id IS NULL`), `src/shared/alert-history.ts` (comment only); EXISTING `HouseholdListOptions.tsx`, `HouseholdListItemForm.tsx`, `HouseholdLists.tsx` (renders the server's order, no local comparator).
- **Flow stage:** rules (lists.ts, time.ts) → route → persist and deliver (list-pings.ts, deliveries.ts) → render.
- **Why:** shared rules so route, tick and PWA ask the same functions; the ping sweep is its own owner beside timer-starts.ts and mess-asks.ts; the founder-ping exclusion stays in the one predicate. Rejected: sorting in ListPanel, the midnight rule in SQL, moving ListPanel out first (seam for later: `frontend/src/components/ListPanel.tsx`).
- **Spec gaps settled by the builder:** a disabled owner counts as none (folded into Q288); overlapping ticks accepted (cron once a minute).
- **Caps after:** routes/lists.ts **270/300 — newly in the warning band**, the next agent's job (seam named: item handlers → `routes/list-items.ts`); tick.ts 128/148; HouseholdLists.tsx 237/300; nothing else near the band.

## 2026-10-13 — Forecast high with heat band on the day cell (placement-advisor)

- **Ask:** Show the day's forecast high in °F to the left of the weather emoji on the calendar cell, colored cold (<60) blue, nice (60–84) text color, hot (>=85) red (SPEC §7.11 addition, v1.76.0).
- **Verdict:** `src/shared/weather.ts` (heatOf + COLD_BELOW / HOT_FROM) + `frontend/src/components/DayCell.tsx` / `DayCell.module.css` (number inside `.wx`, band classes) [EXISTING]
- **Flow stage:** rules (heatOf) + render (DayCell)
- **Why:** The band is a decision, so it goes in shared next to weatherOf/weatherText and the PWA asks it rather than re-comparing thresholds. DayCell already draws `.wx`. vocab.ts was rejected because the band is a local TS union that is never stored or sent. A DayCell-local helper was rejected because it would hide a rule in the render layer. No schema or wire change, since `weather.high` is already on /calendar. The phone (`.narrow`) display is a ⚑ DEFAULT (Q285).
- **Caps:** weather.ts ~71/300, DayCell.tsx ~99/300, DayCell.module.css ~58/300. No CEILINGS touched and nothing newly in the band.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md (weather.ts, DayCell rows), src/shared/weather.ts, frontend/src/components/DayCell.tsx, frontend/src/components/DayCell.module.css, docs/placement-receipts.md (grep), SPEC.md (grep; §7.11 has no heat-band text yet)

---

## 2026-10-13 — Steward pass 25, whole tree (code-steward)

- **Run:** after the v1.75.0 release (SPEC §9.5: handled alerts clear themselves via `isCleared` in shared/alert-history.ts, with the route's LEFT JOIN on messes and EXISTS denial; Ack (left) / Close (right) footer on info-only cards in MyAlerts.tsx, Q284).
- **Verdict:** SOUND. Typecheck passed, 864/864 tests, arch:audit quiet. 2 receipts matched to 2 code commits, no mismatches.
- **Top finding:** LOW. decisions.md Q272 and Q283 were not marked superseded by Q284; where-things-stand still expected "Already handled." and had no Ack/Close device check. Fixed in this commit.
- **Handoffs:** 0 to reorganizer, 1 to worker (the docs fix, done), 0 to placement-advisor.
- **Restraint:** the inline `MINE` predicate in the GET (predates v1.75.0); asks identified by title plus mess_id (scoped in the receipt); the Ack footer flashing before /messes loads or showing for a snoozed fire (within the spec); a failed hide showing its error on the list. Items from passes 19–21 still wait for MojoSOGO's pick.

## 2026-10-12 — v1.75.0: My alerts card Ack (left) + Close (right) (placement-advisor)

- **Ask:** A My alerts card with nothing else to act on gets Ack (bottom left, reuses hide() = DELETE /me/alerts/{id}, then closes) and Close (right) (SPEC §9.5 "Ack", v1.75.0; MojoSOGO "Let me ack this which will clear it. Ack on left; close on right").
- **Verdict:** `frontend/src/components/MyAlerts.tsx` [EXISTING]; render stage. No new route, rule or vocab.
- **Why/Caps:** ~113/300 (global cap), far below the band; a shared or route home rejected since nothing is decided, only captured.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md (MyAlerts row), MyAlerts.tsx.

## 2026-10-12 — v1.75.0: Handled alerts clear themselves (placement-advisor)

- **Ask:** SPEC §9.5 "Handled ones clear themselves" (v1.75.0, MA11, Q284; MojoSOGO "Already answered? Auto clear"). GET /me/alerts leaves out a fire's push whose fire is closed and a mess ask that no longer asks me (askedOf), derived on each read with no row writes. MyAlerts drops the "Already handled."/"Already answered." text; a card closes when its alert leaves the list; an opened-from-push id not in the list shows no card.
- **Verdict:** src/shared/alert-history.ts (`isCleared({ fireState, messAsksMe })`) + src/worker/routes/my-alerts.ts (one SELECT gains `f.state`, a LEFT JOIN on messes and an EXISTS `denied_me`; activeMemberIds from db.ts, read once) + frontend/src/components/MyAlerts.tsx [EXISTING]
- **Flow stage:** rules (alert-history) → route reads and filters → render
- **Why:** alert-history already owns "which of my pushes are shown" (ALERT_HISTORY_MAX), so the cleared decision is a pure rule there, taking plain facts and keeping its vocab/announce-only imports. The route works out `messAsksMe` with MESS_ASK_TITLE and askedOf. Rejected: an inline flag in the route (hides a §9.5 rule in persistence); importing messes.ts into alert-history; reusing `deniedIdsOf` (one query per mess, up to 200); moving activeMemberIds (already in db.ts). The PWA re-derives nothing. A deleted mess counts as no longer asking. LIMIT stays in SQL, so the list can show fewer than 200 after clearing.
- **Caps:** alert-history.ts 41 → 47/300; my-alerts.ts 47 → 56/300; MyAlerts.tsx 110 → ~105/300; test/my-alerts.test.ts → ~150/300. Nothing newly in the band.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md, SPEC.md §9.5, routes/my-alerts.ts, shared/alert-history.ts, worker/mess-asks.ts, shared/messes.ts, shared/vocab.ts, MyAlerts.tsx; grep for activeMemberIds/deniedIdsOf.

## 2026-10-12 — Steward pass 24, whole tree (code-steward)

- **Run:** after the v1.74.0 release (SPEC 3.34 §9.5: a mess ask's My alerts card answers That was me / Not me; /me/alerts adds `messId`, MA10). Also covers v1.74.1 (AnswerButtons stacked, §8.15a).
- **Verdict:** SOUND. Typecheck passed, 863/863 tests, arch:audit quiet. 2 receipts matched to 2 code commits, no mismatches.
- **Top finding:** LOW. where-things-stand had no device check for v1.74.0/v1.74.1; added with v1.75.0's in the next commit.
- **Handoffs:** 0 to reorganizer, 1 to worker (the docs line, done), 0 to placement-advisor.
- **Restraint:** `m.asked.includes(me.id)` in three views (a membership test on the server's list, not a rule); the extra /messes read while MyAlerts is mounted (accepted in the receipt). (The pass also said a failed answer closes the card; it doesn't: `send` throws before `close()`, so the card stays with the error.) Items from passes 19–21 still wait for MojoSOGO's pick.

## 2026-10-12 — v1.74.1: Mess answer pair stacked at the right (placement-advisor)

- **Ask:** In every place the mess answer pair shows (banner, Messes section, MyAlerts card), Not me sits directly under That was me, stacked at the right, instead of wrapping left under the text (SPEC §8.15a, v1.74.1).
- **Verdict:** frontend/src/components/Messes.tsx (AnswerButtons) + frontend/src/components/Messes.module.css (.answers) [EXISTING]
- **Flow stage:** render
- **Why:** AnswerButtons is the one shared home of the pair, so wrapping its buttons in a column `.answers` span fixes all three callers in one place. Rejected: styling each caller (three copies drift); a new component (overkill for one span and one rule). src/shared/messes.ts untouched.
- **Caps:** Messes.tsx 147 → 147 of 300; Messes.module.css 23 → 25 of 300. Nothing enters the band.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md (Messes rows), Messes.tsx, Messes.module.css.

## 2026-10-12 — v1.74.0: Answer a mess from its alert card (placement-advisor)

- **Ask:** SPEC §9.5 "Answer a mess from the card" (v1.74.0, SPEC 3.34, MA10, Q283; MojoSOGO "let me respond directly from the modal"). An alert card for a mess that still asks me shows its photo and That was me / Not me, and closes after a successful answer; otherwise "Already answered."
- **Verdict:** frontend/src/components/MyAlerts.tsx + src/worker/routes/my-alerts.ts (adds `messId`) [EXISTING]
- **Flow stage:** render (plus route passthrough of an already-selected column)
- **Why:** MyAlerts owns the card and already carries the fire's buttons there; the mess answer reuses the parts Messes.tsx exports for the banner (useMesses, useMessAction, MessPhoto, AnswerButtons). Who is asked stays the server's `m.asked`, filtered as MessBanner does. Close-on-success wraps `send` inside MyAlerts (`act(id, async () => { await send(); close(); })`). Rejected: reading useMessAction's `error` after `await act` (stale state; would change a shared hook); leaving the card open until it flips (contradicts the spec); a new hook or module (one wrapper line). Accepted cost: MyAlerts reads /messes on each refresh while mounted, as MessBanner does.
- **Caps:** MyAlerts.tsx ~103 → ~110/300; my-alerts.ts 47/300; test/my-alerts.test.ts ~124/300; Messes.tsx untouched. Nothing newly in the band.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md (Messes, MessBanner, my-alerts rows), MyAlerts.tsx, Messes.tsx (1–62), MessBanner.tsx, routes/my-alerts.ts.

## 2026-10-12 — v1.73.4: MojoSOGO (founder) first, not the creator (placement-advisor verdict reused)

- **Ask:** SPEC 3.33 §8.3: the member to put first is MojoSOGO (the founder), not the event's creator.
- **Verdict:** same owners as v1.73.3: `participants.ts` keeps `first`; DaySheet.tsx and DayCell.tsx pass the founder's id from the members list.
- **Flow stage:** render
- **Why:** Only the argument changes; the rule's owner is unchanged.
- **Caps:** unchanged. Nothing in the band.

## 2026-10-12 — v1.73.3: Creator first among participants (placement-advisor)

- **Ask:** SPEC 3.32 §7.1/§8.3: when the event's creator is among the participants, they come first (day sheet chips and calendar-line dots); the rest keep assignedTo order.
- **Verdict:** `frontend/src/participants.ts` [EXISTING] gains optional `first`; DaySheet.tsx and DayCell.tsx pass `o.createdBy`.
- **Flow stage:** render
- **Why:** Order is part of "who an event shows", which participants.ts owns so both views agree. Rejected sorting in each view (two copies drift).
- **Caps:** participants.ts ~16/300; others unchanged. Nothing in the band.

## 2026-10-12 — v1.73.2: No arrows on day-sheet name chips (placement-advisor)

- **Ask:** SPEC 3.31 §8.3: the day sheet's participant chips drop the "→ " prefix (a calendar event is not a rotation).
- **Verdict:** frontend/src/components/DaySheet.tsx [EXISTING]
- **Flow stage:** render
- **Why:** One display string inside the owner of the day sheet's chips. participants.ts decides who, not how a chip reads.
- **Caps:** DaySheet.tsx ~58/300, unchanged.

## 2026-10-12 — v1.73.1: Family pill on the day-cell event line (placement-advisor)

- **Ask:** SPEC 3.30 §7.1: an event for everyone (participants().family) shows a small green var(--good) "Family" pill sized from the line height on the day cell's event line, replacing the single green dot.
- **Verdict:** frontend/src/components/DayCell.tsx + DayCell.module.css (`.family`) [EXISTING]
- **Flow stage:** render
- **Why:** Presentation of a decision participants.ts already makes, inside the owner of the event line's marks. Rejected participants.ts (nothing to change), day-lines.ts (dot/line fitting only), a shared FamilyPill component (two call sites in different contexts).
- **Caps:** DayCell.tsx ~96/300, DayCell.module.css ~56/300. Nothing newly in the band.

## 2026-10-12 — Steward pass 23, whole tree (code-steward)

- **Run:** after the v1.73.0 release (SPEC 3.29 §7.1/§8.3: each person once, everyone → one green Family chip/dot; new pure `frontend/src/participants.ts`). Also covers v1.72.0 and v1.72.1.
- **Verdict:** SOUND. Typecheck passed, 861/861 tests, arch:audit quiet. 3 receipts matched to 3 code commits, no mismatches.
- **Top finding:** LOW. where-things-stand "Owed" had no device check for v1.72.1 or v1.73.0 (added in this commit).
- **Handoffs:** 0 to reorganizer, 0 to placement-advisor.
- **Restraint:** the inline Family chip style (one use), the 12-line participants.ts (single source two views share, tested), the pickers that only take `assignedTo` as input. Items from passes 19–21 still wait for MojoSOGO's pick.

## 2026-10-12 — v1.73.0: Each participant once; everyone shows as Family (placement-advisor)

- **Ask:** In the day sheet and the calendar day cell, show each participant once (the creator once when also assigned, duplicate ids once). When assignedTo covers every active member (at least 2 active), show one green `var(--good)` "Family" chip or one green dot instead. SPEC 3.29 §7.1, §8.3, Q281–Q282.
- **Verdict:** `frontend/src/participants.ts` [NEW row], drawn by `frontend/src/components/DaySheet.tsx` and `frontend/src/components/DayCell.tsx` [EXISTING].
- **Flow stage:** render
- **Why:** Two views must agree on who an event shows, so one pure helper owns the rule. Rejected `src/shared/` (the server decides nothing here), `day-lines.ts` (fit math only), and inline copies in both components (drift). Creator handling stays in DaySheet, the only view showing a creator.
- **Caps:** participants.ts ~12/300 (new), DayCell.tsx ~95/300, DaySheet.tsx ~58/300. Nothing newly in the band.

## 2026-10-12 — v1.72.1: Unassigned event emoji as a day icon (placement-advisor)

- **Ask:** In a calendar day cell, a single-day event with nobody assigned and an emoji shows that emoji as a day icon (after the holiday and 📈, two at most) and gets no line. If the cap hides it, it keeps its line. Unassigned events without an emoji and assigned events are unchanged. SPEC 3.28 §7.1/§7.2, Q273, Q277.
- **Verdict:** `frontend/src/components/DayCell.tsx` [EXISTING]
- **Flow stage:** render
- **Why:** Presentation inside the owner of the date line and the event lines. DayCell.tsx is 86/300 with one concern. Rejected `src/shared/` (display, not a shared rule) and `day-lines.ts` (fit math unchanged; it only gets a smaller line count).
- **Caps:** DayCell.tsx about 90/300. Nothing newly in the band.

## 2026-10-12 — v1.72.0: §8.17 Clock: 12-hour or 24-hour (placement-advisor)

- **Ask:** SPEC 3.27 §8.17 (+ §4.2zv, migration 0049 `member_prefs.clock_24h`): each member picks 12-hour or 24-hour in
  Settings → Me; every shown time goes through `clockText(hhmm, clock24h)`; a sun reminder's push follows each member's
  choice, house and FunHouse stay 12-hour (Q277–Q280, CK1–CK4).
- **Verdict:** EXISTING owners, no new row, no reorganizer. `src/shared/time.ts` `clockText` (rule);
  `src/shared/engine.ts` `alertMessage(..., clock24h = false)`, private `h12` removed; `src/worker/routes/auth.ts`
  /me `clock24h` (boolean-prefs loop); `src/worker/tick.ts` one inline read of the 24-hour members per tick, the 24-hour
  text on their push rows only (not in speaker-choices.ts: its concern is speakers); `frontend/src/state.tsx` `clock`,
  `localTime` goes through it (Machines, Cooking, Bounties, Messes, Status change with no edits); SettingsMe.tsx the
  choice; DaySheet, DayCell, RingingBar, Alarms, Timers, MyAlerts, HouseQuiet, MachineHours (private clock dropped),
  ChoresToday/Chores (`whenText` takes the formatter), ApproveLogin call it. Left alone: PhoneSignIn, time pickers,
  a recipe's Time.
- **Deviation while building:** ApproveLogin renders outside AppProvider, so App.tsx passes it `me.clock24h` as a prop
  and it formats the phone's own local time with `clockText` (one prop line in App.tsx).
- **Caps:** tick.ts 125/148 (band 133), engine.ts under 270; nothing newly in the band (arch:audit quiet).

## 2026-10-12 — Steward pass 22, whole tree (code-steward)

- **Run:** after the v1.71.0 release (SPEC 3.26 §7.1/§7.2: calendar day lines; DayCell.tsx extracted; new pure day-lines.ts). Also covers v1.70.1.
- **Verdict:** SOUND. Typecheck green, 853/853 tests, arch:audit quiet (chores.ts and things.ts at 84% are the highest).
- **Placement audit:** 3 receipts against 3 code commits (4dcd987, bb29a32, c2f17b2), no mismatches.
- **Top finding:** where-things-stand had no v1.71.0 device check (added in this commit).
- **Handoffs:** 0 to reorganizer, 0 to placement-advisor. Items carried from passes 19–21 still wait for MojoSOGO's pick.
- **Restraint:** DayCell ↔ Calendar import loop is type-only; `isMultiDay` stays in DayCell; DATE_LINE is commented presentation; day-lines.ts is a pure tested leaf.

## 2026-10-12 — v1.71.0: Day cell event lines: emoji + participant dots, auto-fit (placement-advisor)

- **Ask:** SPEC §7.1 "Event display in a cell" (SPEC 3.26, Q273–Q276). Each single-day event gets its own line under the date line: emoji, then one dot per assignedTo member in Member.color (nobody: the emoji alone, or the event-color dot), start time and title on screens ≥480 px. Line height shrinks 13 → 8 px to fit the room left after the date line and bar lanes, else `+N`. Dots shrink when crowded (≥3 px). Event emojis leave the date line (§7.2).
- **Verdict:** Extract first (done: the reorganizer entry below). Then the feature in `frontend/src/components/DayCell.tsx` plus the pure `frontend/src/day-lines.ts` [NEW row], tested by `test/day-lines.test.ts`. Calendar.tsx only passes rowH and the cell width through.
- **Flow stage:** render
- **Why:** Calendar.tsx was 263/302 and already held scrolling, fetching, lanes and the cell. The cell is its own concern and the fit math is pure, so it gets a testable leaf (precedent: point-line.ts). Rejected: bless-and-raise on Calendar.tsx; `src/shared/` (presentation, the Worker never uses it); fit math inline in DayCell (untestable without a frontend harness).
- **Caps:** Calendar.tsx 198, DayCell.tsx ~95, day-lines.ts ~30. All under 300, none in the band.

## 2026-10-12 — Calendar day cell out of Calendar.tsx (reorganizer)

- **Trigger:** the placement-advisor sent a per-day calendar change (v1.71.0 day lines) to Calendar.tsx, at 263 of 302 lines, with an extract-first verdict.
- **Seam moved:** the per-day cell (derivation, icons, dots/chips, classes, aria-label, button, tint(), MONTHS, and the cell CSS including todayPulse and the narrow variants) from `frontend/src/components/Calendar.tsx` to `frontend/src/components/DayCell.tsx` + `DayCell.module.css` [NEW row]
- **Room opened:** Calendar.tsx: 263 → 198 lines; CEILINGS pin removed (198 + 40 ≤ the global 300)
- **Behavior:** preserved — same markup, classes, inline styles, aria-label and onOpen(date, data); `.narrow .cell` became `.cell.narrow` at the same specificity.
- **Restraint:** only the cell moved. Week virtualization, chunk loading, weekSpans and the multi-day bars stay in Calendar.

## 2026-10-12 — v1.70.1: Plan it carries the thing's address into the event's Address field (placement-advisor)

- **Ask:** SPEC §7C.2 Plan it (with §7.9 event address). POST /things/:id/plan sets the event's `address` from the
  thing through a new pure `plannedEventAddress(t)` (the address when it is at most EVENT_ADDRESS_MAX, else null).
  plannedEventNotes leaves out an address that was carried over. A patch fix.
- **Verdict:** src/shared/things.ts (rule) + src/worker/routes/things.ts (one-line call site) [EXISTING]
- **Flow stage:** rules (+ route passes the result through to persist)
- **Why:** mapping a thing to an event is already owned by plannedEventNotes/canPlanOn in shared/things.ts, so the
  new helper sits with them. In the route it would put a decision in the route; event-rows.ts knows nothing about
  things. shared→shared import of alert-limits (imports nothing) makes no cycle.
- **Caps:** src/shared/things.ts about 255/300 (band starts at 270, not entered); src/worker/routes/things.ts 124/300.
- **Reorganizer:** none needed.

## 2026-10-12 — Steward pass 21, whole tree (code-steward)

- **Run:** after the v1.70.0 release (SPEC 3.24 §9.5: act on a ringing alert from its My alerts card; FireActions.tsx extracted from RingingBar.tsx; /me/alerts adds fireId; no Delete on the card). Also covers v1.69.1.
- **Verdict:** SOUND. Typecheck green, 847/847 tests, arch:audit quiet (nothing in the band; things.ts 82% is the highest).
- **Placement audit:** 3 receipts against 4 code commits (adfe483, 25ec354, 291867a, e6bb1a7), no placement mismatches. The `fireId` route line and its test went into the spec commit 291867a, not the feature commit; accepted.
- **Top finding:** where-things-stand had no v1.70.0 device check; a missing blank line before the v1.69.1 receipt. Both fixed in this commit.
- **Handoffs:** 1 to worker (that doc tidy, done). 0 to reorganizer, 0 to placement-advisor. chore-input.ts stays the first step of the next chores feature; items carried from passes 19–20 still wait for MojoSOGO's pick.
- **Restraint:** FireActions (48 lines) is a real leaf with two callers, not fragmentation. MyAlerts → FireActions → MachineChooser is the reuse the map describes. "Still ringing" is a presence check, not a shared rule. No frontend test harness, so the gap goes to a device check, not a test.

## 2026-10-12 — v1.70.0: Act on it from the My alerts card (placement-advisor)

- **Ask:** SPEC §9.5, new part "Act on it from the card" (v1.70.0; MojoSOGO 2026-10-12 "Let me ack in a notification modal"). A My alerts card for a fire's push whose fire is still ringing shows the Ringing bar row's one-tap actions; acting closes the card; a fire no longer ringing → "Already handled." GET /me/alerts adds `fireId`. Later the same day: no Delete on the card ("too easy to make mistake").
- **Verdict:** `frontend/src/components/FireActions.tsx` [NEW row, opened by the reorganizer first], then `src/worker/routes/my-alerts.ts` + `frontend/src/components/MyAlerts.tsx` [EXISTING], test in `test/my-alerts.test.ts`.
- **Flow stage:** route (one more field in the list) + render (the actions on the card).
- **Why:** one fire's actions are their own concern; exporting them from RingingBar.tsx would give its row a second concern. A new leaf used by both keeps one copy. "Still ringing" is a presence check on useApp().ringing, not a rule, so nothing in src/shared/. `fireId` follows `kind`'s hasFire test. Rejected: exporting from RingingBar.tsx (concern creep); a server-side "ringing" flag (duplicates /fires state, goes stale); FireActions rendering its own error (changes the bar's single error line). Move's chooser has one onClose, so the card stays open and shows "Already handled." once the load moves; Machines.tsx untouched.
- **Caps:** all against GLOBAL_FILE_CAP 300. RingingBar.tsx 79 → 49; FireActions.tsx new, 48; MyAlerts.tsx 96 → ~105; my-alerts.ts 47 → 47. Nothing enters the band.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; docs/placement-receipts.md; SPEC.md §9.5; RingingBar.tsx; MyAlerts.tsx; Machines.tsx (MachineChooser); state.tsx; routes/my-alerts.ts; test/my-alerts.test.ts.

## 2026-10-12 — FireActions out of RingingBar (reorganizer)

- **Trigger:** the My alerts card (§9.5) needs the Ringing bar's per-fire one-tap actions; the placement-advisor said extract first.
- **Seam moved:** send/act, per-fire busy, machineButton, the `moving` state and the MachineChooser render, from `frontend/src/components/RingingBar.tsx` to `frontend/src/components/FireActions.tsx` [NEW row]. Commit 25ec354.
- **Room opened:** RingingBar.tsx 79 → 49 lines; cap 300 global (never pinned).
- **Behavior:** preserved — typecheck, npm test (847/847), arch:audit green. Same buttons, labels, order, request paths, error text in the bar's one error line, refresh() on success and failure. One small difference: the chooser now mounts in its fire's row, so it closes if that fire leaves the rendered list while open.
- **Restraint:** only the action cluster moved; icon, sub line, away line, collapse and error line stay in the bar.

## 2026-10-12 — v1.69.1: Require `place` on chore rules (placement-advisor)

- **Ask:** Steward pass 20 item #2 (MojoSOGO, 2026-10-12, "BOTH"). Drop the `= null` default so the trailing `place: Place | null` is required on firstFireDue, planChoreRuns, advanceRun, undoRun and replanRun. Refactor only, no behavior change.
- **Verdict:** src/shared/chores.ts (+ test/chores.test.ts) [EXISTING].
- **Flow stage:** rules.
- **Why:** all production callers already pass `place` (fire-rows.ts:54, routes/chores.ts:77/142/200; tick.ts reaches planning through fire-rows.ts; no frontend callers), so the change stays inside the owner and its tests and removes the trap of a caller forgetting it.
- **Caps:** chores.ts unchanged in line count (253/300). No file enters the band.
- **Sources read:** scripts/arch.ts; src/shared/chores.ts; repo-wide grep of call sites; SPEC.md §7B.3 signatures.

## 2026-10-12 — Steward pass 20, whole tree (code-steward)

- **Run:** after the v1.69.0 release (SPEC 3.22 §7B.3, chores before sunset, migration 0048). Also covers v1.63.0–v1.68.1.
- **Verdict:** SOUND. Typecheck green, 847/847 tests, arch:audit quiet (chores.ts 253/300, EventForm 88%, Calendar 87%, routes/recipes 87%).
- **Placement audit:** 12 receipts against 12 code commits, no placement mismatches. bd931e4 (FOUNDER_SQL to db.ts, 7-line refactor, no behavior change) has no receipt; accepted. Seven receipts (v1.63.1 to v1.69.0) were appended at the end of this file instead of the top.
- **Top finding:** a docs tidy. Move those seven receipts to the top; add device checks for v1.58–v1.69 (rooms, a sunset chore ringing) to where-things-stand; add the clock-or-sunset choice to map row 165 (ChoreForm) and the `whenText` export to row 173 (ChoresToday).
- **Handoffs:** 2 to worker (#1 the docs tidy; #2 make `place` required on firstFireDue, planChoreRuns, advanceRun, undoRun and replanRun, since its null default lets a new caller silently stop sunset fires). 0 to reorganizer now: the chore-input.ts seam (§7B.4 validation, about 70 lines) stays the first step of the next chores.ts feature. Items carried from pass 19 still wait for MojoSOGO's pick.
- **Restraint:** no pre-emptive chores.ts split (84%, coherent); EventForm, Calendar and recipes ceilings untouched since pass 19; machines.ts churn was small changes inside its one owner; SUN_OFFSET_MAX repeated in the migration's CHECK (SQL cannot import it); whenText only formats, it decides nothing.

## 2026-10-12 — v1.69.0: Chore time "before sunset" (placement-advisor)

- **Ask:** SPEC §7B.3 / §4.2zu (migration 0048): a chore's time can be local sunset − N minutes (0–240) instead of a clock time; no place or no sunset that day → no time-based fire, still on Today. MojoSOGO: "an alarm chore that can be assigned to anyone to get the eggs 30 minutes before sundown".
- **Verdict:** EXISTING owners: `src/shared/chores.ts` (place-aware `deadline`; trailing `place` on `firstFireDue`, `planChoreRuns`, `advanceRun`, `undoRun`, `replanRun`; `sunOffsetMin` in `parseChoreInput`, exported `SUN_OFFSET_MAX`) and `frontend/src/components/ChoresToday.tsx` (exported `whenText`, also used by Chores.tsx). Callers: `src/worker/fire-rows.ts` `choreRunInserts` passes `place`; `src/worker/tick.ts`; `src/worker/routes/chores.ts` loads `householdPlace` inside `stepRun` so `routes/alerts.ts` is untouched, and `choreView` emits `sunOffsetMin` so a PATCH keeps it. Form: `ChoreForm.tsx`.
- **Flow stage:** rules (deadline), persist (route, tick, fire-rows), render (form, time text).
- **Why:** run timing is chore planning; `sun.ts` is already a pure leaf. One nullable integer beats copying the event `start_sun` pair. UI words stay out of shared code.
- **Caps:** chores.ts 253/300 (band 270). Next chores.ts feature: extract-first `parseChoreInput` and helpers into `src/shared/chore-input.ts`. No file newly in the band.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; src/shared/chores.ts, sun.ts; src/worker/routes/chores.ts, fire-rows.ts, tick.ts; ChoreForm.tsx, ChoresToday.tsx, Chores.tsx.

## 2026-10-12 — All chores: row opens the form, 📋 opens the sheet (placement-advisor)

- **Ask:** In Chores → 📋 All chores, tapping a row opens ChoreForm instead of ChoreSheet, and the 📋 marker becomes its own button that opens ChoreSheet (shown when the chore has areas or a done means). SPEC §8.5/§8.15, patch fix.
- **Verdict:** `frontend/src/components/Chores.tsx` (AllChoresSection) [EXISTING]
- **Flow stage:** render
- **Why:** A change to the list Chores.tsx already owns; `onEdit` and `onOpenAreas` are already props of AllChoresSection. 📋 visibility comes from server fields (`areaCount`, `doneMeans`). Rejected ChoresToday.tsx (its tap ticks done, deliberately) and a new component (nothing distinct to own). module-ownership.md row and the file header reworded in the same commit.
- **Caps:** Chores.tsx about 111 → about 116 of 300 (no CEILINGS pin). No file enters the band.
- **Sources read:** frontend/src/components/Chores.tsx, scripts/arch.ts, docs/module-ownership.md.

## 2026-10-12 — Machine FunHouse ping only for the founder (placement-advisor)

- **Ask:** SPEC §7D.3/§7D.7/§7D.8/§9.4b (MojoSOGO 2026-10-12: "for unknown owners for machines, do not ping funhouse; ping funhouse for MojoSOGO and announcements"). A machine or cooking-timer fire gets a FunHouse row only when its alert person is the founder. Nobody → Phone only. Someone else → Phone + House. Announce is unchanged.
- **Verdict:** src/shared/machines.ts `machineAlert(quietUntil, alertId, founderAlerted)` + src/shared/cooking.ts `cookAlert(alertId, founderAlerted)` + src/worker/fire-rows.ts sourceOf (both the cook and fixed-machine branches) [EXISTING]. Reorganizer first: FOUNDER_SQL moves from src/worker/routes/members.ts to src/worker/db.ts [EXISTING row widened]; members.ts and routes/ops.ts re-import it from db.ts.
- **Flow stage:** rules (the channel set, a pure boolean input) + persist/load (the founder lookup in sourceOf).
- **Why:** machineAlert already owns the one "who does a machine fire reach" decision (§7D.7), so this is one more input, not a new owner. The founder lookup is I/O, so it stays in sourceOf, which already resolves the alert person. Rejected: importing FOUNDER_SQL from routes/members into fire-rows (members.ts builds a Hono app when it loads; fire-rows is "no Hono" and loaded by tick). db.ts already owns member-set SQL (activeMemberIds). tick and optins need no change because the funhouse row already follows cfg.channels.
- **Caps:** machines.ts ~240/300, cooking.ts ~161/300, fire-rows.ts ~164/300, db.ts ~57/300, routes/members.ts ~72/300, routes/ops.ts 76/300. No pinned ceilings, nothing newly in the 90% band (270).
- **Sources read:** scripts/arch.ts, docs/module-ownership.md (shared + worker rows), docs/placement-receipts.md, src/worker/fire-rows.ts, src/worker/db.ts, src/worker/routes/members.ts, src/shared/machines.ts, src/shared/cooking.ts, src/shared/optins.ts, line counts of routes/ops.ts.

## 2026-10-12 — v1.67.0 delta: Rooms list in Household, Days off to Calendar (placement-advisor)

- **Ask:** amendment to the v1.67.0 Rooms placement (SPEC §7B.6, §8.6, §7.3): the Rooms list lives in Settings → 🏠 Household (admins), SettingsHousehold rendering `<RoomsList/>` from Rooms.tsx. Days off moves out of Household into Settings → 📅 Calendar (renamed from "Calendar items"), admins only. The chore's 📋 sheet can edit sections through RoomSections, gated by the room's canChange.
- **Verdict:** NEW row frontend/src/components/DaysOff.tsx. EXISTING: Settings.tsx (label + admin-gated DaysOff in the calendar body), SettingsHousehold.tsx (DaysOff out, RoomsList in), Rooms.tsx (RoomsList + useRooms; no Chores section), RoomSheet.tsx (RoomSections editor gated by the room's createdBy).
- **Flow stage:** render.
- **Why:** DaysOff is a household-wide admin setting (/settings), OptionalItems is one member's own prefs and opt-ins (/me, /events/{id}/optin); merging them would give OptionalItems two audiences and two endpoints, so DaysOff is its own leaf. Settings.tsx composes the two in one area body, within its row. Open point settled as ⚑ Q266: POST /rooms is admins only, matching the admin-only Household screen.
- **Caps:** Settings.tsx ~63/99 (pinned), SettingsHousehold.tsx 53 → ~30, DaysOff.tsx ~30, OptionalItems.tsx 58. No file newly in the band, no re-pin.
- **Sources read:** frontend/src/components/SettingsHousehold.tsx, OptionalItems.tsx, Settings.tsx; docs/module-ownership.md rows 151, 196, 201; scripts/arch.ts CEILINGS; plus the first v1.65.0 receipt's sources.

## 2026-10-12 — v1.67.0: Rooms own the "what done looks like" areas (placement-advisor)

- **Ask:** SPEC §7B.6 rewritten as "Rooms" for v1.67.0: a `rooms` table (rom_ ids, name 1–40, position); migration 0047 rebuilds chore_areas → room_areas and chore_area_photos → room_area_photos with the same ids, turns each chore that has areas into a room named after it, adds a nullable chores.room_id. ROOMS_MAX 30, ROOM_NAME_MAX 40, parseRoomInput, Room / RoomArea wire types. Routes /rooms, /rooms/{id}, /rooms/{id}/areas, /room-areas/{id}(/photos), /room-area-photos/{id}; deleting a room clears chores.room_id. A chore's roomId is validated and areaCount comes from its room.
- **Verdict:** EXISTING (renamed): src/shared/rooms.ts, src/worker/routes/rooms.ts, frontend RoomSheet.tsx, RoomAreaForm.tsx. NEW rows: frontend/src/components/Rooms.tsx (list + ＋ Add room + useRooms) and frontend/src/components/ChoreSheet.tsx (the chore's 📋 sheet: Done means + RoomSections + ✎ Edit chore). NEW migration 0047 + its test.
- **Flow stage:** rules (shared/rooms.ts), route + persist (routes/rooms.ts, routes/chores.ts), render (Rooms, RoomSheet, ChoreSheet, ChoreForm).
- **Why:** areas change parent, so the existing area owners keep the concern under the new name; no new module per stage. One file each for rooms and areas in the route and in the rules: a room with its sections is one concern and stays under cap (routes/rooms.ts ~205; split off routes/room-areas.ts only past ~250). The chore's 📋 sheet is split out of RoomSheet so one component does not hold both a chore's sheet and a room's sheet. The room-existence check stays in routes/chores.ts through an export from routes/rooms.ts, keeping shared/chores.ts pure and away from the band. R2 prefix kept as `chore-areas/` (no R2 rewrite, photo-store.ts untouched).
- **Caps:** routes/rooms.ts ~205, shared/rooms.ts ~60, routes/chores.ts ~196, shared/chores.ts ~246 (closest to the band), RoomSheet.tsx ~125, ChoreForm.tsx ~190, Chores.tsx ~116, against GLOBAL_FILE_CAP 300. No file newly in the band, no CEILINGS change.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; docs/placement-receipts.md; src/shared/chore-areas.ts; src/worker/routes/chore-areas.ts; frontend ChoreAreas.tsx; line counts of the touched files; greps for areaCount, chore-areas and PhotoPrefix; SPEC.md §7B.6 and API rows.

## 2026-10-12 — About tagline on two lines (placement-advisor)

- **Ask:** In Settings → ℹ️ About, show the tagline as two lines ("Closing the loop." / "Peace of mind, every day.") instead of one run-on; the opening screen (frontend/index.html, §8.10) stays as is. SPEC §8.6 SM5, MojoSOGO 2026-10-12.
- **Verdict:** `frontend/src/components/SettingsAbout.module.css` + `frontend/src/components/SettingsAbout.tsx` [EXISTING]
- **Flow stage:** render
- **Why:** the SettingsAbout row already owns the About panel and TAGLINE; stacking the halves is presentation only (`.tagline span` inline-block → block, and the `' '` separator dropped). TAGLINE is untouched, so SM5's index.html check (each half as `<span>…</span>`) still holds and the splash is left alone. Rejected: splitting TAGLINE or adding a second constant (a second copy, §0.5); editing index.html (out of scope by MojoSOGO's word).
- **Caps:** SettingsAbout.tsx 18 → 18 lines, SettingsAbout.module.css 9 → 9, against GLOBAL_FILE_CAP 300. No file newly in the band.
- **Sources read:** frontend/src/components/SettingsAbout.tsx; frontend/src/components/SettingsAbout.module.css; docs/module-ownership.md (row 204); scripts/arch.ts (WORKING_BUFFER, GLOBAL_FILE_CAP, WARN_AT); docs/placement-receipts.md; test/settings-about.test.ts.

## 2026-10-12 — v1.63.2: 🎯 Point at it is founder-only (placement-advisor)

- **Ask:** SPEC §8.16 (patch v1.63.2). The ◎ pick activator (bottom left and in modal headers), Alt+P and the Settings → 🙂 Me switch show only for the founder, using the same check as the 🎪 FunHouse tick (Q230, `useIsFounder()`). For the founder nothing changes: on by default, with an off switch per device.
- **Verdict:** `frontend/src/components/PointAtButton.tsx` (`usePointAtOn` = founder && stored switch) + `frontend/src/components/SettingsMe.tsx` (switch rendered only for the founder) [EXISTING]
- **Flow stage:** render
- **Why:** All four surfaces (Modal ◎, PointAtLayer's floating ◎, the Alt+P listener and SettingsMe) already read the one `usePointAtOn()` gate, so gating it once covers them and PointAt.tsx/Modal.tsx are untouched. The founder check is reused from state.tsx rather than written again. PointAtButton gains a hook import from '../state' (not a component, no cycle), and every consumer renders inside AppProvider (Shell; Modal is not used on the sign-in, join or approve screens). The stored switch is left alone, so a founder's setting persists. Rejected: gating separately in PointAt.tsx, Modal.tsx and SettingsMe (three copies of one rule), and a server-side flag (the founder is already known on the client).
- **Caps:** PointAtButton.tsx 31 → ~33/300; SettingsMe.tsx 37 → ~38/300. No file newly in the band.
- **Sources read:** scripts/arch.ts; docs/placement-receipts.md; docs/module-ownership.md (rows 139, 197, 198); frontend/src/components/PointAtButton.tsx, PointAt.tsx, SettingsMe.tsx; frontend/src/state.tsx (useIsFounder); frontend/src/App.tsx (provider tree); grep of Modal/PointAt usages in frontend/src and test/.

## 2026-10-12 — Clothes dryer finish reads "Unload Clothes Dryer" (placement-advisor)

- **Ask:** v1.63.1 patch, SPEC §8.5/§7D.2. The dryer's finish button (Ringing-now bar and Machines card) reads "Unload Clothes Dryer" instead of "Fold & out". The dish washer's "Emptied" and the washer's "Move to clothes dryer" stay.
- **Verdict:** src/shared/machines.ts [EXISTING]. Change the laundry branch of `finishLabel`; the `invalid_state` refusal no longer hard-codes the old label. Update test/machines.test.ts to match.
- **Flow stage:** rules (wording), rendered unchanged by RingingBar.tsx and Machines.tsx.
- **Why:** `finishLabel` already owns the finish wording and both screens import it, so one edit keeps them in step.
- **Caps:** src/shared/machines.ts 238/300 → 238/300. No file newly in the warning band.

## 2026-10-12 — v1.66.0: Announce ignores Quiet the house (placement-advisor)

- **Ask:** SPEC §9.2b / §9.3 / §9.4b — Announce always speaks on every speaker HA lists, even while the house is quiet (MojoSOGO 2026-10-12 "announcements are special").
- **Verdict:** `src/worker/routes/announce.ts` [EXISTING] — a deletion: the houseQuiet read, the 409 `house_quiet` branch and the `!quiet` speaker gate, plus the now-unused imports (houseQuiet, utcToLocal, householdTz).
- **Flow stage:** persist (whether the route writes the house row).
- **Why:** the quiet check is a persistence gate inside the route that owns POST /announce; removing it adds no code. src/shared/house-quiet.ts unchanged; src/worker/house-quiet.ts keeps three readers (tick, timer-starts, GET /house/quiet). Rejected: an "isAnnouncementExempt" helper (speculative — the exemption is the absence of a check). Spec (§9.2b, HQ5, §9.4b, API row), tests HQ5 / FH4 and map rows 81 / 94 changed in the same commit.
- **Caps:** announce.ts 69 → ~63 lines against GLOBAL_FILE_CAP 300. Nothing enters the band.
- **Sources read:** src/worker/routes/announce.ts; docs/module-ownership.md; scripts/arch.ts; SPEC.md §9.2b, §9.4b, §10; tests referencing house_quiet; frontend HouseQuiet.tsx (grep).
## 2026-10-12 — v1.65.0: Members joined-date pill; revoked invites hidden after 24 h (placement-advisor)

- **Ask:** MojoSOGO 2026-10-12, "same screen; remove 'revoked' after 24 hours; so I should see when active accounts joined". SPEC §8.6: each member row gets a "joined <date>" pill from members.created_at, as a 5th grid column. SPEC §8.9: a revoked invite is hidden from the Invites list once revoked more than 24 hours ago (filtered in the app; server unchanged).
- **Verdict:** src/worker/routes/members.ts (GET /members selects `created_at AS joinedAt`), frontend/src/state.tsx (`Member.joinedAt: string`), frontend/src/components/SettingsMembers.tsx + SettingsMembers.module.css (pill and 5th column), frontend/src/components/Invites.tsx (24 h filter; `shortDate` exported for reuse) [EXISTING]
- **Flow stage:** route (one more column in the list) + render (pill, filter)
- **Why:** Every part already has an owner: members.ts the members list (row 86), state.tsx the Member type (row 139), SettingsMembers the grid (row 202), Invites the invite states (row 209). Presentation only, no shared rule needed. Rejected: filtering revoked invites on the server (history stays in D1); a second date formatter (Invites' `shortDate` is exported instead). The join date is visible to every member; not sensitive, and §8.6 says so.
- **Caps:** members.ts ~73/300; state.tsx 107/300; SettingsMembers.tsx ~59/300; SettingsMembers.module.css 9/300; Invites.tsx ~76/300. No file newly in the band.
- **Sources read:** docs/module-ownership.md (rows 80, 86, 139, 196, 202, 209); scripts/arch.ts; docs/placement-receipts.md (head); src/worker/routes/members.ts; frontend/src/state.tsx; SettingsMembers.tsx/.module.css; Invites.tsx; SPEC.md §8.9.

---

## 2026-10-12 — v1.64.0: Members tab as a grid of pills (placement-advisor)

- **Ask:** SPEC §8.6 Settings → 👥 Members: lay the members table out again as a grid with one row of pills per member (name with colour dot, role Owner / Admin / Member or Disabled, a tappable Make / Remove admin pill with today's asks, a tappable Disable / Enable pill). Behaviour unchanged. It must fit a phone and scroll sideways when too narrow.
- **Verdict:** `frontend/src/components/SettingsMembers.tsx` + new `frontend/src/components/SettingsMembers.module.css` [EXISTING; the CSS is covered by the `components/*.module.css` row]
- **Flow stage:** render
- **Why:** The SettingsMembers row owns this screen. The grid styles are specific to it, so they go in a same-named CSS module, not Lists.module.css (shared list tables and tick rows). The pill look reuses theme.css `.chip` / `.badge`. Logic, asks and visibility rules stay as they are; role checks stay in src/shared/roles. The Member pill and Disabled-in-place-of-role are ⚑ Q264–Q265, written into §8.6 first. Row 202 wording: "members table" → "members grid".
- **Caps:** SettingsMembers.tsx 51 → ~58/300; SettingsMembers.module.css new, ~10/300. No file newly in the band.
- **Sources read:** frontend/src/components/SettingsMembers.tsx; docs/module-ownership.md (rows 140, 202, 217, 218); scripts/arch.ts; docs/placement-receipts.md (head); frontend/src/theme.css (.chip/.badge); SPEC.md §8.6.

---

## 2026-10-12 — v1.63.0: Announce reaches every speaker and every member's phone (placement-advisor)

- **Ask:** POST /announce speaks on every speaker HA lists via `allHouseSpeakers(env)` (null = the defaults), as machines do (§7D.3), instead of the union of members' ticked speakers; it pushes to every active member including the sender. SPEC §9.3, MojoSOGO 2026-10-12 "not hearing the announcement … on all devices".
- **Verdict:** src/worker/routes/announce.ts [EXISTING]
- **Flow stage:** route (who receives the announcement), reusing deliver (house.ts allHouseSpeakers)
- **Why:** the announce.ts row already owns the announcement's speakers and push audience; the change swaps one existing helper for another (deliverySpeakers → allHouseSpeakers, already used by tick.ts for machines) and deletes a filter, so no new code, rule or module. Rejected: a shared "announce audience" rule in src/shared/ (nothing left to decide, classitis); widening speaker-choices.ts (owns the choices announcements stop using). The now-unreachable `no_recipients` / `no_speakers` branches were deleted rather than left with stale messages. Open product point: the sending phone gets its own push too (a push fans out to all of a member's subscriptions).
- **Caps:** announce.ts 73 → 69 lines against GLOBAL_FILE_CAP 300. No file newly in the band.
- **Sources read:** src/worker/routes/announce.ts; docs/module-ownership.md (rows 53, 80, 81, 94, 153); scripts/arch.ts; src/worker/house.ts allHouseSpeakers; src/worker/tick.ts:96; SPEC.md §9.3, §9.2a, API row; frontend Announce.tsx; tests referencing /announce.

## 2026-10-11 — Steward pass 19, whole tree (code-steward)

- **Run:** after the v1.62.0 release (SPEC 3.11 §7D.9, 🪙 Bounty from a done machine load). Also covers v1.60.1–v1.61.0.
- **Verdict:** SOUND. Typecheck green, 834/834 tests, arch:audit quiet (machines.ts 238/300, routes/bounties.ts 229/300).
- **Placement audit:** 9 receipts against 10 code commits, no mismatches. 53e4b54 (v1.59.2 tab bar) likely renumbered to v1.60.2.
- **Top finding:** none new. Pass 18 #1 fixed in v1.60.3; pass 17's items fixed in v1.60.7.
- **Handoffs:** 0 new. Carried, waiting on MojoSOGO's pick: `useBlobUrl` in usePhotoPick.tsx (reorganizer, S, before the next photo sheet), plus older LOW items from passes 6, 10, 11 and 16.
- **Restraint:** the machines → bounties import (a constant, no cycle); the machines.ts map row naming its consumers; no UI test for the 🪙 button (rule covered by LB1); no bounty-photos.ts split yet (229, under ~250).

## 2026-10-11 — v1.62.0: 🪙 Bounty from a done load (placement-advisor)

- **Ask:** SPEC 3.11 §7D.9 and §8.5 🪙 Bounty (⚑ Q263). On a done machine card, admins get [🪙 Bounty], which opens the ＋ Bounty sheet with the title from a pure `loadBountyTitle(id, ownerName)` in machines.ts, cut to BOUNTY_TITLE_MAX. Test LB1. It posts an ordinary one-off bounty: no server change, no migration.
- **Verdict:** `src/shared/machines.ts` (loadBountyTitle) + `frontend/src/components/BountyForm.tsx` (optional `initialTitle`) + `frontend/src/components/Machines.tsx` (MachinesSection button) [EXISTING]
- **Flow stage:** rules (the title); render (the sheet's starting value and the card's button)
- **Why:** The wording is a machine rule beside doneMessage, so the PWA asks shared code for it. The sheet and the card each gain one small input. machines.ts imports BOUNTY_TITLE_MAX from bounties.ts (shared-to-shared, no cycle) instead of a second copy of 60. Rejected: bounties.ts (would need machine labels), a new load-bounty.ts (one function), building the title in Machines.tsx (a rule in render), any route or column. Open item it raised (prefilled sheet dirty on open) settled in SPEC §8.5: dirty only when changed from the prefill.
- **Caps:** machines.ts 228 → ~238/300; Machines.tsx 173 → ~182/300; BountyForm.tsx 73 → ~74/300. No file newly in the band.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; docs/placement-receipts.md; SPEC §7D.9, §8.5; src/shared/machines.ts; src/shared/bounties.ts; Machines.tsx; BountyForm.tsx; test/machines.test.ts.

## 2026-10-11 — v1.61.0: Announce box opens with every channel ticked (placement-advisor)

- **Ask:** Q36 was changed by MojoSOGO on 2026-10-11 to "ALL for announcement". The 📢 Announce box now opens with Phone + House + FunHouse ticked for every member. Before, it opened with House only, plus FunHouse for the founder (SPEC §8.5 / §9.3 / §9.4b). The server is unchanged.
- **Verdict:** `frontend/src/components/Announce.tsx` [EXISTING]
- **Flow stage:** render
- **Why:** The change is only the form's starting value, and the map gives Announce.tsx the box and its ChannelChecks. The default becomes `flagsOf(CHANNEL)` from vocab, not a literal list, so "all" stays true if a channel is added and no channel string is written outside vocab.ts. The `useIsFounder` import goes. Rejected: changing `flagsOf`'s defaults in AlertFields.tsx, which cover five other forms that Q36 does not. Result: 🎪 now shows to non-founders in this box (shown when ticked, Q230), which is the intent. No shared/worker change: the sender still gets no push.
- **Caps:** Announce.tsx was 48/300 and stays about the same. No file enters the band.
- **Sources read:** frontend/src/components/Announce.tsx; docs/module-ownership.md; src/shared/vocab.ts; scripts/arch.ts; AlertFields.tsx flagsOf; test/ grep for Announce/useIsFounder.

## 2026-10-11 — v1.60.7: Bounty Done catch re-throws; losing-tap tests; PickGrid stops listing callers (placement-advisor)

- **Ask:** steward pass 17 items 1 and 2 (MojoSOGO "BOTH"). (1) POST /bounties/:id/done's bare catch re-throws unless /UNIQUE|constraint/, as machines.ts and cooking.ts save() do; tests for the losing-tap guards. (2) PickGrid's header comment and its module-ownership row stop listing callers (Chores was missing).
- **Verdict:** src/worker/routes/bounties.ts with test/bounties-api.test.ts and test/cooking.test.ts [EXISTING]; frontend/src/components/PickGrid.tsx and the PickGrid map row [EXISTING].
- **Flow stage:** persist (route save) for item 1; render (comment only) for item 2.
- **Why:** the route stage owns "save in one batch, 409 when another tap won"; copying the siblings' guard keeps the three routes the same with no new shape. No shared regex helper for three one-liners. The bounty refusal keeps `bounty_state`. Tests race two real taps (no test hooks in routes); machines' race was already L10. Listing callers restated what imports show and had drifted.
- **Caps:** bounties.ts ~229/300; PickGrid.tsx unchanged. Nothing in the band.
- **Sources read:** scripts/arch.ts; docs/module-ownership.md; routes/bounties.ts, machines.ts, cooking.ts catch blocks; PickGrid.tsx; the three test files.
## 2026-10-11 — v1.60.6: tab bar lower, build stamp centered under the buttons (placement-advisor)

- **Ask:** SPEC 3.08 §8.1 (Flush at the bottom / Build stamp, ⚑ Q208). MojoSOGO: "lower more and center version". `.tabs` padding-bottom `max(calc(env(safe-area-inset-bottom) - 12px), 14px)`; `.build` centered (left: 0; right: 0; text-align: center) at `top: var(--tabbar-h)`.
- **Verdict:** `frontend/src/App.module.css` [EXISTING]
- **Flow stage:** render
- **Why:** both rules already live in the frame's stylesheet; edits two declarations, adds no concern. theme.css (`--tabbar-h` moves every consumer) and App.tsx markup rejected. Sibling `.fab` mirrors the new strip so the ＋ keeps its 16 px gap.
- **Caps:** App.module.css about 50/300. No file newly in the warning band.

## 2026-10-11 — v1.60.5: FunHouse poller skips stale pings (placement-advisor)

- **Ask:** SPEC 3.07 §9.4a, MojoSOGO 2026-10-11: "getting stale alerts on funhouse". While the board was off USB the bridge answered 503, pollOnce kept `after` unchanged, and after the reconnect it drained the backlog one ping per 15 s poll. Fix: pollOnce skips any ping whose `at` is older than 10 min before now (handled, no POST, one log line). The clock comes in as PollDeps `now`; main passes Date.now. Test FP8.
- **Verdict:** home/funhouse-poller.ts, pollOnce() + PollDeps [EXISTING]
- **Flow stage:** deliver (the home-PC FunHouse leg)
- **Why:** pollOnce already decides send or skip; a stale skip sits next to the !forFunhouse skip, so a backlog clears in one poll. One 10-min constant: FUNHOUSE_START_BACK_MS renamed FUNHOUSE_STALE_MS, serving startAfter and pollOnce. Rejected: filtering in GET /ops/pings (the Worker doesn't know when the PC can deliver); a new home/ module.
- **Caps:** home/funhouse-poller.ts 100 → 104 of 300 (no CEILINGS pin). Nothing newly in the warning band.
- **Reorganizer:** none needed.
## 2026-10-11 — v1.60.4: standalone document height 100lvh so the tab bar isn't clipped (placement-advisor)

- **Ask:** SPEC 3.06 §8.1 "Flush at the bottom", follow-up to v1.60.2. On the iOS 26 installed app (viewport-fit=cover, black-translucent) the tab bar was cut off about 59pt above the screen bottom: `html` 100%/dvh is short by the top safe-area inset, `body { overflow: hidden }` clips there, only 100lvh is the full screen. Add `@media (display-mode: standalone) { html { height: 100lvh; } }` in theme.css; `.app`'s standalone `height: 100vh` becomes `100lvh`.
- **Verdict:** `frontend/src/theme.css` (html base sizing) + `frontend/src/App.module.css` (`.app` override) [EXISTING]
- **Flow stage:** render
- **Why:** each rule goes to the owner of the box it sizes. v1.60.2 rejected theme.css while only `.app` looked short; the device moved the clip to `html`/`body`. Scoped to standalone so browser tabs keep 100% / `inset: 0`. Only `html` overridden; body/#root inherit. A JS viewport measure was rejected (turns a CSS fact into state).
- **Caps:** theme.css about 103/300, App.module.css about 49/300. No file newly in the warning band.

## 2026-10-11 — v1.60.3: no photo on an admin's own Done (placement-advisor)

- **Ask:** Do not offer 📷 Add photo on the one-off Done sheet to an admin, whose Done is OK'd at once (⚑ Q252). The sheet shows Done / Cancel and a line saying the points count at once. No server change. SPEC 3.05 §8.15b, ⚑ Q261, from steward pass 18 finding 1.
- **Verdict:** `frontend/src/components/BountyDone.tsx` [EXISTING]
- **Flow stage:** render
- **Why:** The sheet already owns the one-off Done flow, and this only changes what it shows to one kind of finisher. The admin test reuses `isAdmin` from `src/shared/roles.ts`, which Messes.tsx already imports, so the PWA does not re-derive a role rule. okAtOnce and the routes already decide the payout, so there is nothing to add server-side. A new component or a flag on the caller was rejected because the decision belongs to the sheet that renders the photo control. Blast radius: one 53-line leaf file. The photo-upload path is left in place for non-admins.
- **Caps:** BountyDone.tsx goes from 53 lines to about 55-60 against a cap of 300. No file is newly in the warning band.
- **Sources read:** frontend/src/components/BountyDone.tsx, scripts/arch.ts (caps), docs/module-ownership.md (rows for BountyDone.tsx and roles.ts), src/shared/roles.ts (isAdmin), src/shared/bounties.ts (okAtOnce), SPEC.md (§8.15b at 4430-4462, BT13, version line), docs/decisions.md (Q252), frontend/src/components (shared/roles imports).

---

## 2026-10-11 — Steward pass 18, whole tree (code-steward)

- **Run:** after the v1.60.0 release (SPEC 3.02 §7B.8, a bounty's picture, migration 0046). Also covers v1.59.0 (done photo, migration 0045) and v1.59.1 (Point at it label). Audited 265334e..50328a3 (the v1.60.0 head; v1.60.1–v1.60.2 landed after).
- **Verdict:** MINOR DRIFT. Typecheck green, 829/829 tests (112 files), arch:audit quiet (EventForm.tsx 88%, Calendar.tsx 87%, routes/recipes.ts 87%, engine.ts 86%; routes/bounties.ts 228/300).
- **Placement audit:** 3 receipts checked against 5 code commits. Each landed where its verdict said. 0 code commits without a receipt.
- **Top finding:** an admin's Done with a photo is paid at once, so PUT /earnings/{id}/photo returns 409 "That is already OK'd." and BountyDone tells them to "Add it again from Waiting for OK", which is impossible. §8.15b does not cover this case. Fix: a ⚑ line in the spec, then hide the 📷 or skip the upload when Done answers `paid` in BountyDone.tsx (MED-LOW, S).
- **Handoffs:** waiting on MojoSOGO's pick: (1) the admin Done-photo fix (worker); (3) `useBlobUrl` in usePhotoPick.tsx for the 4 copies of the preview effect, best done before the next photo sheet (reorganizer). (2) where-things-stand missing the v1.60.0 phone check: done with this receipt. Carried: pass 17's Done catch-all plus losing-tap tests, the PickGrid caller list (map row still missing Chores), and the older LOW items from passes 6, 10, 11 and 16.
- **Restraint:** no routes/bounty-photos.ts yet (the receipt's ~250 trigger stands; only about 30 lines would move); no photo-store dropPhoto (a one-liner, Middle Man); no `<PhotoDraft>` component (two callers); dropBountyPhoto's separate write (same orphan risk the house accepts everywhere); a pending chore earning outliving a chore delete (predates this range); receipts-file formatting.

---

## 2026-10-11 — v1.60.2: standalone PWA frame flush to screen bottom (placement-advisor)

- **Ask:** SPEC 3.04 §8.1 "Flush at the bottom". On the installed iPhone app the fixed `.app` box (`inset: 0`) stops above the bottom safe area, so the tab bar floats. Add `@media (display-mode: standalone) { .app { bottom: auto; height: 100vh; } }`.
- **Verdict:** `frontend/src/App.module.css` [EXISTING]
- **Flow stage:** render
- **Why:** the bug is in `.app`, owned by App.tsx's frame (§8.1) under the `frontend/src/*.module.css` row. Pure presentation. Scoped to standalone so browser tabs keep `inset: 0`; theme.css (global base) rejected. `.tabs` safe-area padding and `.fab` offset unchanged; check on device.
- **Caps:** App.module.css about 50/300. No file newly in the warning band.

## 2026-10-11 — v1.60.1: Point at it on by default, ◎ more visible (placement-advisor)

- **Ask:** SPEC 3.03 §8.16 ⚑ Q234. The ◎ now shows by default on every device, as on Ozymandias. The Settings → 🙂 Me switch now turns it off (`enso.pointAt === '0'` means off, anything else means on). The floating ◎ opacity goes from .45 to .6 because MojoSOGO couldn't see it.
- **Verdict:** frontend/src/components/PointAtButton.tsx (`read`, `setPointAtOn`, and the server-snapshot default in `usePointAtOn`) + frontend/src/components/PointAt.module.css (`.float` opacity) [EXISTING]
- **Flow stage:** render
- **Why:** PointAtButton.tsx is the only module that reads or writes the device switch, so flipping the default there moves SettingsMe and PointAt together and creates no second copy. The server snapshot is also a statement of the default, so it flips with `read`. Rejected: the default in SettingsMe (a restatement) or state.tsx (device-local, not account state).
- **Caps:** PointAtButton.tsx 30/300; PointAt.module.css ~35/300. Nothing in the band.
- **Sources read:** PointAtButton.tsx, PointAt.module.css, SettingsMe.tsx (28–35), scripts/arch.ts, docs/module-ownership.md, docs/placement-receipts.md, SPEC.md §8.16.

## 2026-10-11 — v1.60.0: A bounty's picture (placement-advisor)

- **Ask:** SPEC 3.02 §7B.8 "A bounty's picture":
  - PUT/GET /bounties/{id}/photo (admins set it; anyone reads it).
  - `Bounty.hasPhoto` and migration 0046 (`bounties.photo_key`).
  - The picture is deleted when the bounty is paid or deleted.
  - §8.15b: the ＋ Bounty sheet gets 📷 Add photo (sent after Post); the card shows a thumbnail; an admin's card gets 📷 Add/Replace.
- **Verdict:** EXISTING, no new row, plus a new migration 0046 and its test. By file:
  - routes/bounties.ts: both routes, plus the deletes on OK, on an admin's instant Done, and on DELETE.
  - photo-store.ts: the `'bounties'` prefix.
  - shared/bounties.ts: BountyRow.photo_key and Bounty.hasPhoto.
  - BountyForm.tsx: the photo pick, PUT after Post.
  - Bounties.tsx: the thumbnail and the admin 📷.
- **Flow stage:** route → persist (D1 + R2 via photo-store.ts) → render. No new rule.
- **Why:** bounties.ts already owns the bounty, `loadBounty`/`view`, and every point where a bounty becomes paid or deleted, so the deletes must live there. This mirrors v1.59.0.
- **Rejected:**
  - A routes/bounty-photos.ts now: it needs exported loaders, and the deletes stay behind anyway.
  - A shared `canSetPhoto` rule: it is one status check.
  - A vocab entry.
  - Deleting on Not yet: the bounty is still live.
- **Caps:** routes/bounties.ts 199 → 228/300 (band at 270), with a second photo route pair in one file. Bounties.tsx 148 → 153/300. BountyForm.tsx 45 → 73/300. shared/bounties.ts ~128/300. photo-store.ts 35/300. Nothing newly in the band; no re-pins.
- **Seam named for next time:** both photo route pairs + dropPhoto → `src/worker/routes/bounty-photos.ts`, with bounties.ts exporting loadBounty/pending (the lists.ts/item-photos.ts pattern). Extract when bounties.ts would pass ~250.
- **Sources read:** docs/module-ownership.md (photo and bounty rows), docs/placement-receipts.md (v1.59.0, steward pass 17), scripts/arch.ts (caps), SPEC.md §7B.8 "A bounty's picture", src/worker/routes/bounties.ts (199 lines). Line counts and wire types for photo-store.ts, shared/bounties.ts, BountyForm.tsx, Bounties.tsx, BountyDone.tsx and earnings.ts.

---

## 2026-10-11 — Steward pass 17, whole tree (code-steward)

- **Run:** after the v1.58.0 release (SPEC 2.99 §8.16, pick mode like Ozymandias, with the ◎ button). Also covers v1.54.1–v1.57.1 (FunHouse for machines, custom minutes, poller cursor, two machines buttons, Chores menu, tagline, Settings About, bounties and score with migration 0044, shorter thread pings). Audited e21ab6c..265334e.
- **Verdict:** SOUND. Typecheck green, 823/823 tests (110 files), arch:audit quiet (EventForm.tsx 88%, Calendar.tsx 87%, routes/recipes.ts 87%, engine.ts 86%).
- **Placement audit:** 11 receipts checked against 13 code commits. Each landed where its verdict said. 0 code commits without a receipt. fa96805 (◎) rides on the pick-mode receipt. 5493411 (.vbs) is outside SOURCE_EXT.
- **Top finding:** routes/bounties.ts Done catches every batch error as a 409 "waiting for OK", where its siblings machines/cooking re-throw non-constraint errors. No losing-tap guard is tested (bounties take/Done, machines, cooking) (MED-LOW, S).
- **Handoffs:** waiting on MojoSOGO's pick: (1) the Done re-throw plus the losing-tap tests (absorbs pass 16's conflict-guard item); (2) wording: PickGrid's caller list now missing Chores (stop listing callers). The pick-mode wording slips (SettingsMe label, PointAtButton header, PointAt map row, where-things-stand header) were fixed at once as v1.59.1 by the thread that shipped v1.58.0. Still open, all LOW: pass 11's two §7D notes, pass 10's house-row helper, the snooze-keeps-away test, the machines.ts alert-hours seam. Pass 6 items 1, 3 and 4 (alertMessage options, read-budget wording, EVENT_NOTES_MAX) fell off the carry list without a decision; MojoSOGO to retire or re-list them.
- **Restraint:** the PickGrid + Modal menu glue now has three copies (Settings, Alarms, Chores), about 4 lines each with no rule, so no PickMenu until a fourth; the active-admins query twice; the name lookup twice; /take's SQL mirroring dibHolds (atomic guard); /earnings ok's unconditional UPDATE (a dropped earning never scores); the finisherOf route import; selectorFor kept in point-line.ts.

## 2026-10-11 — v1.59.1: Point at it label and comment match ◎ (placement-advisor)

- **Ask:** SPEC 3.01 §8.16 wording only. The Settings → 🙂 Me switch label still said "tap 🎯 … get a line naming it", but since v1.58.0 the button is ◎, pick mode stays on, and it copies several lines. The PointAtButton header comment still said "🎯 button".
- **Verdict:** `frontend/src/components/SettingsMe.tsx` (label) and `frontend/src/components/PointAtButton.tsx` (header comment). REUSE, add nothing.
- **Flow stage:** render
- **Why:** text-only fixes inside the files whose map rows already own the switch and the ◎ button. No logic, imports or fan-in change. The label is client UI copy, not a vocabulary string.
- **Caps:** SettingsMe.tsx 37/300, PointAtButton.tsx 30/300; unchanged in effect.
- **Sources read:** frontend/src/components/SettingsMe.tsx, frontend/src/components/PointAtButton.tsx, docs/module-ownership.md (rows 197–198), scripts/arch.ts.

## 2026-10-11 — v1.59.0: A done photo on an earning (placement-advisor)

- **Ask:** SPEC 3.00 §7B.8 "A done photo": PUT/GET /earnings/{id}/photo, `Bounty.earningId`, `Earning.hasPhoto`, §4.2zr migration 0045 (`earnings.photo_key`), and §8.15b (the Waiting for OK thumbnail, 📷 Add photo on my own pending row, the Done sheet with an optional photo).
- **Verdict:** EXISTING routes/bounties.ts (both routes; photo_key NULL and the R2 delete on OK / Not yet / bounty delete), earnings.ts (the undo drop returns the dropped key), routes/chores.ts stepRun (deletes it after its batch), photo-store.ts (`'earnings'` prefix), shared/bounties.ts (wire fields, EarningRow.photo_key), Bounties.tsx (Thumb, 📷 on my row). NEW row `frontend/src/components/BountyDone.tsx` (the Done sheet). New migration 0045 + BT-M2 test.
- **Flow stage:** route → persist (earnings.ts, stepRun's batch, R2 via photo-store.ts) → render. No new rule.
- **Why:** routes/bounties.ts already owns the earning resource and its `pending()` loader; the delete-on-decision pattern is messes.ts's. The undo path keeps v1.57.0's single seam: earnings.ts returns the key and stays free of I/O; stepRun deletes after the batch. The Done sheet is its own leaf (a modal with a draft and a two-call sequence, as BountyForm).
- **Rejected:** a new routes/earning-photos.ts (copies `pending()`); R2 deletes inside earnings.ts; a `canAddPhoto` shared rule (one comparison; the 409 is `pending()`'s); a vocab entry; PhotoField's full form component on a list row.
- **Caps:** routes/bounties.ts 175 → 199/300; Bounties.tsx 130 → 148/300; BountyDone.tsx ~55; routes/chores.ts ~197/300. Nothing newly in the warning band; no reorganizer.
- **Open → settled:** a replaced photo keeps its URL under `private, max-age=3600`; the app adds its own `?v=` after an upload (§8.15b, ⚑ Q259).

---


---

## 2026-10-11 — v1.58.0: 🎯 pick mode stays on, Ozy-style text with a CSS selector, toast instead of modal (placement-advisor)

- **Ask:** SPEC 2.99 §8.16 (modeled on the Ozymandias dashboard's pick mode). 🎯 turns pick mode on until 🎯 again, the bar, Esc, or Alt+P. While on: a top bar, a hover outline for a mouse (a class on the element under the pointer), a crosshair cursor. Every tap is captured, swallowed and copied, then shown in a toast (4 s, or 15 s with "Copy blocked"), with no 📍 Pointed at modal. The text becomes multi-line: `Enso pick: <tab>` / `Where:` modals and groups joined " > " / `Element: <kind> "<name>"` / `Selector:` (stops at the nearest id, else tag.class (first 2) with :nth-of-type where siblings share the tag, joined " > ") / `Screen: WxH` (phone below 700 wide) / build stamp.
- **Verdict:** frontend/src/point-line.ts, frontend/src/components/PointAtButton.tsx, frontend/src/components/PointAt.tsx (+ PointAt.module.css) [EXISTING]. Build waited on the §8.16 text.
- **Flow stage:** render and capture intent (PWA only); point-line.ts is the PWA's own naming rule.
- **Why:** point-line.ts (91/300, one importer) already owns naming the tapped element. selectorFor is another way of naming it, and pickText replaces pointLine outright, so its concern stays one. A separate selector module was rejected as classitis at this size. PointAtButton.tsx (26/300) keeps the switch and the signal, which turns from arm into toggle; it holds no pick state. PointAt.tsx (74/300) already owns the capture-phase layer and the result display; swapping the modal for a toast and adding hover, crosshair and keys keeps it one concern (the pick layer). A generic Toast component was rejected (no second user). Threats avoided: module-level `let` for pick state; the phone/desktop size rule leaking into the layer (it lives in pickText); a stale hover class left on app elements after off or unmount; the copy moving out of the gesture handlers (v1.52.1).
- **Caps:** point-line.ts ~130/300; PointAt.tsx ~120/300; PointAtButton.tsx ~26/300; PointAt.module.css ~35/300. Nothing in the band; no re-pins.
- **Sources read:** docs/module-ownership.md (PointAt rows, state.tsx row), docs/placement-receipts.md (v1.52.0, v1.52.1), scripts/arch.ts, SPEC.md §8.16, frontend/src/point-line.ts, frontend/src/components/PointAt.tsx, frontend/src/components/PointAtButton.tsx, frontend/src/components/PointAt.module.css.
## 2026-10-11 — v1.57.1: FunHouse 🧵 thread ping shows its text only (placement-advisor)

- **Ask:** SPEC 2.98 §9.4a, MojoSOGO 2026-10-11: "the funhouse has a small display; the prefix has too many words: have it say {name of project}:{name of thread} \"message\"". In the FunHouse poller's bridge body, a 🧵 thread ping sends only its text (threads now write it as `Enso:<thread title> "<ACTION what>"`), with no "title: " prefix. 🤖 pings and FunHouse alerts keep "title: text". Test FP4.
- **Verdict:** home/funhouse-poller.ts, funhouseNotice() [EXISTING]
- **Flow stage:** deliver (the home-PC FunHouse leg)
- **Why:** funhouseNotice is already the one builder of the bridge body, so this changes one expression inside one owner. It branches on the 🧵 title prefix the same way forFunhouse does. Rejected: changing the ping in the Worker (/ops/notify or /ops/pings), because the phone push shows title and text separately and the contract stays the same. Rejected: a vocab.ts constant, because this is a home-side display format with no Worker import.
- **Caps:** home/funhouse-poller.ts 98 → 99 of 300 (no CEILINGS pin). Nothing is newly in the warning band.
- **Reorganizer:** none needed.

---

## 2026-10-11 — v1.57.0: Bounties and the score (placement-advisor)

- **Ask:** SPEC 2.97 §7B.8 Bounties and the score, §8.15b (🪙 Bounties / ＋ Bounty / 🏅 Score screens, 🪙 n on Today and All chores), §4.2zq migration 0044, §10 rows for /bounties, /chores/{id}/bounty, /earnings, and the §9.4 founder-ping predicate leaving out bounty pushes.
- **Verdict:** NEW rows `src/shared/bounties.ts`, `src/worker/routes/bounties.ts`, `src/worker/earnings.ts`, `frontend/src/components/Bounties.tsx`, `BountyForm.tsx`, `Score.tsx`. EXISTING: vocab.ts (BOUNTY_STATUS), shared/chores.ts (ChoreRow.bounty only), routes/chores.ts (views + the earning hook in stepRun), routes/alerts.ts (completeStep call), deliveries.ts (bountyId / earningId, FOUNDER_PING), index.ts (mount), Chores.tsx, ChoresToday.tsx, alert-history.ts (comment only).
- **Flow stage:** rules (bounties.ts) → route (routes/bounties.ts) → persist + deliver (earnings.ts, deliveries.ts, stepRun's batch) → render (the three PWA files).
- **Why:** earnings have two writers (a one-off's Done, a chore run's last step), so one persist owner modelled on mess-asks.ts keeps auto-OK (Q252) and the admin push identical. The chore hook sits in `stepRun`, shared by /chore-runs/{id}/done, the fire's Done (alerts.ts) and undo, in the same D1 batch as the run change, so finish/earn and undo/drop are atomic and cannot drift between callers; `completeStep` takes env and the member. Only ChoreRow gains `bounty` (on Chore it would spread into parseChoreInput, PATCH and tick). Earn-or-drop, okAtOnce and the score window start are pure helpers so the Worker decides nothing. PUT /chores/{id}/bounty lives in routes/bounties.ts, keeping routes/chores.ts one concern. The PWA is three files (one would be ~300 lines and three concerns). alertSource unchanged: §9.5's title branch already labels bounty pushes; only its comment is corrected.
- **Rejected:** each caller hooking after completeStep (the push-action path would drift); an earning write in fire-rows.ts loadChoreRun (wrong concern, high fan-in); a separate "Bounty" alert source (not in the spec).
- **Caps:** new files all under 200 lines; routes/chores.ts 181 → ~200/300; shared/chores.ts ~242/300; deliveries.ts ~74; no file newly in the warning band; CEILINGS unchanged; no reorganizer.
- **Restraint (for the steward):** earnings.ts's inline active-admins query repeats mess-asks.ts's (two copies). Fold them into db.ts only if a third appears.
- **Sources read:** SPEC.md §4.2zq, §7B.8, §8.15, §8.15b, §9.4, §9.5, §10; docs/module-ownership.md; docs/modularity.md; docs/placement-receipts.md; scripts/arch.ts; routes/chores.ts; deliveries.ts; mess-asks.ts; index.ts; fire-rows.ts; routes/alerts.ts; shared/chores.ts; vocab.ts; alert-history.ts; Chores.tsx; ChoresToday.tsx.

---

## 2026-10-11 — v1.56.0: Settings → ℹ️ About (placement-advisor)

- **Ask:** SPEC 2.96 §8.6 (new area, MojoSOGO 2026-10-11 "add 'about' button in settings; modal shows splash screen, logo, revision, developed by"): a 9th Settings PickGrid button ℹ️ About for everyone, whose modal shows the §8.10 opening-screen look (/icon.svg, "Ensō", the tagline, `__ENSO_BUILD__`) and "Developed by MojoSOGO · with Claude". No server, API or migration change.
- **Verdict:** frontend/src/components/SettingsAbout.tsx + SettingsAbout.module.css [NEW row]; frontend/src/components/Settings.tsx (one AREAS entry, one body entry) [EXISTING]; test/settings-about.test.ts (new).
- **Flow stage:** render
- **Why:** Every Settings area is its own leaf component, and Settings.tsx only holds which one is open, so About follows SettingsMe and SettingsStatus. The tagline is written once in source, as `TAGLINE` exported by SettingsAbout.tsx. index.html must stay plain HTML that paints before any script (§8.10), so it keeps its literal copy, and test/settings-about.test.ts asserts that index.html contains each half (index.html and SettingsAbout both loaded at run time like test/recipe-transcript.test.ts; a static `?raw` import fails the Worker typecheck). Rejected: rendering the About body inline in Settings.tsx (a second concern for the menu); vocab.ts for the tagline (display copy, already rejected by the v1.55.1 receipt); a separate tagline.ts (a map row for one const with one importer); injecting the tagline into index.html from vite.config.ts like %ENSO_BUILD% (build machinery to avoid a one-line test).
- **Caps:** Settings.tsx 59/99 → 62/99 (CEILINGS unchanged); SettingsAbout.tsx 19/300. No file enters the warning band.
- **Reorganizer:** none needed.
- **Sources read:** scripts/arch.ts, docs/module-ownership.md, docs/placement-receipts.md (latest three), Settings.tsx, frontend/index.html, SPEC.md §8.6, test/point-at.test.ts, test/repeat-fields.test.ts, RecipeView.tsx imports, vitest.config.ts.

## 2026-10-11 — Steward pass 16 handoff TXT: wording only (no placement needed for code)

- **Ask:** MojoSOGO picked TXT from pass 16 (and said no to TST): PickGrid's header comment and map row now name its three callers (§8.5 Alarms, §8.6 Settings, §8.8 Lists); SPEC 2.95 §8.2 gains the cooking timer's Ringing bar row (`🍳 label · person` with **[Off]**, glyph fixed, ⚑ Q246). Comment and docs only; no behavior change, no version bump, no deploy.

## 2026-10-11 — v1.55.1: Opening-screen tagline (placement-advisor)

- **Ask:** SPEC 2.94 §8.10: the tagline "Closing the loop. Peace of mind, every day." under the "Ensō" heading on the opening screen, and the iPhone splash PNGs re-rendered from that screen.
- **Verdict:** `frontend/index.html` (#splash) [EXISTING, reuse; no new module]
- **Flow stage:** render
- **Why:** §8.10 makes the opening screen plain HTML in index.html so it paints before any script. A static tagline is one `<p>` there plus its CSS. index.html is outside `SOURCE_EXT`, with no cap, map row or fan-in.
- **Rejected:** a React component in frontend/src/ (would show only after the bundle loads, and copy the screen); `vocab.ts` (display copy, and the splash cannot import it); the sign-in screens (no logo there); drawing the PNGs separately (§8.10 says they are rendered from this screen).
- **Caps:** none affected. No file enters the warning band.
- **Sources read:** frontend/index.html, scripts/arch.ts, docs/module-ownership.md.

---

## 2026-10-11 — v1.55.0: Chores tab becomes a section menu (placement-advisor)

- **Ask:** Make the 🧹 Chores tab a menu like Alarms/Settings: heading Chores, a PickGrid of ✅ Today · 🧽 Messes · 📋 All chores, and a tap opens that section in a Modal titled emoji + name, with nothing inside the sections changing (SPEC 2.93 §8.15, ⚑ Q245).
- **Verdict:** frontend/src/components/Chores.tsx [EXISTING]. The All chores list moves into a local AllChoresSection in the same file. The map row is reworded to describe the menu.
- **Flow stage:** render
- **Why:** This only regroups the sections Chores.tsx already lays out, using the pattern from Alarms.tsx (§8.5, v1.53.0) and Settings.tsx (§8.6) with PickGrid and Modal, which hold no state. No rule, route or vocabulary involved. The fetch stays in ChoresTab because ChoresToday's 📋 needs the chores list while All chores is closed. Rejected: a new ChoresAll.tsx (needless at about 120 lines). Rejected: a shared section-menu helper for Alarms/Settings/Chores (speculative). Rejected: dropping Messes' own h2 (widens scope into Messes.tsx against "nothing inside changes").
- **Caps:** Chores.tsx 84/300 → about 120/300. No file enters the band; CEILINGS unchanged.
- **Reorganizer:** none needed.

---

## 2026-10-11 — v1.54.4: Alarms tab splits Machines into Washing machines and Cooking machines (placement-advisor)

- **Ask:** SPEC 2.92 §8.5: the Alarms tab PickGrid goes from three buttons to four (⏰ Alarms, ⏱ Rolling timers, 🧺 Washing machines, 🍳 Cooking machines). Each machines button opens its own modal: MachinesSection alone, CookingSection alone. The groups' own h3 headings go, since the modal title names them.
- **Verdict:** frontend/src/components/Alarms.tsx (SECTIONS and body map); Machines.tsx and Cooking.tsx (heading removal only) [EXISTING]
- **Flow stage:** render
- **Why:** Alarms.tsx already owns which section is open, so a fourth PickGrid entry is a data change in its SECTIONS list. Each group file keeps its single concern and only loses the heading the Modal title now provides; Cooking keeps its ＋ Cooking timer row with a flex spacer. Rejected: a new "MachinesMenu" wrapper (a hop for no concern). Ownership rows for Alarms, Machines, Cooking and MachineHours corrected in the same commit.
- **Caps:** Alarms.tsx about 172/300, Machines.tsx about 173/300, Cooking.tsx about 71/300. None in the warning band.
- **Sources read:** Alarms.tsx, Machines.tsx, Cooking.tsx, docs/module-ownership.md, scripts/arch.ts, SPEC.md §8.5.

## 2026-10-11 — v1.54.2: Cooking box custom minutes box in the chip row (placement-advisor)

- **Ask:** SPEC 2.90 §8.5: the cooking box's minutes field moves into the "How long?" chip row as a small "custom" box after the 60 chip, with a light gray "custom" placeholder. A chip picks its value and empties the box; typing in the box unpicks the chips. UI only.
- **Verdict:** frontend/src/components/CookBox.tsx [EXISTING] (plus its own CookBox.module.css for the placeholder color).
- **Flow stage:** render
- **Why:** The CookBox map row already owns "How long?". This is a layout and draft-state change inside that one concern. Rejected: Machines.tsx (Pick and bigChip need no change; MachineChooser's chips are not covered) and any shared or state.tsx home (chip-vs-custom is a local draft; validation still uses COOK_MINUTES_MAX).
- **Caps:** CookBox.tsx about 70/300, no CEILINGS pin. Nothing newly in the warning band.
- **Sources read:** CookBox.tsx, SPEC.md §8.5, docs/module-ownership.md (CookBox and Machines rows), scripts/arch.ts, docs/placement-receipts.md.

## 2026-10-11 — Steward pass 16, whole tree (code-steward)

- **Run:** after the v1.54.0 release (SPEC 2.88 §7D.8: cooking timers as `machines` rows with a `cook_` id, migration 0043, tick step 3e, the 🍳 Cooking group under 🧺 Washing machines). Audited 99bae1f..e21ab6c.
- **Verdict:** SOUND. Typecheck green, 796/796 tests (106 files), arch:audit quiet (engine.ts 86%, tick.ts 123/148, machines.ts 228/300 unchanged).
- **Placement audit:** 1 receipt checked against 1 code commit (e21ab6c). It landed where its verdict said. The map rows match the files. 0 code commits without a receipt.
- **Top finding:** the losing-tap 409 `conflict` guard (the row-id INSERT collision that rolls back the batch) has no test in either routes/machines.ts or cook-rows.ts / routes/cooking.ts. One cookWrites test with a stale `before` (LOW-MED, S).
- **Handoffs:** 3, waiting on MojoSOGO's pick: the conflict-guard test; pass 15's PickGrid header and row wording (still open); a §8.2 line for the cooking ringing row `🍳 label · [Off]` (whether the glyph varies by kind is MojoSOGO's call). Still open, all LOW: pass 11's two §7D notes, pass 10's house-row helper note, the snooze-keeps-away test, the machines.ts alert-hours seam.
- **MS9 transient:** no logic or order bug found. MS9 is the heaviest test in messes-api (PBKDF2 signup, 3 R2 reports, about 15 requests) under the default 5 s timeout, so load is the likely cause. It doesn't check the status of its claim and settle calls; if it recurs, capture the failure text before changing anything.
- **Restraint:** openCookFire repeats routes/machines.ts's open-fire query (one line, two copies); the `/UNIQUE|constraint/` regex in two routes; the separate guard writers; Pick, bigChip and AlertWhenDone exported from Machines.tsx to CookBox (two callers); COOK_GLYPH in the PWA; cookDayTick's one query per timer.
## 2026-10-11 — v1.54.3: FunHouse poller keeps its `after` across restarts (placement-advisor)

- **Ask:** SPEC 2.91 §9.4a, Q244 ("DUP"). The FunHouse poller re-sent the last alerts after every restart because `after` started at now − 10 min, and in practice the bridge doesn't drop repeated ids. Fix: a pure `startAfter(saved, nowMs)` (saved if it is a valid instant within FUNHOUSE_START_BACK_MS, else now − START_BACK). `main` reads and writes `%USERPROFILE%\.enso\funhouse-poller-after` beside the token, on start and whenever `after` changes. Test FP7.
- **Verdict:** home/funhouse-poller.ts [EXISTING]
- **Flow stage:** deliver (the home-PC FunHouse leg), with a pure rule (startAfter) next to pollOnce and the I/O in main.
- **Why:** The poller's map row already owns the first `after` and names `main` as the only node:fs user, so this is one concern inside one owner. Rejected a new home/ module for the saved cursor (about 10 lines, one caller). Rejected anything in src/worker/: the Worker doesn't track which notices the PC has handled. The stale "bridge drops a repeated id" comment and the map row wording are corrected in the same commit.
- **Caps:** home/funhouse-poller.ts goes from 85 to about 100 of 300 (no CEILINGS pin). Nothing is newly in the warning band.

---

## 2026-10-11 — v1.54.1: Machine fires also ring the 🎪 FunHouse (placement-advisor)

- **Ask:** SPEC 2.89 §7D.3 / §7D.7 / §7D.8 + §9.4b, Q231 decided. MojoSOGO: "I am not getting funhouse alerts on completion". Machine fires (washer, dryer, dish washer, cooking timers) also go to the FunHouse channel, both when there is someone to alert and when there is nobody.
- **Verdict:** [EXISTING] src/shared/machines.ts: MACHINE_CHANNELS becomes ['push','house','funhouse']; machineAlert's nobody case becomes ['push','funhouse']; the doc comment is updated to match. Tests: test/machine-alert.test.ts AL1 updated and AL7 added there; test/cooking.test.ts assertions updated (cookAlert inherits from machineAlert); machines.test.ts delivery counts updated. No reorganizer, no CEILINGS change.
- **Flow stage:** rules (machines.ts). Deliver is unchanged: tick.ts already writes the funhouse row on `aud.funhouse && !fire.away_by`, and optins.ts audience() reads it from cfg.channels.
- **Why:** The channel set is a decision machines.ts already owns, so changing two literals there is the smallest change. A funhouse special case in tick.ts or fire-rows.ts was rejected: it would put a rule in the Worker and split the machine alert across two homes. 'funhouse' is already in vocab.ts CHANNEL. The phone-first rule is unaffected.
- **Caps:** machines.ts 228/300 before, about the same after; nothing newly in the warning band.

---

## 2026-10-11 — v1.54.0: Cooking timers, a second group under Machines (placement-advisor)

- **Ask:** SPEC 2.88 §7D.8 (cooking timers, asked by MojoSOGO), §4.2zp (migration 0043: machines gains cook_kind, name, created_at, closed_at), §5.6 step 3e (end-of-day close), §8.5 "Two groups" (🧺 Washing machines / 🍳 Cooking), §10 /cooking rows. Anyone creates as many as they like (Air fryer, Stove, Oven, Microwave, Other); Off / Stop / Start again / Edit / ✕ close; rings every 5 min ×4 at any hour; cleared after midnight when not active. CK1–CK9, CK-M.
- **Verdict:** [NEW rows] src/shared/cooking.ts (rules), src/worker/cook-rows.ts (rows + tick step 3e cookDayTick), src/worker/routes/cooking.ts (route), frontend/src/components/Cooking.tsx (the group and cards) and CookBox.tsx (create / edit box). [EXISTING] vocab.ts COOK_KIND; machines.ts machineState takes `Pick<MachineRow,'done_at'>`; fire-rows.ts sourceOf cooking branch (cookMessage, cookAlert, no alert hours) and `WHERE cook_kind IS NULL` for the fixed machines; routes/alerts.ts fireViews cookLabel title; routes/machines.ts loadRows fixed machines only; tick.ts calls step 3e; index.ts mounts; Machines.tsx 🧺 heading, exports Pick / bigChip / AlertWhenDone; Alarms.tsx renders both groups; RingingBar.tsx Off on a cooking fire. Migration 0043 + test/migration-0043.test.ts. No reorganizer, no CEILINGS change.
- **Flow stage:** rules (cooking.ts, vocab); persist (migration, cook-rows.ts, routes/cooking.ts, tick step 3e); deliver (unchanged: sourceOf feeds the existing push / house plumbing); render (Cooking, CookBox, Machines, Alarms, RingingBar).
- **Why:** Putting the cooking rules in machines.ts (228/300) would push it over its cap and add a second concern (timers made on demand with close and end-of-day rules). A new leaf keeps the laundry rules intact. Exporting routes/machines.ts machineWrites was rejected: it guards on `started_at` and writes only load columns, but cooking writes cook_kind / name / closed_at, INSERTs on Create, and must guard on `updated_at`. Step 3e inside tick.ts (120/148) or in routes/cooking.ts was rejected: the ✕ route and the midnight close do the same write, so one Worker module shared by both holds it (the mess-asks.ts pattern), and tick never imports a route. The fixed-machine reads now filter `cook_kind IS NULL`, because closed cooking rows stay forever and are not MachineIds. engine.ts (258/300) is untouched. The PWA is split into two files up front (one file would be about 240, near the band). AlertWhenDone is lifted inside Machines.tsx so the chooser and the cooking box share one wording.
- **Caps (as built):** tick.ts 123/148; machines.ts 228/300; engine.ts 258/300 unchanged; alerts.ts 214/300; nothing in the warning band (`npm run arch:audit`).
- **Sources read:** CLAUDE.md, docs/module-ownership.md, docs/modularity.md (headings), scripts/arch.ts, docs/placement-receipts.md (top), SPEC.md §4.2zp, §7D.8, §8.5, §10, §5.6; src/shared/machines.ts, vocab.ts, engine.ts (machine lines), src/worker/fire-rows.ts, routes/machines.ts, tick.ts, index.ts, routes/alerts.ts, migrations 0014/0037/0040, Machines.tsx, RingingBar.tsx, Alarms.tsx.


## 2026-10-11 — Steward pass 15, whole tree (code-steward)

- **Run:** after the v1.53.0 release (SPEC 2.87 §8.5: the Alarms tab as a PickGrid menu of ⏰ Alarms, ⏱ Rolling timers and 🫧 Machines, each in a Modal; Machines wording for every machine). Also covers v1.51.0, v1.51.1, v1.52.0 and v1.52.1. Audited 3b9b2cb..bdb1895.
- **Verdict:** SOUND. Typecheck green, 783/783 tests (104 files), arch:audit quiet (engine.ts 86%, tick.ts 120/148, Alarms.tsx 170/300).
- **Placement audit:** 5 receipts checked against 5 code commits (0f2346f, 4c823c5, f439bdc, 81e675b, bdb1895); each landed where its verdict said. 0 code commits without a receipt (5d9c9b4 was pass 14's handoff; 82579d3 is docs only).
- **Top finding:** the PickGrid.tsx header comment and its module-ownership row still cite only §8.6/§8.8 and "both popups"; Alarms (§8.5) is now a third caller. A wording fix (LOW), waiting on MojoSOGO's pick.
- **Handoffs:** 1 to worker (the PickGrid comment and row). Still open, all LOW: pass 11's two §7D notes, pass 10's house-row helper note, the snooze-keeps-away test, the machines.ts alert-hours seam (228/300). Pass 14's handoffs are done (5d9c9b4).
- **Restraint:** Settings and Alarms now share a ~6-line menu pattern (two copies only, so a PickMenu would be speculative until a third copy); the duplicated flex spacer; the `as Section` cast; the typed 'funhouse' Channel literals; the remaining washer and dryer wording, which describes real laundry behavior.

---

## 2026-10-11 — v1.53.0: Alarms tab becomes a menu of three sections; Machines wording (placement-advisor)

- **Ask:** SPEC 2.87 §8.5 (v1.53.0), UI only, asked by MojoSOGO. Announce and Quiet the house stay at the top of the Alarms tab. Below them a PickGrid of ⏰ Alarms, ⏱ Rolling timers and 🫧 Machines opens the tapped section in a titled Modal, as Settings does (§8.6). The sections drop their h2 and keep ＋ Add. The Machines intro line is shorter and no longer implies laundry only. MachineHours "Washer and dryer alerts…" becomes "Machine alerts…".
- **Verdict:** frontend/src/components/Alarms.tsx `Alarms` [EXISTING] for the grid and its open-section state. Timers.tsx, Machines.tsx and MachineHours.tsx [EXISTING] get the heading and wording edits. No new file.
- **Flow stage:** render
- **Why:** `Alarms` is already the tab frame that puts Announce, HouseQuiet and the three sections together, so a grid with one open-section state is the same concern laid out differently. An AlarmsMenu.tsx was rejected: Settings.tsx is menu-only because every area has its own file, but here `Alarms` already is the frame and Alarms.tsx keeps ScheduledSection and AlarmForm, which App imports. The pattern is copied from Settings.tsx (const list, `useState`, `body` record, Modal titled emoji + label), not its file split. App's alarm/timer form overlays stack over the section Modal through showModal, as MachineChooser already does. Future seam if the file grows: ScheduledSection + AlarmForm → AlarmsScheduled.tsx.
- **Caps:** Alarms.tsx 154 → ~170/300; Timers.tsx, Machines.tsx, MachineHours.tsx unchanged in size. No CEILINGS change. Nothing in the band.
- **Reorganizer:** none needed.

---

## 2026-10-11 — v1.52.1: 🎯 pick copies straight to the clipboard (placement-advisor)

- **Ask:** SPEC 2.86 §8.16 (v1.52.1), asked by MojoSOGO. The picked line goes to the clipboard inside the pick's own capture handlers, because iOS allows the clipboard only during the gesture. The 📍 Pointed at modal says "✓ Copied. Paste it into Claude." The Copy button stays as the fallback.
- **Verdict:** frontend/src/components/PointAt.tsx [EXISTING]
- **Flow stage:** render (capture intent)
- **Why:** PointAt.tsx already owns the capture-phase listeners and the result modal (v1.52.0 row). The copy has to run inside those handlers to count as part of the user's gesture, so no other file could do it. point-line.ts (the naming rule) and PointAtButton.tsx (the switch and arm signal) were rejected because neither touches the gesture. The pick state is `let`s scoped to the effect, and nothing new is at module level.
- **Caps:** PointAt.tsx 74/300. Nothing in the band.

---

## 2026-10-11 — v1.52.0: 🎯 Point at it, a one-tap pick mode that names what was tapped (placement-advisor)

- **Ask:** SPEC 2.85 §8.16 (with the §8.6 🙂 Me line), asked by MojoSOGO: a per-device switch in Settings → 🙂 Me; while on, a 🎯 floats above the tab bar and another sits in every modal header beside ✕. A 🎯 tap arms one pick, the next tap is captured and swallowed, and a 📍 Pointed at modal shows the line (tab › modals › groups › "name" kind · stamp · size) with Copy / Pick again. PA1–PA4. Frontend only: no server, no migration.
- **Verdict:** [NEW rows] `frontend/src/components/PointAtButton.tsx` (the device switch store, the arm signal, the 🎯 button), `frontend/src/components/PointAt.tsx` (PointAtLayer: floating 🎯, armed state, the bar portalled into the topmost open dialog, capture listeners while armed, the result Modal), `frontend/src/point-line.ts` (describeTap DOM walk → pieces; pure pointLine, tested by test/point-at.test.ts PA1 through a dynamic import). [EXISTING] Modal.tsx gets `<PointAtButton/>` in its header; App.tsx Shell renders `<PointAtLayer tab=…/>` once, the label built from NAV; SettingsMe.tsx gets the switch row and a widened map row. No reorganizer, no CEILINGS change.
- **Flow stage:** render and capture intent (PWA only); point-line.ts is the PWA's own naming rule.
- **Why:** One PointAt.tsx was rejected twice over: Modal (23 importers) would import it while it imports Modal for the result, an import cycle through the PWA's busiest hub (a leaf PointAtButton.tsx breaks it); and it would bundle capturing the tap with naming it, the rule PA1 tests, which gets a non-React file. state.tsx was rejected for the switch: Modal also renders outside AppProvider, and the setting belongs to the browser, not the account. src/shared/ was rejected because the Worker never uses the rule. The tab label is passed from NAV, not read back from the nav's aria-current. The armed flag is React state in the layer; the only module-level values are `const`.
- **Caps:** Modal.tsx 62 → 64/300; App.tsx 167 → 169/300; SettingsMe.tsx 31 → 37/300; new PointAtButton ~30, PointAt ~70, point-line ~95, all /300. Nothing in the band.

---

## 2026-10-11 — v1.51.1: FunHouse tick founder-only, default on for him (placement-advisor)

- **Ask:** SPEC 2.84 §9.4b Q230 (decided by MojoSOGO 2026-10-11): only the founder sees the 🎪 FunHouse tick; his new alerts and Announce box open with it ticked; nobody else sees it unless the alert they open already has it. Server unchanged. FH8 (flagsOf).
- **Verdict:** [EXISTING] frontend/src/components/AlertFields.tsx (`flagsOf(channels?, funhouseByDefault = false)`, ChannelChecks hides the chip unless founder or already ticked) + frontend/src/state.tsx (`useIsFounder()`); callers Alarms, Timers, ChoreForm, ThingForm, Announce, ReminderFields (`reminderOf(r, founder)`), EventForm (`blank(date, founder)` at both call sites).
- **Flow stage:** render
- **Why:** founder status is cross-cutting identity, so the hook lives in state.tsx (home of Me/Member/memberById), not in the channel-fields file; the default and chip visibility stay with AlertFields' channel-checkbox concern. A stored channel list always wins over the new default.
- **Caps:** AlertFields ~92/300, state.tsx ~106/300, EventForm 196/223 (band 201 not entered). Nothing newly in the band.

---

## 2026-10-11 — v1.51.0: FunHouse as an alert destination, channel 'funhouse' (placement-advisor)

- **Ask:** SPEC §9.4b (v1.51.0, SPEC 2.83), schema §4.2zo (migration 0042), asked by MojoSOGO ("Add funhouse as reachable location for alerts"). A third channel 🎪 FunHouse beside Phone and House on every ticked alert (event reminders and alarms, timers and their start announcement, chores, things, Announce); one row per alert (member_id NULL, title = pushTitle), listed by GET /ops/pings with `channel`, marked sent on listing, forwarded by the PC poller with source 'Ensō'. It follows the phone's rules: away stops it, quiet and phone first do not, an optional event needs a non-empty audience. Machines keep MACHINE_CHANNELS.
- **Verdict:** [EXISTING] everywhere: vocab.ts CHANNEL; optins.ts audience().funhouse (the house expression); migration 0042 (0012-style rebuild, every current column and index); deliveries.ts funhouseDelivery (title derived from pushTitle) and opsPingsAfter (FOUNDER_PING OR funhouse, with channel, no status filter; opsPingsSince unchanged); tick.ts step 2, timer-starts.ts and routes/announce.ts write the row (announce's house_quiet only when House is the sole channel); routes/ops.ts a file-local mark-sent UPDATE (deliveries.ts keeps "never updates a status"); home/funhouse-poller.ts forFunhouse(ping) and the source; AlertFields.tsx the 🎪 tick, channelsOf/flagsOf over CHANNEL, one Record<Channel> icon table also used by SettingsStatus.tsx; the six forms swap to the helpers. No new row, no reorganizer, no CEILINGS change.
- **Flow stage:** rules (vocab, optins); persist (migration, deliveries, tick, timer-starts, announce, ops mark-sent); deliver (home poller); render (AlertFields, the forms, SettingsStatus).
- **Why:** FunHouse fits the House shape (one row per alert, no member), so each stage's owner extends it. The title is derived inside the writer so it cannot drift from the phone. The hourly count stays on FOUNDER_PING. The list must not filter on status: the poller sends one a poll on an `after` cursor, so a row marked sent before it is forwarded has to stay listable. Rejected: a new src/worker/funhouse.ts (an empty shell); a generic channel-row writer (push needs a member, house speakers); the flags mapping in each form (six copies today).
- **Caps:** tick.ts 118 → 120/148; EventForm.tsx net-zero (195/223); deliveries.ts 56 → ~70/300; routes/ops.ts ~77/300; announce.ts ~74/300; AlertFields.tsx ~85/300. arch:audit quiet.

---

## 2026-10-11 — Steward pass 14, whole tree (code-steward)

- **Run:** after the v1.50.0 release (SPEC 2.82 §9.4a, GET /ops/pings + home/funhouse-poller.ts, PR #50), with v1.49.2 (PR #49); audited 3b9b2cb against 2542f2c.
- **Verdict:** SOUND. Typecheck green, 770/770 tests (100 files), arch:audit quiet (engine.ts 86%, tick.ts 118/148).
- **Placement audit:** 2 receipts checked against 2 code commits (973c28b, df9b2ef); each landed as its verdict said (opsGate file-local in ops.ts, FOUNDER_PING shared in deliveries.ts, new home/funhouse-poller.ts row, home/ LAYERS gains node:fs). 0 code commits without a receipt.
- **Top finding:** test/roles-api.test.ts A9 does about 44 sequential Worker round trips under the default 5 s timeout and timed out twice under full parallel load during the v1.50.0 deploy (passes alone and with --maxWorkers=4). Give it an explicit 30_000 timeout or split it in two; no global testTimeout.
- **Handoffs:** 2 to worker, waiting on MojoSOGO's pick (A9 timeout; the tick.ts map row still says only the house row is skipped for an away fire, but since v1.49.2 push rows are too). Still open, all LOW: pass 11's two §7D notes, pass 10's house-row helper note, the snooze-keeps-away test.
- **Restraint:** the poller's `Ping` type repeats deliveries.ts `OpsPing` across the home/ boundary (an HTTP contract, guarded by tests); the FOUNDER_PING TS mirror in alertSource is documented; opsGate stays file-local; the same-millisecond `created_at > after` case is negligible at a few pings an hour; the hard-coded poller URLs follow the spec.

---

## 2026-10-11 — The same pings on the FunHouse: GET /ops/pings + home poller (placement-advisor)

- **Ask:** SPEC §9.4a (v1.50.0, SPEC 2.82) and the API row `GET /ops/pings?after=`, asked by MojoSOGO ("also not msg funhouse; that best"). The read route lists the founder pings of the last hour after `after`, with the same bearer as `/ops/notify`; the home-side `home/funhouse-poller.ts` (+ `.cmd`, built by `npm run build:home`) polls it and POSTs Claude's pings (🤖 / 🧵) to the FunHouse bridge at 127.0.0.1:8765, at most one per poll.
- **Verdict:** [EXISTING] `src/worker/routes/ops.ts` — the GET handler; the 503/401 check becomes one file-local guard shared with POST; `after` parsed and normalised with toISOString in the route. [EXISTING] `src/worker/deliveries.ts` — `opsPingsAfter` beside `opsPingsSince`, both over one file-local founder-ping predicate. [NEW row] `home/funhouse-poller.ts` — pure forFunhouse / funhouseNotice, pollOnce with injected fetch and token, `main` the only node:fs user. The Home table heading loses "SogoAI". `scripts/arch.ts` home/ LAYERS: `package:node:fs` allowed, `why` updated; `build:home` bundles both entries to home/dist.
- **Flow stage:** route + persist-read (Worker); deliver (home poller).
- **Why:** ops.ts already owns the ops token door and deliveries.ts "what is a founder ping"; a second copy of that WHERE clause would let the §9.4 hourly count and the §9.4a list drift, so the predicate is shared. The poller is an outbound poller, not SogoAI's inbound server, so a leaf module rather than a second concern in captions-helper.ts. `src/shared/ops.ts` rejected for the bridge helpers (one consumer; the spec keeps the poller to its own file). node:fs is allowed for all of home/; the owner row records the poller as its only user. No module-level `let`.
- **Caps:** routes/ops.ts 52 → ~70/300; deliveries.ts 45 → ~60/300; home/funhouse-poller.ts new, ~90/300. Nothing in the band; no CEILINGS change.

---

## 2026-10-11 — Steward pass 13, whole tree (code-steward)

- **Run:** after the v1.49.0 release (SPEC 2.79 §8.6 Settings as a menu of buttons, Q226–Q227, PR #46) and the v1.49.1 patch (PR #48); audited 2542f2c against 507a0ef.
- **Verdict:** SOUND. Typecheck green, 765/765 tests (99 files), arch:audit quiet (nearest at 87%: EventForm.tsx, Calendar.tsx, routes/recipes.ts; tick.ts 117/148; Settings.tsx 59/99 after its re-pin).
- **Placement audit:** 3 receipts checked against 3 code commits (0eb8538 reorganizer split, baa23fd feature, 7d79079 patch); each landed as its verdict said. 0 code commits without a receipt. The map rows for Settings, SettingsMe / Household / Members / Status, PickGrid, ListPicker and App match their files.
- **Top finding:** none. Settings.tsx is a menu that holds only which area is open, each Settings* file is one area, and PickGrid has two real callers (ListPicker, Settings) plus PickFace for the Lists button.
- **Handoffs:** none new. Still open, all LOW, each for its area's next touch: pass 11's two §7D notes (machinesView alertId null for an inactive member; the stale "default speakers" comment in fire-rows.ts), pass 10's house-row helper note, and the snooze-keeps-away test.
- **Restraint:** the App.tsx banner texts that name Settings areas are left as prose (no shared label import). Settings*'s use of Lists.module.css is its documented shared role. The small Settings* files are areas, not fragments. PickGrid's extra / chosen options are moved Lists behavior. No frontend component tests for SM1–SM3, per project convention (SM4 is manual and listed as owed).

## 2026-10-11 — v1.49.2: Away silences phones too; tick skips push rows for an away fire (placement-advisor)

- **Ask:** SPEC §9.2c (SPEC 2.81), MojoSOGO picked ALL: while fires.away_by is set, tick step 2 writes no push row as well as no house row. The alert still steps.
- **Verdict:** `src/worker/tick.ts` [EXISTING]. Comment-only edits in `src/worker/routes/alerts.ts` and `frontend/src/state.tsx`. Tests in `test/fire-away-api.test.ts` (AW2/AW4).
- **Flow stage:** persist (which delivery rows a fire's alert writes).
- **Why:** tick.ts step 2 is the only place that plans a fire's alert deliveries (other pushDelivery callers are announce, ops, phone-login, mess-asks, timer-starts, none per-fire). The away gate already sits there for speakers, so one condition on the push block keeps both gates together. A src/shared/ rule was rejected: a gate on a stored column, not a decision the PWA shares.
- **Caps:** tick.ts 118/148, not in the band. routes/alerts.ts 211/300, state.tsx 101/300 (comments only). No reorganizer.

## 2026-10-11 — v1.49.1: drop alertUrl, pin sw.js `?alert=` in MA8; deliveries row notes the alertSource mirror (placement-advisor)

- **Ask:** patch, no behavior change; steward pass 12's two LOW handoffs (SPEC §9.5), picked by MojoSOGO ("NOW"). (1) Delete the unused `alertUrl` from src/shared/alert-history.ts, its MA1 lines, map row mention and §9.5 line; extend MA8 to pin `${ALERTS_PATH}?alert=` in sw.js. (2) The deliveries.ts map row notes that alertSource mirrors the opsPingsSince ping rule.
- **Verdict:** src/shared/alert-history.ts (delete), test/my-alerts.test.ts (MA1 trim, MA8 extend), docs/module-ownership.md, SPEC.md §9.5 [EXISTING]. No sw.js change.
- **Flow stage:** rules (alert-history.ts, removal only); the rest is tests and docs.
- **Why:** alertUrl's only caller was MA1; sw.js builds the tap URL from its own ALERTS_PATH copy, so the helper restated a rule nothing checked against the shipping code (§0.5). Pinning the raw sw.js text guards the real path. The deliveries row note makes the SQL/TS mirror visible without a shared predicate (pass 12 declined one).
- **Caps:** alert-history.ts shrinks; test/my-alerts.test.ts ~115. Nothing in the band; no reorganizer.

## 2026-10-11 — Settings as a menu of buttons (placement-advisor)

- **Ask:** SPEC §8.6 (v1.49.0, SPEC 2.79), asked by MojoSOGO: "clean up settings similar to lists". The Settings tab becomes a grid of buttons in the Lists-popup style: 🙂 Me, 📅 Calendar items, 📱 Phone alerts, 🔊 Speakers, 🔔 Alerts, 🏠 Household, 👥 Members, 📊 Status, with Log out under the grid. A tap opens that area in the shared Modal; ✕, Escape or the backdrop returns to the menu; the Alerts notification tap opens Alerts directly. Layout and navigation only.
- **Verdict:**
  - [REORGANIZER FIRST, after the Alerts thread merged] the Me name/color, Household, Members and Status sections move out of Settings.tsx into SettingsMe / SettingsHousehold / SettingsMembers / SettingsStatus [NEW rows]; the pick grid moves out of HouseholdLists.module.css into PickGrid.tsx + PickGrid.module.css [NEW row]. Done, entry below.
  - [EXISTING] frontend/src/components/Settings.tsx: the menu (PickGrid), the open area in Modal, the deep-link prop, Log out. Re-pinned at its final size (59) + WORKING_BUFFER.
  - [EXISTING] frontend/src/App.tsx: the two banner texts name the new areas.
  - OptionalItems, PhoneAlerts, HouseSpeakers, Invites, MyAlerts reused unchanged except for their path wording; SettingsMembers drops its "Members" heading (the Modal titles it).
- **Flow stage:** render only. No route, rule, persist or delivery change.
- **Why:** choosing which area is open is Settings' own concern (fan-in 1); a separate SettingsMenu.tsx would leave an empty shell. Importing the Lists stylesheet from Settings, or copying it, was rejected for PickGrid. Area ids stay client-local like NAV.
- **Caps:** Settings.tsx 41 → 59/99; PickGrid ~35/300; App.tsx unchanged in size. Nothing in the band.

## 2026-10-11 — Split Settings into its areas, shared PickGrid (reorganizer, ahead of v1.49.0)

- **Trigger:** placement-advisor verdict REORGANIZER FIRST for v1.49.0: Settings.tsx (180/207, Me + Household + Members + Status in one file) is the owner the next Settings change lands near, and the Lists popup grid is about to gain a second user in Settings.
- **Seam moved:**
  - Me's display name + color controls from `frontend/src/components/Settings.tsx` to `SettingsMe.tsx` [NEW row].
  - Household's name / time zone form + DaysOff to `SettingsHousehold.tsx` [NEW row].
  - The members table (setAdmin and its asks, Disable / Enable) + Invites to `SettingsMembers.tsx` [NEW row].
  - StatusSection, HouseLine, STATUS_BADGE to `SettingsStatus.tsx` [NEW row].
  - (Done by the coordinating session, reviewed here) the pick grid styles from `HouseholdLists.module.css` to `PickGrid.tsx` + `PickGrid.module.css` [NEW row]; ListPicker renders PickGrid, the Lists button renders PickFace.
- **Room opened:** Settings.tsx: 180 → 41 lines; cap 207 → 81 (41 + WORKING_BUFFER). New files 31–53 lines, all under 300.
- **Behavior:** preserved; typecheck, npm test and arch:audit green. Settings.tsx keeps the Section wrapper and composes the same sections, headings (h3 Days off, Members) and controls in the same order. It shows Status only once status has loaded, as before. The requests are unchanged (PATCH /me, PATCH /settings, PATCH /members/{id}, POST /auth/logout, GET /settings). PickGrid has byte-identical CSS rules, aria-pressed still boolean on list entries and absent on ＋ New list…, and the Lists button still truncates (the two-line wrap applies only inside the grid). One deliberate difference: each area has its own useAction, so a failed name / color save now shows its error above the Display name field (it used to show at the top of Me), and a failed members action shows under the Members heading (it used to show at the top of Household). Nothing changes on screen when no action fails.
- **Restraint:** one file per area the advisor named, no new abstraction. MyAlerts, OptionalItems, PhoneAlerts and HouseSpeakers are untouched, and so are the h3 headings and Section. No pick grid in Settings yet; that is the feature's work.

## 2026-10-11 — Steward pass 12, whole tree (code-steward)

- **Run:** after the v1.48.0 release (SPEC 2.77 §9.5 My alerts, migration 0041, PR #44); audited e8c9471 against c19bd94.
- **Verdict:** SOUND. Typecheck green, 765/765 tests (99 files), arch:audit quiet (nearest at 87%: EventForm.tsx, Calendar.tsx, Settings.tsx 180/207, routes/recipes.ts; tick.ts 117/148).
- **Placement audit:** 1 receipt reconciled against 1 code commit (d5de762); it landed as its verdict said (the navigate-not-postMessage change is recorded in "Built as"). 0 code commits without a receipt.
- **Top finding (LOW):** alert-history.ts alertUrl has no production caller (only MA1); sw.js builds the same URL from its own ALERTS_PATH copy. On the next §9.5 touch, delete alertUrl or pin the `?alert=` shape in MA8.
- **Handoffs:** 2 to worker, both LOW: the alertUrl note above, and the deliveries.ts map row ("the one predicate" for a ping → note that alertSource mirrors opsPingsSince; docs only). 0 to reorganizer, 0 to placement-advisor. Pass 11's two §7D notes, pass 10's house-row helper note and the snooze-keeps-away test are still open.
- **Restraint:** the "has a fire" test repeated in push.ts and my-alerts.ts is accepted (one line, commented). No shared ping predicate across SQL and TS. useAlertLink kept in MyAlerts.tsx. The old migration tests gaining dismissed_at is the whole-row check working, not shotgun surgery. No hotspot pressure: tick.ts was untouched this release.

## 2026-10-11 — My alerts: push history in Settings, a push tap opens its card (placement-advisor)

- **Ask:** SPEC §9.5 (v1.48.0, SPEC 2.77; migration 0041, §4.2zn). Settings gains an Alerts section with my newest 200 push deliveries I haven't hidden; a tap opens a card (title as the phone showed it, whole message, time, source, alert number, phone result); ❌ hides one, Clear all hides all of mine; tapping a phone notification opens Settings → Alerts on its card. Rows are kept, so Status and the ops hourly limit still count them.
- **Verdict:**
  - [NEW row] src/shared/alert-history.ts: ALERT_HISTORY_MAX, PUSH_TITLE moved from push.ts, pushTitle, alertSource, ALERTS_PATH / alertUrl / alertIdFrom. Pure; imports vocab and announce.
  - [NEW row] src/worker/routes/my-alerts.ts: GET /me/alerts, DELETE /me/alerts/{id}, DELETE /me/alerts; the only reader and writer of dismissed_at. Mounted in index.ts.
  - [EXISTING] src/worker/push.ts: payload gains alertId; title via pushTitle.
  - [EXISTING] frontend/public/sw.js: an alertId tap opens `/settings/alerts?alert={id}`; a sign-in url still wins.
  - [NEW row] frontend/src/components/MyAlerts.tsx: list, ❌, Clear all, card in Modal; exports useAlertLink.
  - [EXISTING] Settings.tsx and App.tsx: wiring only.
  - Migration 0041 (deliveries.dismissed_at + idx_deliveries_member) with test/migration-0041.test.ts.
- **Flow stage:** rules (alert-history.ts) / route + persist (routes/my-alerts.ts, 0041) / deliver (push.ts payload, sw.js tap) / render (MyAlerts.tsx; Settings and App wiring).
- **Why:** describing a past push to its recipient is a new concern; one pure leaf holds the title rule so the card shows exactly what the phone showed (§0.5). routes/household.ts was rejected on concern count; this follows the house-quiet / announce / ops one-feature route grain. dismissed_at is read only by my-alerts.ts, so Status, the ops limit and mess asks are unchanged.
- **Built as:** the advisor suggested the service worker postMessage an open window first; the build navigates the window instead (the sign-in request's existing openAt), because AppRefresh reloads a resumed app and would drop a message-opened card. The spec gaps it flagged are settled in §9.5 / §13 as Q221–Q225 ⚑. MA8 reads sw.js through a SW_JS test binding (the pool has no fs).
- **Caps:** Settings.tsx 177 → 180/207 (band 186.3, not entered); App.tsx 163 → 166/300; push.ts ~108/300; index.ts 95/300; new alert-history.ts, routes/my-alerts.ts and MyAlerts.tsx all well under 300. No reorganizer.

## 2026-10-11 — Steward pass 11, whole tree (code-steward)

- **Run:** after the v1.47.0 release (SPEC 2.76 §7D.7, Alert when done, migration 0040, PR #42) and the reorganizer extract of src/shared/machine-hours.ts. Audited e9fdb33 against f241cc3.
- **Verdict:** SOUND. Typecheck green, 758/758 tests (97 files), arch:audit quiet (nearest: EventForm.tsx, Calendar.tsx and routes/recipes.ts at 87%; machines.ts 228/300; tick.ts 117/148).
- **Placement audit:** 2 receipts checked against 2 code commits (1843aa9, e9fdb33); each landed as its verdict said. 0 code commits without a receipt.
- **Top finding (LOW):** the machine card names the alert person through memberById, which includes disabled members, while the server treats a disabled alert person as nobody (Q219). Fix with §7D's next change: machinesView returns alertId null for an inactive member.
- **Handoffs:** 2 to worker, both LOW, for the next §7D touch: the machinesView alertId fix, and the stale "default speakers" comment in fire-rows.ts sourceOf. Pass 10's house-row-helper note stands; the snooze-keeps-away test is still owed; migration-0040.test.ts already compares whole rows.
- **Restraint:** machines.ts kept whole (cohesive; its next seam, the body parsers, is named but not owed). The active-member check stays in fire-rows.ts (needs a D1 read).

## 2026-10-11 — Alert when done on machine loads (placement-advisor)

- **Ask:** SPEC §7D.7 (v1.47.0, SPEC 2.76; migration 0040, §4.2zm). Each machine load has an optional alert person, `machines.alert_id`: absent → the owner, null → nobody, else an active member. With nobody the fire goes to phones only; with someone it is today's Phone + House on every speaker. MachineChooser gains an "Alert when done" chip group, and the card shows who is alerted.
- **Verdict:**
  - [REORGANIZER FIRST] Extract the §7D.5 alert hours from src/shared/machines.ts to src/shared/machine-hours.ts [NEW row] (done, entry above).
  - [EXISTING] src/shared/machines.ts: MachineRow.alert_id, the transitions carry or clear it, parseStart and parseDoneNow take alertId, machineAlert(quietUntil, alertId) gives push-only channels when null.
  - [EXISTING] src/worker/fire-rows.ts: sourceOf resolves alert_id to an active member.
  - [EXISTING] src/worker/routes/machines.ts: passes alertId through, writes alert_id in machineWrites, returns alertId in the view.
  - [EXISTING] frontend/src/components/Machines.tsx: the chooser chips and the card line.
  - Migration 0040 with test/migration-0040.test.ts.
- **Flow stage:** rules (machines.ts) / route + persist (routes/machines.ts, 0040) / source of the fire's channels (fire-rows.ts sourceOf) / render (Machines.tsx). Delivery is unchanged; tick.ts untouched (step 2 already writes no house row when the channels leave House out).
- **Why:** who is alerted is an attribute of the load and of its fire's channels, so it belongs to the existing §7D owners. One function (machineAlert) holds the "nobody → phones only" choice.
- **Built as:** the AL1–AL6 tests live in their own file, test/machine-alert.test.ts, beside test/machines.test.ts (517 lines). Spec gaps the advisor flagged are settled in §7D.7 / §13 as Q217–Q220 ⚑.
- **Caps:** machines.ts 204 → ~226/300; fire-rows.ts ~152/300; routes/machines.ts ~141/300; Machines.tsx 168/300. Nothing in the band.

## 2026-10-11 — Machine alert hours out of machines.ts (reorganizer)

- **Trigger:** placement-advisor extract-first verdict for v1.47.0 "Alert when done" (machines), which adds to src/shared/machines.ts; the standing machine-hours note from steward pass 8.
- **Seam moved:** the §7D.5 alert hours (DayHours / MachineHours, DEFAULT_MACHINE_HOURS, hoursOn, machineQuietUntil, machineHoursOf, parseMachineHours) from `src/shared/machines.ts` to `src/shared/machine-hours.ts` [NEW row]. Callers re-pointed: src/worker/fire-rows.ts, src/worker/routes/machines.ts, frontend/src/components/MachineHours.tsx, test/machines.test.ts. No re-export.
- **Room opened:** machines.ts: 246 → 204 lines; global cap 300 (no pin, nothing to ratchet). machine-hours.ts new, 45/300.
- **Behavior:** preserved. Typecheck green, 750/750 tests (95 files), arch:audit quiet. The moved code is byte-for-byte the same; L19 and parseMachineHours tests and GET/PATCH /machines/hours pass unchanged.
- **Restraint:** one seam, the one the advisor named. The transitions, the done message and machineAlert stay in machines.ts, and nothing was split for the feature itself.

## 2026-10-11 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.45.0 (SPEC 2.74 §9.2b, Quiet the house, migration 0038, PR #39) and v1.46.0 (SPEC 2.75 §9.2c–9.2d, I'm away on one alert and phone first, migration 0039, PR #40) releases; audited 57b4dba against dd9f2d5.
- **Verdict:** SOUND. Typecheck green, 750/750 tests (95 files), arch:audit quiet (nearest: EventForm.tsx, Calendar.tsx, routes/recipes.ts at 87%; tick.ts 117/148).
- **Placement audit:** 3 receipts reconciled against 2 code commits (3de38f8, 57b4dba). Each landed as its verdict said; 0 code commits without a receipt.
- **Top finding:** the house-row check is now written out by hand in three writers (tick step 2, timer-starts.ts, POST /announce), and tick.ts:91 carries four conditions on the highest-churn file. Standing extract-first note: the next change to whether a house row is written first adds one helper beside deliverySpeakers that all three writers call.
- **Handoffs:** 1 standing note to placement-advisor (the house-row helper, reorganizer if extract-first); 3 to worker (speaker-choices.ts map row "two writers" → three and the where-things-stand date — done with this receipt; a snooze-keeps-away test; migration tests comparing only `before` keys, with the next fires/deliveries migration). 0 to reorganizer now.
- **Restraint:** phone-first.ts (9 lines, one caller) and worker/house-quiet.ts (15 lines, four callers) kept as their own rows, not classitis; no merge with machineQuietUntil (delay vs skip); fireViews' SQL fragment and the one-tick Away race accepted; no early tick.ts split; earlier standing notes (machine-hours, DayCell, WhenFields, alertMessage options) carried, not re-raised.

## 2026-10-11 — Phone first, then the house (placement-advisor)

- **Ask:** SPEC §9.2d (PF1–PF3; ⚑ Q215–Q216). Every fire kind with both Phone and House ticked that will alert again sends alert 1 to phones only; the speakers join from alert 2. House-only alerts and fires that won't alert again are spoken from the first. Fire-less house rows (§5.5a, §9.3) are unchanged.
- **Verdict:** [NEW row] src/shared/phone-first.ts (speaksOnHouse(alertNumber, cfg), pure, type-only import of engine's AlertConfig); [EXISTING] src/worker/tick.ts step 2 (one more term in the house condition, beside §9.2b quiet and §9.2c away, before the speaker lookup). Tests: test/phone-first.test.ts (PF1), test/phone-first-tick.test.ts (PF2–PF3).
- **Flow stage:** rules (phone-first.ts) / gate at the persist step (tick step 2).
- **Why:** a delivery-channel rule, so it lives in src/shared. engine.ts rejected (258/300, the biggest hub, never needs it); speakers.ts (which speakers) and optins.ts audience() (§7.5) rejected (each would gain an "…and also…"). A small leaf with fan-in 1 follows the timer-start.ts precedent. Evaluated before the speaker lookup, so phone-first alerts make zero HA calls. Flagged a spec conflict (AW3, and older tick tests expecting a house row on alert 1 of a repeating Phone + House fire): resolved in SPEC first (§9.2c AW3 wording, the §9.2d note naming G5, T1–T10, L3–L5, L15, HS11).
- **Caps:** phone-first.ts new, ~10/300; tick.ts 116 → 118/148 (band 133). engine.ts untouched. Nothing newly in the band; no re-pin; no reorganizer.

## 2026-10-11 — I'm away on one alert (placement-advisor)

- **Ask:** SPEC §9.2c (with §4.2zl migration 0039, the §10 rows POST /fires/{id}/away and GET /fires `awayBy`, §8.2 Ringing bar; AW1–AW4, AW-M; ⚑ Q213–Q214). A member says "I've seen it, I'm not home" on one open fire. Tick writes no house row for its alerts; push carries on; the fire stays open until closed, and the fire that replaces it starts without it.
- **Verdict:** [EXISTING] src/worker/routes/alerts.ts (POST /fires/:id/away beside /actions; GET /fires and the away answer through one file-local fireViews; `f.away_by AS awayBy`); src/worker/tick.ts (step 2: `fire.away_by` joins `quiet` in the existing speakers condition, read through a local `FireRow & { away_by }` row type); frontend/src/state.tsx (Fire.awayBy); frontend/src/components/RingingBar.tsx (Away button, "· away (name)"). Migration 0039 with test/migration-0039.test.ts; test/fire-away-api.test.ts. Row amendments to alerts.ts, tick.ts, RingingBar.tsx; no new rows.
- **Flow stage:** route + persist (alerts.ts, 0039) / gate at the one persister of fire house rows (tick step 2) / render (RingingBar.tsx).
- **Why:** Away is a member's action on a fire, so alerts.ts ("fires + actions"). Kept out of engine.ts (never reads the flag; 86%, highest fan-in); updateFire and insertFire list their columns, so the flag survives snooze and a racing tick and is NULL on every replacement fire (Q214) with no code. The POST answers through the same helper as GET /fires so the two cannot drift; it returns the caller's own fire even when §7.5 would hide it from their list.
- **Caps:** alerts.ts 192 → ~205/300; tick.ts → 118/148; RingingBar.tsx 76 → 78/300; state.tsx +2. Nothing newly in the band; no re-pin; no reorganizer.

## 2026-10-10 — Quiet the house (placement-advisor)

- **Ask:** SPEC §9.2b (with §4.2zk migration 0038, the §10 `/house/quiet` row, §8.5; HQ1–HQ6, HQ-M; ⚑ Q209–Q212). Any member can quiet the household's speakers for 1 h / 2 h / 4 h / rest of today. While quiet, no `house` row is written by tick step 2, timer start announcements or POST /announce (House only → 409 `house_quiet`); phones carry on unchanged.
- **Verdict:** [EXISTING] src/shared/vocab.ts (HOUSE_QUIET_FOR); src/worker/tick.ts, src/worker/timer-starts.ts, src/worker/routes/announce.ts (gate the house row); src/worker/index.ts (mount); frontend/src/components/Alarms.tsx (host). [NEW rows] src/shared/house-quiet.ts (quietEnd / quietState / quietError, pure); src/worker/house-quiet.ts (houseQuiet(db, now) read only); src/worker/routes/house-quiet.ts (GET/PUT/DELETE, the writes); frontend/src/components/HouseQuiet.tsx. Migration 0038 with its own test.
- **Flow stage:** rules (shared/house-quiet.ts, vocab) / route + persist (routes/house-quiet.ts, 0038) / read gate at the three persisters (tick, timer-starts, announce) / render (HouseQuiet.tsx).
- **Why:**
  - Quiet is a household setting, not a member's speaker choice or a delivery concern. That rules out speaker-choices.ts (per-member, "never writes") and house.ts (delivery "never decides what is sent", and it gates too late).
  - The read is a leaf with fan-in 4. The writes have one caller each, so they stay in the route ("routes validate and persist").
  - The route is its own file, not routes/household.ts, whose row already carries five concerns. This follows the announce / optins / ops one-feature grain.
  - The PWA calls the shared quietState, so the line and the server cannot disagree.
  - Not merged with machines.ts machineQuietUntil (§7D.5 delays; §9.2b skips).
  - Tick reads quiet once before step 2 and puts it into the existing house condition, so no HA call is made while quiet.
- **Caps:** tick.ts 114 → 116/148 (outside the band, no re-pin); timer-starts.ts, announce.ts, index.ts, Alarms.tsx, vocab.ts each gain a few lines, all well under 300. New files are small. Nothing newly in the band; no reorganizer.

## 2026-10-10 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.44.0 release (SPEC 2.73 §8.1, tab bar flush via `.app` position: fixed, build stamp under the tabs via Vite `define` `__ENSO_BUILD__`, new frontend/src/build-stamp.d.ts, PR #37); audited 31e101f against f756118.
- **Verdict:** SOUND
- **Top finding:** docs/where-things-stand.md still said v1.43.0 and did not list the v1.44.0 iPhone check (flush bar, stamp visible, ⚑ Q208); fixed in the same commit as this receipt.
- **Handoffs:** 1 to worker (the where-things-stand update, done); 0 new to reorganizer (pass 8's machine-hours extract-first note still stands); none to placement-advisor.
- **Restraint:** the 2-line build-stamp.d.ts is kept as its own row (one concern; folding it into css-modules.d.ts was rejected); no test for the stamp text (a build constant, low risk); engine.ts and Settings.tsx at 86% are below the band and this release did not touch them.

---

## 2026-10-10 — Tab bar flush on iPhone; build stamp under the tabs (placement-advisor)

- **Ask:** SPEC 2.73 §8.1 (v1.44.0). The app shell fills the screen (`.app` position: fixed; inset: 0 instead of height: 100%, which left a gap in iOS standalone with black-translucent), and the build stamp `v{version} · {commit}` shows all the time as tiny dim text in the tab bar's bottom safe-area strip (left, under the tabs, never overlapping), exposed through Vite `define` as `__ENSO_BUILD__`.
- **Verdict:** [EXISTING] frontend/src/App.module.css (`.app`, `.tabs` position: relative, `.build`); frontend/src/App.tsx (one stamp element in the Shell's `<nav>`); frontend/vite.config.ts (buildStamp() called once into a const that feeds both transformIndexHtml and `define`). [NEW row] frontend/src/build-stamp.d.ts (`declare const __ENSO_BUILD__: string`).
- **Flow stage:** render (plus build tooling, which is not scanned).
- **Why:** the frame belongs to App.tsx and App.module.css. buildStamp() stays the one maker of the stamp, so the splash and the tab bar cannot disagree. The value is a build constant, so it does not go in state.tsx. Rejected: adding the declaration to css-modules.d.ts (a second concern for its row); fetching the version from the Worker (a second source for the same value); a plain grid child in `.tabs` (it would become a 7th column). Zero-inset screens: the strip is at least 14 px (⚑ Q208).
- **Caps:** App.tsx 162 → 163/300; App.module.css 38 → 46/300; build-stamp.d.ts 2/300 (new); vite.config.ts outside the scanned roots. No ceiling moved, nothing newly in the band, no reorganizer.

---

## 2026-10-10 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.42.0 (SPEC 2.71 §7D.6, dish washer and Clothes washer/dryer rename, migration 0037, PR #34) and v1.43.0 (SPEC 2.72 §7D.2–7D.3, Owner unknown on Done now, PR #35) releases; audited 55613b9 (= 00598da's code) against 494afb2.
- **Verdict:** SOUND
- **Top finding:** SPEC §7D.6 still said Done now preselects "me" for the dish washer; fixed with this report (Done now preselects Owner unknown; an unowned card reads "started by owner unknown").
- **Handoffs:** 1 standing note to reorganizer (machines.ts 246/300: the §7D.5 alert-hours block → src/shared/machine-hours.ts, extract-first on the next §7D change). Report: `docs/steward/2026-10-10-eighth-pass.md`.
- **Restraint:** no early machine-hours seam (24 lines of headroom, no feature waiting); MojoSOGO's verbatim "dryer" text, the laundry-only Fold & out refusal and the route's null-`to` refusal path left as they are.

## 2026-10-10 — Owner-unknown laundry loads on Done now (placement-advisor)

- **Ask:** SPEC 2.72 §7D.2–7D.3 (v1.43.0, no migration; UK1–UK2). Done now on a free machine no longer assumes an owner: the load runs with owner_id NULL (free is derived from done_at), alerts say "Clothes washer finished; Owner unknown; Please cycle to dryer" / "Clothes dryer finished: Owner unknown: Please unload"; the chooser preselects Owner unknown; card and Ringing bar say "owner unknown". Also the washer's 45 min chip is dropped.
- **Verdict:** [EXISTING] src/shared/machines.ts (machineState, loaded/doneNowMachine/moveMachine with a null owner, parseDoneNow, doneMessage undefined = unknown, washer minutes); src/worker/fire-rows.ts (sourceOf passes undefined for a null owner_id); Machines.tsx (chooser default, card text); RingingBar.tsx (machine person label).
- **Flow stage:** rules (machines.ts); source (fire-rows.ts sourceOf); render (Machines.tsx, RingingBar.tsx).
- **Why:** what counts as free and what the done message says are machines.ts rules already; an unowned load reuses the machines row, so no new shape or migration. undefined (unknown) stays distinct from null (inactive owner), so the existing wording survives. Rejected: wording in fire-rows or the PWA; vocab.ts.
- **Caps:** machines.ts ~250/300, fire-rows.ts ~152/300; nothing newly in the band; no reorganizer.

## 2026-10-10 — Dish washer joins the machines; laundry labels renamed (placement-advisor)

- **Ask:** SPEC 2.71 §7D.6 (v1.42.0, migration 0037, §4.2zj; §8.5, §8.2; DW1–DW4, DW-M; ⚑ Q204–Q207). Washer/Dryer are labelled Clothes washer/Clothes dryer (ids unchanged); the washer gains a 120-min chip. A third machine `dishwasher` ("Dish washer") with Start / Done now / Still loaded / Clear, no Move, Emptied as its finish; chips 60/90/120/150; owner_id = who started it ("started by Sam"); done message "The dish washer Sam started is done".
- **Verdict:** [EXISTING] owners, no new module or column. src/shared/machines.ts: LAUNDRY + isLaundry, machineMinutes, finishLabel, the dish-washer arm of doneMessage, parseStart/parseMove by machine, refusal wording. src/shared/vocab.ts: MACHINE gains 'dishwasher' (card order). src/worker/routes/machines.ts passes the machine to the parsers. Machines.tsx and RingingBar.tsx render via the shared helpers. migrations/0037_dishwasher.sql + test/migration-0037.test.ts.
- **Flow stage:** rules (machines.ts, vocab) / route + persist (routes/machines.ts, 0037) / render (Machines.tsx, RingingBar.tsx). Delivery unchanged (fire-rows sourceOf keeps doneMessage's signature).
- **Why:** the dish washer has a machine's shape, so it extends the §7D owner (wu wei). Splitting card order (vocab MACHINE) from the chain (machines.ts LAUNDRY) gives the dish washer null next/previous, so Move refuses `no_next`, finishMachine accepts it and waitingLoad is null with no special case. Rejected: LAUNDRY in vocab (a rule, not a stored vocabulary); a new column (owner_id already holds a member); a separate dish-washer module or route; the PWA comparing ids for labels.
- **Watch:** machines.ts 232 → 242/300 (band 270). Next growth is extract-first: the §7D.5 alert-hours block → src/shared/machine-hours.ts.
- **Caps:** nothing newly in the band; no reorganizer.

## 2026-10-10 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.41.0 release (SPEC 2.70 §7.11, weather on the calendar, migration 0036, PR #32); audited 6f118ad against 8813b07.
- **Verdict:** SOUND
- **Top finding:** two text leftovers from v1.41.0. SPEC §5.6 step 3d named `src/worker/weather.ts` (the file is weather-days.ts), and env.ts moved OPS_NOTIFY_TOKEN's §9.4 comment onto the WEATHER_URL line. Both fixed right after the pass by the thread that shipped the release.
- **Handoffs:** 1 standing extract-first note for the placement-advisor (Calendar.tsx → DayCell.tsx at the next cell change); carried: 1 to reorganizer (alertMessage options), 2 to worker (read-text wording, notes-limit tidy), EventForm extract-first standing. Report: `docs/steward/2026-10-10-seventh-pass.md`.
- **Restraint:** no early split of Calendar.tsx (2 commits this month, one coherent thing); tick.ts churn accepted (orchestration only, 77% of cap); step 3d's 10 s fetch before house speech accepted (once a day at midnight); WMO table kept out of vocab.ts (display data, ruled by the advisor).

## 2026-10-10 — Weather on the calendar (placement-advisor)

- **Ask:** SPEC 2.70 §7.11 (v1.41.0, migration 0036, §4.2zi; §5.6 step 3d; §8.3; WX1–WX6, WX-M; ⚑ Q200–Q203). Once per household-local day (first tick; a failed try retried at most hourly) the Worker fetches Open-Meteo's 7-day daily forecast (weather_code, high, low °F) for the household place from WEATHER_URL (empty = off). Rows in weather_days(date PK, code, high_f, low_f, fetched_at), plus settings.weather_tried_at. GET /calendar adds `weather: { date, emoji, words, high, low }[]`. The cell shows the emoji in a corner (not the two-icon slot); the day sheet's first line is weatherText.
- **Verdict:** `src/shared/weather.ts` [NEW row] (weatherOf, forecastUrl, parseForecast, weatherDue, weatherText, ForecastDay/WeatherDay). `src/worker/weather-days.ts` [NEW row] (weatherTick as tick step 3d; weatherBetween). [EXISTING]: tick.ts (one step), routes/events.ts (/calendar field), env.ts, wrangler.toml, vitest.config.ts (WEATHER_URL ''), Calendar.tsx + Calendar.module.css (.wx corner), DaySheet.tsx (first line). Schema: migrations/0036_weather.sql.
- **Flow stage:** rules (shared/weather.ts) / persist + fetch (weather-days.ts, tick step 3d) / route (events.ts /calendar) / render (Calendar, DaySheet).
- **Why:** the timer-start.ts / timer-starts.ts pattern: a pure leaf decides and a worker table owner does the I/O as a tick step, so tick.ts and events.ts each grow by about 2 lines and no hub is touched. Three corrections to the coordinating session's proposal: the worker file is weather-days.ts (one name in two layers reads ambiguously; the concern is the table); weatherBetween returns finished wire rows through weatherOf, so the route never learns WMO codes; the day-sheet sentence is weatherText in shared. The claim is a conditional UPDATE of settings.weather_tried_at, so overlapping ticks fetch once. Rejected: the WMO table in vocab.ts (display data, no CHECK, like HOLIDAYS); fetching through page-fetch.ts (owns link readings); widening db.ts or engine.ts; mapping codes in the PWA. Spec gaps sent back and settled in §7.11: no place → off; an unknown code leaves that day out; the aria-label carries the words; no per-member switch (Q203); weather above the holiday lines; nothing on /status.
- **Watch:** Calendar.tsx is about 263/302 with the band at 272. The next calendar-cell change is extract-first: the per-day cell → DayCell.tsx (or buildDays/weekSpans → a calendar-days module).
- **Caps:** shared/weather.ts ~65/300 (new); worker/weather-days.ts ~50/300 (new); tick.ts 111 → 114/148; routes/events.ts 114 → 116/147; Calendar.tsx 258 → ~263/302; DaySheet.tsx 52 → 54/300; env.ts 46 → 47/300. No ceiling moved, nothing newly in the band, no reorganizer.

## 2026-10-10 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.39.0 (SPEC 2.68 §7.9, paste a link) and v1.40.0 (SPEC 2.69 §7.10, things to bring, migration 0035) releases; audited 7bfebba.
- **Verdict:** SOUND. Typecheck green, 722/722 tests (85 files), arch:audit quiet (nearest: EventForm.tsx and routes/recipes.ts at 87%, engine.ts at 86%).
- **Placement audit:** 2 receipts reconciled against 3 commits (3c7598e, merge 18a19ee, 7bfebba), each landed as its verdict said; 0 code commits without a receipt; map rows, §14 and where-things-stand are accurate.
- **Top finding:** alertMessage (engine.ts) has 7 positional params with 1 production caller → an options object that tick fills from Source (reorganizer).
- **Handoffs:** reorganizer (alertMessage options object); worker (read-budget 429/503 wording for text and link after a §7.9 line; the EVENT_NOTES_MAX literal and event-reader's double import, with pass-5 item 2); placement-advisor standing note (EventForm 195/223: the next event-form change is extract-first → WhenFields.tsx). Carried: pass-5 items 1–2, pass-3 items 1 and 3. Report: `docs/steward/2026-10-10-sixth-pass.md`.

## 2026-10-10 — Things to bring on an event and in its reminder (placement-advisor)

- **Ask:** SPEC 2.69 §7.10 (v1.40.0, migration 0035, §4.2zh; §5.7; §8.4; EB1–EB5, EB-M; ⚑ Q198, Q199). An optional `events.bring` list (≤ 20 lines of ≤ 80 characters), cleaned by `cleanBring` and carried on GET/POST/PATCH `/events`. An event reminder appends " — bring: a, b and c" before " (alert n)" on push and house. A Things to bring editor under Address in the event form.
- **Verdict:** `src/shared/bring.ts` [NEW] (cleanBring, bringText); `frontend/src/components/BringField.tsx` [NEW]. [EXISTING]: alert-limits.ts (EVENT_BRING_MAX, EVENT_BRING_ITEM_MAX); engine.ts alertMessage (one optional trailing `bring` param, reminder arm only); fire-rows.ts sourceOf (Source.bring); tick.ts (passes it); event-rows.ts (row, view, parse, insert); routes/events.ts (PATCH UPDATE); EventForm.tsx (field wiring, hosts BringField). Schema: migrations/0035_event_bring.sql.
- **Flow stage:** rules (bring.ts, alert-limits, engine) / route + persist (event-rows, events) / deliver (unchanged; tick's one message reaches push and house) / render (BringField, EventForm).
- **Why:** the limits join EVENT_NOTES_MAX and EVENT_ADDRESS_MAX. The cleaner and the joining are a pure concern shared by Worker and PWA, so they get a leaf rather than widening the limits-only file or the engine hub (255/300). The wording stays in alertMessage, the §5.7 owner; folding it into the title in sourceOf would split the format rule. Alarms and Plan it never pass `bring`, so it stays NULL with no special case; sun-timed events never pass the event routes. BringField is a value/onChange leaf like AddressField, keeping EventForm (pinned 223, band at 201) under the band. RecipeView's andList stays put (bringText's lowering rule makes it a different concern). Spec gaps sent back and settled in §7.10: the add box at 20 lines, cleanBring on Add, maxLength, `/calendar` doesn't carry it.
- **Watch:** alertMessage now has 7 positional params; an options object is steward material.
- **Caps:** bring.ts ~25/300 (new); BringField.tsx ~30/300 (new); engine.ts ~258/300; fire-rows.ts ~150/300; tick.ts 111/148; event-rows.ts ~142/300; routes/events.ts 114/147; EventForm.tsx 195/223. No ceiling moved, nothing newly in the band, no reorganizer.

## 2026-10-09 — Paste a link into an event (placement-advisor)

- **Ask:** SPEC 2.68 §7.9 "A link" (v1.39.0, EA6–EA7, ⚑ Q197). The fill bar's Paste takes text from text/plain, then text/uri-list, then text/html, then readText(). read-text sends a paste that is only a readable link to a new readEventLink (fetchPage, then the look-up with web search and web fetch, then a fill with the event schema and a third `link` prompt wording), with `link_refused` / `link_reading_failed`.
- **Verdict:** `frontend/src/components/EventFillBar.tsx` + `src/worker/event-reader.ts` + `src/worker/routes/event-photos.ts` [EXISTING].
- **Flow stage:** render (clipboard capture) → route (link-only dispatch, error codes) → read (event-reader: page, look-up, fill).
- **Why:** each part matches its owner's single concern. readEventLink mirrors link-reader.ts's pipeline instead of generalizing readLink, following recipe-link-reader.ts: a generalized readLink would take a second concern, make the thing's url rule (Q138) conditional, and become a hub. Every piece it calls already has one home (page-fetch.ts, claude.ts, shared/link-reading.ts). The link-only check stays in the route; readWith takes its refusal/failure codes from a small map instead of a special case; the clipboard text extraction stays private to the component (DOMParser for HTML).
- **Caps:** event-reader.ts 61 → 84/300; event-photos.ts 40 → 50/300; EventFillBar.tsx 76 → 88/300. None pinned, none in the band.

## 2026-10-09 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.37.0 (PR #26, SPEC 2.66 §7.9, migration 0034) and v1.38.0 (PR #27, SPEC 2.67 §7.9a) releases, both live 2026-10-09 (98d5624).
- **Verdict:** MINOR DRIFT. Typecheck green, 710/710 tests (82 files), arch:audit quiet (nearest: routes/recipes.ts and EventForm.tsx, both 87%).
- **Placement audit:** 2 receipts reconciled, both landed as their verdicts said (sizes within 2 lines); 0 code commits without a receipt; map rows and §14 accurate.
- **Top finding:** an address opens by two rules: ThingForm's mapsHref (⚑ Q35, iPhone → Apple, else Google) and AddressField's Apple-always link (⚑ Q193). Plan it still writes a thing's address into the event's Notes now that events have an Address. MojoSOGO decides one rule and the Plan-it fill; then one mapsHref (quick advisor verdict, home AddressField.tsx) and a worker change.
- **Handoffs:** 0 to reorganizer; 3 to worker (maps rule + Plan-it address after MojoSOGO decides; pass-3 items 2 and 4 if picked; the read-text 429/503 wording after a §7.9 line); 1 quick placement-advisor verdict (mapsHref); 1 docs refresh (where-things-stand.md, done in this commit; adding it to CLAUDE.md step 4 is MojoSOGO's call). Pass-3 items 1–4 still owed.
- **Watch:** EventForm.tsx 193/223 has changed in 3 of the last 5 releases. If it reaches the band, the seam is the When block → WhenFields.tsx.
- **Restraint:** READS_PER_DAY left in things.ts; the fill count including the hidden end date (EU1 specifies it); cleanEventReading's `_today`; the 2030 test date.
- **Report:** `docs/steward/2026-10-09-fifth-pass.md`.

## 2026-10-09 — Update an event from later info; one fill bar for 📷 + 📋 (placement-advisor)

- **Ask:** SPEC 2.67 §7.9a (Q196) adds `readingOverForm` for existing events. §7.9 / §8.4 / §7.8 "Where" (Q195) move 📋 Paste from the Address box to the top of the form beside 📷 Screenshot, filling the whole form, for new and existing events.
- **Verdict:** `src/shared/event-reading.ts` (readingOverForm) [EXISTING]; `frontend/src/components/EventFillBar.tsx` [RENAME of EventPhotoFill.tsx, map row rewritten]; `AddressField.tsx` shrinks to box + Open in Maps [EXISTING]; `EventForm.tsx` renders the bar for every event it can edit [EXISTING].
- **Flow stage:** rules (event-reading) / render (EventFillBar, AddressField, EventForm).
- **Why:** The merge rule is pure and sits beside its sibling readingToForm. 📷 and 📋 are two inputs to one concern (fill the form from a reading), so one bar owns both; the clipboard helper moves with it and AddressField goes back to one concern. `EventFill.tsx` rejected: `EventFill` is already the shared form-shape interface. Rejected: Paste staying in AddressField; a second paste component; the Q196 merge in the component.
- **Caps:** event-reading.ts 61 → 83/300; EventPhotoFill.tsx 46 → EventFillBar.tsx 76/300; AddressField.tsx 66 → 20/300; EventForm.tsx 193/223 (pinned, unchanged). No ceiling moved, nothing newly in the band, no reorganizer.

## 2026-10-09 — An event's address, paste to fill (placement-advisor)

- **Ask:** SPEC 2.66 §7.9 (v1.37.0, migration 0034, §4.2zg; §7.8 Q190/EP5; §8.4; §10 `/events/read-text`): an optional `events.address` (≤ EVENT_ADDRESS_MAX 200) on events GET/POST/PATCH; a screenshot reading fills the address instead of a 📍 notes line; `POST /events/read-text { text }` (≤ EVENT_TEXT_MAX 5000, same 40-a-day budget); an Address box with 📋 Paste and Open in Maps in the event form.
- **Verdict:** EXISTING alert-limits.ts (EVENT_ADDRESS_MAX); event-reading.ts (EVENT_TEXT_MAX, address in EventFill/readingToForm; EVENT_LOCATION_MAX and EVENT_READING_NOTES_MAX deleted); event-rows.ts; routes/events.ts (PATCH UPDATE); routes/event-photos.ts (read-text); event-reader.ts (readEventText, one prompt with a source variant); EventForm.tsx (field wiring only); usePhotoPick.tsx (shrinkPicked takes a Blob). NEW row `frontend/src/components/AddressField.tsx`. Schema: migrations/0034_event_address.sql.
- **Flow stage:** rules (alert-limits, event-reading) / route + persist (event-rows, events, event-photos) / read (event-reader) / render (AddressField, EventForm).
- **Why:**
  - EVENT_TEXT_MAX limits a read request, not an event, so it goes with the reading.
  - read-text shares read-photo's budget, check order and failure mapping, so it joins event-photos.ts (one local helper, readWith) rather than a new route file.
  - EventForm is pinned at 223 with the band at 201; inline Paste and Maps logic would cross the cap and give the form a second concern, so the whole Address row is a leaf with value/onChange.
  - Rejected: Paste inside EventPhotoFill (fills several untouched fields on new events only, a different rule from Q195); a second shrink helper.
  - parseEventInput turns a missing address into null, so alarms.ts and things.ts stay untouched.
- **Caps:** EventForm.tsx 190 → 193/223 (pinned); routes/events.ts 114/147; event-rows.ts 135 → 137/300; event-photos.ts 30 → 40/300; event-reader.ts 47 → 61/300; event-reading.ts 62 → 61/300; alert-limits.ts 11/300; AddressField.tsx 66/300 (new). No ceiling moved; no reorganizer.

## 2026-10-08 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.36.0 release (PR #24, SPEC 2.65 §5.5a "A rolling timer's day starts", merged and live 2026-10-08, dbfdae2).
- **Verdict:** MINOR DRIFT. Typecheck green, 698/698 tests, arch:audit quiet.
- **Top finding:** docs/where-things-stand.md still read v1.35.0 and repeated the pass-2 line; refreshed in the same commit as the report. Pass-3 items 1–4 still owed; item 2 (the timer form's read-only sentence) rides the next timer-form change.
- **Handoffs:** 0 to reorganizer, 1 docs refresh (done), 0 to placement-advisor (watch: a fourth fire-less sender should get one owner).
- **Restraint:** no shared fire-less-send helper (3 sites with real differences); the PWA's window guard for announceStart (settled in the spec); TIMER_START_LATE_MIN (derived); announced_on not reset when the window is edited.
- **Report:** `docs/steward/2026-10-08-fourth-pass.md`.

## 2026-10-08 — A rolling timer's day starts: the start announcement (placement-advisor)

- **Ask:** SPEC 2.65 §5.5a (v1.36.0, migration 0033): an opt-in `announce_start` on a rolling timer with a window; once per window opening, within MISSED_AFTER_MIN of it, a fire-less "{title} timer started — every {n} minutes" on the timer's channels; `announceStart` on GET/POST/PATCH /timers; a checkbox in the timer form.
- **Verdict:** `src/shared/timer-start.ts` [NEW row] (TIMER_START_LATE_MIN, ANNOUNCE_NEEDS_WINDOW, windowOpening, timerStartDue, timerStartMessage); `src/worker/timer-starts.ts` [NEW row] (timerStartTick, tick step 3c); tick.ts, routes/alerts.ts, Timers.tsx [EXISTING]; migrations/0033_timer_announce.sql.
- **Flow stage:** rules (timer-start.ts) / persist + deliver (timer-starts.ts, tick) / route (alerts.ts) / render (Timers.tsx).
- **Why:**
  - engine.ts is 255/300 and the most-imported shared hub; the rule would put it near 280, in the band. A leaf importing engine (never the reverse) keeps the hub still, the same pattern as things.ts.
  - The tick step mirrors mess-asks.ts, so tick.ts (pinned 148) grows by three lines only.
  - The advisor found that opsPingsSince counts every titled fire-less push that is not a notice or a mess ask, so a titled timer-start push would use up the founder's §9.4 hourly limit. It proposed a `deliveries.timer_id` column. **Built instead (coordinating session, wu wei):** the push carries `title` NULL, like an announcement, so it shows "📢 Announcement" and the elimination never counts it; no deliveries column, deliveries.ts untouched. Recorded in §5.5a and Q191.
  - Rejected: engine.ts; a new `notice` value (CHECK rebuild); a timer branch in push.ts; the announce rule in the route or the commands handler.
  - Spec gaps the advisor sent back, settled in §5.5a: the form saves announceStart off whenever a window end is empty, so the route's refusal is only for API misuse; a timer started or switched on within 60 min of its opening announces then (Q192).
- **Caps:** shared/timer-start.ts 31/300 (new); worker/timer-starts.ts 49/300 (new); tick.ts 108 → 111/148 (pinned); routes/alerts.ts 186 → 192/300; Timers.tsx 173 → 182/300; engine.ts 255/300 unchanged. No ceiling moved.

## 2026-10-07 — Steward pass, whole tree (code-steward)

- **Run:** after the v1.35.0 release (PR #22, SPEC 2.64 §6.3 "Whose entry it is", merged and live 2026-10-07; head 16f84ed), covering v1.34.0 too.
- **Verdict:** MINOR DRIFT. Typecheck green, 690/690 tests (77 files), arch:audit quiet (nothing in the band; routes/recipes.ts 233/269 is the nearest at 87%).
- **Top finding:** test/roles-api.test.ts A9 sends ~44 requests under vitest's default 5 s timeout and flakes under full-suite load on Windows. Split it into own and admin, each with `}, 30_000)`.
- **Handoffs:** 0 to reorganizer; 3 to worker (A9 split and timeout; the 7 old refusal literals in events/alarms/alerts/chores routes and EventForm/Alarms/ChoreForm → cannotChangeText, plus the missing read-only line in Timers.tsx and the stale roles.ts comment; event-rows.ts notes on EVENT_NOTES_MAX); 2 quick placement-advisor verdicts (roles.ts already the owner; event-rows.ts); 1 spec decision for MojoSOGO (§6.3 says lists use the one sentence, while §7A.1 and lists.ts keep "Only the person who made this list…" / "Only an admin…"; recommended: name lists as §6.3's exception).
- **Placement audit:** 2 code commits since pass 2 (049b76a v1.34.0, 16f84ed v1.35.0), both with advisor receipts and owner-naming messages, both landed as their verdicts said; 0 without.
- **Restraint:** no shared spendRead (each route's 429/503 messages differ by spec); no forbid helper or shared isTickOnly (rejected by the advisor; the idiom is uniform); no ReadOnlyNote component; recipes.ts left alone until it reaches the band (seam ready: the emoji routes, like recipe-photos.ts); no PWA tests for the read-only forms.
- **Report:** `docs/steward/2026-10-07-third-pass.md`. Nothing is fixed until MojoSOGO picks.

## 2026-10-07 — Whose entry it is: creator-or-admin on things, shows, recipes, list items, chore areas (placement-advisor)

- **Ask:** SPEC 2.64 §6.3 "Whose entry it is" (kids as plain members): writes to things, shows, recipes, list items and chore areas need `canChange`; checking a list item (`checked` only) and want/watched on a show (`status` only) stay open; the PWA forms go read-only for non-creators.
- **Verdict:** `src/shared/roles.ts` [EXISTING] (cannotChangeText(noun), the §6.3 refusal sentence for routes and forms). routes/things.ts, thing-photos.ts, shows.ts, recipes.ts, recipe-photos.ts, lists.ts, item-photos.ts, chore-areas.ts [EXISTING]: `forWrite` on the file-local loaders (the alerts / alarms / chores idiom), inline where there is no loader. ThingForm, ShowForm, HouseholdListItemForm, ChoreAreas, RecipeView [EXISTING], hiding controls with canChange.
- **Flow stage:** rules (roles.ts) / route (checks) / render (read-only forms).
- **Why:**
  - The rule already exists as canChange. §6.3 gives one refusal sentence, now written in 7 places and about to be written in ~12 more, so the sentence goes into shared code that both Worker and PWA import.
  - Rejected a forbid helper in http.ts (it would pull member/role knowledge into the error-envelope file) and in session.ts (a second way to write a check five routes write one way; two lines per call site).
  - Rejected a shared isTickOnly: it is a check on the request shape that only the route sees, and the PWA decides by canChange and sends one field. Use "exactly one key" so `{}` is not a tick.
  - recipes.ts fits below its 242 band, so no extraction and no re-pin.
  - Sibling: ShowForm's Watched must send `{ status }` alone for a non-creator.
  - Moving the old copies of the sentence (events, alarms, alerts, chores, Alarms, EventForm, ChoreForm) to cannotChangeText, and the list-rename wording, are for code-steward or step 4.
- **Caps:** no ceiling moved, nothing newly in the band.

## 2026-10-06 — Fill in an event from a screenshot (placement-advisor)

- **Ask:** SPEC 2.63 §7.8 (with §8.4, §10 `POST /events/read-photo`): a screenshot fills the new-event form; nothing saved.
- **Verdict:** `src/shared/event-reading.ts` [NEW row] (EventReading, cleanEventReading, readingToForm on an EventFill subset); `src/worker/event-reader.ts` [NEW row] (prompt, schema, imageBlock + nearestClause, askClaude); `src/worker/routes/event-photos.ts` [NEW row] (the §7C.4 order, spendPhotoRead mapped inline, mounted before `events` in index.ts); `frontend/src/components/EventPhotoFill.tsx` [NEW row], hosted by EventForm.tsx [EXISTING]; EVENT_NOTES_MAX into `src/shared/alert-limits.ts` [EXISTING].
- **Flow stage:** rules / deliver / route / render, split along the flow.
- **Why:** the fill rules are shared so the Worker and PWA cannot disagree and EP4–EP6 test pure. Rejected: things.ts as the rules home (Things owner; would pull things → engine into the event form); photo-reader.ts (already two readers); events.ts for the route (114/147, the CRUD hub); thing-photos.ts (Things owner); exporting or moving the file-local spendRead (a fourth inline mapping is steward material, as is event-rows.ts adopting EVENT_NOTES_MAX); the button inline in EventForm.tsx (188/223, band at 201). No `POST /events/:id` exists; mounting before `events` guards against one later.
- **Caps:** shared/event-reading.ts ~60/300 (new); alert-limits.ts 7 → 9/300; worker/event-reader.ts ~45/300 (new); routes/event-photos.ts ~30/300 (new); worker/index.ts 88 → 90/300; EventPhotoFill.tsx ~50/300 (new); EventForm.tsx 188 → ~190/223. No ceiling moved, nothing newly in the band.
- **Sources read:** SPEC.md §7.8, §8.4, §10; scripts/arch.ts; docs/module-ownership.md; docs/modularity.md; docs/placement-receipts.md; photo-reader.ts; routes/thing-photos.ts; routes/events.ts; photo-reads.ts; index.ts; shared/time.ts; alert-limits.ts; things.ts; link-reading.ts; EventForm.tsx; api.ts; item-photos.ts; shows.ts.

## 2026-10-06 — Owed tests: migration 0028 and RepeatFields mappings (placement-advisor)

- **Ask:** steward pass 2 item 8 (pass 1 #10, approved): test/migration-0028.test.ts and a unit test of RepeatFields.tsx's repeatOf / weeksOf / toRecurrence / repeatText (§4.2, §7D.5, §8.4).
- **Verdict:** REUSE-add-nothing (test/ only; no source owner, no map row).
- **Why:** test/ is outside SOURCE_ROOTS; a .tsx loads in the worker pool only via a run-time `@vite-ignore` dynamic import (precedent recipe-transcript.test.ts). Rejected: extracting the mappings to .ts for testability; widening the root tsconfig.

## 2026-10-06 — usePhotoPick for the photo pickers (placement-advisor)

- **Ask:** steward pass 2 item 7 (pass 1 #9, approved): a usePhotoPick hook beside PhotoField.tsx, adopted by ItemPhoto, RecipeTranscript, ChoreAreaForm and Shows (§7C.3, §8.8). Behavior-preserving.
- **Verdict:** `frontend/src/components/usePhotoPick.tsx` [NEW row]; PhotoField.tsx and the four components [EXISTING, adopt it].
- **Flow stage:** render / capture intent.
- **Why:** five copies of input, click, reset and lazy shrink; raw files keep every caller's busy and error order unchanged; own file like useAction.tsx keeps PhotoField one concern. Rejected: inside PhotoField.tsx; state.tsx; shrinking inside the hook; a useObjectUrl.
- **Caps:** usePhotoPick.tsx 16/300 (new); PhotoField.tsx 89 → 88/300; ItemPhoto.tsx 66 → 65/300; ChoreAreaForm.tsx 113 → 112/300; RecipeTranscript.tsx 117 → 116/300; Shows.tsx 112 → 108/300. No ceiling moved.

## 2026-10-06 — The photo picker into usePhotoPick.tsx (reorganizer)

- **Trigger:** steward pass 2 item 7: the hidden file input, its click, its reset and the lazy shrink-photo import written five times.
- **Seam moved:** the picker (hidden `type=file accept=image/*` input, open, value reset, ≥ 1 file) and the lazy shrink from `PhotoField.tsx`, `ItemPhoto.tsx`, `ChoreAreaForm.tsx`, `RecipeTranscript.tsx` ({ multiple: true }) and `Shows.tsx` to usePhotoPick / shrinkPicked in `frontend/src/components/usePhotoPick.tsx` [NEW row]; the five rows now say "via usePhotoPick".
- **Room opened:** each caller 1–4 lines smaller (Shows 112 → 108). No pins.
- **Behavior:** preserved — typecheck, npm test (666, unchanged) and arch:audit green (quiet); the input markup is the same (attributes, `multiple` only on the transcript, aria-hidden, tabIndex -1, visually-hidden, in the same place); onPick runs before the value reset, as before; callers keep their busy and step text, error handling, `live` ref, object URLs and order; `vite build` still emits shrink-photo as its own lazy chunk.
- **Restraint:** no useObjectUrl, no shrinking inside the hook, no state.tsx; ThingPhoto and the forms using PhotoField untouched.

## 2026-10-06 — Web-tool builders in claude.ts (placement-advisor)

- **Ask:** steward pass 2 item 6 (pass 1 #8, approved): web_search_20260209 / web_fetch_20260209 copied into link-reader.ts, recipe-link-reader.ts and show-reader.ts (§7C.4b, §7E.6, §7F.2). Behavior-preserving.
- **Verdict:** `src/worker/claude.ts` [EXISTING] (webSearchTool, webFetchTool); the three readers [EXISTING, call them].
- **Flow stage:** deliver-side API client (Worker).
- **Why:** claude.ts already owns the API surface and ClaudeServerTool; the next version bump is one line. Rejected: shared; a separate tools module; moving max_uses constants.
- **Caps:** worker/claude.ts 121 → 130/300; link-reader.ts 37 → 34/300; recipe-link-reader.ts 37 → 34/300; show-reader.ts 85 → 81/300. No ceiling moved.

## 2026-10-06 — Web-tool builders into claude.ts (reorganizer)

- **Trigger:** steward pass 2 item 6: the web search and web fetch tool blocks, with their dated versions, written out in three readers.
- **Seam moved:** the web_search / web_fetch tool literals from `src/worker/link-reader.ts`, `src/worker/recipe-link-reader.ts` and `src/worker/show-reader.ts` to webSearchTool(maxUses, where?) / webFetchTool(maxUses) in `src/worker/claude.ts` [EXISTING].
- **Room opened:** link-reader.ts 37 → 34, recipe-link-reader.ts 37 → 34, show-reader.ts 85 → 81 lines; claude.ts 121 → 130. No pins.
- **Behavior:** preserved — typecheck, npm test (666, unchanged) and arch:audit green (quiet); the research requests' `tools` are deep-equal to before (link-reading-api, shows-api and recipe-links-api tests assert them): user_location only when a `where` is given (link: timezone; show: country then timezone), the recipe link none, no undefined keys.
- **Restraint:** max_uses constants stay with their features; no tools module; claude.ts still chooses no tools.

## 2026-10-06 — Photo limits out of things.ts (placement-advisor)

- **Ask:** steward pass 2 item C (approved): the photo-size constants live in things.ts but serve 6 features, and the SogoAI helper bundles the cap (§7C.3, §7A.3). Behavior-preserving.
- **Verdict:** `src/shared/photos.ts` [NEW row]; things.ts, item-reading.ts, recipe-reading.ts, http.ts, shrink-photo.ts [EXISTING, import from it].
- **Flow stage:** rules (shared limits).
- **Why:** a dependency-free leaf takes six features and home/ off the things → engine chain. home reaches it through item-reading.ts, so LAYERS `allowed` is unchanged; the cap is inlined at build, so the rebuild note is docs. Rejected: item-reading.ts as home; moving READS_PER_DAY; widening home's allowed list; a things.ts re-export.
- **Caps:** shared/photos.ts 6/300 (new); shared/things.ts 252 → 246/300; shared/item-reading.ts 57/300; shared/recipe-reading.ts 180/300; worker/http.ts 41/300; frontend/src/shrink-photo.ts 45/300. No ceiling moved.

## 2026-10-06 — Photo limits into src/shared/photos.ts (reorganizer)

- **Trigger:** steward pass 2 item C: PHOTO_MAX_BYTES / PHOTO_TYPES / PHOTO_LONG_SIDE / PHOTO_QUALITY sat in things.ts, so every photo feature and the home/ bundle (via item-reading.ts) pulled in things → engine.
- **Seam moved:** the four PHOTO_* constants from `src/shared/things.ts` to `src/shared/photos.ts` [NEW row], no re-export; item-reading.ts, recipe-reading.ts, worker http.ts, shrink-photo.ts and three tests import them from there.
- **Room opened:** things.ts: 252 → 246 lines. No pins.
- **Behavior:** preserved — typecheck, npm test (666, unchanged but for three import paths) and arch:audit green (quiet); same values (PHOTO_TYPES still `as const`), same 400/413 messages; the home/ helper still bundles PHOTO_MAX_BYTES = 4 MB as IDENTIFY_BODY_MAX, now without things.ts or engine.ts; LAYERS unchanged. where-things-stand.md's deploy step now says rebuild home/ when anything it bundles changes, naming photos.ts.
- **Restraint:** READS_PER_DAY and the feature photo counts stay where they are; home's allowed list untouched.

## 2026-10-06 — Recipe read failures: one union, two mappers, commentsError (placement-advisor)

- **Ask:** steward pass 2 item 2 (approved): the refused/failed mapping written 4×, video-unavailable 2× and the ⚑ Q78 comments rule 2× across recipe-reads.ts and recipe-reread.ts; the route's readFailed typed on one union (§7E.2, §7E.2b). Behavior-preserving.
- **Verdict:** `src/worker/recipe-reads.ts` [EXISTING] (RecipeReadFailure, videoFailure, claudeFailure); `src/shared/recipe-reading.ts` [EXISTING] (commentsError); recipe-reread.ts and routes/recipes.ts [EXISTING, call / retype].
- **Flow stage:** persist-side outcome mapping (Worker); rules (Q78, shared).
- **Why:** the mappers consume Worker result types, and recipe-reads.ts is already re-read's shared dependency; the Q78 rule is a decision, so shared, with a structural parameter. Rejected: a new failures module; mappers in shared; HTTP outside the route.
- **Caps:** recipe-reads.ts 97 → 106/300; recipe-reread.ts 78 → 73/300; shared/recipe-reading.ts 176 → 180/300; routes/recipes.ts 229 → 229/269 (pinned). No ceiling moved.

## 2026-10-06 — Recipe read failures into recipe-reads.ts; commentsError into recipe-reading.ts (reorganizer)

- **Trigger:** steward pass 2 item 2: the YouTube and Claude failure mappings and the ⚑ Q78 comments rule copied between recipe-reads.ts and recipe-reread.ts, and the failure union written twice.
- **Seam moved:** the failure union and its mappers from inline copies in `src/worker/recipe-reads.ts` and `src/worker/recipe-reread.ts` to RecipeReadFailure / videoFailure / claudeFailure in `src/worker/recipe-reads.ts` [EXISTING]; the ⚑ Q78 rule to commentsError in `src/shared/recipe-reading.ts` [EXISTING]; routes/recipes.ts readFailed now takes RecipeReadFailure.
- **Room opened:** recipe-reread.ts: 78 → 73 lines; recipe-reads.ts 97 → 106 (the union and mappers it now owns). No pins moved.
- **Behavior:** preserved — typecheck, npm test (666: the 665 existing unchanged plus 1 commentsError unit test) and arch:audit green (quiet); every kind, reason, status, code and message the same; comments_error stored the same; YouTube's not_found still → video_unavailable, Claude's refused still → recipe_refused.
- **Restraint:** readFailed stays in the route; youtube.ts, recipe-reader.ts, recipe-link-reader.ts and claude.ts untouched; no new module.

## 2026-10-06 — Alert limits and invite-code normalizing into shared (placement-advisor)

- **Ask:** steward pass 2 item 4 (pass 1 #6, approved): title ≤120 ×5 and interval 1–1440 ×3 across routes/alerts.ts, event-rows.ts, Timers.tsx, Alarms.tsx and EventForm.tsx; normalizeInviteCode out of routes/auth.ts (§4.2, §5.4, §6.2). Behavior-preserving.
- **Verdict:** `src/shared/alert-limits.ts` [NEW row]; `src/shared/invite-link.ts` [EXISTING, row widened]; the five limit sites, auth.ts and members.ts [EXISTING, import].
- **Flow stage:** rules (shared limits and format), used by route and render.
- **Why:** route and form restate the same numbers; a leaf keeps engine.ts (85%) from growing; moving the normalizer removes the members.ts → auth.ts route import. Rejected: engine.ts; things.ts' TITLE_MAX; a generic limits.ts; folding in offset/renotify/maxAlerts (not approved; alert-limits.ts is their named later home); PWA normalizing.
- **Caps:** shared/alert-limits.ts 7/300 (new); shared/invite-link.ts 15 → 20/300; routes/auth.ts 178 → 174/300; event-rows.ts 134 → 135/300; routes/alerts.ts 185 → 186/300; routes/members.ts 73/300; Timers.tsx 172 → 173/300; Alarms.tsx 150 → 151/300; EventForm.tsx 187 → 188/223 (pinned). No ceiling moved.

## 2026-10-06 — Alert limits into alert-limits.ts; normalizeInviteCode into invite-link.ts (reorganizer)

- **Trigger:** steward pass 2 item 4: the 120-character title and the 1–1440-minute interval restated in two routes and three forms; the invite-code normalizer living in routes/auth.ts and imported route-to-route by members.ts.
- **Seam moved:** ALERT_TITLE_MAX, TIMER_INTERVAL_MIN / TIMER_INTERVAL_MAX from literals in `src/worker/routes/alerts.ts`, `src/worker/event-rows.ts`, Timers.tsx, Alarms.tsx and EventForm.tsx to `src/shared/alert-limits.ts` [NEW row]; normalizeInviteCode verbatim from `src/worker/routes/auth.ts` to `src/shared/invite-link.ts` [EXISTING row, widened].
- **Room opened:** routes/auth.ts: 178 → 174 lines; the limit sites +1 each (an import). No pins.
- **Behavior:** preserved — typecheck, npm test (665: the 664 existing unchanged plus 1 normalizeInviteCode unit test) and arch:audit green (quiet); the 400 messages are byte-identical (template strings over the same numbers); the forms' maxLength, min/max and the "Interval (minutes, 1–1440)" label render the same; invite codes hash the same.
- **Restraint:** reminder offset 0–1440, renotify 1–240, maxAlerts 1–20 and chores' TITLE_MAX stay where they are; the PWA still never normalizes a code.

## 2026-10-06 — List-add result and delivery status typed from vocab (placement-advisor)

- **Ask:** steward pass 2 item D (approved): the list-add result and the delivery-status badges are retyped by hand in the PWA (§3, §7A.1, §8.6). Behavior-preserving.
- **Verdict:** `src/shared/vocab.ts` [EXISTING] (LIST_ADD_RESULT); routes/lists.ts, state.tsx, Settings.tsx, HouseholdLists.tsx, RecipeView.tsx [EXISTING, typed on it].
- **Flow stage:** route (producer) and render (consumers); the vocabulary is shared.
- **Why:** both are wire strings; one already had a vocab entry the PWA ignored, the other had none. Rejected: reusing AddDecision's kinds; dropping the badge fallback (the wire is untrusted).
- **Caps:** vocab.ts 73 → 75/300; routes/lists.ts 226 → 227/300; Settings.tsx 177/207 (pinned, +0); HouseholdLists.tsx 236/300, RecipeView.tsx 142/300, state.tsx 99/300 (+0). No ceiling moved.

## 2026-10-06 — List-add result and delivery status typed from vocab (reorganizer)

- **Trigger:** steward pass 2 item D: `'added' | 'existing' | 'reopened'` retyped in HouseholdLists.tsx (and `string` in RecipeView.tsx); delivery status and channel typed `string` in state.tsx and the badge map.
- **Seam moved:** the list-add result vocabulary from HouseholdLists.tsx's local AddResult to `src/shared/vocab.ts` LIST_ADD_RESULT / ListAddResult [EXISTING]; the route's three results `satisfies ListAddResult`; state.tsx's recentDeliveries typed `Channel` / `DeliveryStatus`; STATUS_BADGE `Record<DeliveryStatus, string>`. SPEC §3 lists LIST_ADD_RESULT.
- **Room opened:** none needed (typing only); vocab.ts +2, routes/lists.ts +1, the PWA files +0. No pins.
- **Behavior:** preserved — typecheck, npm test (664, unchanged) and arch:audit green (quiet); the same three strings on the wire with the same statuses (200, 200, 201); the badge's `?? 'neutral'` fallback kept.
- **Restraint:** AddDecision's kinds not mapped onto the wire values; no other badge retyped; no map row change.

## 2026-10-06 — Owed-mess visibility into the shared rules (placement-advisor)

- **Ask:** steward pass 2 leftover (approved): GET /messes decides in the route who may see an owed mess (§7B.7). Behavior-preserving.
- **Verdict:** `src/shared/messes.ts` [EXISTING] (canSee); routes/messes.ts [EXISTING, calls it].
- **Flow stage:** rules (out of the route).
- **Why:** the last mess permission still in the route; sits beside canSettle/canDelete on the same MessViewer built from P1's isAdmin. Rejected: filtering in the PWA; reshaping balancesOf.
- **Caps:** shared/messes.ts 115 → 119/300; routes/messes.ts 144 → 145/300 (neither pinned). No ceiling moved.

## 2026-10-06 — Owed-mess visibility: canSee (reorganizer)

- **Trigger:** steward pass 2 leftover: GET /messes filtered owed messes inline in `routes/messes.ts`.
- **Seam moved:** who sees a mess in the list (the owed filter) from `src/worker/routes/messes.ts` to `src/shared/messes.ts` canSee [EXISTING row, widened].
- **Room opened:** routes/messes.ts: 144 → 145 lines (the viewer line); shared/messes.ts: 115 → 119. No pins; caps stay GLOBAL_FILE_CAP 300.
- **Behavior:** preserved — typecheck, npm test (664: the 663 existing unchanged plus 1 canSee unit test) and arch:audit green (quiet); canSee's body is the route's filter term for term (not owed, or admin, or reporter, or claimer); the route's `admin` (isAdmin(me)) still feeds balancesOf; GET /messes response unchanged.
- **Restraint:** balancesOf and Messes.tsx untouched; no filtering moved to the PWA.

## 2026-10-06 — Steward pass, whole tree (code-steward)

- **Run:** on demand, second pass, checking the PR #18 extractions (v1.33.1, main 712dc23).
- **Verdict:** MINOR DRIFT. Items 1–5 landed as their verdicts said; typecheck, 662/662 tests and arch:audit green; nothing
  in the warning band; tick.ts imported only by index.ts.
- **Top finding:** SPEC §12 and §14 contradicted the code. A second run on SogoGamerPC added the creator-or-admin rule
  repeated in 4 routes and 4 forms, §5.7 drift on machine alerts, photo limits bundled into home/, and hand-typed wire values.
- **Handoffs:** MojoSOGO approved all of it 2026-10-06. The docs commit and P1–P9 are above (report: docs/steward/2026-10-06-second-pass.md).
- **Placement audit:** 5 code commits since pass 1, all with advisor and reorganizer receipts; 0 without.

---

## 2026-10-06 — One creator-or-admin rule and isAdmin (placement-advisor)

- **Ask:** steward pass 2 item A (approved): one shared "creator or admin may change it" rule plus isAdmin; today written in 4 routes and 4 forms beside canManageList, and `role === 'owner'` ~28 times (§6.3). Behavior-preserving.
- **Verdict:** `src/shared/roles.ts` [NEW row] (ADMIN_ROLE, isAdmin, canChange); `src/shared/lists.ts` [EXISTING, canManageList removed]; the routes, forms, session.ts, env.ts and mess-asks.ts [EXISTING, call it].
- **Flow stage:** rules (out of routes and render).
- **Why:** canManageList is already this rule, so folding it in deletes a copy. Every admin read goes through isAdmin; every role-value write or SQL match through ADMIN_ROLE, so `'owner'` lives only in vocab.ts and roles.ts. Rejected: vocab.ts; lists.ts (inverted import); session.ts (PWA can't import it); a "permissions" module; moving the mess rules; renaming requireOwner; one shared 403 text.
- **Caps:** shared/roles.ts 14/300 (new); shared/lists.ts 100 → 91/300; Settings.tsx 176 → 177/207 (pinned); EventForm.tsx 186 → 187/223 (pinned); routes/events.ts 113 → 114/147 (pinned); every other touched file +0 or +1, all unpinned under 300 (highest HouseholdLists.tsx 236, routes/lists.ts 226). No ceiling moved.

## 2026-10-06 — Creator-or-admin rule and isAdmin into shared/roles.ts (reorganizer)

- **Trigger:** steward pass 2 item A: the creator-or-admin check written in 4 routes, 4 forms and canManageList; `role === 'owner'` restated across Worker and PWA.
- **Seam moved:** ADMIN and canManageList (renamed canChange, same body) from `src/shared/lists.ts`, the inline checks in routes alarms/alerts/chores/events/lists and the forms Alarms/Timers/ChoreForm/EventForm/HouseholdLists, and every `role === 'owner'` read or write (session.ts, members.ts, auth.ts, messes.ts, mess-asks.ts SQL, Messes/Settings/MachineHours) to `src/shared/roles.ts` [NEW row]. env.ts and auth.ts type the role as vocab's `Role`.
- **Room opened:** shared/lists.ts: 100 → 91 lines; callers +0 or +1 (an import). No ceiling moved; no pin added.
- **Behavior:** preserved — typecheck (all four projects), npm test (663: the 662 existing, canManageList's case moved unchanged to test/roles.test.ts as canChange, plus 1 isAdmin case) and arch:audit green (quiet); every 403 status, code, message and check order unchanged (forWrite guards kept; events.ts has none and still has none); EventForm's undefined meta → canChange(null) → admins only, as before; mess-asks binds ADMIN_ROLE to `role = ?`, the same rows. `'owner'` now appears only in vocab.ts ROLE and roles.ts (plus state.tsx's §6.3 comment).
- **Restraint:** requireOwner keeps its name; 403 texts not unified; mess rules, MessViewer and balancesOf untouched; `'member'` literals untouched.

## 2026-10-05 — Mess permissions into the shared rules (placement-advisor)

- **Ask:** steward backlog item 5 (approved): move the who-can-answer, settle, delete and decide checks out of `routes/messes.ts` into `src/shared/messes.ts`; the route and Messes.tsx import them (§7B.7, §8.15a). Behavior-preserving.
- **Verdict:** `src/shared/messes.ts` [EXISTING, row widened]; routes/messes.ts and Messes.tsx [EXISTING, call it].
- **Flow stage:** rules (moved out of route and render).
- **Why:** permission decisions in a route, and the answerable rule restated in the route twice, the PWA and askedOf. One pure home lets server and PWA agree by construction. Rejected: HTTP codes in shared; changing the admin select gate; MessBanner (already server-driven).
- **Caps:** shared/messes.ts 115/300, routes/messes.ts 143/300, Messes.tsx 146/300 (none pinned).

## 2026-10-05 — Mess permissions: isAnswerable, isDecidable, canSettle, canDelete, decideError (reorganizer)

- **Trigger:** steward backlog item 5: permission rules for messes restated in `routes/messes.ts`, `Messes.tsx` and `askedOf`.
- **Seam moved:** who may answer, decide, settle or delete a mess, from `src/worker/routes/messes.ts` (ANSWERABLE, the decide status list, the settle and delete checks, the decide member checks) and `frontend/src/components/Messes.tsx` (answerable, the settle and delete button gates) to `src/shared/messes.ts` [EXISTING row, widened]. `askedOf` now uses isAnswerable.
- **Room opened:** routes/messes.ts: 144 → 143 lines; Messes.tsx: 146 → 146; shared/messes.ts: 91 → 115. No pins; caps stay GLOBAL_FILE_CAP 300.
- **Behavior:** preserved — typecheck (all four projects, frontend included), npm test (662, the 659 existing unchanged plus 3 new unit tests) and arch:audit green; every HTTP status, code, message and check order unchanged (answerable keeps its reporter 400 before the 409; settle 409 before 403; decide 409, then the null branch, then the 400s); HTTP codes stay in the route.
- **Restraint:** no MessBanner, MessReport, mess-asks.ts or vocab.ts change; the admin Whose was it? select stays gated on admin only; the route's `answerable()` wrapper kept for its reporter check.

## 2026-10-05 — One owner for private photos in R2 (placement-advisor)

- **Ask:** steward backlog item 4 (approved): one `photo-store.ts` for putPhoto, replacePhoto and the photo response (§7C.3, §7A.3, §7B.6, §7B.7, §7E.2b). Behavior-preserving.
- **Verdict:** `src/worker/photo-store.ts` [NEW row]; six callers [EXISTING, shrink].
- **Flow stage:** persist (R2), plus the HTTP serve of a stored object.
- **Why:** key format, put, replace order and private serve headers copied six times; the recipe picture had two writers that could drift. Rejected: a delete wrapper; a recipe-picture module; servePhoto in http.ts; a raw Response.
- **Caps:** photo-store.ts 35/300; every caller shrinks (none pinned, all under the 300 global cap).

## 2026-10-05 — Private photos to photo-store.ts (reorganizer)

- **Trigger:** steward backlog item 4: the R2 photo key, put, replace and private serve copied across six worker files.
- **Seam moved:** the 5 key templates, 5 puts, 4 replace sequences (thing-photos, item-photos, recipe-photos, recipe-reread keepPicture; each keeps its own UPDATE as `save`) and the 5 serve blocks, from `routes/thing-photos.ts`, `routes/item-photos.ts`, `routes/recipe-photos.ts`, `routes/chore-areas.ts`, `routes/messes.ts` and `recipe-reread.ts` to `src/worker/photo-store.ts` [NEW row]
- **Room opened:** thing-photos 86 → 80, item-photos 81 → 75, recipe-photos 48 → 42, chore-areas 142 → 137, messes 149 → 144, recipe-reread 79 → 78 lines; none pinned, global cap 300 unchanged; photo-store.ts 35/300.
- **Behavior:** preserved — typecheck, npm test (71 files, 659 tests, unchanged) and arch:audit green (nothing in the warning band); same keys, put metadata, put → UPDATE → old delete order, 404 texts, Content-Type and `private, max-age=3600`; every UPDATE, the base64 decode and every bare PHOTOS.delete on row delete stay with their callers.
- **Restraint:** no dropPhotos wrapper, no recipe-picture module, servePhoto kept out of http.ts and still answers through `c.body(...)`; lists.ts, things.ts, chores.ts and mess-asks.ts untouched.

## 2026-10-05 — One owner for writing deliveries (placement-advisor)

- **Ask:** steward backlog item 3 (approved): one owner for INSERT INTO deliveries and the ops-ping count (§9.4, §5.7, §6.6, §7B.7, §9.3). Behavior-preserving.
- **Verdict:** `src/worker/deliveries.ts` [NEW row]; tick, announce, ops, phone-login and mess-asks [EXISTING, shrink].
- **Flow stage:** persist.
- **Why:** 7 statements in 5 files for one table, plus a ping count by elimination, so the next fire-less titled push would silently use up the hourly limit. Writers and predicate in one file, with a test pinning which rows count. Rejected: a marker column (spec and schema change, to MojoSOGO separately); folding into push.ts; status UPDATEs.
- **Caps:** deliveries.ts 45/300; tick.ts 111 → 108, pin lowered 151 → 148 (108 + WORKING_BUFFER); ops.ts 56 → 52, announce.ts 64 → 61, phone-login.ts 148 → 146, mess-asks.ts 76 → 74 (all /300).

## 2026-10-05 — Deliveries writers to deliveries.ts (reorganizer)

- **Trigger:** steward backlog item 3; placement-advisor verdict "One owner for writing deliveries" (seven INSERTs for one table in five files, and the ping limit counted by elimination in a route).
- **Seam moved:** the push and house deliveries INSERTs (pushDelivery, houseDelivery → { id, stmt }) from `tick.ts`, `routes/announce.ts`, `routes/ops.ts`, `routes/phone-login.ts` and `mess-asks.ts`, and the founder-ping COUNT (opsPingsSince, SQL text unchanged) from `routes/ops.ts`, to `src/worker/deliveries.ts` [NEW row]
- **Room opened:** tick.ts: 111 → 108 lines; cap 151 → 148. ops 56 → 52, announce 64 → 61, phone-login 148 → 146, mess-asks 76 → 74.
- **Behavior:** preserved — typecheck, npm test (71 files, 659 tests; the 658 existing unchanged) and arch:audit green; columns omitted before are written as explicit NULL (every added column defaults NULL), alert_number 1 for fire-less rows as before, same status, timestamps, batching and send order; new test/deliveries.test.ts pins that a founder ping counts and an announcement, a sign-in notice and a mess ask do not.
- **Restraint:** writers and the one predicate only; push.ts and house.ts status UPDATEs, the mess-ask per-member COUNT and the migrations untouched; no kind column.

## 2026-10-05 — Fire rows out of the orchestrator (placement-advisor)

- **Ask:** steward backlog item 2 (approved): move insertFire, updateFire, choreRunInserts, updateChoreRun, loadChoreRun and sourceOf out of `tick.ts`; move the machine every-speaker rule to shared; fold placeOf into the householdPlace rule (§5.6, §7B.3, §7D.3, §4.2o). Behavior-preserving.
- **Verdict:** `src/worker/fire-rows.ts` [NEW row]; `src/shared/machines.ts` (machineAlert) and `src/worker/db.ts` (placeOf) [EXISTING].
- **Flow stage:** persist (rows) and rules (the machine alert shape).
- **Why:** three routes imported from the cron orchestrator, an inverted dependency on a hub at 86%. The every-speaker decision sat in orchestration (`9ae12ab`). The place null rule was written twice. Rejected: AlertConfig.allSpeakers (leaks speakers into the engine); changing machineAlertConfig's shape; dropping the reminder JOIN; moving the deliveries inserts here (item 3).
- **Caps:** tick.ts 257 → 111, pinned at 111 + WORKING_BUFFER = 151; fire-rows.ts 147/300; machines.ts 232/300; db.ts 55/300.

## 2026-10-05 — Fire and chore-run rows to fire-rows.ts (reorganizer)

- **Trigger:** steward backlog item 2; placement-advisor verdict "Fire rows out of the orchestrator" (routes importing row writers from the 257/300 cron hub).
- **Seam moved:** SourceRow, Source, insertFire, updateFire, loadChoreRun, choreRunInserts, updateChoreRun and sourceOf from `src/worker/tick.ts` to `src/worker/fire-rows.ts` [NEW row]; the machine branch's audience/config to `src/shared/machines.ts` machineAlert(quietUntil) [EXISTING]; tick's local placeOf to `src/worker/db.ts` placeOf, which householdPlace now uses [EXISTING]. routes/alerts.ts, chores.ts and machines.ts import from fire-rows.ts; no re-export from tick.
- **Room opened:** tick.ts: 257 → 111 lines; cap 300 (global) → 151 (111 + WORKING_BUFFER).
- **Behavior:** preserved — typecheck, npm test (70 files, 658 tests, unchanged) and arch:audit green; every SQL string moved byte-for-byte, tick's single settings SELECT and sourceOf's reminder JOIN kept, machineAlertConfig unchanged, machineAlert returns the same `{ assignedTo: [], allSpeakers: true, cfg }` spread, householdPlace still null when the settings row or either coordinate is missing.
- **Restraint:** the two deliveries INSERTs and step 2's audience call stay in tick (item 3 owns the deliveries writers); no engine, house, speaker-choices or event-rows change; SPEC's §2 tree line for tick.ts left as is (outside the write boundary, still true).

## 2026-10-05 — Recipe read pipelines and budget out of the route (placement-advisor)

- **Ask:** steward backlog item 1 (approved by MojoSOGO): move the from-video and page read pipelines, captionsFor and the recipe-read budget out of `routes/recipes.ts` (§7E.2, §7E.2c, §7E.6). Behavior-preserving.
- **Verdict:** `src/worker/recipe-reads.ts` [NEW row]; `routes/recipes.ts` and `recipe-reread.ts` [EXISTING, shrink]. Reorganizer, own commit.
- **Flow stage:** persist (the read and count) out of route; the route keeps validation, row persistence and the HTTP mapping.
- **Why:** the route is at 274/300 with four concerns, 4 copies of the recipe_reads INSERT and 3 copies of the error mapping. The pipelines follow recipe-reread.ts's shape: the caller's checks first, then outcome kinds, never HTTP. Rejected: raising the cap; merging the budget into photo-reads.ts (a different table and cap); folding recipe-reread.ts in (a different contract); moving `insert` out.
- **Caps:** routes/recipes.ts 274 → 229, pinned at 229 + WORKING_BUFFER (269); recipe-reads.ts 97/300; recipe-reread.ts 79/300.

## 2026-10-05 — Recipe read pipelines to recipe-reads.ts (reorganizer)

- **Trigger:** steward backlog item 1: `routes/recipes.ts` at 274/300 carrying CRUD, two read pipelines, the budget and three copies of the error mapping.
- **Seam moved:** the from-video and page read pipelines (YouTube, captionsFor with SogoAI in-line, comments, count, Claude / recipe-link-reader.ts, clean) and the recipe-read budget (recipeReadsUsedUp, countRecipeRead) from `src/worker/routes/recipes.ts` to `src/worker/recipe-reads.ts` [NEW row]; `recipe-reread.ts`'s two INSERTs now call countRecipeRead; the route's three outcome mappings folded into one file-local readFailed (noun video / link / transcript), every string unchanged.
- **Room opened:** routes/recipes.ts: 274 → 229 lines; cap 300 (global) → 269 (229 + WORKING_BUFFER).
- **Behavior:** preserved — typecheck, npm test (658/658, unchanged) and arch:audit green; check orders (duplicate, cap, keys in the route; YouTube, captions ∥ comments, count, Claude in the pipeline), every status, code and message, the recipe_reads and recipes rows and the unique-constraint race catch unchanged.
- **Restraint:** `insert`, `answer`, toRecipes, the duplicate checks, the 429 text and readingOff stay in the route; recipe-reread.ts gets only the count call (keepPicture is item 4's); no new shared rule.

## 2026-10-05 — Steward pass, whole tree (code-steward)

- **Run:** first steward pass on Ensō, at the v1.33.0 milestone, on the first day placement is enforced.
- **Verdict:** REAL DEBT, concentrated in five places; no file over its cap, layering clean.
- **Top finding:** `routes/recipes.ts` 274/300 (91%), the top hotspot; extract the read pipelines (the seam named
  2026-10-05, not taken).
- **Handoffs:** items 1–5 (recipe-reads.ts, fire-rows.ts, deliveries.ts, photo-store.ts, mess rules into
  shared/messes.ts) approved by MojoSOGO and done above; items 6–10 left for when those files are next touched.
- **Placement audit:** 14 code commits from before enforcement have no receipt (`1e478e6`, `0a6ad57`, `a93d113`,
  `77c4ef5`, `68786f3`, `54e09db`, `9c52930`, `9ae12ab`, `11753e9`, `52bc6c1`, `ebcccbe`, `0ecf855`, `b353be1`,
  `3e88d17`); two questionable placements (recipe picture's second writer, machine speaker rule in tick) fixed by
  items 4 and 2.

---

## 2026-10-05 — Whose mess? (placement-advisor)

- **Ask:** mess reports in Chores. Members answer That was me or Not me. Asks go by push up to 4 times, 15 min
  apart, plus an in-app banner. Unclaimed messes go to To talk about, an admin records the outcome, and there is a
  balances ledger of who owes whom (SPEC §7B.7, §8.15a, §4.2ze / migration 0032). Reviewed after a first build
  already sat in the working tree; placed as if fresh.
- **Verdict:** NEW rows `src/shared/messes.ts` (rules, pure), `src/worker/routes/messes.ts` (routes + private R2
  photo), `src/worker/mess-asks.ts` (asks, To talk about, photo expiry; shared by the route and tick),
  `frontend/src/components/{Messes,MessBanner,MessReport}.tsx` + `Messes.module.css`, `migrations/0032_messes.sql`.
  Small edits to existing owners: `vocab.ts` (MESS_SETTLE, MESS_STATUS), `tick.ts` (step 3b, one call),
  `routes/ops.ts` (mess asks don't count toward the hourly limit), `index.ts` (mount), `Chores.tsx` (section),
  `App.tsx` (banner). **Reorganizer first:** `activeMemberIds` moved from `tick.ts` to `db.ts` in its own commit,
  breaking a tick.ts ↔ mess-asks.ts import cycle and taking fan-in off `tick.ts`.
- **Flow stage:** rules (shared/messes.ts) · route + persist (routes/messes.ts) · persist + deliver via push.ts
  (mess-asks.ts, from the route and tick) · render (the three components).
- **Why:** a mess has no due time and no engine actions, so it is not a fire or a chore run. Its asks are
  fire-less push deliveries tied by `deliveries.mess_id`, like announcements and sign-in notices, and the ask count
  is derived from those rows rather than stored. Rejected: `shared/chores.ts` (241/300, a different concern); a new
  fire kind in `tick.ts`/`engine.ts` (wrong shape, grows the hub); the asks inside `routes/messes.ts` (tick would
  import a route). The banner and the section share one version-keyed hook from `Messes.tsx`, so `state.tsx` is not
  widened.
- **Caps:** messes.ts 91, routes/messes.ts 150, mess-asks.ts 77, Messes.tsx 146, MessReport.tsx 50, MessBanner.tsx
  27 (all /300); tick.ts ~258/300 after the extract; db.ts ~51/300. No file newly in the band (routes/recipes.ts at
  91 % predates this). No ceiling re-pinned.

---

## 2026-10-05 — Recipes from any link (coordinating session)

- **Ask:** recipe import takes Facebook reels and any web page; the link's kind is detected (§7E.6).
- **Verdict:** `src/shared/recipe-link.ts` [NEW] (recipeLinkOf, siteName, the prompts — pure; kept out of
  `recipe-reading.ts`, which is about videos and would have reached the band); `src/worker/recipe-link-reader.ts`
  [NEW] (the page, look-up and fill, mirroring `link-reader.ts`); `migrations/0030_recipe_links.sql` [NEW]. Small
  edits to existing owners: `recipes.ts` (row/wire `link`), `recipe-reading.ts` (`VideoText.page`), `vocab.ts`
  (`page`), `recipe-reader.ts` (exports its schema; a post's prompt intro), `recipe-reread.ts` (the link branch),
  `routes/recipes.ts` (the from-link handler), the three recipe screens.
- **Placed by:** the coordinating session itself; no placement-advisor runs in the project app. The page
  pipeline's D1 work stays in the route, as from-video's does.
- **Caps:** `routes/recipes.ts` is now 275/300, newly in the warning band. The seam for the next agent: move
  the two read pipelines (from-video, the page) to a `recipe-reads.ts` beside `recipe-reread.ts`, the route
  keeping only the mapping.

---

## 2026-10-05 — Chores tab and what done looks like (coordinating session)

- **Ask:** chores get their own section, and each chore a "what done looks like" with specific areas, pictures and
  a list of expectations.
- **Verdict:** `src/shared/chore-areas.ts` [NEW] (limits, parseAreaInput, the ChoreArea wire type — pure),
  `src/worker/routes/chore-areas.ts` [NEW] (areas + their R2 photos; exports areaCounts and choreAreaDeletes),
  `frontend/src/components/ChoreAreas.tsx` [NEW] (the sheet) and `ChoreAreaForm.tsx` [NEW] (the editor), migration
  0029. Edits to existing owners: `Chores.tsx` becomes the tab (Today + All chores), `routes/chores.ts` (areaCount,
  delete takes the areas), `ChoresToday.tsx` (📋), `App.tsx` (sixth tab, the sheet overlay), and Chores leaving
  `Alarms.tsx` and `HouseholdLists.tsx`.
- **Why:** areas are their own concern (reference content with photos, editable by anyone), not run rules, so they
  sit beside chores.ts rather than in it (241/300). Photos follow the list-item pattern (R2, private, key never on
  the wire) with a row per photo because an area holds several. The sheet and its editor are separate views so the
  tab file stays small.
- **Caps:** no pinned file touched; none of the new or edited files near the band. **Reorganizer:** none needed.
  No `placement-advisor` agent exists in this checkout; placed by the coordinating session.

## 2026-10-05 — Machine alert hours (coordinating session)

- **Ask:** washer/dryer alerts sound only in editable hours (weekdays 17:30–20:30, weekends 09:00–21:00).
- **Verdict:** `frontend/src/components/MachineHours.tsx` [NEW] (the hours line + admin modal). Edits to existing
  owners: `src/shared/machines.ts` (hours, machineQuietUntil, parse — pure), `src/shared/engine.ts` (generic
  `AlertConfig.quietUntil`, rule 0b — the engine still imports nothing of machines), `tick.ts` (sourceOf passes
  it), `routes/machines.ts` (GET/PATCH /machines/hours), `Machines.tsx` (mounts the line), migration 0028.
- **Why:** the hours are the machines' rule, so they live with the laundry loop; the engine gets only a
  kind-free "not before" so it stays ignorant of machines. The modal is its own view, keeping Machines.tsx small.
- **Caps:** no pinned file touched. **Reorganizer:** none needed. No `placement-advisor` agent exists here, so the
  coordinating session placed it.

## 2026-10-05 — Lists popup with emojis (coordinating session)

- **Ask:** the Lists tab picker becomes a popup of buttons with an emoji per list, opened by tapping the tab;
  the last list stays the default.
- **Verdict:** `frontend/src/components/ListPicker.tsx` [NEW] (the popup; no state). Edits to existing owners:
  `src/shared/lists.ts` (defaultListEmoji, listEmoji — pure), `routes/lists.ts` (emoji on POST/PATCH, checked by
  `shared/emoji.ts` emojiError), `HouseholdLists.tsx` (list button, opens the popup), `HouseholdListOptions.tsx`
  (Emoji field), `App.tsx` (each Lists tap bumps a counter), migration 0027.
- **Why:** HouseholdLists.tsx was at 235/300; the popup is its own view, so it gets its own file rather than
  pushing the shell into the warning band. The emoji rule reuses the event emoji rule instead of a new one.
- **Caps:** no pinned file touched. **Reorganizer:** none needed. No `placement-advisor` agent exists in this
  checkout; placed by the coordinating session.

---

## 2026-10-05 — Movies & shows (placement-advisor; feature/movies-shows)

- **Ask:** place §7F: a shared watch list (want / watched), looked up by title, link or picture with Claude's web
  search and web fetch (US availability, nearest theaters), filled into a form and saved only on Save.
- **Verdict:** new owners `src/shared/shows.ts` (rules), `src/shared/show-reading.ts` (prompts), `src/worker/show-reader.ts`
  (pipeline), `src/worker/routes/shows.ts`, `frontend/src/components/Shows.tsx` and `ShowForm.tsx`; existing owners
  vocab.ts, claude.ts (optional `content` on askClaudeResearch), photo-reader.ts (exports imageBlock), index.ts,
  HouseholdLists.tsx; migration 0026. Rejected: the zod schema in shared (package ban); widening ItemPhoto.tsx (tied
  to list items); a Check-again route that writes in place (breaks nothing-saved-until-Save); splitting the route file.
- **Reorganizer first (two-commit rule):** the cap → key → count steps existed twice (thing-photos' spendRead, inline in
  item-photos); a third copy would let them drift. `spendPhotoRead` went into photo-reads.ts without Hono (each route
  keeps its own messages) and `householdPlace` into db.ts, in their own commit before the feature.
- **Caps:** every touched file under 300; HouseholdLists.tsx the tightest. things.ts (84 %) deliberately untouched.

---

## 2026-10-04 — Fill a thing from a pasted link (placement-advisor; feature/thing-from-link)

- **Ask:** place §7C.4b: `POST /things/read-link` (link check, the Worker fetches the page, pure HTML extraction,
  a Claude look-up with web search and web fetch, the structured reading, cleanPhotoReading, the same 40-a-day
  `photo_reads` budget, nothing saved), the thing-form button and the per-field source mark.
- **Verdict:** NEW `src/shared/link-reading.ts`, `src/worker/page-fetch.ts`, `src/worker/link-reader.ts`,
  `frontend/src/components/ThingLinkFill.tsx`; EXISTING `claude.ts` (askClaudeResearch, one shared stop / error
  mapping), `routes/thing-photos.ts` (read-link beside read-photo, one file-local budget helper), `photo-reader.ts`
  (exports thingReadingSchema so the schema is not restated), `ThingForm.tsx` (source per marked field).
- **Why:** `things.ts` is at 252/300, so the link rules got their own pure file. A separate route file would have
  copied the cap / key / count / error block. `access.ts` is only for calls home. Redirects are followed by hand with
  every hop re-checked, so a public link can't bounce the Worker to a private host. Shared stays free of `fetch(`.
- **Caps:** nothing pinned touched; claude.ts ~120, thing-photos.ts ~95, ThingForm.tsx ~222, all under 300.
- **Reorganizer:** none needed.

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

## 2026-10-04 — Sign in with my phone: phone-approved browser sign-in with number matching (placement-advisor; feature/phone-login)

PLACEMENT RECEIPT
- Feature:      §6.6, §8.13 — a browser asks to be signed in by the member's phone; the phone gets a push, opens an
  approve page and picks the number the browser shows; the waiting browser is then signed in. A "New sign-in on …"
  push after a password sign-in. Migration 0025 (§4.2x).
- New owners:   `src/shared/phone-login.ts` (limits, matchNumbers with randomness passed in, pollView / approveView /
  decide / claim, browserSummary, placeText, the notice texts; pure, imports only vocab);
  `src/worker/routes/phone-login.ts` (`/auth/phone-login` POST / GET / GET {id} / approve / deny, the waiting cookie,
  the guarded claim, sendSignInNotice; mounted in index.ts); `frontend/src/components/PhoneSignIn.tsx` (the waiting
  browser, hosted by SignIn.tsx); `frontend/src/components/ApproveLogin.tsx` (the approve page, routed by App.tsx
  like JoinPage).
- Widened:      vocab.ts (LOGIN_REQUEST_STATUS, NOTICE_KIND — not ALERT_KIND; LOGIN_VIEW added by the worker, see
  below); push.ts (selects `d.url`, PushPayload gains `url`); routes/ops.ts (hourly count `AND notice IS NULL`);
  sw.js (`data.url`, notificationclick navigates or opens it); routes/auth.ts (the one sendSignInNotice call);
  SignIn.tsx (the entry point); App.tsx (the /approve-login route).
- Unchanged:    session.ts (startSession / sha256hex / requireMember reused as they are), engine.ts, db.ts, http.ts.
- Worker's own additions (not in the verdict): `LOGIN_VIEW` in vocab.ts — the four statuses the wire carries, derived
  and never stored, kept with the other vocabulary strings (like MACHINE_STATE); the column is `match_number`, not
  `match` (an SQLite operator).

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
