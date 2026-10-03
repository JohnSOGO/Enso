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

## Shared — pure, imported by Worker, PWA and relay (flow stage: rules)

| Module | Owns (one concern) |
|---|---|
| `src/shared/vocab.ts` | Every vocabulary string (§3), the member palette, the `isOneOf` guard |
| `src/shared/time.ts` | Local wall time ⇄ UTC per IANA zone, DST gap/overlap rules (§4.1) |
| `src/shared/recurrence.ts` | Recurrence expansion to local dates (§4.3) — the one recurrence format |
| `src/shared/holidays.ts` | The `HOLIDAYS` table, observed rule, default days off (§7.3) |
| `src/shared/markets.ts` | Monthly options expiration dates, Easter computus (§7.4) |
| `src/shared/chores.ts` | Chore rules: whose turn (assigneeFor), run planning, step advance/undo, a chore fire's config/person/step, input validation and limits (§7B) — pure |
| `src/shared/things.ts` | Thing rules: limits, input validation (title/note/place/link, window end ≥ start), remindersFor + planThingFires, canPlanOn, cleanPhotoReading, open-list order, photo limits + shrink constants, the Thing/PhotoReading wire types (§7C) — pure; imports engine, never the reverse |
| `src/shared/engine.ts` | The alert engine: plan, step, act, timer commands (§5) — pure |
| `src/shared/lists.ts` | Household list rules: itemKey, add/re-open decision, item clash, list-name clash, who may rename/delete a list (canManageList), text/note/name limits, LISTS_MAX, SHOPPING_LIST_ID, 30-day visible window (§7A.1) — pure |
| `src/shared/invite-link.ts` | The invite link format (§6.2a): `JOIN_PATH`, build `{origin}/join#{code}`, take the code from a pasted link or a bare code — pure |

## Worker (flow stages: route → persist → deliver)

| Module | Owns (one concern) |
|---|---|
| `src/worker/index.ts` | Hono app assembly, route mounting, `/health`, `/dev/tick`, `scheduled()` entry |
| `src/worker/env.ts` | Bindings + secrets type |
| `src/worker/db.ts` | D1 helpers and id minting |
| `src/worker/http.ts` | Error envelope (§10) and input checks |
| `src/worker/session.ts` | Password hashing, session cookie, `requireMember` / owner guards |
| `src/worker/tick.ts` | `tick()` orchestration: load rows, call the engine, write results, deliveries (§5.6–5.7), chore run planning (§7B.3), thing reminder planning (§7C.2) |
| `src/worker/push.ts` | Web Push sending (§9.1) |
| `src/worker/routes/auth.ts` | Setup, login/logout, signup, invite preview, rate limit, `/me` |
| `src/worker/routes/members.ts` | Members list/disable, invites |
| `src/worker/routes/events.ts` | `/calendar` and event CRUD + exdates |
| `src/worker/routes/alarms.ts` | `/alarms` — scheduled alarms as `is_alarm` events (§4.2a) |
| `src/worker/routes/alerts.ts` | Timers + commands, fires + actions |
| `src/worker/routes/household.ts` | Household settings, days off, school holidays, push subscriptions, `/status` |
| `src/worker/routes/relay.ts` | `/relay/claim`, `/relay/report` (§9.2) |
| `src/worker/routes/lists.ts` | `/lists`, `/lists/{id}`, `/lists/{id}/items`, `/list-items/{id}` — list CRUD and list item CRUD (§7A, §10) |
| `src/worker/routes/chores.ts` | `/chores`, `/chores/today`, `/chore-runs/{id}/done\|undo` — chore CRUD, today's runs, step done/undo and edit re-plan persistence (§7B, §10) |
| `src/worker/routes/things.ts` | `/things`, `/things/{id}`, `/things/{id}/plan` — thing CRUD, Plan it (event + thing + fire closes in one batch), closing a thing's scheduled fires on edit/delete (§7C, §10) |
| `src/worker/routes/thing-photos.ts` | `/things/{id}/photo` (R2 put/get/delete, private) and `/things/read-photo` (size/type check, daily cap via photo_reads, error mapping) (§7C.3–7C.4) |
| `src/worker/photo-reader.ts` | Reads one photo with the Claude API — the only importer of `@anthropic-ai/sdk` (lazy import); returns raw fields or an honest failure (off / refused / failed + reason); never decides what is saved (§7C.4) |

## PWA (flow stage: render + capture intent)

| Module | Owns (one concern) |
|---|---|
| `frontend/src/components/AppRefresh.tsx` | Always-fresh (§8.10): reload on resume unless a `dialog[open]` exists, pull-to-refresh gesture on the active scroll area + its pill — no app state, no data fetching |
| `frontend/src/main.tsx` | React root mount |
| `frontend/src/App.tsx` | The frame (§8.1): Ringing bar, badges, tabs, ＋ button |
| `frontend/src/api.ts` | HTTP transport to the Worker; every failure an `ApiError` with a message |
| `frontend/src/state.tsx` | App-wide state context + freshness polling (§10) — the home for cross-cutting client state |
| `frontend/src/theme.css` | Theme tokens (§8.7) and global base styles |
| `frontend/src/css-modules.d.ts` | Type shim for `*.module.css` imports |
| `frontend/src/components/Calendar.tsx` | Continuous calendar view (§7.1–7.2) |
| `frontend/src/components/DaySheet.tsx` | Day sheet modal (§8.3) |
| `frontend/src/components/EventForm.tsx` | Event form modal (§8.4) |
| `frontend/src/components/RepeatFields.tsx` | The event form's Repeat section (§8.4): repeat select, weekday chips, until; Recurrence ⇄ form mapping |
| `frontend/src/components/Alarms.tsx` | Alarms tab: scheduled alarm list + alarm form (§8.5) |
| `frontend/src/components/Timers.tsx` | Rolling timers list + timer form (§8.5) |
| `frontend/src/components/Chores.tsx` | Chores section of the Alarms tab (§8.5) |
| `frontend/src/components/ChoreForm.tsx` | Chore form modal: days, at/by, people turn order, steps (§8.5) |
| `frontend/src/components/AlertFields.tsx` | Fields shared by the alarm, timer and chore forms: day chips + days text, channel checkboxes, repeat-alert options (§8.5) |
| `frontend/src/components/HouseholdLists.tsx` | Lists tab: list picker (Today + Things to do + lists + ＋ New list…, ⋯) composing ChoresToday / ThingsToDo / HouseholdListOptions, the list panel (add box, rows, Done) (§8.8) |
| `frontend/src/components/HouseholdListItemForm.tsx` | The list item form modal: text, note, Assigned to (one member or Nobody), Save / Cancel / Delete (§8.8); owns the `Item` shape |
| `frontend/src/components/HouseholdListOptions.tsx` | Lists tab list management: the new-list form and the ⋯ list options (rename, delete with its open-item count) modals (§8.8) |
| `frontend/src/components/ChoresToday.tsx` | Lists → Today: today's chore runs, Mine \| Everyone, tick/undo a step (§8.8) |
| `frontend/src/components/ThingsToDo.tsx` | Lists → Things to do: open rows (window text, 📅 planned date, 📷, ⏰), "Done & let go", ＋ Add, opens ThingForm (§8.11) |
| `frontend/src/components/ThingForm.tsx` | The thing form modal: title, dates, place, link, note, reminders + channels, fill-empty-fields from a photo reading marked "from photo — check it", Done / Let it go / Put back, Save / Cancel / Delete (§8.11) |
| `frontend/src/components/ThingPlan.tsx` | Plan it: a date (+ optional time) → `POST /things/{id}/plan`; the refusal shown inside (§7C.2) |
| `frontend/src/components/ThingPhoto.tsx` | A thing's photo: pick (camera/library), shrink, thumbnail, full size inside the dialog, remove/replace, the read-photo request; and `FromThing`, the "From Things to do" block for the event form (§7C.3, §8.4, §8.11) |
| `frontend/src/shrink-photo.ts` | Shrinks a picked image on the phone to PHOTO_LONG_SIDE px, JPEG PHOTO_QUALITY, via canvas (§7C.3) — no app state |
| `frontend/src/components/RingingBar.tsx` | Ringing bar (§8.2) |
| `frontend/src/components/Settings.tsx` | Settings: Me, Household, Status (§8.6) |
| `frontend/src/components/useAction.tsx` | Runs an async action, tracks busy, renders its failure in place (`role="alert"`) — the Settings sections' action hook |
| `frontend/src/components/Invites.tsx` | Settings → Household → Invites: create, list with states, revoke (§8.9) |
| `frontend/src/components/InviteCard.tsx` | The one-time invite card modal: lazy `uqr` QR, Share, Copy link, the code (§8.9) — the only importer of `uqr` |
| `frontend/src/components/SignIn.tsx` | Setup, sign in, sign up with a typed or pasted invite code |
| `frontend/src/components/JoinPage.tsx` | The join page at `/join#CODE`: read + clear the fragment, preview, signup form, dead-link state (§8.9) |
| `frontend/src/components/Welcome.tsx` | The one-time welcome card and its per-member-per-device seen flag (§8.9) |
| `frontend/src/components/Modal.tsx` | The one centred `<dialog>` modal primitive |
| `frontend/src/*.module.css` | Styles for the same-named component |
| `frontend/src/components/*.module.css` | Styles for the same-named component; `Lists.module.css` = shared single-line list tables and tick rows |

## Relay (flow stage: deliver to the house)

| Module | Owns (one concern) |
|---|---|
| `relay/relay.ts` | Poll loop: claim, speak on Echos + Voice PE, report (§9.2) |
| `relay/classify.ts` | `classifyResult` — the relay side of the report contract |

## Tooling

| Module | Owns (one concern) |
|---|---|
| `scripts/arch.ts` | Architecture caps, layering bans, source scan (§2.5) |
| `scripts/arch-types.ts` | Shapes of the scan, Node-free so the workerd test can import them |
| `scripts/arch-audit.ts` | `npm run arch:audit` headroom report |
| `scripts/draw-enso.mjs` | Draws the Ensō mark into `frontend/public/icon.svg` (§8.10) — our own drawing, regenerated, never hand-edited |
| `scripts/seed-dev.mjs` | Local dev seed data (`npm run seed:dev`) |
