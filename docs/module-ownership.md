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
| `src/shared/engine.ts` | The alert engine: plan, step, act, timer commands (§5) — pure |
| `src/shared/lists.ts` | Household list rules: itemKey, add/re-open decision, text/note limits, 30-day visible window (§7A.1) — pure |

## Worker (flow stages: route → persist → deliver)

| Module | Owns (one concern) |
|---|---|
| `src/worker/index.ts` | Hono app assembly, route mounting, `/health`, `/dev/tick`, `scheduled()` entry |
| `src/worker/env.ts` | Bindings + secrets type |
| `src/worker/db.ts` | D1 helpers and id minting |
| `src/worker/http.ts` | Error envelope (§10) and input checks |
| `src/worker/session.ts` | Password hashing, session cookie, `requireMember` / owner guards |
| `src/worker/tick.ts` | `tick()` orchestration: load rows, call the engine, write results, deliveries (§5.6–5.7) |
| `src/worker/push.ts` | Web Push sending (§9.1) |
| `src/worker/routes/auth.ts` | Setup, login/logout, signup, rate limit, `/me` |
| `src/worker/routes/members.ts` | Members list/disable, invites |
| `src/worker/routes/events.ts` | `/calendar` and event CRUD + exdates |
| `src/worker/routes/alarms.ts` | `/alarms` — scheduled alarms as `is_alarm` events (§4.2a) |
| `src/worker/routes/alerts.ts` | Timers + commands, fires + actions |
| `src/worker/routes/household.ts` | Household settings, days off, school holidays, push subscriptions, `/status` |
| `src/worker/routes/relay.ts` | `/relay/claim`, `/relay/report` (§9.2) |
| `src/worker/routes/lists.ts` | `/lists/{list}` and `/list-items/{id}` — list item CRUD (§7A, §10) |

## PWA (flow stage: render + capture intent)

| Module | Owns (one concern) |
|---|---|
| `frontend/src/main.tsx` | React root mount |
| `frontend/src/App.tsx` | The frame (§8.1): Ringing bar, badges, tabs, ＋ button |
| `frontend/src/api.ts` | HTTP transport to the Worker; every failure an `ApiError` with a message |
| `frontend/src/state.tsx` | App-wide state context + freshness polling (§10) — the home for cross-cutting client state |
| `frontend/src/theme.css` | Theme tokens (§8.7) and global base styles |
| `frontend/src/css-modules.d.ts` | Type shim for `*.module.css` imports |
| `frontend/src/components/Calendar.tsx` | Continuous calendar view (§7.1–7.2) |
| `frontend/src/components/DaySheet.tsx` | Day sheet modal (§8.3) |
| `frontend/src/components/EventForm.tsx` | Event form modal (§8.4) |
| `frontend/src/components/Alarms.tsx` | Alarms tab: scheduled alarm list + alarm form (§8.5) |
| `frontend/src/components/Timers.tsx` | Rolling timers list + timer form (§8.5) |
| `frontend/src/components/HouseholdLists.tsx` | Lists tab: Shopping / Wish list toggle, item rows, item form modal (§8.8) |
| `frontend/src/components/RingingBar.tsx` | Ringing bar (§8.2) |
| `frontend/src/components/Settings.tsx` | Settings: Me, Household, Status (§8.6) |
| `frontend/src/components/SignIn.tsx` | Setup, sign in, sign up |
| `frontend/src/components/Modal.tsx` | The one centred `<dialog>` modal primitive |
| `frontend/src/*.module.css` | Styles for the same-named component |
| `frontend/src/components/*.module.css` | Styles for the same-named component; `Lists.module.css` = shared single-line list tables |

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
| `scripts/seed-dev.mjs` | Local dev seed data (`npm run seed:dev`) |
