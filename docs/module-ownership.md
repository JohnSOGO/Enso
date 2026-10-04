# Module ownership

The map of **which file owns which concern** (SPEC §0.9, §2.5). Placement is looked
up here before code is written — not decided mid-task, where convenience wins and
god files form. `test/architecture.test.ts` enforces it:

1. Every source file is covered by a row below (exact path, or a `*` pattern).
2. Every row names something that exists on disk.

Layering bans, purity tokens and line caps are **not** restated here — they live in
`scripts/arch.ts` (`LAYERS`, `IMPURE`, `CEILINGS`, `GLOBAL_FILE_CAP`). Doctrine and
verdicts: `docs/modularity.md`.

**Adding a concern:** if a row below owns it, put it there. If none does, adding the
new row *is* the placement decision — write it (with its one-line concern) and a
receipt in `docs/placement-receipts.md`, then the code.

## Shared — pure, imported by Worker and PWA (flow stage: rules)

| Module | Owns (one concern) |
|---|---|
| `src/shared/vocab.ts` | Every vocabulary string (§3), the member palette, the `isOneOf` guard |
| `src/shared/time.ts` | Local wall time ⇄ UTC per IANA zone, DST gap/overlap rules (§4.1) |
| `src/shared/sun.ts` | Sunset per local date and place (§7.7, NOAA solar algorithm): the `Place` type ({ lat, lon }), sunsetUtc(date, place) → UTC ISO rounded to the minute, or null when the sun does not set that day — pure, imports nothing but time.ts |
| `src/shared/recurrence.ts` | Recurrence expansion to local dates (§4.3) — the one recurrence format |
| `src/shared/optins.ts` | Optional-event rule (§7.5): isOnFor (an event exists for a member only if not optional or they have it on) and audience (who gets a fire's push: active ∩ assigned-or-everyone ∩ opted-in when optional; whether House speaks) — pure, imports nothing but vocab |
| `src/shared/holidays.ts` | The `HOLIDAYS` table, observed rule, default days off (§7.3) |
| `src/shared/emoji.ts` | The one-emoji rule (§7.6): EMOJI_MAX_BYTES (16), emojiError(v): one grapheme of emoji presentation within the byte cap, or a message — pure, imports nothing |
| `src/shared/markets.ts` | Monthly options expiration dates, Easter computus (§7.4) |
| `src/shared/chores.ts` | Chore rules: whose turn (assigneeFor), run planning, step advance/undo, a chore fire's config/person/step, input validation and limits (§7B) — pure |
| `src/shared/things.ts` | Thing rules: limits, input validation (title/note/place/address/phone/cost/link, window end ≥ start), remindersFor + planThingFires, canPlanOn, cleanPhotoReading, open-list order, photo limits + shrink constants, the Thing/PhotoReading wire types (§7C) — pure; imports engine, never the reverse |
| `src/shared/machines.ts` | The laundry loop (§7D): MACHINE_MINUTES / MACHINE_RENOTIFY_MIN / MACHINE_MAX_ALERTS / MACHINE_CHANNELS, labels, the next machine, machineState(row, now) → free/running/done, the start/move/finish/clear transitions → `{ rows, closeFire?, newFire? }` or a refusal + its text, doneMessage (incl. the waiting suffix), waitingLoad, input validation — pure; imports engine + vocab + time, never the reverse |
| `src/shared/engine.ts` | The alert engine: plan, step, act, timer commands (§5) — pure + pushActions(kind) |
| `src/shared/lists.ts` | Household list rules: itemKey, add/re-open decision, item clash, list-name clash, who may rename/delete a list (canManageList), text/note/name limits, LISTS_MAX, SHOPPING_LIST_ID, 30-day visible window (§7A.1) — pure |
| `src/shared/recipes.ts` | Recipe rules (§7E): limits (INGREDIENT_MAX derived from lists TEXT_MAX; title / ingredients / steps / servings / time), youtubeVideoId and the derived watchUrl / thumbnailUrl, parseRecipeInput, isFound, the duplicate-video clash, RecipeRow / Recipe / RecipeEmoji / RecipeEmojiRow and recipeFromRow. Pure; imports lists and vocab only |
| `src/shared/recipe-reading.ts` | Reading a recipe from a video (§7E.2, §7E.2b, §7E.2c): TRANSCRIPT_MAX, PASTED_MAX, COMMENTS_LOOKED_AT / CREATOR_COMMENTS_MAX, RECIPE_READS_PER_DAY, UNTITLED_VIDEO; VideoText and sourcesOf / hasRecipeText; creatorComments; cleanTranscript; SCREENSHOTS_MAX / SCREENSHOT_TYPES / Screenshot and parseScreenshots; RecipeReading and cleanRecipeReading; captions from home — wantsHomeCaptions, CaptionsReport / parseCaptionsReport, CAPTIONS_REPORT_REASON_MAX, homeCaptionsError and HOME_CAPTIONS_OFF. Pure; imports recipes (limits), things (photo limits) and vocab only; recipes.ts never imports it |
| `src/shared/recipe-emoji.ts` | Each person's emoji on a recipe (§7E.5): USED_EMOJIS_MAX, myEmoji, byMyEmoji (the By emoji order), usedEmojis (the picker's household chips) — pure; imports recipes (types) only |
| `src/shared/ops.ts` | Pinging the founder from outside (§9.4): OPS_TEXT_MAX (200), OPS_TITLE_MAX (60), OPS_TITLE_DEFAULT ("🤖 Claude"), OPS_NOTIFY_PER_HOUR (30), opsNotifyError({ text, title }), opsTitle(title?) → the trimmed title or the default, opsWindowStart(now) → now minus 1 h — pure, imports nothing |
| `src/shared/announce.ts` | House announcements (§9.3): ANNOUNCE_MAX, ANNOUNCE_TITLE, announceError (text trimmed 1..max, channels a non-empty set of CHANNEL), announceMessage → "{name} says: {text}" — pure, imports only vocab |
| `src/shared/invite-link.ts` | The invite link format (§6.2a): `JOIN_PATH`, build `{origin}/join#{code}`, take the code from a pasted link or a bare code — pure |

## Worker (flow stages: route → persist → deliver)

| Module | Owns (one concern) |
|---|---|
| `src/worker/index.ts` | Hono app assembly, route mounting, `/health`, `/dev/tick`, `scheduled()` entry |
| `src/worker/env.ts` | Bindings + secrets type |
| `src/worker/db.ts` | D1 helpers and id minting |
| `src/worker/http.ts` | Error envelope (§10) and input checks, including photoBody: the raw image body or a 400 naming what is wrong with it (type, size, empty; §7C.3) |
| `src/worker/session.ts` | Password hashing, session cookie, `requireMember` / owner guards |
| `src/worker/tick.ts` | `tick()` orchestration: load rows, call the engine, write results, deliveries (§5.6–5.7), chore run planning (§7B.3), thing reminder planning (§7C.2), a machine fire's source (owner, done message, §7D.3); step 3 sendPushDeliveries, step 4 sendHouseDeliveries |
| `src/worker/push.ts` | Web Push delivery (§9.1): for queued push deliveries and /push/test, builds the payload { fireId, kind, tag, title, body, actions } (tag: fireId / the delivery id when there is no fire, an announcement or a ping / 'enso-test'; never a Topic header; a fire-less delivery's title is its `deliveries.title` (§9.4) or ANNOUNCE_TITLE), sends to each of the member's subscriptions via web-push.ts, records results (201 → sent + last_ok_at; 404/410 → delete the subscription; else failed with status + body, last_error; none → no_subscription; keys missing → failed, visibly) |
| `src/worker/access.ts` | Calling home through Cloudflare Access (§9.2, §7E.2c, §7A.3): the two CF-Access headers, redirect 'manual', AbortSignal.timeout, 2xx only → { ok: true, text } or an honest reason ("HTTP n: body ≤ 200" / "error: message"); never throws, never names a secret, never decides; no D1, no Hono |
| `src/worker/house.ts` | House delivery (§9.2): houseConfigOf, drain with a conditional per-row claim, speak via HA (two POSTs with Bearer HA_TOKEN through access.ts; 2xx → "ok", else access.ts's reason), classifyHouse, houseState for /status — no Hono, never decides what is sent |
| `src/worker/home-captions.ts` | Captions from home (§7E.2c): homeCaptionsConfigOf, readCaptionsFromHome: one GET with Bearer CAPTIONS_TOKEN through access.ts (HOME_CAPTIONS_TIMEOUT_MS), the body checked by parseCaptionsReport → text or an honest failure reason; never throws, never names a secret, never decides whether to ask or what is saved; no D1, no Hono |
| `src/worker/web-push.ts` | Web Push protocol (RFC 8291/8292) — the only importer of `@block65/webcrypto-web-push`: encrypt the payload, VAPID headers cached per push-service origin (~1 h, expiry checked against a passed-in `now`), ttl 3600 / urgency high / topic (≤ 32 url-safe chars), one POST to one subscription → its status + body text; no D1, never decides what is sent or what a result means (§9.1) |
| `src/worker/routes/auth.ts` | Setup, login/logout, signup, invite preview, rate limit, `/me` |
| `src/worker/routes/members.ts` | Members list/disable, invites; exports FOUNDER_SQL (§6.3, the founder derived, also read by routes/ops.ts) |
| `src/worker/event-rows.ts` | The event row (§4.2): EventRow + eventView, EventInput + parseEventInput, insertEventStatement, removeFutureFires, every event_optins read/write — no Hono, no routes |
| `src/worker/routes/events.ts` | `/calendar` and event CRUD + exdates |
| `src/worker/routes/optins.ts` | `/optional-events`, `/events/{id}/optin` PUT/DELETE — a member's own switch on an optional event (§7.5, §10) |
| `src/worker/routes/alarms.ts` | `/alarms` — scheduled alarms as `is_alarm` events (§4.2a) |
| `src/worker/routes/alerts.ts` | Timers + commands, fires + actions |
| `src/worker/routes/household.ts` | Household settings, days off, `/status` (incl. `house` from houseState), `/push/*` (vapid-key, subscriptions, test) |
| `src/worker/routes/ops.ts` | `POST /ops/notify` (§9.4): a file-local constant-time Bearer OPS_NOTIFY_TOKEN check (unset or empty → 503 `ops_notify_off`, wrong → 401), validate, the founder as recipient, the hourly limit counted from deliveries rows, one fire-less `push` delivery with `title`, sendPushDeliveries, answer `{ deliveries: [{ id, status, detail }] }`; no session, no house row |
| `src/worker/routes/announce.ts` | `POST /announce` (§9.3): validate, the sender's name from the session, one batch of fire-less deliveries (one `house`; one `push` per audience member but the sender), then sendPushDeliveries, read the 201 body, then waitUntil an id-restricted sendHouseDeliveries |
| `src/worker/routes/lists.ts` | `/lists`, `/lists/{id}`, `/lists/{id}/items`, `/list-items/{id}` — list CRUD and list item CRUD (§7A, §10) |
| `src/worker/routes/chores.ts` | `/chores`, `/chores/today`, `/chore-runs/{id}/done\|undo` — chore CRUD, today's runs, step done/undo and edit re-plan persistence (§7B, §10) |
| `src/worker/routes/machines.ts` | `GET /machines`, `POST /machines/{id}/start\|move\|finish\|clear` (§7D, §10): validate, call the machines.ts transition, save it in one batch (machine rows guarded by their `started_at` as read + updateFire close + insertFire) → 409 `conflict` when another tap won; the only closer of machine fires |
| `src/worker/routes/things.ts` | `/things`, `/things/{id}`, `/things/{id}/plan` — thing CRUD, Plan it (event + thing + fire closes in one batch), closing a thing's scheduled fires on edit/delete (§7C, §10) |
| `src/worker/routes/thing-photos.ts` | `/things/{id}/photo` (R2 put/get/delete, private) and `/things/read-photo` (the §7C.4 check order: photoBody from http.ts, the daily cap via photo-reads.ts, key present, count the read, then photo-reader.ts; error mapping) (§7C.3–7C.4) |
| `src/worker/photo-reads.ts` | The household's daily photo-read budget (§7C.4, §7A.3): today in the household zone, used-up check over photo_reads, record one read |
| `src/worker/routes/recipes.ts` | `/recipes`, `/recipes/{id}`, `/recipes/from-video` — recipe CRUD and the read-from-video pipeline (dup check, daily cap via recipe_reads, keys present, YouTube, captions and the creator's comments side by side, Claude, cleaned, saved with captions_error / comments_error); from-video is the one place SogoAI is asked for captions, in-line — the file-local captionsFor: readCaptions, then on `blocked` (wantsHomeCaptions) home-captions.ts, or HOME_CAPTIONS_OFF when not configured (§7E.2c); `/recipes/{id}/transcript`, the re-read from a transcript pasted or screenshotted (§7E.2b: the recipe / video / text checks, the same daily-cap helper, keys present, then recipe-reread.ts; each outcome kind → its status and message; screenshots read, never stored); `PUT/DELETE /recipes/{id}/emoji`, the signed-in member's own emoji (emojiError, upsert, updated_at untouched); every recipe answered carries everyone's emojis through one helper (§7E, §7E.5, §10) |
| `src/worker/recipe-reread.ts` | Re-reading a video recipe in place (§7E.2b): re-fetch the video and the creator's comments, count the read, Claude via recipe-reader.ts (the pasted text in the captions slot), cleanRecipeReading, found false → nothing changes, else the one UPDATE; returns an outcome kind + reason, never HTTP; no Hono |
| `src/worker/claude.ts` | The one Claude API call — the only importer of `@anthropic-ai/sdk` and zod (lazy import): model CLAUDE_MODEL, structured output from a caller-given schema builder, refusal fallback beta, maps refusal / cut off / unexpected shape / API error to an honest failure; `fetch` injectable for tests; no prompts, never decides what is saved |
| `src/worker/photo-reader.ts` | Reads one photo via claude.ts: the photo prompt, schema and image block; returns raw fields or an honest failure; never decides what is saved (§7C.4) |
| `src/worker/recipe-reader.ts` | Reads a recipe out of a video's description, captions (or a transcript pasted or screenshotted — the screenshots as image blocks, with one prompt line saying what they are) and the creator's comments with Claude via claude.ts: the prompt (never invent a recipe from the title; `found` false when the text holds none) and its schema; returns raw fields or an honest failure (§7E) |
| `src/worker/youtube.ts` | YouTube Data API v3: `videos.list?part=snippet` → { title, channel, channelId, description }, and `commentThreads.list` top-level comments → [{ authorChannelId, text }]; each an honest failure (not found / quota / none / failed + reason); key never in a reason; `fetch` injectable; never decides what is saved |
| `src/worker/youtube-captions.ts` | The unofficial captions attempt for one video id → transcript text or an honest failure + reason (blocked / none / failed); no key, never throws, deletable on its own (§7E) |

## PWA (flow stage: render + capture intent)

| Module | Owns (one concern) |
|---|---|
| `frontend/src/components/AppRefresh.tsx` | Always-fresh (§8.10): reload on resume unless a `dialog[open]` exists, pull-to-refresh gesture on the active scroll area + its pill — no app state, no data fetching |
| `frontend/src/main.tsx` | React root mount; starts the service worker registration (push-client.ts) |
| `frontend/src/push-client.ts` | Browser push plumbing (§9.1): registers `/sw.js` (scope `/`, updateViaCache none), this browser's facts (supported, iOS-not-standalone, permission, current subscription), Turn on (permission → subscribe → POST /push/subscriptions) and Turn off (unsubscribe → DELETE) via api.ts — no React, no app state |
| `frontend/src/App.tsx` | The frame (§8.1): Ringing bar, badges, tabs, ＋ button |
| `frontend/src/api.ts` | HTTP transport to the Worker; every failure an `ApiError` with a message |
| `frontend/src/state.tsx` | App-wide state context + freshness polling (§10) — the home for cross-cutting client state |
| `frontend/src/theme.css` | Theme tokens (§8.7) and global base styles |
| `frontend/src/css-modules.d.ts` | Type shim for `*.module.css` imports |
| `frontend/src/components/Calendar.tsx` | Continuous calendar view (§7.1–7.2) |
| `frontend/src/components/DaySheet.tsx` | Day sheet modal (§8.3) |
| `frontend/src/components/EventForm.tsx` | Event form modal (§8.4) |
| `frontend/src/components/RepeatFields.tsx` | The event form's Repeat section (§8.4): repeat select, weekday chips, until; Recurrence ⇄ form mapping, certain-weeks chips, repeatText |
| `frontend/src/components/ReminderFields.tsx` | The event form's Reminder section (§8.4): reminder select incl. the evening-before option, Remind via Phone/House, repeat-the-alert select; reminder ⇄ form mapping |
| `frontend/src/components/OptionalItems.tsx` | Settings → Me → Optional calendar items: the built-in Public holidays and 📈 rows via PATCH /me, then GET /optional-events, one line per event (emoji, title, repeatText), On switch → PUT/DELETE /events/{id}/optin (§8.6) |
| `frontend/src/components/Alarms.tsx` | Alarms tab: scheduled alarm list + alarm form (§8.5) |
| `frontend/src/components/Announce.tsx` | The 📢 Announce button at the top of the Alarms tab and its box: message (≤ ANNOUNCE_MAX), ChannelChecks, Send → POST /announce, the refusal inside the box (§8.5, §9.3) |
| `frontend/src/components/Timers.tsx` | Rolling timers list + timer form (§8.5) |
| `frontend/src/components/Machines.tsx` | The Machines section of the Alarms tab (§8.5): one card per machine (state badge, whose load, done-at; Start / Move to dryer / Fold & out / Clear) and `MachineChooser`, the whose-load + minute-chip modal the Ringing bar reuses for Move (§8.2) |
| `frontend/src/components/Chores.tsx` | Chores section of the Alarms tab (§8.5) |
| `frontend/src/components/ChoreForm.tsx` | Chore form modal: days, at/by, people turn order, steps (§8.5) |
| `frontend/src/components/AlertFields.tsx` | Fields shared by the alarm, timer and chore forms: day chips + days text, channel checkboxes, repeat-alert options (§8.5) |
| `frontend/src/components/HouseholdLists.tsx` | Lists tab: list picker (Today + Things to do + lists + ＋ New list…, ⋯) composing ChoresToday / ThingsToDo / HouseholdListOptions, the list panel (add box, rows, Done) (§8.8) |
| `frontend/src/components/HouseholdListItemForm.tsx` | The list item form modal: text, note, Assigned to (one member or Nobody), Save / Cancel / Delete (§8.8); owns the `Item` shape |
| `frontend/src/components/HouseholdListOptions.tsx` | Lists tab list management: the new-list form and the ⋯ list options (rename, delete with its open-item count) modals (§8.8) |
| `frontend/src/components/ChoresToday.tsx` | Lists → Today: today's chore runs, Mine \| Everyone, tick/undo a step (§8.8) |
| `frontend/src/components/ThingsToDo.tsx` | Lists → Things to do: open rows (window text, 📅 planned date, 📷, ⏰), "Done & let go", ＋ Add, opens ThingForm (§8.11) |
| `frontend/src/components/ThingForm.tsx` | The thing form modal: title, dates, place, link, note, reminders + channels, fill-empty-fields from a photo reading marked "from photo — check it", Done / Let it go / Put back, Save / Cancel / Delete (§8.11) |
| `frontend/src/components/Grow.tsx` | A textarea that grows to fit its text; `oneLine` (Enter does nothing, pasted line breaks become spaces) (§8.11, §8.12) |
| `frontend/src/components/ThingPlan.tsx` | Plan it: a date (+ optional time) → `POST /things/{id}/plan`; the refusal shown inside (§7C.2) |
| `frontend/src/components/ThingPhoto.tsx` | A thing's photo: PhotoField + the read-photo fill (`POST /things/read-photo`, "Filled n empty fields…"), `photoSrc`; and `FromThing`, the "From Things to do" block for the event form (§7C.3, §8.4, §8.11) |
| `frontend/src/components/PhotoField.tsx` | A photo inside a form (§8.8, §8.11): hidden file input (camera/library), lazy shrink-photo, the waiting photo's object URL, Thumb (tap for full size inside the dialog), Add / Replace / Remove, an optional read step with its status and refusal — no API path of its own |
| `frontend/src/components/Recipes.tsx` | Recipes tab: paste-a-link box → POST /recipes/from-video, ＋ Type a recipe, the recipe rows with my emoji, the Newest \| By emoji chips (byMyEmoji; remembered in localStorage `enso.recipeSort`); opens RecipeView / RecipeForm (§8.12) |
| `frontend/src/components/RecipeView.tsx` | One recipe (modal): thumbnail, ▶ link to the video, ingredients with pick boxes → Add to Shopping (one POST /lists/{SHOPPING_LIST_ID}/items each, the added / already-there / failed summary inside), steps, the source note (description / captions / "the creator's comment", joined "A, B and C") and any "captions couldn't be read" / "comments couldn't be read" marker, ✎; everyone's emoji ("Shelly 🌶 · John ⭐", member order, "Someone" when unknown) and hosts RecipeEmoji; hosts RecipeTranscript on a "watch it" video recipe or one whose captions couldn't be read (§7E.2b); READ_FROM (exported, R20) names `transcript` "pasted transcript" (§8.12) |
| `frontend/src/components/RecipeTranscript.tsx` | The transcript given by hand (§8.12, §7E.2b): 📷 Add transcript screenshots (1–SCREENSHOTS_MAX, shrunk to JPEG with shrink-photo like a thing's photo, thumbnails with ✕), the hint, "or paste the text" (a Grow box, collapsed); Read it → POST /recipes/{id}/transcript with base64 screenshots and/or text; the refusal in place; hands back the updated Recipe |
| `frontend/src/components/RecipeEmoji.tsx` | My emoji on a recipe (§8.12): household chips (usedEmojis), a one-emoji input, Set / Clear → PUT/DELETE /recipes/{id}/emoji, the refusal in place; hands back the updated Recipe |
| `frontend/src/components/RecipeForm.tsx` | The recipe form (modal): title, ingredients and steps one per line (Grow), servings, time; Save / Cancel / Delete (§8.12) |
| `frontend/src/shrink-photo.ts` | Shrinks a picked image on the phone to PHOTO_LONG_SIDE px, JPEG PHOTO_QUALITY, via canvas (§7C.3) — no app state |
| `frontend/src/components/RingingBar.tsx` | Ringing bar (§8.2) |
| `frontend/src/components/Settings.tsx` | Settings: Me, Household, Status (§8.6) |
| `frontend/src/components/PhoneAlerts.tsx` | Settings → Me → Phone alerts row (§9.1): this phone's state (on / off / blocked / iPhone: add to Home Screen first / not supported / not set up), Turn on from the tap, Turn off, Send a test; calls refresh() so the 📵 badge follows |
| `frontend/src/components/useAction.tsx` | Runs an async action, tracks busy, renders its failure in place (`role="alert"`) — the Settings sections' action hook |
| `frontend/src/components/Invites.tsx` | Settings → Household → Invites: create, list with states, revoke (§8.9) |
| `frontend/src/components/InviteCard.tsx` | The one-time invite card modal: lazy `uqr` QR, Share, Copy link, the code (§8.9) — the only importer of `uqr` |
| `frontend/src/components/SignIn.tsx` | Setup, sign in, sign up with a typed or pasted invite code |
| `frontend/src/components/JoinPage.tsx` | The join page at `/join#CODE`: read + clear the fragment, preview, signup form, dead-link state (§8.9) |
| `frontend/src/components/Welcome.tsx` | The one-time welcome card and its per-member-per-device seen flag (§8.9) |
| `frontend/src/components/Modal.tsx` | The one centred `<dialog>` modal primitive |
| `frontend/src/*.module.css` | Styles for the same-named component |
| `frontend/src/components/*.module.css` | Styles for the same-named component; `Lists.module.css` = shared single-line list tables and tick rows |

## Home (SogoAI — runs on the home PC, never in the Worker)

| Module | Owns (one concern) |
|---|---|
| `home/captions-helper.ts` | The SogoAI captions helper (§7E.2c): `handle` — only GET /captions?v=…, the Bearer CAPTIONS_TOKEN compared in constant time, then readCaptions from the home IP → 200 with the CaptionsResult as it came (401 / 400 / 404 / 405 otherwise), one log line per request, never the token; `main` — the only node:http user, 127.0.0.1:8790, reached through the `sogoai` tunnel; node:http + Node globals + youtube-captions.ts only, bundled by `npm run build:home`; never decides what is saved |

## Tooling

| Module | Owns (one concern) |
|---|---|
| `scripts/arch.ts` | Architecture caps, layering bans, source scan (§2.5) |
| `scripts/arch-types.ts` | Shapes of the scan, Node-free so the workerd test can import them |
| `scripts/arch-audit.ts` | `npm run arch:audit` headroom report |
| `scripts/draw-enso.mjs` | Draws the Ensō mark into `frontend/public/icon.svg` (§8.10) — our own drawing, regenerated, never hand-edited |
| `scripts/seed-dev.mjs` | Local dev seed data (`npm run seed:dev`) |
