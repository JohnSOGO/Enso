# Ensō — Specification v2

**Version:** 2.62 · **Date:** 2026-10-06 · **Owner:** MojoSOGO
**Supersedes:** v1.0-draft (kept at `docs/archive/SPEC-v1.0-draft.md` for reference only — do not build from it)

Items marked **⚑ DEFAULT** are best guesses awaiting MojoSOGO's confirmation. Build
them as written; they are isolated so changing one later is a small edit.

**Spec first, always.** Every change to behavior, schema, API or screens is written
here *before* it is built, and the code is then built to match. See `CLAUDE.md`.

---

## 0. Rules for the implementing agent

Read this section first. It exists because the previous build attempt failed on
exactly these points.

1. **Build milestones in order (§11).** Each ends with acceptance checks. Do not
   start the next milestone until the current one's checks pass.
2. **§3 is the only place a vocabulary is defined.** Every state, channel, action
   and status string lives in `src/shared/vocab.ts` and is imported everywhere —
   server, frontend, tests. Never type one of those strings as a literal
   anywhere else.
3. **The engine (§5) is pure.** No database, no `fetch`, no `Date.now()` inside it.
   `now` is always a parameter. This is what makes it testable.
4. **One runtime.** The backend is a Cloudflare Worker, in dev too (`wrangler dev`
   gives a local D1). There is no Node server and no database abstraction layer.
5. **Derive, don't restate.** Tests apply the real `migrations/` folder; they never
   contain their own copy of the schema. Lists of files, holidays, states, etc. are
   computed or imported, never hand-copied.
6. **Out of scope means absent.** Anything in §12 is not built and not stubbed.
7. **If this spec is ambiguous or wrong, stop and ask.** Do not invent behavior.
8. **A fallback must be visible.** A failed push, an unreachable Home Assistant, an unknown value
   renders as an honest marker ("House failing since 14:02"), never
   a plausible substitute or silence.
9. **Placement before code.** Which file owns new code is looked up in
   `docs/module-ownership.md`, not decided mid-task. A new file needs a new owner
   row first. `test/architecture.test.ts` enforces the map, the layering bans, the
   purity of `src/shared/`, and the line caps (§2.5).

---

## 1. What it is

**Ensō** (円相) — the Zen circle drawn in one unforced stroke. The household runs on
loops: laundry (wear → wash → dry → put away → wear), shopping (need → buy → use up →
need), timers that restart on Ack, chores that rotate. The name is the product's
shape: loops kept turning without strain (wu wei). Written **Ensō** in the UI; `enso`
wherever ASCII is required (Worker, database, package, storage keys).

A calendar PWA for one household. It has three kinds of alert:

| Kind | What it does | Where it lives | Example |
|------|--------------|----------------|---------|
| **Event reminder** | Fires before/at a calendar event. | On the calendar, inside the event | "Dentist" at 14:30, remind 30 min before |
| **Scheduled alarm** | Fires at a set time on chosen **days of the week**, every week. Not a calendar entry. | **Alarms** tab, not drawn on the calendar | "Take out trash" Tue 19:00 · "Morning meds" every day 08:00 |
| **Chore** | A job on chosen days, **rotating** weekly between people, either *at* a time (rings) or *by* a time (quiet). It can be a **loop** of steps that hand off. | **🧹 Chores** tab: Today (tick off), All chores (set up), What done looks like (§8.15) | "Laundry": start the washer → move to dryer (60 min later) → fold & put away |
| **Rolling timer** ⚑ name | A countdown that **restarts when acknowledged**, not on a fixed clock. | **Alarms** tab | "Check on the dog", 60 min |

**Why scheduled alarms are not calendar events:** a daily alarm drawn on the
calendar puts the same chip on every single day and buries the real events. Alarms
are managed as a list — each row shows its days and time — and edited in place.

**The rolling timer, precisely:** set to 60 minutes and started at 12:00, it rings
at 13:00. It keeps ringing (re-alerting per §5.3) until someone taps **Ack**. If
that happens at 13:45, the next ring is at **14:45** — 60 minutes after the ack,
not at 14:00. Tapping Ack *before* it rings restarts the countdown early. It runs
until someone taps **Stop**. (Industry term for this pattern: *repeat after
completion*.)

Alerts reach people two ways: **Web Push** to their phones, and **spoken in the
house** through Home Assistant (four Echos + the Voice PE satellite).

It also keeps the household's shared **lists** (§7A) — it starts with **Shopping** and
**Wish list**, and anyone can make more ("Hardware store", "Camping trip"). An item can
be assigned to one person.

### 1.0 Who it is for — design constraints

A household of five, everyone ADHD and/or Asperger's; two kids of about 11–12, each
with their own phone and account. Shelly has a phone but often not on her; she is
usually in the house and hears house announcements. Every feature is judged by:

- **Capture in seconds.** Adding something must be faster than forgetting it.
- **Visible without being asked for.** Out of sight is out of mind.
- **Predictable and explicit.** Plain words, stable layout, a clear meaning of "done".
- **Quiet by default.** Only time-critical things ring. Alert fatigue kills the app.
- **No shaming.** Nothing overdue is shown in red to the household at large. Accountability is not shaming:
  a mess report (§7B.7) asks the person who left it to own up, and the parents enforce it — decided by MojoSOGO
  2026-10-05. It is never spoken in the house, never red, and nobody sees a household scoreboard.
- **Independent of vendor features.** The app owns its data; Alexa and Home Assistant
  only speak. No dependence on Alexa's lists, routines or skills.

### 1.1 Users

- One household per deployment. No multi-tenancy, no `household_id` columns.
- Roughly 2–10 members. MojoSOGO is the **founder** (the first owner); other members
  can be made **admins** (§6.3).
- Phone-first. Desktop is a secondary layout of the same app.

### 1.2 Non-goals

FunHouse integration (separate project), native app-store apps, public/shared
calendars, anything in §12.

---

## 2. Architecture

```
  Phones / desktop browser (PWA)
            |  HTTPS, same origin
            v
  +---------------------------------------------+
  |  Cloudflare Worker  (Hono)                   |
  |   - /api/v1/*        REST API                |
  |   - static assets    the built PWA           |
  |   - cron: every 1 min -> tick() (§5)         |
  |   - Web Push sender  (VAPID)                 |
  |   - House delivery   (house.ts, §9.2)        |
  |   - Captions from home (§7E.2c)              |
  |   - Snap an item: SogoAI first (§7A.3)       |
  |            |                                 |
  |           D1 (SQLite)                        |
  +---------------------------------------------+
            |
            |  HTTPS + CF-Access-Client-Id/-Secret (the enso-worker service token):
            |    https://ha.sogodojo.com              + Bearer HA_TOKEN        (House, §9.2)
            |    https://sogoai.sogodojo.com/captions + Bearer CAPTIONS_TOKEN  (in-line, §7E.2c)
            |    https://sogoai.sogodojo.com/identify + Bearer CAPTIONS_TOKEN  (in-line, §7A.3)
            v
  +---------------------------+  Cloudflare Tunnel +-------------------------+
  |  Cloudflare Access         | -----------------> |  Home Assistant          |
  |  (Service Auth policy)     |                    |  cloudflared add-on      |
  +---------------------------+                    |  -> 4 Echos, Voice PE    |
            |                                       +-------------------------+
            |  Cloudflare Tunnel `sogoai` (cloudflared, a Windows service on SogoAI)
            v
  +-----------------------------------------+
  |  SogoAI (home PC, Windows 11, Node 24)   |   http://127.0.0.1:8790 — GET /captions?v=…
  |  home/dist/captions-helper.mjs           |   -> readCaptions from the home IP -> the
  |  (Task Scheduler, at startup)            |   CaptionsResult as JSON (§7E.2c)
  |                                          |   POST /identify (an image) -> LM Studio's
  |                                          |   local vision model at 127.0.0.1:1234 ->
  |                                          |   an IdentifyReport as JSON (§7A.3)
  +-----------------------------------------+
```

**Why SogoAI:** YouTube's player endpoint refuses Cloudflare's addresses (LOGIN_REQUIRED) but
answers a home one (§7E.2c). Decided by MojoSOGO 2026-10-04: no polling. When YouTube blocks the
Worker's captions request, the Worker asks the always-on home PC **in-line** — Worker → Cloudflare
Access → Cloudflare Tunnel → SogoAI — and gets the captions back in the same request. The helper
listens on `127.0.0.1:8790` only; `cloudflared` (a Windows service on SogoAI) carries the tunnel
outbound, so no port is opened at home, and Access lets through only the `enso-worker` service token
(the same one House delivery uses).

**Why SogoAI reads snapped items first:** decided by MojoSOGO 2026-10-04 — "use SogoAI as necessary to
avoid paying fees but pay the claude api if that is the only option". A photo of an item to buy again
(§7A.3) goes to SogoAI's local vision model (LM Studio, free) through the same helper, Access application
and bearer; the Claude API is asked only when SogoAI gives no name.

**Why a tunnel:** Home Assistant is only on the LAN (`external_url` is null, no
Nabu Casa), and no port is opened to it. Until v1.7.0 a relay process on the home PC
pulled house deliveries from the Worker and spoke them — one more thing that had to be
running. Decided by MojoSOGO 2026-10-03: the relay is retired. HA's **Cloudflared
add-on** opens an outbound Cloudflare Tunnel published at `https://ha.sogodojo.com`,
guarded by **Cloudflare Access** with a Service Auth policy, so only a caller holding
the service token gets through. House delivery is now **direct from the Worker via
Cloudflare Tunnel + Access**.

### 2.1 Stack

| Part | Choice | Notes |
|------|--------|-------|
| Backend | Cloudflare Worker + **Hono** + **D1** | One Worker serves API, assets and cron |
| Frontend | **React + TypeScript + Vite**, `vite-plugin-pwa` | No state library in v1; plain `fetch` + hooks |
| Styling | CSS Modules + CSS custom properties | Follow `C:\Users\Public\git\MOJOSOGO-PREFERENCES.md` and the `phone-ui` skill |
| Push | Web Push (VAPID) from the Worker via **`@block65/webcrypto-web-push` 2.0.0** (pinned exactly) | WebCrypto only. Sends `Content-Encoding: aes128gcm` (RFC 8291) + `Authorization: vapid t=…, k=…` (RFC 8292) — the legacy `aesgcm` that some libraries send is refused by Apple. The 2026-10-03 spike decrypted its output under Node **and** workerd, and cross-checked it with `http_ece`. |
| House delivery | The Worker calls Home Assistant's REST API through **Cloudflare Tunnel + Access** (§9.2) | `src/worker/house.ts`; no process at home besides HA itself. |
| Photo storage | Cloudflare **R2** bucket `enso-photos`, binding `PHOTOS` | Two attachments: a thing's photo (`things/…`, §7C.3) and a list item's photo (`list-items/…`, §7A.3). Private: photos are served only through the API to signed-in members. |
| Reading photos and recipes | **Claude API** via the official `@anthropic-ai/sdk`, model `claude-opus-5-5`, structured output (§7C.4, §7A.3, §7E) | Secret `ANTHROPIC_API_KEY`. Server-side refusal fallback on (`fallbacks: "default"`). One caller of the SDK: `src/worker/claude.ts`. A snapped list item is read by SogoAI first and by Claude only when SogoAI gives no name (§7A.3). |
| Naming a snapped item at home | **LM Studio** on SogoAI, `http://127.0.0.1:1234/v1/chat/completions` (OpenAI-compatible), the always-loaded vision model named by `IDENTIFY_MODEL` (`qwen-uncensored`) (§7A.3) | Free. Reached only by the SogoAI helper, never by the Worker directly. |
| Recipes from videos | **YouTube Data API v3** `videos.list?part=snippet&id=…` and `commentThreads.list?part=snippet&videoId=…&order=relevance&maxResults=20&textFormat=plainText` (§7E) | Secret `YOUTUBE_API_KEY`; 1 quota unit per call, so 2 per read ⚑ Q82. Plus an **unofficial, keyless** captions attempt (YouTube's player endpoint asked as its Android app), which may be blocked — a failure is recorded and shown, never faked. |
| QR codes | `uqr` (MIT, zero dependencies, renders SVG) | **Loaded lazily** (dynamic `import()`) only when an invite card opens — never in the main bundle. |
| Tests | **Vitest**; `@cloudflare/vitest-pool-workers` for API tests | API tests apply `migrations/` via `readD1Migrations` / `applyD1Migrations` |
| Passwords | PBKDF2-SHA256 via WebCrypto, 100 000 iterations, 16-byte salt | 100k is the Workers cap. Not bcrypt. |
| Sessions | Opaque random token in an `HttpOnly; SameSite=Lax` cookie, plus `Secure` whenever the request arrived over HTTPS (always, in production) | Stored hashed in D1. No JWT, no refresh tokens. Phones drop a `Secure` cookie sent over plain HTTP, so the LAN dev server (§2.3) gets it without. |

### 2.2 Repository layout

```
Enso/
├── SPEC.md
├── CLAUDE.md               # working agreement: spec first, then build
├── package.json            # single package; scripts in §10.1
├── wrangler.toml
├── migrations/             # wrangler d1 migrations — the ONLY schema source
│   ├── 0001_init.sql       # §4.2
│   ├── 0002_alarms.sql     # §4.2a
│   ├── 0003_days_off.sql   # §4.2b
│   ├── 0004_options_expiration.sql   # §4.2c
│   ├── 0005_lists.sql      # §4.2d
│   ├── …                   # 0006–0011, §4.2e–§4.2j
│   ├── 0012_announcements.sql   # §4.2k
│   ├── 0013_retire_relay.sql    # §4.2l
│   ├── 0014_machines.sql        # §4.2m
│   ├── 0015_timer_window.sql    # §4.2n
│   ├── 0016_sun_alerts.sql      # §4.2o
│   ├── 0017_recipes.sql         # §4.2p
│   ├── 0018_recipe_emojis.sql   # §4.2q
│   ├── 0019_recipe_comments.sql # §4.2r
│   ├── 0020_recipe_captions_job.sql # §4.2s
│   ├── 0021_drop_captions_job.sql   # §4.2t
│   ├── 0022_delivery_title.sql      # §4.2u
│   ├── 0023_list_item_photo.sql     # §4.2v
│   ├── 0025_phone_login.sql         # §4.2x
│   └── 0028_machine_hours.sql       # §4.2za
├── src/
│   ├── shared/             # pure TS, no I/O — imported by worker and frontend
│   │   ├── vocab.ts        # §3
│   │   ├── time.ts         # local wall time <-> UTC, per IANA zone
│   │   ├── recurrence.ts   # §4.3
│   │   ├── holidays.ts     # §7.3
│   │   ├── markets.ts      # §7.4
│   │   ├── lists.ts        # §7A.1 item rules: itemKey, add/reopen decision, limits, 30-day window
│   │   ├── item-reading.ts # §7A.3 naming a snapped item: the prompt, cleanItemName, the helper's report
│   │   ├── machines.ts     # §7D the laundry loop: state, transitions, done message
│   │   ├── sun.ts          # §7.7 sunset per local date and place (NOAA)
│   │   ├── recipes.ts      # §7E recipe rules: limits, YouTube link → video id, typed input, the wire
│   │   ├── recipe-reading.ts # §7E.2, §7E.2b, §7E.2c reading a video: sources, creator's comments, transcript, cleaning a reading, captions from home
│   │   ├── recipe-link.ts  # §7E.6 any link: its kind (video or page, cleaned), the site's name, the look-up and fill prompts
│   │   ├── phone-login.ts  # §6.6 sign in with my phone: limits, number matching, request transitions, notice texts
│   │   └── engine.ts       # §5
│   └── worker/             # the Worker: Hono app, routes/, tick, deliveries, readers — file by file in docs/module-ownership.md
├── frontend/               # Vite root
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
├── home/                   # runs on SogoAI, not in the Worker (§7E.2c)
│   ├── captions-helper.ts  # 127.0.0.1:8790 GET /captions?v=… → readCaptions from the home IP; POST /identify → identify.ts
│   ├── identify.ts         # §7A.3 one photo → LM Studio's local vision model → an IdentifyReport
│   ├── captions-helper.cmd # the Task Scheduler launcher (node --env-file, appends to a log)
│   ├── tsconfig.json       # Node types; part of `npm run typecheck`
│   └── dist/               # `npm run build:home` output (gitignored)
├── scripts/
│   ├── dev-seed.json, seed-dev.mjs   # `npm run seed:dev`
│   ├── arch.ts             # §2.5 caps, layering bans, source scan — their ONE home
│   ├── arch-types.ts       # the scan's shapes (Node-free, so the test can import them)
│   └── arch-audit.ts       # `npm run arch:audit` headroom report
├── docs/
│   ├── module-ownership.md # the map: which file owns which concern (§2.5)
│   ├── modularity.md       # the flow doctrine, ceilings, warning band, verdicts
│   └── placement-receipts.md
└── test/                   # incl. architecture.test.ts (§2.5)
```

### 2.3 Environments

| | Dev (Windows PC) | Production |
|---|---|---|
| Worker | `wrangler dev` → `http://localhost:8787` | `wrangler deploy` |
| D1 | local, in `.wrangler/state` | remote D1 `enso` |
| Frontend | `vite` dev server (proxies `/api` to 8787) | built into `frontend/dist`, served by the Worker |
| House delivery | speaks through `HA_URL` only when the three HA secrets are in `.dev.vars`; otherwise every house row is visibly `failed`, `house_not_configured` (§9.2). Tests pin `HA_URL` to `https://ha.test` and the secrets empty, so a test can never speak in the real house. | `https://ha.sogodojo.com` with the three secrets (§2.4) |
| Phones at home | `npm run dev:lan` → `http://<PC's LAN IP>:8787` (listens on all interfaces; needs an inbound Windows Firewall rule for TCP 8787 on the **Private** profile) | the production URL |
| Clock | `POST /api/v1/dev/tick?now=<ISO>` (only when `DEV_ENDPOINTS=1`) | cron `* * * * *` |

**Web Push needs HTTPS.** It works on `localhost` in the PC's browser, but a phone
on the LAN hitting `http://192.168.x.x` cannot subscribe. Everything else works on the
LAN dev server; the "Phone alerts off" badge is honest there. Test push on phones
against the deployed Worker. On iPhone, push works only after
**Add to Home Screen** (iOS 16.4+).

### 2.4 Secrets

| Name | Used by | Purpose |
|------|---------|---------|
| `SETUP_TOKEN` | Worker | One-time owner creation (§6.1) |
| `VAPID_PUBLIC_KEY` (var, 65-byte raw P-256 key, base64url), `VAPID_PRIVATE_KEY` (secret, the JWK `d`), `VAPID_SUBJECT` (var, `https://enso.sogodojo.com`) | Worker | Web Push (§9.1). Generated once with WebCrypto; never rotated casually — rotating invalidates every phone's subscription. |
| `HA_TOKEN` (secret) | Worker | Home Assistant long-lived access token, sent as `Authorization: Bearer …` to HA (§9.2). Never logged, never stored in a delivery's detail. |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (secrets) | Worker | The Cloudflare Access **service token** (`enso-worker`) for `ha.sogodojo.com` **and** `sogoai.sogodojo.com`, sent as `CF-Access-Client-Id` / `CF-Access-Client-Secret` (§9.2, §7E.2c). One token, two Access applications. Never logged. Tests pin them empty (House and captions from home are then not configured). |
| `HA_URL`, `ECHO_TARGETS` (JSON array), `ECHO_TYPE`, `SATELLITE_ENTITY` (vars, `wrangler.toml`) | Worker | Where House speaks (§9.2). `ECHO_TARGETS` + `SATELLITE_ENTITY` are the **default speakers**: what a house delivery uses when someone it is for has not chosen their own (§9.2a). |
| `YOUTUBE_API_KEY` (secret) | Worker | A Google Cloud API key with the YouTube Data API v3 enabled, for reading a recipe video's title and description (§7E). Set it with `npx wrangler secret put YOUTUBE_API_KEY` **in a real PowerShell window**. Never logged, never in an error message. Reading recipes also needs `ANTHROPIC_API_KEY`; without either, `POST /recipes/from-video` is 503 `recipe_reading_off` and typed recipes still work. Tests pin it empty. |
| `CAPTIONS_TOKEN` (secret) | Worker **and** SogoAI's `C:\Enso\captions-helper.env` | The bearer the Worker sends to the SogoAI helper (`Authorization: Bearer …`, §7E.2c), checked by the helper in constant time — a second lock behind Access. A long random string, set with `npx wrangler secret put CAPTIONS_TOKEN` in a real PowerShell window and the same value in the helper's env file (never in the repo). Unset or empty on the Worker → captions from home are not set up (§7E.2c) and a snapped item goes straight to Claude (§7A.3); unset on SogoAI → the helper does not start. The same bearer guards `/identify` (§7A.3). Never logged, by the Worker or the helper. Tests pin a test-only value. |
| `HOME_CAPTIONS_URL` (var, `wrangler.toml`) | Worker | Where the SogoAI helper is reached: `https://sogoai.sogodojo.com` (§7E.2c), for `/captions` and `/identify` (§7A.3) alike. Tests pin `https://sogoai.test`, which only a fetch spy answers. |
| `IDENTIFY_MODEL` (SogoAI's `C:\Enso\captions-helper.env`, not a Worker setting) | SogoAI helper | The LM Studio model id `/identify` asks (§7A.3): `qwen-uncensored`, the always-loaded vision model ⚑ Q115. Unset or empty → `/identify` answers `{ ok: false, kind: "off" }` (the Worker then asks Claude); captions keep working and the helper still starts. Not a secret. |
| `OPS_NOTIFY_TOKEN` (secret) | Worker **and** MojoSOGO's machines (`%USERPROFILE%\.enso\ops-notify-token`) | The bearer a Claude Code session sends to `POST /ops/notify` to push a message to the founder's phone (§9.4), checked in constant time. A long random string, set with `npx wrangler secret put OPS_NOTIFY_TOKEN` in a real PowerShell window and the same value in the token file (never in the repo). Unset or empty → `/ops/notify` is 503 `ops_notify_off` (never open). Never logged, never in a message or a delivery's detail. Tests pin a test-only value. |

Dev secrets go in `.dev.vars` (gitignored); production uses `wrangler secret put`, typed
in a real PowerShell window (never through a `!` shell, which saves an empty value).
`RELAY_TOKEN` is gone with the relay (v1.7.0); a production copy of it is harmless and can be
deleted.

### 2.5 Architecture guard

Source files are everything under `src/`, `frontend/src/`, `scripts/` and `home/`
(less any `dist/`) ending in `.ts`, `.tsx`, `.mjs` or `.css`, found on disk (never listed by hand).
`vitest.config.ts` scans them with `scripts/arch.ts` and hands the result to
`test/architecture.test.ts`, which fails when:

- a source file has no row (exact path or `*` pattern) in `docs/module-ownership.md`,
  or a row names nothing on disk;
- an import crosses a layering ban (`LAYERS` in `scripts/arch.ts`): `src/shared/`
  imports only its own siblings (no packages, no I/O); the worker and the frontend
  never import each other; nothing imports `scripts/` or `home/`; `home/` (the SogoAI
  helper, §7E.2c, §7A.3) imports nothing from the repo **except** `src/worker/youtube-captions.ts`
  and `src/shared/item-reading.ts` (and its own siblings), and no package **except** `node:http`
  (the helper's one server) — a layer may name exact repo
  paths, or `package:<name>`, in `allowed`, which the ban then skips;
- a `src/shared/` file uses `Date.now(`, `new Date()`, `fetch(` or `D1Database`
  (§0.3 — `now` is always a parameter);
- a file is over its line cap: its entry in `CEILINGS`, else `GLOBAL_FILE_CAP`;
- a file has top-level `let`/`var` (cross-cutting state belongs in an owner module,
  e.g. `frontend/src/state.tsx`'s context).

`npm run arch:audit` prints every file's size against its cap and marks the **warning
band** (≥ 90 %). The band is a report for the coordinating session, never a test
failure. Its verdicts (extract vs bless-and-raise) are in `docs/modularity.md`.

---

## 3. Vocabularies — `src/shared/vocab.ts`

These are the **only** definitions. Export each as a `const` tuple and derive the
type from it:

```ts
export const ALERT_KIND   = ['reminder', 'timer', 'chore', 'thing', 'machine'] as const;
export const CHANNEL      = ['push', 'house'] as const;
export const FIRE_STATE   = ['scheduled', 'ringing', 'closed'] as const;
export const CLOSE_REASON = ['done', 'acked', 'missed', 'superseded', 'stopped', 'removed'] as const;
export const ACTION       = ['done', 'snooze', 'ack'] as const;      // actions on a fire
export const TIMER_CMD    = ['start', 'stop'] as const;             // commands on a timer
export const DELIVERY_STATUS = ['queued', 'claimed', 'sent', 'partial', 'failed'] as const;
export const ROLE         = ['owner', 'member'] as const;
export const FREQ         = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export const WEEKDAY      = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;  // §4.3 byDay, alarm days
export const CHORE_TIMING = ['at', 'by'] as const;                               // §7B
export const THING_STATUS = ['idea', 'planned', 'done', 'dropped'] as const;     // §7C
export const HOUSE_STATE  = ['ok', 'failing', 'not_configured', 'untried'] as const; // /status `house.state` (§9.2)
export const MACHINE      = ['washer', 'dryer'] as const;                        // §7D, in load order
export const MACHINE_STATE = ['free', 'running', 'done'] as const;               // §7D, derived, never stored
export const SUN_EVENT    = ['sunset'] as const;                                 // §7.7 events.start_sun
export const RECIPE_SOURCE = ['description', 'captions', 'transcript', 'comments', 'page', 'typed'] as const; // §7E what a recipe was read from ('transcript': pasted, §7E.2b; 'page': any other link, §7E.6)
export const CAPTIONS_FAILURE = ['blocked', 'none', 'failed'] as const;         // §7E why captions couldn't be read
export const SPEAKER_KIND = ['echo', 'satellite'] as const;                      // §9.2a a house speaker, from its HA entity id
export const IDENTIFY_FAILURE = ['off', 'failed'] as const;                     // §7A.3 why SogoAI gave no reading
export const ITEM_READ_VIA = ['sogoai', 'claude'] as const;                     // §7A.3 who named a snapped item
export const LOGIN_REQUEST_STATUS = ['pending', 'approved', 'denied', 'used'] as const; // §6.6 login_requests.status
export const LOGIN_VIEW   = ['pending', 'approved', 'denied', 'expired'] as const; // §6.6 what the waiting browser / the phone is told — derived, never stored
export const NOTICE_KIND  = ['login', 'new_sign_in'] as const;                    // §6.6 deliveries.notice — a sign-in notice push, never an alert
export const MESS_SETTLE  = ['paid', 'forgiven'] as const;                        // §7B.7 messes.settled_how
export const MESS_STATUS  = ['open', 'discuss', 'owed', 'closed', 'settled'] as const; // §7B.7 a mess's state — derived, never stored

export type Channel = typeof CHANNEL[number];   // ...and so on for each
```

| Term | Meaning |
|------|---------|
| `push` | Web Push to the phone(s) of the recipients (§5.4) |
| `house` | Spoken on **all four Echos and the Voice PE** — the Worker calls Home Assistant through Cloudflare Tunnel + Access (§9.2). One announcement per alert, not per person. |
| `scheduled` | Fire exists, due in the future (or snoozed) |
| `ringing` | Due time passed, alert sent, waiting for a human |
| `closed` | Finished; `close_reason` says why |
| `done` | Someone tapped Done on a reminder |
| `acked` | Someone tapped Ack on a timer (the timer restarts) |
| `missed` | A reminder was more than 60 min overdue when the engine first saw it (outage) — closed without alerting |
| `chore` | A fire for one step of one chore run (§7B) |
| `machine` | A fire for one load in one machine, due when the machine is done (§7D) |
| `washer` / `dryer` | The two laundry machines (§7D); the washer's load moves on to the dryer |
| `free` / `running` / `done` | A machine's state (§7D): no load / a load, before done-at / a load, done-at passed — derived from the row and `now` |
| `sunset` | An event whose start is the day's local sunset (§7.7, `events.start_sun`); there is no sunrise |
| `description` / `captions` | A recipe was read from the video's description / its captions (§7E); a recipe can carry both |
| `page` | A recipe read from a link that is not a YouTube video: a Facebook reel or post, a recipe site, any web page (§7E.6) |
| `typed` | A recipe typed by hand, with no video (§7E) |
| `blocked` / `none` / `failed` | Why a video's captions couldn't be read (§7E): YouTube refused the keyless request / the video has no captions / anything else (network, an unreadable answer) |
| `off` / `failed` (identify) | Why SogoAI gave no reading of a snapped item (§7A.3): `IDENTIFY_MODEL` isn't set on SogoAI / LM Studio failed or answered something unreadable |
| `pending` / `approved` / `denied` / `used` (login request) | A "Sign in with my phone" request (§6.6): waiting for the phone / the member picked the right number / refused (a wrong number, "This wasn't me", or replaced by a newer request) / the waiting browser collected its session — spent |
| `expired` (login view) | A login request past its `expires_at` while still `pending` or `approved`, or one already `used`, as the waiting browser is told — derived from `now`, never stored |
| `login` / `new_sign_in` | A sign-in notice push (§6.6): a phone-approval request / "New sign-in on …" after a password sign-in. Not an `ALERT_KIND`: no fire, no actions |
| `paid` / `forgiven` | How a point owed for a mess was settled (§7B.7): paid back in person / let go |
| `open` / `discuss` / `owed` / `closed` / `settled` (mess) | A mess report (§7B.7): asking who left it / on To talk about / claimed or recorded, a point owed / closed as nobody's / the point paid back or let go — derived from the row |
| `sogoai` / `claude` | Who named a snapped item (§7A.3): SogoAI's local vision model (free) / the Claude API (the fallback) |
| `at` | Chore rings at its time, like an alarm |
| `by` | Chore is quiet: due by its time, optionally one nudge then |
| `superseded` | A newer occurrence of the same event started ringing while this one still was |
| `stopped` | The timer was stopped |
| `removed` | The event or timer was edited or deleted, making this fire obsolete |
| `partial` | House delivery reached some surfaces but not all |
| `ok` / `failing` | House state (§9.2): the newest finished house delivery is `sent`/`partial` / is `failed` |
| `not_configured` | House state: one of the seven House settings (§9.2) is missing — nothing is spoken |
| `untried` | House state: configured, but no house delivery has finished yet |

Lists are **data, not vocabulary** (§7A): their names live in the `lists` table.

`vocab.ts` also holds `MEMBER_PALETTE` (§6.5) and the `isOneOf(list, value)` guard
used to validate input against any of these tuples.

---

## 4. Data model

### 4.1 Time rules

- **Instants** (when something happens: `due_at`, `created_at`, …) are stored as
  ISO-8601 UTC strings with `Z`, e.g. `2026-10-06T02:00:00.000Z`, written by app
  code. **Never use SQLite `datetime('now')`** — it produces a different format.
- **Calendar times** (what a person typed) are stored as **local wall time**:
  `start_date` `YYYY-MM-DD` and `start_time` `HH:MM`, interpreted in the household
  timezone. This is what keeps "08:00 every day" at 08:00 across daylight-saving
  changes.
- The household timezone is a setting; the default is `America/Los_Angeles`.
- Conversion lives only in `src/shared/time.ts`:
  `localToUtc(date, time, tz)` and `utcToLocal(iso, tz)`. Use `Intl.DateTimeFormat`;
  no date library.
  - A nonexistent local time (spring-forward gap, e.g. 02:30) resolves to the
    first valid instant after it (03:00).
  - An ambiguous local time (fall-back, e.g. 01:30) resolves to the **earlier**
    instant.

### 4.2 Schema — `migrations/0001_init.sql`

```sql
CREATE TABLE settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  household_name TEXT NOT NULL DEFAULT 'Home',
  timezone      TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  relay_last_seen TEXT                        -- was the relay's heartbeat; DROPPED by 0013 (§4.2l)
);
INSERT INTO settings (id) VALUES (1);

CREATE TABLE members (
  id            TEXT PRIMARY KEY,             -- 'mem_' + 16 random base32 chars
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  color         TEXT NOT NULL,                -- from §6.5 palette
  role          TEXT NOT NULL CHECK (role IN ('owner','member')),
  password_hash TEXT NOT NULL,                -- 'pbkdf2$100000$<salt b64>$<hash b64>'
  created_at    TEXT NOT NULL,
  disabled_at   TEXT                          -- non-null = cannot log in
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id),
  token_hash    TEXT NOT NULL UNIQUE,         -- SHA-256 hex of the cookie token
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL                 -- sliding: now + 90 days on each use
);

CREATE TABLE invites (
  id            TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL UNIQUE,         -- SHA-256 hex of the normalized code
  display_name  TEXT NOT NULL,
  created_by    TEXT NOT NULL REFERENCES members(id),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,                -- created_at + 7 days
  used_by       TEXT REFERENCES members(id),
  used_at       TEXT,
  revoked_at    TEXT
);

CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  notes         TEXT,
  start_date    TEXT NOT NULL,                -- local YYYY-MM-DD
  start_time    TEXT,                         -- local HH:MM; NULL = all-day
  end_date      TEXT NOT NULL,                -- local; = start_date for single-day
  end_time      TEXT,                         -- local HH:MM; NULL if all-day
  recurrence    TEXT,                         -- JSON, §4.3; NULL = one-off
  exdates       TEXT NOT NULL DEFAULT '[]',   -- JSON array of local YYYY-MM-DD skipped occurrences
  assigned_to   TEXT NOT NULL DEFAULT '[]',   -- JSON array of member ids; [] = everyone
  -- reminder (all NULL = no reminder)
  remind_offset_min INTEGER,                  -- minutes BEFORE start; 0 = at start (all-day: start = 09:00 local ⚑ DEFAULT)
  remind_channels   TEXT,                     -- JSON array of CHANNEL
  renotify_min      INTEGER,                  -- NULL = alert once
  max_alerts        INTEGER NOT NULL DEFAULT 4,
  created_by    TEXT NOT NULL REFERENCES members(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_events_dates ON events(start_date, end_date) WHERE deleted_at IS NULL;

CREATE TABLE timers (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  interval_min  INTEGER NOT NULL CHECK (interval_min BETWEEN 1 AND 1440),
  channels      TEXT NOT NULL,                -- JSON array of CHANNEL
  renotify_min  INTEGER DEFAULT 15,           -- NULL = alert once
  max_alerts    INTEGER NOT NULL DEFAULT 4,
  assigned_to   TEXT NOT NULL DEFAULT '[]',
  running       INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT NOT NULL REFERENCES members(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

-- One row per time an alert is due. Reminders: one per event occurrence.
-- Timers: one per countdown.
CREATE TABLE fires (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder','timer')),
  event_id        TEXT REFERENCES events(id),
  occurrence_date TEXT,                       -- local YYYY-MM-DD of the event occurrence
  timer_id        TEXT REFERENCES timers(id),
  due_at          TEXT NOT NULL,              -- UTC ISO
  state           TEXT NOT NULL CHECK (state IN ('scheduled','ringing','closed')),
  alert_count     INTEGER NOT NULL DEFAULT 0,
  last_alerted_at TEXT,
  close_reason    TEXT CHECK (close_reason IN ('done','acked','missed','superseded','stopped','removed')),
  closed_by       TEXT REFERENCES members(id),
  closed_at       TEXT,
  CHECK ((kind = 'reminder' AND event_id IS NOT NULL AND occurrence_date IS NOT NULL AND timer_id IS NULL)
      OR (kind = 'timer'    AND timer_id IS NOT NULL AND event_id IS NULL))
);
CREATE UNIQUE INDEX uq_fire_occurrence ON fires(event_id, occurrence_date) WHERE kind = 'reminder' AND state != 'closed';
CREATE UNIQUE INDEX uq_timer_open      ON fires(timer_id) WHERE kind = 'timer' AND state != 'closed';
CREATE INDEX idx_fires_open ON fires(state, due_at) WHERE state != 'closed';

CREATE TABLE deliveries (
  id            TEXT PRIMARY KEY,
  fire_id       TEXT NOT NULL REFERENCES fires(id),
  alert_number  INTEGER NOT NULL,             -- which alert of the fire (1 = first)
  channel       TEXT NOT NULL CHECK (channel IN ('push','house')),
  member_id     TEXT REFERENCES members(id),  -- set for push, NULL for house
  message       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','claimed','sent','partial','failed')),
  detail        TEXT,                         -- error text or per-surface result JSON
  attempts      INTEGER NOT NULL DEFAULT 0,
  claimed_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_deliveries_queue ON deliveries(channel, status);

CREATE TABLE push_subscriptions (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id),
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TEXT NOT NULL,
  last_ok_at    TEXT,
  last_error    TEXT
);

CREATE TABLE school_holidays (
  date          TEXT PRIMARY KEY,             -- local YYYY-MM-DD
  label         TEXT NOT NULL
);

CREATE TABLE login_failures (             -- §6.4 rate limit; rows older than 15 min are ignored
  email         TEXT NOT NULL COLLATE NOCASE,
  at            TEXT NOT NULL
);
CREATE INDEX idx_login_failures ON login_failures(email, at);

CREATE TABLE member_prefs (
  member_id            TEXT PRIMARY KEY REFERENCES members(id),
  show_public_holidays INTEGER NOT NULL DEFAULT 1,
  show_school_holidays INTEGER NOT NULL DEFAULT 1
);
```

The `CHECK` lists above necessarily repeat §3 as SQL text. Test **M1-VOCAB** reads the
`CHECK`s **in force** from the migrated database's own schema (`sqlite_master`), not from
migration text — so a table rebuilt or a column dropped by a later migration is judged by
what actually exists. It asserts
that each `CHECK` list matches the corresponding `vocab.ts` tuple exactly. That
test is what keeps the two in step.

### 4.2a Schema change — `migrations/0002_alarms.sql`

```sql
-- A scheduled alarm (§1) is stored as an event with is_alarm = 1. It reuses the
-- event recurrence + reminder + fire machinery unchanged; only its presentation differs.
ALTER TABLE events ADD COLUMN is_alarm INTEGER NOT NULL DEFAULT 0 CHECK (is_alarm IN (0, 1));
```

An alarm row always has: `start_time` set (never all-day), `recurrence =
{"freq":"WEEKLY","byDay":[...]}` with at least one day, `remind_offset_min = 0`,
`start_date` = the local date it was created, `end_date = start_date`.

### 4.2b Schema change — `migrations/0003_days_off.sql`

```sql
-- Household days off (§7.3): JSON array of HOLIDAYS keys; NULL = DEFAULT_DAYS_OFF.
ALTER TABLE settings ADD COLUMN days_off TEXT;
```

### 4.2c Schema change — `migrations/0004_options_expiration.sql`

```sql
-- Per-member switch for the 📈 monthly options expiration marker (§7.4).
ALTER TABLE member_prefs ADD COLUMN show_options_expiration INTEGER NOT NULL DEFAULT 0;
```

### 4.2d Schema change — `migrations/0005_lists.sql`

```sql
-- §7A — items on the two household lists. One row per item; checking it off keeps the
-- row (for "Recently bought" / "Done") until it ages out of view.
CREATE TABLE list_items (
  id          TEXT PRIMARY KEY,               -- 'itm_' + 16 base32
  list        TEXT NOT NULL CHECK (list IN ('shopping','wishlist')),
  text        TEXT NOT NULL,                  -- as typed, trimmed; 1–120 chars
  text_key    TEXT NOT NULL,                  -- itemKey(text), §7A.1
  note        TEXT,                           -- wish list detail; ≤ 1000 chars
  owner_id    TEXT REFERENCES members(id),    -- wish list: whose it is; NULL = household
  created_by  TEXT NOT NULL REFERENCES members(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  checked_at  TEXT,                           -- NULL = open
  checked_by  TEXT REFERENCES members(id),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX uq_list_item_key ON list_items(list, text_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_list_items ON list_items(list, checked_at) WHERE deleted_at IS NULL;
```

### 4.2e Schema change — `migrations/0006_chores.sql`

```sql
-- §7B — chores and their daily runs. fires gains kind 'chore' (+ chore_run_id); SQLite
-- cannot alter a CHECK, so fires is rebuilt and its rows copied. DROP TABLE fires counts
-- as deleting every fire, which leaves a deferred FK violation per delivery that the
-- rename never clears — so deliveries are stashed and restored around the swap.
PRAGMA defer_foreign_keys = true;

CREATE TABLE chores (
  id           TEXT PRIMARY KEY,               -- 'chr_' + 16 base32
  title        TEXT NOT NULL,                  -- 1–60 chars
  done_means   TEXT,                           -- ≤ 200 chars: what "done" looks like
  days         TEXT NOT NULL,                  -- JSON Weekday[], ≥ 1, week order
  timing       TEXT NOT NULL CHECK (timing IN ('at','by')),
  time         TEXT NOT NULL,                  -- local HH:MM
  nudge        INTEGER NOT NULL DEFAULT 0 CHECK (nudge IN (0, 1)),   -- 'by' only
  people       TEXT NOT NULL,                  -- JSON member ids in turn order, 1–8
  steps        TEXT NOT NULL,                  -- JSON ChoreStep[], 1–6 (§7B.2)
  channels     TEXT NOT NULL,                  -- JSON CHANNEL[] (for rings and nudges)
  renotify_min INTEGER,                        -- NULL = ring once
  max_alerts   INTEGER NOT NULL DEFAULT 4,
  start_date   TEXT NOT NULL,                  -- local date created; rotation counts weeks from it
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE TABLE chore_runs (                      -- one per chore per day it is due
  id           TEXT PRIMARY KEY,               -- 'run_' + 16 base32
  chore_id     TEXT NOT NULL REFERENCES chores(id),
  date         TEXT NOT NULL,                  -- local YYYY-MM-DD
  assignee_id  TEXT REFERENCES members(id),    -- whose turn; NULL = nobody active
  step         INTEGER NOT NULL DEFAULT 0,     -- index of the current step; = steps.length when done
  done_at      TEXT,
  done_by      TEXT REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (chore_id, date)
);

CREATE TABLE fires_new (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder','timer','chore')),
  event_id        TEXT REFERENCES events(id),
  occurrence_date TEXT,
  timer_id        TEXT REFERENCES timers(id),
  chore_run_id    TEXT REFERENCES chore_runs(id),
  due_at          TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('scheduled','ringing','closed')),
  alert_count     INTEGER NOT NULL DEFAULT 0,
  last_alerted_at TEXT,
  close_reason    TEXT CHECK (close_reason IN ('done','acked','missed','superseded','stopped','removed')),
  closed_by       TEXT REFERENCES members(id),
  closed_at       TEXT,
  CHECK ((kind = 'reminder' AND event_id IS NOT NULL AND occurrence_date IS NOT NULL AND timer_id IS NULL AND chore_run_id IS NULL)
      OR (kind = 'timer'    AND timer_id IS NOT NULL AND event_id IS NULL AND chore_run_id IS NULL)
      OR (kind = 'chore'    AND chore_run_id IS NOT NULL AND event_id IS NULL AND timer_id IS NULL))
);
INSERT INTO fires_new (id, kind, event_id, occurrence_date, timer_id, chore_run_id, due_at, state,
                       alert_count, last_alerted_at, close_reason, closed_by, closed_at)
  SELECT id, kind, event_id, occurrence_date, timer_id, NULL, due_at, state,
         alert_count, last_alerted_at, close_reason, closed_by, closed_at FROM fires;
CREATE TABLE deliveries_stash AS SELECT * FROM deliveries;
DELETE FROM deliveries;
DROP TABLE fires;
ALTER TABLE fires_new RENAME TO fires;
INSERT INTO deliveries SELECT * FROM deliveries_stash;
DROP TABLE deliveries_stash;
CREATE UNIQUE INDEX uq_fire_occurrence ON fires(event_id, occurrence_date) WHERE kind = 'reminder' AND state != 'closed';
CREATE UNIQUE INDEX uq_timer_open      ON fires(timer_id) WHERE kind = 'timer' AND state != 'closed';
CREATE UNIQUE INDEX uq_chore_run_open  ON fires(chore_run_id) WHERE kind = 'chore' AND state != 'closed';
CREATE INDEX idx_fires_open ON fires(state, due_at) WHERE state != 'closed';
```

**Migration check (M4c):** a test applies 0001–0005, inserts a reminder fire, a timer
fire and a delivery, applies 0006, and finds all three intact with the delivery still
pointing at its fire.

### 4.2f Schema change — `migrations/0007_custom_lists.sql`

```sql
-- §7A — lists become household data: any number, named by members. list_items.list (a
-- fixed vocabulary) becomes list_id, and owner_id becomes assignee_id for every list.
-- list_items is rebuilt (SQLite cannot drop a CHECK); nothing references it.
CREATE TABLE lists (
  id         TEXT PRIMARY KEY,                 -- 'lst_' + 16 base32; the two seeded lists keep fixed ids
  name       TEXT NOT NULL,                    -- 1–40 chars, as typed (trimmed)
  name_key   TEXT NOT NULL,                    -- itemKey(name): one list per name
  created_by TEXT REFERENCES members(id),      -- NULL for the two seeded lists
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX uq_list_name ON lists(name_key) WHERE deleted_at IS NULL;
INSERT INTO lists (id, name, name_key, created_by, created_at, updated_at) VALUES
  ('lst_shopping', 'Shopping',  'shopping',  NULL, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  ('lst_wishlist', 'Wish list', 'wish list', NULL, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z');

CREATE TABLE list_items_new (
  id          TEXT PRIMARY KEY,
  list_id     TEXT NOT NULL REFERENCES lists(id),
  text        TEXT NOT NULL,
  text_key    TEXT NOT NULL,
  note        TEXT,
  assignee_id TEXT REFERENCES members(id),     -- one person, or NULL = the household
  created_by  TEXT NOT NULL REFERENCES members(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  checked_at  TEXT,
  checked_by  TEXT REFERENCES members(id),
  deleted_at  TEXT
);
INSERT INTO list_items_new (id, list_id, text, text_key, note, assignee_id, created_by, created_at,
                            updated_at, checked_at, checked_by, deleted_at)
  SELECT id, CASE list WHEN 'shopping' THEN 'lst_shopping' ELSE 'lst_wishlist' END, text, text_key, note,
         owner_id, created_by, created_at, updated_at, checked_at, checked_by, deleted_at
    FROM list_items;
DROP TABLE list_items;
ALTER TABLE list_items_new RENAME TO list_items;
CREATE UNIQUE INDEX uq_list_item_key ON list_items(list_id, text_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_list_items ON list_items(list_id, checked_at) WHERE deleted_at IS NULL;
```

The seed timestamps are fixed literals (never `datetime('now')`, §4.1).

### 4.2g Schema change — `migrations/0008_things_to_do.sql`

```sql
-- §7C — things to do: ideas with a time window, reminders, an optional photo.
-- fires gains kind 'thing' (+ thing_id); rebuilt exactly like 0006, deliveries stashed.
PRAGMA defer_foreign_keys = true;

CREATE TABLE things (
  id           TEXT PRIMARY KEY,                -- 'thg_' + 16 base32
  title        TEXT NOT NULL,                   -- 1–120
  note         TEXT,                            -- ≤ 2000
  place        TEXT,                            -- ≤ 200
  url          TEXT,                            -- ≤ 500, http(s) only
  window_start TEXT,                            -- local YYYY-MM-DD; NULL = any time
  window_end   TEXT,                            -- local YYYY-MM-DD ≥ window_start; NULL = open-ended
  remind_start INTEGER NOT NULL DEFAULT 0 CHECK (remind_start IN (0, 1)),
  remind_on    TEXT,                            -- local YYYY-MM-DD, a reminder on a picked date
  channels     TEXT NOT NULL DEFAULT '["push"]',-- JSON CHANNEL[] for its reminders
  photo_key    TEXT,                            -- R2 object key; NULL = no photo
  status       TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','planned','done','dropped')),
  planned_event_id TEXT REFERENCES events(id),  -- set by Plan it
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_things_open ON things(status, window_end) WHERE deleted_at IS NULL;

-- Plan it (§7C.2) links the calendar event back to its thing.
ALTER TABLE events ADD COLUMN thing_id TEXT REFERENCES things(id);

-- Daily cap on photo reading (§7C.4).
CREATE TABLE photo_reads (at TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES members(id));

CREATE TABLE fires_new (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder','timer','chore','thing')),
  event_id        TEXT REFERENCES events(id),
  occurrence_date TEXT,                         -- reminder: the event occurrence; thing: the reminder's date
  timer_id        TEXT REFERENCES timers(id),
  chore_run_id    TEXT REFERENCES chore_runs(id),
  thing_id        TEXT REFERENCES things(id),
  due_at          TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('scheduled','ringing','closed')),
  alert_count     INTEGER NOT NULL DEFAULT 0,
  last_alerted_at TEXT,
  close_reason    TEXT CHECK (close_reason IN ('done','acked','missed','superseded','stopped','removed')),
  closed_by       TEXT REFERENCES members(id),
  closed_at       TEXT,
  CHECK ((kind = 'reminder' AND event_id IS NOT NULL AND occurrence_date IS NOT NULL AND timer_id IS NULL AND chore_run_id IS NULL AND thing_id IS NULL)
      OR (kind = 'timer'    AND timer_id IS NOT NULL AND event_id IS NULL AND chore_run_id IS NULL AND thing_id IS NULL)
      OR (kind = 'chore'    AND chore_run_id IS NOT NULL AND event_id IS NULL AND timer_id IS NULL AND thing_id IS NULL)
      OR (kind = 'thing'    AND thing_id IS NOT NULL AND occurrence_date IS NOT NULL AND event_id IS NULL AND timer_id IS NULL AND chore_run_id IS NULL))
);
INSERT INTO fires_new (id, kind, event_id, occurrence_date, timer_id, chore_run_id, thing_id, due_at, state,
                       alert_count, last_alerted_at, close_reason, closed_by, closed_at)
  SELECT id, kind, event_id, occurrence_date, timer_id, chore_run_id, NULL, due_at, state,
         alert_count, last_alerted_at, close_reason, closed_by, closed_at FROM fires;
CREATE TABLE deliveries_stash AS SELECT * FROM deliveries;
DELETE FROM deliveries;
DROP TABLE fires;
ALTER TABLE fires_new RENAME TO fires;
INSERT INTO deliveries SELECT * FROM deliveries_stash;
DROP TABLE deliveries_stash;
CREATE UNIQUE INDEX uq_fire_occurrence ON fires(event_id, occurrence_date) WHERE kind = 'reminder' AND state != 'closed';
CREATE UNIQUE INDEX uq_timer_open      ON fires(timer_id) WHERE kind = 'timer' AND state != 'closed';
CREATE UNIQUE INDEX uq_chore_run_open  ON fires(chore_run_id) WHERE kind = 'chore' AND state != 'closed';
CREATE UNIQUE INDEX uq_thing_reminder  ON fires(thing_id, occurrence_date) WHERE kind = 'thing' AND state != 'closed';
CREATE INDEX idx_fires_open ON fires(state, due_at) WHERE state != 'closed';
```

**Migration check (M4g):** like C13 — fires of every existing kind and their deliveries
survive 0008; `PRAGMA foreign_key_check` is empty.

### 4.2h Schema change — `migrations/0009_optional_events.sql`

```sql
-- §7.5 — optional events: shown to, and reminding, only the members who turned them on.
ALTER TABLE events ADD COLUMN optional INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1));
CREATE TABLE event_optins (
  event_id   TEXT NOT NULL REFERENCES events(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, member_id)
);
```

### 4.2i Schema change — `migrations/0010_calendar_tidy.sql`

```sql
-- §7.2 / §7.6 — school holidays removed (the table and the member switch); event emoji added.
DROP TABLE school_holidays;
ALTER TABLE member_prefs DROP COLUMN show_school_holidays;
ALTER TABLE events ADD COLUMN emoji TEXT;
```

### 4.2j Schema change — `migrations/0011_thing_details.sql`

```sql
-- §7C.1 — things gain address, phone and cost (free text, as written).
ALTER TABLE things ADD COLUMN address TEXT;
ALTER TABLE things ADD COLUMN phone TEXT;
ALTER TABLE things ADD COLUMN cost TEXT;
```

### 4.2k Schema change — `migrations/0012_announcements.sql`

```sql
-- §9.3 — an announcement is a delivery with no fire: deliveries.fire_id becomes nullable.
-- SQLite cannot drop a NOT NULL, so deliveries is rebuilt and its rows copied. No table
-- references deliveries, so nothing has to be stashed. Every other column and both CHECKs
-- are unchanged (M1-VOCAB reads them from sqlite_master).
CREATE TABLE deliveries_new ( …the §4.2 columns, except: fire_id TEXT REFERENCES fires(id) … );
INSERT INTO deliveries_new (…every column…) SELECT …every column… FROM deliveries;
DROP TABLE deliveries;
ALTER TABLE deliveries_new RENAME TO deliveries;
CREATE INDEX idx_deliveries_queue ON deliveries(channel, status);
```

`alert_number` stays `NOT NULL`; an announcement's deliveries carry `1`.
**Migration check (AN8):** like C13 — deliveries written under 0001–0011 survive 0012
unchanged, `PRAGMA foreign_key_check` is empty, and afterwards a delivery with
`fire_id NULL` is accepted.

### 4.2l Schema change — `migrations/0013_retire_relay.sql`

```sql
-- §9.2 — the relay is retired (v1.7.0); its heartbeat column goes with it. House health is
-- derived from the deliveries table instead (houseState), never stored.
ALTER TABLE settings DROP COLUMN relay_last_seen;
```

**Migration check (H9):** the `settings` row survives 0013 with its name, time zone and days
off unchanged, and `relay_last_seen` is no longer a column.

### 4.2m Schema change — `migrations/0014_machines.sql`

```sql
-- §7D — the laundry loop: two machines, and fires gain kind 'machine' (+ machine_id).
-- fires is rebuilt exactly like 0006/0008, deliveries stashed and restored.
PRAGMA defer_foreign_keys = true;

CREATE TABLE machines (
  id         TEXT PRIMARY KEY,                 -- MACHINE (vocab.ts); the route validates with isOneOf
  owner_id   TEXT REFERENCES members(id),      -- whose load; NULL = free
  minutes    INTEGER,                          -- the chip picked (MACHINE_MINUTES)
  started_at TEXT,                             -- UTC ISO; NULL = free
  done_at    TEXT,                             -- started_at + minutes
  started_by TEXT REFERENCES members(id),
  updated_at TEXT
);
INSERT INTO machines (id, updated_at) VALUES ('washer', '2026-10-03T00:00:00.000Z'), ('dryer', '2026-10-03T00:00:00.000Z');

CREATE TABLE fires_new (
  …every 0008 column…,
  kind       TEXT NOT NULL CHECK (kind IN ('reminder','timer','chore','thing','machine')),
  machine_id TEXT REFERENCES machines(id),
  CHECK ((kind = 'reminder' AND … AND machine_id IS NULL)
      OR (kind = 'timer'    AND … AND machine_id IS NULL)
      OR (kind = 'chore'    AND … AND machine_id IS NULL)
      OR (kind = 'thing'    AND … AND machine_id IS NULL)
      OR (kind = 'machine'  AND machine_id IS NOT NULL AND event_id IS NULL AND timer_id IS NULL
                            AND chore_run_id IS NULL AND thing_id IS NULL))
);
-- copy fires (machine_id NULL), stash deliveries, drop, rename, restore, recreate every
-- 0008 index, and:
CREATE UNIQUE INDEX uq_machine_open ON fires(machine_id) WHERE kind = 'machine' AND state != 'closed';
```

There is no CHECK on `machines.id` (the vocabulary lives in `vocab.ts`). Seeds carry literal
timestamps, never `datetime('now')`. **Done-waiting is never stored:** a machine is `done` when
its owner is set and `now ≥ done_at`.
**Migration check (L13):** like C13 — fires of every earlier kind and their deliveries survive
0014, `PRAGMA foreign_key_check` is empty, both machines are seeded free, and a `machine` fire
without `machine_id` is refused by the CHECK.

### 4.2n Schema change — `migrations/0015_timer_window.sql`

```sql
-- §5.3 rule 0 — a rolling timer's optional active time range, local wall time HH:MM in the
-- household timezone (§4.1). Both NULL = no window (rings at any hour, as before).
ALTER TABLE timers ADD COLUMN active_from TEXT;
ALTER TABLE timers ADD COLUMN active_to TEXT;
```

There is no CHECK: the route validates (both null, or both `HH:MM` and `timerWindowError` is
null). `from > to` is an overnight window (22:00–06:00).
**Migration check (TW-M):** timers that exist before 0015 survive it unchanged, with
`active_from` and `active_to` NULL — they keep today's behavior.

### 4.2o Schema change — `migrations/0016_sun_alerts.sql`

```sql
-- §7.7 — sun-timed alerts: the household's place, and an event whose start is the sunset.
ALTER TABLE settings ADD COLUMN latitude REAL;
ALTER TABLE settings ADD COLUMN longitude REAL;
UPDATE settings SET latitude = 33.20, longitude = -117.29 WHERE id = 1;  -- ZIP 92056, Oceanside
ALTER TABLE events ADD COLUMN start_sun TEXT CHECK (start_sun IN ('sunset'));
```

`settings.latitude` / `longitude` are degrees (north / east positive); both NULL = no place, and
then no sun-timed reminder is planned (§7.7). There is no edit UI ⚑ Q57. `events.start_sun`
NULL = an ordinary event; `'sunset'` (`SUN_EVENT`, §3) = the event starts at that day's local
sunset. A sun row has `start_time` NULL, `end_time` NULL and `end_date = start_date`;
`remind_offset_min` is reused as "minutes before sunset". The migration inserts **no** event:
the goat item is created in production by SQL (§14).
**Migration check (SA-M):** settings and events that exist before 0016 survive it, the settings
row gains 33.20 / −117.29, every existing event has `start_sun` NULL, and `start_sun = 'sunrise'`
is refused by the CHECK.

### 4.2p Schema change — `migrations/0017_recipes.sql`

```sql
-- §7E — recipes, household-shared: read from a YouTube video, or typed by hand. Additive only.
CREATE TABLE recipes (
  id             TEXT PRIMARY KEY,               -- 'rcp_' + 16 base32
  title          TEXT NOT NULL,                  -- 1–RECIPE_TITLE_MAX; the dish, else the video's title
  video_id       TEXT,                           -- the 11-character YouTube id; NULL = typed
  video_title    TEXT,                           -- as YouTube gave it; NULL when typed
  channel        TEXT,                           -- the channel's name; NULL when typed
  ingredients    TEXT NOT NULL,                  -- JSON string[], each ≤ INGREDIENT_MAX
  steps          TEXT NOT NULL,                  -- JSON string[]
  servings       TEXT,                           -- free text as stated ("4", "serves 6–8")
  time_text      TEXT,                           -- free text as stated ("45 min")
  found          INTEGER NOT NULL CHECK (found IN (0, 1)),
  source         TEXT NOT NULL,                  -- JSON RECIPE_SOURCE[]: what was read (§7E.1)
  captions_error TEXT,                           -- why captions couldn't be read; NULL = read, or not tried
  created_by     TEXT NOT NULL REFERENCES members(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
-- One live recipe per video (§7E.2): a second paste of the same link is 409 duplicate.
CREATE UNIQUE INDEX uq_recipe_video ON recipes(video_id) WHERE deleted_at IS NULL AND video_id IS NOT NULL;
-- Daily cap on reading videos (§7E.2), counted apart from photo_reads.
CREATE TABLE recipe_reads (at TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES members(id));
```

There is **no url or thumbnail column**: both are derived from `video_id` (`watchUrl`,
`thumbnailUrl`, §7E.1). `source` holds a JSON list, so it has no CHECK; the route writes only
`RECIPE_SOURCE` values. Nothing existing is rebuilt or altered.
**Migration check (RC-M):** rows written under 0001–0016 (members, things, list items) survive
0017 unchanged; a second live recipe for one video is refused by `uq_recipe_video`, while a
soft-deleted one does not block it and any number of typed recipes (NULL `video_id`) coexist.

### 4.2q Schema change — `migrations/0018_recipe_emojis.sql`

```sql
-- §7E.5 — each person's own emoji on a recipe: one per member per recipe. Additive only.
CREATE TABLE recipe_emojis (
  recipe_id  TEXT NOT NULL REFERENCES recipes(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  emoji      TEXT NOT NULL,                      -- one emoji (emojiError, §7.6)
  updated_at TEXT NOT NULL,
  PRIMARY KEY (recipe_id, member_id)
);
```

Written only by `PUT /recipes/{id}/emoji` as an upsert (`INSERT … ON CONFLICT(recipe_id,
member_id) DO UPDATE`) and removed by `DELETE /recipes/{id}/emoji`. A soft-deleted recipe keeps its
rows; they are never returned, because only live recipes are ⚑ Q75. Nothing existing is rebuilt or
altered.
**Migration check (RE-M):** rows written under 0001–0017 (members, things, list items, recipes)
survive 0018 unchanged; the primary key refuses a second row for the same member and recipe.

### 4.2r Schema change — `migrations/0019_recipe_comments.sql`

```sql
-- §7E.2 — why the video creator's comments couldn't be read. Additive only.
ALTER TABLE recipes ADD COLUMN comments_error TEXT; -- NULL = read, none to read, or not tried
```

Set only by `POST /recipes/from-video` (§7E.2 step 8) when the comments lookup failed by quota or
otherwise; comments turned off, or no comment by the creator among them, leave it NULL ⚑ Q78. PATCH
never touches it. `source` holds a JSON list, so the new `comments` value needs no CHECK and nothing
is rebuilt.
**Migration check (CM-M):** rows written under 0001–0018 (members, things, list items, recipes,
recipe reads, recipe emojis) survive 0019 unchanged, and every existing recipe has `comments_error`
NULL.

### 4.2s Schema change — `migrations/0020_recipe_captions_job.sql`

```sql
-- §7E.2c — the captions-from-home job on a recipe row. Additive only.
ALTER TABLE recipes ADD COLUMN captions_job TEXT CHECK (captions_job IN ('queued', 'claimed')); -- NULL = no job
ALTER TABLE recipes ADD COLUMN captions_queued_at TEXT;   -- when from-video queued it
ALTER TABLE recipes ADD COLUMN captions_claimed_at TEXT;  -- the latest claim
ALTER TABLE recipes ADD COLUMN captions_attempts INTEGER NOT NULL DEFAULT 0; -- claims so far
CREATE INDEX idx_recipes_captions_job ON recipes(captions_job) WHERE captions_job IS NOT NULL;
```

`CAPTIONS_JOB` (§3) is `queued` | `claimed`. Done and failed are **not stored**: ending a job puts the
four columns back to NULL / 0 and the outcome lives in `source` / `captions_error`. Every write of these
columns is `src/worker/captions-jobs.ts` (the success UPDATE of `recipe-reread.ts` uses its SET clause).
PATCH never touches them. The partial index keeps the claim's lookup to the few rows with a job.
**Migration check (CJ-M):** rows written under 0001–0019 survive 0020 unchanged, every existing recipe
has `captions_job`, `captions_queued_at`, `captions_claimed_at` NULL and `captions_attempts` 0; the CHECK
refuses any other value; the index exists.

Dropped by 0021 (§4.2t).

### 4.2t Schema change — `migrations/0021_drop_captions_job.sql`

Decided by MojoSOGO 2026-10-04: no polling, no job queue — the Worker asks SogoAI in-line (§7E.2c). The
job columns and their index (§4.2s) go.

```sql
-- §7E.2c — the captions-from-home job is gone: the Worker asks SogoAI in-line.
DROP INDEX idx_recipes_captions_job;
ALTER TABLE recipes DROP COLUMN captions_job;
ALTER TABLE recipes DROP COLUMN captions_queued_at;
ALTER TABLE recipes DROP COLUMN captions_claimed_at;
ALTER TABLE recipes DROP COLUMN captions_attempts;
```

The index goes first (SQLite refuses to drop an indexed column). 0020's CHECK is column-level, so
`DROP COLUMN` needs no table rebuild. A recipe whose job was pending when 0021 ran keeps its
`captions_error` (the blocked reason) and simply shows the transcript box (§8.12).
**Migration check (CJ-D):** rows written under 0001–0020 survive 0021; the four columns are gone from
`PRAGMA table_info(recipes)`; `idx_recipes_captions_job` is gone; `PRAGMA foreign_key_check` is empty;
`recipe_emojis` is intact.

### 4.2u Schema change — `migrations/0022_delivery_title.sql`

Decided by MojoSOGO 2026-10-04: a Claude Code session can ping the founder's phone (§9.4). Its push
carries the caller's title, so a fire-less delivery may now carry its own title.

```sql
-- §9.4 — a fire-less push delivery may carry its own push title (ops/notify); NULL elsewhere.
ALTER TABLE deliveries ADD COLUMN title TEXT;
```

`title` is NULL on every existing row and on every fire, announcement and house delivery; only
`POST /ops/notify` writes it. `sendPushDeliveries` shows a fire-less delivery as `title ?? ANNOUNCE_TITLE`
(§9.1). The column is also what the hourly limit counts by (§9.4). **Migration check (ON-M):** rows
written under 0001–0021 survive 0022 unchanged with `title` NULL; `PRAGMA foreign_key_check` is empty.

### 4.2v Schema change — `migrations/0023_list_item_photo.sql`

Decided by MojoSOGO 2026-10-04: a snapped item keeps its photo (§7A.3).

```sql
-- §7A.3 — a list item's photo: its R2 key (list-items/{itemId}/{random}.jpg), NULL when it has none.
ALTER TABLE list_items ADD COLUMN photo_key TEXT;
```

`photo_key` is NULL on every existing row. It is written only by `PUT /list-items/{id}/photo` and cleared by
`DELETE /list-items/{id}/photo`, by deleting the item and by deleting its list (§7A.1). It is never sent on the
wire: an item carries `hasPhoto` instead. **Migration check (SN-M):** rows written under 0001–0022 survive 0023
unchanged with `photo_key` NULL; `PRAGMA foreign_key_check` is empty.

### 4.2w Schema change — `migrations/0024_house_speakers.sql`

Decided by MojoSOGO 2026-10-04: each person ticks the house speakers they want to be alerted on (§9.2a).

```sql
-- §9.2a — the house speakers a member chose: a JSON list of HA entity ids; NULL = not chosen (the default speakers).
ALTER TABLE member_prefs ADD COLUMN house_speakers TEXT;
-- §9.2a — the speakers a house delivery is spoken on, fixed when it is written; NULL = the default speakers.
ALTER TABLE deliveries ADD COLUMN speakers TEXT;
```

Both are NULL on every existing row, so every existing member has not chosen and every queued house row
speaks on the default speakers, exactly as before. `house_speakers` is written only by `PATCH /me`;
`deliveries.speakers` only by the two writers of house rows (tick step 2 and `POST /announce`). A push row's
`speakers` is always NULL. **Migration check (HS-M):** rows written under 0001–0023 survive 0024 unchanged
with both columns NULL; `PRAGMA foreign_key_check` is empty.

### 4.2x Schema change — `migrations/0025_phone_login.sql`

Decided by MojoSOGO 2026-10-04: a browser can be signed in by approving it on the member's phone (§6.6).

```sql
-- §6.6 — one row per "Sign in with my phone" request. Rows are never deleted: they are the rate-limit count.
CREATE TABLE login_requests (
  id                 TEXT PRIMARY KEY,                -- 'lgn_' + 16 base32
  member_id          TEXT REFERENCES members(id),     -- NULL = a decoy: no usable member, or over the limit (§6.6)
  email              TEXT NOT NULL COLLATE NOCASE,    -- as asked, trimmed; what the limit counts by
  waiting_token_hash TEXT NOT NULL UNIQUE,            -- SHA-256 hex of the waiting browser's cookie
  match_number       INTEGER NOT NULL,                -- the 2-digit number the browser shows
  choices            TEXT NOT NULL,                   -- JSON [n, n, n]: the match and two decoys, shuffled
  status             TEXT NOT NULL CHECK (status IN ('pending','approved','denied','used')),
  user_agent         TEXT,                            -- the waiting browser's, ≤ 300 chars
  place              TEXT,                            -- "City, CC" from Cloudflare's request.cf; NULL = unknown
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL,                   -- created_at + 2 min
  decided_at         TEXT,                            -- approved or denied
  used_at            TEXT                             -- the session was minted
);
CREATE INDEX idx_login_requests_email ON login_requests(email, created_at);
CREATE INDEX idx_login_requests_member ON login_requests(member_id, status);

-- §6.6 — a push that is a sign-in notice (no fire), and where tapping it goes.
ALTER TABLE deliveries ADD COLUMN notice TEXT CHECK (notice IN ('login','new_sign_in'));
ALTER TABLE deliveries ADD COLUMN url TEXT;
```

Additive only. The column is `match_number`, not `match` (`MATCH` is an SQLite operator). `notice` and `url` are
NULL on every existing row and on every fire, announcement, ping and house delivery; only §6.6 writes them. M1-VOCAB
covers `login_requests.status` (`LOGIN_REQUEST_STATUS`) and `deliveries.notice` (`NOTICE_KIND`). **Migration check
(PL-M):** rows written under 0001–0023 survive 0025 unchanged with `notice` and `url` NULL; `login_requests` exists
empty; `PRAGMA foreign_key_check` is empty.

### 4.2y Schema change — `migrations/0026_shows.sql`

Asked by MojoSOGO 2026-10-05: the household's movies & shows list (§7F).

```sql
-- §7F — the household's movies & shows. Soft-deleted; a watched show keeps who and when.
CREATE TABLE shows (
  id           TEXT PRIMARY KEY,                -- 'shw_' + 16 base32
  title        TEXT NOT NULL,                   -- 1–120
  title_key    TEXT NOT NULL,                   -- showKey(title, year): one per key among live rows (§7F.1)
  kind         TEXT CHECK (kind IN ('movie','show')),  -- NULL = unknown
  year         TEXT,                            -- ≤ 20, free text
  rt_critics   INTEGER CHECK (rt_critics BETWEEN 0 AND 100),
  rt_audience  INTEGER CHECK (rt_audience BETWEEN 0 AND 100),
  watch        TEXT NOT NULL DEFAULT '[]',      -- JSON { how, where, note }[] (≤ 12)
  checked_at   TEXT,                            -- when how-to-watch was last looked up; NULL = never
  summary      TEXT,                            -- ≤ 500
  note         TEXT,                            -- ≤ 2000
  url          TEXT,                            -- ≤ 500, http(s) only
  status       TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want','watched')),
  watched_at   TEXT,
  watched_by   TEXT REFERENCES members(id),
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE UNIQUE INDEX uq_shows_key ON shows(title_key) WHERE deleted_at IS NULL;
```

Additive only. M1-VOCAB covers `shows.kind` (`SHOW_KIND`) and `shows.status` (`SHOW_STATUS`); `watch[].how`
(`WATCH_HOW`) is JSON, checked by `parseShowInput`. **Migration check (W-M):** rows written under 0001–0025
survive unchanged; `shows` exists empty; `PRAGMA foreign_key_check` is empty.

A schema change is always a **new** numbered migration plus a §4.2x section here.
An applied migration is never edited.

### 4.2z Schema change — `migrations/0027_list_emoji.sql`

Asked by MojoSOGO 2026-10-05: each list shows an emoji in the Lists picker (§8.8).

```sql
-- §7A.1 — a list's own emoji; NULL = the default picked from its name (defaultListEmoji).
ALTER TABLE lists ADD COLUMN emoji TEXT;  -- one emoji (emojiError, §7.6) or NULL
```

Additive only. **Migration check (LE-M):** rows written under 0001–0026 survive unchanged with `emoji` NULL;
`PRAGMA foreign_key_check` is empty.

### 4.2za Schema change — `migrations/0028_machine_hours.sql`

Asked by MojoSOGO 2026-10-05: the machines' alerts sound only in their hours (§7D.5).

```sql
-- §7D.5 — the machines' alert hours, household local HH:MM; both ends NULL = any time that day.
ALTER TABLE settings ADD COLUMN machine_weekday_from TEXT DEFAULT '17:30';
ALTER TABLE settings ADD COLUMN machine_weekday_to   TEXT DEFAULT '20:30';
ALTER TABLE settings ADD COLUMN machine_weekend_from TEXT DEFAULT '09:00';
ALTER TABLE settings ADD COLUMN machine_weekend_to   TEXT DEFAULT '21:00';
```

Additive only; the existing settings row takes the defaults. Checked by L21 (`GET /machines/hours` reads
`DEFAULT_MACHINE_HOURS` after the migration).

### 4.2zb Schema change — `migrations/0029_chore_areas.sql`

Asked by MojoSOGO 2026-10-05: each chore gets "an area for what done looks like with specific areas, pictures
and a list of expectations" (§7B.6).

```sql
-- §7B.6 — what done looks like: a chore's named areas, each with a list of expectations and reference photos.
CREATE TABLE chore_areas (
  id           TEXT PRIMARY KEY,                       -- 'cha_' + 16 base32
  chore_id     TEXT NOT NULL REFERENCES chores(id),
  name         TEXT NOT NULL,                          -- 1–40 chars, e.g. "Sink"
  expectations TEXT NOT NULL DEFAULT '[]',             -- JSON string[], 0–12, each 1–120 chars, in order
  position     INTEGER NOT NULL,                       -- order within the chore: the order added
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_chore_areas_chore ON chore_areas(chore_id, position);

CREATE TABLE chore_area_photos (
  id         TEXT PRIMARY KEY,                         -- 'cap_' + 16 base32
  area_id    TEXT NOT NULL REFERENCES chore_areas(id),
  photo_key  TEXT NOT NULL,                            -- R2 chore-areas/{areaId}/{random}.jpg; never on the wire
  created_at TEXT NOT NULL
);
CREATE INDEX idx_chore_area_photos_area ON chore_area_photos(area_id, created_at);
```

Additive only. Areas are deleted outright (they are reference, not history): `DELETE /chore-areas/{id}` and
deleting their chore remove the rows and the R2 objects. **Migration check (CA-M):** rows written under 0001–0028
survive 0029 unchanged; `PRAGMA foreign_key_check` is empty.

### 4.2zc Schema change — `migrations/0030_recipe_links.sql`

Asked by MojoSOGO 2026-10-05: recipes from Facebook links and any web page, not only YouTube (§7E.6).

```sql
-- §7E.6 — a recipe read from a link that is not a YouTube video. Additive only.
ALTER TABLE recipes ADD COLUMN link TEXT;  -- recipeLinkOf's cleaned link; NULL for a video or a typed recipe
-- One live recipe per link (§7E.6): a second paste of the same link is 409 duplicate.
CREATE UNIQUE INDEX uq_recipe_link ON recipes(link) WHERE deleted_at IS NULL AND link IS NOT NULL;
```

A link recipe keeps `video_id` and `video_title` NULL and its site's name ("Facebook", "allrecipes.com") in
`channel`. **Migration check (RL-M):** rows written under 0001–0029 survive 0030 unchanged, existing recipes
have `link` NULL; a second live recipe for one link is refused by `uq_recipe_link`, a soft-deleted one does not
block it.

### 4.2zd Schema change — `migrations/0031_recipe_photo.sql`

Asked by MojoSOGO 2026-10-05 (§7E.2b ⚑ Q174).

```sql
-- §7E.2b — a recipe's picture: the first screenshot of its latest read from screenshots, in R2. Additive only.
ALTER TABLE recipes ADD COLUMN photo_key TEXT;  -- R2 recipes/{id}/{random}.jpg; never on the wire; NULL = none
```

**Migration check (RP-M):** rows written under 0001–0030 survive 0031 unchanged, `photo_key` NULL.

### 4.2ze Schema change — `migrations/0032_messes.sql`

Asked by MojoSOGO 2026-10-05 (§7B.7).

```sql
-- §7B.7 — whose mess? A mess someone cleaned up, who owned up to it, and the point they owe. Additive only.
CREATE TABLE messes (
  id          TEXT PRIMARY KEY,                       -- 'mes_' + 16 base32
  reported_by TEXT NOT NULL REFERENCES members(id),   -- who cleaned it up, and is owed
  chore_id    TEXT REFERENCES chores(id),             -- the chore it belongs to; NULL = none named
  note        TEXT,                                   -- 1–120 chars; NULL = none
  photo_key   TEXT,                                   -- R2 messes/{id}/{random}.jpg; never on the wire; NULL once deleted
  claimed_by  TEXT REFERENCES members(id),            -- who owes: claimed it, or recorded by an admin
  claimed_at  TEXT,
  assigned_by TEXT REFERENCES members(id),            -- the admin who recorded it; NULL = claimed by the person
  discuss_at  TEXT,                                   -- moved to To talk about
  closed_at   TEXT,                                   -- closed by an admin as nobody's
  closed_by   TEXT REFERENCES members(id),
  settled_at  TEXT,
  settled_how TEXT CHECK (settled_how IN ('paid','forgiven')),
  settled_by  TEXT REFERENCES members(id),
  deleted_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_messes_created ON messes(created_at);

CREATE TABLE mess_denials (                           -- "Not me"
  mess_id    TEXT NOT NULL REFERENCES messes(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (mess_id, member_id)
);

-- A mess's asks and its To talk about notice: fire-less pushes that point at their mess (counted for the 4 asks).
ALTER TABLE deliveries ADD COLUMN mess_id TEXT REFERENCES messes(id);
CREATE INDEX idx_deliveries_mess ON deliveries(mess_id, member_id);
```

Additive only. `deliveries.mess_id` is NULL on every existing row and on every delivery but a mess's asks and its
To talk about notice. Messes are soft-deleted (their asks point at them). **Migration check (MS-M):** rows written
under 0001–0031 survive 0032 unchanged with `mess_id` NULL; `PRAGMA foreign_key_check` is empty.

### 4.3 Recurrence (subset of RFC 5545 RRULE, as JSON)

```ts
interface Recurrence {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;          // default 1; "every 2 weeks" = WEEKLY, interval 2
  byDay?: ('SU'|'MO'|'TU'|'WE'|'TH'|'FR'|'SA')[];   // WEEKLY: days; MONTHLY: exactly one day, with setPos
  setPos?: SetPos | SetPos[];  // MONTHLY only: which byDay(s) of the month (-1 = last) — RRULE "BYDAY=1TH,3TH"
  until?: string;             // local YYYY-MM-DD, inclusive
  count?: number;             // total occurrences; not together with until
}
```

- All expansion happens on **local dates**, then each occurrence is converted to
  UTC with `localToUtc`.
- `MONTHLY` with `byDay` + `setPos` repeats on the nth weekday of the month
  ("3rd Friday" = `{"freq":"MONTHLY","byDay":["FR"],"setPos":3}`; `-1` = last).
  `setPos` may be a **list** for several weeks of the month: "1st and 3rd Thursday" =
  `{"freq":"MONTHLY","byDay":["TH"],"setPos":[1,3]}` (`SetPos` = 1 | 2 | 3 | 4 | -1; a list
  is 1–5 distinct values; a single number stays valid, so stored events need no change).
  The event form derives it from the start date: n = ceil(day ÷ 7); a 5th weekday
  is offered as "last".
- `MONTHLY` without `byDay` repeats on the start date's day-of-month. Months without that day are
  **skipped** (the 31st does not fire in February). `YEARLY` on 29 Feb fires only
  in leap years. Both follow RFC 5545 behavior.
- `exdates` removes individual occurrences.
- `WEEKLY` + `interval: 2` counts weeks from the week (Sunday-start) that contains
  `start_date`.
- `src/shared/recurrence.ts` exports
  `occurrences(event, fromDate, toDate): string[]` (local dates, inclusive).
- The same module expands events for the calendar view **and** for the engine.
  There is one recurrence format in the whole app.
- **Acceptance:** 3rd Friday from 2026-10-16 → 2026-10-16, 2026-11-20, 2026-12-18;
  last Friday from 2026-10-30 → 2026-10-30, 2026-11-27, 2026-12-25;
  1st & 3rd Thursday from 2026-10-01 → 10-01, 10-15, 11-05, 11-19, 12-03, 12-17;
  2nd & last Monday from 2026-10-12 → 10-12, 10-26, 11-09, 11-30.

---

## 5. Alert engine — `src/shared/engine.ts` (pure)

### 5.1 Functions

```ts
// Which reminder fires should exist in [from, to)? Returns candidates; tick() inserts
// them with INSERT OR IGNORE (the unique index makes this idempotent).
// `place`: the household's place (§4.2o), needed only by a sun-timed event (§7.7).
planReminderFires(event: EventRow, tz: string, fromUtc: string, toUtc: string, place: Place | null = null): NewFire[]

// Advance one open fire to `now`. Returns the new fire row and any alerts to send.
stepFire(fire: FireRow, cfg: AlertConfig, now: string): { fire: FireRow; alert: boolean }

// A human acted on a fire. Returns the updated fire, plus the next fire for timers.
applyAction(fire: FireRow, action: Action, cfg: AlertConfig, memberId: string, now: string):
  { fire: FireRow; next?: NewFire } | { error: 'invalid_action' }

// Timer start/stop. `window`: the timer's active time range, if it has one.
applyTimerCmd(timer: TimerRow, openFire: FireRow | null, cmd: TimerCmd, intervalMin: number, memberId: string, now: string,
  window?: TimerWindow): { timer: TimerRow; closeFire?: FireRow; newFire?: NewFire }

// A rolling timer's active time range (local HH:MM in the household tz; from > to = overnight).
interface TimerWindow { from: string; to: string; tz: string }
timerWindow(from: string | null, to: string | null, tz: string): TimerWindow | undefined  // undefined unless both set
timerWindowError(win: { from; to }, intervalMin: number): string | null  // from = to, or interval ≥ window length
inside(t: string, win: TimerWindow): boolean     // from ≤ local < to; overnight: local ≥ from || local < to
nextTimerDue(base: string, intervalMin: number, win?: TimerWindow): string
```

**`planReminderFires` and the sun (§7.7):** an occurrence's start is `start_time` (or
`ALL_DAY_REMIND_TIME` for an all-day event) in `tz` — except when `start_sun` is `'sunset'`:
then it is `sunsetUtc(date, place)`. An occurrence whose sunset cannot be computed (no place,
or the sun does not set that day) is **skipped** — never planned at 09:00 or any other
substitute time. `due = start − remind_offset_min` as for every reminder.

`AlertConfig` = `{ channels, renotifyMin, maxAlerts, intervalMin?, window? }`, taken from
the event or timer row (`window` only for a timer that has one).

**`nextTimerDue`** — when a rolling timer next rings, counted from `base`:
- no window → `base + intervalMin`;
- `base` is inside the window and `base + intervalMin` is **before** the end of that open
  window → `base + intervalMin`;
- otherwise → the first window opening **strictly after** `base`, `+ intervalMin`. The
  countdown restarts when the window opens: a 60-min timer on 08:00–21:00 first rings at 09:00.

Openings and closings are local wall times converted with `localToUtc` (§4.1 DST rules: a
time in the spring-forward gap opens at the first valid instant after it; an ambiguous time
takes the earlier instant). The engine stays pure and uses only `localToUtc`, `utcToLocal`
and `addDays` from `time.ts`.

### 5.2 Constants

```ts
export const MATERIALIZE_AHEAD_H = 36;   // reminder fires are created this far ahead
export const MISSED_AFTER_MIN   = 60;    // reminders overdue by more than this close as 'missed'
export const SNOOZE_MIN         = 10;    // ⚑ DEFAULT
```

### 5.3 `stepFire` rules (evaluated in order; first match wins)

| # | Fire state | Condition | Result |
|---|------------|-----------|--------|
| 0 | kind `timer` with a window | `ringing` and `now` outside the window, **or** `scheduled`, `now ≥ due_at` and `now` outside the window | `scheduled`, `due_at = nextTimerDue(now, intervalMin, window)` (= the next window opening + interval), `alert_count = 0`, `last_alerted_at = null`, **no alert** |
| 1 | `scheduled` | `now < due_at` | no change |
| 2 | `scheduled`, kind `reminder` | `now − due_at > MISSED_AFTER_MIN` (strictly — exactly 60 min still rings) | `closed`, reason `missed`, **no alert** |
| 3 | `scheduled` | `now ≥ due_at` | `ringing`, `alert_count = 1`, `last_alerted_at = now`, **alert** |
| 4 | `ringing` | `renotifyMin` set, `alert_count < maxAlerts`, `now ≥ last_alerted_at + renotifyMin` | `alert_count + 1`, `last_alerted_at = now`, **alert** |
| 5 | anything else | — | no change |

Timers, chores and machines are never `missed`. An overdue timer or chore still rings, even
after an outage — a chore does not stop needing doing.

**Rule 0 — a timer never rings outside its active time range** (§4.2n). It is the snooze
shape, not a close: the same fire goes back to `scheduled`, leaves the Ringing bar quietly,
and rings again at the next window opening + interval. There is no new close reason and no
new fire. It also catches a renotify that would fall after the window closes, and a stale
`scheduled` fire seen outside the window (an outage, or a window edited after the fire was
planned — a PATCH does not re-plan the open fire). A `scheduled` fire not yet due is left
alone even outside the window; it is judged when it comes due.

**Rule 0b — quiet hours** (§7D.5): when the source's `AlertConfig.quietUntil` is set (it may not
sound now), a step that would alert instead puts the fire back to `scheduled`, `due_at =
quietUntil`, `alert_count 0`, `last_alerted_at` null — the snooze shape, no alert. A step that
would not alert (not yet due, or ringing silently past `maxAlerts`) is unchanged.

After `maxAlerts` a fire stays `ringing` **silently**. It remains visible in the
app's Ringing bar (§8.2) until someone acts.

### 5.4 `applyAction` rules

| Action | Valid on | Result |
|--------|----------|--------|
| `done` | reminder, `ringing` | `closed`, reason `done`, `closed_by` |
| `snooze` | reminder, `ringing` | `scheduled`, `due_at = now + SNOOZE_MIN`, `alert_count = 0` |
| `done` | chore, `ringing` | advances the run one step (§7B.3) — the route calls `advanceRun`; the fire closes `done` |
| `ack` | timer, `ringing` **or** `scheduled` | `closed`, reason `acked`; **next** = new timer fire `due_at = nextTimerDue(now, intervalMin, window)` (= `now + intervalMin` without a window) |
| any | machine | `invalid_action` — a machine fire is closed only by the `/machines` routes (§7D) |
| anything else | — | `{ error: 'invalid_action' }` → HTTP 409 |

Any member may act on any fire. ⚑ DEFAULT

### 5.5 `applyTimerCmd` rules

| Cmd | Timer | Result |
|-----|-------|--------|
| `start` | not running | `running = 1`; new fire `due_at = nextTimerDue(now, intervalMin, window)` (= `now + intervalMin` without a window; started outside the window → the next opening + interval) |
| `start` | running | no change (idempotent) |
| `stop` | running | `running = 0`; open fire (if any) → `closed`, reason `stopped` |
| `stop` | not running | no change |

### 5.6 `tick(db, now)` — `src/worker/tick.ts` (not pure; orchestration only)

Runs from `scheduled()` every minute, and from `POST /api/v1/dev/tick` in dev.

1. **Materialize.** For every non-deleted event with a reminder, call
   `planReminderFires(event, tz, now, now + 36h)`. Insert the results with
   `INSERT OR IGNORE`, skipping any whose `due_at` is already more than
   `MISSED_AFTER_MIN` in the past.
2. **Step.** For every fire with `state != 'closed'`, call `stepFire`. Write each
   changed row. For each `alert: true`:
   - Write deliveries (§5.7).
   - If the fire went `scheduled → ringing` and is a reminder, close any other
     `ringing` fire of the same event as `superseded`.
3. **Send push.** Send the `push` deliveries created in this tick (§9.1).
   3b. **Mess asks.** `messTick` (`src/worker/mess-asks.ts`): ask again about each open mess,
   move an unclaimed one to To talk about, and delete mess photos past `MESS_PHOTO_KEEP_DAYS`
   (§7B.7). Its asks are fire-less push deliveries, sent at once.
4. **Speak house.** `sendHouseDeliveries(env, now)` drains queued and stale-claimed `house`
   deliveries (§9.2).
5. Use a D1 `batch()` per fire for the writes. D1 has no `BEGIN`/`COMMIT`.

**Event edits:** when an event is updated or deleted, close its `scheduled` fires
with `due_at > now` as `removed` in the same request. The next tick
re-materializes them. `ringing` fires are left alone. A `scheduled` fire with
`due_at ≤ now` is also left alone, deliberately: it is already due, the next tick
(≤ 60 s) rings it, and the edit arrived too late to stop it — exactly as if it had
already rung.

**Delete one occurrence** (`POST /events/{id}/exdates`) closes that occurrence's
`scheduled` fire as `removed` whatever its `due_at`.

### 5.7 Deliveries

For one alert of one fire:

- **Recipients** = `assigned_to` members; if `[]`, all non-disabled members. For a
  **chore** fire: only the current step's person (§7B.2), or all active members if
  there is none.
- `push` in channels → one `deliveries` row **per recipient**, `member_id` set.
- `house` in channels → **one** row, `member_id` NULL.
- **Message text:**
  - reminder: `"Reminder: {title}"`
  - timer: `"Timer: {title}"`
  - chore: `"Chore for {name}: {title}"`, plus `" — {step title}"` when the chore has
    more than one step. `{name}` is the step person's display name; with nobody,
    `"Chore: {title}"`. Naming the person is what lets Shelly (and everyone) hear whose
    turn it is without a phone.
  - machine: `"{name}, your laundry in the {machine} is done"`; with no active owner,
    `"The laundry in the {machine} is done"`; plus `" — {name}'s load is waiting"` while the
    machine before it holds a done load (§7D.3). Built by `machines.ts` `doneMessage`;
    recipients are every active member, and the house row goes to every speaker
    (`machines.ts` `machineAlert`: nobody assigned, `allSpeakers`), waiting for the alert hours (§7D.5).
  - sun-timed reminder (§7.7): `"{title} — sunset at {h:mm}"` — the occurrence's sunset in
    the household tz, 12-hour with no am/pm ("18:42" → "6:42") ⚑ Q52; when that sunset cannot
    be computed at alert time, `"{title} — before sunset"`. `alertMessage(kind, title, n,
    chore?, startsToday?, sunsetAt?)` takes it as a trailing `sunsetAt` (local `HH:MM`, or
    `null` = could not be computed; absent = not a sun event). No emoji in the text.
  - from the second alert on, append `" (alert {n})"`

A delivery with **no fire** is an announcement (§9.3, `POST /announce`), a sign-in notice (§6.6), a
founder ping (§9.4, `POST /ops/notify`) or a mess ask (§7B.7). `tick` writes only the last of these, in
step 3b (§5.6); every fire-less row is written through `src/worker/deliveries.ts`.

### 5.8 Engine acceptance tables (M1 — each row is a test)

**Timer "Check on the dog", interval 60, renotify 15, maxAlerts 4, all times UTC:**

| # | Call | now | Expected |
|---|------|-----|----------|
| T1 | `applyTimerCmd start` | 12:00 | running; fire due 13:00, `scheduled` |
| T2 | `stepFire` | 12:59 | no change, no alert |
| T3 | `stepFire` | 13:00 | `ringing`, alert_count 1, **alert** |
| T4 | `stepFire` | 13:14 | no change |
| T5 | `stepFire` | 13:15 | alert_count 2, **alert** |
| T6 | `stepFire` | 13:30, 13:45 | alert_count 3, then 4, **alert** each |
| T7 | `stepFire` | 14:00 | no change (max reached, stays `ringing`) |
| T8 | `applyAction ack` | 14:05 | `closed`/`acked`; next fire due **15:05** |
| T9 | `applyAction ack` on the 15:05 fire while `scheduled` | 14:30 | closed/`acked`; next due **15:30** |
| T10 | `applyTimerCmd stop` | 14:40 | not running; open fire `closed`/`stopped`; no next fire |
| T11 | `applyAction snooze` on a timer fire | any | `invalid_action` |

**The user's own example (renotify NULL):** start 12:00 → rings 13:00, one alert →
ack 13:45 → next due 14:45.

**Timer with an active time range (§4.2n, rule 0)** — tz `America/Los_Angeles`, window
08:00–21:00, interval 60, renotify 15, maxAlerts 4; times are household local on Tue
2026-10-06 (PDT) unless a date is given:

| # | Call | now | Expected |
|---|------|-----|----------|
| TW1 | `applyTimerCmd start` | 06:00 | running; fire due **09:00** (opening + 60) |
| TW2 | `applyAction ack` | 20:30 | next due **Wed 09:00** (20:30 + 60 is past 21:00) |
| TW3 | `applyAction ack` | 19:30 | next due **20:30** |
| TW4 | `stepFire` on a `ringing` fire | 21:00 | `scheduled`, due **Wed 09:00**, `alert_count 0`, `last_alerted_at` null, **no alert** |
| TW5 | `stepFire` on a fire ringing since 20:50, alert 1 — the 15-min renotify would be 21:05 | 21:05 | `scheduled`, due Wed 09:00, **no alert** |
| TW6 | `stepFire` on a stale `scheduled` fire due 22:00 | 22:00 | deferred: `scheduled`, due Wed 09:00, **no alert** |
| TW7 | `stepFire` on a `scheduled` fire due 09:00 | 09:00 | `ringing`, alert 1, **alert** (inside: rule 3 as before) |
| TW8 | overnight window 22:00–06:00, `applyAction ack` | 05:30 | next due **23:00** the same day |
| TW9 | no window | — | T1–T11 unchanged; `nextTimerDue(base, 60)` = base + 60 |
| TW10 | `timerWindowError` | — | `08:00–08:00` → an error; 60 min on `08:00–09:00` → an error (interval ≥ window); 59 min on it → null; 60 min on `22:00–06:00` → null |
| TW11 | DST ends 2026-11-01: `applyAction ack` | Sat 2026-10-31 20:30 PDT | next due Sun **09:00 PST** = `2026-11-01T17:00:00.000Z` |
| TW12 | `inside` | 08:00 / 20:59 / 21:00 / 07:59 | true / true / false / false; overnight 22:00–06:00: 23:00 and 05:59 true, 06:00 and 21:59 false |

**Reminder, household tz `America/Los_Angeles`:**

| # | Setup / call | Expected |
|---|--------------|----------|
| R1 | Event Tue 2026-10-06 19:00, WEEKLY, offset 0; plan from 2026-10-06T00:00Z to +36 h | one fire, occurrence `2026-10-06`, due `2026-10-07T02:00:00.000Z` |
| R2 | Same event, offset 30 | due `2026-10-07T01:30:00.000Z` |
| R3 | DAILY 08:00, occurrences 2026-10-31 and 2026-11-01 (DST ends 2026-11-01) | due `2026-10-31T15:00:00.000Z` and `2026-11-01T16:00:00.000Z` |
| R4 | MONTHLY on 2027-01-31, first 3 occurrences | 2027-01-31, 2027-03-31, 2027-05-31 |
| R5 | WEEKLY byDay [MO,WE,FR], start Mon 2026-10-05, until 2026-10-11 | 10-05, 10-07, 10-09 |
| R6 | WEEKLY interval 2, start Tue 2026-10-06, first 3 | 10-06, 10-20, 11-03 |
| R7 | R6 with exdates [2026-10-20] | 10-06, 11-03, 11-17 |
| R8 | `stepFire` on a scheduled reminder, now = due + 61 min | `closed`/`missed`, no alert |
| R9 | `stepFire` now = due + 59 min | `ringing`, alert |
| R9a | `stepFire` now = due + 60 min exactly | `ringing`, alert (the boundary is not missed) |
| R10 | `snooze` at 19:03 local | `scheduled`, due 19:13 local, alert_count 0 |
| R11 | `ack` on a reminder | `invalid_action` |
| R12 | `planReminderFires` called twice for the same window | identical output (idempotent) |
| R13 | `localToUtc('2027-03-14','02:30','America/Los_Angeles')` (spring-forward gap) | `2027-03-14T10:00:00.000Z` (= 03:00 PDT) |
| R14 | `localToUtc('2026-11-01','01:30','America/Los_Angeles')` (ambiguous) | `2026-11-01T08:30:00.000Z` (earlier, PDT) |

---

## 6. Accounts

### 6.1 Owner bootstrap

When `members` is empty, `GET /setup` shows a form: setup token, name, email,
password. `POST /api/v1/setup` requires the `SETUP_TOKEN` secret, creates the
owner and logs them in. Once any member exists it returns 410 Gone.

### 6.2 Invites

- **Only the owner creates invites.** The owner enters a display name; the server
  returns a code once.
- **Code format:** `XXXX-XXXX-XXXX`, from Crockford base32
  (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), 60 random bits.
- **Normalization:** input is uppercased and dashes/spaces are removed. Then
  `I` and `L` become `1` and `O` becomes `0`. The result is SHA-256 hashed.
- **Expiry and use:** single use; expires after 7 days; the owner can revoke it.
- **Signup:** `POST /api/v1/auth/signup` with code, email, password (≥ 10 chars),
  display name. The new member gets the next unused palette color (§6.5).
- **Errors:** wrong, expired, used and revoked codes all return the **same** 400
  `invalid_code`.

### 6.2a The invite experience

An invite is something you **hand over**, not a code someone has to type.

- **The link:** `{origin}/join#{code}`, where `{origin}` is the address the owner is using
  right now (`location.origin` — on the home network that is the LAN address, §2.3). The
  code travels in the **fragment**, so it is never sent to the server, never logged, and
  never in a query string. The join page reads it, then removes it from the address bar
  (`history.replaceState`) so it does not linger in history.
- **Preview before joining:** `POST /auth/invite-preview { code }` → `{ displayName,
  householdName, invitedBy, expiresAt }` for a usable code; anything else is the same 400
  `invalid_code` as signup (no hint which of wrong/expired/used/revoked). It never uses
  the invite.
- **Typing still works:** the manual "I have an invite code" field also accepts a whole
  pasted link and takes the code from it.
- **First arrival:** right after joining, a one-time **welcome** card (below) — then
  never again for that member on that device.
- **One way in by link:** the old `?invite=` query entry is removed; `/join#CODE` replaces it.

**Acceptance (M4d — API tests):**

| # | Call | Expected |
|---|------|----------|
| I1 | preview a fresh code | 200 `{ displayName, householdName, invitedBy, expiresAt }`; the invite is still unused |
| I2 | preview the same code with dashes removed and lower-case, `I`/`L`/`O` swapped in | 200 (normalization as §6.2) |
| I3 | preview a used, an expired, a revoked and a made-up code | each 400 `invalid_code`, identical message |
| I4 | signup after preview | 201; a second preview of that code → 400 `invalid_code` |
| I5 | preview without a session, and with a member session | both allowed (it is public, like signup) |
| I6 | `GET /invites` after I4 | that invite shows `usedBy` = the new member's name and `usedAt` |

### 6.3 Roles

There are two roles (`ROLE` in §3): `owner` and `member`. **More than one member may
have `owner`.** In the app the role reads **Admin**; the **founder** — the member created
by setup (§6.1), i.e. the earliest `created_at` — reads **Owner**. The founder is derived,
never stored.

| | owner (Admin / Owner) | member |
|---|---|---|
| Create events/timers/alarms/chores | ✓ | ✓ |
| Edit/delete **own** | ✓ | ✓ |
| Edit/delete **others'** | ✓ | ✗ |
| Done / snooze / ack any fire; start/stop any timer; tick any list item or chore | ✓ | ✓ |
| Invites, disable members, household settings | ✓ | ✗ |
| **Make a member an admin, or remove an admin** | ✓ | ✗ |

**Rules for changing people** (`PATCH /members/{id}`, owner only):
- **The founder is protected:** their role cannot be changed and they cannot be disabled.
  The household can never be locked out of its founder.
- Any admin may make a member an admin, remove another admin, or remove themselves.
- A disabled member cannot be made an admin (enable them first). Disabling an admin
  is allowed (they stay an admin, signed out, until enabled).
- A change takes effect on the person's **next request** — roles are read from the
  database on every request, never cached in the session.
- Every refusal is 400 `invalid_input` with a plain message ("The owner can't be
  made a regular member.").

**Acceptance (API tests):**

| # | Call | Expected |
|---|------|----------|
| A1 | founder makes member M an admin | 200; M can now create an invite (201) |
| A2 | admin M makes member N an admin, then removes N | both 200; N can no longer create an invite (403) |
| A3 | anyone changes the founder's role, or disables the founder | 400 `invalid_input` |
| A4 | a regular member tries to make themselves admin | 403 `forbidden` |
| A5 | make a disabled member an admin | 400 `invalid_input` |
| A6 | `GET /members` | each row has `role` and `isFounder`; exactly one founder |
| A7 | admin M removes their own admin role | 200; M's next owner-only request is 403 |

### 6.4 Login rate limit

Five failed logins for one email within 15 minutes → further attempts for that
email return 429 for 15 minutes.

### 6.5 Member palette

Assigned in order at signup (`MEMBER_PALETTE` in `vocab.ts`). Red and blue are
excluded because they mean holidays:

```
#FF6B35 orange   #10B981 green   #8B5CF6 purple   #EC4899 pink
#F59E0B amber    #06B6D4 cyan    #84CC16 lime     #A16207 brown
```

### 6.6 Sign in with my phone — `src/shared/phone-login.ts`, `/auth/phone-login`

Decided by MojoSOGO 2026-10-04. On the sign-in page a browser (typically the PC) enters an email and taps
**Sign in with my phone**. The member's phones get a push; tapping it opens Ensō on an approve screen that
shows the browser, a rough place and the time, and three numbers. The member taps the number the PC shows
(**number matching**), and the waiting PC is signed in with no password. Passwords stay exactly as they are
(§6.4 untouched).

**Rules** (`src/shared/phone-login.ts`, pure, imports only `vocab`):
- `APPROVE_LOGIN_PATH = '/approve-login'`; `approveLoginUrl(id)` → `/approve-login#{id}` (the id rides in the
  fragment, like an invite code, §6.2a).
- `LOGIN_REQUEST_TTL_MIN = 2` — a request lives 2 minutes. `loginRequestExpiry(now)` → now + 2 min.
- `LOGIN_REQUESTS_PER_WINDOW = 3` per email per `LOGIN_REQUEST_WINDOW_MIN = 15` minutes;
  `loginWindowStart(now)` → now − 15 min. ⚑
- `USER_AGENT_MAX = 300` characters kept.
- `matchNumbers(bytes)` — randomness passed in (`MATCH_RANDOM_BYTES = 4` bytes from `crypto.getRandomValues`) →
  `{ match, choices }`: `match` a 2-digit number (10–99); `choices` three **distinct** 2-digit numbers, one of
  them the match, its position chosen by the bytes too.
- `pollView(row, now)` → the `LOGIN_VIEW` the waiting browser is told: `denied` → `denied`; `used` → `expired`
  (spent); `pending` / `approved` at or after `expires_at` → `expired`; otherwise the stored status. **Expired
  is derived, never stored.**
- `approveView(row, now)` → what the phone is told: as `pollView`, except `used` → `approved` (the member's
  approval did sign the browser in).
- `decide(row, memberId, choice, now)` — `choice` a number, or `null` for "This wasn't me" →
  `{ ok: true, status: 'approved' | 'denied' }` or a refusal, checked in this order: `not_yours` (the row has
  no member, or another member's), `not_pending` (already decided or used), `expired`. The right number →
  `approved`; a wrong number or `null` → `denied`.
- `claim(row, now)` → `{ ok: true }` (the row becomes `used`) or a refusal `not_approved` / `expired`.
- `browserSummary(userAgent)` → "Chrome on Windows", "Safari on iPhone", … (Edge, Opera, Samsung Internet,
  Firefox, Chrome, Safari; Windows, iPhone, iPad, Android, Mac, ChromeOS, Linux); an unrecognised browser is
  **"Unknown browser"**, an unrecognised system is left off — never a guess.
- `placeText(city, country)` → "Oceanside, US", "US", or `null` when neither is known; the screen then says
  **"Place unknown"** (`PLACE_UNKNOWN`).
- `loginRequestMessage(browser)` → "Sign-in request from {browser} — tap to check"; `newSignInMessage(browser)`
  → "New sign-in on {browser}"; `NOTICE_TITLE = "🔑 Ensō sign-in"` ⚑ — the push title of both.

**`POST /auth/phone-login { email }`** (public):
1. `email` not a valid address → 400 `invalid_input` (the format only, never whether it exists).
2. The member is looked up by email (case-insensitive). **Usable** = exists and not disabled.
3. The requests for that email created at or after `loginWindowStart(now)` are counted (every row, decoys too).
4. One `db.batch`: (a) `UPDATE login_requests SET status='denied', decided_at=? WHERE member_id=? AND
   status='pending'` — **at most one pending request per member**: a new one moves the old one to `denied`,
   never deleted (the rows are the rate-limit count) ⚑; (b) the INSERT of the new row with a fresh
   `matchNumbers`, `expires_at` = now + 2 min, the hash of a fresh waiting token, the user agent (≤ 300) and
   the place from `request.cf`. For no usable member, or at or over the limit, the row is a **decoy**:
   `member_id` NULL (step (a) then matches nothing), so nobody can ever approve it and it can only expire.
5. The browser gets the **waiting cookie** `hrc_phone_login` (the token; `HttpOnly`, `Secure` on https,
   `SameSite=Lax`, `Path=/api/v1/auth/phone-login`, 10 min) and **202 `{ match, expiresAt }`**.
6. Only for a usable member under the limit, and only after the response (`c.executionCtx.waitUntil`): one
   fire-less `push` delivery to the member — `notice 'login'`, `url` = `approveLoginUrl(id)`, `title`
   `NOTICE_TITLE`, `message` = `loginRequestMessage(browserSummary(ua))` — sent with `sendPushDeliveries`. A
   member with no phone gets the honest `failed`, `no_subscription` row (§9.1). Never a house row.

**`GET /auth/phone-login`** (the waiting cookie, no session) — the waiting browser polls every ~2 s:
- No cookie, or one that matches no row → 404 `not_found`.
- → `{ status: pollView(row, now) }`. When the row is `approved` and not expired, the poll **claims** it:
  `UPDATE login_requests SET status='used', used_at=? WHERE id=? AND status='approved' AND expires_at > ?`; only
  when that changed exactly one row is a session started (`startSession`, §2.1) and the waiting cookie cleared,
  → `{ status: 'approved' }`. A poll that loses the claim answers its `pollView` (`expired`) and mints nothing.

**`GET /auth/phone-login/{id}`** (member) → `{ id, browser, place, createdAt, expiresAt, status:
approveView(row, now), choices }` — never the match as such. Another member's request, a decoy, or an unknown
id → **404 `not_found`**, all alike.

**`POST /auth/phone-login/{id}/approve { number }`** (member): `number` not an integer → 400 `invalid_input`;
then `decide`: `not_yours` → 404 `not_found`; `not_pending` → 409 `not_pending`; `expired` → 409 `expired`;
otherwise the guarded `UPDATE … SET status=?, decided_at=? WHERE id=? AND status='pending'` (a lost race → 409
`not_pending`) → 200 `{ status: 'approved' | 'denied' }`. **A wrong number denies the request** — there is no
second try; the PC starts again.

**`POST /auth/phone-login/{id}/deny`** (member) — "This wasn't me": `decide` with `null`, the same refusals →
200 `{ status: 'denied' }`.

**New sign-in notice** ⚑: after a successful **password** sign-in (`POST /auth/login`), the member gets one
push, "New sign-in on {browser}" (`notice 'new_sign_in'`, `title` `NOTICE_TITLE`, `url` NULL), sent with
`sendPushDeliveries` before the login answers — only when the member has at least one phone subscribed (with
none there is nobody to tell, so no row ⚑), and a failure to send never fails the sign-in. Not after a phone
approval (they just approved it), not after signup or setup. Push only, never house.
`sendSignInNotice(env, memberId, userAgent, now)` in `routes/phone-login.ts` is the one place it is written.

**Security properties:**
- **No enumeration:** a real, unknown, disabled, phoneless or rate-limited email gets the identical 202 shape,
  the identical waiting cookie, the same batch of statements, and a row that polls `pending` then `expired`;
  the push happens after the response, inside `waitUntil`.
- **Bound to the waiting browser:** only the cookie set by the POST collects the session; the request id in the
  push cannot collect anything, and the waiting token is stored hashed.
- **One-time:** the guarded claim changes exactly one row, so an approved request mints exactly one session.
- **Same member only:** only the requested member's own session can see, approve or deny a request (others
  get 404).
- **Number matching:** the phone shows three numbers; only the one on the PC's screen approves. A tap-through
  on a push someone else triggered picks right one time in three at best, and a wrong pick denies.
- **The number is never in the push** — not in its body, title or the delivery's `message` (deliveries show in
  Settings → Status).

**Acceptance (M4w — each row is a test):**

| # | Check | Expected |
|---|---|---|
| PL1 | `matchNumbers` over many byte strings | `match` 10–99; three distinct 2-digit choices containing the match; every position reachable; deterministic for the same bytes |
| PL2 | `pollView` / `approveView` / `decide` / `claim` with injected `now` | pending → pending, at `expires_at` → expired; denied stays denied; used → expired (poll) / approved (phone); decide: another member or a decoy → `not_yours`, decided → `not_pending`, past expiry → `expired`, right number → approved, wrong or null → denied; claim: approved in time → ok, pending → `not_approved`, past expiry → `expired` |
| PL3 | `browserSummary` / `placeText` / messages | Chrome/Edge/Firefox/Safari on Windows/Mac/iPhone/Android named; garbage → "Unknown browser"; `placeText(null, null)` = null; the two messages as above |
| PL4 | POST for a real member with a phone, an unknown email, a disabled member, a member without a phone | each 202 with exactly the keys `{ match, expiresAt }`, a 2-digit match and a waiting cookie; only the real ones get a `push` delivery (the phoneless one `failed`, `no_subscription`); unknown / disabled → a decoy row, no delivery |
| PL5 | four requests for one email within 15 min | the 4th: the same 202, no new push delivery, a decoy row; a request older than 15 min does not count |
| PL6 | a second request while the first is pending | the first becomes `denied` (row kept); the first browser's poll says `denied` |
| PL7 | the phone picks a wrong number; "This wasn't me" | 200 `{ status: 'denied' }`; the poll says `denied`; a second approve → 409 `not_pending` |
| PL8 | another member GETs, approves or denies; anyone GETs a decoy | 404 `not_found` each; the request stays `pending` |
| PL9 | a poll with no cookie, and with another browser's cookie | 404 / that browser's own request's status — never this request's session |
| PL10 | right number → poll | `approved`, exactly one new `sessions` row, the waiting cookie cleared, `/me` works with the new cookie; the same waiting cookie polled again → `expired`, still one session |
| PL11 | a request past `expires_at` (time moved by rewriting the row) | poll `expired`; approve → 409 `expired`; nothing minted |
| PL12 | the login push | one delivery: `notice 'login'`, `url` = `/approve-login#{id}`, `title` "🔑 Ensō sign-in", `fire_id` NULL; the message and the decrypted push never contain the match number; the push carries `url` |
| PL13 | `POST /auth/login` (password) for a member with a phone; without one | one `new_sign_in` push delivery "New sign-in on …", `url` NULL; no row without a phone; a phone approval writes no `new_sign_in` |
| PL14 | `/ops/notify` hourly count | notice rows never count toward `OPS_NOTIFY_PER_HOUR` |
| PL15 | vocabulary, producer against consumer | every `NOTICE_KIND` value the routes write is accepted by the migrated `deliveries.notice` CHECK; every `LOGIN_REQUEST_STATUS` by `login_requests.status` (inserted for real, not compared as text) |
| PL-M | migration 0025 | §4.2x's check |

---

## 7. Calendar

### 7.1 Continuous view (the main screen)

- **Layout:** weeks run top to bottom, **Sunday first**, one row per week, with no
  gap or reset at month boundaries.
- **Month boundaries:**
  - Alternating months use two background tones (`--month-a`, `--month-b`).
  - The 1st of each month shows the month abbreviation in its cell ("Oct 1").
  - A sticky header shows the month and year of the top visible row.
  - There are no prev/next month arrows.
- **Opening and scrolling:**
  - On open, the week containing today is the second visible row.
  - A **Today** button scrolls back to it.
  - The view renders a window of weeks around the viewport and extends it as the
    user scrolls, in both directions. It is virtualized: never more than about 30
    week rows in the DOM.
- **Today:** the date number gets an accent-colored circle, and the whole cell has a
  **pulsing accent border** (a steady border when the OS asks for reduced motion).
- **Event display in a cell:**
  - At ≥ 480px, up to 3 lines per cell, each a 1-line event title chip in the
    creator's color, truncated with an ellipsis. Beyond 3, a `+N` badge.
  - Below 480px, **colored dots only** (max 4, then `+`); titles appear in the day
    sheet. At 320px a cell is about 44px wide, and titles do not fit.
  - **An event with an emoji gets no dot** when its emoji shows beside the date (§7.6): the
    emoji is its mark, so a household reminder like 🧹 street sweeping is not painted in its
    creator's color as if it were that person's. Tapping the day opens the day sheet as
    always. If the two-icon limit (§7.2) hides its emoji, it keeps its dot so it is never
    unmarked. (Decided by MojoSOGO 2026-10-03.)
- **Multi-day (all-day) events are grouped:** one continuous bar in the event's
  color spans the days, and those day cells get a faint tint of the same color so
  the stay reads as one block. The title is written **once**, at the start of the
  bar — and again at the start of a week row if the stay wraps onto it. The bar sits
  above the per-day entries and does not take taps: each day stays individually
  tappable and still shows its own events. Overlapping stays stack in lanes. Timed
  events are single-day in v1.
- **Tapping a day** opens the **day sheet** (§8.3).
- **Scheduled alarms (`is_alarm = 1`) are never drawn on the calendar** and never
  appear in `/calendar`. They are listed on the Alarms tab (§8.5).

Correct sample for Sep–Oct 2026 (2026-09-01 is a Tuesday; ▣ = public holiday):

```
        Sun  Mon  Tue  Wed  Thu  Fri  Sat
Sep '26  30   31  Sep1   2    3    4    5     <- Aug 30–31 in the previous month's tone
          6   ▣7    8    9   10   11   12     <- Sep 7 = Labor Day
         13   14   15   16   17   18   19
         20   21   22   23   24   25   26
         27   28   29   30 Oct1    2    3     <- tone changes at Oct 1
Oct '26   4    5    6    7    8    9   10
```

### 7.2 Holidays and day icons

| Type | Source | Treatment |
|------|--------|-----------|
| Public (days off) | Computed in `src/shared/holidays.ts`, filtered to the household's **days off** (§7.3) — no hand-typed yearly dates | **Whole cell tinted faint yellow** (`--holiday-public-cell`) + the holiday's **emoji**; name in the day sheet |

**School holidays were removed** (decided by MojoSOGO 2026-10-03): a school break is entered
as an ordinary event when wanted. Migration 0010 drops the table, the member switch and
the 5 carried-over "Fall break" days (deleted, not converted — his choice).

**Day icons** — a day's icons sit **to the right of the date number, on the same line, at
every width** (phones included; never on the line below — decided by MojoSOGO). Icons, in
order: the public holiday's emoji, 📈 (§7.4), then the emoji of that day's events (§7.6).
At most **two** show beside the number; the rest are in the day sheet. Each is shown only if
it is on for the member (§7.5).

- **Legend:** shown once, directly under the sticky month header: a yellow square
  (`--holiday-public-swatch`) "Public holiday" and "📈 Options expiration" (§7.4), each only
  while it is on for the member.
- **Switches:** public holidays and 📈 are rows of **Optional calendar items** (§7.5), not
  separate checkboxes.
- **Off means off everywhere** for that member — the cell tint and icon, the legend entry
  **and the day sheet** (a public holiday switched off is not listed there either). ⚑

### 7.3 Holidays and household days off (`holidays.ts`)

`HOLIDAYS` is the one table of known holidays — key, name, rule:

| Key | Emoji | Holiday | Rule | Day off by default |
|-----|:---:|---------|------|:---:|
| `new_years_day` | 🎉 | New Year's Day | Jan 1 | ✓ |
| `mlk_day` | 🕊️ | Martin Luther King Jr. Day | 3rd Monday of January |  |
| `presidents_day` | 🏛️ | Presidents' Day | 3rd Monday of February |  |
| `memorial_day` | 🎖️ | Memorial Day | last Monday of May | ✓ |
| `juneteenth` | ✊ | Juneteenth | Jun 19 |  |
| `independence_day` | 🎆 | Independence Day | Jul 4 | ✓ |
| `labor_day` | 🛠️ | Labor Day | 1st Monday of September | ✓ |
| `columbus_day` | ⛵ | Columbus Day | 2nd Monday of October |  |
| `veterans_day` | 🪖 | Veterans Day | Nov 11 |  |
| `thanksgiving` | 🦃 | Thanksgiving | 4th Thursday of November | ✓ |
| `day_after_thanksgiving` | 🛍️ | Day after Thanksgiving | the Friday after Thanksgiving | ✓ |
| `christmas_eve` | 🎄 | Christmas Eve | Dec 24 | ✓ |
| `christmas` | 🎁 | Christmas | Dec 25 | ✓ |
| `new_years_eve` | 🥂 | New Year's Eve | Dec 31 | ✓ |

- `publicHolidays(year, keys?)` returns the holidays (actual + observed dates) whose
  key is in `keys` (all when omitted).
- **Household days off** = `settings.days_off` (JSON array of keys, §4.2b); `NULL` means `DEFAULT_DAYS_OFF` from `holidays.ts` (the ✓
  column). The owner edits it in Settings → Household → **Days off** (a checklist of
  every key in `HOLIDAYS`). `/calendar` returns only days-off holidays.

**Observed rule:** applies to the fixed-date holidays Jan 1, Jun 19, Jul 4, Nov 11 and
Dec 25 (not to the eves). On a Saturday the Friday before is also marked,
`observed: true`, name + " (observed)"; on a Sunday, the Monday after. The actual date
is always marked too. New Year's Day on a Saturday is observed on Dec 31 of the
**previous** year, so `publicHolidays(2027)` includes `2027-12-31` for 2028's New Year.

**Acceptance (M1):**

- 2026: Labor Day `2026-09-07`, Thanksgiving `2026-11-26`, Day after Thanksgiving
  `2026-11-27`, Memorial Day `2026-05-25`, Independence Day `2026-07-04` plus observed
  `2026-07-03`.
- 2027: Christmas observed `2027-12-24`; New Year observed `2027-12-31`.
- With the default days off, 2026 has no Columbus Day (`2026-10-12`) and no
  Veterans Day (`2026-11-11`).

### 7.4 Monthly options expiration 📈 (`src/shared/markets.ts`)

A per-member marker, off by default, switched on in Settings → Me ("📈 Show monthly
options expiration"; `member_prefs.show_options_expiration`, §4.2c).

- The date is the **3rd Friday** of each month; if that day is an exchange holiday
  (Good Friday, or Juneteenth — actual or observed), it is the **Thursday before**.
  Good Friday = Easter Sunday − 2 days (Gregorian computus).
- Rendering: 📈 next to the date number (the holiday-emoji slot, §7.2 — both show when
  a day has both). No cell tint. The day sheet lists "📈 Monthly options expiration".
  The legend shows "📈 Options expiration" while it is on.
- `/calendar` always returns `marketDays: { date, name, emoji }[]` for the range; the
  client shows them only when the member's switch is on (same pattern as holidays).
- **Acceptance:** 2026-10-16 (3rd Fri); 2026-06-18 (Thu — Fri 06-19 is Juneteenth);
  2025-04-17 (Thu — Fri 04-18 is Good Friday); 2026-04-17 (Good Friday 2026 is 04-03,
  unaffected). Easter: 2025-04-20, 2026-04-05, 2027-03-28.

### 7.5 Optional events — each person turns them on

**Optional calendar items** (Settings → Me) is the one list of everything a member can
switch on for their own calendar (decided by MojoSOGO 2026-10-03):
1. **Public holidays** — built in, on by default (`member_prefs.show_public_holidays`);
2. **📈 Monthly options expiration** — built in, off by default
   (`member_prefs.show_options_expiration`, §7.4);
3. then every **optional event** (below), each with its emoji and how it repeats.
The old separate checkboxes in Me are gone.

Some calendar items matter only to whoever wants them — street sweeping (move the car),
a recycling day, a club's meetings. An event can be marked **optional** (decided by
MojoSOGO 2026-10-03); then **each member decides for themselves** whether it is on.

- An optional event is **on** for a member when they have an `event_optins` row for it.
  Its creator is turned on automatically when they create it, and whoever **edits** an
  event into optional is turned on the same way. ⚑
- **Off** means absent for that member: not in their `/calendar` occurrences, not in their
  day sheet, no reminders to them, and its fires are hidden from their Ringing bar.
- **On** means it behaves like any event for them.
- **Reminders** of an optional event go only to the members who have it on (and, if the
  event is assigned, only those of them who are assigned). The **House** channel speaks only
  when that same audience is not empty — the house never announces something nobody it is
  for has turned on. Nobody in the audience → nothing is delivered. ⚑
- Turning it on or off takes effect at once (the next fetch, the next alert).
- Any member may turn any optional event on or off **for themselves**; only the creator or
  an admin may change whether an event is optional (like any edit, §6.3). Making an event
  not optional again shows it to everyone; the opt-in rows are kept but unused.
- Alarms and chores are never optional (they have their own assignment).
- Who has it on is **data**, read per request; the one rule — "an optional event exists for
  member M only if M has it on" — is applied where `/calendar`, the day sheet, `/fires` and
  tick's recipients are built (placement decides the owner, so it is written once).

**Acceptance (M4h — API tests):**

| # | Setup / call | Expected |
|---|---|---|
| O1 | A creates optional "Street sweeping", all-day, MONTHLY TH [1,3] from 2026-10-01 | A has it on; it is in A's `/calendar` for Oct: 10-01, 10-15 |
| O2 | member B's `/calendar` for Oct | no Street sweeping |
| O3 | B `PUT /events/{id}/optin` | B's `/calendar` now has 10-01 and 10-15 |
| O4 | reminder "evening before" (offset 780 from 09:00); tick 2026-10-14 20:00 local with A and B on | one fire; push to A and B |
| O5 | B `DELETE …/optin`; tick the next occurrence's evening | push to A only |
| O6 | nobody on (A also off); tick the evening | the fire steps, no deliveries; hidden from every Ringing bar |
| O7 | `GET /optional-events` as B | the event, `on: false` (after O5) |
| O8 | B (not creator, not admin) PATCH `optional: false` | 403 |
| O9 | a non-optional event | unchanged for everyone (regression) |

### 7.6 Event emoji

An event may carry **one emoji** (`events.emoji`, optional; decided by MojoSOGO): street
sweeping 🧹, taking out the trash 🗑️. It must be a single emoji (one grapheme of emoji
presentation, ≤ 16 bytes) — anything else is 400 with a message. Where it shows:
- beside the date number on each day the event occurs (§7.2 day icons) — on phones in place
  of its dot (§7.1);
- before the title in the day sheet, on wide-screen chips, and in Optional calendar items;
- in the Ringing bar and alert text it is **not** added (messages stay plain text).

**Acceptance:** E1 an event with emoji 🧹 round-trips through POST/GET; E2 `"ab"`, `"🧹🧹"`
or 17 bytes → 400; E3 `/calendar` occurrences carry `emoji`.

### 7.7 Sun-timed alerts — `src/shared/sun.ts` (pure)

Decided by MojoSOGO 2026-10-03: **the goat alert.** Every day, 30 minutes before local sunset,
an alert says **"Put the goats away — sunset at 6:42"**. Each person opts in; it is off by
default (Shelly and John will opt in). Phone + House. It is **not on the calendar**: it is only
findable in **Optional calendar items** (§7.5), where people turn it on.

**The model:** an ordinary **optional event** (§7.5) whose start is the sunset —
`events.start_sun = 'sunset'` (§4.2o). Everything optional events already do applies
unchanged: the opt-in switch, the audience (push to the opted-in members, House only when that
audience is not empty), Done / Snooze, renotify, `missed`. What is new:

- **Sunset** is computed locally from the household place (`settings.latitude` /
  `longitude`, §4.2o; ZIP 92056, Oceanside, 33.20 / −117.29) with the **NOAA general solar
  position algorithm**: fractional year γ, equation of time, declination, and the hour angle
  at zenith 90.833°; evaluated at the date's local solar noon, then refined once at the
  sunset that gives. Rounded to the nearest minute ⚑ Q53.
- **`sun.ts`** exports `interface Place { lat: number; lon: number }` and
  `sunsetUtc(date: string, place: Place): string | null` → the UTC ISO instant of sunset on that
  local date, or **null** when the sun does not set (polar day or night). Never a substitute
  time. Pure: no clock, no fetch; imports nothing but `time.ts`.
- **Planning** (§5.1): start = `sunsetUtc(date, place)`; no place or no sunset → that
  occurrence is skipped (never 09:00).
- **Text** (§5.7): `"{title} — sunset at {h:mm}"`; sunset not computable at alert time →
  `"{title} — before sunset"`.
- **Never on the calendar, by rule** ⚑ Q54: `/calendar` (and so the day sheet), and
  `GET/PATCH/DELETE /events/{id}` and `/events/{id}/exdates`, treat a `start_sun` event as absent
  (404 for the event routes). `/optional-events` and `PUT/DELETE /events/{id}/optin` list and
  switch it like any optional event. It is created, edited and deleted only by coordinator SQL
  ⚑ Q58; the label stays "Optional calendar items" ⚑ Q55.
- **Ringing bar** (§8.2): its row reads `🔔 Put the goats away · sunset` ⚑ Q56.
- **Repeats** ⚑ Q51: the goat row carries `renotify_min = 15`, `max_alerts = 3` — alerts at
  −30, −15 and at sunset, until someone taps Done.
- **Sunset only** ⚑ Q59: there is no sunrise.

**Acceptance (M4n — each row is a test):**

| # | Setup / call | Expected |
|---|---|---|
| S1 | `sunsetUtc` for Oceanside (33.20, −117.29) on 2026-03-07, 03-08, 06-21, 10-31, 11-01, 12-21 | each within ±1 min of the NOAA solar calculator spreadsheet's sunset (an independent implementation of the spreadsheet formulas in the test): 17:51 PST, 18:52 PDT, 20:02 PDT, 17:58 PDT, 16:57 PST, 16:46 PST |
| S2 | DST continuity: 03-07 → 03-08 and 10-31 → 11-01 | the UTC instants are 24 h ± 2 min apart; the local clock jumps by about +1 h / −1 h |
| S3 | `sunsetUtc('2026-12-21', { lat: 78, lon: 15 })` | `null` (polar night) — no substitute time |
| G1 | the goat event (DAILY, offset 30) planned for a day | one fire per day, `due_at` = sunset − 30 min; planning twice gives the same fires (idempotent) |
| G2 | the same event planned with `place = null` | `[]` — nothing at 09:00 |
| G3 | `/calendar` for the month, as a member who has it on | no goat occurrences |
| G4 | `GET /optional-events` | lists the goat item, `on: false` for a member who has not opted in |
| G5 | one member opted in; tick at sunset − 30 | that member gets one push and the house one row, both with the text `"Put the goats away — sunset at h:mm"` (that day's sunset) |
| G6 | nobody opted in; tick | the fire steps, no deliveries |
| G7 | `GET /fires` carries `startSun: 'sunset'` for its fire; `GET /events/{id}` → 404 | |

---

## 7A. Lists

Lists are **household data**: any number, each with a name. The household starts with two,
**Shopping** and **Wish list** (seeded by migration 0007 with fixed ids `lst_shopping` and
`lst_wishlist`); they are ordinary lists from then on. **Every list behaves the same way**
(decided by MojoSOGO, Q24).

### 7A.1 Rules — `src/shared/lists.ts` (pure)

Every decision below lives in `lists.ts` and is imported by the route and the PWA:
`itemKey`, `TEXT_MAX`, `NOTE_MAX`, `LIST_NAME_MAX`, `LISTS_MAX`, `CHECKED_VISIBLE_DAYS`,
`resolveAdd(text, items)` → existing / reopen / insert, the list-name checks,
`canManageList(createdBy, member)` (who may rename/delete — the route and the PWA's ⋯ use
the same function), and `SHOPPING_LIST_ID` (the one place the seeded id is named outside the
migration; the PWA's fallback uses it and the migration test asserts it). Matching
is done in JS with `itemKey` — never with SQLite `lower()`/`NOCASE`, which fold ASCII only.
`text_key` and `name_key` are written by app code.

**Lists:**
- **Name** is trimmed, 1–`LIST_NAME_MAX` (40) characters. One list per name:
  `itemKey(name)` must be unique among non-deleted lists → otherwise 409 `duplicate`,
  "There is already a list called “Shopping”."
- At most `LISTS_MAX` (30) lists — a 31st is refused with a message.
- **Emoji** (asked by MojoSOGO 2026-10-05): a list may have its own emoji — one emoji by the event rule
  (`emojiError`, §7.6) — or none (`null`). None shows `defaultListEmoji(name)`: the first keyword found in the
  name, else 📋 ⚑ Q157 (shopping / grocer / store / market → 🛒, wish / gift / birthday / christmas → 🎁,
  hardware / tool / fix / repair → 🔨, garden / plant → 🌱, pharmacy / medicine → 💊, pack / trip / travel /
  camp → 🧳, book → 📚, pet / dog / cat → 🐾, school / kid → 🎒, meal / food / cook → 🍽️, clean → 🧽,
  house / home → 🏠). `listEmoji(list)` is the one function both the PWA and tests use. The same rules for who
  may rename a list decide who may change its emoji.
- **Any member may create a list.** **Rename or delete:** its creator or an admin; the two
  seeded lists (no creator): admins only. ⚑ DEFAULT
- **Delete** is a soft delete. Its items go with it: they are no longer reachable
  (`GET` → 404, item calls → 404). The name becomes free again. Every one of its items'
  photos (§7A.3) is deleted from R2 and its key cleared.

**Items** (on any list):
- **Text** is trimmed, 1–120 characters. **Note** ≤ 1000 characters.
- **One item per thing.** `itemKey(text)` = lower-case, trimmed, inner whitespace
  collapsed to one space. A list holds at most one non-deleted item per key (the
  unique index enforces it). Adding text whose key is already on the list never
  makes a duplicate:
  - matches an **open** item → that item is returned unchanged, `result: "existing"`;
  - matches a **checked** item → it is re-opened (`checked_at`/`checked_by` cleared,
    text updated to the new spelling), `result: "reopened"`;
  - otherwise a new open item, `result: "added"`.
- **Check / uncheck.** Checking sets `checked_at = now`, `checked_by = me`. Unchecking
  clears both — that is how "buy it again" works.
- **Rename** to a key another item on the same list already holds → 409 `duplicate`,
  message "“Milk” is already on this list."
- **Assignee:** at most **one** member (decided by MojoSOGO, Q23), who must exist and not be
  disabled; `null` = the household. Any list.
- **Visible checked items** = checked within the last `CHECKED_VISIBLE_DAYS = 30`
  days, newest first. Older checked items stay in the table (so adding them again
  re-opens rather than duplicates) but are not returned.
- **Delete** is a soft delete. Adding the same text later creates a new item. Its photo
  (§7A.3) is deleted from R2 and its key cleared in the same UPDATE.
- Any member may add, edit, check, assign or delete any item. ⚑ DEFAULT
- Lists never ring, push or speak. They are things to look at, not alerts — being
  assigned an item notifies nobody.

### 7A.2 Acceptance (M4b + M4e — each row is an API test)

| # | Call | Expected |
|---|------|----------|
| L1 | add "Milk" to Shopping | 201, `result: "added"`, item open |
| L2 | add "  milk " | 200, `result: "existing"`, same id; still one open item |
| L3 | check it | it moves from `open` to `checked`, `checkedBy` = me |
| L4 | add "MILK" | 200, `result: "reopened"`, same id, open, text "MILK" |
| L5 | check, then PATCH `checked: false` | open again |
| L6 | add "" or 121 characters | 400 `invalid_input` with a message |
| L7 | GET `/lists/{an id that does not exist}` | 404 `not_found` with a message |
| L8 | an item with an unknown or disabled `assigneeId` | 400 `invalid_input` |
| L9 | an item checked 31 days ago | absent from `checked`; adding its text re-opens it |
| L10 | delete, then add the same text | 201, a new id |
| L11 | rename "Eggs" to "milk" while Milk exists | 409 `duplicate` |
| L12 | any list call without a session | 401 |
| L13 | POST `/lists { name: "Hardware store" }` | 201; it appears in `GET /lists` with `openCount` 0 |
| L14 | POST `/lists { name: " hardware  STORE " }` | 409 `duplicate` |
| L15 | rename it as a member who did not create it / as its creator / as an admin | 403 / 200 / 200 |
| L16 | delete it | gone from `GET /lists`; `GET /lists/{id}` 404; PATCH of one of its items 404; the name can be used again |
| L17 | assign an item to member M, then to `null` | `assigneeId` M, then null |
| L18 | a member renames or deletes the seeded Shopping list | 403; an admin may |
| L19 | name "" / 41 characters / a 31st list | 400 `invalid_input` with a message |
| L21 | POST `/lists { name: "Costco", emoji: "🛍️" }` | 201 with `emoji` "🛍️"; `GET /lists` carries it; a list made without one has `emoji` null |
| L22 | PATCH `/lists/{id} { name, emoji: "ab" }` / `{ name, emoji: null }` | 400 `invalid_input` "Emoji must be a single emoji, like 🧹." / 200, `emoji` null (back to the default) |
| L20 | migration check (§4.2f) | items on the old `shopping`/`wishlist` lists, and wish-list owners, are on `lst_shopping`/`lst_wishlist` with the same assignee |

### 7A.3 Snap an item — a photo kept with a list item

Decided by MojoSOGO 2026-10-04. He photographs an item he needs to replace; the server names it; the
name goes into the add box with a hint to check it; he taps **Add** as usual. **Nothing is added
automatically.** The photo is **kept** with the list item, so he can look at it when he replaces the
item. On cost, his words: "use SogoAI as necessary to avoid paying fees but pay the claude api if that is
the only option" — SogoAI's local vision model first (free), the Claude API only when SogoAI gives no name.

**The rules** — `src/shared/item-reading.ts` (pure; imports lists, things (photo limits) and vocab only):

- `ITEM_NAME_ASK` = 60 — the length the prompt asks for ⚑ Q116; the name kept is cut at `TEXT_MAX` (120).
- `IDENTIFY_PROMPT` — the same text to SogoAI and to Claude: "This is a photo of a household item someone
  needs to buy again. Reply with ONLY a short shopping-list name for it (brand + product + size if visible),
  max 60 characters. If you cannot tell what it is, reply exactly: UNKNOWN." The helper appends
  " /no_think" (it turns the local model's thinking off).
- `IDENTIFY_UNKNOWN` = "UNKNOWN".
- `cleanItemName(raw)` → the name, or null: drops any `<think>…</think>` block, takes the first non-empty
  line, collapses whitespace, strips wrapping quotes / backticks and a trailing full stop; null when what is
  left is empty, only quotes, or `UNKNOWN` (any case); else cut to `TEXT_MAX` (never inside a surrogate
  pair). A model's answer is input, never trusted as-is.
- `IDENTIFY_BODY_MAX` = `PHOTO_MAX_BYTES` (4 MB) — the helper's body cap.
- `IdentifyReport` = `{ ok: true, text }` | `{ ok: false, kind, reason }`, `kind` one of `IDENTIFY_FAILURE`
  (`off` | `failed`), and `parseIdentifyReport(body)` → the report or a message: `text` a string, cut to
  `IDENTIFY_TEXT_MAX` (2000); `reason` non-empty, cut to `IDENTIFY_REASON_MAX` (300).
- `ItemReading` = `{ name, via }`, `via` one of `ITEM_READ_VIA` (`sogoai` | `claude`) — the read's answer.

**Reading — `POST /list-items/read-photo`** with the (already shrunk) image → `{ name, via }`. **Nothing is
stored** — no row, no R2 object. The check order:

1. signed in → else 401;
2. the body (`photoBody`, as §7C.3: type, size, empty) → else 400;
3. `homeCaptionsConfigOf(env)` set → `identifyFromHome` (20 s ⚑ Q114), then `cleanItemName` on its text:
   a name → **200 `{ name, via: "sogoai" }`**, and no read is counted ⚑ Q113;
4. otherwise — SogoAI not configured, failed, or gave no name (UNKNOWN) ⚑ Q112 — the Claude API, as
   §7C.4: the daily cap (the household's 40-a-day `photo_reads` budget, shared with Things) → 429
   `rate_limited`; no `ANTHROPIC_API_KEY` → 503 `photo_reading_off` "Reading photos isn't set up yet.";
   count the read; `readItemPhoto` (photo-reader.ts: `IDENTIFY_PROMPT`, schema `{ name }`) → a refusal: 422
   `photo_refused` "Couldn't read that photo."; a failure: 502 `photo_reading_failed` "Couldn't read that
   photo: {reason} (SogoAI: {why it gave no name})"; `cleanItemName` null: 422 `item_unknown` "Couldn't tell
   what that is — type it in."; a name: **200 `{ name, via: "claude" }`**.

Why SogoAI gave no name, in that 502: "it isn't set up", its failure reason, or "it couldn't tell what it is".

**The call** — `identifyFromHome(cfg, photo, type, { fetch? })` in `src/worker/home-captions.ts`: one
`POST {url}/identify`, the image bytes as the body with `Content-Type` the photo's type and
`Authorization: Bearer {CAPTIONS_TOKEN}`, through `access.ts` (both Access headers, `redirect: 'manual'`,
2xx only) with `AbortSignal.timeout(HOME_IDENTIFY_TIMEOUT_MS)` = 20 s; a 2xx body goes through
`parseIdentifyReport`. It answers `{ ok: true, text }` or `{ ok: false, reason }` — the honest reasons of
§7E.2c ("HTTP n: …", "error: …", the parse message) or the home's own. It never throws, never names a
secret, and never decides; the route runs `cleanItemName`.

**The helper** — `POST /identify` on the same `home/captions-helper.ts` server (§7E.2c), the same tunnel,
Access application and bearer. Its check order: a path other than `/captions` or `/identify` → 404; a
method other than POST → **405**; the bearer (constant time) → **401**; `Content-Type` not `image/*` →
**400**; a body over `IDENTIFY_BODY_MAX` → **413** (the body is read in `main()`, which keeps no bytes past
the cap); an empty body → 400; then `identify` (`home/identify.ts`) → **200** with the `IdentifyReport` as
JSON, whatever its `ok`. `home/identify.ts`: one POST to LM Studio at
`http://127.0.0.1:1234/v1/chat/completions` — `model` = `IDENTIFY_MODEL` (the helper's env), one user
message with a text part `IDENTIFY_PROMPT + " /no_think"` and an `image_url` part holding the image as a
`data:` URL, `temperature` 0, `max_tokens` 100, `stream` false — with a 15 s timeout ⚑ Q114. It answers
`{ ok: true, text: choices[0].message.content }`, else `{ ok: false, kind: "failed", reason }` ("LM Studio
HTTP n: {body ≤ 200}", "LM Studio error: {message}", "LM Studio answered in an unexpected shape.").
`IDENTIFY_MODEL` unset or empty → `{ ok: false, kind: "off", reason: "IDENTIFY_MODEL isn't set on SogoAI." }`,
nothing called ⚑ Q115; captions keep working and the helper still starts. It never throws and never decides.
One log line per request (the outcome, never the token, never the image).

**The photo — R2, private, like §7C.3:**

- `list_items.photo_key` (§4.2v) holds the R2 key `list-items/{itemId}/{random}.jpg`. The key is never on
  the wire: an `Item` carries `hasPhoto` and `updatedAt` instead.
- `PUT /list-items/{id}/photo` — the raw image (`photoBody`, the same limits) → 204. Replacing deletes the old
  object. It bumps `updated_at` (the item comes to the top of the open list, as any change does).
- `GET /list-items/{id}/photo` → the image, `Cache-Control: private, max-age=3600`. No photo, or the item is
  gone → 404 "This item has no photo."
- `DELETE /list-items/{id}/photo` → 204; the object removed and the key cleared.
- PUT or DELETE on an item that is gone (deleted, or its list deleted) → 404 "That item is no longer on the list."
- Deleting an item deletes its photo; deleting a list deletes all its items' photos (§7A.1).
- **Bought items keep their photo** ⚑ Q123 — a checked item too, however old — so adding it again (which
  re-opens it, §7A.1) brings its photo back. Re-opening never touches the photo.
- `POST /lists/{id}/items` and `PATCH /list-items/{id}` take the same bodies as before: a photo is attached
  only by its own PUT.

**Privacy:** the photo goes to SogoAI at home first; only when SogoAI gives no name is it sent to Anthropic
(Q30's choice, as for Things). Stored photos stay in the household's own R2.

**PWA:** §8.8.

**Acceptance (M4u — each row is a test; fakes only, never a real network):**

| # | Setup / call | Expected |
|---|---|---|
| SN1 | read-photo, SogoAI names it | 200 `{ name, via: "sogoai" }`; one POST to `{url}/identify` with both Access headers, the bearer and the image as its body; no `photo_reads` row; nothing in R2 |
| SN2 | read-photo, SogoAI answers UNKNOWN / fails / isn't configured, and Claude names it | 200 `{ name, via: "claude" }`; one `photo_reads` row each |
| SN3 | read-photo at the daily cap, SogoAI gives no name | 429 `rate_limited`; Claude not asked |
| SN4 | read-photo with no `ANTHROPIC_API_KEY`, SogoAI gives no name | 503 `photo_reading_off`; no read counted |
| SN5 | Claude answers UNKNOWN | 422 `item_unknown` "Couldn't tell what that is — type it in."; one read counted |
| SN6 | Claude fails | 502 `photo_reading_failed`, naming Claude's reason and SogoAI's |
| SN7 | read-photo without a session; with a bad type | 401; 400 |
| SN8 | PUT a photo, GET it, PUT another | the bytes round-trip; `private, max-age=3600`; the old object gone from R2; `hasPhoto` true in `GET /lists/{id}`; the key in no answer |
| SN9 | GET with no photo; GET / PUT on a deleted item; DELETE the photo | 404 "This item has no photo."; 404; 204, the object gone, `hasPhoto` false |
| SN10 | delete an item with a photo; delete a list whose items have photos | their R2 objects are gone |
| SN11 | tick an item with a photo, then add its text again | `reopened`; the photo still there |
| SN12 | `cleanItemName`, `parseIdentifyReport` | as the rules above |
| SN13 | the helper's `/identify`: no / a wrong bearer; GET; a type that isn't an image; a body over the cap; a good request | 401; 405; 400; 413; 200 with the report |
| SN14 | `identify` over a fake LM Studio: a good answer; a timeout; a non-2xx; `IDENTIFY_MODEL` unset | one POST with the model, the prompt + " /no_think", the image as a data URL, temperature 0 → `ok`; `failed` "LM Studio error: …"; `failed` "LM Studio HTTP …"; `off`, nothing called |
| SN15 | every report `identify` produces (found by **calling** it over fake LM Studio answers) through `handle()` and the wire into `identifyFromHome` | each accepted: the text for `ok`, the reason for a failure |
| SN-M | migration check (§4.2v) | rows written before 0023 survive with `photo_key` NULL; `foreign_key_check` empty |

---

## 7B. Chores — `src/shared/chores.ts` (pure)

A chore is a job on chosen days of the week, done by people **taking turns**. It may be
a **loop of steps** that hand off — the household's real shape (laundry: start the
washer → move to dryer → fold and put away). Chores are not calendar events and are
never drawn on the calendar. Each day a chore is due it gets one **run**.

### 7B.1 Turns (rotation)

- `people` is the turn order (1–8 members). With one person it is simply theirs.
- **Whose turn** on a date = `people[w mod n]`, where `w` = whole weeks (Sunday-start)
  from the week containing `start_date` to the week containing the date. So the turn
  changes every Sunday, and every day in a week belongs to the same person.
- Disabled members are skipped: the turn passes to the next active person in order.
  If nobody is active, the run has no assignee and shows as "anyone".
- `assigneeFor(chore, date, activeIds)` is the one function that decides this.

### 7B.2 Steps (the loop)

```ts
interface ChoreStep {
  title: string;            // 1–60 chars, e.g. "Move to dryer"
  waitMin: number | null;   // after THIS step is done, the next step rings in N min (1–720)
  memberId: string | null;  // this step's person; null = whoever's turn it is
}
```

- A chore has 1–6 steps. A one-step chore is an ordinary chore; its step title is
  normally the chore title.
- A run's **current step** is `steps[run.step]`; its **person** is the step's
  `memberId` or else the run's assignee.
- The last step's `waitMin` is ignored (nothing follows it).

### 7B.3 Run rules — one open fire per run at most (`uq_chore_run_open`)

**Planning** (`planChoreRuns(chore, tz, now, toUtc, activeIds)`, called by `tick`): one run
per due date from today (household tz) to the local date of `toUtc` (36 h ahead), never
before `start_date`. A run is planned once (`INSERT OR IGNORE` on `(chore_id, date)`);
its first fire is planned only when the run row is newly inserted:

| Timing | First fire |
|---|---|
| `at` | due at `date + time` — rings like an alarm (`renotify_min`, `max_alerts`) |
| `by`, nudge on | due at `date + time` — one alert (renotify ignored), then stays in the Ringing bar |
| `by`, nudge off | none — the run is only on the Today list |

A first fire whose due time is already past when planned is **not** created (a chore
added at 20:00 for 08:00 today appears on Today without ringing).

**Done a step** (`advanceRun(chore, run, openFire, memberId, now, tz)` → `{ run, closeFire?, newFire? }`):
1. The run's open fire, if any, closes `done` (`closed_by` = the member).
2. `step + 1`. If that was the last step: `done_at = now`, `done_by` = member. Stop.
3. Else, if the step just done has `waitMin` → new fire due `now + waitMin` (it rings
   for the next step's person, with the chore's renotify).
4. Else, if timing is `by`, nudge is on, and `date + time` is still ahead → new fire
   at that deadline (the nudge is kept).
5. Else no fire: the next step is simply current on the Today list.

**Undo** (`undoRun(chore, run, openFire, now, tz)`): only when `step > 0`. `step − 1`, `done_at`/
`done_by` cleared, the open fire (if any) closes `removed`, and a fire is re-planned
by rule 4 alone (a `by` nudge still ahead). Waits are not re-armed.

**Runs from earlier days** that were never finished simply drop off the Today list —
no overdue pile, no red (§1.0 "no shaming"). Their open fire, if any, stays in the
Ringing bar until someone acts, like any fire.

**Editing a chore** re-plans its **unstarted** runs (`step = 0`, date ≥ today) **in
place**, in the same request and one batch: the assignee is recomputed, the open fire
(if any) closes `removed`, and a new first fire is inserted by the planning rule (only
if still ahead). Runs are never deleted — fires reference them. Started or finished
runs are left alone. **Deleting a chore** is a soft delete; **every** open fire of its
runs closes `removed` (a pending step wait must not ring for a chore that no longer
exists) and the runs stay (history).

**Also settled while building (M4c):**
- Creating or editing a chore plans its runs and first fires **in the same request**
  (same rule as tick), so a new chore is on Today at once.
- A run's first fire is inserted in the same batch as the run, only for a run inserted
  just then.
- Editing a chore's days: an unstarted run on a day no longer chosen gets no fire and
  is hidden from Today.
- `by` chores ring once on **every** fire, including a step wait's; `at` chores use
  their repeat-alert setting. Repeat alert is 1–240 min (the timers' range).
- A step person who is disabled counts as nobody: everyone active is alerted and the
  message is `Chore: {title}`.
- Editing a chore whose `people` include a since-disabled member is rejected with a
  message until the people are fixed (§7B.4 "active members").
- Two simultaneous Done taps on one run: the second fails visibly (one open fire per
  run) rather than double-advancing.

### 7B.4 Limits and validation

Title 1–60, `done_means` ≤ 200, `days` ≥ 1, `people` 1–8 active members, steps 1–6,
step title 1–60, `waitMin` 1–720 or null, step `memberId` an active member or null,
`time` `HH:MM`, at least one channel when timing is `at` or nudge is on. Every
rejection is 400 `invalid_input` with a message naming the field.

### 7B.5 Acceptance (M4c — each row is a test)

| # | Setup / call | Expected |
|---|---|---|
| C1 | `assigneeFor` with people [A, B], start Sun 2026-10-04: dates 10-05, 10-10, 10-12, 10-19 | A, A, B, A |
| C2 | C1 with B disabled | A every week |
| C3 | Laundry, `at` 07:30 Mon, people [A], steps [Start washer (wait 60), Move to dryer (wait 50), Fold & put away]; tick Mon 07:30 local | fire ringing; push delivery to A only; house message `Chore for A: Laundry — Start washer` |
| C4 | `done` on that fire at 07:40 | run step 1; new fire due 08:40; tick at 08:40 → ringing, message `… — Move to dryer` |
| C5 | done at 08:45, then done again (step 2 → finished) | after the 2nd done: run `done_at` set, no open fire |
| C6 | `by` 19:00 with nudge; done at 17:00 | the scheduled 19:00 fire closes `done`; tick at 19:00 sends nothing |
| C7 | `by` 19:00, nudge off | no fire ever; the run is in `/chores/today` |
| C8 | after C4's done, undo | step 0; the 08:40 fire closed `removed` |
| C9 | create a chore at 20:00 for 08:00 today | today's run exists, no fire for it |
| C10 | edit the chore's people from [A] to [B] | today's unstarted run has assignee B straight away; its old fire closed `removed`, a new one planned if still ahead |
| C11 | no days / no people / 7 steps / `waitMin` 0 | 400 `invalid_input`, message names the field |
| C12 | `/calendar` and `/alarms` | no chore appears in either |
| C13 | migration check (§4.2e) | old fires and deliveries intact after 0006 |
| C14 | delete a chore while a step wait is pending | that fire closes `removed`; nothing rings |

### 7B.6 What done looks like — areas, pictures, expectations — `src/shared/chore-areas.ts` (pure)

Asked by MojoSOGO 2026-10-05: "Chores needs its own section and an area for what done looks like with specific
areas, pictures and a list of expectations." The one-line **Done means…** (§7B.4) stays as the summary; under it a
chore can hold up to 8 **areas** — "Sink", "Counters", "Floor" — each with a list of **expectations** ("No dishes
left in the sink", "Faucet wiped dry") and up to 4 **reference photos** of that area done right. Areas belong to the
chore, not to a day's run: they say what done looks like every time. Nothing here changes turns, runs or fires.

**The rules** (pure; imports nothing):

- `AREAS_MAX` = 8 per chore, `AREA_NAME_MAX` = 40, `EXPECTATIONS_MAX` = 12 per area, `EXPECTATION_MAX` = 120,
  `AREA_PHOTOS_MAX` = 4 per area ⚑ Q164.
- `parseAreaInput(body, current?)` → `{ name, expectations }` or a message naming the field. `name` is trimmed,
  1–`AREA_NAME_MAX`. `expectations` is a list of strings: each trimmed, empty ones dropped, each at most
  `EXPECTATION_MAX`, at most `EXPECTATIONS_MAX` left; absent = `[]` on create, unchanged on edit (`current`).
- `ChoreArea` — the wire type: `{ id, choreId, name, expectations: string[], photos: string[], updatedAt }`;
  `photos` are photo ids, oldest first. A photo key is never on the wire.

**Who:** anyone in the household may add, change or delete an area and its photos ⚑ Q163 — unlike the chore
itself (creator or an admin), because whoever does the chore often knows best what done looks like.

**The routes** — `src/worker/routes/chore-areas.ts`:

- `GET /chores/{id}/areas` → `ChoreArea[]` by `position`. The chore deleted or unknown → 404 "That chore no longer exists."
- `POST /chores/{id}/areas` `{ name, expectations? }` → 201 area, `position` = after the last. At `AREAS_MAX`
  → 400 `invalid_input` "A chore has at most 8 areas."
- `PATCH /chore-areas/{id}` `{ name?, expectations? }` → the area. `DELETE /chore-areas/{id}` → 204, its photos'
  rows and R2 objects gone.
- `POST /chore-areas/{id}/photos` the raw image (`photoBody`, §7C.3's limits) → 201 the area. R2 key
  `chore-areas/{areaId}/{random}.jpg`, private. At `AREA_PHOTOS_MAX` → 400 `invalid_input` "An area has at most 4 photos."
- `GET /chore-area-photos/{id}` → the image, `Cache-Control: private, max-age=3600` (a photo id is never reused,
  so it is never stale). `DELETE /chore-area-photos/{id}` → 204, the row and the object gone.
- An area or photo that is gone, or whose chore is deleted → 404 "That area no longer exists." / "That photo no
  longer exists."
- **Deleting a chore** (soft, §7B.3) deletes its areas and their photos outright, rows and R2 objects, in the same
  request.
- `GET /chores` and `GET /chores/today` carry `areaCount` on each chore / run, so the app knows when there is
  something to show (§8.15).

**Acceptance (M4y — each row is a test; fakes only):**

| # | Setup / call | Expected |
|---|---|---|
| CA1 | POST an area `{ name: " Sink ", expectations: ["No dishes", " ", "Faucet dry"] }`; GET the chore's areas | 201 `{ name: "Sink", expectations: ["No dishes", "Faucet dry"], photos: [] }`; GET lists it; `areaCount` 1 on `/chores` and on today's run |
| CA2 | a second area, then PATCH the first `{ name: "Kitchen sink" }` | areas in the order added; the PATCH keeps the expectations |
| CA3 | name empty / 41 chars; 13 expectations; an expectation of 121 chars; a 9th area | 400 `invalid_input`, the message names the field |
| CA4 | POST a photo, GET it, POST up to 4, then a 5th | the bytes round-trip with `private, max-age=3600`; the area lists 4 ids oldest first; the 5th is 400; no key in any answer |
| CA5 | DELETE a photo; DELETE an area with photos | 204 and the object gone; 204, the area and every object of it gone |
| CA6 | delete the chore | its areas' rows and objects gone; GET its areas → 404 |
| CA7 | a member who is not the chore's creator adds, edits and deletes an area | allowed (⚑ Q163) |
| CA8 | no session; a bad photo type | 401; 400 |
| CA-M | migration check (§4.2zb) | rows written before 0029 survive; `foreign_key_check` empty |

### 7B.7 Whose mess? — mess reports and who owes whom — `src/shared/messes.ts` (pure)

Asked by MojoSOGO 2026-10-05 (reviewed first as an AREC): "someone walks into a mess in the kitchen or house … post a
picture of the mess I had to clean before I could continue … the perpetrator should identify themself … an economy
where the perpetrator owes the person … let other people say 'it wasn't me'." And: "this isn't about shame, but
rather teaching and enforcing accountability; if nobody claims it, we need a house discussion; mom and dad will deal
with sibling warfare … the app is a vehicle to help things along because everyone isn't physically present at the
same time." It is part of chores (a chore someone didn't do), so it lives in the 🧹 Chores tab, not a tab of its own.

**The flow.**

1. Whoever cleaned up the mess (the **reporter**) takes a photo of it in Chores → **📸 Report a mess**, optionally
   names the chore it belongs to and adds a note ("pans left on the stove").
2. Every other active member is **asked** "Was it yours?": a push at once and then every `NUDGE_EVERY_MIN` (15)
   minutes, at most `NUDGES_MAX` (4) pushes in all ⚑ decided by MojoSOGO, until they answer or the mess is settled
   one way or another. While the app is open, a **banner** asks the same question (§8.15a) until they answer.
3. Each answers **That was me** (they **claim** it) or **Not me** (a **denial**). The reporter is never asked and
   can do neither.
4. A claim ends the asking: the claimer now **owes** the reporter **1 point** (always 1, ⚑ Q180).
5. When every member asked has said Not me, or `DISCUSS_AFTER_H` (24) hours after the report with nobody claiming
   it ⚑ Q177, it moves to **To talk about**: the house talks it through in person. The asking stops (the banner
   stays for anyone who hasn't answered), and every active admin gets one push saying so ⚑ Q183. Claiming is still
   open while it waits there.
6. After the talk an **admin** records the outcome ⚑ Q179: whose it was (they then owe the reporter 1 point,
   exactly as a claim) or **nobody's** (closed, no point). The app **never** decides by elimination or by whose turn
   the chore was.
7. A point is paid back in person. The one owed — or an admin — marks it **Paid back** or **Let it go** ⚑ Q181.

**State** — `messStatus(m)`, derived from the row, never stored (`MESS_STATUS`, §3), first match wins:
`settled` (settled_at set) · `closed` (closed_at set: nobody's) · `owed` (claimed_by set) · `discuss` (discuss_at
set) · `open`. A deleted mess (deleted_at set) is gone from every answer.

**The rules** (pure; imports only vocab and time):

- `NUDGES_MAX` = 4, `NUDGE_EVERY_MIN` = 15, `DISCUSS_AFTER_H` = 24, `MESS_NOTE_MAX` = 120,
  `MESS_PHOTO_KEEP_DAYS` = 30 ⚑ Q185.
- `parseMessInput({ note, choreId })` → `{ note, choreId }` or a message naming the field: `note` trimmed, empty →
  null, at most `MESS_NOTE_MAX`; `choreId` absent/empty → null, else a string (the route checks the chore exists).
- `askedOf(m, activeIds, deniedIds)` → who still has to answer: when `open` or `discuss`, the active members other
  than the reporter who have not said Not me; otherwise nobody.
- `nudgeDue(createdAt, sent, now)` → true when `sent < NUDGES_MAX` and `now ≥ createdAt + sent × NUDGE_EVERY_MIN`.
  `sent` is how many asks that member already has for that mess — counted from `deliveries.mess_id`, never stored.
- `discussDue(createdAt, asked, now)` → true when nobody is left to ask, or `now ≥ createdAt + DISCUSS_AFTER_H`.
- `balancesOf(owed, viewerId, isAdmin)` → `Balance[]` (`{ from, to, points }`, `from` owes `to`): the owed messes
  (`claimed_by` owes `reported_by`) netted per pair of people, pairs at 0 left out. A member sees only the pairs
  they are in; an admin sees every pair ⚑ Q178. Sorted by points, most first, then by `from`, `to`.
- `askMessage(reporter, choreTitle, note)` → `"{reporter} cleaned up a mess ({chore}): {note}. Was it yours? Open
  Ensō to answer."` — the chore part and the note part only when set. `discussMessage(...)` → `"Nobody has claimed
  the mess {reporter} cleaned up ({chore}): {note}. It's on To talk about."`. Titles: `MESS_ASK_TITLE` "🧽 Whose
  mess?", `MESS_DISCUSS_TITLE` "🗣 To talk about".
- `Mess` — the wire type: `{ id, reportedBy, choreId, choreTitle, note, hasPhoto, createdAt, status, claimedBy,
  assignedBy, deniedBy: string[], asked: string[] }`. `assignedBy` is the admin who recorded it (null when claimed
  by the person themselves). The photo key is never on the wire.

**Who may do what.**

| Action | Who | When |
|---|---|---|
| Report | any member | — |
| That was me / Not me | any active member but the reporter | `open` or `discuss` |
| Record the outcome (whose / nobody's) | admins | `open`, `discuss`, or `owed` (a correction ⚑ Q182) |
| Paid back / Let it go | the one owed, or an admin | `owed` |
| Delete | the reporter while `open` or `discuss`; an admin any time | — |

**Delivery.** The asks and the admin notice are **fire-less push deliveries** (§9.1) with their own `title` and
`deliveries.mess_id` set; `alert_number` is the ask's number (1–4). **Never `house`**: a mess is never spoken in the
house ⚑ Q183. Tapping one opens the app, where the banner is. The `/ops/notify` hourly limit does not count them
(§9.4).

**The routes** — `src/worker/routes/messes.ts`; the asking and the To talk about move, shared by the routes and
`tick`, are `src/worker/mess-asks.ts`:

- `POST /messes?choreId=&note=` — the raw photo is the body (`photoBody`, §7C.3's limits); the fields ride in the
  query because the body is the image. A photo is required. A chore that doesn't exist → 404 "That chore no longer
  exists." → 201 `Mess`. R2 key `messes/{id}/{random}.jpg`, private. The first ask goes to everyone asked in the
  same request.
- `GET /messes` → `{ messes: Mess[], balances: Balance[] }`: every `open` and `discuss` mess (everyone sees these:
  the house talks about them), and the `owed` ones the viewer may see (the pair, or any admin), newest first;
  `balances` = `balancesOf` over the owed messes.
- `GET /messes/{id}/photo` → the image, `Cache-Control: private, max-age=3600`; 404 when it is gone or deleted.
- `POST /messes/{id}/claim` → `Mess`. `POST /messes/{id}/deny` → `Mess` (a second Not me is a no-op); when it
  leaves nobody to ask, the mess moves to To talk about in the same request.
- `POST /messes/{id}/decide { memberId: string | null }` (admin) → `Mess`: a member → `claimed_by` = them,
  `assigned_by` = the admin; `null` → closed as nobody's. The member must be active and not the reporter.
- `POST /messes/{id}/settle { how: 'paid' | 'forgiven' }` → `Mess`.
- `DELETE /messes/{id}` → 204 (soft: `deleted_at`).
- Refusals: not allowed → 403 `forbidden` "Only …"; the wrong state → 409 `mess_settled` "That mess is already
  settled." (or "… isn't owed."); unknown or deleted → 404 "That mess no longer exists."
- **The photo** is deleted from R2 (and `photo_key` set NULL) when the mess is settled, closed or deleted, and by
  `tick` once it is `MESS_PHOTO_KEEP_DAYS` old, whatever its state ⚑ Q185.

**Tick** (§5.6, after stepping fires): for each `open` mess — when `discussDue`, it moves to To talk about (the
`discuss_at` write is conditional, so the admin push goes once); otherwise each member asked whose `nudgeDue` gets
the next ask. Then expired photos are deleted.

**Acceptance (M4z — each row is a test; fakes only):**

| # | Setup / call | Expected |
|---|---|---|
| MS1 | A reports a mess with a photo, note " pans " and a chore; B, C active | 201 `{ status: open, note: "pans", choreTitle, hasPhoto: true, asked: [B, C] }`; one push delivery each to B and C, `title` "🧽 Whose mess?", `mess_id` set, `alert_number` 1; none to A; no house row |
| MS2 | ticks at +14, +15, +30, +45, +60 min | B and C get ask 2 at +15, 3 at +30, 4 at +45, nothing more |
| MS3 | B says Not me, then ticks | B gets no more asks; C still does |
| MS4 | C says That was me | `owed`, `claimedBy` C, `asked` []; asks stop; A's balances `[{ from: C, to: A, points: 1 }]` |
| MS5 | A claims or denies their own report; a member claims an `owed` mess | 400 / 409 |
| MS6 | B and C both say Not me | `discuss` at once; one push to each active admin, `title` "🗣 To talk about"; no more asks |
| MS7 | nobody answers; tick at +24 h | `discuss`; the admin push once, not again on the next tick |
| MS8 | an admin decides C on a `discuss` mess; another decides null | `owed` with `assignedBy` the admin; `closed`, the photo gone from R2; a non-admin → 403; the reporter → 400 |
| MS9 | balances: C owes A twice, A owes C once; the viewer B (not admin) / an admin | B sees neither pair; A and C see `C → A 1`; the admin sees it too |
| MS10 | A settles `paid`; B (not owed, not admin) tries | `settled`, the photo gone, the balance gone; 403 |
| MS11 | the reporter deletes an open mess; deletes an owed one; an admin deletes an owed one | 204; 403; 204 — gone from `/messes`, photo gone |
| MS12 | a mess 30 days old, still owed; tick | its photo deleted, `hasPhoto` false, still owed |
| MS13 | no photo; a bad type; a note of 121 chars; an unknown chore | 400; 400; 400 naming note; 404 |
| MS14 | the ops hourly limit with 30 mess asks in the hour | a ping still goes (mess asks don't count) |
| MS-M | migration check (§4.2ze) | rows written before 0032 survive; `deliveries.mess_id` NULL on them; `foreign_key_check` empty |

---

## 7C. Things to do — `src/shared/things.ts` (pure)

The ideas the household wants to get to — "the fair is on Oct 10–20", "that exhibit closes
Nov 5", "a concert on the 14th" — usually spotted by Shelly, usually from a flyer or a
screenshot. Not calendar events yet: nobody has decided to go. Each thing has its own
loop: **idea → reminder → Plan it (a real calendar event) → done** (or let go).

### 7C.1 A thing

- **Title** 1–120 (required). **Note** ≤ 2000, **place** ≤ 200, **link** ≤ 500.
- **Links** go through one rule, `webLink` (things.ts), for typing and photo readings alike:
  `http(s)://…` is kept; a bare web address as flyers print it — `pumpkinjunctionsd.com`,
  `www.example.org/tickets` — gets `https://` added; anything with another scheme
  (`javascript:`, `ftp:`) or no dotted host is refused (400 when typed, dropped from a
  reading). (Found 2026-10-03: a flyer's link printed without `https://` was silently
  dropped from a reading.)
- **Address** ≤ 300, **phone** ≤ 50, **cost** ≤ 200 — free text, kept exactly as written
  ("$15 adults · kids under 3 free", "(619) 555-0134"); optional (decided by MojoSOGO
  2026-10-03). **Place** is the venue's name; **address** its street address.
- **When:** an optional window — `window_start` and/or `window_end` (local dates,
  end ≥ start). No dates = **any time**. Only an end = **until** that date.
- **Status:** `idea` → `planned` (Plan it) → `done`; or `dropped` ("let it go"). A done or
  dropped thing can be put back to `idea`.
- **Photo:** at most one (§7C.3). **Anyone** may add, edit, plan, finish or delete any thing. ⚑

### 7C.2 Reminders and Plan it

- Two reminders, each optional (decided by MojoSOGO 2026-10-03):
  - **When it starts** (`remind_start`): on `window_start` (needs one) at **09:00 local** ⚑;
  - **On a date I pick** (`remind_on`): that date at 09:00 local.
- Each is a fire of kind **`thing`** (`thing_id`, `occurrence_date` = the reminder's date),
  planned by `tick` like reminders (36 h ahead, `INSERT OR IGNORE`). It rings like an event
  reminder (Done / Snooze in the Ringing bar), may go `missed` like one, and alerts **the
  whole household** on the thing's channels (push by default; House optional). ⚑
  Message: `"To do: {title}"` plus `" — starts today"` for the start reminder.
- **Every** edit of a thing (fields, status, delete) closes its scheduled future fires
  `removed`; the next tick re-plans whatever still applies. Only `idea` things have
  reminders — planned, done and let-go things never re-plan.
- **Plan it** (decided by MojoSOGO): pick a date (inside the window when there is one ⚑ —
  outside it is refused with a message) and optionally a time → a normal **calendar event**
  is created (title; notes = the thing's note + place + address + phone + cost + link,
  one per line; `thing_id` set), the thing
  becomes `planned` with `planned_event_id`, and its scheduled reminders close `removed`
  (the event has its own). The event form shows **"From Things to do"** with the photo.
- `things.ts` owns: limits, window validation, `remindersFor(thing, tz)` → the reminder
  dates/instants, `canPlanOn(thing, date)`, and `cleanPhotoReading(raw, today)` (§7C.4).

### 7C.3 Photos — R2, private

- The phone shrinks the picture before upload: longest side **1600 px**, JPEG quality 0.85
  (canvas). The server refuses anything over **4 MB** or not `image/jpeg|png|webp|heic`.
- Stored in R2 at `things/{thingId}/{random}.jpg`. Served **only** through
  `GET /things/{id}/photo` to signed-in members (`Cache-Control: private, max-age=3600`).
  Never a public URL.
- Replacing a photo deletes the old object; deleting a thing deletes its photo from R2.

### 7C.4 Reading a photo (fills the fields)

- `POST /things/read-photo` with the (already shrunk) image → `{ title, startDate,
  endDate, place, address, phone, cost, url, note }` — each a string or `null`, dates
  `YYYY-MM-DD`. The prompt asks for **every** detail the photo shows, copied as written —
  the venue name as place, the street address separately, a phone number, prices/cost as
  one line, and anything else useful in the note. **Nothing is
  saved**: the form fills only **empty** fields, marks each filled one "from photo — check
  it", and the person reviews and taps Save.
- Implementation: the official `@anthropic-ai/sdk` in the Worker, model `claude-opus-5-5`,
  `messages.parse` with a structured-output schema, the image as a base64 block; the prompt
  gives today's date and the household time zone so "Sat Oct 12" becomes a full date. Refusal
  fallback on (`server-side-fallback-2026-07-01` beta, `fallbacks: "default"`).
- `cleanPhotoReading` (pure) trims to the limits, drops dates that aren't real calendar
  dates, swaps start/end if reversed, and passes the link through `webLink` — the model's answer
  is input, never trusted as-is.
- **Cost guard:** at most **40 reads per household per day** ⚑ (`photo_reads`; a snapped list item that Claude reads counts too, §7A.3), then 429
  with a message. Roughly a cent per photo. A read is counted when the model is called, so
  failed reads count too.
- **Check order:** signed in → size/type (400) → daily cap (429) → key present (503) →
  count the read → call the model → refusal 422 / failure 502 / success → cleaned → 200.
- **Honest failures:** no `ANTHROPIC_API_KEY` → 503 `photo_reading_off` "Reading photos
  isn't set up yet." Model or network failure → 502 with the reason. A refusal → 422 "Couldn't
  read that photo." The photo itself is still attached either way.
- **Privacy:** the photo is sent to Anthropic to be read (MojoSOGO's choice, Q30); stored
  photos stay in the household's own R2.

### 7C.4b Reading a link (fills the fields) — asked by MojoSOGO 2026-10-04

A link someone pasted — an event page, a venue's site, a ticket listing — often holds the dates, the
place and the price, and what it leaves out can usually be found by looking it up. Reading it fills the
form the way a photo does (§7C.4): **nothing is saved**, only **empty** fields fill, each marked
*from link — check it*, and the person reviews and taps Save.

- `POST /things/read-link { url }` → the same `PhotoReading` as read-photo, cleaned by the same
  `cleanPhotoReading`. The answer's `url` is the link as given (through `webLink`), never one the model
  found ⚑ Q138.
- **The link:** `readableLink(url)` (link-reading.ts, pure) takes what `webLink` keeps and refuses a
  host that is an IP address, `localhost` / `*.localhost`, has no dot, or ends in `.local` / `.internal`
  / `.lan` / `.home.arpa` → 400 `invalid_input` "That link can't be read." (Cloudflare can't reach the
  home network anyway; this keeps the Worker from being pointed at anything that isn't a public site.)
- **Check order:** signed in (401) → the link (400) → daily cap (429, the **same 40-a-day `photo_reads`
  budget** as photos ⚑ Q139) → key present (503 `link_reading_off` "Reading links isn't set up yet.") →
  count the read → fetch the page → Claude looks it up → Claude fills the fields → refusal 422
  `link_refused` "Couldn't read that link." / failure 502 `link_reading_failed` with the reason →
  cleaned → 200.
- **Fetching the page** (`src/worker/page-fetch.ts`): one GET from the Worker, no cookies or
  credentials, redirects followed by hand (at most 5, **each hop re-checked by `readableLink`**, so a public link
  can't send the Worker to a private host), `PAGE_FETCH_TIMEOUT_MS` = 8 000, at most `PAGE_BYTES_MAX` = 1.5 MB read
  (the rest dropped, not an error), only an HTML or text answer kept. It never throws: any failure
  (refused, 4xx/5xx, timeout, not a web page) is **kept as a reason, never fatal** — many sites turn away
  servers, and Claude can still look the link up.
- **What the page says** — `pageExtract(html)` (pure): the `<title>`, the `description` and `og:*` /
  `twitter:*` meta tags, every JSON-LD block (`application/ld+json`, where event pages put their dates,
  venue, address and offers) cut to `JSONLD_MAX` = 8 000 characters, and the visible text (scripts,
  styles, comments and tags removed, entities decoded, whitespace collapsed) cut to `PAGE_TEXT_MAX` =
  12 000 characters (never inside a surrogate pair).
- **Looking it up** (`askClaudeResearch` in claude.ts): one request with Anthropic's server tools
  **web search** (`web_search_20260209`, at most `LINK_SEARCHES_MAX` = 3 searches ⚑ Q140) and **web
  fetch** (`web_fetch_20260209`, at most `LINK_FETCHES_MAX` = 2 fetches, so the pasted link can be read
  from Anthropic's side when the Worker was turned away). The prompt gives the link, what the page said
  (or why it couldn't be fetched), today's date and the household zone, and asks for plain notes: what
  the thing is, when, where, the address, a phone number, the cost, and anything else useful, **only from
  the page and what the searches found, never guessed**. `pause_turn` is continued (the paused answer sent
  back unchanged) up to `RESEARCH_TURNS_MAX` = 4 requests; still paused after that is a failure (502), never
  half-finished notes passed off as the answer. The notes are the text after the last tool result.
- **Several locations** (asked by MojoSOGO 2026-10-04: "pick the closest to San Diego"): both prompts give the
  household's own place (`settings` latitude / longitude, §7.7 — Oceanside, in the San Diego area) and say: when it
  happens in more than one place, or on different dates in different places, choose the location **closest to the
  household** and give that location's dates, address, phone and cost; the other locations go only in the note
  (`nearestClause`, link-reading.ts). No place set → every location is named in the note instead ⚑ Q143. Web search
  is told the household's time zone as its approximate location.
- **Filling the fields** (`askClaude`, the photo reader's schema): the page extract and the notes →
  `{ title, startDate, endDate, place, address, phone, cost, url, note }`, dates resolved as for a photo
  (the next such date on or after today). Two requests rather than one because web search always answers
  with citations, which a structured answer can't carry.
- **Honest failures:** a failed look-up is a failure (502 with its reason), even when the page was read,
  so a reading never quietly rests on half the work. The page couldn't be fetched **and** the look-up found
  nothing → the reading is all nulls but the link, and the form says "Nothing new found at that link." A refusal → 422; a model
  or network failure → 502 with the reason (never the key).
- **Cost:** roughly a few cents a link (two requests and at most three searches at $10 per 1 000).
- **Privacy** ⚑ Q141: the link and the page's text go to Anthropic, and the searches run on Anthropic's
  side. Nothing about the household is sent but today's date and its time zone.

### 7C.5 Acceptance (M4g — each row is a test)

| # | Setup / call | Expected |
|---|---|---|
| D1 | create "Fall fair", window 2026-10-10…2026-10-20 | 201; listed under Things to do, status `idea` |
| D2 | window end before start; link `ftp://x`; empty title | 400 `invalid_input`, message names the field |
| D3 | remind_start on, remind_on 2026-10-15; tick 2026-10-10 09:00 local | a `thing` fire rings, push to every active member, message `To do: Fall fair — starts today` |
| D4 | tick 2026-10-15 09:00 local | the picked-date reminder rings, `To do: Fall fair` |
| D5 | edit the window to start 10-12 | the 10-10 fire (if still scheduled) closes `removed`; the next tick plans 10-12 |
| D6 | Plan it on 2026-10-14 | an event on 10-14 with `thing_id`; thing `planned`; scheduled thing fires `removed` |
| D7 | Plan it on 2026-10-25 (outside the window) | 400 with a message |
| D8 | upload a 200 KB JPEG, GET it back, replace it, delete the thing | bytes round-trip; old and final objects gone from R2 |
| D9 | GET a photo without a session | 401 |
| D10 | read-photo with no API key | 503 `photo_reading_off` |
| D11 | `cleanPhotoReading` on raw model output with `2026-02-30`, reversed dates, a `javascript:` link, a 300-char title | invalid date dropped, dates swapped, link dropped, title cut to 120 |
| D12 | migration check (§4.2g) | every fire kind and delivery intact after 0008 |
| D13 | a 41st read in one day | 429 with a message |
| D14 | read-link on an event page whose JSON-LD holds the dates, venue and price (fake page, fake Claude) | 200 with the fields; one `photo_reads` row; the research request carries web search (max 3) and web fetch (max 2) and the page's JSON-LD and text; nothing saved |
| D15 | read-link whose page answers 403 | still 200: the research prompt names the failure ("403") and Claude is asked |
| D16 | read-link with `http://192.168.0.123`, `localhost:8787`, `intranet`, `ftp://x` | 400 `invalid_input`; no fetch, no read counted |
| D17 | read-link with no API key; at the daily cap | 503 `link_reading_off`, no fetch; 429, no fetch, no read counted |
| D18 | read-link where research answers `pause_turn` once | the paused answer is sent back unchanged and the second answer's notes are used |
| D19 | read-link where Claude's fill gives another link | the answer's `url` is the pasted link |
| D20 | `pageExtract` on HTML with a script, a style, a comment, `&amp;`, meta og:title and two JSON-LD blocks | title and meta kept, both JSON-LD blocks kept, script/style/comment text gone, `&` decoded; a 50 000-char body cut to 12 000 |
| D22 | read-link with the household's place set | both prompts carry its latitude / longitude and "choose the location closest to the household"; web search carries `user_location` with the zone |
| D21 | refusal / failure from Claude | 422 `link_refused` / 502 `link_reading_failed` with the reason |

---

## 7D. The laundry loop — `src/shared/machines.ts` (pure)

Decided by MojoSOGO 2026-10-03. Two machines, **Washer** and **Dryer**, each holding at most
one load. A load turns once around: **start the washer → done → move to the dryer → done →
fold & out**. The weekly Laundry chore (§7B) is separate and unchanged; the dishwasher is
deferred.

### 7D.1 A machine

- One `machines` row per machine (§4.2m), seeded free. Its **state** is derived, never stored
  (`machineState(row, now)`):
  - **free** — no owner;
  - **running** — owner set, `now < done_at`: whose load, started, minutes, done-at;
  - **done** — owner set, `now ≥ done_at`: the card reads **DONE — waiting**.
- `GET /machines` returns the server-derived `state`; the PWA never re-derives it.
- The machines in load order are `MACHINE` (vocab): the washer's **next** machine is the dryer;
  the dryer has none (it is the last).
- Anyone may act on any machine. Every transition is one `db.batch` (§7D.2).

### 7D.2 Transitions — each returns `{ rows, closeFire?, newFire? }` or a refusal

| Transition | Valid when | Result |
|---|---|---|
| **Start** `{ ownerId, minutes }` | the machine is free | owner, minutes, `started_at = now`, `done_at = now + minutes`, `started_by` = me; a new `machine` fire due at `done_at` |
| **Move** `{ minutes }` (washer → dryer) | the washer is done **and** the dryer is free | washer free, its open fire closes `done` (`closed_by` = me); the dryer starts with the **washer's owner** and its own minutes; a new dryer fire |
| **Finish** — *Fold & out* | the last machine (dryer) is done | dryer free; its open fire closes `done` — the load's loop ends |
| **Done now** `{ ownerId }` ⚑ Q160 | free or running | the app catches up with the real machine: a **free** one gets `ownerId`'s load (`minutes` null, `started_at = done_at = now`, `started_by` = me); a **running** one keeps its load, `done_at = now`. Any open fire closes `superseded`; a new `machine` fire is due **now**. `ownerId` is required only when free |
| **Clear** | running or done | free; its open fire closes `removed`; nothing rings |
| **Remind** — *Still loaded* ⚑ Q159 | done | the load stays; its open fire closes `superseded` (`closed_by` = me) and a new `machine` fire is due **now**, so the reminders run again from alert 1 (§7D.3) |

- **Minutes** are chips: `MACHINE_MINUTES` = **30 / 45 / 60 / 90**. **Whose load** is one active
  member (the chooser defaults to me).
- Refusals are **409** with a message, shown in place:
  - start on a machine that isn't free, or move while the dryer is full → `busy`,
    "The dryer still has Sam's load." ("…has a load." when its owner is not an active member).
    The washer stays DONE — waiting; nothing moves automatically.
  - move a washer that isn't done → `not_done` "The washer isn't done yet."
  - move from the dryer, or Fold & out on the washer → `invalid_state` with a message naming
    what the machine does take.
  - clear a free machine → `already_free`.
  - Still loaded on a machine that isn't done → `not_done`.
  - Done now on a done machine → `busy`; on a free one with no active `ownerId` → 400 `invalid_input`.
- **Two taps at once:** every machine-row write is conditional on the row's `started_at` as it
  was read, inside the same batch as the fire writes; a row that changed under it aborts the
  whole batch → **409 `conflict`** "Someone else just changed the washer — have another look."
  `uq_machine_open` also refuses a second open fire for one machine.
- A machine fire is closed **only** by these routes; `POST /fires/{id}/actions` on one is 409
  `invalid_action` (§5.4). No new `ACTION` or `CLOSE_REASON`.

### 7D.3 When it's done — reminders

- The fire is inserted by the route at start/move (as a timer's is); `tick` steps it like any
  fire (§5.3) with `MACHINE_CHANNELS` = **Phone + House**, `MACHINE_RENOTIFY_MIN` = **15**,
  `MACHINE_MAX_ALERTS` = **4**. After the 4th alert it stays ringing silently in the Ringing
  bar and the card stays **DONE — waiting**. Never `missed`.
- Recipients (decided by MojoSOGO 2026-10-05: "always go to all devices"): **every active
  member's phones**, and **one** House announcement on **every speaker** Home Assistant lists
  (the §9.2a list, fetched at most once a tick), whatever anyone ticked in 🔊 Speak my alerts on.
  The `Everywhere` group is left out so no Echo speaks twice ⚑ Q161 (`everySpeaker`). When House
  is off or the list can't be read, the row is written with NULL: the default speakers. The
  message still names the load's owner.
- Message (`doneMessage`): `"Sam, your laundry in the washer is done"` / `"… in the dryer is
  done"`; with no active owner `"The laundry in the washer is done"`. While the machine
  before it (the washer) holds a **done** load, every later dryer alert adds
  `" — Kai's load is waiting"` (`" — another load is waiting"` when that owner is not
  active). From the second alert on, `" (alert n)"` (§5.7). "Waiting" is derived at alert
  time, never stored.
- **Still loaded** (⚑ Q159): a fire due *after* the machine's done-at was restarted by Still
  loaded (`isStillLoaded`, derived, never stored). Its message says what the load needs next:
  `"Sam, your laundry is still in the washer — move it to the dryer"` / `"… still in the dryer
  — take it out"`; with no active owner `"The laundry is still in the washer — …"`. The waiting
  suffix and `" (alert n)"` follow as above.
- Phone notifications have **no buttons** for a machine (`pushActions('machine') = []`);
  tapping one opens the app.

### 7D.5 Alert hours

Decided by MojoSOGO 2026-10-05: machine alerts sound only **weekdays 5:30pm–8:30pm** and
**weekends 9:00am–9:00pm** (household local; Saturday and Sunday are the weekend), and an admin
can edit them.
- `MachineHours = { weekday, weekend }`, each `{ from, to }` (HH:MM, `from < to`, same day) or
  `null` = any time that day. Defaults `DEFAULT_MACHINE_HOURS`; stored on `settings` (§4.2za).
- `machineQuietUntil(hours, tz, now)` → `null` when `from ≤ local < to` (or that day is any
  time), else the next opening (the next day's `from`, or its midnight when that day is any time).
- `tick` passes it as `quietUntil` (§5.3 rule 0b) ⚑ Q162: an alert outside the hours **waits**
  and the reminders start over at the opening (4 alerts, every 15 min). Nothing is dropped; the
  card still reads DONE — waiting, and Still loaded / Done now work at any hour (their new fire
  waits too). A waited fire is due after done-at, so it speaks the Still loaded wording (§7D.3).

### 7D.4 Acceptance (M4l — each row is a test)

| # | Setup / call | Expected |
|---|---|---|
| L1 | `machineState` before / at / after `done_at`, and with no owner | running / done / done / free |
| L2 | `doneMessage` with an owner, with none, with a waiting load, waiting with an inactive owner | the four §7D.3 texts |
| L3 | start the washer for A, 45 min | 200; washer `running`, `done_at = now + 45 min`; one `scheduled` machine fire due then |
| L4 | tick at done-at | fire ringing; push to every active member (A and B) + one house delivery, message `A, your laundry in the washer is done` |
| L5 | ticks every 15 min after | alerts 2, 3, 4 (`… (alert 4)`); a 5th tick sends nothing; washer state `done` |
| L6 | move to the dryer, 60 min | washer free, its fire closed `done` by me; dryer running for A with a new fire |
| L7 | start the washer for B, then move it while the dryer is still full | 409 `busy` "The dryer still has A's load."; the washer stays done; nothing moved |
| L8 | tick the dryer's done-at while B's load waits in the washer | dryer message `A, your laundry in the dryer is done — B's load is waiting` |
| L9 | Fold & out on the done dryer | dryer free; its fire closed `done` |
| L10 | Clear a running machine | free; its fire closed `removed`; a later tick sends nothing |
| L11 | two Start taps on one free machine at once | one 200, one 409; exactly one open fire |
| L12 | minutes 20, an unknown owner, an unknown machine, `done` action on a machine fire | 400 / 400 / 404 / 409 `invalid_action`, each with a message |
| L14 | `remindMachine` on a done washer / a running or free one; `doneMessage(…, still)` | the load stays, the open fire closes `superseded`, a new fire due now / `not_done`; the §7D.3 Still loaded texts |
| L15 | Still loaded on a washer done 70 min ago, then ticks every 15 min | the old fire closed `superseded`; the new fire alerts 4 times (A's phone + house), message `A, your laundry is still in the washer — move it to the dryer` |
| L16 | `doneNowMachine` on a free washer for A / a running dryer / a done one; `parseDoneNow` | A's load done now, a fire due now / done-at now, old fire `superseded` / `busy`; owner required only when free |
| L17 | Done now on a free washer for A, then tick | washer done for A; alert 1 to A's phone + house, `A, your laundry in the washer is done`; again → `busy`; a running dryer's Done now closes its fire `superseded` |
| L18 (HS11) | a machine alert while A ticked only Game Room; HA lists Game Room, Everywhere, Toasty, the Voice PE; then HA down | the house row's speakers are Game Room, Toasty, the Voice PE; then NULL (the defaults) |
| L19 | `machineQuietUntil`, defaults, Los Angeles: Mon 18:00 / 17:29 / 20:30; Fri 21:00; Sat 12:00; Sun 21:00; weekend any time: Fri 22:00, Sat 03:00; both any time | null / Mon 17:30 / Tue 17:30; Sat 09:00; null; Mon 17:30; Sat 00:00, null; null |
| L20 | `stepFire` with `quietUntil`: a due scheduled fire; a ringing fire due its renotify; not yet due; silent past max | scheduled at quietUntil, count 0, no alert (twice); unchanged; unchanged |
| L21 | `GET /machines/hours` after 0028; an admin PATCHes; a member PATCHes; from ≥ to | the defaults; saved and read back; 403; 400 with a message |
| L13 | migration check (§4.2m) | fires and deliveries intact after 0014; machines seeded; CHECK refuses a machine fire without `machine_id` |

---

## 7E. Recipes — `src/shared/recipes.ts` (pure)

Decided by MojoSOGO 2026-10-03. The household finds dishes on YouTube; a recipe in the app keeps
what to buy and what to do, next to the video. **Paste a YouTube link** and the Worker reads the
recipe out of the video's own text, or **type one by hand**. Since v1.29.0 (asked by MojoSOGO
2026-10-05) **any link** works too — a Facebook reel or post, a recipe site, any web page — and the
kind of link is detected, never chosen (§7E.6). Recipes are household-shared: anyone
may add, edit or delete any recipe ⚑ Q66. Their own tab, 🍳 Recipes (§8.12).

### 7E.1 A recipe

- **Title** 1–120 (`RECIPE_TITLE_MAX`, required): the dish's name, else the video's title.
- **Ingredients** — at most 60 (`INGREDIENTS_MAX`), each 1–`INGREDIENT_MAX` characters, where
  `INGREDIENT_MAX` **is** the lists' `TEXT_MAX` (imported, never restated), so every ingredient
  fits a Shopping item as it is. **Steps** — at most 60 (`STEPS_MAX`), each 1–1000 (`STEP_MAX`).
- **Servings** ≤ 60 and **time** ≤ 60 (`SERVINGS_MAX`, `TIME_MAX`), free text as stated, optional.
- **Video:** `video_id` (11 characters `[A-Za-z0-9_-]`), its YouTube title and channel. The link
  and the picture are **derived**, never stored: `watchUrl(id)` =
  `https://www.youtube.com/watch?v={id}`, `thumbnailUrl(id)` =
  `https://i.ytimg.com/vi/{id}/hqdefault.jpg`. The thumbnail is **hotlinked** from YouTube's image
  host: it is not stored, not in R2 and not an attachment, so §7C.3 stays the only attachment (§12).
- **found** — the recipe holds ingredients or steps. It is `false` exactly when both lists are
  empty: a video whose text holds no recipe is saved with the video's title, no ingredients, no
  steps, and reads **"Recipe not in the video's text — watch it"** with the ▶ link. Every save
  recomputes it, so a hand edit that adds ingredients or steps sets it `true` ⚑ Q67.
- **source** — what the recipe was read from, a set of `RECIPE_SOURCE` (§3): `description`,
  `captions` and/or `comments` (the creator's own comments) for a video (empty when the video's
  text held nothing to read), `transcript` when it was re-read from a pasted transcript (§7E.2b),
  `typed` for one typed by hand. **captions_error** — when the
  captions attempt failed, its reason. **comments_error** — when reading the comments failed (quota
  or otherwise), its reason (§4.2r).
- **Link** (§7E.6): a recipe read from any other link keeps that link (`recipeLinkOf`'s cleaned form),
  its site's name in `channel`, and no video. Its `source` is `page`.
- **One live recipe per video** (`uq_recipe_video`) and **one per link** (`uq_recipe_link`). A typed
  recipe has no video and cannot be given one in v1 ⚑ Q68. Delete is soft (`deleted_at`).
- `youtubeVideoId(text)` → the id or null. It accepts `https://`, `http://` or no scheme, and
  the hosts `youtube.com`, `www.`, `m.` and `music.youtube.com` (`/watch?v=ID`, `/shorts/ID`,
  `/embed/ID`, `/live/ID`) and `youtu.be/ID`. Every other query parameter (`&t=42s`, `?si=…`,
  `&list=…`) is ignored; another host, or an id that is not exactly 11 such characters, is null.

### 7E.2 Reading a video — `POST /recipes/from-video { url }`

The reading rules here and in §7E.2b (the limits, what a video offered, the creator's comments, a
transcript given by hand, cleaning Claude's reading) live in `src/shared/recipe-reading.ts` (pure).

**Check order** (each step's failure answers at once; nothing later runs):

1. signed in (401);
2. `youtubeVideoId(url)` → else 400 `invalid_input` "That isn't a YouTube video link.";
3. a live recipe for that video (`recipeVideoClash`) → **409 `duplicate`** `{ error, message,
   recipeId }`; **no read is spent**;
4. daily cap: at most **`RECIPE_READS_PER_DAY` = 20** reads per household per local day ⚑ Q65
   (`recipe_reads`, counted apart from photo reads) → 429 `rate_limited` with a message;
5. `YOUTUBE_API_KEY` **and** `ANTHROPIC_API_KEY` present → else **503 `recipe_reading_off`**
   "Reading recipes from videos isn't set up yet." — **before any fetch**, the captions attempt
   included;
6. YouTube lookup (`src/worker/youtube.ts`, `videos.list?part=snippet&id={id}`) → `{ title,
   channel, channelId, description }` (`channelId` from `snippet.channelId`, null when absent); no
   such video (or private) → 404 `video_unavailable`; quota used up or any other failure → 502
   `youtube_failed` with the reason (never the key);
7. the captions attempt (`src/worker/youtube-captions.ts`) → transcript text, or a failure
   `{ kind: CAPTIONS_FAILURE, reason }` that is **kept**, never fatal; a `blocked` failure asks
   SogoAI in-line, in the same step (§7E.2c), whose captions or failure take its place;
8. **the creator's comments** (`lookUpComments` in `youtube.ts`,
   `commentThreads.list?part=snippet&videoId={id}&order=relevance&maxResults=20&textFormat=plainText`,
   1 quota unit) → each thread's top-level comment `{ authorChannelId, text }`, or a failure
   `{ kind: 'none' | 'quota' | 'failed', reason }` that is **never fatal** (a 403 `commentsDisabled`
   is `none`). `creatorComments(comments, channelId)` keeps only the comments whose author **is** the
   video's channel ⚑ Q76 (§7E.2 below). Steps 7 and 8 may run at the same time;
9. count the read (`INSERT INTO recipe_reads`) — every read from here on counts, failed or not;
10. `hasRecipeText({ description, transcript, comments })` false (no description, no captions and
   no creator's comment) → **Claude is not asked**: a `found: false` reading. Otherwise Claude
   (`src/worker/recipe-reader.ts` via `claude.ts`): refusal → 422 `recipe_refused` "Couldn't read a
   recipe from that video."; failure → 502 `recipe_reading_failed` with the reason;
11. `cleanRecipeReading(raw, videoTitle)` (pure; the answer is input, never trusted);
12. INSERT (a unique-index race → 409 `duplicate`);
13. → **201** the recipe.

- **The prompt** gives the video's title, channel, description, captions (cut to
  `TRANSCRIPT_MAX` = 20 000 characters) and the creator's comments ("(none)" when there are none),
  and asks for `found`, `title` (the dish), `ingredients`, `steps`, `servings` and `time` (null
  unless stated). **Claude must never invent a recipe from the title** or from general knowledge:
  only what the description, captions and the creator's comments say; when they hold no recipe,
  `found` is false and the lists are empty.
- **In English** ⚑ Q171 (asked by MojoSOGO 2026-10-05: "Translate to English if required… the fb link is
  Spanish"): every reading — a video's, a transcript's (§7E.2b), a link's fill (§7E.6) — asks for the title,
  ingredients, steps, servings and time in English, a recipe in another language translated faithfully, every
  nothing added (`RECIPE_IN_ENGLISH`, never restated). **US units** ⚑ Q172 (asked by MojoSOGO 2026-10-05:
  "convert units to American… so degrees Fahrenheit and inches and ounces"): metric amounts are converted,
  rounded to what a home cook measures — °C → °F (180 °C → 350 °F), g → oz or lb, ml / l → tsp, tbsp, cups or
  fl oz, cm → inches; US amounts and counts stay as given.
- **The creator's comments** — recipes are often in the creator's first comment, usually pinned
  (decided by MojoSOGO 2026-10-04). `COMMENTS_LOOKED_AT` = 20 threads are asked for, by relevance
  ⚑ Q77. `creatorComments(comments, channelId)` (pure): an unknown (null or empty) `channelId` →
  null, never a fallback to anyone's comment ⚑ Q80; otherwise the top-level comments whose
  `authorChannelId` equals it exactly, in order, joined with a blank line, cut to
  `CREATOR_COMMENTS_MAX` = 5 000 characters (never inside a surrogate pair); nothing kept → null.
  Viewers' comments and replies inside threads are never read ⚑ Q76. Comments turned off, or no
  creator's comment, is not an error: `comments_error` stays NULL and no marker shows ⚑ Q78. A quota
  or other failure still saves the recipe, with `comments_error` = the reason, shown as "comments
  couldn't be read: {reason}" ⚑ Q79 (§8.12). The key is never in a reason.
- **`cleanRecipeReading`**: `found` not `true` → no ingredients, no steps; every string trimmed,
  inner whitespace collapsed to one space, cut to its limit; empty ones dropped; lists cut to their
  counts; `found` is then "has ingredients or steps". The title is the dish's name when found, else
  the video's title (cut to the limit; "Recipe from YouTube" when YouTube gave none).
- **source** = `description` when the description was non-empty, plus `captions` when a transcript
  was read, plus `comments` when a creator's comment was kept — what Claude was given, whatever it
  found there.
- **Captions** are unofficial: no key; YouTube's player endpoint (`/youtubei/v1/player`) asked as
  its Android app lists the caption tracks (English preferred), and that track is parsed to plain
  text. (The website's own caption files come back empty without a proof-of-origin token — found
  2026-10-04: every recipe said "YouTube sent an empty caption file".) A player answer other than
  `OK` (a bot check) is `blocked`. YouTube may refuse it (`blocked`), the video may have none (`none`), or it
  may fail otherwise (`failed`); the recipe is still read from the description and its
  `captions_error` keeps the reason, shown as "captions couldn't be read: {reason}" (§8.12). The
  captions module never throws and can be deleted alone.
- **Privacy** ⚑ Q70: the video's text goes to Anthropic to be read — the creator's kept comments
  too ⚑ Q83; the thumbnail loads from `i.ytimg.com` in the phone's browser (no referrer sent).
  Accepted by MojoSOGO.

### 7E.2b The transcript, by hand — `POST /recipes/{id}/transcript { screenshots?, text? }`

Decided by MojoSOGO 2026-10-04. In production the captions attempt is often refused from
Cloudflare's addresses ("LOGIN_REQUIRED: Sign in to confirm you're not a bot" — YouTube judges the
IP, so no client change fixes it from a Worker). He can open the transcript on YouTube himself
(⋯ → **Show transcript**). He can't copy text on his phone, but he can **screenshot** it (decided by
MojoSOGO 2026-10-04, mid-build): on a video recipe he adds 1–4 screenshots — or, on a computer, pastes
the text — and Claude **re-reads the recipe** from them, in place of captions.

**The body** (JSON): `screenshots` — 0 to **`SCREENSHOTS_MAX` = 4** ⚑ Q92, each `{ type, data }`:
`type` one of `SCREENSHOT_TYPES` = the photo types (`PHOTO_TYPES`, §7C.3) less HEIC, which Claude can't
read (JPEG, PNG, WebP); `data` the bytes in base64, at most `PHOTO_MAX_BYTES` once decoded
(`parseScreenshots`, pure). Base64 in JSON — not multipart, not a raw body — so one request carries
up to four pictures and the text, and the base64 goes to Claude's image block as it came. The phone
shrinks each picture to a JPEG first, exactly like a thing's photo (§7C.3, which also turns an Apple
HEIC photo into a JPEG). `text` — optional pasted text. Screenshots were first read, never stored ⚑ Q93;
since v1.31.0 (asked by MojoSOGO 2026-10-05: "Show screenshot on main display if exists" ⚑ Q174) **the first
screenshot of a read that succeeds is kept** as the recipe's picture: R2 `recipes/{id}/{random}.jpg`,
`recipes.photo_key` (§4.2zd), replacing (and deleting) the one before; the others are still dropped, and a read
that fails or that had only pasted text changes nothing. It is served privately by `GET /recipes/{id}/photo`
(`routes/recipe-photos.ts`) and on the wire as `hasPhoto`.

**Check order** (each step's failure answers at once; nothing later runs):

1. signed in (401);
2. a live recipe with that id → else 404 `not_found`;
3. *(since v1.30.0, ⚑ Q173: any recipe takes one — a video's, a link's or a typed one; there is no
   400 here any more)*;
4. `parseScreenshots(screenshots)` accepts them (too many, HEIC or another type, damaged, too large →
   400); `text`, when given, is a string of at most **`PASTED_MAX` = 100 000** characters ⚑ Q89 (else
   400); and there is **at least one screenshot or a `cleanTranscript(text)` that is not null** → else
   400 `invalid_input` "Add a screenshot of the transcript, or paste its text." — every 400 here comes
   **before any read is spent** and before any fetch;
5. the daily cap, shared with from-video (`RECIPE_READS_PER_DAY`, one count of `recipe_reads`) →
   429 `rate_limited`;
6. `YOUTUBE_API_KEY` (a video recipe only) **and** `ANTHROPIC_API_KEY` present → else 503
   `recipe_reading_off`, before any fetch;
7. **a link or typed recipe** (§7E.6) skips this step: nothing is fetched ⚑ Q169 ⚑ Q173, and Claude is
   given the recipe's title, its site (a link's; "(none)" when typed) and what was given. **A video recipe:** the YouTube lookup and the creator's comments, side by side — **re-fetched**, since neither the
   description nor the comments are stored ⚑ Q84 (2 quota units). A failed lookup → 404
   `video_unavailable` / 502 `youtube_failed` and **nothing changes**; a comments failure is never
   fatal (as §7E.2 step 8). **No captions attempt** — that is what failed;
8. count the read;
9. Claude (`readRecipe`), given the screenshots as image blocks (with one prompt line: they are
   screenshots of the video's transcript or captions, read as spoken text), the description, the
   cleaned pasted text in the captions slot, and the creator's comments → refusal 422
   `recipe_refused`; failure 502 `recipe_reading_failed`. "Never invent a recipe from the title"
   holds for the screenshots too;
10. `cleanRecipeReading(raw, videoTitle)`;
11. **found false → 422 `no_recipe`** "No recipe in that transcript — nothing was changed." The
    recipe is untouched (hand edits survive) and the read still counts ⚑ Q86;
12. UPDATE the recipe's title, ingredients, steps, servings, time, `found` = 1, `source` (wholesale,
    `sourcesOf`), `captions_error` = NULL, `comments_error` (from this fetch) and `updated_at` →
    **200** the recipe. The video fields, `created_*` and everyone's emoji are untouched. No confirm
    is asked: the view says what it replaces (§8.12) ⚑ Q86.

The route never decides `found` or `source` itself: `cleanRecipeReading` and `sourcesOf` do.
**source** gains `transcript` — its own value, never `captions` ⚑ Q85: `VideoText.pasted` (text) or
`VideoText.screenshots` (at least one), offered as `transcript` (so `sourcesOf` / `hasRecipeText`
derive it, like the others). The server takes a
transcript for **any** video recipe; the PWA only offers it on "watch it" or failed captions ⚑ Q87.

- **`cleanTranscript(text)`** (pure) ⚑ Q88 — what YouTube's transcript panel copies is a timestamp
  line, then a line of speech, with chapter titles between:
  1. a line that is only a timestamp (`0:05`, `12:34`, `1:02:03`) is dropped;
  2. a timestamp at the start of a line is stripped (`0:05 add the flour` → `add the flour`);
  3. a line that is only one of YouTube's spoken durations ("3 seconds", "1 minute, 5 seconds",
     "2 hours, 1 minute") is dropped;
  4. **chapter titles are kept** — they are the creator's own headings ("Ingredients", "Making the
     sauce"), often the clearest recipe text in the transcript, and nothing tells one apart from a
     line of speech;
  5. each line's whitespace is collapsed to single spaces, empty lines dropped, lines joined with a
     line break;
  6. cut to `TRANSCRIPT_MAX` (never inside a surrogate pair). Nothing left → null.

### 7E.2c Captions from home — SogoAI, asked in-line

Decided by MojoSOGO 2026-10-04. YouTube's player endpoint refuses Cloudflare's addresses
(LOGIN_REQUIRED) but answers a home one. **SogoAI** — the always-on Windows 11 PC at home (Node 24, no
public address) — runs a small helper, `home/captions-helper.ts`, that reads a video's captions from
home with the **same** `src/worker/youtube-captions.ts`. Decided by MojoSOGO 2026-10-04 (second
pass): **no polling** and no job queue. When YouTube blocks the Worker's own captions request, the
Worker asks SogoAI **in-line**, inside `POST /recipes/from-video`, through Cloudflare Access and the
`sogoai` Cloudflare Tunnel (§2), gets the captions back in the same request, reads the recipe once and
saves it complete. Nothing is pending, and nothing is re-read later.

The rules (pure) are `src/shared/recipe-reading.ts`; the call is `src/worker/home-captions.ts`; the
decision to ask is the from-video read in `src/worker/recipe-reads.ts`.

**When** — in §7E.2 step 7, `wantsHomeCaptions(failure)` is true **only** for kind `blocked` ⚑ Q95;
`none` and `failed` never ask (they would fail at home too), nor does the transcript route; there is no
backfill of older recipes and no "try from home" button ⚑ Q102. `recipe-reads.ts`'s file-local
`captionsFor(videoId, env)`:

1. `readCaptions(videoId)` — read → its text; a failure that is not `blocked` → that failure, kept;
2. `blocked` and `homeCaptionsConfigOf(env)` is null → the failure
   `homeCaptionsError(HOME_CAPTIONS_OFF)` = "from home: captions from home aren't set up." ⚑ Q106;
3. `blocked` and configured → `readCaptionsFromHome(cfg, videoId)`: ok → its text is the transcript
   (so `source` gets **`captions`** and `captions_error` is NULL); a failure → `captions_error` =
   `homeCaptionsError(reason)` = "from home: {reason}" ⚑ Q97.

It runs beside the creator's comments (`Promise.all`, steps 7 and 8), before the read is counted:
**one read, counted once**, and one INSERT — never an UPDATE after it. The rest of §7E.2 is unchanged.

**The configuration** — `homeCaptionsConfigOf(env)` needs `HOME_CAPTIONS_URL`, `CF_ACCESS_CLIENT_ID`,
`CF_ACCESS_CLIENT_SECRET` and `CAPTIONS_TOKEN` (§2.4), each non-empty → `{ url (no trailing slash),
accessId, accessSecret, token }`; any missing or empty → null.

**The call** — `readCaptionsFromHome(cfg, videoId, { fetch? })`: one `GET {url}/captions?v={videoId}`
with `CF-Access-Client-Id`, `CF-Access-Client-Secret` and `Authorization: Bearer {CAPTIONS_TOKEN}`,
`redirect: 'manual'` (Access answers a bad service token with a 302 to its login page — a failure),
and `AbortSignal.timeout(HOME_CAPTIONS_TIMEOUT_MS)` = **20 s** ⚑ Q96. Only a **2xx** is read; its body
(JSON, a `CaptionsResult`) goes through `parseCaptionsReport` (pure): `{ ok: true, text }` — `text` a
non-empty string cut to `TRANSCRIPT_MAX` (never inside a surrogate pair; **not** `cleanTranscript` —
captions carry no timestamps) — or `{ ok: false, kind, reason }` — `kind` one of `CAPTIONS_FAILURE`,
`reason` non-empty, cut to **`CAPTIONS_REPORT_REASON_MAX` = 300** ⚑ Q104. It answers `{ ok: true, text }`
or `{ ok: false, reason }`, the reason honest: "HTTP {status}: {body, at most 200 characters}" for
anything but a 2xx, "error: {message}" for a network failure or the timeout, the parse message for a
body that isn't a captions result, else the home's own reason. It **never throws**, never names a
secret, and never decides whether to ask or what is saved. No D1, no Hono.

**The helper** — `home/captions-helper.ts`, bundled by `npm run build:home` (esbuild, Node 24, ESM) into
one file, `home/dist/captions-helper.mjs`, copied to `C:\Enso\` on SogoAI with
`home/captions-helper.cmd` and a `captions-helper.env` holding **`CAPTIONS_TOKEN` only** (never in the
repo; README). It imports only `src/worker/youtube-captions.ts`, `node:http` and Node's globals (§2.5).

- `handle(req: { method, url, authorization? }, deps: { token, fetch })` → `{ status, body }` (no
  `node:http` in it): a path other than `/captions` → **404**; a method other than GET → **405**; the
  bearer compared in constant time (the SHA-256 of each, every byte compared, via `crypto.subtle`) →
  else **401**; `v` matching `^[A-Za-z0-9_-]{1,64}$` → else **400**; then `readCaptions(v, { fetch })`
  → **200** with the `CaptionsResult` as JSON, whatever its `ok`. Errors are JSON `{ error }`.
- `main()` is the only `node:http` user: one server on **`127.0.0.1:8790`** ⚑ Q105 — loopback only,
  never `0.0.0.0`; the `sogoai` tunnel (`cloudflared`, a Windows service on SogoAI) is its only way in.
  Port and host are constants. `CAPTIONS_TOKEN` unset → it logs that and exits with code 1.
- One log line per request (the video id, the outcome); the token is never logged. The helper never
  decides what is saved.

**PWA** (§8.12) — nothing is pending: the recipe comes back complete. The transcript box shows on a
video recipe that is "watch it" or whose `captionsError` is set, as before.

**Acceptance (M4s — each row is a test; fakes only, never a real network):**

| # | Setup / call | Expected |
|---|---|---|
| H-C1 | `homeCaptionsConfigOf` with each of the four settings missing or empty; with all four | null for each; the config, the URL's trailing slash trimmed |
| H-C2 | `readCaptionsFromHome` over a fake fetch answering 200 with a read `CaptionsResult` | one GET to `{url}/captions?v=…` with both Access headers, `Authorization: Bearer {CAPTIONS_TOKEN}`, `redirect: 'manual'` and a signal; `{ ok: true, text }` |
| H-C3 | the fake answers a 302, a 403, a 502; throws; aborts; answers a body that isn't JSON or isn't a captions result; an `ok: false` result | `{ ok: false, reason }` each: "HTTP 302: …", "HTTP 403: …", "HTTP 502: …", "error: …", the parse message, the home's reason — never a throw, never a secret in the reason |
| H-C4 | from-video, captions `blocked`, home answers read captions | 201; `source` includes `captions`; `captionsError` null; one GET to the home URL; one `recipe_reads` row |
| H-C5 | from-video, captions `blocked`, home answers a failure (a 502; an `ok: false`) | 201; `captionsError` "from home: …"; one read |
| H-C6 | from-video, captions `blocked`, home not configured (the pinned test env) | 201; `captionsError` "from home: captions from home aren't set up."; no request to the home URL |
| H-C7 | from-video, captions `none`; `failed` | home is never asked |
| H-C8 | the helper's `handle`: no / wrong bearer; a bad or missing `v`; another path; POST; a good request | 401; 400; 404; 405; 200 with the `CaptionsResult` exactly as `readCaptions` returned it; the token in no log line |
| H-C9 | every result `readCaptions` produces (ok / blocked / none / failed — found by **calling** it over fake fetches) through `handle()` and then `readCaptionsFromHome` over a fake fetch serving `handle`'s answer | each accepted: `{ ok: true, text }` for a read, the result's reason for a failure |
| CJ-M | migration check (§4.2s) | as §4.2s (0020's own test, untouched) |
| CJ-D | migration check (§4.2t) | earlier rows survive; the four columns and the index are gone; `foreign_key_check` empty; `recipe_emojis` intact |

### 7E.3 Typing and editing

- `POST /recipes` and `PATCH /recipes/{id}` take `{ title, ingredients: string[], steps:
  string[], servings, time }` through `parseRecipeInput` (each line trimmed with inner whitespace
  collapsed, empty lines dropped, each length and count checked → 400 naming the field). PATCH
  merges over the stored recipe; the video fields, `source`, `captions_error` and `comments_error`
  never change by hand. A typed recipe has `source` `["typed"]`.
- **Add ingredients to Shopping** is the PWA calling the existing `POST
  /lists/{SHOPPING_LIST_ID}/items { text }` once per picked ingredient, in order (§8.12). There is
  no server bulk route. Every ingredient `cleanRecipeReading` or `parseRecipeInput` can produce is
  accepted by that route (R11).

### 7E.4 Acceptance (M4o — each row is a test)

| # | Setup / call | Expected |
|---|---|---|
| R1 | `youtubeVideoId` on watch?v=, youtu.be, /shorts/, /embed/, /live/, m., music., `&t=`, `?si=`, no scheme; a vimeo link, a 10-char id | the id for each YouTube form; null for the others |
| R2 | from-video with the keys empty | 503 `recipe_reading_off`; **zero fetches**; no read counted |
| R3 | from-video with an unreadable link; without a session | 400 / 401, no fetch |
| R4 | a link to a video that already has a live recipe | 409 `duplicate` with its `recipeId`; no read counted; no fetch |
| R5 | `RECIPE_READS_PER_DAY` reads already today, then one more | 429 with a message, no fetch |
| R6 | fake YouTube + fake captions + fake Anthropic | 201; ingredients and steps saved; source `description` + `captions`; one read counted |
| R7 | captions blocked | the recipe is still saved, from the description, with `captionsError` set |
| R8 | empty description and no captions | Claude is not called; saved `found: false`, no ingredients or steps, the video's title |
| R9 | Claude answers `found: false` with ingredients; a refusal; a failure | saved with none; 422; 502 — `cleanRecipeReading` trims and caps |
| R10 | PATCH a found:false recipe with ingredients; DELETE | found becomes true; the deleted one is gone from GET and its video may be read again |
| R11 | every ingredient `cleanRecipeReading` / `parseRecipeInput` produce from hostile input | each accepted by the real `POST /lists/{shopping}/items` |
| R12 | YouTube: not found / quota / network; captions: blocked / none / failed | the honest failure kinds, the key never in a reason |
| RC-M | migration check (§4.2p) | earlier rows intact; the unique index refuses a second live recipe per video |
| R13 | fake YouTube with a creator's comment (its author is the video's channel) and a viewer's comment | 201; source includes `comments`; Claude's text holds the creator's comment and not the viewer's; with no description and no captions, the creator's comment alone is enough to ask Claude |
| R14 | comments turned off (403 `commentsDisabled`); comments 500 | saved both times; `commentsError` null when turned off, the reason when it failed |
| R15 | `creatorComments`: viewers' comments; a null `channelId`; past `CREATOR_COMMENTS_MAX`; a cut at an emoji; `lookUpComments` ok / disabled / quota / network | only the creator's, in order; null; cut to the max; never half an emoji; the honest kinds, the key never in a reason |
| CM-M | migration check (§4.2r) | earlier rows intact; existing recipes have `comments_error` NULL |
| R16 | a "watch it" video recipe with captions failed; POST pasted text; POST two screenshots (fake YouTube, comments and Anthropic) | 200; ingredients and steps saved; source includes `transcript`; `captionsError` null; **no request to `/youtubei/v1/player`**; one read counted; Claude's text holds the cleaned transcript; for screenshots, Claude's request holds one image block per screenshot and the screenshots line |
| R17 | transcript on a typed recipe; nothing, empty or timestamps-only text; a HEIC or oversize screenshot; more than 4; text over `PASTED_MAX`; the daily cap used up; the keys empty | 400; 400 with no read spent and nothing fetched (each); 429; 503 with zero fetches |
| R18 | Claude answers `found: false` for a transcript (text and a screenshot) on a hand-edited recipe | 422 `no_recipe`; the row unchanged (the hand edits survive); the read counted |
| R19b | `parseScreenshots`: none; 4; each readable type; 5; HEIC; damaged base64; one byte over `PHOTO_MAX_BYTES` | []; 4; accepted; refused with a message each |
| R19 | `cleanTranscript` on a realistic copied YouTube transcript (timestamps on their own lines and inline, spoken durations, a chapter title); past `TRANSCRIPT_MAX` cut at an emoji; empty / only timestamps | speech and the chapter title kept, the rest gone; never half an emoji; null |
| R20 | every value `sourcesOf` can emit (found by calling it over every combination of inputs) | accepted by `recipeFromRow` and named in the view's `READ_FROM` |

### 7E.5 Each person's emoji — decided by MojoSOGO 2026-10-03

Each person can give a recipe **their own emoji** — any single emoji, or none — and change or
clear it later. It is personal: the row shows **mine**; the recipe view shows **everyone's**.

- **Stored** in `recipe_emojis` (§4.2q), one row per member per recipe. The emoji follows the
  event emoji rule: `emojiError` (§7.6, `src/shared/emoji.ts`) — one grapheme of emoji, at most
  `EMOJI_MAX_BYTES` = 16 bytes.
- `PUT /recipes/{id}/emoji { emoji }` sets **the signed-in member's** emoji (the member comes from
  the session, never the body) → 200 the recipe; an emoji `emojiError` refuses → 400
  `invalid_input` with its message. `DELETE /recipes/{id}/emoji` clears it → 200 the recipe
  (clearing one that isn't set is fine). A deleted recipe → 404 for both. Neither touches the
  recipe's `updated_at`: an emoji is not an edit of the recipe.
- **On the wire** every recipe carries `emojis: RecipeEmoji[]`, `RecipeEmoji = { memberId, emoji }`,
  ordered by member id — list, one, POST, from-video, PATCH and the emoji routes alike.
  `recipeFromRow(row, emojis = [])` keeps the rows for that recipe. The list fetches every live
  recipe's emojis in one more query.
- `myEmoji(recipe, memberId)` → my emoji or null.
- `byMyEmoji(recipes, memberId)` — the **By emoji** order ⚑ Q71: recipes grouped by **my** emoji;
  the biggest group first; equal groups by their newest recipe's `createdAt` (newest first), then
  by the emoji string; newest first within a group; recipes I haven't given an emoji go **last**, newest first.
  "Newest" is `createdAt`, then `id`, both descending — the server's list order.
- `usedEmojis(recipes)` — the household's emojis for the picker ⚑ Q72: every emoji anyone has put
  on these recipes, most used first (ties by the emoji string), at most 12 (`USED_EMOJIS_MAX`).

**Acceptance (M4p — each row is a test):**

| # | Setup / call | Expected |
|---|---|---|
| RE1 | PUT `{ emoji: "🌶" }`, then GET the recipe and the list | 200; my `{ memberId, emoji }` in `emojis` of both |
| RE2 | PUT "🌶" then PUT "⭐" | one row for me, "⭐" |
| RE3 | DELETE after a PUT | 200; my emoji gone from `emojis` |
| RE4 | PUT "ab", "🌶🌶", a string over 16 bytes | 400 `invalid_input` with `emojiError`'s message; nothing stored |
| RE5 | a second member sets theirs; I PUT and DELETE mine | theirs is untouched each time |
| RE6 | PUT / DELETE on a soft-deleted recipe | 404 |
| RE7 | an emoji PUT and DELETE | the recipe's `updatedAt` is unchanged |
| RE8 | `byMyEmoji` on groups of 2, 1, 1 (the two 1s with different newest) and unrated ones; equal groups with an equal newest | biggest first; ties by newest, then emoji; newest first within; unrated last, newest first |
| RE9 | `usedEmojis` on 14 distinct emojis across members, one used three times | that one first, ties by the string, 12 at most |
| RE-M | migration check (§4.2q) | earlier rows intact; the PK refuses a second row for one member and recipe |

### 7E.6 Reading any link — `POST /recipes/from-link { url }`

Asked by MojoSOGO 2026-10-05: "Recipe should also tolerate links from Facebook like
https://www.facebook.com/reel/1437627654879504/?fs=e&s=TIeQ9V&mibextid=wwXIfr … Autodetect link type. And if
I give a generic web page should also import." The rules live in `src/shared/recipe-link.ts` (pure); the
reading in `src/worker/recipe-link-reader.ts`.

**What kind of link** — `recipeLinkOf(text)` (pure) decides, in order:

1. `youtubeVideoId(text)` → `{ kind: 'video', videoId }`: read as §7E.2, unchanged;
2. `readableLink(text)` (§7C.4b: a public `http(s)` host, never an IP, localhost or a home name) →
   `{ kind: 'page', link }`, where `link` is **cleaned** ⚑ Q167: the fragment dropped; on Facebook's hosts
   (`facebook.com`, `www.`, `m.`, `web.`, `mbasic.`) the host becomes `www.facebook.com` and every query
   parameter is dropped but `v`, `id`, `story_fbid` and `fbid` (the share junk `fs`, `s`, `mibextid`,
   `rdid`, `share_url` goes); elsewhere tracking parameters are dropped (`utm_*`, `fbclid`, `gclid`,
   `mibextid`, `igsh`, `igshid`, `si`) and the rest kept. The cleaned link is what is stored and matched;
3. anything else → null.

`siteName(link)` names the site for `channel` and the view ⚑ Q168: Facebook, Instagram, TikTok, Pinterest
by host; otherwise the host without `www.`.

**`POST /recipes/from-link { url }`** — the one route the PWA calls; `POST /recipes/from-video` is the same
handler (a phone still running an older app keeps working). **Check order:**

1. signed in (401);
2. `recipeLinkOf(url)` → null: 400 `invalid_input` "That isn't a link that can be read."; a video: §7E.2
   from step 3;
3. a live recipe with that `link` → **409 `duplicate`** `{ error, message: "That link is already in
   Recipes: “…”.", recipeId }`; no read spent, nothing fetched;
4. the daily cap, shared with videos (`RECIPE_READS_PER_DAY`) → 429 `rate_limited`;
5. `ANTHROPIC_API_KEY` present (YouTube's key is not needed) → else 503 `recipe_reading_off` "Reading
   recipes from links isn't set up yet.", before any fetch;
6. the page, as §7C.4b fetches it (`fetchPage`, `pageExtract`): its title, meta tags, JSON-LD (a recipe
   site's `Recipe` block) and text. A failure (Facebook's login wall, a 403, a timeout) is **kept for the
   prompt, never fatal**;
7. count the read;
8. the look-up (`askClaudeResearch`, web fetch ≤ `RECIPE_LINK_FETCHES_MAX` = 2, web search ≤
   `RECIPE_LINK_SEARCHES_MAX` = 3): find the recipe **this link** gives — the page's recipe, or a post's
   or reel's caption, or the creator's own recipe for this same dish where the post points to it (their
   site, a pinned comment) ⚑ Q170 — as plain notes. Never another creator's recipe for the dish, never
   general cooking knowledge, never invented from the title; when it can't be found the notes say so.
   Refusal → 422 `recipe_refused` "Couldn't read a recipe from that link."; failure → 502
   `recipe_reading_failed` with the reason;
9. the fill (`askClaude` with §7E.2's recipe schema) from the page and the notes, same refusal / failure;
10. `cleanRecipeReading(raw, fallback)`, where the fallback title is the page's `og:title` or `<title>`,
    else "Recipe from {site}";
11. INSERT: `link`, `channel` = `siteName(link)`, no video, `source` = `sourcesOf` with the notes offered
    as `page` (`VideoText.page`), errors NULL (a unique-index race → 409 `duplicate`);
12. → **201** the recipe.

A link whose recipe can't be found is still saved, `found` false: the view says **"Recipe not found at that
link — open it"** with a 🔗 link, and offers **the transcript, by hand** (§7E.2b) for screenshots of the
post's caption or the recipe.

**Privacy:** the link and what the page says go to Anthropic, which may fetch the link and search the web
for it (as §7C.4b).

| # | Setup / call | Expected |
|---|---|---|
| RL1 | `recipeLinkOf` on a YouTube link, the Facebook reel link above, `m.facebook.com/watch?v=1&mibextid=x`, a recipe site with `?utm_source=x&id=7#top`, `localhost`, an IP, "hello" | video; `https://www.facebook.com/reel/1437627654879504/`; `https://www.facebook.com/watch?v=1`; the site link with `id=7` only; null; null; null |
| RL2 | `siteName` on Facebook, Instagram, `www.allrecipes.com` | Facebook; Instagram; allrecipes.com |
| RL3 | from-link with a recipe page (JSON-LD `Recipe`; fake site and Claude) | 201; ingredients and steps saved; `link` cleaned, `channel` the site, no video; source `page`; one read counted; the look-up has web search (3) and web fetch (2) and the page's JSON-LD |
| RL4 | from-link where the page answers 403 (a login wall) | still read: the look-up is told why; saved |
| RL5 | the same link pasted again (another tracking parameter) | 409 `duplicate` with its `recipeId`; no read; nothing fetched |
| RL6 | from-link with the Anthropic key empty (YouTube's key set or not); at the cap; an unreadable link | 503 / 429 / 400, nothing fetched, no read counted |
| RL7 | Claude finds no recipe; a refusal; a failure | saved `found: false` with the page's title; 422; 502 |
| RL8 | from-video with a page link | the same as from-link |
| RL10 | the video reading, the transcript re-read and a link's fill | each prompt carries `RECIPE_IN_ENGLISH` |
| RL11 | a transcript (a screenshot) on a typed recipe | 200; only Claude asked, with the typed title and "Site: (none)"; source `transcript`; YouTube's key not needed |
| RL12 | after RL11: GET its photo; read two more screenshots; then pasted text only | 200 with the first screenshot's bytes; the old object deleted, the new one served; unchanged |
| RL13 | PUT a picture twice, a GIF, on an unknown recipe; DELETE | 204 each, the old object deleted, `updatedAt` bumped, served; 400; 404; 204, gone, GET 404 |
| RL9 | a transcript (text or a screenshot) on a link recipe | 200; re-read with nothing fetched but Claude; source `transcript`; YouTube's key not needed |
| RL-M | migration check (§4.2zc) | as written there |

## 7F. Movies & shows — `src/shared/shows.ts` (pure) — asked by MojoSOGO 2026-10-05

The household's shared watch list: "we enter a show we want to see; you tell us how we can see it and what
the Rotten Tomatoes rating is — theater? streaming? which service?" — and sometimes all anyone has is a clip, a
link or a screenshot, and the first job is working out which show it is. Its loop: **heard of it → look it up →
want to see it → watched**. It reuses the link reader's plumbing (§7C.4b): the page fetch, `pageExtract`, Claude's
look-up with web search and web fetch, then a structured fill.

### 7F.1 A show

- **Title** 1–120 (required). **Kind** `movie` | `show` (`SHOW_KIND`) or unknown. **Year** ≤ 20, free text
  ("2024", "2019–2023").
- **Ratings:** Rotten Tomatoes **critics** (Tomatometer) and **audience** (Popcornmeter), each a whole percent
  0–100 or unknown ⚑ Q146.
- **How to watch** (`watch`): at most `WATCH_MAX` = 12 options, each `{ how, where, note }` — `how` one of
  `WATCH_HOW` = `theater` · `stream` · `tv` · `rent` · `buy`; `where` 1–100 (a service, a store, a channel or a
  theater's name: "Netflix", "Apple TV (rent $5.99)", "Regal Oceanside"); `note` ≤ 200 or null ("with ads",
  "4.1 mi · Mission Ave", "in theaters Nov 14"). Availability is **US-based** (`WATCH_COUNTRY` = `US`) ⚑ Q145; at
  most `THEATERS_MAX` = 3 theaters, the ones **closest to the household** (§7.7's place, Oceanside).
- **Checked** (`checkedAt`): when how to watch and the ratings were last looked up; unknown for one typed by hand.
- **Summary** ≤ 500 (what it is about). **Note** ≤ 2000 (the household's own). **Link** ≤ 500 through `webLink`
  (§7C.1) — the clip or page it came from.
- **Status** `want` → `watched` (`SHOW_STATUS`); a watched show can go back to `want`. Watching records who and when.
  **Delete** removes it (soft). **Anyone** may add, edit, mark watched or delete any show ⚑ Q154.
- **One per title:** the key is the title lower-cased with whitespace collapsed, plus the year. A second show with
  the same key (whatever its status) is 409 `duplicate` "{title} is already on the list." ⚑ Q152; the same title
  with another year is a different show (remakes).
- `shows.ts` owns: limits, `parseShowInput`, `showKey`, `showFromRow`, `bestWatch` (the row's option, §8.14) and
  `cleanShowReading` (§7F.2).

### 7F.2 Looking it up — `POST /shows/look-up`, `POST /shows/look-up-photo`

**Nothing is saved**: a look-up returns a `ShowReading`, the show form opens filled, the person checks it and
taps Save ⚑ Q151. Three ways in:

- **A title** — `{ title, year?, kind? }` (year and kind narrow it; Check again sends them).
- **A link** — `{ url }`, through `readableLink` (§7C.4b). The Worker fetches the page exactly as a thing's link
  reading does (`fetchPage`, `pageExtract`; a failure is kept as a reason, never fatal). The link is usually a
  clip, a trailer, a post or an article, so the first job is working out which show it is about.
- **A video's comments** (asked by MojoSOGO 2026-10-05: "you may need to read the comments to find out what it is"):
  for a YouTube link (`youtubeVideoId`, §7E.2) the Worker also asks the YouTube Data API (`YOUTUBE_API_KEY`, as
  recipes do) for the video's title, channel and description and its top `SHOW_COMMENTS_LOOKED_AT` = 20 comments
  by relevance ⚑ Q156, alongside the page fetch. They go to the look-up as their own section (`videoSection`,
  show-reading.ts): the description cut to `VIDEO_DESCRIPTION_MAX` = 3 000 characters, each comment to
  `COMMENT_MAX` = 500 and all of them to `COMMENTS_TEXT_MAX` = 6 000. A missing key, a failure or comments turned
  off is kept as a reason in that section, never fatal and never a 4xx. For any link, the prompt says viewers'
  comments often name the show, so a page Claude fetches is read for them too (other sites' comments are not
  fetched by the Worker).
- **A picture** — `POST /shows/look-up-photo` with a raw image body (a screenshot, a photo of a TV, a poster;
  `photoBody`, §7C.3). It goes to Claude as an image block with the look-up and is **never stored** ⚑ Q150. A video
  clip itself is not read ⚑ Q149: paste its link, or screenshot a frame.

`ShowReading` = `{ title, kind, year, rtCritics, rtAudience, watch, summary, note, url, checkedAt }` — `url` is
the pasted link (`webLink`) or null, never one the look-up found; `checkedAt` is the server's time; a `title` of
null means it couldn't tell which show it is.

- **Check order:** signed in (401) → the input (400 `invalid_input`: "Type a title or paste a link." for no title
  and no link, or both; "That link can't be read." for a link `readableLink` refuses; a picture as §7C.3) → daily
  cap (429, the **same 40-a-day `photo_reads` budget** ⚑ Q147) → key present (503 `show_lookup_off` "Looking up
  movies and shows isn't set up yet.") → count the read → (a link: fetch the page) → the look-up → the fill →
  refusal 422 `show_refused` "Couldn't look that up." / failure 502 `show_lookup_failed` "Couldn't look that up:
  {reason}" → `cleanShowReading` → 200.
- **The look-up** (`askClaudeResearch`, which now also takes content blocks before the prompt, for the picture):
  web search (`SHOW_SEARCHES_MAX` = 5 ⚑ Q148, `user_location` approximate with `country` `US` and the household
  zone) and web fetch (`SHOW_FETCHES_MAX` = 3), `pause_turn` continued as §7C.4b (`RESEARCH_TURNS_MAX`). The prompt
  (`showResearchPrompt`, `src/shared/show-reading.ts`) gives the title, link (and what the page said) or picture,
  today, and the household's place (`nearestTheaters`), and asks for plain notes: which movie or show it is (title,
  movie or show, year; when several match, the likeliest, the others named), the Rotten Tomatoes critics and
  audience percentages **as rottentomatoes.com shows them**, and how to watch it **in the United States now** — in
  theaters (then up to 3 theaters showing it closest to the household, each with its town and rough distance),
  streaming with a subscription (the service, and "with ads" or the plan when it matters), on live TV, to rent or to
  buy (the store, and the price when found); when it isn't out yet, when and where it's coming. A one- or two-line
  summary. **Only from what the page and the searches say, never guessed**; what can't be found is said so.
- **The fill** (`askClaude`, `showReadingSchema` in `show-reader.ts`): the notes → the reading's fields, `watch` in
  the order found, ratings as whole numbers, nulls for anything not found.
- `cleanShowReading` (pure) trims every field to its limit; `kind` must be in `SHOW_KIND`; a rating must be a whole
  number 0–100 (a string like "92%" is read as 92; anything else is null); a watch option with an unknown `how` or an
  empty `where` is dropped, repeats (same `how` and `where`, ignoring case) are merged, theaters past
  `THEATERS_MAX` and options past `WATCH_MAX` are dropped; `url` is the pasted link through `webLink`.
- **Honest failures:** a failed look-up is a 502 with its reason, even when the page was read. Nothing identified →
  200 with `title` null, and the screen says "Couldn't tell which movie or show that is."
- **Cost:** roughly a few cents a look-up (two requests, at most five searches at $10 per 1 000).
- **Privacy** ⚑ Q141 as for links: the title, link, page text or picture go to Anthropic, with today's date, the
  zone and the household's latitude / longitude (for the nearest theaters).

### 7F.3 Acceptance (M4x — each row is a test)

| # | Setup / call | Expected |
|---|---|---|
| W1 | POST "Dune" (movie, 2021, 🍅 83 / 90, watch Max stream, checkedAt) | 201; listed first under `want` with every field |
| W2 | empty title; `rtCritics` 101; a watch option with `how` `cable`; link `ftp://x`; 13 watch options | 400 `invalid_input`, the message names the field |
| W3 | POST " dune " 2021 again; then "Dune" 1984 | 409 `duplicate` "Dune is already on the list."; 201 |
| W4 | PATCH status `watched`; then `want` | `watchedAt` / `watchedBy` set and it lists under `watched`; both cleared, back under `want` |
| W5 | PATCH a title onto another show's key | 409 `duplicate` |
| W6 | DELETE | 204; gone from the list; GET → 404 |
| W7 | look-up `{ title: "Wicked" }` (fake Claude) | 200 cleaned reading with `checkedAt`, `url` null; one `photo_reads` row; nothing saved; the look-up carries web search (max 5, `user_location` country `US` + zone) and web fetch (max 3); its prompt names the title, "United States", Rotten Tomatoes and the household's latitude / longitude |
| W8 | look-up `{ url }` of a clip page (fake site) | the page's title and text are in the look-up's prompt; `url` is the pasted link |
| W9 | look-up-photo with a JPEG | the look-up's message carries the image block before the prompt; nothing stored in R2 |
| W10 | look-up `{}`, `{ title, url }`, `{ url: "http://192.168.0.1" }` | 400; no fetch, no read counted |
| W11 | no API key; at the daily cap | 503 `show_lookup_off`; 429 — neither fetches nor counts |
| W12 | refusal / failure from Claude | 422 `show_refused` / 502 `show_lookup_failed` with the reason |
| W13 | `cleanShowReading` on `rtCritics` "92%", `rtAudience` 140, kind `film`, a `cable` option, two "netflix" streams, four theaters, a 300-char title | 92, null, null, dropped, merged, three theaters, title cut to 120 |
| W14 | `bestWatch` on rent + stream + theater | the theater; stream before tv before rent before buy |
| W15 | look-up `{ url }` of a YouTube video (fake YouTube API: snippet + 3 comments, one naming the show) | the look-up's prompt carries the video's title, description and every comment; YouTube's key is never in the prompt; with no `YOUTUBE_API_KEY` the look-up still runs and its prompt says the comments couldn't be read |
| W-M | migration check (§4.2y) | 0026 is additive: earlier rows intact, `shows` exists empty, `PRAGMA foreign_key_check` empty |

---

## 8. Screens

General rules come from `MOJOSOGO-PREFERENCES.md`: chips are entities, badges are
statuses, modals are native `<dialog>` explicitly centred, failures render inside
the dialog with `role="alert"`, and there are no wizards.

**iPhone rules** (found 2026-10-03 on an iPhone 16 Pro Max — the ⋯ list options showed
only the grey backdrop):
- **Text fields are at least 16 px** (`input`, `select`, `textarea`). Below 16 px, iOS
  Safari zooms the page on focus and leaves it zoomed, so a centred dialog can open
  outside what the person is looking at.
- **Every modal renders at the document root** (a portal to `document.body`), never
  inside a screen's scrolling container — no ancestor's overflow, scroll or stacking can
  hide or clip it.
- **The cause, measured on the phone:** the dialog was 2 px tall and its panel 0 px.
  iOS Safari 26.6 sizes a `flex: 1` child (basis 0%) of a column flexbox whose height is
  not fixed as **zero**. Inside any box whose height comes from its content, flex
  children grow from `auto` (`flex: 1 1 auto`), never from 0. Chrome and desktop
  WebKit did not reproduce it — only the real phone did.

### 8.1 Frame

```
+-------------------------------------+
| RINGING BAR (only when something is ringing)                 |
+-------------------------------------+
| Sep 2026               [Today]      |  <- sticky month header
| ■ Public holiday  📈 Options         |  <- legend
|  S   M   T   W   T   F   S          |
|  ...continuous weeks...             |
+-------------------------------------+
| 📅 Calendar ⏰ Alarms 🧹 Chores 🛒 Lists 🍳 Recipes ⚙ Settings | <- tab bar
+-------------------------------------+
```

- **Six tabs** (since v1.28.0, ⚑ Q166): **🧹 Chores** (§8.15) sits between Alarms and Lists; 🍳 Recipes
  between Lists and Settings (v1.11.0, ⚑ Q60). The bar is a grid with one equal column per tab
  (`grid-auto-flow: column`), icon above label, so all six fit one line at 320 px without wrapping or
  truncating (labels .7rem).
- The **＋** floating button appears on Calendar only and creates an event. The
  Alarms tab has its own **＋ Add** button in each section header.
- **Status badges:**
  - A **red badge** appears in the header from `/status` `house.state` (§9.2), exactly as the
    server reports it — the PWA never re-derives it ⚑ (Q38):
    - `failing` → **"🔇 House failing"**; tapping it: "The last house announcement did not
      get through to Home Assistant (over the Cloudflare tunnel at ha.sogodojo.com), so
      alerts set to “House” may not be spoken. Check that Home Assistant and its Cloudflared
      add-on are running; the error is in Settings → Status. Alerts still show in the Ringing
      bar."
    - `not_configured` → **"🔇 House not set up"**; tapping it: "This server has no Home
      Assistant connection set up (the tunnel address, the HA token or the Cloudflare Access
      service token is missing), so alerts set to “House” are not spoken. Alerts still show
      in the Ringing bar."
    - `ok` and `untried` show no badge.
  - A **red badge** "Phone alerts off" appears when the current member has no push
    subscription.
  - Tapping either explains it and how to fix it.

### 8.2 Ringing bar

A stack at the top of every screen, one row per `ringing` fire, newest first:

- Reminder row: `🔔 Take out trash · 19:00` with **[Snooze 10m] [Done]** (an all-day event:
  `· all day`; a sun-timed one, §7.7: `🔔 Put the goats away · sunset` ⚑ Q56)
- Timer row: `⏱ Check on the dog · ringing 45 min` with **[Ack]**
- Chore row: `🧹 Laundry — Move to dryer · Sam` with **[Done]** (no snooze)
- Thing row: `📌 Fall fair · to do` with **[Snooze 10m] [Done]** ⚑ glyph
- Machine row: `🧺 Washer · Sam` with **[Move to dryer]** — it opens the same dryer-minutes
  chooser the Machines card uses (§8.5); `🧺 Dryer · Sam` with **[Fold & out]**. No Done:
  a machine fire is closed only by the `/machines` routes (§7D.2). ⚑ Q40
- Buttons are at least 44px tall. When the stack exceeds 3 rows it collapses to
  "3 more ringing ▾".

### 8.3 Day sheet

A modal that opens over the calendar and is titled with the date ("Tue, Oct 6").
It contains, in order:

1. The holiday line(s).
2. All-day events.
3. Timed events in time order, each showing time, title, creator chip, assigned
   chips and 🔔 if it has a reminder.

Tapping an event opens the event form. **＋ Add event** at the bottom pre-fills
the date.

### 8.4 Event form (modal)

Fields:

- Title
- Date
- All-day toggle
- Start / end time (hidden when all-day)
- End date (all-day only)
- Repeat: Never / Daily / Weekly (day checkboxes) / Every 2 weeks / Monthly on day N /
  Monthly on the nth weekday (e.g. "Monthly on the 3rd Friday", derived from the date) /
  **Monthly on certain weeks** — the date's weekday, with week chips **1st 2nd 3rd 4th
  Last** (at least one; the date's own week is pre-ticked), e.g. "Thursdays: 1st · 3rd" /
  Yearly, plus an optional end date
- Assigned to (member chips, none = everyone)
- **Emoji** (optional, §7.6): one emoji — typed with the phone's emoji keyboard — shown
  beside the title.
- **☐ Optional — each person turns it on** (creator or admin, §7.5). On an optional event
  the form also shows **☐ On for me** — every member's own switch. It takes effect the
  moment it is ticked (like the Settings switch), needs no Save, and stays usable for
  members who can't edit the event. ⚑
- **Reminder:**
  - None / At start / 5 / 15 / 30 / 60 min before / 1 day before / for all-day events
    **The evening before (8 pm)** (= 780 min before the all-day start of 09:00) ⚑
  - Channels: ☐ Phone ☐ House
  - Repeat alert every: Off / 5 / 10 / 15 / 30 min

Actions:

- **Save / Cancel**
- Delete (owner or creator)
- For a repeating event: **Delete this occurrence** (adds to `exdates`) and
  **Delete series**

### 8.5 Alarms screen

At the very top, under the "Alarms" heading: a **📢 Announce** button. It opens the
**announce box** (modal, titled "📢 Announce"): a one-line **Message** input (16 px,
`maxLength` = `ANNOUNCE_MAX`), the channel checkboxes (☐ 📱 Phone ☐ 🔊 House — the same
`ChannelChecks` as the alarm form, chosen each time; the box opens with **House ticked,
Phone unticked** ⚑ Q36) and **Send** / **Cancel**. Send is disabled while the message is
blank or neither channel is ticked. A refusal from the server shows inside the box; on
success the box closes (there is no toast in the app). What happens is §9.3.

Then three sections — Scheduled, Rolling timers, **Machines**. Scheduled and Rolling timers are
single-line lists (per the table rules), each with a **＋ Add** button in its header; Machines is two
fixed cards and has no ＋ Add. Chores moved to their own tab in v1.28.0 (§8.15).

**Scheduled** — one row per alarm, sorted by time of day, then title:

```
Time   Alarm                    Days            Next
07:30  Wake kids               Weekdays        [ringing]
08:00  💊 Morning meds          Every day       Wed 08:00
19:00  🗑 Take out trash         Tue             later
```

- **Days** text: all 7 → "Every day"; Mon–Fri → "Weekdays"; Sat+Sun → "Weekends";
  otherwise short names in week order ("Mon Wed Fri").
- **Next** = the alarm's next due time in household local time (weekday + time), or a
  red `ringing` badge **instead** while it rings. Fires are planned only 36 h ahead
  (§5.2), so an alarm with nothing planned yet shows a dim **later** (tooltip
  "Planned up to 36 hours ahead") — an honest gap, not a computed guess.
- Tapping a row opens the **alarm form** (modal): title · time · day chips (Sun…Sat,
  plus "Every day" / "Weekdays" shortcuts) · channels (☐ Phone ☐ House) · repeat
  alert every (Off / 5 / 10 / 15 / 30 min) · assigned to · Save / Cancel / Delete.
- Editing an alarm changes it **in place** — its future fires are re-planned
  (§5.6 event edits); nothing has to be deleted and re-created.
- At least one day must be chosen; the form says so in the dialog if not.

**Rolling timers** — as before: `⏱ Check on the dog · 60 min · 08:00–21:00`, a
status badge (running / ringing / stopped), **Next** and **[Start]/[Stop]**; tapping a row
opens the timer form (title, interval 1–1440 min, **Active from / to**, channels, repeat
alert every, assigned to, Delete).

- The row shows `· 08:00–21:00` after the interval only when the timer has an active time
  range (§4.2n).
- **Next** is the open fire's `due_at` from the server, in household local time; it names the
  day when that is not today ("Sun 09:00"), and shows just the time when it is. The app never
  re-derives a due time.
- **Active from / to** ⚑ Q50: two plain `<input type="time">` fields side by side on one
  line (16 px, fits 320 px), labelled "Active from" and "to". Both empty = always (no window).
  Filling only one, `from = to`, or an interval not shorter than the range is refused by the
  server; the message shows inside the form.

**Machines** — the laundry loop (§7D), right after Rolling timers. One card per machine, in
load order. Each card: the machine (🫧 Washer, 🌀 Dryer ⚑), a state badge (**free** neutral ·
**running** green · **DONE — waiting** amber), whose load and the done-at time, and its
actions on a second line. At 320 px:

```
Machines
Wash, move to the dryer, fold. Everyone hears when it's done.
🔔 Alerts sound weekdays 5:30pm–8:30pm, weekends 9:00am–9:00pm; outside those hours they wait. [Edit hours]
┌──────────────────────────────────────┐
│ 🫧 Washer  DONE — waiting   Kai·14:05 │
│ [Move to dryer] [Still loaded] [Clear]│
├──────────────────────────────────────┤
│ 🌀 Dryer   running          Sam·14:50 │
│                              [Clear] │
└──────────────────────────────────────┘
```

| State | Washer actions | Dryer actions |
|---|---|---|
| free | **[Start]** [Done now] | **[Start]** [Done now] |
| running | [Done now] [Clear] | [Done now] [Clear] |
| done | **[Move to dryer]** [Still loaded] [Clear] | **[Fold & out]** [Still loaded] [Clear] |

- **Alert hours** (§7D.5): one line under the heading. **Edit hours** (admins only) opens
  "Machine alert hours": Weekdays and Weekends, each two `<input type="time">` fields (16 px);
  both empty = any time. Save refuses from ≥ to inside the box.
- **Done now** (⚑ Q160) is for a load the app missed. On a free machine it opens the chooser
  titled "The washer is done": *Whose load?* (me preselected), then **[It's done]**. On a
  running machine it is one tap. Either way the done alerts start at once.
- **Still loaded** (⚑ Q159) restarts the reminders (§7D.2) with one tap, no confirm; the action
  line wraps at 320 px.

- **The chooser** (a modal, exported from `Machines.tsx` and reused by the Ringing bar): for
  **Start**, titled "Start the washer" — *Whose load?* one member chip per active member, **me**
  preselected; *How long?* the minute chips **30 · 45 · 60 · 90 min**. Tapping a minute chip
  starts the machine at once and closes the box: **two taps** from the card (Start → 60). For
  **Move to dryer**, titled "Move Sam's load to the dryer" — only the minute chips.
- Chips are at least 44 px tall; text is 16 px; nothing scrolls sideways at 320 px.
- A refusal (§7D.2) renders inside the chooser, or above the cards for Clear / Fold & out,
  with `role="alert"`. Clear asks once ("Clear the washer? Nothing will ring.").
- Done-at is household local time; the cards re-read `/machines` on every app refresh.

**The chore list** — on the 🧹 Chores tab since v1.28.0 (§8.15), under "All chores", with its own
**＋ Add**. One line per chore, sorted by time:

```
Time      Chore            Days        This week
07:30 at  🧺 Laundry ³     Mon Thu     Sam
19:00 by  🗑 Trash          Tue         Kai → Sam
```

- `at`/`by` after the time; a superscript step count when there is more than one step; 📋 after the
  title when the chore has areas (§7B.6).
- **This week** = whose turn it is now; when people take turns, `→` the next person.
- Tapping a row opens the chore's **What done looks like** sheet (§8.15); its **✎ Edit chore** opens the
  **chore form** (modal):
  - Title · **Done means…** (one line, e.g. "Bins at the curb, lids shut")
  - Days (chips Sun…Sat, plus "Every day" / "Weekdays")
  - **When:** ( ) **At** a time — it rings · ( ) **By** a time — quiet; ☐ nudge then
  - Time
  - **People:** member chips; the order you tap is the turn order. With two or more:
    "Takes turns, changing every Sunday."
  - **Steps:** one row per step — title · "then ring the next step after ___ min"
    (optional) · who (whose turn / a member chip). **＋ Add step** (max 6). A new chore
    starts with one step named after the title.
  - Channels (☐ Phone ☐ House) · Repeat alert every (Off / 5 / 10 / 15 / 30 min) ·
    Save / Cancel / Delete (creator or owner, like alarms). Delete asks "Delete chore "{title}" and what
    done looks like for it?" (§7B.6).

### 8.6 Settings

- **Me:** **Optional calendar items** — Public holidays, 📈 options expiration, then one line
  per optional event (emoji, title, how it repeats), each with an **On** switch (§7.5); name,
  color, enable phone alerts (subscribe), **🔊 Speak my alerts on** (§9.2a),
  log out.
- **Household (admins):** name, timezone, days off (§7.3), **invites (§8.9)**, members list:
  one line per member — name · **Owner** / **Admin** chip (nothing for a regular member) ·
  **Make admin** / **Remove admin** (asks first; never on the founder) · **Disable** /
  **Enable** (never on the founder). An admin removing their own admin role is warned
  that they will lose these settings at once.
- **Status:** a **House announcements** line from `house` (§9.2) ⚑ (Q38): `ok` → "working"
  (good) with the last success time; `failing` → "failing since {lastFailedAt}" (bad) with
  `lastError` beneath; `not_configured` → "not set up" (bad); `untried` → "not tried yet"
  (neutral). Then the current member's push subscriptions with last
  success/error, and the last 20 deliveries with their status badge.

### 8.8 Lists screen

The **🛒 Lists** tab. At the top, a **list button** showing the chosen list with its emoji and count,
and **⋯** beside it. Asked by MojoSOGO 2026-10-05: there are too many lists for the phone's wheel, so the
picker is a **popup of buttons** (a titled "Lists" modal):

```
[ 🛒 Shopping (3)           ▾ ] [⋯]

┌ Lists ─────────────────────── ✕ ┐
│ [✅ Things to do (4)] [🎬 Movies & shows (6)]│
│ [🛒 Shopping (3)]  [🎁 Wish list (5)]   │
│ [🔨 Hardware store (1)]          │
│ [＋ New list…]                   │
└─────────────────────────────────┘
```

- **Tapping 🛒 Lists in the bottom tab bar opens the popup** ⚑ Q158 — from another tab, and again while on
  Lists. Opening the app on the Lists tab (the tab is remembered) shows the remembered list with no popup.
  Tapping the list button opens it too.
- Buttons in a two-column grid (one column under 360 px), each ≥ 44 px, emoji then name then the open count:
  **✅ Things to do** first (§8.11), **🎬 Movies & shows** second (§8.14) ⚑ Q157 (Today's chores moved to the
  🧹 Chores tab in v1.28.0, §8.15; a device that remembered Today shows Shopping),
  then every list by name with `listEmoji` (§7A.1), then **＋ New list…**. The chosen list's button is marked
  (`aria-pressed`, accent border), so the remembered list is the default: closing the popup (✕, Escape, a tap
  outside) stays on it. Tapping a button opens that list and closes the popup.
- **＋ New list…** opens the **new list** form (Name, Emoji — optional, placeholder shows the default for the
  name typed — Create; errors inside the dialog); after creating, that list opens.
- **⋯** (accessible name "List options") next to the list button opens **Rename**, **Emoji** (empty = the
  default from the name) and **Delete list** for the chosen list, shown only to those allowed (§7A.1) and never
  for Things to do or Movies & shows. Delete asks first and says how many open items go with it.
- The choice is remembered per device (by list id), written only when someone picks. If
  the remembered list no longer exists — including the old toggle's `shopping`/`wishlist`
  values — the list button shows **Shopping** (or the first list, if Shopping was deleted).
- Errors: a missing list is 404 "That list no longer exists."; a refused rename/delete is
  403 naming who may ("Only the person who made this list or an admin…", or "Only an
  admin…" for a seeded list). A list's name is trimmed before its length is checked. The list refetches when the tab opens, on focus, and
every 30 s while visible (§10 Freshness).

**Any list** (all alike — Q24):

```
[ Add to Shopping…          ][📷][ Add ]
☐ Milk                       Kai      ✎
☐ Dish soap              📷           ✎
☐ Paint the fence     📝     Shelly   ✎
▸ Done (12)
```

- The add box is at the **top**, always visible, its placeholder naming the list. Enter or
  **Add** adds the item, clears the box, and keeps focus, so several items go in one after
  another.
- Adding something already open says so under the box in plain text (“Milk is already
  on the list”) — a fact, not an error. Re-opening says “Milk is back on the list”.
  The note clears on the next typing, tick or edit.
- **📷** beside **Add** on every list (accessible name "Snap an item") — snap an item (§7A.3). It picks a
  photo (the phone offers the camera or the library), shrinks it as a thing's photo is (§7C.3) and sends it
  to `POST /list-items/read-photo`, busy ("Reading the photo…") until the answer. The name **replaces**
  whatever is in the box ⚑ Q118, with the hint **"Read from your photo — check it."** under it ⚑ Q117 (`via`
  is never shown). A refusal shows as an error; the photo still waits, so the name can be typed instead.
  Nothing is added until **Add**.
- The **waiting photo** shows as a small thumbnail beside 📷 with **✕** ("Drop the photo") ⚑ Q120. Emptying
  the box, ✕, or switching list drops it. Editing the text keeps it (the hint goes).
- After **Add** succeeds — added, re-opened or already there alike — the waiting photo is PUT to that item,
  replacing any older photo ⚑ Q119, and the thumbnail goes. If the PUT fails: "{item} was added, but its photo
  wasn't saved: {reason}. Open ✎ to add it again."
- Open items: most recently added or changed first (so a re-added item comes back to
  the top), one line each. **Tapping the row ticks it** (≥ 44 px); a ticked item leaves
  the open list straight away. The row shows 📝 when there is a note, **📷** when there is a
  photo (§7A.3, "Has a photo") ⚑ Q121, and the
  **assignee's chip** when there is one (the chip truncates; the row stays one line).
- **✎** on each row (accessible name "Edit Milk") opens the **item form** (modal): text,
  note (multi-line), **Assigned to** (member chips, single choice, plus **Nobody**), Save /
  Cancel / **Delete** (asks first). The old ✕ quick-remove is gone: ticking is the quick
  action, and deleting lives in the form. ⚑
- The item form shows the item's **photo** (§7A.3) when it has one — tap for full size — with
  **Replace photo** / **Remove photo**, or **📷 Add photo** when it has none ⚑ Q121. A photo added here is
  not read ⚑ Q122. The photo saves on **Save**, after the item's fields: a new one is PUT, a removed one
  DELETEd. A photo-only change counts as a change. The image URL carries `?v={updatedAt}` so a replaced
  photo is never shown stale from the private cache.
- The item form has no Mark done / Not done: ticking is the row's tap, everywhere.
- **Done** is collapsed by default and dim, newest first. Tapping a done row puts it back
  on the list; its ✎ still opens the form. A done row shows who ticked it and when (in
  place of the assignee chip, so it stays one line):
  weekday within the last 6 days (“Sat · Shelly”), else the date (“Sep 12 · Shelly”).
- No due dates and no reminders on any list.

### 8.10 Installed app (PWA) and always-fresh

**Installing** — Ensō is saved to the home screen (iPhone: Share → **Add to Home Screen**;
Android: **Install app**) and opens full screen, like a native app. It looks exactly like
the web page — same design, nothing reinvented.
- `manifest.webmanifest`: `name` and `short_name` **Ensō**, `start_url` and `scope` `/`,
  `display: standalone`, `background_color` and `theme_color` `#0F172A` (`--bg`), icons
  `icon.svg` (any size) plus `icon-192.png` and `icon-512.png`.
- iPhone: `apple-touch-icon` is a **180 px PNG** (iOS ignores SVG there); `apple-mobile-
  web-app-capable` / `mobile-web-app-capable` `yes`; `apple-mobile-web-app-title` **Ensō**;
  status bar `black-translucent` — the app already pads by the safe-area insets.
- The PNG icons are rendered from `icon.svg` — the same artwork, never redrawn.

**The mark** (decided by MojoSOGO 2026-10-03): an **ensō** — one brush stroke round, thick
where the brush lands and tapering as it lifts, left **open at the top right** (the
traditional unfinished circle). Off-white ink (`--text` #F8FAFC) on the app's navy
(`--bg` #0F172A). It is **our own drawing** (`frontend/public/icon.svg`, generated once by
`scripts/draw-enso.mjs`), not a stock image — a stock logo needs its licence bought first.
It replaces the old calendar icon everywhere: home-screen icon, favicon, opening screen.

**Opening screen** — shown from the very first frame until the app is ready, and for at
least 0.8 s so it never flickers:

```
            ◯   (the ensō, large)
           Ensō
   https://enso.sogodojo.com
      v0.2.0 · a99e5db
```
- Centred on `--bg`: the ensō, **Ensō** in a large, light-weight serif-free type, and the
  **full address the app is served from** (`location.origin`, so the home-network server
  shows its own) in small dim text, and under it the **build stamp** — `v{version} ·
  {commit}` (decided by MojoSOGO 2026-10-03): the app version from `package.json` and the
  short git commit the page was built from, written into the page **at build time** (never
  typed by hand). A build from a tree with uncommitted changes shows `{commit}-dirty`; a
  build with no git at all shows `unknown build` — never a plausible-looking guess.
  **App version policy** (decided by MojoSOGO 2026-10-03): `1.0.0` at go-live; each merged
  feature bumps the minor (`1.1.0`, `1.2.0`, …), each fix-only merge bumps the patch. The
  version lives only in `package.json` (the stamp reads it); the spec's own version line is
  separate and counts spec revisions.
  Nothing else — no spinner, no tagline.
- One source: the screen is plain HTML in `index.html`, outside the React root, so it
  appears before any script loads; `App` removes it when ready (signed in or not).
- iPhone shows its own launch image before the page exists: `apple-touch-startup-image`
  PNGs of this same screen are rendered for current iPhone sizes (portrait), with the
  production address. The PNGs are rendered from `index.html`'s screen, never drawn
  separately — **without** the build stamp (a launch image is not rebuilt per commit, so a
  stamp in it would soon be wrong).

**Always fresh** (decided by MojoSOGO 2026-10-03: "always force refresh on open and app pull
down"). Fresh means the newest build *and* the newest data, i.e. a full page reload.
- **Opening** from the home screen loads fresh by construction: the page is served
  `must-revalidate`, and the service worker (§9.1, push only) has **no fetch handler**, so it
  never serves or caches the app; `sw.js` itself is served `Cache-Control: no-cache`.
- **Coming back** to the app (it was in the background — another app, the lock screen) →
  the page reloads. **Except while a dialog is open**: a half-filled form, or an invite
  card that can never be shown again (§8.9), is never thrown away. The reload then happens
  the next time the app comes back with no dialog open. ⚑
- **Pull down to refresh**, on every screen: when the screen's scroll area is at its very
  top, dragging down shows a small pill at the top — "↓ Pull to refresh", then at 72 px
  "↻ Release to refresh"; releasing past that reloads the page; releasing short of it does
  nothing. Not inside dialogs. The pill uses the existing surface/text tokens.
- Owner: `frontend/src/components/AppRefresh.tsx`, mounted once at the app root (signed in
  or not).

**Acceptance (M4f — manual on the iPhone):** Add to Home Screen shows the Ensō icon and
name; it opens full screen; deploy a change, switch away and back → the change is there;
pull down on Lists → it reloads; open ✎, switch away and back → the dialog is still there.

### 8.11 Things to do (Lists → Things to do)

```
[ ＋ Add a thing to do ]
Fall fair            Oct 10 – 20       📷 ⏰
Science museum       until Nov 5       📷
Kayaking             any time
Pumpkin patch        📅 Sat Oct 12
▸ Done & let go (3)
```

- Open things (ideas and planned) sorted by when they end — soonest first, any-time last.
  A row: title, the window ("Oct 10 – 20", "until Nov 5", "from Oct 3", "any time") or for
  a planned one 📅 its date, 📷 when there is a photo, ⏰ when a reminder is set. One line.
- **＋ Add a thing to do** and tapping a row open the **thing form** (modal):
  - **📷 Add photo** (camera or library) → a thumbnail; then "Reading the photo…" and the
    empty fields fill in, each marked *from photo — check it*. Remove / replace photo.
  - **🔗 Fill in from this link** (asked by MojoSOGO 2026-10-04), a full-width button right under
    **Link**, shown when the field holds a link `webLink` accepts ⚑ Q142. Tapping it shows "Reading the
    link…", then the empty fields fill in, each marked *from link — check it*; nothing filled → "Nothing
    new found at that link."; a failure shows its message. Nothing is saved until Save.
  - Title · From / To dates (both optional) · Place · Address · Phone · Cost · Link · Note.
  - **Every text field grows to fit its text** (auto-sizing, no inner scrolling), so all of a
    long title, address, cost or note is visible at once (decided by MojoSOGO). Phone is a
    single line (`type="tel"`); the others wrap. In **Title** and **Link** Enter does nothing
    and a pasted line break becomes a space (they are single values) ⚑; in Place, Address,
    Cost and Note Enter adds a line.
  - **Open from the form** (asked by MojoSOGO 2026-10-03): the fields stay editable, and
    beside **Link**, **Address** and **Phone** sits a 44 px button, shown only when the field
    has something usable — **↗** opens the link in the browser (only when `webLink` accepts it,
    so a half-typed link shows none), **🗺️** opens the address in the maps app (Apple Maps on
    iPhone/iPad, Google Maps elsewhere ⚑), **📞** calls the number (`tel:`, digits and a
    leading + only; shown when it has at least 3 digits). They use what is in the field now,
    saved or not. Placement to the right of the field ⚑ DEFAULT.
  - **Reminders:** ☐ When it starts · ☐ On [date] · Phone / House.
  - **Plan it** → a date (+ optional time) → creates the calendar event (§7C.2).
  - **Done** / **Let it go** / **Put back** (by status) · Save / Cancel / Delete (asks).
- Tapping the photo thumbnail shows it full size (inside the dialog).
- A thing ending in the past stays listed until done or let go — no red, no nagging (§1.0).

### 8.12 Recipes (the 🍳 tab)

```
[ Paste a recipe link…          ] [Read it]
[ ＋ Type a recipe ]
[thumb] Chicken tikka masala
[thumb] Sourdough focaccia        [watch it]
        Lentil soup
```

- **Paste box** (`type="url"`, 16 px), "Paste a recipe link…" (YouTube, Facebook or any page; the kind
  is detected, §7E.6) and **Read it** → `POST /recipes/from-link`. While it works: "Reading the link…"
  (it can take a while). The new recipe is **saved at once** and its
  view opens with its source note; ✎ fixes anything wrong ⚑ Q61. A refusal or failure shows in
  place (`role="alert"`) with the server's message.
- **A link already read** (409 `duplicate`) opens the existing recipe instead ⚑ Q63 (matched by video,
  or by `recipeLinkOf`'s cleaned link).
- **Newest | By emoji** — two chips above the rows ⚑ Q74. Newest is the server's order; By emoji
  orders them with `byMyEmoji` (§7E.5) — the PWA never sorts any other way. The choice is
  remembered on that phone (`localStorage` `enso.recipeSort`; blocked storage means Newest).
- **Rows**, newest first ⚑ Q62: a small thumbnail (64×36, hotlinked, `loading="lazy"`,
  `referrerPolicy="no-referrer"`; a typed recipe keeps the slot empty), the dish's name on one line,
  and a **watch it** badge when a video's recipe has `found` false (**open it** for a link's, §7E.6) (a typed recipe has no video to
  watch, so never shows it). **My emoji** (§7E.5), when I've given one, sits before the dish's
  name. Tapping a row opens the **recipe view**.
- **＋ Type a recipe** opens the **recipe form** empty.
- **Recipe view** (modal, `RecipeView.tsx`), titled with the dish:
  - **everyone's emoji**, "Shelly 🌶 · John ⭐", in the household's member order; a member the PWA
    can't find reads "Someone" ⚑ Q73;
  - **Your emoji** (`RecipeEmoji.tsx`) ⚑ Q72: the household's emojis as chips (`usedEmojis`; tap one
    to set it, mine shown pressed), a one-emoji input (16 px) with **Set**, and **Clear** when I have
    one → `PUT` / `DELETE /recipes/{id}/emoji`. A refusal shows in place (`role="alert"`) with the
    server's message; the updated recipe goes back to the view and the row;
  - **the kept screenshot** (⚑ Q174), when there is one, first and whole (never cropped, at most 420 px
    tall), in place of the thumbnail; the row's small picture is the screenshot too, also **whole** — scaled
    down inside the same 64 × 36 slot, never cropped, so every row keeps one height (asked by MojoSOGO
    2026-10-05 ⚑ Q176);
  - the thumbnail, full width, and **▶ Watch on YouTube** (opens the video, a new tab);
    the channel; servings and time when stated;
  - the **source note** ⚑ Q64 ⚑ Q81, muted: "From the " + what was read, each named — description,
    captions, "the transcript you added" (screenshots or pasted text), "the creator's comment" — joined as "A, B and C" ("From the description, captions and
    the creator's comment", "From the description", "From the creator's comment") / "Typed by
    hand" / "Nothing in the video's text to read", plus "· captions couldn't be read: {reason}" and
    "· comments couldn't be read: {reason}" when those happened;
  - `found` false: **"Recipe not in the video's text — watch it"** above the ▶ link;
  - **a link recipe** (§7E.6) has no thumbnail: `found` false reads **"Recipe not found at that link —
    open it"**, then **🔗 Open on {site}** (the link, a new tab); the source note reads "From the linked
    page";
  - **The transcript, by hand** (`RecipeTranscript.tsx`, §7E.2b), under the source note, only on a
    video or link recipe that is "watch it" / "open it" or whose `captionsError` is set ⚑ Q87 (never on the paste-a-link
    step ⚑ Q91): **📷 Add transcript screenshots** — a file input (`accept="image/*"`, `multiple`; on
    the iPhone it offers Photo Library or Take Photo), each picture shrunk to a JPEG like a thing's
    photo (§8.11, the same HEIC handling), up to 4 ⚑ Q92 (more are left out, and it says so), shown as
    thumbnails each with a ✕ (44 px); the hint "On YouTube: ⋯ → Show transcript, then screenshot it."
    ⚑ Q90 (on a link recipe: "Screenshot the post's caption or the recipe, then add it here.", and the
    button reads 📷 Add screenshots); below it **or paste the text**, collapsed, which opens a box that grows to fit (`Grow`,
    16 px, line breaks kept) ⚑ Q94; and, once there is a screenshot or text, **Read it** → `POST
    /recipes/{id}/transcript`. While it works: "Reading…". When the recipe already has ingredients or
    steps it says "This replaces the ingredients and steps shown." A refusal shows in place
    (`role="alert"`) with the server's message; the re-read recipe goes back to the view and the row;
  - **Ingredients**, each with a pick box; a **Pick all** chip; **Add to Shopping (n)**. Nothing
    is picked at first ⚑ Q69. Adding calls `POST /lists/{SHOPPING_LIST_ID}/items` once per picked
    ingredient, in order; the summary shows inside the view: "Added 4 · Milk already on the list"
    (`added` and `reopened` count as added, `existing` as already there). On a failure it stops and
    names what wasn't added: "Added 2 · Not added: Eggs, Flour — {error}";
  - **Steps**, numbered; then **✎ Edit** and **Close**.
- **Recipe form** (modal, `RecipeForm.tsx`): **📷 Add photo** first (asked by MojoSOGO 2026-10-05: "I just
  wanna show the picture of the screenshot… I'm not doing a recipe import" ⚑ Q175) — the thing form's
  `PhotoField` (camera or library, shrunk to JPEG, thumbnail, Replace photo / remove), **nothing read**; on Save,
  after the fields, `PUT /recipes/{id}/photo` (or `DELETE` when removed), new recipes included; a failure keeps
  the form open, saved, with "Saved, but the picture didn't save: …". The picture is the same one a screenshot
  read keeps (⚑ Q174) and shows the same way. Then Title · Ingredients (one per line) · Steps (one per
  line) · Servings · Time. Title, ingredients and steps grow to fit (`Grow`). Save / Cancel /
  Delete (asks; existing recipes only). On an **existing** recipe of any kind, under the fields, **Fill in
  from screenshots** (asked by MojoSOGO 2026-10-05: "In recipes edit, let me add a screen shot" ⚑ Q173):
  the same `RecipeTranscript` as the view (📷 Add screenshots, "or paste the text", Read it → `POST
  /recipes/{id}/transcript`); a typed recipe's hint reads "Screenshot or photograph the recipe, then add it
  here." The re-read recipe is handed back as saved (the view opens with it); unsaved typing in the form
  is replaced. A new recipe is saved first, then edited, to take screenshots. The video, its title and the source are not editable.

### 8.9 Invites (owner) and the join page

**In Settings → Household → Invites:**

```
Invite someone   [ Their name…        ][ Invite ]

Kai        waiting · until Sat Oct 10        [Revoke]
Shelly     joined Oct 4
Sam        expired
```

- One line per invite, newest first: name · state — **waiting** (with its expiry,
  amber), **joined** (with the date, green), **expired**, **revoked** (neutral). When the
  member chose a different name it shows dimmed in the name column ("Kai → Kai B"), which
  truncates, so the row stays one line at 320 px. Only waiting invites have **Revoke**
  (asks first).
- On the plain-HTTP home-network address the browser offers no clipboard and no share
  sheet, so **Copy link** goes straight to the selected-link fallback and **Share…** is
  hidden — expected, not a bug.

**The invite card** opens as soon as an invite is created (modal, centred):

```
        Invite for Kai
   ┌───────────────────┐
   │   ▓▓ QR code ▓▓   │     ← scan with the phone's camera
   └───────────────────┘
 [ Share… ]  [ Copy link ]
  or type on the sign-in page:
       ABCD-EFGH-JKMN
  Works once · until Sat Oct 10
```

- **QR** of the link, large enough to scan from across a table (≥ 220 px), dark
  modules on a white quiet zone so phone cameras read it in dark mode too.
- **Share…** uses the phone's share sheet (`navigator.share`, text "Join our household
  on Ensō" + the link); hidden where the browser has no share sheet. **Copy link**
  copies it and says "Copied" for a moment; if copying is blocked, the link is shown
  selected so it can be copied by hand — never a silent failure.
- **A link only this computer can open is flagged.** When the app itself is open at
  `localhost` / `127.0.0.1`, the link and QR point there too and no phone can use
  them. The card then says so above the QR, as a warning: "This link points to this
  computer only — phones can't open it. Open Ensō at this computer's network address
  (e.g. http://192.168.0.72:8787) and create the invite there." The code still works
  typed on any device that can reach the app.
- The code in large monospace, for typing.
- **This card is the only time the link exists** (the server keeps only a hash). The
  card says so: "Shown once — keep this open until they have it." Closing it asks first.

**The join page** (`/join#CODE`, the screen the link opens — no account needed):

```
           Ensō
  MojoSOGO invited you to join
            Home

  Your name   [ Kai              ]
  Email       [                  ]
  Password    [            ] 👁   (10+ characters)
         [ Join Home ]
  Already have an account? Sign in
```

- Fetches the preview first. The name is pre-filled from the invite (editable).
  Password has a show/hide toggle (accessible name "Show password").
- A link that no longer works says so plainly, in place of the form: "This invite link
  doesn't work any more — it may have been used, expired or been cancelled. Ask
  {invitedBy, when known, else "the person who invited you"} for a new one." plus
  **Sign in** for people who already joined.
- Errors (email taken, password too short) show inside the form with `role="alert"`.
- If the preview cannot be fetched at all (network or server failure), the page says
  "Could not check this invite: …" with **Try again** — it does not claim the link is dead.

**Welcome card** (once, right after joining; remembered per member per device):

```
  Welcome, Kai 👋
  📅 Calendar — what's happening
  ⏰ Alarms — alarms and timers
  🧹 Chores — your chores today and what done looks like
  🛒 Lists — shopping and the rest
            [ Got it ]
```

### 8.13 Sign in with my phone — the two screens (§6.6)

**On the sign-in page** (`SignIn.tsx` hosts `PhoneSignIn.tsx`; sign-in mode only): under **Sign in**, a second
button **📱 Sign in with my phone**. It uses the same Email field (the password is not needed); with no email it
says "Enter your email first." in the form's alert. Tapping it replaces the form's body with the waiting view:

```
            Ensō
   Check your phone
            42                 ← the match, very large
  Tap 42 on your phone to sign in here.
  Waiting… (until 10:44)
          [ Cancel ]
```

- It polls `GET /auth/phone-login` every 2 s. `approved` → signed in (`onSignedIn(await get('/me'))`).
  `denied` → "Refused on your phone — nobody was signed in." `expired` → "No answer in 2 minutes." Both
  with **Try again** (a new request) and **Back** (the password form). A failed poll shows its message in place
  with **Try again**. **Cancel** stops polling and goes back; the request just expires.

**The approve screen** (`ApproveLogin.tsx`, the page the push opens: `/approve-login#{id}`, a **full page** ⚑,
not a modal, signed in only):

```
            Ensō
   Signing in somewhere?
   Chrome on Windows
   Oceanside, US · 10:42
  Tap the number shown on that screen:
     [ 17 ]  [ 42 ]  [ 88 ]
       [ This wasn't me ]
```

- The id is read from the fragment and kept in `sessionStorage` (`enso.approveLogin`), and the address loses
  the fragment at once. If this phone's session has expired the sign-in form shows first ⚑; the kept id brings
  the approve screen back right after signing in.
- Three number buttons (44 px tall at least) and **This wasn't me**. After a tap the screen says, in place:
  approved → "Done — that screen is signing in now."; denied by a wrong number → "That wasn't the number on the
  screen, so the sign-in was refused. If it was you, start again there."; "This wasn't me" → "Refused — nobody
  was signed in."; already answered → "This request was already answered."; expired → "This request has
  expired."; not found → "This sign-in request isn't for you, or it is gone." Each with **Done**, which forgets
  the id, sets the address to `/` and shows the app.
- Opened when the request is no longer pending, it says so at once (the same texts) without the buttons.

### 8.14 Movies & shows (Lists → Movies & shows, §7F)

A picker option on the 🛒 Lists tab, third, after Things to do ⚑ Q144 — not a new tab.

```
[ A title, or paste a link…   ][📷][ Find ]
Dune: Part Two  2024      🍅 92%  📺 Max
Wicked  2024              🍅 88%  🎟️ In theaters
The Bear  show            🍅 99%  📺 Hulu
Hoosiers  1986            🍅 —    💵 Rent
▸ Watched (4)
```

- **The box** (placeholder "A title, or paste a link…", accessible name "Movie or show") takes a title or a link:
  text starting `http://` or `https://` is a link, anything else a title ⚑. **Find** (or Enter) looks it up
  (§7F.2); **📷** (accessible name "Find from a picture") picks a picture (camera or library), shrinks it as a
  thing's photo is (§7C.3) and looks it up. While it works the box says "Looking it up…" and Find is disabled.
- A reading with a title opens the **show form** filled, with "Found by looking it up — check it before saving." at
  the top ⚑; the box clears when the form saves. A reading with no title says "Couldn't tell which movie or show
  that is." under the box; a failure shows its message there. The text stays in the box either way, and typed text
  gets **Add it by hand** under the message, which opens an empty show form with the text as its Title (or Link, for
  a link) — so a show can always be added, looked up or not.
- **Rows** (want): newest added first, one line: the title, then the year (or "show" for a show without a year),
  🍅 and the critics % ("🍅 —" when unknown), and the **best** way to watch (`bestWatch`: theater, then stream, tv,
  rent, buy ⚑ Q155) as its glyph and `where` — 🎟️ "In theaters" for a theater, 📺 a stream (the service), 📡 tv (the
  channel), 💵 rent or buy (the store) — or "—" when nothing was found. Tapping a row opens its form.
- **Watched** is collapsed by default, newest watched first; a row there shows who watched it and when, in place of
  how to watch ("Oct 4 · Shelly").
- **The show form** (modal; "New movie or show" / "Edit: {title}"):
  - Title · **Movie / Show** (two chips, neither = unknown) · Year.
  - **Rotten Tomatoes:** 🍅 Critics % · 🍿 Audience % (numbers 0–100, empty = unknown).
  - **How to watch:** one line per option — glyph, `where`, and its note dimmed — each with **✕** (accessible name
    "Remove {where}"). None: "Nowhere found yet." Under it, muted: "Checked {Oct 4}" or "Not looked up". Options
    are not typed by hand in v1 ⚑ Q153 (the note is there for that).
  - **🔄 Check again** (full width, shown when Title holds something) looks it up by the form's title, year and kind,
    busy "Looking it up…", then **replaces** the ratings, how to watch and Checked, and fills Summary only when
    empty. It counts as one read. Nothing is saved until Save.
  - Summary · Link (↗ beside it, as the thing form's) · Note — growing text fields as §8.11.
  - **Watched** (a want show) / **Want to see it again** (a watched one) — each saves and closes · Save / Cancel /
    **Delete** (asks first). A 409 `duplicate` shows inside the form.

### 8.15 Chores (the 🧹 tab) — asked by MojoSOGO 2026-10-05

"Chores needs its own section." The **🧹 Chores** tab holds everything about chores that used to be split between
Alarms → Chores and Lists → Today ⚑ Q166: **Today** at the top (ticking off is the daily use), then **All chores**
(the chore list of §8.5, with ＋ Add), and from either, a chore's **What done looks like** sheet.

**Today** — a switch **Mine | Everyone** (default Mine; remembered):

```
☐ Laundry — 2/3 Move to dryer   rings 08:40  Sam  📋
   Lint filter cleaned, nothing left in the drum
☐ Trash                         by 19:00     Kai  📋
   Bins at the curb, lids shut
▸ Done today (2)
```

- One row per run of today; **Mine** = runs whose current step is mine (or whose turn
  it is, when the step has no person of its own). Sorted by time.
- Row: title, then `— n/m step title` for multi-step chores; when: `at 07:30`,
  `by 19:00`, `rings 08:40` (a pending wait) or a red `ringing` badge; the person's
  chip. **Done means** is the dim second line. **📋** (accessible name "What done looks like for Laundry",
  ≥ 44 px) when the chore has a Done means or areas: it opens the sheet below.
- Tapping the row marks the **current step** done (≥ 44 px). A ↶ button (accessible
  name "Undo last step of Laundry") appears on runs that have a step done.
- **Done today** is collapsed by default; its rows show who finished (`doneBy`), are
  not tappable (another Done would only be refused), and keep ↶ to undo the last step.
- Nobody's turn shows as **anyone**.
- Nothing from earlier days, nothing red except `ringing` (§1.0).

**All chores** — the chore list and chore form of §8.5, under the heading "All chores" with **＋ Add**.

**What done looks like** — a sheet (modal) titled with the chore's title, opened by a row of All chores or a
Today row's 📋:

```
┌ Kitchen ─────────────────────────── ✕ ┐
│ Done means: counters clear, sink empty  │
│                                         │
│ Sink                                 ✎ │
│ [photo] [photo]                         │
│ ☐ No dishes left in the sink            │
│ ☐ Faucet wiped dry                      │
│                                         │
│ Counters                             ✎ │
│ ☐ Nothing on them but the toaster       │
│                                         │
│ [＋ Add an area]                         │
├─────────────────────────────────────────┤
│ [✎ Edit chore]                [Close]   │
└─────────────────────────────────────────┘
```

- **Done means** first, when there is one; then each area in order: its name, its photos as thumbnails (tap for
  full size, as §8.8's item photo), and its expectations as a checklist. With no areas: "Nothing here yet. Add an
  area — a part of the job, with photos of it done right and what to check."
- Ticking an expectation is only for walking through the job: ticks are kept while the sheet is open, never
  saved ⚑ Q165.
- **✎** on an area (accessible name "Edit Sink") and **＋ Add an area** (hidden at 8) open the **area editor** in
  place of the sheet's body: Name (one line, `maxLength` 40), **Expectations** (a growing box, one per line,
  the placeholder "One per line, e.g. No dishes left in the sink"), **Photos** (thumbnails each with ✕
  "Remove photo n", and **📷 Add photo** while fewer than 4, shrunk as a thing's photo, §7C.3), then
  **Save** / **Cancel**, and **Delete area** (asks first) for a saved one. Save sends the area (POST or PATCH),
  then each new photo, then each removed photo's DELETE; a refusal shows inside the sheet and keeps the editor
  open. Cancel with changes asks "Discard your changes?".
- **✎ Edit chore** opens the chore form (§8.5) in place of the sheet.
- Anyone in the household may change what done looks like ⚑ Q163.

### 8.15a Whose mess? — the banner and the Messes section (§7B.7)

**The banner** — on every screen, under the Ringing bar (§8.2), one row per mess I am still asked about:

```
🧽 Sam cleaned up a mess (Kitchen): pans on the stove. Was it yours?  [photo]  [That was me] [Not me]
```

- The photo is a small thumbnail (tap for full size). The two buttons are ≥ 44 px. Answering removes the row.
- It is not red and makes no sound; it stays until I answer, even while the mess is on To talk about.

**Messes** — a section of the 🧹 Chores tab between Today and All chores:

```
Messes                                    [📸 Report a mess]
Waiting for answers
  [photo] Kitchen: pans on the stove · Sam cleaned this up · 10:42
          Not me: Kai                       [That was me] [Not me]
To talk about
  [photo] Living room · Shelly cleaned this up · yesterday
          Whose was it? [ Pick ▾ ]   (admins only)
Balances
  Kai owes you 2                                         ▸
  You owe Sam 1                                          ▸
```

- **📸 Report a mess** opens a sheet: **📷 Add photo** (required; the phone offers camera or library; shrunk as a
  thing's photo, §7C.3, and shown once taken), **Which chore?** (a select of the chores, "None" first), **Note** (one line, `maxLength` 120), then
  **Report** / **Cancel**. A refusal shows inside the sheet.
- Each mess row: its thumbnail, the chore and note, "{reporter} cleaned this up" ("You cleaned this up" for mine),
  and when. Who said Not me shows as a dim line. My buttons as on the banner when I am asked.
- **Whose was it?** (admins, on every row of Waiting for answers and To talk about): a select of the active members
  other than the reporter, and **Nobody's**; choosing one records it (§7B.7) after asking "Record that this was
  Kai's?" / "Close this mess as nobody's?".
- ✕ **Delete** (accessible name "Delete this mess") on my own unanswered messes, and on every mess for admins;
  it asks first.
- **Balances**: one line per pair (`balances`), "{name} owes you n" / "You owe {name} n", or for an admin's view of
  others "{name} owes {name} n". Nothing to show → "Nobody owes anybody." Tapping a line opens its owed messes, each
  with its photo, note and date, and — for the one owed or an admin — **Paid back** and **Let it go**. An admin
  also sees **Whose was it?** there, to correct one (⚑ Q182).
- Nothing in red; the section reads the same for everyone apart from the buttons a person may use.

### 8.7 Theme

Dark by default. Colors are defined as tokens on `:root`:

| Token | Value |
|-------|-------|
| `--bg` | `#0F172A` |
| `--surface` | `#1E293B` |
| `--border` | `#334155` |
| `--text` | `#F8FAFC` |
| `--text-dim` | `#94A3B8` |
| `--accent` | `#6366F1` (indigo) |
| `--month-a` | `#0F172A` |
| `--month-b` | `#162033` |
| `--holiday-public-cell` | `rgba(250, 204, 21, .16)` — a faint yellow tint over the dark cell, the same 16% strength as a multi-day event's tint; normal light text |
| `--holiday-public-swatch` | `#FACC15` — the legend's public-holiday square |

---

## 9. Delivery

### 9.1 Web Push — phone notifications

Each person turns phone alerts on **once per phone**, in Settings → Me (decided by MojoSOGO
2026-10-03: Web Push through the installed app, not SMS).

**Turning it on** (`frontend/src/…` — placement decides):
- A **Phone alerts** row in Settings → Me shows this phone's state, honestly:
  - **On for this phone** (with **Send a test** and **Turn off**);
  - **Off** — **Turn on**;
  - **Blocked** — the phone's settings deny notifications for Ensō (say where to change it);
  - **iPhone: add Ensō to the Home Screen first** — iOS allows push only in a home-screen
    app (shown when on iOS and not running standalone);
  - **Not supported in this browser.**
- **Turn on** runs from the tap itself (iOS requires a user gesture):
  `Notification.requestPermission()` → `registration.pushManager.subscribe({ userVisibleOnly:
  true, applicationServerKey: VAPID public key })` → `POST /push/subscriptions`.
- **Turn off** unsubscribes and `DELETE`s the subscription by its id. To know which of my
  subscriptions is **this phone**, `POST /push/subscriptions` returns `{ id }` (the upserted
  row) and `/status` `mySubscriptions[]` carries each `endpoint`; the row matches this
  browser's current `pushManager` subscription endpoint against that list.
- The "📵 Phone alerts off" badge (§8.1) stays until this member has at least one subscription.

**Service worker** — `frontend/public/sw.js`, plain static JS, registered on app start with
`{ scope: '/', updateViaCache: 'none' }` and served `Cache-Control: no-cache`:
- **No `fetch` listener at all** → it never caches or serves the app (§8.10 always-fresh).
  Not `vite-plugin-pwa`/Workbox, which precaches the shell by default.
- `push` → **always** `showNotification` (iOS revokes permission for a push that shows
  nothing): `title`, `body`, `tag: p.tag || p.fireId || 'enso-test'` (a re-alert replaces
  the old one; the `fireId` fallback keeps a payload from before `tag` working), `icon:
  /icon-192.png`, `data: { fireId, url }`, `actions` (ignored on iOS).
- `notificationclick` → with an action: `POST /api/v1/fires/{id}/actions {action}` (same-origin
  cookie) and close; without an action but with `data.url` (a sign-in request, §6.6): focus an open app window
  and `navigate(url)` it, or — when there is none, or it cannot be navigated — `openWindow(url)`; otherwise
  focus the open app or open `/`.

**Payload** (JSON, encrypted): `{ fireId, kind, tag, title, body, actions, url }`, under Apple's 4 KB:
`title` **"Ensō"**, `body` = the delivery's `message` (already "Reminder: …", "Chore for
Sam: …"), `kind` from the delivery's fire, `actions` from the engine's `pushActions(kind)` —
the same table the Ringing bar's buttons follow. ⚑
**`tag`** — what the phone collapses notifications by: a fire's push →
its `fireId` (a re-alert replaces the last one); a delivery with no fire (an announcement,
§9.3) → its **delivery id**, so two announcements never replace each other; the test push →
`'enso-test'`. A delivery with no fire has `fireId: null`, `kind: null`, `actions: []` and the
title of the row (`deliveries.title`, written only by `/ops/notify`, §9.4), or else
**"📢 Announcement"** (`ANNOUNCE_TITLE`, §9.3).
**`url`** — where tapping the notification goes: the delivery's `deliveries.url` (written only by a sign-in
request, §6.6: `/approve-login#{id}`); `null` on every other push (a fire's, an announcement's, a ping's, the
test push, a `new_sign_in` notice). A sign-in notice is a fire-less delivery with its own `title`
(`NOTICE_TITLE`) and `notice` set; its `message` never contains the match number.
Actions: reminder and thing `done` + `snooze`; timer `ack`; chore `done`. iPhone shows no
buttons — tapping opens the app, where the Ringing bar has them; expected, not a bug.

**Sending** (`tick` step 3, and `POST /push/test`):
- `buildPushPayload` with `ttl: 3600`, `urgency: 'high'`, and **no `Topic` header**: Apple's push
  service refused every push carrying one (`400 BadWebPushTopic`, found 2026-10-03 — `enso-test`
  and delivery ids alike), and it is optional. The phone still collapses by `tag`.
- **VAPID header cached per push-service origin for ~1 hour** — Apple: don't refresh the JWT
  more often than hourly. (The library signs per send by default; use its `vapidHeaders`.)
  The cache lives in the Worker instance's memory, so a cold start signs afresh — still well
  within Apple's rule; persisting it would need a table and nothing asks for that.
- **Keys missing** (no `VAPID_PRIVATE_KEY` or subject) → each push delivery `failed` with
  detail `push_not_configured` — never a quiet success.
- One delivery row per recipient as today; each of that member's subscriptions is sent to.
- **Results:** 201 → delivery `sent`, subscription `last_ok_at`; **404/410** → delete that
  subscription (it is gone); any other status → delivery `failed` with status + body in
  `detail` and the subscription's `last_error`; **no subscriptions** → `failed`,
  `no_subscription` — never skipped silently. Several subscriptions: `sent` if any succeeded.
- **Send a test** (`POST /push/test`): one push to *my* subscriptions now — body "Ensō test —
  phone alerts work", the tag `'enso-test'`, no actions — so a person can check a phone without waiting
  for a reminder. → `{ sent: n }`; 409 with a message when I have no subscriptions.

**Acceptance (M5):**

| # | Call | Expected |
|---|---|---|
| P1 | `GET /push/vapid-key` | the configured public key; `null` (and the row says "not set up") when unset |
| P2 | subscribe, list, delete | stored per member; `DELETE` of someone else's → 404 |
| P3 | a ringing reminder for A (one subscription) with an outbound fetch mock returning 201 | one POST to the endpoint with `content-encoding: aes128gcm` and `authorization: vapid t=…, k=<public key>`; delivery `sent` |
| P4 | the mock returns 410 | subscription deleted; delivery `failed`, detail names 410 |
| P5 | the mock returns 500 | delivery `failed` with status + body; `last_error` set |
| P6 | a member with no subscription | delivery `failed`, `no_subscription` |
| P7 | two sends to the same origin within the hour | the same VAPID JWT is reused |
| P8 | `POST /push/test` | a push to each of my subscriptions; 409 with a message when I have none |
| P9 | the encrypted body decrypts (test-side RFC 8291 decryptor) to the payload JSON | equal |

Manual on the live site: iPhone home-screen app → Turn on → Send a test arrives; a reminder
arrives on the lock screen; tapping opens the Ringing bar. Android: Done/Snooze work.

### 9.2 House delivery — `src/worker/house.ts`

The Worker speaks every `house` delivery itself, through Home Assistant's REST API at
`HA_URL` — a **Cloudflare Tunnel** (HA's Cloudflared add-on) behind **Cloudflare Access**
(§2). There is no process at home besides HA (decided by MojoSOGO 2026-10-03; the LAN relay
is retired). `house.ts` is the sibling of `push.ts`: no Hono, and it never decides *what* is
sent — `tick` and `POST /announce` write the rows, `house.ts` delivers them.

**Settings** — all seven are required (§2.4). `houseConfigOf(env)` returns them, or `null`
when any is missing or empty (`ECHO_TARGETS` must be a non-empty list of strings):

| Setting | Kind | Value |
|---|---|---|
| `HA_URL` | var | `https://ha.sogodojo.com` (tests: `https://ha.test`) |
| `ECHO_TARGETS` | var (JSON array) | `["Game Room", "Kid's Room - Echo", "Sogo", "Toasty"]` |
| `ECHO_TYPE` | var | `announce` |
| `SATELLITE_ENTITY` | var | `assist_satellite.home_assistant_voice_09eb97_assist_satellite` |
| `HA_TOKEN` | secret | HA long-lived access token |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | secrets | the Access service token |

With no config, every house delivery the drain would take becomes `failed` with detail
**`house_not_configured`**, and nothing is fetched — visibly failed, never quietly queued.

**`sendHouseDeliveries(env, now, ids?)`** — the drain. Called by tick step 4 (§5.6) with no
`ids`, and by `POST /announce` with the new house row's id only (§9.3).
1. **Exhausted rows fail.** A `house` row with `attempts ≥ 3` that is `queued`, or `claimed`
   with `claimed_at` more than 2 min old (stale), becomes `failed` with detail
   `COALESCE(detail, 'house delivery never finished after 3 attempts')`.
2. **Pick** up to **5** `house` rows that are `queued` or stale-claimed (oldest first; only the
   given `ids` when passed).
3. **For each, one after another — claim, then speak.** The claim is conditional, per row,
   made just before speaking:
   `UPDATE deliveries SET status='claimed', claimed_at=?, attempts=attempts+1, updated_at=?
   WHERE id=? AND channel='house' AND (status='queued' OR (status='claimed' AND claimed_at < stale))`
   and the row is spoken **only if `meta.changes === 1`**. Two drains that pick the same row
   (a tick and an announcement, or two ticks) speak it once. A row whose isolate dies
   mid-speech stays `claimed` and is retried after 2 min — at most 3 attempts in all.
4. **Speak** — on the row's speakers (§9.2a): `speakers` NULL → the default speakers
   (`ECHO_TARGETS` and `SATELLITE_ENTITY`); otherwise its `media_player.*` ids are the Echo
   `target` and its `assist_satellite.*` ids the Voice PE `entity_id` (a list). A surface with no
   speaker in the row is **not called**. The surfaces that are called run in parallel:
   - Echos: `POST {HA_URL}/api/services/notify/alexa_media`
     `{ "target": ECHO_TARGETS, "message": message, "data": { "type": ECHO_TYPE } }`, timeout
     **15 s**.
   - Voice PE: `POST {HA_URL}/api/services/assist_satellite/announce`
     `{ "entity_id": SATELLITE_ENTITY, "message": message }`, timeout **25 s** ⚑ (Q37) — it
     takes about 8 s; 25 s (not the relay's 30 s) keeps a call inside the Worker's ~30 s
     `waitUntil` budget.
   - Every request carries `CF-Access-Client-Id`, `CF-Access-Client-Secret`,
     `Authorization: Bearer <HA_TOKEN>`, `Content-Type: application/json; charset=utf-8`
     (UTF-8 JSON — `Kid's` has an apostrophe), and `redirect: 'manual'`.
   - **Only a 2xx is ok.** Access answers a request without a valid service token with a
     **302 to its login page**; with `redirect: 'manual'` that is a non-2xx, so it is a
     failure with its status in the detail — never read as success.
   - A surface's result is `"ok"`, `"HTTP <status>: <body, first 200 chars>"`, or
     `"error: <message>"` when the call throws (timeout, DNS, tunnel down). A token is never
     logged or written into a detail.
5. **Record** — `classifyHouse(results)` over the surfaces that were called: all ok → `sent`;
   some → `partial`; none → `failed`. Its type is `Exclude<DeliveryStatus, 'queued' | 'claimed'>`
   — only a finished status. `detail` = `{"echo":…,"voice_pe":…}` with only the called surfaces,
   each `"ok"` or `"<error>"`.
   **A classified `failed` is final** (HA or the tunnel was down): it is not retried —
   retries cover only stale claims.

**`houseState(env)`** → `/status` `house` = `{ state: HouseState, lastOkAt, lastFailedAt,
lastError }`, **derived from the deliveries table, never stored**:
- `not_configured` — `houseConfigOf(env)` is null;
- `untried` — no finished (`sent` / `partial` / `failed`) house row yet;
- `failing` — the newest finished house row (by `updated_at`) is `failed`;
- `ok` — the newest is `sent` or `partial`.

`lastOkAt` / `lastFailedAt` are the newest `updated_at` of a `sent`/`partial` / `failed` house
row (or null); `lastError` is the newest failed row's `detail` (or null).

**Setup** (README): HA runs the **Cloudflared** add-on, publishing `ha.sogodojo.com`, and its
`configuration.yaml` has `http: use_x_forwarded_for: true` with
`trusted_proxies: [172.30.33.0/24]` (the add-on network). Cloudflare Access protects
`ha.sogodojo.com` with a **Service Auth** policy for the Worker's service token. The three
secrets are set with `wrangler secret put`.

**Acceptance (M6 — each row is a test, `test/house.test.ts`):**

| # | Check | Expected |
|---|---|---|
| H1 | `classifyHouse` over all four boolean pairs | exactly `{sent, partial, failed}`, each a `DELIVERY_STATUS` |
| H2 | a house row drained with a fake HA at `https://ha.test` | two POSTs: `/api/services/notify/alexa_media` with `target` = `ECHO_TARGETS` (incl. `Kid's Room - Echo`, UTF-8) and `data.type` = `ECHO_TYPE`; `/api/services/assist_satellite/announce` with `entity_id` = `SATELLITE_ENTITY`; both bodies = the message; all three auth headers and `Content-Type: application/json; charset=utf-8` on each; the row → `sent`, detail `{"echo":"ok","voice_pe":"ok"}`; a House timer rung by tick step 4 is spoken the same way |
| H3 | Access answers 302 (both), or one surface 500 | 302 → `failed`, detail `HTTP 302: …` on both; Echos 500 + Voice PE ok → `partial`; a throw → `"error: …"`; a classified `failed` is not retried; no detail holds a token |
| H4 | any of the seven settings missing | the row → `failed`, `house_not_configured`; **zero** fetches |
| H5 | a row `claimed` 3 min ago with attempts 1 | reclaimed, spoken, `sent`, attempts 2 |
| H6 | a stale-claimed row with attempts 3 | `failed`, `house delivery never finished after 3 attempts`; not spoken |
| H7 | two drains at once over one queued row | spoken exactly once (one Echos POST, one Voice PE POST) |
| H8 | `/status` `house.state` | `untried` → (a `sent` row) `ok` → (a `failed` row) `failing`; with a setting missing, `not_configured` |
| H9 | migration 0013 | the settings row survives; `relay_last_seen` is gone (§4.2l) |

**Latency budget:** cron granularity (≤ 60 s) + Voice PE (~8 s). An announcement is spoken
right away (§9.3).

### 9.2a Each person's speakers — `🔊 Speak my alerts on`

Decided by MojoSOGO 2026-10-04: in Settings → Me each person ticks the house speakers they want to be
alerted on, from the list Home Assistant has. A private bedroom speaker then never announces something
for someone who is never in that room.

**A speaker** is a Home Assistant entity id, its kind derived from its prefix (`SPEAKER_KIND`, §3):
`media_player.<slug>` → `echo` (an Echo, Alexa Media Player), `assist_satellite.<slug>` → `satellite`
(the Voice PE). Nothing else is a speaker. A slug is `[a-z0-9_]+`.

**Rules** (pure, owner per placement):
- `SPEAKERS_MAX = 20` ⚑.
- `speakerKind(id)` → `'echo' | 'satellite' | null`.
- `speakersError(v)` → a message or `null`: `v` is `null` (back to not chosen), or an array of at most
  `SPEAKERS_MAX` distinct strings, each with a kind. An empty array is allowed: **no speaker** ⚑ Q128.
  Message: "Speakers must be a list of Home Assistant speaker ids, or null."
- `speakersFor(choices)` — the speakers of one house delivery, from the choices (`string[] | null`) of
  everyone it is for: **any `null` → `null`** (someone has not chosen, so the default speakers) ⚑ Q125;
  otherwise the **union**, in first-seen order ⚑ Q126. **No one at all** (an alert whose assigned members
  are all disabled, which today is still spoken) → `null`, the default speakers, as before. A stored
  choice that `speakersError` refuses is read as `null` (writes are validated, so it can only be hand-made).
- `splitSpeakers(ids)` → `{ echo: string[], satellite: string[] }` by kind.
- `speakerList(text)` → `Speaker[]` (`{ id, name, kind }`) or `null`: parses Home Assistant's answer
  (below), keeps the entries whose `id` has a kind and whose `name` is a non-empty string (else the id),
  drops duplicate ids, orders Echos first, then by name. Not a JSON array → `null`.
  **Not speakers** (decided by MojoSOGO 2026-10-04): Alexa Media Player also lists the Alexa apps, so an entry
  named `This Device`, or whose name contains `Alexa App`, is dropped (case-insensitive) ⚑ Q130. Fire TVs, the
  Echo Show and the `Everywhere` group stay.

**Machine alerts are the exception** (§7D.3): they are spoken on every listed speaker, not on anyone's choice.

**Who a house delivery is for** is the audience tick already computes (`audience(…).push`, §7.5: active
members, narrowed to the assigned ones, and for an optional event to those who have it on). An
**announcement** is for every active member ⚑ Q127 (it has no assignment). The writer reads those members'
`member_prefs.house_speakers` and stores `speakersFor(…)` on the row as JSON (NULL stays NULL).
**`speakersFor` = `[]` → no house row is written**: nobody it is for wants it spoken ⚑ Q128. The fire still
steps and push still goes out. For an announcement with House alone ticked, that is **409 `no_speakers`**
"Nobody has a house speaker ticked." — nothing would be spoken, so it says so.

**`GET /house/speakers`** (member) — the list to tick from, asked of Home Assistant **live** (never stored):
- House not configured (`houseConfigOf` null) → **503 `house_not_configured`**, before any fetch.
- One `POST {HA_URL}/api/template` through Access (§9.2 headers, timeout 15 s), body `{ "template": … }`:
  ```jinja
  {%- set ns = namespace(out=[]) -%}
  {%- for e in integration_entities('alexa_media') | select('match', 'media_player[.]') -%}
    {%- set ns.out = ns.out + [{'id': e, 'name': state_attr(e, 'friendly_name') or e}] -%}
  {%- endfor -%}
  {%- for s in states.assist_satellite -%}
    {%- set ns.out = ns.out + [{'id': s.entity_id, 'name': s.name}] -%}
  {%- endfor -%}
  {{ ns.out | tojson }}
  ```
- A non-2xx or a throw → **502 `house_unreachable`** with the reason (no token in it). An answer
  `speakerList` cannot read → 502 `house_unreachable` "Home Assistant's speaker list couldn't be read."
- → 200 `{ speakers: Speaker[], mine: string[] | null, defaults: string[] }`: `mine` is the member's own
  choice; `defaults` the default speakers as they are configured (`ECHO_TARGETS` names, then
  `SATELLITE_ENTITY`), so the screen can say honestly what "not chosen" means.

**`PATCH /me { houseSpeakers }`** — the member's own list only ⚑ Q129 (`speakersError` → 400
`invalid_input`). It is not checked against Home Assistant: the house may be unreachable, and an id HA
no longer lists is shown as such and fails visibly when spoken. `GET /me` carries `houseSpeakers`.

**The screen** (`🔊 Speak my alerts on`, Settings → Me, below Phone alerts):
- One line per speaker from `GET /house/speakers`: a checkbox, the name, and a dim `Alexa` / `Voice PE`
  (an `echo` speaker may be a Fire TV or an Echo Show, so the screen says Alexa).
  Ticking or unticking saves at once (`PATCH /me` with the whole new list).
- **Not chosen** (`mine` null): every box is unticked, and a dim line says "Not chosen: alerts for you
  are spoken on the default speakers ({defaults joined with ', '})." The first tick makes a list of one.
- **Nothing ticked** (`mine` = `[]`): a dim line says "No speaker: alerts only for you are not spoken."
- A chosen id the list no longer has shows as its own line, ticked, with "(not in the house any more)".
- **Use the defaults** — a link shown only when `mine` is not null; sets it back to null.
- 503 → "House isn't set up." 502 → "Couldn't reach the house: {message}", with **Try again**; the saved
  choice is not touched.
- One line per row at 320 px; the checkbox's tap target is the whole line (44 px).

**Acceptance (HS — each row is a test):**

| # | Check | Expected |
|---|---|---|
| HS1 | `speakerKind`, `speakersError` | `media_player.game_room` echo; `assist_satellite.voice_pe` satellite; `light.x`, `media_player.Game Room`, `""` null; null ok, `[]` ok, 21 ids / a duplicate / a light / a non-array → message |
| HS2 | `speakersFor` | `[null]` and `[['a'], null]` → null; `[['a','b'], ['b','c']]` → `['a','b','c']`; `[[], []]` → `[]`; `[]` → null |
| HS3 | `speakerList` on an HA answer with two Echos, the Voice PE, a `light.*`, a duplicate, a blank name, `This Device`, `Tostig's Alexa App for PC`; on `"oops"` | Echos first by name, then the satellite; the light, duplicate and both app entries gone; the blank name → the id; `null` |
| HS4 | `GET /house/speakers` against a fake HA | one POST to `/api/template` carrying the template and the three auth headers; 200 with the list, `mine` null, `defaults`; not configured → 503 and zero fetches; HA 500 / 302 / not JSON → 502 `house_unreachable` |
| HS5 | `PATCH /me { houseSpeakers }` | a list saved and back on `GET /me`; `null` clears it; a bad list → 400 and nothing saved |
| HS6 | tick: a fire for A (chose Game Room + Voice PE) and B (chose Sogo) | one house row, `speakers` = the union; the drain sends Echo `target` = [game_room, sogo] and Voice PE `entity_id` = [voice_pe]; `sent` |
| HS7 | tick: a fire for A alone, A chose only Echos | the Voice PE is not called; detail has only `echo`; `sent` |
| HS8 | tick: a fire for A and C, C has not chosen | `speakers` NULL; spoken on `ECHO_TARGETS` + `SATELLITE_ENTITY` (H2 unchanged) |
| HS9 | tick: a fire for A alone, A chose `[]` | no house row; the push row still written; the fire steps |
| HS10 | `POST /announce` House with A `[game_room]`, B `[sogo]`, C disabled `[toasty]`; with everyone `[]` | one house row on game_room + sogo (not toasty); everyone `[]` + House only → 409 `no_speakers`, nothing written; with Phone too → 201, push rows only |
| HS-M | migration 0024 | earlier rows intact, both columns NULL; `foreign_key_check` empty |

### 9.3 Announcements — `src/shared/announce.ts`, `POST /announce`

A member sends a house announcement **now** from the Alarms tab (§8.5; decided by MojoSOGO
2026-10-03). An announcement is a **delivery with no fire** (§4.2k): it rides the house delivery
(§9.2) and push sending (§9.1) that alerts already use. Nothing rings, nothing is done or
acked, nothing is scheduled — **now only**.

**Rules** (`src/shared/announce.ts`, pure, imports only `vocab`):
- `ANNOUNCE_MAX = 200` ⚑ characters, counted after trimming.
- `announceError({ text, channels })` → a message, or `null`: `text` a string, trimmed
  length 1…`ANNOUNCE_MAX`; `channels` a non-empty array of distinct `CHANNEL` values (at least
  one of Phone / House).
- `announceMessage(name, text)` → **`"{name} says: {text}"`** (text trimmed), e.g.
  "Shelly says: Dinner is ready". This one string is what the house speaks and the push shows.
- `ANNOUNCE_TITLE = "📢 Announcement"` — the push title.

**`POST /announce { text, channels }`** (member):
- The sender's name is the **session member's** `display_name` — never taken from the body.
- One `db.batch`:
  - **House** ticked → one `house` delivery: `fire_id NULL`, `member_id NULL`,
    `alert_number 1`, `message` = `announceMessage(…)`, `speakers` = the union of every active
    member's choice (§9.2a), `queued`. The Worker speaks it exactly like a House alert (§9.2),
    **right away**: after
    the 201 body is read, `c.executionCtx.waitUntil(sendHouseDeliveries(env, now, [houseId]))`
    — a drain restricted to that one row, so the speaker does not wait for the next tick.
  - **Phone** ticked → one `push` delivery per member of `audience(…).push` (§7.5 — with no
    assignment, every active member) **except the sender** ⚑, same `message`, `queued`.
- Then the push deliveries are sent at once with `sendPushDeliveries` (§9.1): each ends `sent`
  or visibly `failed` (`no_subscription`, `push_not_configured`, a push-service error) — a
  member without a phone gets the honest failed row, as alerts do.
- → **201** `{ deliveries: { id, channel, memberId, status }[] }`, read after sending push and
  **before** the house row is spoken (push rows final, the house row `queued`). Every row also shows in Settings → Status.
- 400 `invalid_input` with `announceError`'s message. **409 `no_recipients`** when only Phone
  is ticked and there is no other active member — nothing would be sent, so it says so.

**The push:** `{ fireId: null, kind: null, tag: <delivery id>, title: "📢 Announcement", body:
"Shelly says: Dinner is ready", actions: [] }`; tapping it opens the app.

**Acceptance (M4k — each row is a test):**

| # | Check | Expected |
|---|---|---|
| AN1 | `announceError` / `announceMessage` | `"  hi "` ok; `""`, blanks, 201 chars, a non-string → message; channels `[]`, `["sms"]`, `["house","house"]`, not an array → message; `announceMessage("Shelly", " Dinner ")` = `"Shelly says: Dinner"` |
| AN2 | `POST /announce { text: " Dinner is ready ", channels: ["house"] }` | 201; one `house` delivery: `fire_id` NULL, `member_id` NULL, `alert_number` 1, `"MojoSOGO says: Dinner is ready"`, `queued`; no push rows |
| AN3 | the same, with the House settings present and a fake HA (§9.2), after `waitUntil` settles | the 201 still says `queued`; the row is then `sent`, and the fake HA heard `"MojoSOGO says: Dinner is ready"` on both surfaces |
| AN4 | Phone, with the sender, a member with a phone, one without, one disabled | one push row each for the other two active members; the sender and the disabled member get none; with a phone → `sent`, without → `failed`, `no_subscription` |
| AN5 | the push to that phone | decrypts to the payload above with `tag` = the delivery id; no `topic` header |
| AN6 | blank text, 201 chars, no channels, an unknown channel; no session; a `name` in the body; Phone only with nobody else | 400 with a message ×4; 401; the name in the body is ignored; 409 `no_recipients` |
| AN7 | tag rules | a fire's push: `tag` = `fireId`; the test push: `tag` = `"enso-test"`; no push carries a `topic` header |
| AN8 | migration 0012 | rows survive unchanged; `foreign_key_check` empty; a fire-less delivery is accepted (§4.2k) |

### 9.4 Pinging the founder from outside — `src/shared/ops.ts`, `POST /ops/notify`

Decided by MojoSOGO 2026-10-04: a Claude Code session on his machines can push a message to **his own
phone** from the command line — "ping me when it's live", a question, a blocker. It sits beside the
FunHouse desk device and the house voice. The recipient is always the **founder** (§6.3, the member
setup created — derived by `FOUNDER_SQL`, never stored). It is a **fire-less push delivery** (like an
announcement, §9.3) that carries its own title (§4.2u). No session, no house row, ever.

**Rules** (`src/shared/ops.ts`, pure, imports nothing):
- `OPS_TEXT_MAX = 200` characters, `OPS_TITLE_MAX = 60` ⚑, both counted after trimming.
- `OPS_TITLE_DEFAULT = "🤖 Claude"` ⚑.
- `OPS_NOTIFY_PER_HOUR = 30` ⚑.
- `opsNotifyError({ text, title })` → a message, or `null`: `text` a string, trimmed length
  1…`OPS_TEXT_MAX`; `title` absent (`undefined` / `null`), or a string trimmed to at most `OPS_TITLE_MAX`.
- `opsTitle(title?)` → the trimmed title, or `OPS_TITLE_DEFAULT` when it is absent or blank.
- `opsWindowStart(now)` → the ISO instant one hour before `now`.

**`POST /ops/notify { text, title? }`**, `Authorization: Bearer <OPS_NOTIFY_TOKEN>` (§2.4), in this order:
1. `OPS_NOTIFY_TOKEN` unset or empty → **503 `ops_notify_off`** — even when a Bearer header is sent.
   The door is never open.
2. The Bearer value compared with the token in **constant time** (SHA-256 of each, every byte compared;
   written inside `routes/ops.ts`) → a mismatch or no header is **401 `unauthorized`**. The token and
   the header are never logged, and never put in a message or a detail.
3. `opsNotifyError` → **400 `invalid_input`** with its message.
4. The recipient is the founder. A `member` (or any other) field in the body is ignored. Before setup
   there is no founder → **409 `no_recipients`**, nothing written (never a row with no member).
5. **Hourly limit:** the push deliveries with no fire, a non-NULL `title` and **no `notice`** created at or after
   `opsWindowStart(now)` are counted; at `OPS_NOTIFY_PER_HOUR` or more → **429 `rate_limited`**, and no
   row is written. Announcements (title NULL), sign-in notices (§6.6, `notice` set) and a mess's asks (§7B.7,
   `mess_id` set) never count.
6. One delivery: `id` = `newId('dlv')`, `fire_id` NULL, `alert_number` 1, `channel` `push`, `member_id` =
   the founder, `message` = the trimmed text, `title` = `opsTitle(title)`, `queued`.
7. Sent at once with `sendPushDeliveries` (§9.1); then **201 `{ deliveries: [{ id, status, detail }] }`**.
   `failed` with `no_subscription` (the founder has no phone) or `push_not_configured` is the honest
   answer, not an error status. **The ping reached the phone only when `deliveries[0].status` is
   `sent`**; a caller otherwise reports the `detail`.

**The push:** `{ fireId: null, kind: null, tag: <delivery id>, title: <the title>, body: <the text>,
actions: [] }` — like an announcement's, with its own title. Like any delivery it shows in
Settings → Status' recent deliveries ⚑ (Q111).

**Acceptance (M4t — each row is a test):**

| # | Check | Expected |
|---|---|---|
| ON1 | `opsNotifyError` / `opsTitle` / `opsWindowStart` | `" hi "` ok; `""`, blanks, 201 chars, a non-string → message; a title of 61 chars or a non-string → message; `opsTitle(" 🤖 Claude ⭕🔁🏠 ")` = `"🤖 Claude ⭕🔁🏠"`, `opsTitle()` and `opsTitle("  ")` = `"🤖 Claude"`; `opsWindowStart("2026-10-04T12:00:00.000Z")` = `"2026-10-04T11:00:00.000Z"` |
| ON2 | `OPS_NOTIFY_TOKEN` empty, with and without a Bearer header | 503 `ops_notify_off`; no row |
| ON3 | a wrong token; no header | 401 `unauthorized`; no row; the response never contains the token |
| ON4 | blank text, 201 chars, a 61-char title | 400 `invalid_input` ×3; no row |
| ON4b | before setup (no members) | 409 `no_recipients`; no row |
| ON5 | the founder with a phone; a `member` naming another member in the body | 201, one `push` row for the founder (`fire_id` NULL, `alert_number` 1, `title` set), `sent`; the other member gets nothing; the push decrypts to `{ fireId: null, kind: null, tag: <delivery id>, title, body: text, actions: [] }`; no `topic` header |
| ON6 | the founder without a phone | 201, `failed`, `no_subscription` |
| ON7 | 30 pings in the last hour, then a 31st | 429 `rate_limited`, no row written; announcements in the same hour do not count; a ping older than an hour does not count |
| ON8 | any ping | no `house` row |
| ON9 | the titles of other pushes | an announcement's push is still "📢 Announcement"; a fire's push keeps "Ensō" and `tag` = its `fireId` |
| ON-M | migration 0022 | §4.2u's check |

---

## 10. API — `/api/v1`

- Auth is the session cookie unless noted. JSON in and out.
- Errors are `{ "error": "<code>", "message": "<human text>" }` with a non-2xx
  status. The message is **never empty**.

| Method | Path | Who | Body → Response |
|--------|------|-----|-----------------|
| GET | `/health` | public | → `{ ok, db }` |
| POST | `/setup` | public + `SETUP_TOKEN` | `{ setupToken, email, password, displayName }` → member; sets cookie |
| POST | `/auth/invite-preview` | public | `{ code }` → `{ displayName, householdName, invitedBy, expiresAt }`; 400 `invalid_code` otherwise (§6.2a). Never uses the invite. |
| POST | `/auth/signup` | public | `{ code, email, password, displayName }` → member; sets cookie |
| POST | `/auth/login` | public | `{ email, password }` → member; sets cookie; a member with a phone gets a "New sign-in on …" push (§6.6) |
| POST | `/auth/phone-login` | public | `{ email }` → **202** `{ match, expiresAt }` for every well-formed email (real, unknown, disabled, rate-limited alike); sets the waiting cookie; 400 `invalid_input` for a malformed email (§6.6) |
| GET | `/auth/phone-login` | the waiting cookie | → `{ status: 'pending' \| 'approved' \| 'denied' \| 'expired' }`; on `approved` the session cookie is set (once) and the waiting cookie cleared; 404 `not_found` with no matching cookie (§6.6) |
| GET | `/auth/phone-login/{id}` | member (the requested one) | → `{ id, browser, place, createdAt, expiresAt, status, choices: number[3] }`; 404 `not_found` for anyone else's, a decoy or an unknown id (§6.6) |
| POST | `/auth/phone-login/{id}/approve` | member (the requested one) | `{ number }` → `{ status: 'approved' \| 'denied' }` (a wrong number denies); 400 `invalid_input` / 404 `not_found` / 409 `not_pending` / 409 `expired` (§6.6) |
| POST | `/auth/phone-login/{id}/deny` | member (the requested one) | "This wasn't me" → `{ status: 'denied' }`; 404 / 409 as approve (§6.6) |
| POST | `/auth/logout` | member | → 204; clears cookie |
| GET | `/me` | member | → member + prefs |
| PATCH | `/me` | member | `{ displayName?, color?, showPublicHolidays?, showOptionsExpiration?, houseSpeakers?: string[] \| null }` (§9.2a) |
| GET | `/house/speakers` | member | → `{ speakers: { id, name, kind }[], mine, defaults }` asked of Home Assistant live; 503 `house_not_configured`; 502 `house_unreachable` (§9.2a) |
| GET | `/members` | member | → `{ id, email, displayName, color, role, isFounder, disabledAt }[]` (no hashes; `email` only for owners) |
| PATCH | `/members/{id}` | owner | `{ disabled?: boolean, role?: Role }` — rules in §6.3 |
| GET/POST | `/invites` | owner | GET → `{ id, displayName, createdAt, expiresAt, usedAt, usedBy, revokedAt }[]`; POST `{ displayName }` → `{ code, expiresAt }` (the code is shown only once; the PWA builds the link and QR from it) |
| DELETE | `/invites/{id}` | owner | revoke |
| GET | `/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | member | → `{ occurrences[], publicHolidays[], marketDays[] }` (each occurrence carries `emoji`); recurring events expanded server-side with `recurrence.ts`; alarms and sun-timed events (§7.7) excluded; **optional events only if on for this member (§7.5)**; public holidays filtered to days off; max range 120 days |
| GET | `/optional-events` | member | → `{ id, title, emoji, recurrence, startDate, on }[]` — every optional event, with this member's switch |
| PUT/DELETE | `/events/{id}/optin` | member | turn an optional event on / off **for me** → 204; 400 if the event isn't optional |
| POST | `/events` | member | event fields → event |
| GET/PATCH/DELETE | `/events/{id}` | creator or owner for writes (GET includes `thingId`, §7C.2) | PATCH/DELETE close future scheduled fires (§5.6). A sun-timed event (§7.7) is 404 here and on `/exdates` |
| POST | `/events/{id}/exdates` | creator or owner | `{ date }` |
| GET/POST | `/timers` | member | → `Timer[]` / POST `{ title, intervalMin, channels, renotifyMin?, maxAlerts?, assignedTo?, activeFrom?, activeTo? }` → timer (201). `Timer = { id, title, intervalMin, channels, renotifyMin, maxAlerts, assignedTo, running, createdBy, activeFrom, activeTo, openFire }`; `activeFrom`/`activeTo` are `"HH:MM"` or both `null` (no window). 400 `invalid_input` when only one is set, either is not `HH:MM`, or `timerWindowError` refuses them (§5.1) |
| PATCH/DELETE | `/timers/{id}` | creator or owner | PATCH: the POST fields, all optional, merged over the timer; `activeFrom: null, activeTo: null` clears the window. A PATCH never re-plans the open fire (rule 0 defers it when it comes due) |
| POST | `/timers/{id}/commands` | member | `{ cmd: TimerCmd }`; start plans the fire with `nextTimerDue` and the timer's window |
| GET | `/alarms` | member | → alarms: `{ id, title, time, days: Weekday[], channels, renotifyMin, assignedTo, createdBy, nextDueAt, ringing }` |
| POST | `/alarms` | member | `{ title, time: "HH:MM", days: Weekday[], channels, renotifyMin?, assignedTo? }` → alarm |
| PATCH/DELETE | `/alarms/{id}` | creator or owner | same fields as POST, all optional; closes future scheduled fires like an event edit |
| GET | `/fires?state=ringing` | member | → open fires with titles; every fire carries `startSun` (the event's `start_sun`, §7.7, else `null`); chore fires also carry `choreRunId`, `stepTitle` (only for chores with > 1 step) and `personId` (the current step's person); machine fires carry `machineId`, `title` = the machine's label ("Washer") and `personId` = the load's owner |
| GET | `/machines` | member | → `Machine[]` in load order: `{ id, label, state: MachineState, ownerId, minutes, startedAt, doneAt, startedBy, next }` (`state` derived by the server, §7D.1; `next` = the next machine's id or null) |
| POST | `/machines/{id}/start` | member | `{ ownerId, minutes }` → `Machine[]`; 409 `busy` when not free (§7D.2) |
| POST | `/machines/{id}/move` | member | `{ minutes }` → `Machine[]`; 409 `busy` / `not_done` / `invalid_state` |
| POST | `/machines/{id}/finish` | member | Fold & out → `Machine[]`; 409 `not_done` / `invalid_state` |
| GET / PATCH | `/machines/hours` | GET member / PATCH owner | `MachineHours` `{ weekday, weekend }`, each `{ from, to }` or null → the saved hours; 400 `invalid_input` (§7D.5) |
| POST | `/machines/{id}/done` | member | Done now `{ ownerId? }` (required when free) → `Machine[]`; 409 `busy` when already done, 400 `invalid_input` (§7D.2) |
| POST | `/machines/{id}/remind` | member | Still loaded → `Machine[]`; 409 `not_done` (§7D.2) |
| POST | `/machines/{id}/clear` | member | → `Machine[]`; 409 `already_free`. Every `/machines` write: 404 for an unknown machine, 400 `invalid_input`, 409 `conflict` when another tap changed the machine first |
| POST | `/fires/{id}/actions` | member | `{ action: Action }` → fire (+ next); 409 on `invalid_action` |
| POST | `/push/subscriptions` | member | `PushSubscriptionJSON` + userAgent → `{ id }` (upserted by endpoint) |
| POST | `/push/test` | member | one test push to my subscriptions → `{ sent }`; 409 when I have none (§9.1) |
| DELETE | `/push/subscriptions/{id}` | owner of the subscription | |
| GET | `/push/vapid-key` | public | → `{ key }` |
| GET/PATCH | `/settings` | GET member / PATCH owner | GET → `{ householdName, timezone, daysOff }`; PATCH `{ householdName?, timezone?, daysOff?: HolidayKey[] }` |
| GET | `/status` | member | → `{ house: { state: HouseState, lastOkAt, lastFailedAt, lastError } (§9.2, derived, never stored), mySubscriptions[] (each with `id`, `endpoint`, `lastOkAt`, `lastError`), recentDeliveries[] }` |
| POST | `/announce` | member | `{ text, channels: Channel[] }` → 201 `{ deliveries: { id, channel, memberId, status }[] }`; 409 `no_recipients` (§9.3); 409 `no_speakers` (§9.2a); spoken as "{my name} says: {text}" and/or pushed to the other members, now (§9.3) |
| POST | `/ops/notify` | bearer `OPS_NOTIFY_TOKEN` (no session) | `{ text, title? }` → 201 `{ deliveries: [{ id, status, detail }] }`, one push to the founder's phone, now (§9.4); 503 `ops_notify_off` / 401 `unauthorized` / 400 `invalid_input` / 409 `no_recipients` (no founder yet) / 429 `rate_limited`, in that order |
| GET | `/chores` | member | → `Chore[]`: `{ id, title, doneMeans, days, timing, time, nudge, people, steps, channels, renotifyMin, createdBy, thisWeek, nextWeek, areaCount }` (`thisWeek`/`nextWeek` = member id or null; `areaCount` §7B.6) |
| POST | `/chores` | member | `{ title, doneMeans?, days, timing, time, nudge?, people, steps, channels, renotifyMin? }` → chore (201) |
| PATCH/DELETE | `/chores/{id}` | creator or owner | same fields, all optional; re-plans unstarted runs (§7B.3); DELETE also deletes its areas and their photos (§7B.6) |
| GET | `/chores/today` | member | → `{ date, runs: Run[] }`; `Run = { id, choreId, title, doneMeans, timing, time, step, steps, assigneeId, personId, doneAt, doneBy, nextDueAt, ringing, areaCount }` (`personId` = the current step's person) |
| POST | `/chore-runs/{id}/done` | member | advances one step (§7B.3) → run; 409 `already_done` when finished |
| POST | `/chore-runs/{id}/undo` | member | → run; 409 `nothing_to_undo` at step 0 |
| GET/POST | `/chores/{id}/areas` | member | GET → `ChoreArea[]` by position; POST `{ name, expectations? }` → area (201); 400 at 8 areas; 404 when the chore is gone (§7B.6) |
| PATCH/DELETE | `/chore-areas/{id}` | member | PATCH `{ name?, expectations? }` → area; DELETE → 204 with its photos (§7B.6) |
| POST | `/chore-areas/{id}/photos` | member | the raw image → area (201); 400 at 4 photos or a bad image (§7B.6) |
| GET/DELETE | `/chore-area-photos/{id}` | member | GET → the image, `private, max-age=3600`; DELETE → 204 (§7B.6) |
| GET | `/messes` | member | → `{ messes: Mess[], balances: Balance[] }` — open and To talk about messes for everyone, owed ones for the pair and admins (§7B.7) |
| POST | `/messes?choreId=&note=` | member | the raw photo → `Mess` (201); the first ask to everyone else at once; 400 no or bad photo, a long note; 404 an unknown chore (§7B.7) |
| GET | `/messes/{id}/photo` | member | → the image, `private, max-age=3600`; 404 once deleted (§7B.7) |
| POST | `/messes/{id}/claim` \| `/deny` | member, not the reporter | → `Mess`; 409 `mess_settled` unless open or To talk about (§7B.7) |
| POST | `/messes/{id}/decide` | owner | `{ memberId: string \| null }` → `Mess`: whose it was, or nobody's (§7B.7) |
| POST | `/messes/{id}/settle` | the one owed, or owner | `{ how: 'paid' \| 'forgiven' }` → `Mess`; 409 unless owed (§7B.7) |
| DELETE | `/messes/{id}` | reporter while unanswered, or owner | → 204 (§7B.7) |
| GET | `/things` | member | → `{ open: Thing[], closed: Thing[] }` (closed = done/dropped, last 60 days); `Thing = { id, title, note, place, address, phone, cost, url, windowStart, windowEnd, remindStart, remindOn, channels, hasPhoto, status, plannedEventId, plannedDate, createdBy, updatedAt }` |
| POST | `/things` | member | thing fields → thing (201) |
| GET/PATCH/DELETE | `/things/{id}` | member | GET → thing; PATCH fields, all optional, incl. `status` → thing; DELETE → 204 (and its photo) |
| POST | `/things/{id}/plan` | member | `{ date, time? }` → `{ thing, eventId }`; 400 outside the window |
| PUT/GET/DELETE | `/things/{id}/photo` | member | PUT raw image body (≤ 4 MB) → 204; GET → the image; DELETE → 204 |
| POST | `/things/read-photo` | member | raw image body → `{ title, startDate, endDate, place, address, phone, cost, url, note }` (each nullable); 503 / 502 / 422 / 429 per §7C.4 |
| GET | `/shows` | member | → `{ want: Show[], watched: Show[] }` (want newest added first, watched newest watched first); `Show = { id, title, kind, year, rtCritics, rtAudience, watch: { how, where, note }[], summary, note, url, checkedAt, status, watchedAt, watchedBy, createdBy, createdAt, updatedAt }` (§7F) |
| POST | `/shows` | member | `{ title, kind?, year?, rtCritics?, rtAudience?, watch?, summary?, note?, url?, checkedAt? }` → show (201); 400 `invalid_input`; 409 `duplicate` (+ `showId`) |
| GET/PATCH/DELETE | `/shows/{id}` | member | GET → show; PATCH the POST fields, all optional, merged, plus `status: 'want' \| 'watched'` → show; 409 `duplicate`; DELETE → 204 (soft); 404 when gone |
| POST | `/shows/look-up` | member | `{ title, year?, kind? }` or `{ url }` → `ShowReading` (§7F.2); nothing stored; 400 / 429 / 503 `show_lookup_off` / 422 `show_refused` / 502 `show_lookup_failed` |
| POST | `/shows/look-up-photo` | member | raw image body → `ShowReading`; the picture is never stored; errors as look-up |
| POST | `/things/read-link` | member | `{ url }` → the same reading as read-photo; nothing stored; 400 / 429 / 503 `link_reading_off` / 422 `link_refused` / 502 `link_reading_failed` per §7C.4b |
| GET | `/recipes/{id}/photo` | member | → the recipe's picture (§7E.2b ⚑ Q174), private cache; 404 when none or the recipe is gone |
| PUT/DELETE | `/recipes/{id}/photo` | member | PUT a raw photo body (`photoBody`, as a thing's) → 204, replacing (and deleting) the old one; DELETE → 204; each bumps `updatedAt`; 400 a bad type or size; 404 when the recipe is gone (⚑ Q175) |
| GET | `/recipes` | member | → `Recipe[]`, newest first; `Recipe = { id, title, videoId, videoTitle, channel, link, hasPhoto, watchUrl, thumbnailUrl, ingredients: string[], steps: string[], servings, time, found, source: RecipeSource[], captionsError, commentsError, createdBy, createdAt, updatedAt, emojis: RecipeEmoji[] }` (`watchUrl` / `thumbnailUrl` derived from `videoId`, null when typed or a link; `link` the page a link recipe was read from, §7E.6; `RecipeEmoji = { memberId, emoji }`, §7E.5) (§7E) |
| POST | `/recipes` | member | `{ title, ingredients, steps, servings?, time? }` → recipe (201), typed by hand; 400 `invalid_input` |
| GET/PATCH/DELETE | `/recipes/{id}` | member | GET → recipe; PATCH the POST fields, all optional, merged → recipe (found recomputed); DELETE → 204 (soft); 404 when gone |
| PUT/DELETE | `/recipes/{id}/emoji` | member (their own) | PUT `{ emoji }` → recipe (200), my emoji set (upsert); DELETE → recipe (200), mine cleared; 400 `invalid_input` (`emojiError`); 404 when the recipe is gone; `updatedAt` untouched (§7E.5) |
| POST | `/recipes/from-link` | member | `{ url }` → recipe (201): any link, its kind detected (§7E.6); a YouTube video as from-video; a page: 400 / 409 `duplicate` (+ `recipeId`) / 429 / 503 `recipe_reading_off` / 422 `recipe_refused` / 502 `recipe_reading_failed`, in the §7E.6 order |
| POST | `/recipes/from-video` | member | the same handler as from-link (kept for older apps). For a video: `{ url }` → recipe (201); 400 / 409 `duplicate` (+ `recipeId`) / 429 / 503 `recipe_reading_off` / 404 `video_unavailable` / 502 `youtube_failed` / 422 `recipe_refused` / 502 `recipe_reading_failed`, in the §7E.2 order |
| POST | `/recipes/{id}/transcript` | member | `{ screenshots?: { type, data }[] (≤ 4, base64), text? (≤ PASTED_MAX) }`, at least one → recipe (200), re-read from the pasted transcript; 404 / 400 `invalid_input` / 429 / 503 `recipe_reading_off` / 404 `video_unavailable` / 502 `youtube_failed` / 422 `recipe_refused` / 502 `recipe_reading_failed` / 422 `no_recipe` (nothing changed), in the §7E.2b order |
| GET | `/lists` | member | → `{ id, name, emoji, createdBy, openCount }[]`, by name (§7A); `emoji` null = the default |
| POST | `/lists` | member | `{ name, emoji? }` → list (201); 409 `duplicate`; 400 at `LISTS_MAX` or a bad emoji |
| PATCH/DELETE | `/lists/{id}` | creator or admin (seeded lists: admin) | PATCH `{ name, emoji? }` (absent = unchanged, null = the default) → list; DELETE → 204 (and its items' photos, §7A.3) |
| GET | `/lists/{id}` | member | → `{ list: { id, name, emoji, createdBy }, open: Item[], checked: Item[] }` (§7A.1); `Item = { id, listId, text, note, assigneeId, createdBy, createdAt, checkedAt, checkedBy, hasPhoto, updatedAt }` |
| POST | `/lists/{id}/items` | member | `{ text, note?, assigneeId? }` → `{ item, result: "added" \| "existing" \| "reopened" }`, 201 when added, else 200 |
| PATCH | `/list-items/{id}` | member | `{ text?, note?, assigneeId?, checked?: boolean }` → item; 409 `duplicate` on a key clash |
| DELETE | `/list-items/{id}` | member | → 204 (and its photo, §7A.3) |
| POST | `/list-items/read-photo` | member | raw image body → `{ name, via: "sogoai" \| "claude" }` (`ItemReading`); nothing stored; 400 / 429 / 503 `photo_reading_off` / 422 `photo_refused` / 502 `photo_reading_failed` / 422 `item_unknown`, in the §7A.3 order |
| PUT/GET/DELETE | `/list-items/{id}/photo` | member | PUT raw image body (≤ 4 MB) → 204 (replaces); GET → the image (`private, max-age=3600`); DELETE → 204; 404 when the item is gone, and GET also when it has no photo (§7A.3) |
| POST | `/dev/tick?now=ISO` | only if `DEV_ENDPOINTS=1` | runs `tick(db, now)` → summary |

**Freshness:** there are no WebSockets. The app refetches the visible calendar range
and `/fires?state=ringing` every 30 s while visible, on focus, and when a push
arrives. That is plenty for one household.

### 10.1 npm scripts

| Script | Does |
|--------|------|
| `dev` | `wrangler dev` (API + assets) and `vite` together |
| `dev:api` | `wrangler dev` alone — serves the built PWA from `frontend/dist` |
| `dev:lan` | `dev:api` listening on all interfaces, for phones on the home network (§2.3) |
| `seed:dev` | fresh local DB only: test accounts from `scripts/dev-seed.json` + sample data |
| `test` | `vitest run` (pure + Workers pool) |
| `typecheck` | `tsc --noEmit` for worker + shared + tests, frontend, scripts, home |
| `build:home` | `esbuild home/captions-helper.ts --bundle --platform=node --format=esm --target=node24 --outfile=home/dist/captions-helper.mjs` — the SogoAI helper as one file (§7E.2c); esbuild is an explicit, pinned devDependency |
| `db:migrate:local` | `wrangler d1 migrations apply enso --local` |
| `db:migrate:remote` | `wrangler d1 migrations apply enso --remote` |
| `build` | `vite build` → `frontend/dist` |
| `deploy` | `npm run build && wrangler deploy` |
| `arch:audit` | `tsx scripts/arch-audit.ts` — size vs cap for every source file, warning band marked (§2.5) |

`wrangler.toml` essentials:

- `name = "enso"`, `main = "src/worker/index.ts"`
- `[[d1_databases]] binding = "DB"`, `database_name = "enso"`,
  `migrations_dir = "migrations"`
- `[assets] directory = "frontend/dist"`,
  `not_found_handling = "single-page-application"`,
  `run_worker_first = ["/api/*"]`
- `[triggers] crons = ["* * * * *"]`
- `[vars]` `HA_URL`, `ECHO_TARGETS`, `ECHO_TYPE`, `SATELLITE_ENTITY` (§9.2)

---

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

## 12. Later (explicitly out of v1 — do not build or stub)

Captured from v1.0-draft so nothing is lost:

- Capacitor native apps / FCM / APNs
- Real-time WebSockets (would need Durable Objects)
- Offline **editing** and conflict resolution. v1 offline = the cached app shell;
  actions need network, and buttons show disabled "offline".
- Queued offline acks
- Photos anywhere other than Things to do (§7C.3), list items (§7A.3), a chore's areas (§7B.6), a mess
  report (§7B.7, kept at most 30 days) and a recipe's picture (§7E.2b, §8.12), the only five attachments. A picture a show is looked up from (§7F.2) is read once and never stored, so it is not one. A recipe's video
  thumbnail (§7E.1) is hotlinked from YouTube — not stored, not in R2, not an attachment — so it
  is not one. Transcript screenshots (§7E.2b) are read once and never stored — not in R2, not an
  attachment — so they are not one either ⚑ Q93, except the one kept as a recipe's picture (§7E.2b ⚑ Q174),
  which since v1.32.0 also has its own upload and delete (`PUT/DELETE /recipes/{id}/photo`, ⚑ Q175).
- Data export
- Audit-log screen
- Event templates
- Week-strip view
- Editing a single occurrence of a series
- Household-wide quiet hours ⚑ — see Q2. (Two exceptions are built: rolling timers have their own
  active time range since v2.28, §4.2n, and machine alerts wait for the machine alert hours, §7D.5;
  quiet hours for everything else stay here.)
- Escalation ladders: channel changes per alert number, light blinking, notifying
  the owner on escalation
- HA entity/automation generation; HA events creating reminders (door/motion)
- A separate restricted admin role (admins are co-owners, §6.3); guest role; multiple households
- Holiday calendars for other countries
- Turso / non-Cloudflare hosting
- Adding list items by voice (Voice PE / Home Assistant intent → Worker). If built, it
  goes through Home Assistant's own Assist, never Alexa skills or lists.
- Chore points, streaks or rewards — except the one point owed for a mess (§7B.7, decided by MojoSOGO 2026-10-05)
- Shopping list grouped by store aisle; list sharing outside the household; list ordering by hand

### 12.2 Movies & shows — follow-ups (suggested 2026-10-05, not built, need MojoSOGO's word)

- Each person's "I want to see it" emoji on a show, as on recipes (§7E.5), and a "for us all" filter.
- The household's own services, so "on a service we have" stands out and rent/buy sinks.
- A weekly re-check that pings the household when a wanted show leaves theaters or lands on a service.
- Movie night: Plan it onto the calendar from a show (as a thing's Plan it), with showtimes for a theater.
- Reading a video clip itself (frames), posters and trailers, and the household's own stars after watching.

### 12.3 What done looks like — follow-ups (suggested 2026-10-05, not built, need MojoSOGO's word)

- A photo of the job done, taken when the last step is ticked, kept with that day's run to compare with the areas.
- Ticks on the expectations saved per run, so a parent can see what was checked.
- Reordering areas by hand (they keep the order added).

### 12.4 Whose mess? — follow-ups (suggested 2026-10-05, not built, need MojoSOGO's word)

- Paying a point back by taking one of the owed person's chore turns (needs a per-run swap that survives re-planning, §7B.3).
- A push to the reporter when someone claims their mess.
- Mess sizes worth more than one point.

### 12.1 Next — decided with MojoSOGO (2026-10-03), spec to be written before building

**Phase B — Chores.** Specified as §7B (v2.5). It shares the fire/delivery machinery
with reminders and timers (a third fire kind), not a second reminder system.

**Phase C — Shared screen and house.**
- A wall/kitchen tablet showing today's calendar, chores and the shopping list,
  signed in as a **display** that can tick things off but cannot change settings
  (a new role — §6.3 and §12's "guest role" entry are revisited then).
- House announcements name who an alert is for ("Shelly: dentist at 14:30"). Chores
  already do (§5.7).

---

## 13. Open questions for MojoSOGO

| # | Question | Built as (⚑ DEFAULT) |
|---|----------|----------------------|
| Q1 | Name for the restart-on-ack alert? | "Rolling timer" in docs; **Timer** in the UI |
| Q2 | Timers can ring overnight. Quiet hours in v1, or rely on Stop? | **Decided by MojoSOGO 2026-10-03 for timers:** each rolling timer may have an active time range ("Active from HH:MM to HH:MM"); it never rings outside it and its countdown restarts when the range opens (§4.2n, §5.3 rule 0). Household-wide quiet hours stay in Later (§12) |
| Q3 | While a timer rings unacknowledged, re-alert or ring once? | Re-alert every 15 min, 4 alerts max, then silent in the Ringing bar |
| Q4 | Should normal reminders nag too? | Off by default; per-event "repeat alert every" option |
| Q5 | House announcements go to **all four** Echos (incl. Toasty and Kid's Room) and the Voice PE — also at night? | Yes, all surfaces, always; per-alert speaker choice is Later |
| Q6 | App URL | **Decided by MojoSOGO 2026-10-03:** `https://enso.sogodojo.com` (Worker custom domain) |
| Q7 | Accent color: v1 used blue, which collides with school-holiday blue | Indigo `#6366F1` |
| Q8 | Snooze length | 10 min, single option |
| Q9 | Can any member Done/Ack a fire assigned to someone else? | Yes |
| Q10 | Can any member edit or delete any list item (not only their own)? | Yes — they are household lists |
| Q11 | How long do bought / done items stay visible? | 30 days |
| Q12 | Where do chores live? | Set up in **Alarms → Chores**; ticked off in **Lists → Today** (no fifth tab). **Superseded by Q166** (v1.28.0): their own 🧹 Chores tab |
| Q13 | When do turns change? | Every Sunday (weekly), counted from the week the chore was made |
| Q14 | Unfinished chores from earlier days? | Drop off Today quietly; a still-ringing fire stays in the Ringing bar |
| Q15 | Can anyone tick anyone's chore? | Yes — any member, like fires (Q9) |
| Q16 | Chore alert channels by default | Phone on, House off — same as the alarm form |
| Q17 | Which Lists view opens first when none is remembered? | Shopping (unchanged); Today once chosen is remembered |
| Q18 | Invite expiry | 7 days (unchanged) |
| Q19 | Welcome card content | The three-line tour above; shown once per member per device |
| Q20 | A signed-in member opens a `/join` link | The app opens as normal and the address becomes `/` |
| Q21 | Welcome card when an existing member signs in on a new device | No — only right after joining |
| Q23 | How many people can a list item be assigned to? | **Decided by MojoSOGO 2026-10-03:** one (or nobody) |
| Q24 | Do lists behave differently? | **Decided by MojoSOGO 2026-10-03:** all alike — tap ticks, ✎ edits |
| Q25 | Who may create, rename, delete lists? | Anyone creates; creator or admin renames/deletes; seeded lists admin-only |
| Q26 | The old ✕ quick-remove on rows | Removed — tick is the quick action, Delete is in the item form |
| Q27 | Where do things to do live? | **Decided by MojoSOGO 2026-10-03:** Lists picker, second entry |
| Q28 | Plan it | **Decided:** creates a real calendar event; the idea becomes Planned |
| Q29 | Reminders | **Decided:** when it starts, and on a picked date (09:00 local ⚑); whole household ⚑ |
| Q31 | Street sweeping / per-person items | **Decided by MojoSOGO 2026-10-03:** optional events any person turns on; reminder the evening before at 8 pm |
| Q32 | Is the creator of an optional event turned on automatically? | Yes ⚑ |
| Q33 | School holidays | **Decided 2026-10-03:** removed; the 5 Fall break days deleted |
| Q34 | Take out trash | **Decided:** optional, every Sunday 18:00, rings at 18:00, 🗑️ |
| Q30 | Reading photos | **Decided:** Claude reads them (`claude-opus-5-5`); ≤ 40 reads a day ⚑ |
| Q35 | Where do the thing form's Open / Map / Call buttons sit, and which maps app? | ⚑ To the right of Link, Address, Phone; Apple Maps on iPhone/iPad, Google Maps elsewhere |
| Q36 | Announcements (§9.3): defaults of the box, length, who is pushed | ⚑ The box opens with House ticked, Phone unticked; at most 200 characters; at least one of Phone / House; the sender gets no push of their own; push goes to every active member (optins `audience`), and one without a phone gets the honest `failed: no_subscription` row; the push is titled "📢 Announcement" with "{name} says: {text}" as its body |
| Q37 | Voice PE timeout now that the Worker speaks (§9.2) | ⚑ 25 s (the relay used 30 s) so a call fits the Worker's ~30 s `waitUntil` budget; it normally takes ~8 s |
| Q38 | House badge and Status wording (§8.1, §8.6) | ⚑ Badges "🔇 House failing" and "🔇 House not set up", whose explanations name Home Assistant and the Cloudflare tunnel; Status line "working" / "failing since …" + the error / "not set up" / "not tried yet" |
| Q39 | House state before anything has been spoken (§9.2) | ⚑ `untried`: no badge, Status says "not tried yet" — a quiet house is not a failure until a delivery fails |
| Q40 | The laundry loop in the Ringing bar and on phones (§7D, §8.2) | ⚑ The washer row has **Move to dryer**, which opens the same dryer-minutes chooser as the card (exported from `Machines.tsx`); the dryer row has **Fold & out**. Phone notifications have no buttons; tapping one opens the app |
| Q41 | Move to dryer while the dryer is still full (§7D.2) | ⚑ Refused in place: "The dryer still has Sam's load." The washer stays DONE — waiting and its reminders run out at 4; every later dryer alert adds " — Kai's load is waiting". Nothing moves automatically |
| Q42 | The done message (§7D.3) | ⚑ "Sam, your laundry in the washer is done" / "… in the dryer is done", plus the waiting suffix; with no active owner "The laundry in the washer is done" |
| Q43 | Undoing a mistaken start (§7D.2, §8.5) | ⚑ A running or done machine offers **Clear**: its fire closes `removed`, nothing rings, the machine is free. A free dryer also offers **Start** with the same chips |
| Q44 | Overnight timer windows (§4.2n) | ⚑ Allowed (22:00–06:00 runs across midnight); only `from = to` is refused |
| Q45 | Is the window's end inside it? | ⚑ Active from `from` up to but not including `to` (08:00–21:00: 20:59 rings, 21:00 does not) |
| Q46 | An interval as long as the window or longer | ⚑ Refused, 400 — the timer could never ring inside it |
| Q47 | Ringing when the window closes | ⚑ The fire goes back to `scheduled`, due at the next window start + interval: it leaves the Ringing bar, goes quiet, and the timer still shows running with its next time (§5.3 rule 0) |
| Q48 | Starting a timer outside its window | ⚑ Allowed; the first ring is the next window start + interval |
| Q49 | Editing the window of a running timer | ⚑ The open fire is not re-planned; rule 0 defers it when it comes due outside the new window |
| Q50 | The timer form and row (§8.5) | ⚑ Two time inputs, "Active from / to", empty = always; the row shows the window; Next names the day when it isn't today |
| Q51 | How often does the goat alert repeat (§7.7)? | ⚑ Every 15 min, up to 3 alerts (−30, −15, at sunset) until Done: the row has `renotify_min` 15, `max_alerts` 3 (the placement-advisor suggested one alert; the coordinator chose repeats so the goats are not forgotten) |
| Q52 | How the sunset time reads | ⚑ "6:42" — 12-hour, no am/pm |
| Q53 | Sunset precision | ⚑ Rounded to the nearest minute |
| Q54 | Sun items on the calendar? | ⚑ Never, by rule: not in `/calendar`, the day sheet or the event routes |
| Q55 | The Settings label for sun items | ⚑ Unchanged: "Optional calendar items" |
| Q56 | The Ringing bar row of a sun item | ⚑ `· sunset` where an all-day reminder shows `· all day` |
| Q57 | The household place | ⚑ 33.20 / −117.29 (ZIP 92056, Oceanside), set by migration 0016; no edit UI |
| Q58 | Who edits or deletes the goat item | ⚑ Only coordinator SQL; the event routes give 404 |
| Q59 | Sunrise too? | ⚑ No — sunset only |
| Q60 | Where do recipes live (§8.1, §8.12)? | ⚑ Their own tab, "Recipes" 🍳, between Lists and Settings; five tabs fit at 320 px (Q12's "no fifth tab" was about chores) |
| Q61 | Pasting a link | ⚑ Saves the recipe at once, then opens its view with the source note; ✎ fixes it |
| Q62 | A recipe row | ⚑ A small thumbnail + the dish's name, plus a "watch it" badge when nothing was found; newest first |
| Q63 | The same link pasted twice | ⚑ 409 `duplicate`; the PWA opens the existing recipe |
| Q64 | The source note | ⚑ Says what was read ("From the description and captions"), plus "captions couldn't be read: {reason}" when that happened |
| Q65 | Recipe reads per day | ⚑ 20 (`RECIPE_READS_PER_DAY`), counted apart from photo reads |
| Q66 | Who edits or deletes a recipe? | ⚑ Anyone in the household; delete is soft |
| Q67 | A hand edit of a "watch it" recipe | ⚑ Adding ingredients or steps sets found = true (found = has ingredients or steps) |
| Q68 | A typed recipe with a video link | ⚑ Not in v1 — a typed recipe has no video |
| Q69 | Add to Shopping | ⚑ Nothing picked at first, a "Pick all" chip; summary "Added 4 · Milk already on the list"; on a failure it stops and names what wasn't added |
| Q70 | Privacy of recipe reading | ⚑ The video's text goes to Anthropic; the thumbnail loads from i.ytimg.com (no referrer). Accepted |
| Q71 | By emoji: the order of the groups (§7E.5) | ⚑ Biggest group first; ties by the group's newest recipe, then the emoji string; newest first within a group; unrated last, newest first |
| Q72 | Picking my emoji (§8.12) | ⚑ The household's emojis as chips (most used first, 12 at most), a one-emoji input with Set, and Clear when I have one |
| Q73 | Everyone's emoji names a member the PWA doesn't know | ⚑ "Someone" |
| Q74 | Newest \| By emoji | ⚑ Remembered per phone (`localStorage`), not per person on the server |
| Q75 | A soft-deleted recipe's emojis | ⚑ Kept in `recipe_emojis` but never shown — only live recipes are returned |
| Q76 | Whose comments are read (§7E.2) | ⚑ Only top-level comments by the video's own channel; viewers' text and the creator's replies inside threads are ignored |
| Q77 | How many comments | ⚑ 20 threads, relevance order (1 quota unit); the kept text is capped at 5 000 characters |
| Q78 | Comments turned off, or no creator's comment | ⚑ Not an error; no marker |
| Q79 | Comments quota used up or failed | ⚑ The recipe is still saved, with "comments couldn't be read: {reason}" |
| Q80 | The video's channel id is unknown | ⚑ No comments are read (never anyone else's) |
| Q81 | The source note with comments | ⚑ "From the description, captions and the creator's comment" — what was read, joined "A, B and C" |
| Q82 | Quota per read | ⚑ Two YouTube API units per read (video + comments); the 20-a-day cap is unchanged |
| Q83 | Privacy of the creator's comments | ⚑ The creator's kept comment text goes to Anthropic too, like the description |
| Q84 | A pasted transcript: the rest of the video's text (§7E.2b) | ⚑ The description and the creator's comments are fetched again (they are not stored): 2 quota units, and the read counts against the 20 a day |
| Q85 | What a pasted transcript is called | ⚑ Its own source, `transcript` — "From the description and the transcript you added" (screenshots or pasted) — never `captions` |
| Q86 | A pasted transcript that holds no recipe | ⚑ Only a reading that finds a recipe is saved; one that doesn't changes nothing (422, "nothing was changed"); no confirm dialog, the box says what it replaces |
| Q87 | When the transcript, by hand, is offered | ⚑ Only on a "watch it" video recipe or one whose captions couldn't be read; the server allows any video recipe |
| Q88 | Cleaning a pasted transcript | ⚑ Timestamps and YouTube's spoken durations dropped, chapter titles kept, whitespace collapsed, cut to `TRANSCRIPT_MAX` |
| Q89 | The longest paste | ⚑ `PASTED_MAX` = 100 000 characters before cleaning |
| Q90 | Wording | ⚑ "📷 Add transcript screenshots"; hint "On YouTube: ⋯ → Show transcript, then screenshot it."; "or paste the text"; **Read it** |
| Q91 | A transcript when pasting the link | ⚑ Not offered on the paste-a-link step — read the video first, then add it on the recipe |
| Q92 | How many screenshots | ⚑ At most 4 per read (he said one; a transcript usually needs a few) |
| Q93 | Keeping the screenshots | ⚑ Not stored — read once and dropped; no R2, no migration (§12) |
| Q94 | Screenshots or text | ⚑ Screenshots first (the phone); pasting the text is secondary, collapsed under "or paste the text" |
| Q95 | Which captions failures go to the home PC (§7E.2c) | ⚑ Only `blocked` — `none` (no captions) and `failed` would fail at home too |
| Q96 | How long the Worker waits for SogoAI (§7E.2c) | ⚑ 20 s (`HOME_CAPTIONS_TIMEOUT_MS`); longer is a failure, "from home: error: …" |
| Q97 | The home PC couldn't read the captions either | ⚑ `captions_error` = "from home: {reason}" — shown "captions couldn't be read: from home: …" |
| Q102 | Older recipes whose captions were blocked | ⚑ No backfill and no "try from home" button — only new reads ask |
| Q104 | Limits on what the helper answers | ⚑ Text cut to `TRANSCRIPT_MAX` (20 000), a failure reason to 300 characters |
| Q105 | Where the helper listens | ⚑ `127.0.0.1:8790` on SogoAI, loopback only, reached only through the `sogoai` Cloudflare Tunnel behind Access |
| Q106 | Captions blocked and captions from home not set up | ⚑ `captions_error` = "from home: captions from home aren't set up." — shown "captions couldn't be read: from home: …" (the YouTube reason is not kept) |
| Q107 | Who a ping from a Claude session goes to (§9.4) | ⚑ Always the founder; there is no `member` field (one sent is ignored) |
| Q108 | The ping's title | ⚑ The caller's title (e.g. "🤖 Claude ⭕🔁🏠"), or "🤖 Claude"; at most 60 characters |
| Q109 | A `level` for pings (like the FunHouse's) | ⚑ None — an emoji in the title does that job |
| Q110 | How many pings | ⚑ 30 an hour, then 429 `rate_limited` |
| Q111 | Are pings visible to the household? | ⚑ Yes — they show in Settings → Status' last 20 deliveries like any other delivery. His call later |
| Q112 | SogoAI can't tell what a snapped item is (§7A.3) | ⚑ When SogoAI says UNKNOWN, Claude is asked, and that counts against the cap. If Claude can't tell either → 422 "Couldn't tell what that is — type it in." |
| Q113 | Which snaps count against the daily cap | ⚑ Only Claude fallbacks count, sharing the 40-a-day `photo_reads` budget with Things; a name from SogoAI is free and uncounted |
| Q114 | How long a snap may wait | ⚑ 20 s from the Worker to the helper (`HOME_IDENTIFY_TIMEOUT_MS`); 15 s from the helper to LM Studio |
| Q115 | Which local model names items | ⚑ `IDENTIFY_MODEL=qwen-uncensored`, the always-loaded vision model on SogoAI. Unset → SogoAI counts as off and Claude is asked |
| Q116 | How long a name | ⚑ The prompt asks for at most 60 characters (`ITEM_NAME_ASK`); the name is cut at 120 (`TEXT_MAX`) |
| Q117 | The hint under a snapped name | ⚑ "Read from your photo — check it." `via` is always in the answer, but the UI doesn't show it |
| Q118 | Snapping with text already in the box | ⚑ The name replaces whatever text is in the box |
| Q119 | Snapping something already on the list | ⚑ The photo is attached on added, re-opened or already-there alike, replacing any older photo |
| Q120 | Before Add | ⚑ The waiting photo shows as a thumbnail with ✕ |
| Q121 | Seeing a kept photo | ⚑ A 📷 row marker; the photo in the ✎ form (tap for full size; Replace / Remove / Add) |
| Q122 | Adding a photo in the item form | ⚑ It is not read — the form only keeps it |
| Q123 | Bought items' photos | ⚑ Kept indefinitely; adding the item again re-opens it and brings its photo back |
| Q124 | Names for the SogoAI pieces | ⚑ No renames: `CAPTIONS_TOKEN`, `HOME_CAPTIONS_URL` and the `captions-helper` files keep their names though they now carry `/identify` too |
| Q125 | A person who hasn't chosen speakers (§9.2a) | ⚑ The default speakers (`ECHO_TARGETS` + `SATELLITE_ENTITY`, as before), so nothing changes until someone ticks |
| Q126 | An alert for several people | ⚑ Spoken on every speaker any of them ticked (the union) |
| Q127 | Announcements | ⚑ For every active member: everyone's ticked speakers together |
| Q128 | Nobody it is for has a speaker ticked | ⚑ Not spoken at all; push still goes out. An announcement with House alone is 409 `no_speakers` |
| Q129 | Who sets a person's speakers | ⚑ Only that person, in Settings → Me; admins can't set anyone else's |
| Q130 | Which Alexa entries are not speakers | **Decided by MojoSOGO 2026-10-04: tidy.** ⚑ Matched by name: `This Device` and any name containing `Alexa App` are hidden; everything else Alexa Media Player lists stays |

| Q131 | Sign in with my phone (§6.6): limits | ⚑ A request lives 2 minutes; at most 3 per email per 15 minutes (over that: the same 202, no push); at most one pending per member — a new request turns the old one `denied` (the row is kept, it is the rate-limit count) |
| Q132 | A wrong number on the phone | ⚑ Denies the request; no second try on the same request — the PC starts again |
| Q133 | The "New sign-in on …" push | ⚑ After a **password** sign-in only (not after a phone approval, signup or setup); push only, never house; only to a member with a phone subscribed (none → no row); sent before the login answers |
| Q134 | The approve screen | ⚑ A full page at `/approve-login#{id}`, not a modal; with the phone signed out, the sign-in form shows first and the approve screen follows sign-in (the id kept in `sessionStorage`) |
| Q135 | The notice push title | ⚑ "🔑 Ensō sign-in" for both the request and the new-sign-in notice; the request's body "Sign-in request from Chrome on Windows — tap to check" |
| Q136 | Where the approve screen says the browser is | ⚑ Cloudflare's rough city and country for the waiting browser ("Oceanside, US"), or "Place unknown" |
| Q137 | A request that was approved but not collected in time | ⚑ Expires with the request (2 minutes from creation); the PC says "No answer in 2 minutes." |
| Q138 | A link reading's own link | ⚑ The form's Link stays the pasted link; a link the look-up found (a ticket page, say) may go in the note, never replaces it |
| Q139 | Which budget link readings use | ⚑ The same 40-a-day `photo_reads` budget as photos (one read per tap, counted before Claude is asked); no new table |
| Q140 | How hard a link reading looks | ⚑ At most 3 web searches and 2 page fetches per tap |
| Q141 | Sending a link to Anthropic | ⚑ The link, the page's text and the searches go to Anthropic, as photos do (Q30) |
| Q143 | "Closest" for a link with several locations | ⚑ Closest to the household's own place (Oceanside, the sun-alerts location), which MojoSOGO named "San Diego"; with no place set, every location goes in the note |
| Q144 | Where the movies & shows list lives (§8.14) | ⚑ A third option in the Lists picker, "Movies & shows (n)", not a new tab |
| Q145 | Where to watch: which country | ⚑ The United States only (`WATCH_COUNTRY` `US`); theaters: up to 3 showing it, closest to the household's place |
| Q146 | Which ratings | ⚑ Rotten Tomatoes critics (Tomatometer) and audience (Popcornmeter), as rottentomatoes.com shows them; unknown → "🍅 —" |
| Q147 | Which budget look-ups use | ⚑ The same 40-a-day `photo_reads` budget; each Find, 📷 or Check again is one read |
| Q148 | How hard a look-up looks | ⚑ At most 5 web searches and 3 page fetches |
| Q149 | A video clip itself | ⚑ Not read in v1: paste the clip's link, or screenshot a frame |
| Q150 | The picture a show is found from | ⚑ Read once, never stored |
| Q151 | Saving a look-up | ⚑ Find opens the show form filled; nothing is saved until Save (as a thing's link reading) |
| Q152 | The same show twice | ⚑ Same title (ignoring case and spaces) and year → 409 "… is already on the list.", watched or not |
| Q153 | Editing how to watch | ⚑ Lines can be removed (✕) or refreshed (Check again), not typed by hand |
| Q154 | Who may change a show | ⚑ Anyone in the household: add, edit, mark watched, delete |
| Q155 | The row's way to watch | ⚑ The best option: theater, then stream, tv, rent, buy |
| Q156 | Comments read for a YouTube link | ⚑ The top 20 by relevance (one quota unit), plus the title, channel and description; replies not read; other sites' comments only if Claude's own page fetch shows them |
| Q157 | Lists' emojis | ⚑ A list without its own shows one picked from its name (keyword table in §7A.1, else 📋); Today 🧹, Things to do ✅, Movies & shows 🎬 are fixed |
| Q158 | When the Lists popup opens | ⚑ On every tap of the bottom tab's 🛒 Lists (and the list button), not when the app opens on Lists; closing it stays on the remembered list |
| Q159 | A done load nobody has moved (§7D.2, §8.5) | ⚑ A done washer or dryer offers **Still loaded**: the reminders start over now (alert 1, then every 15 min, 4 in all, Phone + House), saying "… is still in the washer — move it to the dryer" / "… still in the dryer — take it out". Move, Fold & out or Clear stops them as before |
| Q160 | A load nobody started in the app, or one that finished early (§7D.2, §8.5) | ⚑ A free or running machine offers **Done now**: free asks whose load; the machine shows DONE — waiting and the done alerts ring at once, then Still loaded works as usual |
| Q161 | Machine alerts on "all devices" (§7D.3) | Everyone's phones and every speaker HA lists (decided by MojoSOGO 2026-10-05); ⚑ the `Everywhere` group is left out so each Echo speaks once; HA unreadable → the default speakers |
| Q162 | A machine alert outside its hours (§7D.5) | ⚑ It waits and the reminders start over when the hours open (not dropped); only admins edit the hours, on the Machines section |
| Q163 | Who may change what done looks like (§7B.6) | ⚑ Anyone in the household: add, edit and delete areas and their photos (the chore itself stays creator or admin) |
| Q164 | How much a chore's done standard holds | ⚑ Up to 8 areas; each a name ≤ 40, up to 12 expectations ≤ 120 characters, and up to 4 photos |
| Q165 | Ticking expectations (§8.15) | ⚑ Only to walk through the job while the sheet is open; never saved, cleared when it closes |
| Q166 | Where chores live (§8.1, §8.15) | ⚑ Their own 🧹 Chores tab between Alarms and Lists: Today on top, All chores under it; they left Alarms and the Lists popup |
| Q142 | Where "Fill in from this link" sits | ⚑ A full-width button right under the Link field, only when the field holds a usable link; reading starts on the tap, never on paste |
| Q167 | A link's duplicate key (§7E.6) | ⚑ The cleaned link: no fragment; Facebook links on `www.facebook.com` keeping only `v`, `id`, `story_fbid`, `fbid`; elsewhere `utm_*`, `fbclid`, `gclid`, `mibextid`, `igsh`, `igshid`, `si` dropped and the rest kept |
| Q168 | A link recipe's picture and name (§7E.6, §8.12) | ⚑ No thumbnail (nothing stored or hotlinked); the site's name (Facebook, Instagram, TikTok, Pinterest, else the host) in place of the channel |
| Q169 | The transcript, by hand, on a link recipe (§7E.2b) | ⚑ Offered like a video's; nothing is re-fetched — Claude reads the screenshots or text with the recipe's title and site |
| Q170 | Where a link's recipe may come from (§7E.6) | ⚑ The page, the post's or reel's caption, or the creator's own recipe for that dish where the post points to it; never another creator's |
| Q171 | A recipe in another language (§7E.2) | ⚑ Always saved in English, translated faithfully; the original is not kept (the link or video still is) |
| Q172 | Metric amounts (§7E.2) | ⚑ Converted to US units by Claude when read, rounded to kitchen measures (180 °C → 350 °F); the metric original is not kept; typed recipes are never converted |
| Q173 | Screenshots in the recipe form (§8.12, §7E.2b) | ⚑ On every existing recipe, typed ones included; Claude reads them with the title (nothing fetched); a brand-new recipe takes them after its first Save |
| Q174 | A recipe's screenshot as its picture (§7E.2b, §8.12) | ⚑ The first screenshot of the latest successful read is kept and shown whole at the top of the view and as the row's picture, ahead of a YouTube thumbnail; a new read replaces it; no separate upload or remove |
| Q175 | A recipe's picture by hand (§8.12) | ⚑ 📷 Add photo in the recipe form, on new and saved recipes alike, any member; it replaces a kept screenshot and is replaced by a later screenshot read; nothing is read from it |
| Q176 | A recipe's picture in the list (§8.12) | Whole, never cropped, inside the usual 64 × 36 slot; every row the same height (decided by MojoSOGO 2026-10-05); YouTube thumbnails keep their crop |
| Q177 | When a mess goes to To talk about (§7B.7) | ⚑ When everyone asked has said Not me, or 24 h after the report with nobody claiming it |
| Q178 | Who sees balances (§7B.7) | ⚑ Each member sees the pairs they are in; admins see every pair |
| Q179 | Who records the outcome of the house talk (§7B.7) | ⚑ Any admin: whose it was (1 point owed to the reporter) or nobody's (closed) |
| Q180 | Mess sizes (§7B.7) | ⚑ None: every mess is 1 point |
| Q181 | Who settles a point (§7B.7) | ⚑ The one owed (Paid back or Let it go), or an admin |
| Q182 | Taking back "That was me" (§7B.7) | ⚑ Not by the claimer; an admin can record someone else or nobody's |
| Q183 | Pushes for a mess (§7B.7) | Asks to everyone but the reporter, up to 4, 15 min apart, plus an in-app banner until answered (decided by MojoSOGO 2026-10-05); ⚑ one push to each admin when it goes to To talk about; ⚑ never spoken in the house |
| Q184 | Naming the reporter (§7B.7) | ⚑ Yes: "Sam cleaned this up" |
| Q185 | A mess photo (§7B.7) | ⚑ Required to report; deleted when settled, closed or deleted, and at most 30 days after the report |
| Q186 | Counting founder pings (§9.4) | Founder pings are counted by elimination in `src/worker/deliveries.ts` `opsPingsSince` (a fire-less push with a title that is neither a sign-in notice nor a mess ask), so a future kind of fire-less push could quietly count. ⚑ Keep the elimination (tested in `test/deliveries.test.ts`); the alternative is a `deliveries` kind/marker column |
| Q22 | What is an admin? | **Decided by MojoSOGO 2026-10-03:** same powers as the founder; any admin can make/remove admins; the founder can never be demoted or disabled |

---

## 14. Prototype status (2026-10-06)

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

---

## Appendix A — Glossary

| Term | Meaning |
|------|---------|
| **Fire** | One due instance of an alert (one reminder occurrence, or one timer countdown) |
| **Ringing** | A fire that is due and waiting for a human |
| **Ack** | Acknowledge a timer; restarts its countdown from now |
| **Done** | Close a ringing reminder |
| **Relay** | Retired in v1.7.0: the home-PC process that used to speak house alerts. The Worker now speaks them itself through Cloudflare Tunnel + Access (§9.2) |
| **House state** | `ok` / `failing` / `not_configured` / `untried`, derived from the newest finished house delivery (§9.2) |
| **Continuous calendar** | Weeks flow top to bottom with no month-boundary gaps |
| **Materialize** | Create fire rows ahead of time from an event's recurrence |

## Appendix B — References

- Continuous calendars: https://www.jonkrohn.com/posts/2021/6/25/continuous-calendars
- RFC 5545 (RRULE): https://datatracker.ietf.org/doc/html/rfc5545
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- Workers Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Web Push on iOS home-screen apps (iOS 16.4+): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- House announcements: `~/.claude/skills/ha-announce/SKILL.md`; HA setup: `C:\Users\Public\git\HomeAssistant\README.md`
- UI rules: `C:\Users\Public\git\MOJOSOGO-PREFERENCES.md`, `phone-ui` skill
