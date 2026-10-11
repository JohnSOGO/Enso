# Placement receipts

One entry per placement-advisor verdict (every code change since 2026-10-05), plus
reorganizer and code-steward runs, newest first.
The receipt records the decision; `docs/module-ownership.md` and `scripts/arch.ts`
carry its result.

---

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
