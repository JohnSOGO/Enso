# Ensō — Specification v2

**Version:** 3.97 · **Date:** 2026-10-27 · **Owner:** MojoSOGO
**Supersedes:** v1.0-draft (kept at `docs/archive/SPEC-v1.0-draft.md` for reference only — do not build from it)

Items marked **⚑ DEFAULT** are best guesses awaiting MojoSOGO's confirmation. Build
them as written; they are isolated so changing one later is a small edit.

**Spec first, always.** Every change to behavior, schema, API or screens is written
here *before* it is built, and the code is then built to match. See `CLAUDE.md`.

---

## 0. Rules for the implementing agent

Read this section first. It exists because the previous build attempt failed on
exactly these points.

1. **Every change carries its acceptance checks** in its own section. The original
   milestones (§11) are done and kept in `docs/history.md`.
2. **`src/shared/vocab.ts` is the only place a vocabulary is defined** (§3 says what
   each term means). Every state, channel, action
   and status string lives there and is imported everywhere —
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
| **Scheduled alarm** | Fires at a set time on chosen **days of the week**, every week. Not a calendar entry. | **Alerts** tab, not drawn on the calendar | "Take out trash" Tue 19:00 · "Morning meds" every day 08:00 |
| **Chore** | A job on chosen days, **rotating** weekly between people, either *at* a time (rings) or *by* a time (quiet). It can be a **loop** of steps that hand off. | **🧹 Chores** tab: Today (tick off), All chores (set up), What done looks like from its **room** (§7B.6, §8.15) | "Laundry": start the washer → move to dryer (60 min later) → fold & put away |
| **Rolling timer** ⚑ name | A countdown that **restarts when acknowledged**, not on a fixed clock. | **Alerts** tab | "Check on the dog", 60 min |
| **Reminder** | A one-off: rings once at a time, then **again and again until someone taps Done** (§8.5b). A scheduled alarm with no repeat. Or random times inside a window on chosen days until Done (§8.5c). | **Alerts** tab → 📌 Reminders | "Get bird food" today after work |

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
  2026-10-05. It is never spoken in the house, never red, and nobody sees a household scoreboard. The one score is
  the bounty score (§7B.8, decided by MojoSOGO 2026-10-11): points earned, everyone's shown by name, never ranked,
  never negative, never red.
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

### 1.3 Scope — what Ensō is for ⚑ Q339

MojoSOGO 2026-10-19: "the ask has to fit with the scope of the app … the app needs to know its scope." Ensō keeps one
household's home life turning. An ask fits when it is about:

- the family's **calendar** and plans, and who is going;
- **reminders, alarms and timers** for the people in the house;
- **chores**, rooms, messes, bounties and who did what;
- **IOUs**: money the household's members owe each other, in US dollars, and paying it back (§7B.9). Ensō **records**
  it; it never moves money (MojoSOGO 2026-10-20 "Add to Ensos scope a family IOU system" … "This is for real money USD");
- the **house** itself: its machines (washer, dryer, dish washer, cooking), its speakers and announcements, quiet times,
  and its **devices in Home Assistant**, room by room (the AC, lights, switches, fans: §9.2e; MojoSOGO 2026-10-27);
- the household's **lists**: shopping, wishes, to-dos, every day lists, movies and shows, things shared in;
- **recipes** and cooking;
- the **members** of the household and their settings.

It does not fit when it is about the list below. Ensō says so instead of offering to build it, and logs the ask as
**Out of scope** for John to review (he may widen the scope; "still log the ask as out of scope for my review"):

- **buying, ordering or paying** (stores, Amazon, deliveries, bills). Ensō keeps the list, not the cart;
- **money** beyond who owes whom in the house: moving or sending money (Venmo, bank transfers, cards), banking,
  budgets, investing, trading;
- **work or school systems**, or other apps, websites or accounts to log into or control (the house's own Home
  Assistant is not one: Ensō already speaks through it and runs the devices put in a room, §9.2e);
- **general questions, chat, search or news** (Ensō is not an assistant for everything);
- **people outside the household**, or anything to do with them that isn't the household's own plan.

When unsure, it fits and is a **big** request, so John decides (§8.18). The reading's copy of this scope lives beside
ENSO_DOES in `src/worker/say-reader.ts`; a change here changes it there. The build gate (CLAUDE.md "Feature requests")
dismisses an open request that does not fit.

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
            |    https://sogoai.sogodojo.com/note-marks + Bearer CAPTIONS_TOKEN (in-line, §8.4a)
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
  |                                          |   POST /note-marks (notes text) -> the PC
  |                                          |   model manager (127.0.0.1:8793 /state),
  |                                          |   then LM Studio -> a NoteMarksReport (§8.4a)
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
| Photo storage | Cloudflare **R2** bucket `enso-photos`, binding `PHOTOS` | Eight attachments, all through `src/worker/photo-store.ts`: a thing's photo (`things/…`, §7C.3), a list item's photo (`list-items/…`, §7A.3), room-area photos (`chore-areas/…`, the prefix kept from before rooms, §7B.6), mess photos (`messes/…`, §7B.7), a bounty's picture and its done photo (`bounties/…`, `earnings/…`, §7B.8), a recipe's picture (`recipes/…`, §7E.2b, §8.12) and a shared photo in my Inbox (`inbox/…`, §7H). Private: photos are served only through the API to signed-in members. |
| Reading photos and recipes | **Claude API** via the official `@anthropic-ai/sdk`, model `claude-opus-5-5`, structured output (§7C.4, §7A.3, §7E) | Secret `ANTHROPIC_API_KEY`. Server-side refusal fallback on (`fallbacks: "default"`). One caller of the SDK: `src/worker/claude.ts`. A snapped list item is read by SogoAI first and by Claude only when SogoAI gives no name (§7A.3). |
| Naming a snapped item at home | **LM Studio** on SogoAI, `http://127.0.0.1:1234/v1/chat/completions` (OpenAI-compatible), the small vision chat model SogoAI keeps loaded, named by `IDENTIFY_MODEL` (`photo-polish`) (§7A.3) | Free. Reached only by the SogoAI helper, never by the Worker directly. |
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
│   │   ├── moon.ts         # §7.12
│   │   ├── lists.ts        # §7A.1 item rules: itemKey, add/reopen decision, limits, 30-day window
│   │   ├── item-reading.ts # §7A.3 naming a snapped item: the prompt, cleanItemName, the helper's report
│   │   ├── machines.ts     # §7D the laundry loop + dish washer: state, transitions, done message
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
│   ├── captions-helper.ts  # 127.0.0.1:8790 GET /captions?v=… → readCaptions from the home IP; POST /identify → identify.ts; POST /note-marks → note-marks.ts
│   ├── identify.ts         # §7A.3 one photo → LM Studio's local vision model → an IdentifyReport
│   ├── note-marks.ts       # §8.4a a notes text → model-manager.ts, then LM Studio → a NoteMarksReport
│   ├── model-manager.ts    # §8.4a may the loaded model be used now? (the PC model manager's GET /state)
│   ├── lm-studio.ts        # §7A.3, §8.4a the one LM Studio chat-completions call
│   ├── captions-helper.cmd # the Task Scheduler launcher (node --env-file, appends to a log)
│   ├── tsconfig.json       # Node types; part of `npm run typecheck`
│   └── dist/               # `npm run build:home` output (gitignored)
├── scripts/
│   ├── dev-seed.json, seed-dev.mjs   # `npm run seed:dev`
│   ├── arch.ts             # §2.5 caps, layering bans, source scan — their ONE home
│   ├── arch-types.ts       # the scan's shapes (Node-free, so the test can import them)
│   ├── arch-audit.ts       # `npm run arch:audit` headroom report
│   ├── pending-migrations.ts # the deploy gate's verdict (§10.1), Node-free
│   └── predeploy.ts        # `predeploy`: asks wrangler, applies the verdict
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
| `HOME_CAPTIONS_URL` (var, `wrangler.toml`) | Worker | Where the SogoAI helper is reached: `https://sogoai.sogodojo.com` (§7E.2c), for `/captions`, `/identify` (§7A.3) and `/note-marks` (§8.4a) alike. Tests pin `https://sogoai.test`, which only a fetch spy answers. |
| `IDENTIFY_MODEL` (SogoAI's `C:\Enso\captions-helper.env`, not a Worker setting) | SogoAI helper | The LM Studio model id `/identify` and `/note-marks` ask (§7A.3, §8.4a): `photo-polish`, the one small vision chat model SogoAI keeps loaded ⚑ Q115. `/note-marks` asks it only while the PC model manager shows it loaded. Unset or empty → `/identify` answers `{ ok: false, kind: "off" }` (the Worker then asks Claude) and `/note-marks` answers `off` (patterns); captions keep working and the helper still starts. Not a secret. |
| `OPS_NOTIFY_TOKEN` (secret) | Worker **and** MojoSOGO's machines (`%USERPROFILE%\.enso\ops-notify-token`) | The bearer a Claude Code session sends to `POST /ops/notify` to push a message to the founder's phone (§9.4), checked in constant time. A long random string, set with `npx wrangler secret put OPS_NOTIFY_TOKEN` in a real PowerShell window and the same value in the token file (never in the repo). Unset or empty → `/ops/notify` is 503 `ops_notify_off` (never open). Never logged, never in a message or a delivery's detail. Tests pin a test-only value. |
| `BUILD_FIRE_URL` (var, `wrangler.toml`), `BUILD_FIRE_TOKEN` (secret) | Worker | Build now (§8.18 part 6): the "Enso daily feature requests" routine's API fire address (`https://api.anthropic.com/v1/claude_code/routines/{id}/fire`) and its bearer, made once at claude.ai/code/routines → the routine → Edit → Add another trigger → API → Generate token, set with `npx wrangler secret put BUILD_FIRE_TOKEN` in a real PowerShell window. Either empty → `/feature-requests/{id}/build` is 503 `build_now_off`. Never logged or shown. |

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
  `src/shared/item-reading.ts` and `src/shared/note-marks.ts` (and its own siblings), and no package **except** `node:http`
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

The tuples themselves are in `src/shared/vocab.ts`, each a `const` tuple with its type derived from it
(`export type Channel = typeof CHANNEL[number]`). That file is the only definition; it is not copied here.
This table says what each term means.

| Term | Meaning |
|------|---------|
| `push` | Web Push to the phone(s) of the recipients (§5.4) |
| `house` | Spoken on **all four Echos and the Voice PE** — the Worker calls Home Assistant through Cloudflare Tunnel + Access (§9.2). One announcement per alert, not per person. |
| `funhouse` | Shown on the **FunHouse** desk device on the dev PC, through its poller (§9.4b). One per alert, not per person. |
| `scheduled` | Fire exists, due in the future (or snoozed) |
| `ringing` | Due time passed, alert sent, waiting for a human |
| `closed` | Finished; `close_reason` says why |
| `done` | Someone tapped Done on a reminder |
| `acked` | Someone tapped Ack on a timer (the timer restarts) |
| `missed` | A reminder was more than 60 min overdue when the engine first saw it (outage) — closed without alerting |
| `chore` | A fire for one step of one chore run (§7B) |
| `machine` | A fire for one load in one machine, due when the machine is done (§7D) |
| `washer` / `dryer` | The two laundry machines, shown as **Clothes washer** / **Clothes dryer** (§7D); the washer's load moves on to the dryer |
| `dishwasher` | The **Dish washer** (§7D.6): started and done like the laundry machines, on its own (no next machine) |
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
| `paid` / `let_go` / `tab` (IOU payment) | An IOU payment (§7B.9): money paid back, outside Ensō / an amount the one owed let go / a split bill taken off the payer's tab instead of a new IOU |
| `week` / `2weeks` / `month` (payback plan) | How often a payback plan is due (§7B.9): every week, every 2 weeks, every month, from its start date |
| `open` / `taken` / `pending` / `paid` (bounty) | A one-off bounty (§7B.8): anyone can take it / someone said I'll do it in the last 3 h / done, waiting for an admin's OK / OK'd, its points count — derived, never stored |
| `open` / `discuss` / `owed` / `closed` / `settled` (mess) | A mess report (§7B.7): asking who left it / on To talk about / claimed or recorded, a point owed / closed as nobody's / the point paid back or let go — derived from the row |
| `sogoai` / `claude` | Who named a snapped item (§7A.3): SogoAI's local vision model (free) / the Claude API (the fallback) |
| `great` / `steady` / `distracted` / `struggling` / `break` (task mood) | A task check-in answer (§7G.3): 🚀 Great! / 👍 Steady! / 🦋 Got distracted / 😩 Struggling / ☕ Taking a break |
| `finished` / `stopped` (task outcome) | How a task session ended (§7G.6): Finish / Stop for now. A running, paused or on-break session has none |
| `at` | Chore rings at its time, like an alarm |
| `by` | Chore is quiet: due by its time, optionally one nudge then |
| `superseded` | A newer occurrence of the same event started ringing while this one still was |
| `stopped` | The timer was stopped |
| `removed` | The event or timer was edited or deleted, making this fire obsolete |
| `partial` | House delivery reached some surfaces but not all |
| `ok` / `failing` | House state (§9.2): the newest finished house delivery is `sent`/`partial` / is `failed` |
| `not_configured` | House state: one of the seven House settings (§9.2) is missing — nothing is spoken |
| `untried` | House state: configured, but no house delivery has finished yet |
| `climate` / `light` / `switch` / `fan` (device domain) | The kinds of Home Assistant device a room can hold (§9.2e), read from the entity id's prefix: an AC or thermostat / a light / a plug or switch / a fan |
| `on` / `off` / `mode` / `target` (device action) | What a tap asks of a device (§9.2e): turn it on / off / set an AC's mode / set its target temperature |

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

Schema: [`migrations/0001_init.sql`](migrations/0001_init.sql). The migration is the schema; it is not copied here.

Notes on it:
- `relay_last_seen`: was the relay's heartbeat; DROPPED by 0013 (§4.2l)
- `color`: from §6.5 palette

The `CHECK` lists in the migrations necessarily repeat the vocabularies as SQL text. Test **M1-VOCAB** reads the
`CHECK`s **in force** from the migrated database's own schema (`sqlite_master`), not from
migration text — so a table rebuilt or a column dropped by a later migration is judged by
what actually exists. It asserts
that each `CHECK` list matches the corresponding `vocab.ts` tuple exactly. That
test is what keeps the two in step.

### 4.2a Schema change — `migrations/0002_alarms.sql`

Schema: [`migrations/0002_alarms.sql`](migrations/0002_alarms.sql). The migration is the schema; it is not copied here.

Notes on it:
- A scheduled alarm (§1) is stored as an event with is_alarm = 1. It reuses the event recurrence + reminder + fire machinery unchanged; only its presentation differs.

An alarm row always has: `start_time` set (never all-day), `recurrence =
{"freq":"WEEKLY","byDay":[...]}` with at least one day, `remind_offset_min = 0`,
`start_date` = the local date it was created, `end_date = start_date`.

A **reminder** (§8.5b) is the same row with `recurrence` NULL: `start_date` / `start_time` = when it first rings,
`max_alerts = REMINDER_MAX_ALERTS`. No schema change.

### 4.2b Schema change — `migrations/0003_days_off.sql`

Schema: [`migrations/0003_days_off.sql`](migrations/0003_days_off.sql). The migration is the schema; it is not copied here.

Notes on it:
- Household days off (§7.3): JSON array of HOLIDAYS keys; NULL = DEFAULT_DAYS_OFF.

### 4.2c Schema change — `migrations/0004_options_expiration.sql`

Schema: [`migrations/0004_options_expiration.sql`](migrations/0004_options_expiration.sql). The migration is the schema; it is not copied here.

Notes on it:
- Per-member switch for the 📈 monthly options expiration marker (§7.4).

### 4.2d Schema change — `migrations/0005_lists.sql`

Schema: [`migrations/0005_lists.sql`](migrations/0005_lists.sql). The migration is the schema; it is not copied here.

### 4.2e Schema change — `migrations/0006_chores.sql`

Schema: [`migrations/0006_chores.sql`](migrations/0006_chores.sql). The migration is the schema; it is not copied here.

**Migration check (M4c):** a test applies 0001–0005, inserts a reminder fire, a timer
fire and a delivery, applies 0006, and finds all three intact with the delivery still
pointing at its fire.

### 4.2f Schema change — `migrations/0007_custom_lists.sql`

Schema: [`migrations/0007_custom_lists.sql`](migrations/0007_custom_lists.sql). The migration is the schema; it is not copied here.

The seed timestamps are fixed literals (never `datetime('now')`, §4.1).

### 4.2g Schema change — `migrations/0008_things_to_do.sql`

Schema: [`migrations/0008_things_to_do.sql`](migrations/0008_things_to_do.sql). The migration is the schema; it is not copied here.

**Migration check (M4g):** like C13 — fires of every existing kind and their deliveries
survive 0008; `PRAGMA foreign_key_check` is empty.

### 4.2h Schema change — `migrations/0009_optional_events.sql`

Schema: [`migrations/0009_optional_events.sql`](migrations/0009_optional_events.sql). The migration is the schema; it is not copied here.

### 4.2i Schema change — `migrations/0010_calendar_tidy.sql`

Schema: [`migrations/0010_calendar_tidy.sql`](migrations/0010_calendar_tidy.sql). The migration is the schema; it is not copied here.

### 4.2j Schema change — `migrations/0011_thing_details.sql`

Schema: [`migrations/0011_thing_details.sql`](migrations/0011_thing_details.sql). The migration is the schema; it is not copied here.

### 4.2k Schema change — `migrations/0012_announcements.sql`

Schema: [`migrations/0012_announcements.sql`](migrations/0012_announcements.sql). The migration is the schema; it is not copied here.

`alert_number` stays `NOT NULL`; an announcement's deliveries carry `1`.
**Migration check (AN8):** like C13 — deliveries written under 0001–0011 survive 0012
unchanged, `PRAGMA foreign_key_check` is empty, and afterwards a delivery with
`fire_id NULL` is accepted.

### 4.2l Schema change — `migrations/0013_retire_relay.sql`

Schema: [`migrations/0013_retire_relay.sql`](migrations/0013_retire_relay.sql). The migration is the schema; it is not copied here.

Notes on it:
- §9.2 — the relay is retired (v1.7.0); its heartbeat column goes with it. House health is derived from the deliveries table instead (houseState), never stored.

**Migration check (H9):** the `settings` row survives 0013 with its name, time zone and days
off unchanged, and `relay_last_seen` is no longer a column.

### 4.2m Schema change — `migrations/0014_machines.sql`

Schema: [`migrations/0014_machines.sql`](migrations/0014_machines.sql). The migration is the schema; it is not copied here.

Notes on it:
- fires is rebuilt exactly like 0006/0008, deliveries stashed and restored.
- copy fires (machine_id NULL), stash deliveries, drop, rename, restore, recreate every 0008 index.

There is no CHECK on `machines.id` (the vocabulary lives in `vocab.ts`). Seeds carry literal
timestamps, never `datetime('now')`. **Done-waiting is never stored:** a machine is `done` when
its owner is set and `now ≥ done_at`.
**Migration check (L13):** like C13 — fires of every earlier kind and their deliveries survive
0014, `PRAGMA foreign_key_check` is empty, both machines are seeded free, and a `machine` fire
without `machine_id` is refused by the CHECK.
(0037 seeds a third machine, the dish washer, §4.2zj.)

### 4.2n Schema change — `migrations/0015_timer_window.sql`

Schema: [`migrations/0015_timer_window.sql`](migrations/0015_timer_window.sql). The migration is the schema; it is not copied here.

Notes on it:
- §5.3 rule 0 — a rolling timer's optional active time range, local wall time HH:MM in the household timezone (§4.1). Both NULL = no window (rings at any hour, as before).

There is no CHECK: the route validates (both null, or both `HH:MM` and `timerWindowError` is
null). `from > to` is an overnight window (22:00–06:00).
**Migration check (TW-M):** timers that exist before 0015 survive it unchanged, with
`active_from` and `active_to` NULL — they keep today's behavior.

### 4.2o Schema change — `migrations/0016_sun_alerts.sql`

Schema: [`migrations/0016_sun_alerts.sql`](migrations/0016_sun_alerts.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7.7 — sun-timed alerts: the household's place, and an event whose start is the sunset.

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

Schema: [`migrations/0017_recipes.sql`](migrations/0017_recipes.sql). The migration is the schema; it is not copied here.

Notes on it:
- `title`: 1–RECIPE_TITLE_MAX; the dish, else the video's title
- `servings`: free text as stated ("4", "serves 6–8")
- `time_text`: free text as stated ("45 min")
- `source`: JSON RECIPE_SOURCE[]: what was read (§7E.1)

There is **no url or thumbnail column**: both are derived from `video_id` (`watchUrl`,
`thumbnailUrl`, §7E.1). `source` holds a JSON list, so it has no CHECK; the route writes only
`RECIPE_SOURCE` values. Nothing existing is rebuilt or altered.
**Migration check (RC-M):** rows written under 0001–0016 (members, things, list items) survive
0017 unchanged; a second live recipe for one video is refused by `uq_recipe_video`, while a
soft-deleted one does not block it and any number of typed recipes (NULL `video_id`) coexist.

### 4.2q Schema change — `migrations/0018_recipe_emojis.sql`

Schema: [`migrations/0018_recipe_emojis.sql`](migrations/0018_recipe_emojis.sql). The migration is the schema; it is not copied here.

Written only by `PUT /recipes/{id}/emoji` as an upsert (`INSERT … ON CONFLICT(recipe_id,
member_id) DO UPDATE`) and removed by `DELETE /recipes/{id}/emoji`. A soft-deleted recipe keeps its
rows; they are never returned, because only live recipes are ⚑ Q75. Nothing existing is rebuilt or
altered.
**Migration check (RE-M):** rows written under 0001–0017 (members, things, list items, recipes)
survive 0018 unchanged; the primary key refuses a second row for the same member and recipe.

### 4.2r Schema change — `migrations/0019_recipe_comments.sql`

Schema: [`migrations/0019_recipe_comments.sql`](migrations/0019_recipe_comments.sql). The migration is the schema; it is not copied here.

Set only by `POST /recipes/from-video` (§7E.2 step 8) when the comments lookup failed by quota or
otherwise; comments turned off, or no comment by the creator among them, leave it NULL ⚑ Q78. PATCH
never touches it. `source` holds a JSON list, so the new `comments` value needs no CHECK and nothing
is rebuilt.
**Migration check (CM-M):** rows written under 0001–0018 (members, things, list items, recipes,
recipe reads, recipe emojis) survive 0019 unchanged, and every existing recipe has `comments_error`
NULL.

### 4.2s Schema change — `migrations/0020_recipe_captions_job.sql`

Schema: [`migrations/0020_recipe_captions_job.sql`](migrations/0020_recipe_captions_job.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7E.2c — the captions-from-home job on a recipe row. Additive only.

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

Schema: [`migrations/0021_drop_captions_job.sql`](migrations/0021_drop_captions_job.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7E.2c — the captions-from-home job is gone: the Worker asks SogoAI in-line.

The index goes first (SQLite refuses to drop an indexed column). 0020's CHECK is column-level, so
`DROP COLUMN` needs no table rebuild. A recipe whose job was pending when 0021 ran keeps its
`captions_error` (the blocked reason) and simply shows the transcript box (§8.12).
**Migration check (CJ-D):** rows written under 0001–0020 survive 0021; the four columns are gone from
`PRAGMA table_info(recipes)`; `idx_recipes_captions_job` is gone; `PRAGMA foreign_key_check` is empty;
`recipe_emojis` is intact.

### 4.2u Schema change — `migrations/0022_delivery_title.sql`

Decided by MojoSOGO 2026-10-04: a Claude Code session can ping the founder's phone (§9.4). Its push
carries the caller's title, so a fire-less delivery may now carry its own title.

Schema: [`migrations/0022_delivery_title.sql`](migrations/0022_delivery_title.sql). The migration is the schema; it is not copied here.

Notes on it:
- §9.4 — a fire-less push delivery may carry its own push title (ops/notify); NULL elsewhere.

`title` is NULL on every existing row and on every fire, announcement and house delivery; only
`POST /ops/notify` writes it. `sendPushDeliveries` shows a fire-less delivery as `title ?? ANNOUNCE_TITLE`
(§9.1). The column is also what the hourly limit counts by (§9.4). **Migration check (ON-M):** rows
written under 0001–0021 survive 0022 unchanged with `title` NULL; `PRAGMA foreign_key_check` is empty.

### 4.2v Schema change — `migrations/0023_list_item_photo.sql`

Decided by MojoSOGO 2026-10-04: a snapped item keeps its photo (§7A.3).

Schema: [`migrations/0023_list_item_photo.sql`](migrations/0023_list_item_photo.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7A.3 — a list item's photo: its R2 key (list-items/{itemId}/{random}.jpg), NULL when it has none.

`photo_key` is NULL on every existing row. It is written only by `PUT /list-items/{id}/photo` and cleared by
`DELETE /list-items/{id}/photo`, by deleting the item and by deleting its list (§7A.1). It is never sent on the
wire: an item carries `hasPhoto` instead. **Migration check (SN-M):** rows written under 0001–0022 survive 0023
unchanged with `photo_key` NULL; `PRAGMA foreign_key_check` is empty.

### 4.2w Schema change — `migrations/0024_house_speakers.sql`

Decided by MojoSOGO 2026-10-04: each person ticks the house speakers they want to be alerted on (§9.2a).

Schema: [`migrations/0024_house_speakers.sql`](migrations/0024_house_speakers.sql). The migration is the schema; it is not copied here.

Notes on it:
- §9.2a — the house speakers a member chose: a JSON list of HA entity ids; NULL = not chosen (the default speakers).
- §9.2a — the speakers a house delivery is spoken on, fixed when it is written; NULL = the default speakers.

Both are NULL on every existing row, so every existing member has not chosen and every queued house row
speaks on the default speakers, exactly as before. `house_speakers` is written only by `PATCH /me`;
`deliveries.speakers` only by the two writers of house rows (tick step 2 and `POST /announce`). A push row's
`speakers` is always NULL. **Migration check (HS-M):** rows written under 0001–0023 survive 0024 unchanged
with both columns NULL; `PRAGMA foreign_key_check` is empty.

### 4.2x Schema change — `migrations/0025_phone_login.sql`

Decided by MojoSOGO 2026-10-04: a browser can be signed in by approving it on the member's phone (§6.6).

Schema: [`migrations/0025_phone_login.sql`](migrations/0025_phone_login.sql). The migration is the schema; it is not copied here.

Notes on it:
- §6.6 — one row per "Sign in with my phone" request. Rows are never deleted: they are the rate-limit count.
- `member_id`: NULL = a decoy: no usable member, or over the limit (§6.6)
- `user_agent`: the waiting browser's, ≤ 300 chars
- `place`: "City, CC" from Cloudflare's request.cf; NULL = unknown
- §6.6 — a push that is a sign-in notice (no fire), and where tapping it goes.

Additive only. The column is `match_number`, not `match` (`MATCH` is an SQLite operator). `notice` and `url` are
NULL on every existing row and on every fire, announcement, ping and house delivery; only §6.6 writes them. M1-VOCAB
covers `login_requests.status` (`LOGIN_REQUEST_STATUS`) and `deliveries.notice` (`NOTICE_KIND`). **Migration check
(PL-M):** rows written under 0001–0023 survive 0025 unchanged with `notice` and `url` NULL; `login_requests` exists
empty; `PRAGMA foreign_key_check` is empty.

### 4.2y Schema change — `migrations/0026_shows.sql`

Asked by MojoSOGO 2026-10-05: the household's movies & shows list (§7F).

Schema: [`migrations/0026_shows.sql`](migrations/0026_shows.sql). The migration is the schema; it is not copied here.

Additive only. M1-VOCAB covers `shows.kind` (`SHOW_KIND`) and `shows.status` (`SHOW_STATUS`); `watch[].how`
(`WATCH_HOW`) is JSON, checked by `parseShowInput`. **Migration check (W-M):** rows written under 0001–0025
survive unchanged; `shows` exists empty; `PRAGMA foreign_key_check` is empty.

A schema change is always a **new** numbered migration plus a §4.2x section here.
An applied migration is never edited.

### 4.2z Schema change — `migrations/0027_list_emoji.sql`

Asked by MojoSOGO 2026-10-05: each list shows an emoji in the Lists picker (§8.8).

Schema: [`migrations/0027_list_emoji.sql`](migrations/0027_list_emoji.sql). The migration is the schema; it is not copied here.

Additive only. **Migration check (LE-M):** rows written under 0001–0026 survive unchanged with `emoji` NULL;
`PRAGMA foreign_key_check` is empty.

### 4.2za Schema change — `migrations/0028_machine_hours.sql`

Asked by MojoSOGO 2026-10-05: the machines' alerts sound only in their hours (§7D.5).

Schema: [`migrations/0028_machine_hours.sql`](migrations/0028_machine_hours.sql). The migration is the schema; it is not copied here.

Additive only; the existing settings row takes the defaults. Checked by L21 (`GET /machines/hours` reads
`DEFAULT_MACHINE_HOURS` after the migration).

### 4.2zb Schema change — `migrations/0029_chore_areas.sql`

Asked by MojoSOGO 2026-10-05: each chore gets "an area for what done looks like with specific areas, pictures
and a list of expectations" (§7B.6).

Schema: [`migrations/0029_chore_areas.sql`](migrations/0029_chore_areas.sql). The migration is the schema; it is not copied here.

Additive only. Areas are deleted outright (they are reference, not history): `DELETE /chore-areas/{id}` and
deleting their chore remove the rows and the R2 objects. **Migration check (CA-M):** rows written under 0001–0028
survive 0029 unchanged; `PRAGMA foreign_key_check` is empty.

### 4.2zc Schema change — `migrations/0030_recipe_links.sql`

Asked by MojoSOGO 2026-10-05: recipes from Facebook links and any web page, not only YouTube (§7E.6).

Schema: [`migrations/0030_recipe_links.sql`](migrations/0030_recipe_links.sql). The migration is the schema; it is not copied here.

A link recipe keeps `video_id` and `video_title` NULL and its site's name ("Facebook", "allrecipes.com") in
`channel`. **Migration check (RL-M):** rows written under 0001–0029 survive 0030 unchanged, existing recipes
have `link` NULL; a second live recipe for one link is refused by `uq_recipe_link`, a soft-deleted one does not
block it.

### 4.2zd Schema change — `migrations/0031_recipe_photo.sql`

Asked by MojoSOGO 2026-10-05 (§7E.2b ⚑ Q174).

Schema: [`migrations/0031_recipe_photo.sql`](migrations/0031_recipe_photo.sql). The migration is the schema; it is not copied here.

**Migration check (RP-M):** rows written under 0001–0030 survive 0031 unchanged, `photo_key` NULL.

### 4.2ze Schema change — `migrations/0032_messes.sql`

Asked by MojoSOGO 2026-10-05 (§7B.7).

Schema: [`migrations/0032_messes.sql`](migrations/0032_messes.sql). The migration is the schema; it is not copied here.

Additive only. `deliveries.mess_id` is NULL on every existing row and on every delivery but a mess's asks and its
To talk about notice. Messes are soft-deleted (their asks point at them). **Migration check (MS-M):** rows written
under 0001–0031 survive 0032 unchanged with `mess_id` NULL; `PRAGMA foreign_key_check` is empty.

### 4.2zf Schema change — `migrations/0033_timer_announce.sql`

Asked by MojoSOGO 2026-10-08 (§5.5a).

Schema: [`migrations/0033_timer_announce.sql`](migrations/0033_timer_announce.sql). The migration is the schema; it is not copied here.

Notes on it:
- §5.5a — a rolling timer can announce the start of its day. Additive only.

**Migration check (TS-M):** timers written under 0001–0032 survive 0033 unchanged with `announce_start` 0 and
`announced_on` NULL — none of them announces anything.

### 4.2zg Schema change — `migrations/0034_event_address.sql`

Asked by MojoSOGO 2026-10-09 (§7.9).

Schema: [`migrations/0034_event_address.sql`](migrations/0034_event_address.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7.9 — an event's address (optional). Additive only.

**Migration check (EA-M):** events written under 0001–0033 survive 0034 unchanged with `address` NULL.

### 4.2zh Schema change — `migrations/0035_event_bring.sql`

Asked by MojoSOGO 2026-10-10 (§7.10).

Schema: [`migrations/0035_event_bring.sql`](migrations/0035_event_bring.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7.10 — an event's things to bring (optional). Additive only.
- `ALTER`: NULL = none; else a JSON list of 1–EVENT_BRING_MAX lines

**Migration check (EB-M):** events written under 0001–0034 survive 0035 unchanged with `bring` NULL.

### 4.2zi Schema change — `migrations/0036_weather.sql`

Asked by MojoSOGO 2026-10-10 (§7.11).

Schema: [`migrations/0036_weather.sql`](migrations/0036_weather.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7.11 — the daily forecast shown on the calendar. Additive only.

**Migration check (WX-M):** settings written under 0001–0035 survive 0036 unchanged with `weather_tried_at` NULL;
`weather_days` starts empty.

### 4.2zj Schema change — `migrations/0037_dishwasher.sql`

Asked by MojoSOGO 2026-10-10 (§7D.6).

Schema: [`migrations/0037_dishwasher.sql`](migrations/0037_dishwasher.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7D.6 — the dish washer: a third machines row, seeded free. Additive only.

**Migration check (DW-M):** the washer and dryer rows (a running load included) and their open fires survive 0037
unchanged; the dish washer is seeded free.

### 4.2zk Schema change — `migrations/0038_house_quiet.sql`

Asked by MojoSOGO 2026-10-10 (§9.2b).

Schema: [`migrations/0038_house_quiet.sql`](migrations/0038_house_quiet.sql). The migration is the schema; it is not copied here.

Notes on it:
- §9.2b — quiet the house: speakers say nothing until this instant. Additive only.

**Migration check (HQ-M):** the settings row survives 0038 unchanged with both columns NULL (not quiet).

### 4.2zl Schema change — `migrations/0039_fire_away.sql`

Asked by MojoSOGO 2026-10-10 (§9.2c).

Schema: [`migrations/0039_fire_away.sql`](migrations/0039_fire_away.sql). The migration is the schema; it is not copied here.

Notes on it:
- §9.2c — "I'm away" on one alert: its speakers stop, it stays open. Additive only.

**Migration check (AW-M):** fires and deliveries survive 0039 unchanged with both columns NULL.

### 4.2zm Schema change — `migrations/0040_machine_alert.sql`

Asked by MojoSOGO 2026-10-11 (§7D.7).

Schema: [`migrations/0040_machine_alert.sql`](migrations/0040_machine_alert.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7D.7 — who is alerted when a machine's load is done; NULL = nobody (phones only: no speaker, no FunHouse). Additive only.

**Migration check (AL-M):** machine rows and open fires survive 0040; a loaded machine's `alert_id` is its owner,
a free or owner-unknown one NULL.

### 4.2zn Schema change — `migrations/0041_alert_dismiss.sql`

Asked by MojoSOGO 2026-10-11 (§9.5).

Schema: [`migrations/0041_alert_dismiss.sql`](migrations/0041_alert_dismiss.sql). The migration is the schema; it is not copied here.

**Migration check (MA-M):** delivery rows survive 0041 unchanged, each with `dismissed_at` NULL.

### 4.2zo Schema change — `migrations/0042_funhouse_channel.sql`

Asked by MojoSOGO 2026-10-11 (§9.4b).

Schema: [`migrations/0042_funhouse_channel.sql`](migrations/0042_funhouse_channel.sql). The migration is the schema; it is not copied here.

Notes on it:
- §9.4b — a delivery may be on the `funhouse` channel. SQLite cannot change a CHECK, so `deliveries` is rebuilt
  (as 0012 did) with every column, both CHECKs and its three indexes; only the channel list grows. Old code still
  writes only `push` and `house`, so it runs before the deploy.

**Migration check (FH-M):** every delivery row survives 0042 with every column unchanged; a `funhouse` row can be
written; a `bogus` channel is still refused.

### 4.2zp Schema change — `migrations/0043_cooking.sql`

Asked by MojoSOGO 2026-10-11 (§7D.8).

Schema: [`migrations/0043_cooking.sql`](migrations/0043_cooking.sql). The migration is the schema; it is not copied here.

Notes on it:
- §7D.8 — a cooking timer is a `machines` row created on demand, so a `machine` fire can point at it unchanged:
  `cook_kind` (NULL for the three fixed machines), `name`, `created_at`, `closed_at`. Additive only; it runs before
  the deploy.

**Migration check (CK-M):** see §7D.8.

### 4.2zq Schema change — `migrations/0044_bounties.sql`

Asked by MojoSOGO 2026-10-11 (§7B.8).

Schema: [`migrations/0044_bounties.sql`](migrations/0044_bounties.sql). The migration is the schema; it is not copied here.

Notes on it:
- `chores.bounty` — the points a run pays its finisher; NULL = none.
- `bounties` — the one-offs; soft-deleted (pushes point at them). The dib is `taken_by` + `taken_at`; it lapses by
  time alone, so nothing clears it.
- `earnings` — one row per piece of work done: exactly one of `bounty_id` / `chore_run_id`, the earner, the points
  copied then, `ok_by`/`ok_at`, and `dropped_at` for Not yet or Undo (never deleted: waiting pushes point at them).
  At most one live earning per bounty and per run (partial unique indexes).
- `deliveries.bounty_id` / `deliveries.earning_id` mark the two bounty pushes so the founder-ping predicate (§9.4)
  leaves them out.

Additive only; it runs before the deploy. **Migration check (BT-M):** see §7B.8.

### 4.2zr Schema change — `migrations/0045_earning_photo.sql`

Asked by MojoSOGO 2026-10-11 (§7B.8, a done photo).

Schema: [`migrations/0045_earning_photo.sql`](migrations/0045_earning_photo.sql). The migration is the schema; it is not copied here.

`earnings.photo_key` — the done photo's private R2 key; NULL = none, or deleted on OK or drop. Additive only; it runs
before the deploy. **Migration check (BT-M2):** see §7B.8.

### 4.2zs Schema change — `migrations/0046_bounty_photo.sql`

Asked by MojoSOGO 2026-10-11 (§7B.8, a bounty's picture).

Schema: [`migrations/0046_bounty_photo.sql`](migrations/0046_bounty_photo.sql). The migration is the schema; it is not copied here.

`bounties.photo_key` — the picture's private R2 key; NULL = none, or deleted when paid or deleted. Additive only; it
runs before the deploy. **Migration check (BT-M3):** see §7B.8.

### 4.2zt Schema change — `migrations/0047_rooms.sql`

Asked by MojoSOGO 2026-10-12: "define rooms as its own thing, then chores get assigned to the room. The room is
what the room should look like when complete … do not lose the kitchen we have" (§7B.6).

Schema: [`migrations/0047_rooms.sql`](migrations/0047_rooms.sql). The migration is the schema; it is not copied here.

Adds `rooms` and `chores.room_id` (NULL = no room). `chore_areas` / `chore_area_photos` are rebuilt as `room_areas` /
`room_area_photos` (an area now belongs to a room). **Lossless:** every chore that had areas becomes a room of its
title (`rom_` + the chore id's suffix, its creator and times kept) and points at it; every area and photo row keeps
its id, name, expectations, position and R2 key, so nothing in R2 moves. A chore without areas gets no room.
**Migration check (RM-M):** the Kitchen chore's areas and photo come through unchanged under the Kitchen room; the old
tables are gone; `PRAGMA foreign_key_check` is empty.

### 4.2zu Schema change — `migrations/0048_chore_sun.sql`

Asked by MojoSOGO 2026-10-12: "an alarm chore that can be assigned to anyone to get the eggs 30 minutes before
sundown" (§7B.3, a chore timed by the sunset).

Schema: [`migrations/0048_chore_sun.sql`](migrations/0048_chore_sun.sql). The migration is the schema; it is not copied here.

`chores.sun_offset_min` — NULL = the chore's `time` is a clock time (as before); 0–240 = its time each day is that
many minutes before local sunset (§7.7), and `time` is kept only as the form's last clock value. Additive only; it
runs before the deploy. **Migration check (CS-M):** chores that exist before 0048 survive it with `sun_offset_min` NULL.

### 4.2zv Schema change — `migrations/0049_clock_24h.sql`

Asked by MojoSOGO 2026-10-12: "Settings me give option to show time as 24hr or 12 hr applies every where" (§8.17).

Schema: [`migrations/0049_clock_24h.sql`](migrations/0049_clock_24h.sql). The migration is the schema; it is not copied here.

`member_prefs.clock_24h` — 0 = this member sees 12-hour times (the default ⚑ Q277), 1 = 24-hour. Additive only; it runs
before the deploy. **Migration check (CK-M):** members that exist before 0049 come through it on 12-hour.

### 4.2zw Schema change — `migrations/0050_daily_lists.sql`

Asked by MojoSOGO 2026-10-13: "In reminders give option to ping owners. Time & Checkbox each day" (§7A.4).

Schema: [`migrations/0050_daily_lists.sql`](migrations/0050_daily_lists.sql). The migration is the schema; it is not copied here.

`lists.daily` / `lists.ping_owners` — 0 or 1, both 0 by default. `list_items.time` — `HH:MM` or NULL.
`deliveries.list_item_id` marks a list ping (§7A.4) so the founder-ping predicate (§9.4) leaves it out and "pinged
today" is read from the rows. Additive only; it runs before the deploy. **Migration check (DL-M):** lists, items and
deliveries that exist before 0050 survive it with `daily` 0, `ping_owners` 0, `time` NULL and `list_item_id` NULL.

### 4.2zx Data change — `migrations/0051_timer_away_day.sql`

MojoSOGO 2026-10-14: "I didn't see pushup/stairs reminders today." Away on a timer fire (§9.2c) used to ride Rule 0
(§5.3) into every later day. The code fix ends it when the day ends; this migration clears the open `scheduled` timer
fires already carrying it, which Rule 0 will not touch again. Data only, no schema change: [`migrations/0051_timer_away_day.sql`](migrations/0051_timer_away_day.sql).
**Migration check (TA-M):** a scheduled timer fire loses `away_by`/`away_at`; a ringing timer fire and any other kind keep them.

### 4.2zy Schema change — `migrations/0052_reminder_random_time.sql`

Asked by MojoSOGO 2026-10-16: "In reminders I want an option to randomize the time reminders are sent within a time
range" (§8.4 Random time).

Schema: [`migrations/0052_reminder_random_time.sql`](migrations/0052_reminder_random_time.sql). The migration is the schema; it is not copied here.

`events.remind_random_from` / `remind_random_to` — local `HH:MM`, both set (from before to) or both NULL (a plain
reminder). Additive only; it runs before the deploy. **Migration check (RT-M):** events that exist before 0052 come
through it with both NULL.

### 4.2zz Schema change — `migrations/0053_task_sessions.sql`

Asked by MojoSOGO 2026-10-19: the 💪 Task buddy (§7G). A session is a rolling timer (`timers` row, id `task_…`)
plus this row with the same id for what a timer doesn't hold: whose it is, the limit, working time, break and
pause, what done looks like, the check-in log, and how it ended. A new table and nothing else, so the fires
table's kind check is untouched (no table rebuild).

Schema: [`migrations/0053_task_sessions.sql`](migrations/0053_task_sessions.sql). The migration is the schema; it is not copied here.

`checkins` is a JSON list of `{ at, mood, said }` (mood from `TASK_MOOD`, `said` = Enso's reply), at most 200.
`done_looks` a JSON list of lines; `done_ticked` the ticked line numbers at Finish. Additive only; it runs before
the deploy. **Migration check (TB-M):** earlier timers and fires come through unchanged; a session row can be written.

### 4.2zza Schema change — `migrations/0054_after_time.sql`

Asked by MojoSOGO 2026-10-19: each member's own After work / After school time for 📌 Reminders (§8.5b).
`member_prefs.after_kind` (`'work'` / `'school'`, NULL = by role) and `after_time` (`HH:MM`, NULL = by role).
Additive, plus one data row: the founder's `after_time` = `15:30`. It runs before the deploy.

Schema: [`migrations/0054_after_time.sql`](migrations/0054_after_time.sql). The migration is the schema; it is not copied here. **Migration check (RM-M2,** [`test/migration-0054.test.ts`](test/migration-0054.test.ts)**):** members before 0054 come through unset, the founder at 15:30.

### 4.2zzb Schema change — `migrations/0055_share_inbox.sql`

Asked by MojoSOGO 2026-10-19: Send to Enso from the iPhone Share sheet (§7H). `share_keys` holds each member's one
Send to Enso key, as its SHA-256 only (the key is shown once). `inbox_items` holds what arrived: a url, a text and a
photo's R2 key, each optional; its kind (photo / link / text, `INBOX_KIND`) is derived from which are set, never stored,
so there is no CHECK list. New tables only; additive; it runs before the deploy.

Schema: [`migrations/0055_share_inbox.sql`](migrations/0055_share_inbox.sql). The migration is the schema; it is not copied here. **Migration check (SH-M,** [`test/migration-0055.test.ts`](test/migration-0055.test.ts)**):** earlier members come through with no key; a key and an item can be written.

### 4.2zzc Schema change — `migrations/0056_feature_requests.sql`

Asked by MojoSOGO 2026-10-19: what Ensō can't do yet, said to the Ensō button, kept for the next build (§8.18).
`feature_requests`: what was said, the title, summary and size Claude gave it, its status (`new`, `needs_john`, `done`,
`dismissed`), a note, who asked and when. Additive; it runs before the deploy.

Schema: [`migrations/0056_feature_requests.sql`](migrations/0056_feature_requests.sql). The migration is the schema; it is not copied here. **Migration check (SY-M2,** [`test/migration-0056.test.ts`](test/migration-0056.test.ts)**):** the table takes a request and refuses an unknown status or size.

### 4.2zzd Schema change — `migrations/0057_feature_request_outside.sql`

Asked by MojoSOGO 2026-10-19: "still log the ask as out of scope for my review as I may want to increase scope." A
fifth `feature_requests.status`, `outside` (§1.3, §8.18). SQLite can't widen a CHECK in place, so the table is rebuilt
with its rows copied, then the index again. Nothing references it. It runs before the deploy.

Schema: [`migrations/0057_feature_request_outside.sql`](migrations/0057_feature_request_outside.sql). **Migration check
(SY-M3,** [`test/migration-0057.test.ts`](test/migration-0057.test.ts)**):** a row saved under 0056 is still there after
0057, `outside` is taken, an unknown status is still refused.

### 4.2zze Schema change — `migrations/0058_weather_moon_optional.sql`

Asked by MojoSOGO 2026-10-19: "add weather and moon as optional". Two `member_prefs` switches beside the holiday and 📈
ones, `show_weather` and `show_moon`, **on by default** so nobody loses what they see today (§7.5). Additive; it runs
before the deploy.

Schema: [`migrations/0058_weather_moon_optional.sql`](migrations/0058_weather_moon_optional.sql). **Checks (WM1–WM2,**
[`test/weather-moon-optional.test.ts`](test/weather-moon-optional.test.ts)**):** a member saved before 0058 has both on
after it; `PATCH /me { showWeather, showMoon }` saves a boolean for that member and refuses anything else.

### 4.2zzf Schema change — `migrations/0059_ious.sql`

Asked by MojoSOGO 2026-10-20: a family IOU system in real US dollars (§7B.9). Three new tables: `ious` (who owes whom
how much, and the note), `iou_payments` (money paid back, let go or taken off a tab, with a note for a tab) and `iou_plans` (a repeating payback), each with
who made it, when it was OK'd (NULL = waiting) and a soft delete or end. Money is **whole cents in INTEGER columns**,
never REAL. At most one live plan per direction (a partial unique index). `deliveries.iou_plan_id` points a payback
ping at its plan, so "pinged today" is counted from deliveries, never stored. Additive; it runs before the deploy.

Schema: [`migrations/0059_ious.sql`](migrations/0059_ious.sql). **Migration check (IOU-M,**
[`test/migration-0059.test.ts`](test/migration-0059.test.ts)**):** a delivery written before 0059 survives with
`iou_plan_id` NULL; an IOU of 0 cents, an unknown payment `how` or plan `every`, and a second live plan for the same
direction are refused; `tab` is taken.

### 4.2zzg Schema change — `migrations/0060_places.sql`

Asked by MojoSOGO 2026-10-21: saved places, the household's address book (§7.9b). One new table, `places` (name,
address, arrival notes, match words as a JSON list, who made it), seeded with **Incognito SD** (2335 Mirador, Vista,
CA 92084, its parking notes, match word "Incognito"; no creator). Events keep their own `address`: a place fills it,
it never points at the place. Additive; it runs before the deploy.

Schema: [`migrations/0060_places.sql`](migrations/0060_places.sql). **Migration check (PL-M,**
[`test/migration-0060.test.ts`](test/migration-0060.test.ts)**):** the seeded row is there; a second row with its id is refused.

### 4.2zzh Schema change — `migrations/0061_iou_declined.sql`

Asked in a 💡 request 2026-10-21 (AREC `arec-iou-declined.md`): a declined IOU or payment stays on the record, and the
one who made it is told (§7B.9). `ious` and `iou_payments` each get `declined_at` / `declined_by` (NULL = not declined),
so a declined row is neither waiting, counted nor deleted. `deliveries.iou_row_id` points a "declined" push at its IOU
or payment (either table, so no foreign key), which keeps that push private and out of the founder pings the way
`iou_plan_id` does. Additive; every existing row reads as not declined; it runs before the deploy.

Schema: [`migrations/0061_iou_declined.sql`](migrations/0061_iou_declined.sql). **Migration check (IOU-M2,**
[`test/migration-0061.test.ts`](test/migration-0061.test.ts)**):** an IOU, a payment and a delivery written before 0061
survive with the new columns NULL.
### 4.2zzi Schema change — `migrations/0062_note_marks.sql`

Asked by MojoSOGO 2026-10-22: the home AI's highlights are remembered, so a notes text opened again shows them at once
without asking SogoAI (§8.4a). One new table, `note_marks`: the hex SHA-256 of what SogoAI is asked about a text
(`noteMarksKey`: the prompt, the answer's schema and the exact notes text, since v1.102.0 ⚑ Q375), the marks that
stood (validMarks' JSON) and when they were stored. It holds no notes text and points at no event or item: the same
text in two places shares one answer, and an edited text, or a changed prompt, simply has another hash. Rows older than
`NOTE_MARKS_KEEP_DAYS` are deleted when a new one is stored. Additive; it runs before the deploy.

Schema: [`migrations/0062_note_marks.sql`](migrations/0062_note_marks.sql). **Migration check (NM-M,**
[`test/migration-0062.test.ts`](test/migration-0062.test.ts)**):** the table takes a row; a second row with the same
hash is refused.

### 4.2zzj Schema change — `migrations/0063_event_private.sql`

Asked in a 💡 request 2026-10-23 (§6.3 "Private events"): an event can be marked private, so the people who may not
open it see only its time. One column, `events.private` (0/1, default 0); every existing event stays as it was.
Additive; it runs before the deploy.

Schema: [`migrations/0063_event_private.sql`](migrations/0063_event_private.sql). **Migration check (PV-M,**
[`test/migration-0063.test.ts`](test/migration-0063.test.ts)**):** an existing event reads `private` 0; a new one
takes 1.

### 4.2zzk Schema change — `migrations/0064_school_days.sql`

Asked by MojoSOGO 2026-10-27 ("Add as optional calendar"): one `member_prefs` switch beside the weather and moon ones,
`show_school`, **on by default** (§7.5, §7.13). Additive; it runs before the deploy.

Schema: [`migrations/0064_school_days.sql`](migrations/0064_school_days.sql). **Check:** SC6 (§7.13).

### 4.2zzl Schema change — `migrations/0065_room_devices.sql`

Asked by MojoSOGO 2026-10-27 ("opens to button list of defined rooms in Enso; then assigned items to room"): a room
holds Home Assistant devices (§9.2e). One table, `room_devices`, keyed by the HA entity id, so a device is in at most
one room; its `position` is the order picked. Nothing about the device itself is stored: its name and state are asked
of HA live. Additive; it runs before the deploy.

Schema: [`migrations/0065_room_devices.sql`](migrations/0065_room_devices.sql). **Migration check (HD-M,**
[`test/migration-0065.test.ts`](test/migration-0065.test.ts)**):** existing rooms untouched, no device rows; a
second row for the same entity is refused; `foreign_key_check` empty.

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
stepFire(fire: FireRow, cfg: AlertConfig, now: string): { fire: FireRow; alert: boolean; dayEnded?: true }

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

**`planReminderFires` and Random time (§8.4):** when the event has a Random time window, the due day is still the
local date of `start − remind_offset_min`, but the time on that day is `randomTimeIn(eventId|occurrenceDate, from,
to)` (`src/shared/random-time.ts`): a hash of the key, so planning twice gives the same time (R12), and an edit that
keeps the window re-plans the same time. The window wins over the start time: the alert may come after the start
⚑ Q294. A sun-timed event (§7.7) ignores the window.

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
| 0 | kind `timer` with a window | `ringing` and `now` outside the window, **or** `scheduled`, `now ≥ due_at` and `now` outside the window | `scheduled`, `due_at = nextTimerDue(now, intervalMin, window)` (= the next window opening + interval), `alert_count = 0`, `last_alerted_at = null`, **no alert**, `dayEnded` (it also ends Away, §9.2c) |
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
| `ack` | a task check-in (timer id `task_…`) | `invalid_action` at the route: a check-in is answered through `/tasks` (§7G.3) |
| any | machine | `invalid_action` — a machine fire is closed only by the `/machines` and `/cooking` routes (§7D, §7D.8) |
| anything else | — | `{ error: 'invalid_action' }` → HTTP 409 |

Any member may act on any fire. ⚑ DEFAULT

### 5.5 `applyTimerCmd` rules

| Cmd | Timer | Result |
|-----|-------|--------|
| `start` | not running | `running = 1`; new fire `due_at = nextTimerDue(now, intervalMin, window)` (= `now + intervalMin` without a window; started outside the window → the next opening + interval) |
| `start` | running | no change (idempotent) |
| `stop` | running | `running = 0`; open fire (if any) → `closed`, reason `stopped` |
| `stop` | not running | no change |

### 5.5a A rolling timer's day starts — the start announcement — asked by MojoSOGO 2026-10-08

"Rolling timers like pushups: announce at the beginning of the day when the first one starts, and start the
timer on ack." A timer with an active time range (§4.2n) begins its day when the window opens: its countdown
restarts then (§5.1 `nextTimerDue`), and nothing used to say so. With **Announce the start of each day**
(`announce_start = 1`) the household now hears it: *"Pushups timer started — every 60 minutes"*. From there it
is the rolling timer as it always was: it rings after the interval, and each **Ack** starts the next countdown
(§1, §5.4).

**Rules** (pure, `src/shared/timer-start.ts`; it imports `engine.ts` and `time.ts`, never the reverse):
- `TIMER_START_LATE_MIN = MISSED_AFTER_MIN` (60) ⚑ Q192: how late after the opening the announcement may still go.
- `windowOpening(now, win)` → the local date of the window opening `now` belongs to, or `null` when `now` is
  outside the window or more than `TIMER_START_LATE_MIN` after that opening. The opening of a window `from–to` is
  `from` on the local date of `now`, or the day before for the small hours of an overnight window (local `< to`
  when `from > to`); it is converted with `localToUtc` (§4.1).
- `timerStartDue({ running, announceStart, announcedOn }, win, now)` → that date when the timer is running,
  announces, has a window, `windowOpening` is not `null` and `announcedOn` is not that date; else `null`.
- `timerStartMessage(title, intervalMin)` → `"{title} timer started — every {n} minutes"` (`minute` when n = 1).

**Tick, step 3c** (`src/worker/timer-starts.ts`, `timerStartTick(env, now)`): for every running, non-deleted
timer with `announce_start = 1` and a window, when `timerStartDue` gives a date:
1. `UPDATE timers SET announced_on = date WHERE id = ? AND announced_on IS NOT date` — only a changed row goes on, so
   two overlapping ticks announce once.
2. Fire-less deliveries (§4.2k), like an announcement (§9.3) but on the **timer's** channels and audience (§5.7):
   Phone → one `push` row per `audience(…).push` member, `title` NULL, so the push shows "📢 Announcement" and is
   not counted as a founder ping (Q186); House → one `house` row on `deliverySpeakers` of those members (§9.2a),
   none ticked by any of them → not spoken. The push rows are sent at once; the house row is spoken by step 4.

So a timer started mid-window (Start at 14:00) announces at once if its opening was less than an hour ago,
and otherwise waits for the next day ⚑ Q192. A stopped timer says nothing; Start on a later day announces on
the first tick inside the late hour. Ack and the ringing are unchanged.

`announce_start = 1` needs a window: POST/PATCH refuse it without one (400, "Set Active from / to so the timer
has a day to start."), including a PATCH that clears the window of an announcing timer ⚑ Q191.

**Acceptance (M4za — each row is a test):**

| # | Check | Expected |
|---|---|---|
| TS1 | `windowOpening`, window 08:00–21:00, America/Los_Angeles | 08:00 → that date; 08:59 → that date; 09:00 → that date (exactly 60 min); 09:01 → null; 07:59 → null; overnight 22:00–06:00 at 22:45 → that date, at 02:00 → null (past the late hour); 23:30–06:00 at 00:15 → the day before |
| TS2 | `timerStartDue` / `timerStartMessage` | running + announce + window at 08:05 → the date; announcedOn = the date, not running, announce off, or no window → null; `("Pushups", 60)` = `"Pushups timer started — every 60 minutes"`, `("Plank", 1)` = `"Plank timer started — every 1 minute"` |
| TS3 | POST/PATCH `/timers` | `announceStart: true` without a window → 400 with the message; with 08:00–21:00 → 201, `announceStart: true` in the view and GET; PATCH `{ activeFrom: null, activeTo: null }` on it → 400; PATCH `{ announceStart: false }` then clearing → 200; omitted → false |
| TS4 | tick at 08:01 local, a running announcing timer, Phone + House, two members, one speaker ticked | one push per member (`title` NULL, `fire_id` NULL) and one house row, all `"Pushups timer started — every 60 minutes"`; `announced_on` = today; a second tick at 08:02 writes nothing |
| TS5 | tick at 09:30 local, or a stopped timer, or `announce_start` 0 | no deliveries; `announced_on` unchanged |
| TS-M | migration 0033 | earlier timers survive with `announce_start` 0, `announced_on` NULL |

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
   3c. **Timer days start.** `timerStartTick` (`src/worker/timer-starts.ts`): the start announcement of each
   announcing timer whose window just opened (§5.5a). Fire-less deliveries; the push rows are sent at once.
   3d. **Weather.** `weatherTick` (`src/worker/weather-days.ts`): the once-a-day forecast refresh (§7.11). It never
   throws; a failure is logged and retried hourly.
   3e. **Cooking timers' end of day.** Close every open cooking timer `cookExpired` names (§7D.8).
   3f. **Ping owners.** `listPingTick` (`src/worker/list-pings.ts`): every day list items whose time has come (§7A.4).
   3g. **Payback pings.** `iouPingTick` (`src/worker/iou-pings.ts`): each live payback plan due today (§7B.9).
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
  - reminder: `"Reminder: {title}"`, plus `" — bring: {list}"` when the event has things to bring (§7.10)
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
  - sun-timed reminder (§7.7): `"{title} — sunset at {time}"` (time per §8.17) — the occurrence's sunset in
    the household tz, in the receiving member's clock (§8.17; was 12-hour with no am/pm, ⚑ Q52); when that sunset cannot
    be computed at alert time, `"{title} — before sunset"`. `alertMessage(kind, title, n,
    chore?, startsToday?, sunsetAt?)` takes it as a trailing `sunsetAt` (local `HH:MM`, or
    `null` = could not be computed; absent = not a sun event). No emoji in the text.
  - from the second alert on, append `" (alert {n})"`

A delivery with **no fire** is an announcement (§9.3, `POST /announce`), a sign-in notice (§6.6), a
founder ping (§9.4, `POST /ops/notify`), a mess ask (§7B.7), a bounty push (§7B.8), a list ping (§7A.4), or an IOU
payback ping or declined notice (§7B.9). Of these `tick` writes mess asks (step 3b, §5.6), list pings and payback pings; every
fire-less row is written through `src/worker/deliveries.ts`.

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
| Create events/timers/alarms/chores, list items, things, shows, recipes | ✓ | ✓ |
| Edit/delete **own** | ✓ | ✓ |
| Edit/delete **others'** | ✓ | ✗ |
| Done / snooze / ack any fire; start/stop any timer; tick any list item or chore | ✓ | ✓ |
| Answer That was me / Not me on a mess; mark a show watched; run the machines | ✓ | ✓ |
| Invites, disable members, household settings | ✓ | ✗ |
| **Make a member an admin, or remove an admin** | ✓ | ✗ |

**Whose entry it is** (decided by MojoSOGO 2026-10-07, for the kids joining as plain members: "they
shouldn't be able to edit locations or edit things except their own entries, but they still need to be able
to acknowledge alarms and *is this my mess*"). Every write to an entry is `canChange(createdBy, member)`
(`shared/roles.ts`): its creator or an admin; no creator → admins only. A refusal is 403 `forbidden`,
"Only the creator or an admin can change this {noun}." This covers events, timers, alarms, chores, lists,
**list items** (edit, assign, delete, photo), **things** (edit, Plan it, Done / Let it go / Put back, delete,
photo), **shows** (edit, delete), **recipes** (edit, re-read from a transcript, delete, picture) and a room's
**areas** ("what done looks like": add, edit, delete, photos), which follow the **room's** creator (§7B.6).
Still open to every member, because they are taking part rather than changing someone's entry: acting on
any fire (§5.4, so alarms are acknowledged by anyone), ticking a chore step, **checking or unchecking any list
item** (a PATCH whose only field is `checked`), **marking any show watched or wanted again** (a PATCH whose only
field is `status`), adding an item to any list, the machines (§7D), answering a mess (§7B.7), and one's own
recipe emoji, optional-event switch, speakers and phone. A member who can't change an entry sees it read-only:
its form shows "Only the creator or an admin can change this …" and no Save, Delete, photo or Plan it buttons.

**Who opens an event** (v1.80.0, MojoSOGO 2026-10-16: "when the three adults are going out, the kids should not be
able to open the event and look at the details … only people that are invited to the event can open and look at the
details"). An event's **details** (`GET /events/{id}`: notes, address, things to bring, reminder) open only for: anyone
when **nobody is assigned** (everyone's event), the members **assigned**, its **creator**, and **admins** (⚑ Q296:
admins may already change any event). The rule is `canOpenEvent` (`shared/event-access.ts`); anyone else gets 403
`forbidden`, "Only the people going can open this event." Whoever may change an event may open it. Everyone else
still sees an ordinary event's **summary** in `/calendar` and the day sheet (title, time, emoji, who's going, 🔔 / 🔁),
as a 🔒 row that doesn't open.

**Private events** (v1.106.0, 💡 request 2026-10-23: "if only adults are invited … if it's marked private, the kids
shouldn't even see the summary; they should just see … the time range, and the name of the event as 'Private'"). An
event marked **🔒 Private** (§8.4) hides its summary too from everyone who may not open it, the same people as above:
for an adults-only night out with the adults ticked, that is the kids ⚑ Q381 (Ensō has no adult flag; who may open is
the line). They get, in `/calendar`, only its **date and start–end time**, titled **Private**, with no emoji, nobody
going, no creator, no 🔔 / 🔁 / 📝, a grey bar instead of the creator's colour, and `masked: true` ⚑ Q382; the day sheet
shows it as a 🔒 Private row that doesn't open, and `/optional-events` (§7.5) titles it Private the same way. The
people who may open it see it as any event. Private needs someone ticked as going ⚑ Q383: an event for nobody is
everyone's, so a private one with nobody is refused with 400 "Tick who's going to make it private." Its reminder
pushes are private to their member: Settings → 📊 Status leaves them out of other members' Recent deliveries (the
`privatePush` rule, §7B.9). Its 🔊 House reminder speaks as set on the speakers of the people going ⚑ Q384 (untick
🔊 to keep it off the speakers). The rule is `isMaskedFor` + `maskOccurrence` beside `canOpenEvent`.

**Acceptance** (`test/event-access.test.ts`, `test/event-access-api.test.ts`): EO1 nobody assigned, assigned, creator
or admin → may open; EO2 anyone else → may not; EO3 canChange ⇒ canOpenEvent; EO4 a member not going → 403 on
`GET /events/{id}`, an ordinary event still in their `/calendar` with title, time and assignees; EO5 the assignee, the
creator and an admin → 200; EO6 nobody assigned → 200 for any member; PV1 `isMaskedFor` is true only for a private
event the viewer may not open; PV2 a private event in a non-going member's `/calendar` → title "Private", the same date
and times, emoji null, `assignedTo` [], `masked` true, no creator name, `hasReminder` / `recurring` / `hasNotes` false;
PV3 the assignee and an admin get the real title, `private` true, `masked` false; PV4 POST or PATCH private with nobody
assigned → 400; PV5 a private optional event in `/optional-events` → "Private" for a non-going member, its title for
the assignee; PV6 a private event's reminder push to A is in A's `/status` Recent deliveries, not in B's; PV7 once a private event
has a fire, a delivery with no fire is still in other members' `/status` and a founder ping still counts (§9.4).

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
| A8 | member K (not admin) PATCHes / DELETEs a thing, show, recipe and list item someone else made; PUTs / DELETEs their photos; Plans the thing; re-reads the recipe | each 403 `forbidden`; nothing changed |
| A9 | K does the same to their own thing, show, recipe and list item | allowed as before |
| A10 | K checks and unchecks someone else's list item (`{ checked }` only); marks someone else's show watched (`{ status }` only) | both 200 |
| A11 | K adds, edits or deletes an area (or its photos) of a room an admin made | 403 `forbidden` (rooms are added by admins, ⚑ Q266) |
| A12 | K acknowledges a ringing alarm someone else made; answers That was me / Not me on someone else's mess | 200 each, as before |

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
  Settings → 📊 Status).

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
- **Event display in a cell** (v1.71.0, MojoSOGO 2026-10-12: "second row; use emoji then dots
  of those participating; next line for multiple appointments; auto scale if necessary"):
  - Under the date-number line, **each single-day event gets its own line**, in the order
    `/calendar` sends them (all-day first, then by start time).
  - A line is the event's **emoji** (§7.6), then **one dot per participant** (`assignedTo`)
    in that member's color, each person once; an event for **everyone** gets one green
    (`--good`) pill with the word **Family** instead (v1.73.1: "Also in the calendar view; one bubble with family word"), at every width (§8.3, Q282; "And one bubble on day of month cell"). An event with **nobody assigned and an emoji** shows that emoji
    **beside the date number** instead (§7.2) and gets no line (MojoSOGO 2026-10-12: "If assigned
    to no one put emoji next to day of month number"); if the two-icon limit hides it, it keeps
    a line with its emoji, so it is never unmarked. Nobody assigned and no emoji: one dot in the
    event's color (Q273). A member who
    can't be found gets the event's color.
  - At ≥ 480px the start time and title follow the dots, truncated with an ellipsis.
  - **Auto scale:** the lines share the room left under the date line and the multi-day
    bars. Each line is 13px tall and shrinks to fit, down to 8px; emoji and dots shrink with
    it. Dots also shrink (down to 3px) so a line's dots fit the cell's width. If the lines
    still don't fit at 8px, as many as fit show and the last becomes `+N` (Q274).
  - Tapping the day opens the day sheet as always; titles are there.
  - **Acceptance** (`test/day-lines.test.ts`, the pure fit in `frontend/src/day-lines.ts`):
    DL1 two lines in 40px → both at 13px; DL2 four lines in 40px → line height between 8 and
    13px, all four show; DL3 ten lines in 40px → lines at 8px, the last is `+N` and shown + N
    = 10; DL4 eight dots in a 44px cell → dot size shrinks so they fit, never below 3px;
    DL5 no room at all → nothing shows but `+N` of all.
- **Multi-day (all-day) events are grouped:** one continuous bar in the event's
  color spans the days, and those day cells get a faint tint of the same color so
  the stay reads as one block. The title is written **once**, at the start of the
  bar — and again at the start of a week row if the stay wraps onto it. The bar sits
  above the per-day entries and does not take taps: each day stays individually
  tappable and still shows its own events. Overlapping stays stack in lanes. Timed
  events are single-day in v1.
- **Tapping a day** opens the **day sheet** (§8.3).
- **Scheduled alarms (`is_alarm = 1`) are never drawn on the calendar** and never
  appear in `/calendar`. They are listed on the Alerts tab (§8.5).

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

**School days off** are their own built-in item, 🏫 (§7.13): the school's own table, not a holiday rule, so they
never tint the cell.

**Day icons** — a day's icons sit **to the right of the date number, on the same line, at
every width** (phones included; never on the line below — decided by MojoSOGO). Icons, in
order: the public holiday's emoji, the school day's emoji (§7.13), 📈 (§7.4), then the emoji of the day's single-day events
with **nobody assigned**, in the order of their lines (Q277); at most **two**. An assigned
event's emoji sits at the start of its own line under the number instead (§7.1, Q275). Each is shown only if
it is on for the member (§7.5).

- **Legend:** shown once, directly under the sticky month header: a yellow square
  (`--holiday-public-swatch`) "Public holiday" and "📈 Options expiration" (§7.4), each only
  while it is on for the member.
- **Switches:** public holidays, 📈, the weather (§7.11), moon phases (§7.12) and school days off (§7.13) are rows
  of **Optional calendar items** (§7.5), not separate checkboxes. The calendar drops what is off **once**, where it
  hands a day's `DayData` out (`shownFor` in `Calendar.tsx`), so the cell, the day sheet and anything later never
  check a switch themselves.
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
  column). The owner edits it in Settings → 📅 Calendar → **Days off** (a checklist of
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

A per-member marker, off by default, switched on in Settings → 📅 Calendar ("📈 Show monthly
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

### 7.12 Moon phases 🌑🌓🌕🌗 (`src/shared/moon.ts`, pure) — asked by MojoSOGO's household 2026-10-19

"Show the phases of the moon on the calendar." The four principal phases are computed, never typed in: **🌑 New moon**,
**🌓 First quarter**, **🌕 Full moon**, **🌗 Last quarter**, about four days a month.

- `moonPhasesBetween(from, to, tz)` returns `{ date, name, emoji }[]` in date order. Each phase is an instant (Meeus,
  *Astronomical Algorithms* ch. 49, the main periodic terms, good to a few minutes); its `date` is the day that instant
  falls on **in the household's time zone** (§4.1), so a full moon at 04:12 UTC is the evening before in Los Angeles.
- **On the calendar:** the emoji sits in the day cell's **bottom-right corner** with the weather, after the weather
  emoji (alone there past the forecast days), never in a day-icon place (§7.2), so it pushes nothing out ⚑ Q346. No
  cell tint. The day sheet
  (§8.3) lists "🌕 Full moon" under the weather line; the cell's accessible label adds the name.
- **On for everyone by default**; a member can turn **🌕 Moon phases** off in Optional calendar items (§7.5), which
  hides it in the cell and the day sheet. No legend entry (the emoji names itself) ⚑ Q345, Q348.
- `/calendar` always returns `moonPhases` for the range (§10).
- **Acceptance (each row a test):**

| # | Setup / call | Expected |
|---|---|---|
| MN1 | `moonPhasesBetween('2025-10-01', '2025-10-31', 'UTC')` | 🌕 10-07 (03:48 UTC), 🌗 10-13, 🌑 10-21 (12:25 UTC), 🌓 10-29 |
| MN2 | `moonPhasesBetween('2026-10-01', '2026-10-31', 'UTC')` then with `America/Los_Angeles` | full moon 2026-10-26 (04:12 UTC) in UTC; 2026-10-25 in Los Angeles |
| MN3 | a 12-month range | 48 to 50 phases, alternating new → first quarter → full → last quarter in order |
| MN4 | GET `/calendar` for a week holding a phase | `moonPhases` has that day with its name and emoji; a week without one gives `[]` |

### 7.13 School days off 🏫 (`src/shared/school.ts`, pure) — asked by MojoSOGO 2026-10-27

"Here are the school days off schedule. Add as optional calendar." The kids' school calendar (Vista Unified, 2026–27)
is one table in code, `SCHOOL_DAYS`, a row per stretch: first day, last day, name and kind. Next year's schedule
replaces the table; nothing else changes.

| Kind | Emoji | Said as | 2026–27 rows |
|---|:---:|---|---|
| No school | 🏫 | "Veterans Day — No school" | Veterans Day 11-11; Thanksgiving break 11-23–11-27; Winter break 12-21–01-05; Martin Luther King Jr. Day 01-18; Presidents' Week 02-15–02-19; Spring break 03-26–04-02; Memorial Day 05-31 |
| Minimum day | 🕛 | "Staff development — Minimum day" | Middle school conferences 11-18–11-19 and 03-10–03-11; Staff development 02-24; Last day of school 06-03 (🎓) |
| Students return | 🎒 | "Students return" | 01-06; 04-05 |

- `schoolDaysBetween(from, to)` returns `{ date, name, emoji }[]`, one per day in date order: every day of a stretch,
  weekends included, so a break reads as one run ⚑ Q386. A row may name its own emoji (the last day's 🎓) ⚑ Q388.
- **On the calendar:** the emoji sits in the day-icon place beside the number, after the public holiday's (§7.2, so
  at most two icons still holds); no cell tint and no legend entry (the day sheet names it) ⚑ Q387. The day sheet
  (§8.3) lists "🏫 Thanksgiving break — No school" after the holiday line; the cell's accessible label adds the name.
- **On for everyone by default**; a member turns **🏫 School days off** off in Optional calendar items (§7.5), which
  hides it in the cell and the day sheet.
- `/calendar` always returns `schoolDays` for the range (§10).
- **Acceptance (each row a test,** [`test/school.test.ts`](test/school.test.ts)**):**

| # | Setup / call | Expected |
|---|---|---|
| SC1 | `schoolDaysBetween('2026-11-01', '2026-11-30')` | 🏫 11-11; 🕛 11-18, 11-19; 🏫 11-23 … 11-27 (five days), each named "Thanksgiving break — No school" |
| SC2 | `schoolDaysBetween('2026-12-20', '2027-01-07')` | 🏫 every day 12-21 … 01-05 (16), then 🎒 01-06 "Students return"; nothing on 12-20 or 01-07 |
| SC3 | `schoolDaysBetween('2027-06-01', '2027-06-30')` | only 06-03, 🎓 "Last day of school — Minimum day" |
| SC4 | every row of `SCHOOL_DAYS` | first day ≤ last day, rows in date order, none overlapping |
| SC5 | GET `/calendar` for 2026-11-08 … 11-14 | `schoolDays` holds 11-11 with its name and emoji; a week in August gives `[]` |
| SC6 | migration 0064, then `PATCH /me { showSchool }` | an existing member has `showSchool` 1; false saves 0; `'no'` is refused (400) |

### 7.5 Optional events — each person turns them on

**Optional calendar items** (Settings → 📅 Calendar) is the one list of everything a member can
switch on for their own calendar (decided by MojoSOGO 2026-10-03):
1. **Public holidays** — built in, on by default (`member_prefs.show_public_holidays`);
2. **📈 Monthly options expiration** — built in, off by default
   (`member_prefs.show_options_expiration`, §7.4);
3. **🌤️ Weather** — built in, on by default (`member_prefs.show_weather`, §7.11);
4. **🌕 Moon phases** — built in, on by default (`member_prefs.show_moon`, §7.12);
5. **🏫 School days off** — built in, on by default (`member_prefs.show_school`, §7.13);
6. then every **optional event** (below), each with its emoji and how it repeats.
Each row is one line with its **On** switch; the rows sit close together (32px, MojoSOGO 2026-10-19 "Reduce spacing")
⚑ Q348.
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
- at the start of the event's line in each day cell where it occurs, before the
  participant dots (§7.1); beside the date number instead when nobody is assigned (§7.2);
- before the title in the day sheet and in Optional calendar items;
- in the Ringing bar and alert text it is **not** added (messages stay plain text).

**Guessed emoji** (MojoSOGO 2026-10-23 "When making a calendar event, Enso should make it best. Guess add an
emoji"): a **new** event's Emoji box starts with `guessEmoji(title)` and follows the title as it is typed or filled
(by the Ensō button, 📋 Paste or 📷 Screenshot), until the person types in the box or clears it; from then on the box
is theirs (cleared stays empty). What the box holds when Save is pressed is saved as the event's emoji, like a typed
one. Editing an existing event never guesses. ⚑ Q376. An event made by **Plan it** (§7C.2) gets the same guess from
the thing's title; reminders and alarms (§8.5b) have no Emoji box and get none.
- `guessEmoji(text)` (`src/shared/emoji.ts`, pure) is **one keyword table**, shared with the list default (§7A.1):
  each row is whole words, or word starts where the row says so (so "dentist" finds "Dentist appt" and "shop…"
  finds "shopping", but "cat" finds neither "vacation" nor "Catherine"), matched against the lower-cased text; the **first row in table order** that matches wins, else
  `null` (no guess, the box stays empty). Patterns only: instant, no network, no AI ⚑ Q377. The rows are the table
  in the file (school, sports, doctors, chores around the house, travel, meals, parties, pets…), not copied here.

**Acceptance:** E1 an event with emoji 🧹 round-trips through POST/GET; E2 `"ab"`, `"🧹🧹"`
or 17 bytes → 400; E3 `/calendar` occurrences carry `emoji`; E4 `guessEmoji` gives 🦷 for "Dentist appt", ⚽ for
"Soccer practice", 🎂 for "Mia's birthday", 🗑️ for "Take out trash", 🧳 for "Vacation days" (never 🐾), `null` for "Meet Bob", "Catherine" and "Workshop", and every emoji in its table
passes `emojiError`; Plan it on a thing called "Dentist" makes an event with 🦷, on "Pumpkin patch" one with none (D6).

### 7.7 Sun-timed alerts — `src/shared/sun.ts` (pure)

Decided by MojoSOGO 2026-10-03: **the goat alert.** Every day, 30 minutes before local sunset,
an alert says **"Put the goats away — sunset at 6:42pm"**. Each person opts in; it is off by
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
- **Text** (§5.7): `"{title} — sunset at {time}"` (§8.17); sunset not computable at alert time →
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
| G5 | one member opted in; tick at sunset − 30, then 15 min on | that member gets a push each time and the house one row from the second alert (§9.2d), all with the text `"Put the goats away — sunset at h:mmpm"` (that day's sunset) |
| G6 | nobody opted in; tick | the fire steps, no deliveries |
| G7 | `GET /fires` carries `startSun: 'sunset'` for its fire; `GET /events/{id}` → 404 | |

---

### 7.8 Fill in an event from a screenshot — asked by MojoSOGO 2026-10-06

"To post an event, let me screenshot the info I have and auto process what can be extracted, then I can
manually edit the event." A screenshot of an invite, a flyer, a text message or an email fills the **new
event** form the way a photo fills a thing's (§7C.4): **nothing is saved**, the person checks the form and
taps Save.

- **Where:** the event form (§8.4), a **📷 Screenshot** button above the Title — on new events, and since v1.38.0
  on existing ones too, where the reading updates the event (§7.9a). It
  opens the phone's picker (camera or library); the picture is shrunk as every upload is (§7C.3) and sent;
  "Reading the screenshot…" while it runs, then what it filled or why it couldn't, under the button. The
  screenshot itself is never stored ⚑ Q187.
- `POST /events/read-photo` with the image → `EventReading { title, startDate, endDate, startTime,
  endTime, location, notes }`, each a string or `null`; dates `YYYY-MM-DD`, times `HH:MM` (24 h).
- **The prompt** (`src/worker/event-reader.ts`) gives today's date, the household zone and, when set, the
  household's place (Oceanside): dates like "Sat Oct 12" become the next such date on or after today; a
  place name that could be several places is read as the one nearest the household ⚑ Q188; `location` is the
  venue and its address as one line; `notes` is anything else useful (who it's from, what to bring, RSVP,
  a phone or a link), copied as written. Anything not shown → null.
- `cleanEventReading` (pure, `src/shared/event-reading.ts`) — the answer is input, never trusted: text
  trimmed to the event limits (title `ALERT_TITLE_MAX`, location `EVENT_ADDRESS_MAX` 200, notes
  `EVENT_NOTES_MAX` 2000); unreal dates dropped; a reversed start/end date swapped; a time that isn't a real `HH:MM` dropped; an
  end time without a start time dropped; empty → null.
- **Filling the form** (`readingToForm`, same file, pure): only fields the person **hasn't changed since the
  form opened** fill (the tapped day and the 09:00 start count as unchanged) ⚑ Q189:
  - title ← title; date ← startDate.
  - A start time → timed, start ← startTime, end ← endTime (or blank).
  - No start time but a date → **All day**, end date ← endDate (or the date).
  - Address (§7.9) ← location; notes ← notes ⚑ Q190.
  - The form says "Filled N fields from the screenshot — check them." (on an existing event "Updated N fields
    from the screenshot — check them, then Save.", §7.9a) or "Nothing new in the screenshot." Everything stays editable; nothing is saved until Save.
- **Budget, check order and failures:** exactly as `POST /things/read-photo` (§7C.4) — the **same 40-a-day
  `photo_reads` budget**; signed in (401) → size/type (400) → daily cap (429) → key present (503
  `photo_reading_off`) → count the read → Claude (`askClaude`, the image block of `photo-reader.ts`) →
  refusal 422 `photo_refused` / failure 502 `photo_reading_failed` with the reason → cleaned → 200.
- **Privacy:** the screenshot goes to Anthropic to be read (as Q30); the household's latitude and longitude
  go in the prompt (as Q141).

**Acceptance (each row a test):**

| # | Setup / call | Expected |
|---|---|---|
| EP1 | read-photo with a fake Claude answering a timed event | 200 with the cleaned fields; one `photo_reads` row; the request carries the image and a prompt with today, the zone and the household's place; nothing saved |
| EP2 | read-photo with no API key; at the daily cap; without a session; a non-image body | 503 `photo_reading_off`; 429, no read counted; 401; 400 |
| EP3 | refusal / failure from Claude | 422 `photo_refused` / 502 `photo_reading_failed` |
| EP4 | `cleanEventReading` on `2026-02-30`, reversed dates, `25:00`, an end time alone, a 300-char title | date dropped, dates swapped, time dropped, end time dropped, title cut |
| EP5 | `readingToForm` on a blank form: timed reading; date-only reading; multi-day reading; location + notes | timed with times; all day; all day with end date; address ← location, notes ← notes |
| EP6 | `readingToForm` where the person already typed a title and changed the date | title and date kept, the rest filled; the count names only the filled fields |

### 7.9 An event's address — paste to fill — asked by MojoSOGO 2026-10-09

"Calendar add an address field; let me paste from clipboard and you parse what you are given, usually text or
image." An event has an optional **address**: where it is, as one line (a venue and its street address).

- **Stored** in `events.address` (migration 0034, §4.2zg), at most `EVENT_ADDRESS_MAX` = 200 characters
  (`alert-limits.ts`), trimmed; empty → null. Events, `GET /events/{id}`, POST and PATCH carry `address`; a longer
  or non-text value → 400 `invalid_input` "Address must be text (up to 200 characters).". Alarms and sun-timed
  events never have one.
- **In the form** (§8.4): an **Address** box under the times and, when an address is
  there, **Open in Maps** (`https://maps.apple.com/?q={address}` in a new tab: Apple Maps on the iPhone, its web
  page elsewhere) ⚑ Q193. The box is ordinary text: typing or pasting into it by hand reads nothing.
- **📋 Paste**, beside 📷 Screenshot above the Title (new and existing events), reads the clipboard
  (`navigator.clipboard.read()`, else `readText()`; the phone may ask to allow it) and asks Claude what the copied
  thing says ⚑ Q194. A clipboard item's text is its `text/plain`, else its `text/uri-list` (the first link in it —
  how an iPhone hands over a copied link), else its `text/html` with the tags removed; an item with none of them
  falls back to `readText()` before saying there is nothing to paste.
  - **A picture** (a screenshot, a copied image) → shrunk as every upload is (§7C.3) → `POST /events/read-photo`
    (§7.8).
  - **Text** (a copied invite, message, email, map link's text or a bare address; its first `EVENT_TEXT_MAX`
    characters) → `POST /events/read-text { text }` → the same `EventReading` as read-photo, cleaned by the same
    `cleanEventReading`. The prompt is §7.8's, for copied text instead of a screenshot, with the same household
    place for a place that could be several places ⚑ Q188.
  - **A link** (asked by MojoSOGO 2026-10-09: an event page such as incognitosd.com/events/…): when the pasted
    text, trimmed, is one link that `readableLink` accepts (§7C.4b), read-text **reads the page** instead: the
    Worker fetches it (`fetchPage`), Claude looks it up (`researchPrompt`, web search and web fetch, the same limits
    as §7C.4b), then fills the `EventReading` from the page and the notes with §7.8's prompt for a pasted link. One
    read of the budget. Refusal 422 `link_refused` "Couldn't read that link."; failure 502 `link_reading_failed`
    "Couldn't read that link: {reason}". A link with other words around it is read as text ⚑ Q197.
  - **The reading fills the form** like a screenshot's ⚑ Q195: on a new event by §7.8's rule (`readingToForm`,
    the location into Address), on an existing one by §7.9a's. "Reading what you copied…" while it runs; then
    what it filled ("Filled N fields from what you copied — check them." / "Updated N fields from what you copied
    — check them, then Save." / "Nothing new in what you copied."), or why it couldn't: "Nothing to paste — copy
    a message, an address or a screenshot first." for an empty clipboard, "Couldn't read the clipboard — copy it
    again, or type it in." when the phone refuses, else the server's message.
- **`POST /events/read-text`** — check order: signed in (401) → `text` a non-empty string of at most
  `EVENT_TEXT_MAX` = 5 000 characters after trimming (400 `invalid_input` "Paste some text, up to 5000
  characters.") → daily cap (429, the **same 40-a-day `photo_reads` budget**) → key present (503
  `photo_reading_off`) → count the read → Claude (`askClaude`, text only) → refusal 422 `photo_refused` "Couldn't
  read that text." / failure 502 `photo_reading_failed` "Couldn't read that text: {reason}" → cleaned → 200. Nothing is saved; the text is never stored.
- **Privacy:** the copied text or picture goes to Anthropic to be read (as Q30), with the household's place (as
  Q141).

### 7.9a Updating an event from later info — asked by MojoSOGO 2026-10-09

"Make sure existing items can be updated from later pasted info." On an **existing** event, 📋 Paste and 📷
Screenshot read the same way, but the newer information **wins over what is saved** — `readingOverForm(form,
reading)` (pure, `event-reading.ts`) ⚑ Q196:

- **Title kept** (a later "it's moved to 3" rarely names the event the same way).
- A date → the date; on an all-day event the end date ← the reading's end date, or the new date.
- A start time → timed, start ← it, end ← the reading's end time or blank (the old end no longer fits). A date
  with no time leaves the event timed or all day as it was; a time with no date keeps the date.
- A location → the Address, replacing it.
- Notes → **added** as a new paragraph under the event's notes (never replacing them), unless the notes already
  hold that text; the total cut to `EVENT_NOTES_MAX`.
- Nothing is saved until **Save**; the form shows every change first, and Cancel drops them. The message counts
  the fields that changed.

**Acceptance (each row a test):**

| # | Setup / call | Expected |
|---|---|---|
| EU1 | `readingOverForm` on a timed event: reading with a new date, start and end time, location, notes | title kept; date, times, address replaced; notes appended as a new paragraph; count 6 (the hidden end date follows the date) |
| EU2 | on a timed event: date only | date changed, still timed with its times |
| EU3 | on an all-day event: start time only | timed at that time, end blank, date kept |
| EU4 | on an all-day event: new start and end date | dates replaced, still all day |
| EU5 | notes already holding the reading's notes; an empty reading | notes unchanged; nothing changed, count 0 |

**Acceptance for §7.9 (each row a test):**

| # | Setup / call | Expected |
|---|---|---|
| EA1 | POST an event with `address`; PATCH it to `null`; GET | stored trimmed and returned; cleared to null |
| EA2 | POST with a 201-character address; with a number | 400 `invalid_input` each |
| EA3 | read-text with a fake Claude answering a location | 200 with the cleaned reading; one `photo_reads` row; the request carries the text (no image) and a prompt with today, the zone and the household's place; nothing saved |
| EA4 | read-text with empty text; 5 001 characters; no API key; at the daily cap; without a session | 400; 400; 503 `photo_reading_off`; 429, no read counted; 401 |
| EA5 | read-text refusal / failure from Claude | 422 `photo_refused` / 502 `photo_reading_failed` |
| EA6 | read-text with only a link, a fake page and a fake Claude (look-up, then fill) | 200 with the cleaned reading; the page fetched once; the fill request carries the page and the notes; one `photo_reads` row |
| EA7 | read-text with a link that Claude refuses / that fails | 422 `link_refused` / 502 `link_reading_failed` |
| EA-M | migration 0034 over events written before it | rows unchanged, `address` NULL |

### 7.9b 📍 Saved places — the household's address book — `src/shared/places.ts` (pure) — asked by MojoSOGO 2026-10-21

"INCOGNITO SD ADDRESS — 2335 Mirador, Vista, CA 92084. Please park in the lower drive, and walk up the stairs to the
sliding door entrance. This is always true for an Incognito event and the address won't be in the link so you have to
remember it on the side … Ensō needs some kind of a small address book." The household keeps **saved places**: a
place Ensō can't read from a link or an invite, with how to arrive, filled into an event when the event names it.

- **A place** (`places`, migration 0060, §4.2zzg): a **name** (1–`PLACE_NAME_MAX` = 60), an **address** (1–200, the
  event Address's `EVENT_ADDRESS_MAX`), **arrival notes** (optional, up to `PLACE_NOTES_MAX` = 500: where to park,
  which door) and **match words** (up to `PLACE_WORDS_MAX` = 5, each 3–`PLACE_WORD_MAX` = 40 characters; trimmed,
  repeats dropped ignoring case). At most `PLACES_MAX` = 100. `cleanPlace(body)` (pure) checks and trims; anything
  else → 400 `invalid_input` naming the field. The migration saves the first one: **Incognito SD**, 2335 Mirador,
  Vista, CA 92084, its parking notes, match word "Incognito".
- **Who** ⚑ Q365: every member sees them and may add one (it is the household's address book); the place's creator
  or an admin changes or deletes it (§6.3, `canChange`). The seeded place has no creator, so admins change it.
- **Which place an event names** — `matchPlace(places, texts)` ⚑ Q366: a place matches when one of its match words
  or its name appears in one of the texts, ignoring case, anywhere (so "Incognito" matches "Incognito: Masquerade
  Night" and a pasted `incognitosd.com/events/…` link). Several match → the longest matching word wins, then the name
  in A–Z order. No place → null.
- **Using a place on an event** — `placeOverForm(form, place)`: the Address ← the place's address; its arrival notes
  are **added** as a new paragraph under the event's notes (never replacing them, as §7.9a), unless the notes already
  hold them; the total cut to `EVENT_NOTES_MAX`. → the form and how many fields changed. Nothing is saved until Save.
- **When it is used** ⚑ Q367:
  - **📷 Screenshot / 📋 Paste** (§7.8, §7.9, §7.9a), new and existing events: after the reading fills the form,
    `matchPlace` over what was copied (the text or link), the reading's title, location and notes. A match is used on
    top: **the saved place wins over the address that was read** ("always true"), and the status line adds
    " 📍 Used {name}." ("Filled 4 fields from what you copied — check them. 📍 Used Incognito SD."). The count is the fields that differ from the form before the reading (`fieldsChanged`), so one the reading and the place both set counts once.
  - **Typing:** when the Title matches a place and the Address is not already that place's, a **📍 Use {name}**
    button shows under the Address; a tap uses it. Nothing fills by itself while typing, so a cleared Address stays
    cleared.
  - **By hand:** a **📍 Saved places** picker under the Address (shown when there is at least one place) lists them
    by name; picking one uses it.
  - **Things to do** (§8.11): the thing form's **📍 Saved places** picker sets **Place** ← the name, **Address** ←
    the address, and adds the arrival notes under **Note** the same way (`placeOverForm` with the thing's note limit); each field it sets loses its *from photo / from link* mark, as a hand edit does. Plan it (§7C.2) already
    copies the address to the event.
- **Managing** — Settings → 📅 Calendar → **📍 Saved places** (§8.6), after Optional calendar items and Days off:
  one line per place (name, then its address muted), **＋ Add place**; a tap opens the place form (Name, Address,
  Arrival notes, Match words as one comma-separated box, "Events whose title or link has one of these words use this
  place."), with Save / Cancel and, for who may change it, **Delete place** (asks first). Deleting a place changes
  no event: the address it filled stays on them.
- **Routes** — `src/worker/routes/places.ts`: `GET /places` → `Place[]` by name (A–Z, ignoring case). `POST /places`
  `{ name, address, notes?, words? }` → 201 place; at 100 → 400 "A household keeps at most 100 places.". `PATCH
  /places/{id}` (the same fields; what is left out is kept) → the place; `DELETE /places/{id}` → 204. Unknown → 404
  "That place no longer exists."; not the creator or an admin → 403 "Only the creator or an admin can change this
  place.". A place on the wire: `{ id, name, address, notes, words, createdBy, updatedAt }` (`notes` null when none).

**Acceptance (each row a test):**

| # | Setup / call | Expected |
|---|---|---|
| PL1 | `cleanPlace` with padded name/address, `notes: " "`, `words: [" Incognito ", "incognito", "SD Venue"]`; with an empty name; a 201-character address; 6 words; a 2-character word; `words: "x"` | trimmed, notes null, words `["Incognito", "SD Venue"]`; then a message naming name, address, words, words, words |
| PL2 | `matchPlace` with places Incognito SD (word "Incognito") and Vista Park (word "Vista"): texts "Incognito: Masquerade", "https://incognitosd.com/events/x", "Park day in Vista at Incognito", "Soccer" | Incognito SD; Incognito SD; Incognito SD (longer word); null |
| PL3 | `placeOverForm` on a form with notes "Bring ID" and another address; again on its result; on empty notes | address replaced, notes "Bring ID\n\n{arrival}", count 2; count 0; notes = arrival |
| PL4 | GET /places on a new household | the seeded Incognito SD with its address, notes and word "Incognito", `createdBy` null |
| PL5 | a member POSTs a place; PATCHes `{ notes: null }`; another member PATCHes it; an admin deletes it; GET | 201 trimmed; notes cleared, the rest kept; 403; 204; gone |
| PL6 | POST with a bad body; PATCH / DELETE an unknown id; without a session | 400 `invalid_input`; 404; 401 |
| EF-C | `fieldsChanged` from an empty form to one where a reading set title, address and notes and a place then replaced address and notes | 3 |
| PL-M | migration 0060 | the seeded row is there; a second place with the same id is refused |
| PL-UI | manual, on the iPhone: new event, 📋 Paste an incognitosd.com event link | Address "2335 Mirador, Vista, CA 92084", the parking notes under the notes, "📍 Used Incognito SD." |

### 7.10 Things to bring — asked by MojoSOGO 2026-10-10

"In calendar add checklist of things to bring and include in reminder." An event has an optional list of
**things to bring**: short lines ("Shin guards", "Water bottle", "Snack for the team").

- **Stored** in `events.bring` (migration 0035, §4.2zh) as a JSON list; none → null. At most `EVENT_BRING_MAX` =
  20 lines of at most `EVENT_BRING_ITEM_MAX` = 80 characters (`alert-limits.ts`). `cleanBring` (pure) trims each
  line, drops empty ones and repeats (ignoring case), keeps the order; an empty list → null. Events,
  `GET /events/{id}`, POST and PATCH carry `bring` (a list, `[]` for none; null or absent on POST = none); anything
  else, more than 20 lines or a longer line → 400 `invalid_input` "Things to bring must be a list of up to 20
  lines, each up to 80 characters.". Alarms and sun-timed events never have one.
- **In the form** (§8.4): **Things to bring** under the Address — each line with a ✕ to remove it, then an
  **Add something to bring** box (at most 80 characters; Enter or **＋ Add** adds the line through the same
  `cleanBring`, so a repeat is never added, and clears the box). Lines are kept in the order added. At 20 lines the
  box is hidden and "That's the most a list holds (20)." shows instead. `/calendar` occurrences don't carry it. It is a list to remember, not a tick-off list: nothing is ticked or saved per day ⚑ Q198.
- **In the reminder** (§5.7): an event's reminder appends `" — bring: {list}"` to its message, the lines joined by
  `", "` with `" and "` before the last ("bring: shin guards, water bottle and snacks"); the lines keep their own
  wording, first letter lowered unless the line starts with two capitals (an acronym) ⚑ Q199. It sits before
  `" (alert {n})"`, so every repeat says it too, on the phone and on the speakers. `bringText(lines)` (pure) builds
  the words; a sun-timed reminder has none.

**Acceptance (each row a test):**

| # | Setup / call | Expected |
|---|---|---|
| EB1 | POST an event with `bring: ["  Water ", "", "Snacks", "water"]`; GET; PATCH `{ title }`; PATCH `bring: []` | `["Water", "Snacks"]` stored and returned; kept by the title-only PATCH; cleared to `[]` |
| EB2 | POST with 21 lines; with an 81-character line; with `"water"` (not a list); with `[3]` | 400 `invalid_input` each |
| EB3 | `bringText` of `["Water"]`, `["Shin guards", "Water"]`, `["Shin guards", "Water", "GPS watch", "Snacks"]` | "bring: water"; "bring: shin guards and water"; "bring: shin guards, water, GPS watch and snacks" |
| EB4 | `alertMessage` for a reminder with bring lines, first and second alert | "Reminder: Soccer — bring: shin guards and water"; the same with " (alert 2)" |
| EB5 | tick an event reminder with bring lines, phone and house | the push and the house delivery both carry "Reminder: Soccer — bring: shin guards and water" |
| EB-M | migration 0035 over events written before it | rows unchanged, `bring` NULL |

### 7.11 Weather on the calendar — `src/shared/weather.ts` (pure) — asked by MojoSOGO 2026-10-10

"Daily update calendar with weather report emojis." Each of the next 7 days shows the day's forecast as an emoji.

- **Source:** the free Open-Meteo forecast (no key) ⚑ Q200, at the household place and time zone (`settings.latitude`
  / `longitude` / `timezone`, §4.2o):
  `{WEATHER_URL}/v1/forecast?latitude={lat}&longitude={lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone={tz}&forecast_days=7`.
  `WEATHER_URL` is a wrangler var (`https://api.open-meteo.com`); empty or no place → weather is off (nothing fetched,
  nothing shown). Tests pin it empty and reach only a fake.
- **Refreshed once a day** by the minute tick (§5.6, a step after the timer announcements): `weatherDue` (pure) says a
  refresh is due when the last good refresh (the newest `weather_days.fetched_at`) was not on today's local date and
  the last try (`settings.weather_tried_at`) was at least 60 minutes ago or never. So the first tick after local
  midnight refreshes, and a failed try is retried hourly. Every try first claims `weather_tried_at` with a conditional
  update, so two overlapping ticks fetch once. A good answer
  replaces the table: the 7 days are written and every other row is deleted (no past days) ⚑ Q201. A bad answer (not
  200, not the shape below) changes no rows and is logged; the tick goes on.
- **`parseForecast(json)`** (pure) reads `daily.time`, `daily.weather_code`, `daily.temperature_2m_max`,
  `daily.temperature_2m_min` (equal-length lists) into `{ date, code, highF, lowF }` rows, temperatures rounded;
  anything else → null. A day whose code is not in the table below is left out (no emoji that day).
- **Codes → emoji and words** (`weatherOf(code)`, the one table):

  | WMO codes | Emoji | Words |
  |---|:---:|---|
  | 0 | ☀️ | Clear |
  | 1 | 🌤️ | Mostly clear |
  | 2 | ⛅ | Partly cloudy |
  | 3 | ☁️ | Cloudy |
  | 45, 48 | 🌫️ | Fog |
  | 51, 53, 55, 56, 57 | 🌦️ | Drizzle |
  | 61, 63, 65, 66, 67, 80, 81, 82 | 🌧️ | Rain |
  | 71, 73, 75, 77, 85, 86 | 🌨️ | Snow |
  | 95, 96, 99 | ⛈️ | Thunderstorms |

- **`/calendar`** returns `weather: { date, emoji, words, high, low }[]` for the stored days in the range.
- **On the calendar** (§7.1): the emoji sits in the **bottom-right corner** of the day cell at every width (MojoSOGO
  2026-10-19 "Calendar weather stuff should be bottom right including moon"), with the moon phase after it (§7.12),
  apart from the two day icons (§7.2) so it never pushes a holiday or event emoji out ⚑ Q202, Q346. It shows unless the member turned **🌤️ Weather** off in Optional calendar items (§7.5), which hides the corner and the day sheet line ⚑ Q203, Q348. The cell's
  accessible label adds the words ("Clear, high 72°, low 58°").
- **The high beside it** (asked by MojoSOGO 2026-10-13: "left of weather emoji post the days high temperature; blue if
  cold; white nice; red hot; two digits"): just left of the emoji, the day's high as a bare number (`72`, no °), in the
  emoji's size, phones too ⚑ Q285. Its color is `heatOf(high)` (pure): **cold** below `COLD_BELOW` = 60 → blue,
  **nice** 60–84 → white (the text color), **hot** from `HOT_FROM` = 85 → red ⚑ Q286. The cell never compares
  temperatures itself.
- **In the day sheet** (§8.3): the first line, above any holiday, is `weatherText` (pure): "☀️ Clear · high 72° · low 58°".

**Acceptance (each row a test):**

| # | Setup / call | Expected |
|---|---|---|
| WX1 | `weatherOf` of 0, 2, 3, 45, 61, 80, 71, 95, and 42 | ☀️ Clear, ⛅, ☁️, 🌫️, 🌧️ Rain, 🌧️, 🌨️, ⛈️; 42 → null |
| WX2 | `parseForecast` of a real-shaped answer (7 days, 71.6 / 58.4); of `{}`, of unequal lists | 7 rows, high 72, low 58 (a day with code 42 left out); null; null |
| WX3 | `weatherDue`: never tried; good refresh yesterday, tried 2 h ago; good refresh today; tried 30 min ago with no good refresh today; tried 61 min ago likewise (America/Los_Angeles) | true; true; false; false; true |
| WX4 | tick with `WEATHER_URL` set and the fake answering 7 days; tick again a minute later; GET `/calendar` for the week | one request to `/v1/forecast` with the place, `fahrenheit` and the time zone; the second tick asks nothing; `weather` has the 7 days with emoji, words, high, low |
| WX5 | the next local day's first tick; the fake answers 500, then 200 an hour later | old rows kept after the 500 and asked again only after 60 min; the 200 replaces them, yesterday's row gone |
| WX6 | tick with `WEATHER_URL` empty, or no place | no request; `/calendar` `weather` is `[]` |
| WX7 | `heatOf` of 59, 60, 84, 85 | cold, nice, nice, hot |

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
  (`emojiError`, §7.6) — or none (`null`). None shows `defaultListEmoji(name)`: `guessEmoji(name)` (§7.6, the
  same table events guess from), else 📋 ⚑ Q157 (shopping / grocer / store / market → 🛒, wish / gift /
  christmas → 🎁, hardware / tool / fix / repair → 🔨, garden / plant → 🌱, pharmacy / medicine → 💊, pack /
  trip / travel → 🧳, …; a word must start a word, so "Workshop" is no longer 🛒). `listEmoji(list)` is the one function both the PWA and tests use. The same rules for who
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
- Any member may add an item to any list and check or uncheck any item. Editing, assigning, deleting or
  changing the photo of an item is its creator or an admin (§6.3, decided by MojoSOGO 2026-10-07).
- Lists never ring or speak, and push only a daily list's **Ping owners** (§7A.4) — being assigned an item
  notifies nobody otherwise.

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
Access application and bearer. Its check order: a path other than `/captions`, `/identify` or `/note-marks` (§8.4a) → 404; a
method other than POST → **405**; the bearer (constant time) → **401**; `Content-Type` not `image/*` →
**400**; a body over `IDENTIFY_BODY_MAX` → **413** (the body is read in `main()`, which keeps no bytes past
the cap); an empty body → 400; then `identify` (`home/identify.ts`) → **200** with the `IdentifyReport` as
JSON, whatever its `ok`. `home/identify.ts`: one POST to LM Studio at
`http://127.0.0.1:1234/v1/chat/completions` — `model` = `IDENTIFY_MODEL` (the helper's env), one user
message with a text part `IDENTIFY_PROMPT + " /no_think"` and an `image_url` part holding the image as a
`data:` URL, `temperature` 0, `max_tokens` `IDENTIFY_MAX_TOKENS` (room for the thinking it does anyway), `ttl`
`IDENTIFY_TTL_S` (24 h, so LM Studio keeps a model it loaded on demand instead of reloading it for the next
photo ⚑ Q317), `stream` false — with a 15 s timeout ⚑ Q114. It answers
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
| SN14 | `identify` over a fake LM Studio: a good answer; a timeout; a non-2xx; `IDENTIFY_MODEL` unset | one POST with the model, the prompt + " /no_think", the image as a data URL, temperature 0, ttl `IDENTIFY_TTL_S` → `ok`; `failed` "LM Studio error: …"; `failed` "LM Studio HTTP …"; `off`, nothing called |
| SN15 | every report `identify` produces (found by **calling** it over fake LM Studio answers) through `handle()` and the wire into `identifyFromHome` | each accepted: the text for `ok`, the reason for a failure |
| SN-M | migration check (§4.2v) | rows written before 0023 survive with `photo_key` NULL; `foreign_key_check` empty |

### 7A.4 Every day lists — a time and a fresh box each day, and Ping owners

Asked by MojoSOGO 2026-10-13 (from the 🛒 Lists tab): "In reminders give option to ping owners. Time & Checkbox
each day." Read as ⚑ Q287: a list he keeps as reminders can be made an **Every day** list, and such a list can
**Ping owners**.

**The rules** — `src/shared/lists.ts` (pure):

- **Every day** (`daily`) is a list setting, changed where its name is (creator or admin, §7A.1). On an every day
  list a tick counts **for today only** (the household's day, §2): an item whose `checked_at` falls before today's
  local midnight is open again, with nothing written. `todaysItems(items, dayStart)` gives the items as they stand
  today (an older `checked_at` read as NULL); the add rules (§7A.1), the visible lists and the open count all use it.
  A list that is not every day is unchanged.
- **Time:** any item may have a `time` (`HH:MM`, `isTime`) or none; it is shown and used only on an every day list.
- **Order** on an every day list ⚑ Q290: open items with a time first, earliest first, then the rest newest first;
  Done holds today's ticks only, newest first.
- **Ping owners** (`ping_owners`) is a second list setting beside it ⚑ Q288; it works only while the list is every
  day. Each item with a time that is **not ticked today** pings at its time: one push to its **owner** (the
  assignee) — or, with no owner or a disabled one, to every active member — **once a day**, phone only (no house, no FunHouse, no
  repeats). `pingDue(time, localNow)` decides: the local time is at or past `time` and less than
  `PING_LATE_MIN` (60) minutes past it ⚑ Q289, so a time set or a deploy late in the day never sends old pings.
- **The push** ⚑ Q291: `title` = the list's emoji and name (`📋 Reminders`), `message` = the item's text,
  `list_item_id` set. Tapping it opens My alerts (§9.5), whose source line is that title. Like a mess ask it never
  counts toward the `/ops/notify` limit nor reaches the FunHouse (§9.4).

**Tick** — `src/worker/list-pings.ts`, called from `tick` (§5.6) each minute: for each item with a time on a
non-deleted every day list with Ping owners, not ticked since today's local midnight and with no `list_item_id`
delivery since then, when `pingDue` → write the pushes and send them. No fire is made; nothing rings.

**Acceptance (M4ah — each row is a test; fakes only):**

| # | Setup / call | Expected |
|---|---|---|
| DL1 | PATCH `/lists/{id} { name, daily: true, pingOwners: true }` / `{ name, daily: "yes" }` | 200, `daily` and `pingOwners` true in `GET /lists` and `GET /lists/{id}` / 400 `invalid_input` |
| DL2 | an item `{ time: "08:00" }` / `{ time: "8am" }` / PATCH `{ time: null }` | `time` "08:00" / 400 `invalid_input` / `time` null |
| DL3 | every day list: an item ticked yesterday (local) | in `open`, not `checked`; `openCount` counts it; adding its text → `existing` |
| DL4 | every day list: an item ticked today | in `checked`; adding its text → `reopened` |
| DL5 | a list that is not every day, an item ticked yesterday | still in `checked` (§7A.1 unchanged) |
| DL6 | every day list order: untimed A (newest), 18:00 B, 07:30 C | open = C, B, A |
| DL7 | tick at 08:00 local: Ping owners on, item 08:00 owned by M, not ticked | one push to M, title "📋 Reminders", message the text, `list_item_id` set; no house or FunHouse row |
| DL8 | the same tick again at 08:05 | no new row |
| DL9 | item with no owner, two active members | one push each |
| DL10 | item ticked today / Ping owners off / list not every day / 09:01 local for 08:00 | no row |
| DL11 | a list ping and `/ops/notify` | the ping is not counted toward the hourly limit and is not in `GET /ops/pings` |
| DL-M | migration check (§4.2zw) | as §4.2zw; `foreign_key_check` empty |

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

**Planning** (`planChoreRuns(chore, tz, now, toUtc, activeIds, place)`, called by `tick`): one run
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

**Before sunset** (§4.2zu; MojoSOGO 2026-10-12, "get the eggs 30 minutes before sundown"): a chore with
`sun_offset_min` set has, on each date, the time **local sunset − `sun_offset_min`** (`sunsetUtc`, §7.7, with the
household place) in place of `date + time`, for `at` and `by` alike, for its first fire and for a `by` nudge. No place, or
no sunset that day → that run gets **no** time-based fire (it is still on Today; never a substitute time, as §7.7).
Waits between steps are unchanged. The alert text is the ordinary chore text (§5.7) ⚑ Q270.

**Done a step** (`advanceRun(chore, run, openFire, memberId, now, tz, place)` → `{ run, closeFire?, newFire? }`):
1. The run's open fire, if any, closes `done` (`closed_by` = the member).
2. `step + 1`. If that was the last step: `done_at = now`, `done_by` = member. Stop.
3. Else, if the step just done has `waitMin` → new fire due `now + waitMin` (it rings
   for the next step's person, with the chore's renotify).
4. Else, if timing is `by`, nudge is on, and `date + time` is still ahead → new fire
   at that deadline (the nudge is kept).
5. Else no fire: the next step is simply current on the Today list.

**Undo** (`undoRun(chore, run, openFire, now, tz, place)`): only when `step > 0`. `step − 1`, `done_at`/
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
`time` `HH:MM`, `sunOffsetMin` 0–240 or null, at least one channel when timing is `at` or nudge is on. Every
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
| C15 | "Get the eggs", `at`, `sunOffsetMin` 30, every day, Oceanside; plan 2026-10-31 | first fire due that day's `sunsetUtc` − 30 min (about 17:28 PDT); 2026-11-01 → about 16:27 PST |
| C16 | C15 with no household place | runs planned, no fire |
| C17 | `by` with `sunOffsetMin` 0 and nudge; done a step before sunset | the nudge is re-planned at that day's sunset |
| C18 | `sunOffsetMin` −1, 241 or "30" | 400 `invalid_input` naming `sunOffsetMin` |

### 7B.6 Rooms and what done looks like — `src/shared/rooms.ts` (pure)

Asked by MojoSOGO 2026-10-05: "an area for what done looks like with specific areas, pictures and a list of
expectations"; and 2026-10-12: "define rooms as its own thing, then chores get assigned to the room. The room is what
the room should look like when complete … rooms get sections like kitchen already has." A **room** ("Kitchen",
"Living room") holds up to 8 **areas** — "Sink", "Counters", "Floor" — each with a list of **expectations** ("No
dishes left in the sink", "Faucet wiped dry") and up to 4 **reference photos** of that area done right. A chore may
name **one room** (or none); its 📋 sheet shows the chore's **Done means…** (§7B.4) and then its room. Several chores
may share a room. A room also holds the house's **devices** (the AC, lights…), shown on the 🏡 Home tab (§9.2e, §8.19). Areas say what done looks like every time; nothing here changes turns, runs or fires.

**The rules** (pure; imports nothing):

- `ROOMS_MAX` = 30, `ROOM_NAME_MAX` = 40 ⚑ Q266. `AREAS_MAX` = 8 per room, `AREA_NAME_MAX` = 40,
  `EXPECTATIONS_MAX` = 12 per area, `EXPECTATION_MAX` = 120, `AREA_PHOTOS_MAX` = 4 per area ⚑ Q164.
- `parseRoomInput(body)` → `{ name }` (trimmed, 1–`ROOM_NAME_MAX`) or a message naming the field.
- `parseAreaInput(body, current?)` → `{ name, expectations }` or a message naming the field. `name` is trimmed,
  1–`AREA_NAME_MAX`. `expectations` is a list of strings: each trimmed, empty ones dropped, each at most
  `EXPECTATION_MAX`, at most `EXPECTATIONS_MAX` left; absent = `[]` on create, unchanged on edit (`current`).
- `Room` — `{ id, name, areaCount, createdBy, updatedAt }`. `RoomArea` — `{ id, roomId, name, expectations: string[],
  photos: string[], updatedAt }`; `photos` are photo ids, oldest first. A photo key is never on the wire.

**Who:** an **admin** adds a room (rooms are set up in Settings → 🏠 Household, §8.6) ⚑ Q266. The room's creator or an
admin renames or deletes it and adds, changes or deletes its areas and their photos (§6.3, Q163) — anyone else gets
403 `forbidden`. Anyone may read them, and anyone who may change a chore picks its room.

**The routes** — `src/worker/routes/rooms.ts`:

- `GET /rooms` → `Room[]` by `position` (the order added). `POST /rooms` `{ name }` → 201 room; at `ROOMS_MAX` → 400
  "A household has at most 30 rooms." `PATCH /rooms/{id}` `{ name }` → the room.
- `DELETE /rooms/{id}` → 204: in one batch its areas and their photo rows go, its device rows go (§9.2e; the devices
  stay in HA, in no room) and every chore naming it gets `room_id` NULL; then the R2 objects. Its chores keep going
  with no room.
- `GET /rooms/{id}/areas` → `RoomArea[]` by `position`. An unknown room → 404 "That room no longer exists."
- `POST /rooms/{id}/areas` `{ name, expectations? }` → 201 area, after the last. At `AREAS_MAX` → 400
  "A room has at most 8 areas."
- `PATCH /room-areas/{id}` `{ name?, expectations? }` → the area. `DELETE /room-areas/{id}` → 204, its photos' rows
  and R2 objects gone.
- `POST /room-areas/{id}/photos` the raw image (`photoBody`, §7C.3's limits) → 201 the area. R2 key
  `chore-areas/{areaId}/{random}.jpg` (the prefix from before rooms, kept so nothing in R2 moves), private. At
  `AREA_PHOTOS_MAX` → 400 "An area has at most 4 photos."
- `GET /room-area-photos/{id}` → the image, `Cache-Control: private, max-age=3600`. `DELETE /room-area-photos/{id}` →
  204, the row and the object gone.
- An area or photo that is gone → 404 "That area no longer exists." / "That photo no longer exists."
- **A chore's room:** `POST /chores` and `PATCH /chores/{id}` take `roomId` — null or `""` = none, an existing room's
  id, anything else → 400 `invalid_input` naming `roomId`; a PATCH without it keeps the room. `GET /chores` carries
  `roomId`; `GET /chores` and `GET /chores/today` carry `areaCount` = its room's areas (0 with no room).
- **Deleting a chore** (soft, §7B.3) leaves its room and the room's areas alone.

**Acceptance (M4y — each row is a test; fakes only):**

| # | Setup / call | Expected |
|---|---|---|
| CA1 | POST an area `{ name: " Sink ", expectations: ["No dishes", " ", "Faucet dry"] }` on a room; a chore in that room | 201 `{ roomId, name: "Sink", expectations: ["No dishes", "Faucet dry"], photos: [] }`; GET lists it; `areaCount` 1 on `/rooms`, on the chore in `/chores` (with its `roomId`) and on its run today |
| CA2 | a second area, then PATCH the first `{ name: "Kitchen sink" }` | areas in the order added; the PATCH keeps the expectations |
| CA3 | name empty / 41 chars; 13 expectations; an expectation of 121 chars; a 9th area | 400 `invalid_input`, the message names the field |
| CA4 | POST a photo, GET it, POST up to 4, then a 5th | the bytes round-trip with `private, max-age=3600`; the area lists 4 ids oldest first; the 5th is 400; no key in any answer |
| CA5 | DELETE a photo; DELETE an area with photos | 204 and the object gone; 204, the area and every object of it gone |
| CA6 | delete a chore in a room; then delete the room | the room's areas and objects stay; then they go, GET its areas → 404, and its other chore shows `roomId` null, `areaCount` 0 |
| CA7 | a member who did not make the room adds, edits and deletes an area, adds and deletes a photo | each 403 `forbidden` (Q163, §6.3 A11) |
| CA8 | no session; a bad photo type | 401; 400 |
| RM1 | add " Bathroom " and "Garage", rename one; names empty / blank / 41 chars | trimmed, in the order added, `createdBy` set, renamed; 400 naming `name` |
| RM2 | a chore given a room; PATCH its title; PATCH another room; PATCH `roomId: null`; an unknown room on PATCH and POST | the room kept, changed, cleared; 400 naming `roomId` |
| RM3 | a non-admin renames / deletes an admin's room, reads its areas, adds a room | 403, 403, 200, 403 (⚑ Q266) |
| RM-M | migration check (§4.2zt) | see §4.2zt |

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

### 7B.8 Bounties and the score — `src/shared/bounties.ts` (pure)

Asked by MojoSOGO 2026-10-11 (reviewed first as an AREC, `arec-chore-bounties.md`): "I want a bounty system... for
scheduled chores or one off, a bounty can be set and anyone can claim the bounty. Keep score for house
participation." Examples: trash to the street on trash day, the can back in after, the kitchen trash, empty a bin,
clean the downstairs toilet. And: "child claims bounty and it goes pending; then gets adults approval via app." His
picks: **ADM** (only admins set bounties), **CNF** (points count only after an admin's OK), **PUB** (everyone sees
everyone's score). It is the positive twin of a mess (§7B.7): a mess is a point owed to one person, a bounty is
points earned from the house. The two are never mixed: Balances stay mess points only.

**Two kinds.**

- **A chore bounty** — an admin puts points on a chore (`chores.bounty`, 1–10). Every run of it then pays whoever
  finishes it: when a run's last step is done (§7B.3), an **earning** is written for `done_by` with the chore's points
  at that moment. Turns, rings and Today are unchanged; anyone could already finish anyone's run (§6.3). A multi-step
  chore pays whoever finishes the last step ⚑ Q250. **Undo** of a finished run (§7B.3) drops its earning, OK'd or not.
  Changing or clearing a chore's bounty never changes earnings already written.
- **A one-off bounty** — an admin posts a job with a title, an optional note and points. It is done once.

**An earning** is points a member has done the work for: pending until an admin taps **OK**, then it counts. An admin
may name someone else when OK-ing ("it was Sam who took the can in"). **Not yet** drops it: no points; a one-off goes
back to the one who said Done as their dib, fresh ⚑ Q251; a chore run stays done but pays nothing. When the one who
finishes is an admin, the earning is OK'd by them at once ⚑ Q252.

**A one-off's state** — `bountyStatus(b, earning, now)`, derived, never stored (`BOUNTY_STATUS`, §3), first match
wins: `paid` (its live earning is OK'd) · `pending` (its live earning waits for OK) · `taken` (someone said **I'll do
it** less than `TAKE_HOURS` ago) · `open`. A deleted bounty is gone from every answer.

**The rules** (pure; imports only vocab and time):

- `POINTS_MIN` = 1, `POINTS_MAX` = 10 ⚑ Q249, `BOUNTY_TITLE_MAX` = 60, `BOUNTY_NOTE_MAX` = 120, `TAKE_HOURS` = 3 ⚑ Q251.
- `parsePoints(v)` → an integer 1–10, or a message. `parseBountyInput({ title, note, points })` → the trimmed fields
  or a message naming the field (title 1–60, note empty → null, at most 120).
- `takeError(status, takenBy, me, myOtherDib)` → why **I'll do it** is refused, or null: not `open` (taken by someone
  else, pending, paid); or I already hold a live dib on another one-off (one at a time) ⚑ Q251.
- `doneError(status, takenBy, me)` → why **Done** is refused, or null: `pending` / `paid`; or `taken` by someone else.
  No dib is needed to say Done.
- `scoresOf(earnings, activeIds, today, tz)` → `Score[]` (`{ memberId, week, month }`) for every active member, zeros
  included: the sum of the points of OK'd, live earnings whose `done_at` falls (household time) in this week
  (Sunday-start, as turns, §7B.1) and in this calendar month ⚑ Q253. Never negative, never ranked.
- `runEarningChange(before, after)` → `'earn'` when a run's `done_at` goes from null to set, `'drop'` when it goes
  from set to null, else null. `okAtOnce(finisher, now)` → `{ ok_by, ok_at }` when the finisher is an admin, else
  null (Q252). `scoreSince(today, tz)` → the UTC start of the earlier of this week's Sunday and the 1st of the month,
  so the route reads every earning a score can need and decides no window itself.
- Push texts: `newBountyMessage(title, points)` → `"{title} · {points} points. Open Ensō → Chores → Bounties."`, title
  `NEW_BOUNTY_TITLE` "🪙 New bounty"; `waitingMessage(name, title, points)` → `"{name} says done: {title} · {points}
  points. OK it in Chores → Bounties."`, title `WAITING_TITLE` "🪙 Waiting for OK".
- Wire types: `Bounty` `{ id, title, note, points, createdBy, createdAt, status, takenBy, doneBy, earningId, hasPhoto }`
  (`takenBy` only while `taken`; `doneBy` and `earningId` the live earning's while `pending` or `paid`). `Earning`
  `{ id, kind: 'chore' | 'bounty', title, points, memberId, doneAt, hasPhoto }` (the waiting list; the key never on
  the wire). `Score` above.

**Who may do what.**

| Action | Who | When |
|---|---|---|
| Post or delete a one-off; set or clear a chore's bounty | admins (ADM) | delete: not once `paid` |
| I'll do it / Let it go | any active member | `open` / my own live dib |
| Done | any active member | `open`, or `taken` by me |
| OK (optionally naming who) / Not yet | admins (CNF) | a pending earning |
| See the bounties, the waiting list and everyone's score | everyone (PUB) | — |

**Delivery.** Fire-less push deliveries (§9.1), **never `house`** ⚑ Q254: posting a one-off pushes everyone active
but the poster once (`deliveries.bounty_id` set); a pending earning pushes every active admin once
(`deliveries.earning_id` set). No repeats. Neither counts toward the `/ops/notify` limit nor reaches the FunHouse
list (§9.4, §9.4a).

**A done photo** (v1.59.0, asked by MojoSOGO 2026-10-11: "allow child to snap a photo of completed work so adult can
approve remotely"). The one who did the work may attach one photo to their **pending** earning, a one-off's or a chore
run's alike, so an admin can OK or send it back from anywhere. Optional ⚑ Q257. A second photo replaces the first.
Everyone may see it (the score is public, PUB). The photo is deleted from R2 (and `photo_key` set NULL) when the
earning is OK'd or dropped (Not yet, the run's Undo, the bounty deleted): it is evidence for one decision, not a
keepsake ⚑ Q258.

**A bounty's picture** (v1.60.0, asked by MojoSOGO 2026-10-11: "if I create a bounty, let me add a picture"). An admin
may attach one picture to a one-off: what the job looks like, or where it is. Optional; a second replaces the first;
everyone sees it on the card. It is deleted from R2 (and `bounties.photo_key` set NULL) when the bounty is paid (its
earning OK'd) or deleted ⚑ Q260.

**The routes** — `src/worker/routes/bounties.ts`:

- `GET /bounties` → `{ bounties: Bounty[], waiting: Earning[], scores: Score[] }`: one-offs `open`, `taken` and
  `pending`, newest first; every pending earning, oldest first; `scoresOf` for every active member.
- `POST /bounties { title, note?, points }` (admin) → 201 `Bounty`; the push to everyone else in the same request.
- `POST /bounties/{id}/take` → `Bounty`. `POST /bounties/{id}/let-go` → `Bounty` (`open`).
- `POST /bounties/{id}/done` → `Bounty` (`pending`, or `paid` when I am an admin); the waiting push to the admins.
- `DELETE /bounties/{id}` (admin) → 204 (soft: `deleted_at`).
- `PUT /chores/{id}/bounty { points: 1–10 | null }` (admin) → `{ choreId, bounty }`.
- `POST /earnings/{id}/ok { memberId? }` (admin) → 204; `memberId`, when given, must be an active member.
  `POST /earnings/{id}/not-yet` (admin) → 204.
- `PUT /bounties/{id}/photo` the raw image (`photoBody`) → 204, admins only, not once paid (409). R2 key
  `bounties/{id}/{random}.jpg`, private; replacing deletes the old object. `GET /bounties/{id}/photo` → the image,
  `private, max-age=3600`; 404 once gone.
- `PUT /earnings/{id}/photo` the raw image (`photoBody`, §7C.3's limits) → 204; only the earner (else 403
  "Only the one who did it can add the photo."), only while pending (else 409). R2 key `earnings/{id}/{random}.jpg`,
  private; replacing deletes the old object. `GET /earnings/{id}/photo` → the image, `private, max-age=3600`; 404
  once gone.
- `GET /chores` and `GET /chores/today` carry `bounty` (points or null) on each chore / run.
- Refusals: not an admin → 403 `forbidden` "Only an admin can …"; the wrong state → 409 `bounty_state` with the
  rule's message ("Kai is on it.", "That bounty is waiting for OK.", "That bounty is already paid.", "You're already
  on Clean the toilet. Finish it or let it go first.", "That is already OK'd."); unknown or deleted → 404 "That bounty
  no longer exists." / "That chore no longer exists." / "That earning no longer exists."; bad input → 400
  `invalid_input` naming the field.

**Acceptance (M4ab — each row is a test; fakes only):**

| # | Setup / call | Expected |
|---|---|---|
| BT1 | admin A posts `{ title: " Clean the toilet ", points: 3 }`; B, C active | 201 `{ title: "Clean the toilet", status: open, points: 3 }`; one push each to B and C, title "🪙 New bounty", `bounty_id` set; none to A; no house row |
| BT2 | B posts a bounty; B sets a chore's bounty | 403; 403 |
| BT3 | title empty / 61 chars; points 0, 11, 2.5, "3"; note 121 chars | 400 `invalid_input` naming the field |
| BT4 | B takes it; C takes it; C says Done | `taken`, `takenBy` B; 409 "B… is on it."; 409 |
| BT5 | B takes a second bounty while holding the first | 409 "You're already on …" |
| BT6 | B's dib is 3 h old; C takes it | allowed: the dib lapsed (`status` was `open`) |
| BT7 | B says Done | `pending`, `doneBy` B; one push to each active admin, title "🪙 Waiting for OK", `earning_id` set; `waiting` lists it |
| BT8 | admin OKs it; then B's score | `paid`, gone from `bounties`; B's `week` and `month` 3; a second OK → 409 |
| BT9 | admin says Not yet on a pending one-off | `taken` by B again, fresh dib; no points; `waiting` empty |
| BT10 | admin OKs naming C | the earning is C's: C scores, B doesn't |
| BT11 | chore with bounty 2, a 2-step run; C does step 1, B does step 2 | one earning for B, 2 points, pending, the admins pushed; changing the chore's bounty to 5 leaves it at 2 |
| BT12 | undo that run's last step; finish it again | the earning dropped (no points, gone from `waiting`); a new pending one |
| BT13 | an admin finishes a chore bounty run / says Done on a one-off | OK'd at once, no waiting push |
| BT14 | scores: an OK'd earning done last Saturday, one this Sunday, one last month; a pending one; a disabled member's | week counts Sunday's only; month counts this month's; pending ones don't count; every active member listed, zeros too; the disabled member not listed |
| BT15 | admin deletes an open bounty; a paid one | 204, gone; 409 |
| BT16 | ops hourly limit with 30 bounty pushes in the hour; the FunHouse ping list | a ping still goes; no bounty push in the list |
| BT17 | `/chores` and `/chores/today` | `bounty` on each chore and run |
| BT18 | no session | 401 |
| BT19 | B says Done on a one-off, then PUTs a photo to its `earningId` | 204; `waiting` shows `hasPhoto: true`; anyone GETs the bytes with `private, max-age=3600` |
| BT20 | C (not the earner) PUTs a photo; B PUTs one after OK; a bad type | 403; 409; 400 |
| BT21 | B PUTs a second photo; an admin OKs; another earning with a photo gets Not yet; a chore run with a photo is undone | one object (the old one gone); the object gone and GET → 404 after OK; gone after Not yet; gone after Undo |
| BT22 | an admin posts a bounty and PUTs a picture; a member PUTs one; the bounty is OK'd; another is deleted | 204 and `hasPhoto: true`, anyone GETs it; 403; the object gone after OK; gone after delete |
| BT23 | B taps Done twice at the same moment | one 200 pending, one 409 `bounty_state`; one live earning. Any other save error is a 500, never "waiting for OK" |
| BT24 | C and B tap I'll do it at the same moment | one 200, one 409 `bounty_state`; the bounty is held by the 200's member |
| BT-M3 | migration check (§4.2zs) | bounties written before 0046 survive with `photo_key` NULL; `foreign_key_check` empty |
| BT-M2 | migration check (§4.2zr) | earnings written before 0045 survive with `photo_key` NULL; `foreign_key_check` empty |
| BT-M | migration check (§4.2zq) | rows written before 0044 survive; `chores.bounty` and the new `deliveries` columns NULL on them; `foreign_key_check` empty |

### 7B.9 Family IOUs — who owes whom, paybacks and payback plans — `src/shared/ious.ts` (pure)

Asked by MojoSOGO 2026-10-20 (reviewed first as an AREC, `arec-family-iou.md`): "Add to Ensos scope a family IOU
system. Scheduled payback, queued debt items, one off paybacks." Then: "This is for real money USD" and "This is
mostly for adults owing each other thousands because of phone purchase kind of stuff… no limit." Ensō **records**
money owed between household members and its paying back; no money moves through Ensō (§1.3 ⚑ Q349). It is the money
twin of a mess point (§7B.7) and never mixed with it: mess Balances stay points, IOUs stay dollars.

**The words.** An **IOU** is one debt: the one who **owes** (`owed_by`), the one **owed** (`owed_to`), an amount and
an optional note ("Shelly's new phone"). A **direction** is one ordered pair, owes → owed. Mom → Sam and Sam → Mom are
two directions, shown apart and **never netted** ⚑ Q352. A **payment** is money paid back (`paid`, outside Ensō) or
let go (`let_go`) in one direction. A **payback plan** is a repeating amount due in one direction. An IOU or payment is
**waiting** (not yet OK'd), **OK'd**, **declined** or **deleted**.

**Whoever it costs agrees** ⚑ Q351. Anything that makes someone owe more, or be owed less, waits for that person's OK:

| Made by | IOU (costs the one who owes) | Payment (costs the one owed) |
|---|---|---|
| the one who owes | counts at once | waits for the one owed: **Got it** |
| the one owed | waits for the one who owes: **OK** | counts at once |
| an admin who is neither | counts at once | counts at once |

Only that person can OK it. Until then it is **waiting**: shown to both, counted in nothing, and that person is told.

**Told to OK** ⚑ Q385 (MojoSOGO 2026-10-24: "when an iou payment is made, an ack is required so put it at the top of
the app and send an alert to the phone only"). The OK / **Got it** is the ack. When a row starts waiting on someone (the
other one of the two made it, ＋ IOU took some off a tab, or its maker asked again), that person gets **one push**,
phone only and private like a declined notice: "💵 Got it?" for a payment, "💵 OK?" for an IOU (`WAITING_TITLE`), the
text `waitingMessage` ("Sam paid you $100.00. Tap Got it or Decline."). The amount shows on the lock screen, as a
declined notice's does. One tap that writes two waiting rows (off the tab with the rest an IOU, both waiting on the same
person) sends one push. Every screen shows each row waiting on me at the top, in the **IOU banner** (§8.15a), until I
answer it. A row that counts at once tells nobody, and an inactive member gets no push.

**Declined** ⚑ Q371 (💡 request 2026-10-21: "the person who issued the IOU should be notified, and the bill should stay on
the records in case we need to reactivate it"). The person a waiting row waits on may **Decline** it instead of OK.
It is kept, counted in nothing, and shown under **Declined** to the two and admins. The one who made it gets **one
push** ⚑ Q372, phone only and private like a payback ping: "💵 Declined", `declinedMessage`. Only the one who made it
may **Ask again** ⚑ Q373: the row is waiting again, and the one it waits on is told again (Told to OK); a payment asked
again must still fit what is owed (409 `iou_too_much`). The one who made it, or an admin, may ✕ a declined row (deleted).

**What is owed** in a direction = the sum of its OK'd, live IOUs minus the sum of its OK'd, live payments (never below
0). **The queue** is its OK'd IOUs oldest first; payments pay them off oldest first, so each IOU shows how much of it is
paid ⚑ Q352. Both are derived on each read, never stored.

**A payback plan** ⚑ Q353: an amount, **every** `week` / `2weeks` / `month`, and a start date (household local). Due
dates come from the one recurrence format (§4.3: `WEEKLY` interval 1 or 2, or `MONTHLY` on the start date's day; a
monthly start day must be 1–28 so no month is skipped). At most one live plan per direction; a new one replaces it.
On each due date, at `PLAN_PING_TIME` (09:00 household time) or the first tick after, the one who owes gets **one
push**, phone only: never spoken on the house speakers, never on the FunHouse, never a founder ping (§9.4) — money is
private. It is due `min(amount, what is owed)`. A plan holds no money of its own: paying is a payment as any other.
**Behind** = the amounts due on its due dates before today, minus the payments OK'd in that direction since its start
date, never below 0 nor above what is owed. Missed dates are not chased again. A plan **ends** when what is owed in its
direction reaches 0 (the write that does it sets `ended_at`), or when either of the two or an admin ends it.

**Split the bill** ⚑ Q357 (MojoSOGO 2026-10-20: "split the bill where one person is paying and another has to pay their
half"): on ＋ IOU, the amount is the bill's total and the one who owes owes **half** (rounded down to the cent; the odd
cent stays with the one who paid). It is an IOU like any other, with the same OK.

**Off the tab** ⚑ Q358 ("Take it off my tab… instead of paying half, it is reduced from debt"): when the one who paid
(the one owed) already owes the other one, ＋ IOU can take the amount **off that tab** instead of adding an IOU. It is
written as a payment in the other direction, `how` = `tab`, with the IOU's note, as far as that tab goes (what is owed
there less payments still waiting); anything past it is an IOU as usual. Whoever it costs agrees: the tab payment
costs the other one, so it waits for their **Got it** unless they recorded it. A `tab` payment is made only this way.

**Who sees it** ⚑ Q350: the two people in a direction, and every admin. Nobody else, not even that a direction exists.
A payback ping is the one who owes's alone ⚑ Q359: Settings → 📊 Status (§8.6) leaves other members' payback pings out
of Recent deliveries, as it does their task check-ins (Q308). Which pushes are private is one rule
(`privatePush` in `src/worker/deliveries.ts`: a row with `iou_plan_id` or `iou_row_id`, or a fire of a private event,
§6.3), read both by Status and
by the founder-ping filter that keeps money off the FunHouse (§9.4a); a later private push adds its column there.

**Records** ⚑ Q355: amounts are never edited. A mistake is fixed by deleting a waiting or declined row (who made it,
or an admin; the person it waits on declines it instead) or, once OK'd, by an admin deleting it; a deleted row is kept
(`deleted_at`). An OK'd IOU
can't be deleted while the payments already OK'd in its direction need it (what is owed would go below 0).

**The rules** (pure; imports only vocab, time and recurrence):

- `WAITING_TITLE` = { iou: "💵 OK?", payment: "💵 Got it?" }; `waitingText(kind, byName, cents, how, note)` → "{by} says
  you owe {amount}" / "{by} paid you {amount}" / "{by} took {amount} off your tab", then " · {note}" when there is one,
  and "." (the banner's line); `waitingMessage` adds " Tap OK or Decline." / " Tap Got it or Decline." (the push).
- `IOU_NOTE_MAX` = 120. **No amount limit** ⚑ Q356: `IOU_CENTS_MAX` = 9 999 999 999 (\$99,999,999.99) only guards
  against a slip of the thumb and whole cents staying exact. `PLAN_PING_TIME` = `'09:00'`. `PAYBACK_TITLE` = "💵 Payback due".
- `parseAmount(v)` → whole cents, or a message: a number of dollars, or text like `"1,500.50"` / `"$20"` (commas, a
  leading `$` and spaces ignored); at most two decimals; more than 0 and at most `IOU_CENTS_MAX`.
- `centsText(cents)` → `"$1,500.50"`, the only formatter.
- `parseIouInput({ owedBy, owedTo, amount, note, split?, offTab? }, activeIds)` → `{ owedBy, owedTo, cents, note,
  offTab }` or a message: two different active members; the note trimmed, empty → null, at most 120; `split` halves
  the amount (half of 1 cent is refused). `tabSplit(cents, tabRoom)` → `{ tab, iou }`, the part off the tab and the
  rest. `reverse(d)` → the other direction. `parsePaymentInput` the same with `how` (`paid` / `let_go`; `tab` is
  refused there) instead of a note. `parsePlanInput` the same with `every` (`IOU_PLAN_EVERY`) and `startDate` (a date;
  for `month` its day 1–28).
- `madeError(owedBy, owedTo, viewer)` → why I may not add an IOU, payment or plan in that direction (not one of the two
  and not an admin), or null. `letGoError(owedBy, viewer)` → the one who owes can't let their own debt go.
- `countsAtOnce(kind, row, creatorId)` → whether the new row is OK'd at once (the table above); `okError(kind, row,
  viewerId)` → why I may not OK it (not the person it waits on; already OK'd).
- `deleteError(kind, row, viewer)` → why I may not delete it (the Records rule), or null. `declineError(kind, row,
  viewerId)` → why I may not decline it (not waiting; not the person it waits on). `askAgainError(row, viewerId)` → why
  I may not ask again (not declined; not the one who made it). `DECLINED_TITLE` = "💵 Declined";
  `declinedMessage(kind, byName, cents, note)` → "{by} declined your {amount} IOU · {note}." / "… your {amount}
  payment." (the note only when there is one).
- `owedCents(ious, payments)`, `queueOf(ious, payments)` → each OK'd IOU oldest first with `paidCents`.
- `planDates(plan, from, to)` (through `occurrences`), `nextDue(plan, today)`, `behindCents(plan, today, owed,
  payments)`, `pingDue(plan, today, localTime, owed)` → due today, at or after `PLAN_PING_TIME`, something owed.
- `paybackMessage(toName, dueCents, owedCents)` → `"Pay {to} {due} today. {owed} owed in all."`.
- `pairsOf(ious, payments, plans, viewer, today)` → `IouPair[]`, the directions the viewer may see that have something
  owed, waiting, declined or a live plan, most owed first. `IouPair = { owedBy, owedTo, owedCents, items: IouItem[], waiting:
  { ious: IouItem[], payments: IouPayment[] }, declined: { ious: IouItem[], payments: IouPayment[] } (newest first),
  payments: IouPayment[] (OK'd, newest first), plan: IouPlan | null }`;
  `IouItem = { id, cents, note, createdBy, createdAt, okAt, paidCents }`; `IouPayment = { id, cents, how, note, createdBy,
  createdAt, okAt }`; `IouPlan = { id, centsEach, every, startDate, nextDue, behindCents }`.

**Delivery.** A payback ping is a **fire-less push** (§9.1) with `deliveries.iou_plan_id` set and the title
`PAYBACK_TITLE`; "pinged today" is read from that column. It is not a founder ping: `FOUNDER_PING` in
`src/worker/deliveries.ts` leaves out `iou_plan_id` rows (§9.4), so it is neither counted for the hourly limit nor
listed for the FunHouse poller. Tick step 3g, `src/worker/iou-pings.ts`. A **declined notice** is the same kind of push
with `deliveries.iou_row_id` set to the declined row and the title `DECLINED_TITLE`, sent by the decline itself (Q372).
A **waiting ask** (Told to OK, Q385) is the same kind of push with `iou_row_id` set to the waiting row and the title
`WAITING_TITLE[kind]`, sent by the write that made it wait. Nothing else in IOUs pushes anyone. All three are the
receiver's alone in Status (Q359), and none is spoken, sent to the FunHouse or counted as a founder ping.

**The routes** — `src/worker/routes/ious.ts` (§10): `GET /ious` → `{ pairs }`; `POST /ious` → `{ pairs }` (the
directions it touched: the IOU's, and the tab's when it took some off). `POST /ious`, `POST /iou-payments` and `…/again`
send the waiting ask; `…/decline` sends the declined notice. `POST /ious/{id}/ok`,
`DELETE /ious/{id}`; `POST /iou-payments`, `POST /iou-payments/{id}/ok`, `DELETE /iou-payments/{id}`; `POST
…/{id}/decline` and `POST …/{id}/again` on both; `POST /iou-plans`, `DELETE /iou-plans/{id}`. Every other write answers with that direction's `IouPair` (null when nothing
is left in it); the deletes answer 204. A row I may not see is 404. A payment above what is owed in its direction
minus the payments still waiting there → 409 `iou_too_much` "That's more than the $X still owed.". A plan with nothing
owed → 409 `iou_nothing_owed`. OK or Decline on a row that is not waiting, or Ask again on one not declined → 409
`iou_state`.

**Acceptance (IO1–IO21, `test/ious.test.ts` for the rules, `test/ious-api.test.ts` through the Worker):**

| # | Given | Then |
|---|---|---|
| IO1 | `parseAmount`: `"1,500.50"`, `"$20"`, `20`, `"0"`, `"1.234"`, `"abc"`, `"100000000"` | 150050; 2000; 2000; a message ×4 |
| IO2 | `centsText(150050)`, `centsText(5)`, `centsText(123456789)` | "$1,500.50", "$0.05", "$1,234,567.89" |
| IO3 | Sam adds "Sam owes Mom $1,200 (phone)" | counts at once: Sam → Mom, $1,200.00 owed |
| IO4 | Mom adds "Sam owes Mom $300"; Sam OKs | waiting, owed unchanged; then owed + $300; Mom can't OK it (403) |
| IO5 | Sam records a $100 payment | waiting until Mom taps Got it; then owed − $100, paid oldest IOU first |
| IO6 | a payment above what is owed minus waiting payments | 409 `iou_too_much` |
| IO7 | Sam tries Let it go on his own debt | 403 |
| IO8 | a third member (not admin) reads `/ious` | Sam → Mom is not there; an admin sees it |
| IO9 | Mom → Sam and Sam → Mom both have IOUs | two pairs, not netted |
| IO10 | a weekly $100 plan from a Friday; tick at 08:59 and 09:00 that Friday, again at 10:00 | no push; one push to Sam "Pay Mom $100.00 today. …", titled 💵 Payback due, push only; no second push |
| IO11 | that push | not counted by `opsPingsSince`, not in `/ops/pings` |
| IO12 | payments bring the direction to $0 | the plan's `ended_at` is set; no more pings; the pair leaves `/ious` |
| IO13 | Ann adds "Bo owes Ann $80.01, Dinner", split | an IOU of $40.00 waiting for Bo's OK |
| IO15 | a payback ping to Sam; `/status` as Sam, as Kai, as an admin | Sam's Recent deliveries list it; Kai's and the admin's do not |
| IO15b | a declined notice to Ann (`iou_row_id`); `/status` as Ann and as another member; `opsPingsSince` | Ann's Recent deliveries list it; the other's do not; not counted as a founder ping |
| IO16 | Mom adds "Sam owes Mom $300 · tickets"; Sam declines it | 200, the pair's `declined.ious` has it, not waiting, owed unchanged; one push to Mom "💵 Declined" "Sam declined your $300.00 IOU · tickets.", `iou_row_id` set, not in `/ops/pings`; Mom can't decline it (403); Sam can't ✕ it (403); a second decline → 409 |
| IO17 | Mom asks again; Sam OKs | waiting again, no new push to Mom, Sam gets "💵 OK?" again (his second); Sam can't ask again (403); then owed + $300 |
| IO18 | Sam records $100 paid, Mom declines; Sam pays the rest; Sam asks the $100 again | Sam gets "Mom declined your $100.00 payment."; ask again → 409 `iou_too_much`; Sam ✕ deletes it (204, gone from the card) |
| IO19 | Bo records $20 paid to Cy | one push to Cy, `push` channel, "💵 Got it?" "Bo paid you $20.00. Tap Got it or Decline.", `iou_row_id` = the payment; none to Bo |
| IO20 | Bo adds an IOU he owes; Cy lets $5 go; an admin adds one; Cy adds "Bo owes Cy $30 · pizza" | no push for the first three; Bo gets "💵 OK?" "Cy says you owe $30.00 · pizza. Tap OK or Decline."; no house or FunHouse row, not in `/ops/pings`, not in another member's Status |
| IO21 | Di owes Ed $10; Di adds Ed owes Di $30 off the tab ($10 off the tab and $20 an IOU, both waiting on Ed) | one push to Ed |
| IO14 | Ann owes Bo $1,000; Ann adds a $100 split off her tab; then Bo adds $9,600 off the tab himself | a $50.00 `tab` payment waiting for Bo's Got it, no IOU for Bo; then the rest of Ann's tab is paid at once and the rest of the $9,600 is Bo's IOU; `how: 'tab'` on `/iou-payments` → 400 |

**Status:** v1.94.0; declined v1.100.0; told to OK v1.107.0. Manual (IOU1–IOU4 on the iPhone, §8.15c).


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
- **Photo:** at most one (§7C.3). **Anyone** may add a thing; editing, planning, finishing or deleting it is its creator or an admin (§6.3). ⚑

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
  is created (title; **emoji** = `guessEmoji(title)` or none, §7.6 Guessed emoji; **address** = the thing's address, §7.9; notes = the thing's note + place +
  phone + cost + link, one per line, plus the address only when it is too long for the event's
  Address box; `thing_id` set), the thing
  becomes `planned` with `planned_event_id`, and its scheduled reminders close `removed`
  (the event has its own). The event form shows **"From Things to do"** with the photo.
- `things.ts` owns: limits, window validation, `remindersFor(thing, tz)` → the reminder
  dates/instants, `canPlanOn(thing, date)`, `plannedEventAddress`, `plannedEventNotes`, and `cleanPhotoReading(raw, today)` (§7C.4).

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

Decided by MojoSOGO 2026-10-03. Two laundry machines, **Clothes washer** and **Clothes dryer**
(renamed from Washer and Dryer 2026-10-10; the ids stay `washer` and `dryer`), each holding at
most one load. A load turns once around: **start the washer → done → move to the dryer → done →
fold & out**. The weekly Laundry chore (§7B) is separate and unchanged. The **Dish washer**
(§7D.6, asked by MojoSOGO 2026-10-10) is a third machine with the same start and done, on its own.

### 7D.1 A machine

- One `machines` row per machine (§4.2m), seeded free. Its **state** is derived, never stored
  (`machineState(row, now)`):
  - **free** — no load (`done_at` NULL); a load's owner may be unknown (NULL, §7D.2 Done now);
  - **running** — `now < done_at`: whose load, started, minutes, done-at;
  - **done** — `now ≥ done_at`: the card reads **DONE — waiting**.
- `GET /machines` returns the server-derived `state`; the PWA never re-derives it.
- The laundry machines in load order are `LAUNDRY` (`machines.ts`): the washer's **next**
  machine is the dryer; the dryer has none (it is the last). `MACHINE` (vocab) is the card
  order: the laundry, then the dish washer, which has no next machine and no machine before it.
- Anyone may act on any machine. Every transition is one `db.batch` (§7D.2).

### 7D.2 Transitions — each returns `{ rows, closeFire?, newFire? }` or a refusal

| Transition | Valid when | Result |
|---|---|---|
| **Start** `{ ownerId, minutes, alertId? }` | the machine is free | owner, alert person (§7D.7), minutes, `started_at = now`, `done_at = now + minutes`, `started_by` = me; a new `machine` fire due at `done_at` |
| **Move** `{ minutes }` (washer → dryer) | the washer is done **and** the dryer is free | washer free, its open fire closes `done` (`closed_by` = me); the dryer starts with the **washer's owner** and its own minutes; a new dryer fire |
| **Finish** — *Unload Clothes Dryer* (MojoSOGO 2026-10-12) | the last machine (dryer) is done | dryer free; its open fire closes `done` — the load's loop ends |
| **Done now** `{ ownerId?, alertId? }` ⚑ Q160 | free or running | the app catches up with the real machine: a **free** one gets `ownerId`'s load, or a load with **owner unknown** (`owner_id` NULL) when none is named — never assumed (MojoSOGO 2026-10-10) (`minutes` null, `started_at = done_at = now`, `started_by` = me); a **running** one keeps its load, `done_at = now`. Any open fire closes `superseded`; a new `machine` fire is due **now**. `ownerId` is optional; a named one must be an active member |
| **Clear** | running or done | free; its open fire closes `removed`; nothing rings |
| **Remind** — *Still loaded* ⚑ Q159 | done | the load stays; its open fire closes `superseded` (`closed_by` = me) and a new `machine` fire is due **now**, so the reminders run again from alert 1 (§7D.3) |

- **Minutes** are chips, per machine (`machineMinutes`): the clothes washer **30 / 60 / 90 / 120**
  (2 hours added and 45 dropped by MojoSOGO 2026-10-10), the clothes dryer **30 / 45 / 60 / 90**, the dish washer §7D.6. **Whose load** is one active
  member (the chooser defaults to me).
- Refusals are **409** with a message, shown in place:
  - start on a machine that isn't free, or move while the dryer is full → `busy`,
    "The clothes dryer still has Sam's load." ("…has a load." when its owner is not an active member).
    The washer stays DONE — waiting; nothing moves automatically.
  - move a washer that isn't done → `not_done` "The clothes washer isn't done yet."
  - move from the dryer, or Unload Clothes Dryer on the washer → `invalid_state` with a message naming
    what the machine does take ("Move this load to the clothes dryer first.").
  - clear a free machine → `already_free`.
  - Still loaded on a machine that isn't done → `not_done`.
  - Done now on a done machine → `busy`; on a free one naming someone who is not an active member → 400 `invalid_input`.
- **Two taps at once:** every machine-row write is conditional on the row's `started_at` as it
  was read, inside the same batch as the fire writes; a row that changed under it aborts the
  whole batch → **409 `conflict`** "Someone else just changed the clothes washer — have another look."
  `uq_machine_open` also refuses a second open fire for one machine.
- A machine fire is closed **only** by these routes; `POST /fires/{id}/actions` on one is 409
  `invalid_action` (§5.4). No new `ACTION` or `CLOSE_REASON`.

### 7D.3 When it's done — reminders

- The fire is inserted by the route at start/move (as a timer's is); `tick` steps it like any
  fire (§5.3) with `MACHINE_CHANNELS` = **Phone + House + 🎪 FunHouse** (§9.4b; the FunHouse only when the founder is alerted, §7D.7), `MACHINE_RENOTIFY_MIN` = **15**,
  `MACHINE_MAX_ALERTS` = **4**. After the 4th alert it stays ringing silently in the Ringing
  bar and the card stays **DONE — waiting**. Never `missed`.
- Recipients (decided by MojoSOGO 2026-10-05: "always go to all devices"): **every active
  member's phones**, and — only when the load has someone to alert (§7D.7, MojoSOGO 2026-10-11) — **one** House announcement on **every speaker** Home Assistant lists
  (the §9.2a list, fetched at most once a tick), whatever anyone ticked in 🔊 Speak my alerts on.
  The `Everywhere` group is left out so no Echo speaks twice ⚑ Q161 (`everySpeaker`). When House
  is off or the list can't be read, the row is written with NULL: the default speakers. The
  message still names the load's owner.
- Message (`doneMessage`): `"Sam, your laundry in the clothes washer is done"` / `"… in the clothes dryer is
  done"`; when the owner is no longer an active member `"The laundry in the clothes washer is done"`.
  With the **owner unknown** (no owner, §7D.2 Done now; MojoSOGO's words, every alert and Still
  loaded alike): `"Clothes washer finished; Owner unknown; Please cycle to dryer"` / `"Clothes dryer
  finished: Owner unknown: Please unload"`. While the machine
  before it (the washer) holds a **done** load, every later dryer alert adds
  `" — Kai's load is waiting"` (`" — another load is waiting"` when that owner is not
  active). From the second alert on, `" (alert n)"` (§5.7). "Waiting" is derived at alert
  time, never stored.
- **Still loaded** (⚑ Q159): a fire due *after* the machine's done-at was restarted by Still
  loaded (`isStillLoaded`, derived, never stored). Its message says what the load needs next:
  `"Sam, your laundry is still in the clothes washer — move it to the clothes dryer"` / `"… still in the clothes dryer
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
| L4 | tick at done-at | fire ringing; push to every active member (A and B) + one house delivery, message `A, your laundry in the clothes washer is done` |
| L5 | ticks every 15 min after | alerts 2, 3, 4 (`… (alert 4)`); a 5th tick sends nothing; washer state `done` |
| L6 | move to the dryer, 60 min | washer free, its fire closed `done` by me; dryer running for A with a new fire |
| L7 | start the washer for B, then move it while the dryer is still full | 409 `busy` "The clothes dryer still has A's load."; the washer stays done; nothing moved |
| L8 | tick the dryer's done-at while B's load waits in the washer | dryer message `A, your laundry in the clothes dryer is done — B's load is waiting` |
| L9 | Unload Clothes Dryer on the done dryer | dryer free; its fire closed `done` |
| L10 | Clear a running machine | free; its fire closed `removed`; a later tick sends nothing |
| L11 | two Start taps on one free machine at once | one 200, one 409; exactly one open fire |
| L12 | minutes 20, an unknown owner, an unknown machine, `done` action on a machine fire | 400 / 400 / 404 / 409 `invalid_action`, each with a message |
| L14 | `remindMachine` on a done washer / a running or free one; `doneMessage(…, still)` | the load stays, the open fire closes `superseded`, a new fire due now / `not_done`; the §7D.3 Still loaded texts |
| L15 | Still loaded on a washer done 70 min ago, then ticks every 15 min | the old fire closed `superseded`; the new fire alerts 4 times (A's phone + house), message `A, your laundry is still in the clothes washer — move it to the clothes dryer` |
| L16 | `doneNowMachine` on a free washer for A / a running dryer / a done one; `parseDoneNow` | A's load done now, a fire due now / done-at now, old fire `superseded` / `busy`; owner optional, a named one active |
| UK1 | `doneMessage` with the owner unknown: washer, dryer, still, waiting; inactive owner; dish washer | the §7D.3 Owner unknown texts (suffixes as usual); `The laundry in the clothes washer is done`; `The dish washer is done` |
| UK2 | Done now on a free washer naming nobody, tick, move to the dryer, tick its done-at | done, owner null; `Clothes washer finished; Owner unknown; Please cycle to dryer` to every phone + house; the dryer runs unowned; `Clothes dryer finished: Owner unknown: Please unload` |
| L17 | Done now on a free washer for A, then tick | washer done for A; alert 1 to A's phone + house, `A, your laundry in the clothes washer is done`; again → `busy`; a running dryer's Done now closes its fire `superseded` |
| L18 (HS11) | a machine alert while A ticked only Game Room; HA lists Game Room, Everywhere, Toasty, the Voice PE; then HA down | the house row's speakers are Game Room, Toasty, the Voice PE; then NULL (the defaults) |
| L19 | `machineQuietUntil`, defaults, Los Angeles: Mon 18:00 / 17:29 / 20:30; Fri 21:00; Sat 12:00; Sun 21:00; weekend any time: Fri 22:00, Sat 03:00; both any time | null / Mon 17:30 / Tue 17:30; Sat 09:00; null; Mon 17:30; Sat 00:00, null; null |
| L20 | `stepFire` with `quietUntil`: a due scheduled fire; a ringing fire due its renotify; not yet due; silent past max | scheduled at quietUntil, count 0, no alert (twice); unchanged; unchanged |
| L21 | `GET /machines/hours` after 0028; an admin PATCHes; a member PATCHes; from ≥ to | the defaults; saved and read back; 403; 400 with a message |
| L13 | migration check (§4.2m) | fires and deliveries intact after 0014; machines seeded; CHECK refuses a machine fire without `machine_id` |
| DW1 | `MACHINE_LABEL`; `nextMachine`/`previousMachine` of the dish washer; `machineMinutes` | Clothes washer, Clothes dryer, Dish washer; null / null; washer 30–120 (no 45), dryer 30–90, dish washer 60–150 |
| DW2 | `doneMessage('dishwasher', …)` with a starter, none, still; a done load in the dryer | the four §7D.6 texts; never a waiting suffix |
| DW3 | start the dish washer for A, 120 min; then 45 min; tick at done-at | 200, running, `done_at = now + 120 min`; 400 with the dish-washer chips; alert 1 to every phone + house, `The dish washer A started is done` |
| DW4 | Emptied (finish) on the done dish washer; move on it | free, its fire closed `done`; 409 `invalid_state` "Dish washer loads don't move on — use Emptied." |
| DW-M | migration check (§4.2zj) | washer/dryer rows and open fires unchanged; dish washer seeded free |

### 7D.6 The dish washer

Asked by MojoSOGO 2026-10-10: "add dish washer letting me have the same start and done now, and
remember who started the dish washer".
- One more `machines` row, `dishwasher` (§4.2zj), labelled **Dish washer** 🍽️ ⚑ Q204. Every §7D.2
  transition works on it except **Move**: it has no next machine, so its done load ends with
  **Finish**, shown as **Emptied** (not Unload Clothes Dryer) ⚑ Q205. **Still loaded** works as on the
  laundry. Its alerts ring like any machine's (§7D.3), in the same alert hours (§7D.5) ⚑ Q206.
- **Who started it:** the load's `owner_id` is the person who started the dish washer. Start and
  Done now ask *Who started it?* instead of *Whose load?* (Start preselects me; Done now
  preselects Owner unknown, §7D.2); the card reads **started by Sam · done ~14:05** (with nobody
  named, **started by owner unknown**), and the Ringing bar names them as for laundry.
- **Minutes** (`machineMinutes(id)`): the dish washer's chips are **60 / 90 / 120 / 150** ⚑ Q207;
  the laundry's are in §7D.2. Any other value → 400 naming the machine's chips.
- Message: `"The dish washer Sam started is done"`; Still loaded `"The dish washer Sam started
  is still full — empty it"`; with no active starter `"The dish washer is done"` / `"… is still
  full — empty it"`. No waiting suffix (no machine before it); `" (alert n)"` follows as usual.

### 7D.7 Alert when done — asked by MojoSOGO 2026-10-11

"When a machine timer is started, make it clear and optional that someone is alerted when the machine finished. If
no one is selected, then send a phone alert but not a house alert because you do not know who to send a house alert
to." (The dish washer had just finished and every speaker in the house spoke with nobody responsible for it.)
- Every load carries an **alert person**, `machines.alert_id` (§4.2zm): an active member, or **nobody** (NULL).
- **Nobody** (or a person no longer active ⚑ Q219): the fire's channel is **Phone** only — every active member's
  phones as in §7D.3, no house row and no FunHouse row, on every alert and Still loaded alike.
- **Someone:** exactly as before — Phone + House, every speaker (§7D.3), with Quiet the house, Away and phone first
  (§9.2b–9.2d) on top ⚑ Q217. The message is unchanged (it names the owner, §7D.3).
- **The FunHouse** (§9.4b) rings only when the person alerted is **the founder** (§6.3, MojoSOGO). MojoSOGO 2026-10-12:
  "for unknown owners for machines, do not ping funhouse; ping funhouse for MojoSOGO and announcements". Someone else →
  no FunHouse row ⚑ Q269 (the FunHouse is his desk, Q230). `machineAlert(quietUntil, alertId, founderAlerted)`;
  sourceOf reads the founder (`FOUNDER_SQL`, db.ts).
- **Start** `alertId`: absent → the owner (so an older app keeps today's behavior); `null` → nobody; a string must be
  an active member, else 400 "Alert when done must be an active member or nobody.". **Done now** on a free machine:
  absent → follows `ownerId` (so Owner unknown → nobody, MojoSOGO's v1.43.0 case); on a running machine it is ignored.
  **Move** carries the washer's alert person to the dryer; **Still loaded** and a running Done now keep it; **Finish**
  and **Clear** free it.
- The dish washer's started-by does **not** decide on its own: the chooser preselects the starter (the owner chip) and
  the person can be cleared to nobody ⚑ Q218.
- `GET /machines` returns `alertId`; the card line adds **· alerts Sam** or **· phones only** (§8.5).

| # | Setup / call | Expected |
|---|---|---|
| AL1 | `machineAlert(null, 'A', true)` / `machineAlert(null, 'B', false)` / `machineAlert(q, null, false)` | Phone + House + FunHouse, every speaker / Phone + House, every speaker / Phone only, not every speaker, `quietUntil` q |
| AL7 | (A = the founder) dish washer alerting nobody, then B, tick each at done-at; alerting A; the washer alerting A while A is away | no `funhouse` row, none; one `funhouse` row titled "Ensō" with the done message; away: none |
| AL2 | `parseStart` / `parseDoneNow` with alertId absent, null, A, a stranger; Done now on a running machine | the owner / null / A / a message; null-owner Done now absent → null; running ignores it |
| AL3 | start the dish washer for A with `alertId: null`, tick at done-at and 15 min later | push to every active member, **no** house delivery on either alert |
| AL4 | Done now on a free washer naming nobody, ticks | phones only, `Clothes washer finished; Owner unknown; Please cycle to dryer`, no house row |
| AL5 | start the washer for A alerting B; move to the dryer; tick its done-at and the next | the dryer's `alert_id` is B; alert 1 phones (phone first), alert 2 adds the house row |
| AL6 | start for A alerting B, then disable B; tick | phones (and the FunHouse), no house row |

### 7D.8 Cooking timers — asked by MojoSOGO 2026-10-11

"Break machines into washing machines and cooking machines; add cooking machines: air fryer, stove, microwave… we
actually have multiple air fryers and stoves and ovens, so maybe it is the generic create and it launches an instance
of the timer. Don't despawn until explicitly closed because [I] may need to edit, give red X and auto clear end of day
assuming timer isn't active."

The washing machines (§7D.1–7D.7) are unchanged. A **cooking timer** is not a fixed machine: anyone **creates** one
each time something goes in, as many as they like at once, and it stays on the list until someone closes it.
- **Stored** as one more `machines` row (§4.2zp): id `cook_…`, `cook_kind` (`COOK_KIND`, vocab), an optional `name`
  (≤ 40 characters, "Oven 2"), `created_at`, and `closed_at` (NULL = on the list). Its load uses the machine
  columns: `minutes`, `started_at`, `done_at`, `alert_id`; `owner_id` and `started_by` = who started it. Its
  fire is an ordinary `machine` fire on that row. A closed timer's row stays (its fires point at it) and is never shown again.
  `GET /machines` still lists only the fixed machines.
- **Kinds** ⚑ Q239: Air fryer 🍟 · Stove 🍳 · Oven 🔥 · Microwave ⚡ · Other ⏲️. Its **label** is its name, else its
  kind ("Air fryer").
- **State** is `machineState` (§7D.1): **running** before done-at, **done** after, **off** (free) when stopped or
  turned off. Rules are pure in `src/shared/cooking.ts`.

| Action | Valid when | Result |
|---|---|---|
| **Create** `{ kind, name?, minutes, alertId? }` | always | a new timer, running: `started_at = now`, `done_at = now + minutes`, a `machine` fire due then |
| **Off** | done | off; its open fire closes `done` (`closed_by` = me). Kind, name, minutes and alert person stay |
| **Stop** | running | off; its open fire closes `removed`; nothing rings |
| **Start again** | off | running again with its saved minutes and alert person, a new fire |
| **Edit** `{ kind?, name?, minutes?, alertId? }` | any state | saved. New minutes on a running or done timer move its done-at to `started_at + minutes` (never before now): the open fire closes `superseded` and a new one is due then, so a timer edited to an earlier time is done now |
| **Close** — the red ✕ | any state | `closed_at = now`; its open fire closes `removed`; gone from the list |

- **Minutes:** a whole number 1–600 ⚑ Q240; anything else → 400 "Minutes must be a whole number from 1 to 600.".
  **Alert when done** works as §7D.7: absent on Create → me; null → nobody (phones only); a person → also every
  speaker. Kind not in `COOK_KIND`, or a name over 40 characters → 400 with a message.
- Refusals are 409 with a message: Off on a timer that isn't done → `not_done`; Stop on one that isn't running →
  `not_running`; Start again on one that isn't off → `busy`; any action on a closed or unknown timer → 404. Two taps at
  once → 409 `conflict`, as §7D.2.
- **Ringing** (§7D.3 plumbing): every active member's phones, plus one House announcement on every speaker when it has
  someone to alert; Quiet the house, Away and phone first on top as for any machine. Unlike the washing machines it
  rings **at any hour** (no alert hours, §7D.5) and every **5 minutes**, 4 alerts ⚑ Q241. Message:
  `"Sam, the air fryer is done"` / `"Sam, Oven 2 is done"`; with nobody to alert (or not active) `"The air fryer is
  done"` / `"Oven 2 is done"`; `" (alert n)"` as usual. A ringing cooking fire's one button is **Off**.
- **End of day** ⚑ Q242: each tick (§5.6 step 3e) closes, as ✕ does (`closed_by` NULL), every open cooking timer
  that is **not active** and whose last change (its `updated_at`, or its done-at when later) was before today's local
  midnight. **Active** = running, or done with alerts still to send (its open fire has fewer than 4 alerts). So a
  timer still counting down at midnight stays until it has rung out, and is cleared at the next midnight unless used.

| # | Setup / call | Expected |
|---|---|---|
| CK1 | `cookLabel` with and without a name; `cookMessage` with an alert person, without, with a name | "Oven 2" / "Air fryer"; the four texts above |
| CK2 | `parseCreate` / `parseEdit`: minutes 0, 601, 2.5, 12; kind `grill`; a 41-character name; alertId absent / null / a stranger | 400 texts; 12 ok; kind and name texts; me / null / a message |
| CK3 | Create an air fryer for 12 min, then tick at done-at | 201, running, one fire due in 12 min; alert 1 to every phone, alert 2 (5 min later) adds the house (phone first, §9.2d), `A, the air fryer is done` |
| CK4 | Create with `alertId: null`; ticks at done-at and 5 min later | phones only on both alerts, no house or FunHouse row; never waits for the machine alert hours |
| CK5 | Off on the done timer; Start again; Stop | off, fire closed `done`; running with a new fire; off, fire closed `removed` |
| CK6 | Edit minutes 12 → 20 on a running timer started 10 min ago; then → 5 | done-at = start + 20, old fire `superseded`, a new one; done-at = now, done |
| CK7 | ✕ on a running timer; then GET and any action on it | fire closed `removed`; not listed; 404 |
| CK8 | `cookExpired`: off since yesterday 18:00; running across midnight; done 23:58 with 2 alerts sent; done yesterday with 4 sent; off since today 00:05 (Los Angeles) | true / false / false / true / false |
| CK9 | tick after local midnight with an off timer from yesterday and a running one | the off one closed (`closed_by` NULL), the running one stays |
| CK10 | two Stop taps at the same moment on a running timer | one 200, one 409 with a message; its fire closed `removed` once |
| CK-M | migration check (§4.2zp) | the three machines and their open fires unchanged; a cooking row and its fire can be written |

### 7D.9 A bounty from a done load — asked by MojoSOGO 2026-10-11

"When a washing machine timer is done, have option to create bounty … basically someone else can advance the loop."
A done load can be handed to anyone through a one-off bounty (§7B.8). Nothing new is stored: it is an ordinary
one-off, posted by an admin (ADM) through `POST /bounties`, not tied to the machine ⚑ Q263. Moving or finishing the
load does not pay it; whoever did the job says **Done** in Chores → Bounties, as for any one-off.

- `loadBountyTitle(id, ownerName)` (pure, `machines.ts`) → the sheet's starting title, cut to `BOUNTY_TITLE_MAX`:
  clothes washer "Move Sam's load to the clothes dryer", clothes dryer "Take Sam's load out of the clothes dryer and
  fold it", dish washer "Empty the dish washer"; with no owner, "the load" in place of "Sam's load".

| # | Given | Expect |
|---|---|---|
| LB1 | `loadBountyTitle` for washer / dryer with Sam, washer with null, dish washer, a 60-letter name | the texts above; "Move the load to the clothes dryer"; "Empty the dish washer"; at most 60 characters |

---

## 7E. Recipes — `src/shared/recipes.ts` (pure)

Decided by MojoSOGO 2026-10-03. The household finds dishes on YouTube; a recipe in the app keeps
what to buy and what to do, next to the video. **Paste a YouTube link** and the Worker reads the
recipe out of the video's own text, or **type one by hand**. Since v1.29.0 (asked by MojoSOGO
2026-10-05) **any link** works too — a Facebook reel or post, a recipe site, any web page — and the
kind of link is detected, never chosen (§7E.6). Recipes are household-shared: anyone
may add a recipe; editing, re-reading or deleting it, or changing its picture, is its creator or an admin (§6.3, Q66). They live in 🛒 Lists → 🍳 Recipes (§8.12).

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
`home/captions-helper.cmd` and a `captions-helper.env` holding **`CAPTIONS_TOKEN`** and **`IDENTIFY_MODEL`** (never
in the repo; README). It imports only `src/worker/youtube-captions.ts`, `src/shared/item-reading.ts`,
`src/shared/note-marks.ts`, its own siblings in `home/`, `node:http` and Node's globals (§2.5).

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
  **Delete** removes it (soft). **Anyone** may add a show or mark any show watched (or wanted again); editing or deleting it is its creator or an admin (§6.3, Q154).
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

## 7G. 💪 Task buddy — `src/shared/tasks.ts` (pure) — asked by MojoSOGO 2026-10-19

"A task accountability system that periodically checks in with me while I'm working on something, helps me stay
focused, encourages me when things are difficult, and celebrates progress … accountability without nagging … Enso
is my accountability teammate, not my boss." And: "Enso should ask 'what does done look like' so when we think we
are done, Enso can verify." Plan: `/mnt/project-files/arec-task-buddy.md`.

### 7G.1 A session rides on a rolling timer

A **task session** is one person's piece of work, from Start to Finish or Stop. It is stored as a rolling timer
(§5.5) the way a cooking timer is a machines row (§7D.8): a `timers` row with id `task_…` (`isTaskId`) holds the
title, the check-in interval, the channels, `assigned_to = [me]` and `running`; its fires are ordinary `timer`
fires, so Away, Quiet the house, phone first and the FunHouse rule all apply unchanged (§9.2b–9.2d, §9.4b). The
session's own state is one `task_sessions` row with the same id (§4.2zz). A task timer is never listed, edited or
started by `/timers` (404 there), and `GET /fires` shows a task's fire only to its owner.

- **One open session per person** ⚑ Q298: Start while one is open → 409 `busy` "You already have a task going: {title}."
- **State**, derived, never stored (`taskState`): `ended` (ended_at set) · `break` (break_until set) · `paused`
  (paused_at set) · `working`.
- **Working time** = `worked_ms` + (now − `working_since` while working). Break and pause time never count.
  Elapsed = now − `started_at`.
- **Timed or open-ended:** `limit_min` (1–720) or NULL. A timed task's clock is working time, so a break or
  a pause stops it ⚑ Q299. Time up never means done.

### 7G.2 Starting — say it the way you'd say it

The start box takes one sentence, typed or dictated ("I'm going to work on my coding project for two hours",
"Keep me on track while I organize the office. Check on me every 10 minutes"). `readTaskStart(text)` (pure) gives
`{ title, limitMin, intervalMin }`:
- **interval:** "every N minutes" / "every N min" / "every hour" (N as digits or a word, one–sixty) → N; absent → null.
- **limit:** "for N minutes / hours", "for an hour", "for half an hour", "for an hour and a half", "for 1.5 hours"
  → minutes; absent → null (open-ended).
- **title:** what is left once a leading "Enso," / "Hey Enso," and one lead-in ("I'm starting to", "I'm starting",
  "I am going to work on", "I'm going to", "I'm working on", "I need to finish", "I need to", "Keep me on track
  while I", "Help me", "Let's") are dropped, cut at the first sentence end, trimmed of punctuation, first letter
  capitalized, at most `ALERT_TITLE_MAX`. "I'm starting a task" alone leaves no title (null) and the form asks for one.

The form shows what it read as fields the person can change: **What** (title), **How long** (Open-ended, 15 min,
30 min, 1 hour, 2 hours, or what was said), **Check on me every** (5, 10, 15, 20, 30, 45, 60 min, or what was said),
**What does done look like?** (one line each, up to 8 lines of up to 80 characters ⚑ Q300; optional, but the box is
always shown with a hint "Floor clear, bikes on hooks, trash out"), the channel ticks (§8.5 `ChannelChecks`) and
**🤫 Private** (the title is never spoken on a speaker). A new form starts from my **last session's** interval,
channels and Private — that is "my default"; a first session: every 15 minutes, 📱 Phone + 🔊 House (+ 🎪 FunHouse
for the founder) ⚑ Q301. **Start** says *"Sounds good! I'll check on you every 15 minutes while you work on {title}.
Let's make some progress!"* (and *"… for the next hour"* when timed).

### 7G.3 Check-ins

The session's timer fire is the **check-in**. It is due `interval` after Start or the last answer; for a timed task
never later than the moment working time reaches the limit (`nextCheckinDue`). There is only ever one open
check-in per session (the timer's one open fire, `uq_timer_open`), so an answer from the phone, the Ringing bar or
the session card answers it everywhere.

**On the phone** a check-in's push has **no buttons** ⚑ Q307 (a timer's Ack would skip the answer): a tap opens its
alert card (§9.5) with the answers. `GET /fires` gives a task's fire `taskTimeUp` (true when its working time has
reached the limit), so the Ringing bar and the card show Finished! · +15 · +30 · Stop without working it out. In
Settings → 📊 Status (§8.6) another member's task deliveries are left out of Recent deliveries ⚑ Q308.

**Missed check-ins** ⚑ Q302: the timer's renotify is 10 minutes and max alerts 2: one gentle nudge, then the
check-in stays open and silent ("Waiting for you" on the card) until answered. Not answering is never read as
distracted, stopped or failed, and gets no feedback at all.

**What it says** (`checkinText(task, now, alertNumber)`, the whole text, no "Timer:" and no "(alert n)"):

| When | Alert 1 | Alert 2 (the nudge) |
|---|---|---|
| working | one of "{T}: how's it going?" · "{T}: how are you doing?" · "{T}: how's it coming along?" (by check-in count); plus " About N min to go." when a timed task has ≤ one interval left; plus " You've been at it a while. A longer break might feel good." when working time since the last break or start is ≥ 90 min ⚑ Q303 | "Still working on {T}? No rush checking in. I'm here when you need me." |
| time up (timed, working time ≥ limit) | "That's your {limit}! Nice work showing up for {T}. Did you finish, or would you like a little more time?" | "Still there? Tell me how {T} went whenever you're ready." |
| break over | "Break's over! Ready to get back to {T}?" | "Whenever you're ready, {T} is waiting. No rush." |

`{T}` is the title, or "Your task" when Private. Spoken on a speaker, a Private task's check-in is "Time for a
task check-in." `{limit}` reads "hour", "2 hours", "30 minutes", "hour and a half".

**The answers** — the five, then the session actions:

| Answer | What happens next |
|---|---|
| 🚀 Great! | check-in closes `acked`; next one in `interval` |
| 👍 Steady! | same |
| 🦋 Got distracted | same; the reply offers **Check on me in 5 min** (one-off) ⚑ Q304 |
| 😩 Struggling | same; the reply offers **Check on me in 5 min**, **+15 min** (timed) and **☕ Take a break** |
| ☕ Taking a break | asks how long: 5 · **10** · 15 · 30 min ⚑ Q305; working time stops; the check-in moves to the break's end and says "Break's over"; **Back to it** ends the break early |
| time-up check-in | **Finished!** · **+15 min** · **+30 min** · **Stop for now** instead of the five |

Any answer while on a break (from its "Break's over" check-in) ends the break first. Pause and Resume (§7G.5) sit
beside the answers, with Finish and Stop.

### 7G.4 Enso's reply — supportive, varied, never the same line twice running

Every answer gets a reply at once (`taskReply`, pure), shown in a small "💪 Enso" box on the phone. The line is
picked by mood **and** how the session has gone, from a pool of at least four per case, never the same as the
last line said this session (each check-in keeps what was said):

| Case | Example |
|---|---|
| great | "That's what I like to hear! You're building momentum. Keep it going!" |
| great, 3rd in a row | "Three great check-ins in a row. You're on a roll!" |
| great or steady after distracted/struggling | "Look at you, back in the groove. That bounce-back counts." |
| steady | "Progress doesn't have to be fast. You're still moving forward, and that counts!" |
| distracted (first) | "Thanks for checking in! Let's get back to it. What's one small thing you can tackle right now?" |
| distracted or struggling, 2nd+ in a row | "Looks like getting started again has been tricky. Want to try just five focused minutes?" |
| struggling (first) | "Okay, sounds like this one's putting up a fight. You've already made an effort. Let's make the next step smaller." |
| break | "Good call! Breaks are part of getting things done. Enjoy a little downtime, and I'll check back in {n} minutes." |
| back from break / resume | "Welcome back! Let's pick up where we left off." |

When struggling or distracted and the session has a done list, the reply names one line of it as the next small
step: *"Want to start with just this: “bikes on hooks”?"* Replies are never sarcastic, guilt-giving or judging, and
never mention missed check-ins.

### 7G.5 Changing a session while it runs

Buttons on the session card, and the same in words in its **Tell Enso** box (`readTaskSay(text)`, pure):

| Say | Does |
|---|---|
| "pause", "pause my task" | **Pause**: working time stops, the check-in closes `stopped`, the timer stops; "Paused. Take the time you need." |
| "resume", "I'm back", "back to it" | **Resume**: working time restarts, a check-in in `interval`; "Welcome back! …" |
| "taking a 20 minute break", "break" | ☕ break of that length (else 10) |
| "check on me every 10 minutes instead" | the interval changes; the open check-in moves to now + new interval |
| "give me another 30 minutes", "30 more minutes", "add 15" | a timed task's limit grows (an open-ended one becomes timed: worked + N); the check-in re-plans |
| "stop announcing", "don't announce", "quiet" | the House (and FunHouse) channel is dropped for this session |
| "how long have I been working?" | answers in the box: "You've worked 42 minutes (55 since you started), 18 to go." |
| "done", "finished", "I finished" | Finish (§7G.6) |
| "stop" | Stop (§7G.6) |
| "great", "steady", "distracted", "struggling", "stuck" | that answer |

Anything else: "I didn't catch that. Try 'pause', 'break', 'every 10 minutes' or 'done'."

### 7G.6 Finish, the done check, and Stop

**Finish** first holds up what done looks like, when there is a list: "Before we call it done, does it look like
this?" with a tick box per line and **📷 Check with a photo**. The photo (one, not kept) is read by Claude against
the list (`POST /tasks/{id}/check-photo`, the photo-read budget of §7C.4): each line comes back yes / no / not
sure, the yes lines are ticked for the person to confirm, with one short warm sentence. The person always decides:
**All done 🎉** finishes whatever is ticked; **Not yet, keep going** goes back to working. With no list, Finish is one
tap.

Finish and Stop both end the session (`ended_at`, `outcome` `finished` / `stopped`), close the open check-in
(`done` / `stopped`) and stop the timer. Each shows the **summary**: title, elapsed, working time, check-ins answered,
the answers as a row of emoji, a one-line pattern (`taskPattern`: "Strong momentum all the way", "Steady and
consistent", "A tough patch, then a strong finish", "A tricky one, and you kept showing up", "Heads down, no
check-ins needed"), and for a finish with a list "Done check: 3 of 4". Finish celebrates ("{T} is done? That's
awesome! You put in the work and got it handled. Enjoy that feeling!"); Stop recognizes the effort ("You put some
time into it today, and that matters. We can pick it up another time.").

**Recent** under the start form lists my last 10 ended sessions (title, date, working time, the emoji row, ✅ or
⏸). A stopped one has **Pick it up again**: a new session with its title, done list, interval, channels and
Private, started now. Nothing is ever scheduled for an unfinished task by itself.

### 7G.7 Acceptance (M4zb — each row is a test)

| # | Check | Expected |
|---|---|---|
| TB1 | `readTaskStart` on the six example sentences | "I'm starting to clean the garage." → Clean the garage, null, null; "I'm going to work on my coding project for two hours." → My coding project, 120; "I need to finish the laundry" → The laundry; "Keep me on track while I organize the office" → Organize the office; "I'm starting a task. Check on me every 15 minutes." → null title, interval 15; "clean the garage for an hour and a half, every 10 min" → 90, 10 |
| TB2 | `readTaskSay` | each row of §7G.5 → its command with its number; "banana" → null |
| TB3 | `workedMs`, `taskState`, `nextCheckinDue` | working since 10:00 with 5 min banked, at 10:20 → 25 min; on a break → banked only; a 30-min task with 25 worked and interval 15 → due in 5 min; open-ended → now + interval |
| TB4 | `checkinText` | the table's texts for working (1st, 2nd count, the to-go and long-break suffixes), time up, break over; Private → "Your task"; alert 2 the nudges |
| TB5 | `taskReply` | each case of §7G.4; never equal to the last line said; the done-list step line when struggling with a list |
| TB6 | `taskPattern` / summary | 🚀🚀🚀 → strong; 👍👍 → steady; 🦋😩🚀 → tough patch then strong; 🦋😩🦋 → tricky; none → heads down |
| TB7 | POST /tasks then a tick at the due time | 201, a `task_…` timer row not in GET /timers; one push to me only (not to another member); phone first (§9.2d): the house row comes with the nudge, Private speaks "Time for a task check-in."; Ack on it 409; another member's GET /fires and Status leave it out |
| TB8 | POST /tasks while one is open | 409 `busy` |
| TB9 | check-in answer great; struggling; break 15 | fire closed `acked`, a new fire `interval` later, a reply; struggling offers soon; break: state `break`, the fire due at the break end, working time stops |
| TB10 | missed: ticks at due, +10 min, +20 min | alert 1, the nudge "Still working on…", then nothing; the fire stays ringing |
| TB11 | pause, resume, PATCH interval / addMin / quiet | paused: fire closed `stopped`, no tick alerts; resume: a new fire; interval moves the open fire; addMin grows the limit; quiet drops house and funhouse |
| TB12 | finish with ticked [0, 2] of 3; stop | outcome, ended, the fire closed, `doneTicked`, the summary; stop: outcome stopped; GET /tasks lists both under recent |
| TB13 | check-photo (fake Claude) | the image block before a prompt naming each line; yes / no / unsure per line; one photo-read counted; nothing stored |
| TB14 | POST /fires/{id}/actions ack on a task fire; GET /fires as another member | 409 "Answer this check-in with how it's going."; the task's fire not listed |
| TB15 | `/status` `myTask` (Q309) | null; after POST /tasks `{ title, state: 'working' }` (Private too); another member null; break → `break`; pause → `paused`; stop → null |
| TB-M | migration check (§4.2zz) | earlier timers and fires untouched; a task session row can be written |


## 7H. 📥 Send to Enso — the share inbox — `src/shared/inbox.ts` (pure) — asked by MojoSOGO 2026-10-19

"A Share to App feature that lets you send URLs, images, and text directly from your iPhone into your application
without manually copying and pasting … Ideally, this happens without opening your PWA." A web app's manifest cannot
be an iOS share target, so the door is an **iOS Shortcut** in the Share sheet that posts what it was given to Ensō.
Ensō saves it at once, in the background, to **my own 📥 Inbox** and answers with a line the Shortcut shows as a
notification (MojoSOGO 2026-10-19 "Do it", on auto-save then process afterward). Processing an item into a to-do,
recipe or event is not built (§12.7); the Inbox shows, opens, copies and clears what arrived.

### 7H.1 My Send to Enso key

- Each member may have **one key** (`share_keys`, §4.2zzb). Only its SHA-256 is stored; the key itself
  (`enso_` + 32 random Crockford characters) is shown **once**, when made, to be pasted into the Shortcut.
- **Make my key** (and **Make a new key**) replaces any old key: the old one stops working at once. **Turn off**
  deletes it. A disabled member's key never works.
- `GET /share/key` → `{ on, createdAt }` (mine). `POST /share/key` → **201 `{ key, createdAt }`**.
  `DELETE /share/key` → 204.

### 7H.2 `POST /share` — what the Shortcut calls

`Authorization: Bearer <my key>`; no session cookie. In this order:
1. A missing or unknown key (or a disabled member's) → **401 `unauthorized`** "That Send to Enso key isn't right.
   Make a new one in Ensō: Lists → 📥 Inbox → Set up." The key and the header are never logged or echoed.
2. **The body**, by content type:
   - `multipart/form-data` or `application/x-www-form-urlencoded`: every field. A string field is text. A file part
     is a **photo** when its first bytes are a JPEG, PNG, WebP or HEIC (`photoTypeOf`, by the bytes, not the
     declared type ⚑ Q320); a file part that is not an image but whose declared type is `text/*` is read as text;
     anything else is skipped.
   - `application/json`: `{ url?, text? }` strings.
   - an image type or `application/octet-stream`: the raw body, a photo if `photoTypeOf` says so.
   - `text/*`: the raw body as text.
3. `shareText(strings)` (pure): the trimmed, non-empty strings. The first one that is a single `http(s)` link is the
   **url**; the rest, joined with a blank line, are the **text**. With no such string, the first link found inside the
   text is the url and the text is kept ⚑ Q321. → `{ url, text }` or `null` when nothing is left.
4. Nothing to save (no text, no url, no photo) → **400 `nothing_shared`** "Nothing came through to save."
   Text over `INBOX_TEXT_MAX = 4000` ⚑ is cut to it; a url over `INBOX_URL_MAX = 2000` → 400 `invalid_input`.
   A photo over `INBOX_PHOTO_MAX_BYTES = 12 MB` ⚑ Q322 (a full-size iPhone photo, not shrunk) → 400 `invalid_input`
   "The photo is too large: at most 12 MB." At most `INBOX_PHOTOS_MAX = 10` photos in one share.
5. **Hourly limit:** at `SHARE_PER_HOUR = 60` ⚑ items of mine created in the last hour → **429 `rate_limited`**,
   nothing written.
6. Saved: the text/url as one item, and each photo as its own item (the text goes with the first photo when both
   came) ⚑ Q323. Photos go to R2 under `inbox/{member}/…` (`photo-store.ts`).
7. **201 `{ saved, items: [{ id, kind }], message }`**, `kind` = `INBOX_KIND` (`photo` / `link` / `text`, `vocab.ts`), derived, never stored (§4.2zzb),
   `message` = "✅ Saved to your Enso Inbox" (or "✅ 3 saved to your Enso Inbox"). Every error has its `message` too,
   so the Shortcut shows the `message` either way.

### 7H.3 The Inbox — `GET /inbox`, `DELETE /inbox/{id}`, `GET /inbox/{id}/photo`

- Mine only ⚑ Q319: another member's item is 404, as is a missing one.
- `GET /inbox` → `{ items: [{ id, kind, url, text, hasPhoto, createdAt }] }`, newest first, at most 200.
- `DELETE /inbox/{id}` → 204, and its photo goes from R2.
- `GET /inbox/{id}/photo` → the image (`private, max-age=3600`); 404 with no photo.
- Items stay until I clear them ⚑ Q324.

### 7H.4 The Shortcut (shown in the app's Set up, §8.8a)

Made by hand in the Shortcuts app; a ready-made Shortcut file cannot be handed out (Apple requires them signed).
Steps (the app fills in this server's address and shows my key with 📋 Copy):
1. Shortcuts → ＋ → name it **Send to Enso**. ⓘ → turn on **Show in Share Sheet**; Receive **Images, URLs and Text**
   (not Safari web pages, which would pull the page's own pictures) ⚑ Q325.
2. **Get Images from Input** (Shortcut Input).
3. **If** Images **has any value**:
   **Get Contents of URL** `{origin}/api/v1/share`, Method **POST**, Header `Authorization` = `Bearer {key}`,
   Request Body **Form**, field `photo` (File) = Images.
   **Otherwise:** the same, with field `text` (Text) = Shortcut Input. **End If**.
4. **Get Dictionary Value** `message` in **If Result**. **Show Notification** Dictionary Value.

### 7H.5 Acceptance (M4zc — each row is a test)

| # | Check | Expected |
|---|---|---|
| SH1 | `shareText` | `[" https://a.b/c "]` → url only; `["see https://x.y/z ok"]` → url `https://x.y/z`, the text kept; `["https://a.b", "hi"]` → both; `["", "  "]` → null; 4001 chars → cut to 4000 |
| SH2 | `photoTypeOf` | JPEG, PNG, WebP and HEIC headers → their types; text bytes → null |
| SH3 | POST /share with no key; a wrong key; a disabled member's key | 401 `unauthorized` ×3; nothing written |
| SH4 | POST /share/key, then POST /share JSON `{ url }`; form `text`; text/plain; form `photo` (a JPEG declared octet-stream) | 201 ×4 with `message`; GET /inbox lists link, text, text, photo newest first; the photo serves |
| SH5 | a new key, then the old one | the old one 401, the new one 201 |
| SH6 | DELETE /share/key, then POST /share | 401; GET /share/key `{ on: false }` |
| SH7 | an empty form; a 13 MB photo; 60 items in the hour then one more | 400 `nothing_shared`; 400; 429, nothing written |
| SH8 | another member's GET /inbox, its photo and DELETE /inbox/{id} | an empty list; 404; 404 |
| SH9 | DELETE /inbox/{id} of mine | 204; gone from the list; its R2 object deleted |
| SH-M | migration 0055 (§4.2zzb) | earlier members come through with no key; a key and an item can be written |


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
- **Every popup opens scrolled to the top** (v1.84.2, ⚑ Q318; MojoSOGO 2026-10-19 "window opening mid
  scroll and not at top where picture is largest"). On iPhone, `showModal` focuses the first text field;
  below a big picture (an edit form's photo, a recipe's screenshot) Safari scrolled the dialog down to it.
  So on open the dialog body starts at the top, and a field `showModal` focused that is not fully visible
  there gives up focus to the dialog itself (`preventScroll`). A field at the top (a new form's title) keeps it.

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
| 📅 Calendar ⏰ Alerts 🧹 Chores 🛒 Lists 🏡 Home ⚙ Settings | <- tab bar
+-------------------------------------+
```

- **Six tabs**: **🧹 Chores** (§8.15) sits between Alarms and Lists (v1.28.0, ⚑ Q166); **🏡 Home** (§8.19) between
  Lists and Settings (v1.109.0, ⚑ Q389). Recipes are not a tab: they are a view inside 🛒 Lists (§8.12, MojoSOGO
  2026-10-27 "move recipes into lists", Q393). A phone that remembered the old 🍳 Recipes tab opens on Lists with
  🍳 Recipes chosen. The bar is a grid with one
  equal column per tab (`grid-auto-flow: column`), icon above label, so all six fit one line at 320 px without
  wrapping or truncating (labels .7rem).
- **Flush at the bottom** (asked by MojoSOGO 2026-10-10): the app frame is fixed to the whole screen
  (`position: fixed; inset: 0`), never `height: 100%`, which on an installed iPhone left a strip of
  page below the bar. The bar's own colour runs down through the home-indicator area. In the
  installed app (`display-mode: standalone`) the page (`html`) and the frame are `100lvh` tall:
  there WebKit's `100%`, `dvh` and `bottom: 0` fall short by the top safe-area inset, and the
  page cut the bar off at that line (v1.60.2–v1.60.4, MojoSOGO 2026-10-11, iOS 26).
  The tab buttons sit 12 px into the home-indicator area (strip = inset − 12 px, at least 14 px;
  MojoSOGO 2026-10-11 "lower more", v1.60.6).
- **Build stamp under the tabs** (asked by MojoSOGO 2026-10-10, v1.44.0): the same `v{version} ·
  {commit}` as the opening screen (§8.10) shows all the time as tiny dim text centered in the
  bar's bottom strip, just under the tab buttons and above the home indicator, never over them (centered
  since v1.60.6, MojoSOGO 2026-10-11 "center version"); it is
  not tappable. Where the screen has no bottom inset (desktop, Android, older iPhones) the strip is
  at least 14 px tall so the stamp still shows ⚑ Q208. It is the same build-time value as the
  opening screen's (one `buildStamp()` feeds both), so it always names the build that is running.
  **Check:** on the installed iPhone app, the bar touches the bottom edge with no page showing under
  it, and the stamp under the tabs matches the opening screen's.
- **My task is running** (asked by MojoSOGO 2026-10-19, "I need an icon on task buddy if it is running so i know",
  v1.82.0 ⚑ Q309): while I have an open task session (§7G), the ⏰ Alerts tab shows a small 💪 on its icon (title
  "Alarms, task running"), on every tab, from `/status` `myTask`. Only mine; nobody sees another member's.
- The **Ensō button** (§8.18) sits centred just above the tab bar on every tab: tap it, or hold it and talk, and say what you want.
- The **＋** floating button appears on Calendar only and creates an event. The
  Alerts tab has its own **＋ Add** button in each section header.
- **Status badges:**
  - A **red badge** appears in the header from `/status` `house.state` (§9.2), exactly as the
    server reports it — the PWA never re-derives it ⚑ (Q38):
    - `failing` → **"🔇 House failing"**; tapping it: "The last house announcement did not
      get through to Home Assistant (over the Cloudflare tunnel at ha.sogodojo.com), so
      alerts set to “House” may not be spoken. Check that Home Assistant and its Cloudflared
      add-on are running; the error is in Settings → 📊 Status. Alerts still show in the Ringing
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

A stack at the top of every screen, one row per `ringing` fire **that is for me**, newest first. Nobody sees another
person's alert: a fire is for me when I am among the people its alert pushes to (§5.7), whatever its channels: a
reminder or timer assigned to nobody or to me and on for me (§7.5), a chore step that is mine, a machine or cooking
timer that alerts me, a task check-in that is mine. One that names nobody (assigned to nobody, a thing, a machine
with nobody to alert) is everyone's; one whose people are all gone shows to nobody, as it pushes to nobody. A fire
whose source is gone still shows, so it can be closed ⚑ Q347.

- Reminder row: `🔔 Take out trash · 19:00` with **[Snooze 10m] [Done]** (an all-day event:
  `· all day`; a sun-timed one, §7.7: `🔔 Put the goats away · sunset` ⚑ Q56)
- Timer row: `⏱ Check on the dog · ringing 45 min` with **[Ack]**
- Chore row: `🧹 Laundry — Move to dryer · Sam` with **[Done]** (no snooze)
- Thing row: `📌 Fall fair · to do` with **[Snooze 10m] [Done]** ⚑ glyph
- Machine row: `🧺 Clothes washer · Sam` with **[Move to clothes dryer]** — it opens the same
  dryer-minutes chooser the Machines card uses (§8.5); `🧺 Clothes dryer · Sam` with **[Unload
  Clothes Dryer]**; `🧺 Dish washer · Sam` (who started it, §7D.6) with **[Emptied]**. No Done:
  a machine fire is closed only by the `/machines` routes (§7D.2), or `/cooking` (§7D.8). ⚑ Q40
- Task check-in row (§7G, §8.5a): `💪 Clean the garage · check-in` with the five answers, no Ack; only its owner sees it.
- Cooking timer row (§7D.8): `🍳 Air fryer · Sam` (its label, then who started it) with **[Off]**. The glyph is 🍳 for
  every kind ⚑ Q246.
- **Away** (§9.2c) on every row not yet away: "I've seen it, I'm not home." The speakers and phones stop for that alert;
  the row stays. An away row shows `· away ({name})` instead of the button.
- Buttons are at least 44px tall. When the stack exceeds 3 rows it collapses to
  "3 more ringing ▾".

**Acceptance (API tests, `test/alerts-api.test.ts`):**

| # | Setup / call | Expected |
|---|---|---|
| RB1 | a reminder assigned to A and B rings; `GET /fires` as A, as B, as C (an admin) | A and B get the row; C does not |
| RB2 | a reminder assigned to nobody rings; `GET /fires` as C | C gets the row |
| RB3 | a timer assigned to A rings; `GET /fires` as A, as C | A gets the row; C does not |

### 8.3 Day sheet

A modal that opens over the calendar and is titled with the date ("Tue, Oct 6").
It contains, in order:

1. The day's weather, when there is a forecast for it (§7.11), then its moon phase (§7.12).
2. The holiday line(s), then the school day line (§7.13), then 📈 (§7.4).
3. All-day events.
4. Timed events in time order, each showing time, title, creator chip, assigned
   chips, 🔔 if it has a reminder and 📝 if it has notes (§8.4a). The 📝 shows only on a row the member may open:
   `/calendar` sends `hasNotes` true only then, so a 🔒 event never tells that it has notes ⚑ Q362. A private event
   the member may not open shows only its time, a grey bar and "🔒 Private", and doesn't open (§6.3 Private events).

**Who it's for** (v1.73.0, MojoSOGO 2026-10-12: "One person mentioned twice; just mention once. If
everyone; make one green bubble with words family"): each person shows **once**. A creator who
is also assigned shows only as their name chip, with the creator's color border (Q281). Name chips
have no "→" (v1.73.2, MojoSOGO: "This is a calendar event not rotation"). **MojoSOGO** (the
founder), when taking part, comes **first**, in the chips and in the calendar line's dots (v1.73.4: "sort with MojoSOGO
color first"; FA5). When the
event is assigned to **every active member** of a household of two or more, the chips are one green
(`--good`) **Family** chip and nothing else (Q282). The calendar cell does the same with its dots
(§7.1). The rule lives in `frontend/src/participants.ts`; **Acceptance** (`test/participants.test.ts`):
FA1 duplicates shown once; FA2 every active member → Family (a disabled member is not needed); FA3 some
members → not Family; FA4 a one-person household, or nobody assigned, is never Family; FA5 the founder, when assigned, is first.

Tapping an event opens the event form. A row the member may not open (§6.3 "Who opens an event") looks the same
with a 🔒 after the title and does nothing when tapped (⚑ Q297). **＋ Add event** at the bottom pre-fills
the date.

### 8.4 Event form (modal)

Fields:

- **📷 Screenshot** and **📋 Paste** (§7.8, §7.9): above the Title, on new and existing events; fill or update the
  form from a picture or what was copied (§7.9a), save nothing.
- Title
- Date
- All-day toggle
- Start / end time (hidden when all-day)
- End date (all-day only)
- **Address** (optional, §7.9) with **Open in Maps**; under it the **📍 Saved places** picker and, when the Title names a
  saved place, **📍 Use {name}** (§7.9b)
- **Things to bring** (optional, §7.10): one line each, ✕ to remove, an add box with **＋ Add**
- Repeat: Never / Daily / Weekly (day checkboxes) / Every 2 weeks / Monthly on day N /
  Monthly on the nth weekday (e.g. "Monthly on the 3rd Friday", derived from the date) /
  **Monthly on certain weeks** — the date's weekday, with week chips **1st 2nd 3rd 4th
  Last** (at least one; the date's own week is pre-ticked), e.g. "Thursdays: 1st · 3rd" /
  Yearly, plus an optional end date
- Assigned to (member chips, none = everyone)
- **Notes** (optional, ≤ `EVENT_NOTES_MAX`), last: the box with **⤢** that opens the notes sheet (§8.4a). The ⤢ works
  for a member who can't change the event too; for them the sheet is read only.
- **Emoji** (optional, §7.6): one emoji — typed with the phone's emoji keyboard — shown
  beside the title. On a new event it is guessed from the title until the person types in it or clears it
  (§7.6 Guessed emoji); while it holds a guess, a muted **✨ guessed** shows beside the box.
- **☐ 🔒 Private — only the people going see it** (creator or admin, §6.3 Private events): shown with the Optional
  box; needs someone ticked in Assigned to.
- **☐ Optional — each person turns it on** (creator or admin, §7.5). On an optional event
  the form also shows **☐ On for me** — every member's own switch. It takes effect the
  moment it is ticked (like the Settings switch), needs no Save, and stays usable for
  members who can't edit the event. ⚑
- **Reminder:**
  - None / At start / 5 / 15 / 30 / 60 min before / 1 day before / for all-day events
    **The evening before (8 pm)** (= 780 min before the all-day start of 09:00) ⚑
  - Channels: ☐ Phone ☐ House
  - Repeat alert every: Off / 5 / 10 / 15 / 30 min / **Every hour**. Every hour also saves `maxAlerts` =
    `HOURLY_MAX_ALERTS` (12 ⚑ Q292), so an hourly reminder keeps ringing about 12 hours until someone taps
    **Done**; every other choice leaves `maxAlerts` to the API default (4). (MojoSOGO 2026-10-15: "Saturday
    reminder 9:00am … repeat hourly until she ACKs".)
    **RH1:** `toReminder` with Every hour → `renotifyMin` 60, `maxAlerts` 12; with Every 30 min → no `maxAlerts`;
    `reminderOf` a stored 60 → Every hour.
  - **☐ 🎲 Random time** with **From / To** time boxes (new tick: 09:00 → 17:00 ⚑ Q293). (MojoSOGO 2026-10-16:
    "randomize the time reminders are sent within a time range … I keep forgetting [a car repair] and time received is
    inconvenient".) Ticked, each occurrence's reminder rings once at a time picked in [From, To) on the reminder's day
    (§5.1), a different time each day; the repeat and channels work as before. From must be before To (no overnight
    window ⚑ Q295); the API refuses anything else with 400 (`reminder.randomFrom` / `randomTo`, both or neither).
    **RT1:** `randomTimeIn` stays in [from, to) and is the same for the same key; `randomWindowError` takes both or neither,
    HH:MM, from < to. **RT2:** a daily 08:00 event with 09:00–17:00 plans one fire a day inside the window on its own date,
    not all at one time; 1 day before / the evening before land on the day before; no window → the plain time.
    **RT3:** POST stores and returns the window, a title-only PATCH keeps it, a reminder without it clears it, a bad one
    → 400. **RT4:** tick plans the fire inside the window. **RT5:** the form's tick ⇄ `randomFrom` / `randomTo`.

Actions:

- **Save / Cancel**
- Delete (owner or creator)
- For a repeating event: **Delete this occurrence** (adds to `exdates`) and
  **Delete series**

### 8.4a Notes sheet — asked by MojoSOGO 2026-10-21

MojoSOGO: "In Calendar, let me tap to see the notes and then expand the notes with like a full screen pop-up with basic
edit features" and "in the notes auto highlight pertinent information". One piece, `NotesField` + `NotesSheet`
(`components/NotesSheet.tsx`), serves every long note that has the same need: an **event's notes** (§8.4) and a **list
item's note** (§8.8). The notes stay plain text in the same column and limit. To be highlighted, the text on screen
goes to the home AI and nowhere else, and the AI's highlights are remembered for that exact text (below).

- **The box:** the form's notes textarea, with a **⤢** button (accessible name "Open notes full screen") at its
  label. ⤢ opens the sheet; it stays usable for a member who can't change the entry (read only for them).
- **The sheet** is a full-screen modal (`Modal` with `full`: the whole screen inside the iPhone's safe areas), titled
  "📝 Notes: {title}". It opens in **read mode**: the notes at 17 px, line breaks kept, with what matters
  **highlighted** (below). Empty notes read "No notes yet." A **☐ / ☑** line ticks or unticks on tap when the member
  can change the entry ⚑ Q363. Footer: **✏️ Edit** (only when they can change it) and **Done**.
- **Edit mode:** the notes in a textarea filling the sheet, a toolbar above it: **• List** and **☐ Box** put the mark
  on every line the selection touches (on the cursor's line when nothing is selected), or take it off when every one
  of those lines has it; ☐ Box turns a • line into a box line. **Enter** on a • or ☐ line starts the next line with the
  same mark (after ☑ a ☐); Enter on a line that is only the mark removes it and ends the list. The marks are the plain
  characters `• `, `☐ `, `☑ ` and count toward the limit; a toolbar change that would pass it does nothing. **👁 View**
  goes back to read mode.
- **Done** (or ✕) closes the sheet and hands the text back to the form, which saves it on its own **Save** as before
  (closing the form without saving still asks). The sheet saves nothing itself ⚑ Q363.
- **Highlights: the home AI first, patterns as the fallback** (MojoSOGO 2026-10-21: "AI with PAT fallback; make sure
  you interface with model manager", Q364). Each mark has a kind from `NOTE_MARK` (`vocab.ts`): time, date, phone,
  money, link, email, address, key.
  - **Patterns** (`markNotes`, `frontend/src/notes-marks.ts`, pure) draw at once, with no network: times (`6pm`,
    `18:30`, noon), dates (`Oct 25th`, `10/26`, weekdays, today / tomorrow / tonight), phone numbers, `$` amounts,
    links, emails, street addresses (a number, up to four words, a street word: St, Ave, Rd, Blvd, Dr, Ln, Way, Ct, Pl,
    Pkwy, Hwy, Cir, Ter) and a **key line**: from *bring, don't forget, remember to, RSVP, deadline, due, important,
    gate code, door code, password, confirmation* to the end of its line. Overlaps: the first to start wins, then the
    longer.
  - **The home AI** reads the same text and marks what a busy parent needs at a glance, including what no pattern sees
    ("Sam's allergy is peanuts", "Grandma drives us home"). Each time read mode shows a text it hasn't asked about,
    the sheet (`useNoteMarks`) sends it to `POST /notes/marks` (§10). **Remembered** (MojoSOGO 2026-10-22: "Have it
    remember previous highlight on subsequent opens"): the route first looks up `note_marks` (§4.2zzi) by the SHA-256
    of what SogoAI would be asked: `NOTE_MARKS_PROMPT`, `NOTE_MARKS_SCHEMA` and the text (`noteMarksKey`). So a change
    to the prompt or the answer's shape asks every text afresh, and the old answers age out (MojoSOGO 2026-10-22,
    ⚑ Q375). A model change on SogoAI is not seen: on a hit the Worker never asks the home, so it can't know the
    model, and neither are the home-only settings (max tokens, temperature, timeouts). Each remembered answer is
    still re-checked against the text, and ages out within `NOTE_MARKS_KEEP_DAYS`. A hit answers with those marks at once, for anyone in the household, without asking SogoAI, even when
    it is busy, off or not set up. An answer with at least one mark that stands is stored for its text; an empty
    answer or a failure never is, so the next open asks again. Notes that change are a different text and are asked
    afresh. A remembered answer is kept `NOTE_MARKS_KEEP_DAYS` (180) after it was stored; older ones are dropped
    whenever a new one is stored ⚑ Q374. On a miss the route asks the SogoAI helper's
    `POST /note-marks` through Access with the `CAPTIONS_TOKEN` bearer (`noteMarksFromHome`, the §7A.3 path), waiting
    `HOME_NOTE_MARKS_TIMEOUT_MS` (25 s) ⚑ Q370. The helper first asks the **PC model manager** (SogoAI's
    `127.0.0.1:8793`, `GET /state`, 5 s; `home/model-manager.ts`). It goes ahead only when the manager answers, no
    model action is running (`busy` null), and `IDENTIFY_MODEL`, the one small chat model SogoAI keeps loaded, is
    already in `mem.lmStudio`. Ensō never takes a lease (a lease starts ComfyUI and sets its shared last model), and
    never makes LM Studio load or unload a model: no `ttl`, unlike §7A.3's photo naming. Then it makes one
    LM Studio chat call (`home/lm-studio.ts`, 15 s): `NOTE_MARKS_PROMPT`, temperature 0, a `json_schema` answer
    `{ marks: [{ text, kind }] }` (`src/shared/note-marks.ts`). The answer comes back as a `NoteMarksReport`: ok with
    the model's marks, or `off` (no `IDENTIFY_MODEL`, or no manager), `busy` (a model action is running, or the model
    isn't loaded) or `failed`, each with a reason.
  - **What stands** (`validMarks`, Worker side): a mark only when its kind is in `NOTE_MARK` and its text is a
    non-empty exact copy of part of the notes, on one line, at most `NOTE_MARK_TEXT_MAX`; repeats are dropped and at
    most `NOTE_MARKS_MAX` are kept. **Every** place the text appears is marked. In read mode the AI's marks lead and
    the patterns fill the gaps between them, so a phone the AI missed still rings ⚑ Q368.
  - **Which one shows, said in a muted line under the notes** ⚑ Q369: "✨ Asking the home AI…" while it asks (the
    patterns are already drawn); "✨ Highlights by the home AI" when it answered with marks, "✨ Home AI found nothing more" when it answered with none (so an empty answer never looks like AI highlights); otherwise "Highlights by patterns ·
    home AI {why}": *isn't set up* (`unset`: the Worker has no helper settings), *is off* (`off`), *is busy* (`busy`),
    *didn't answer* (`failed`, or the request itself failed). The fallback is never silent.
  - The notes are sent only from the sheet that already shows them to that member. Only the AI's marks are stored,
    under the text's hash (the notes themselves stay where they are); nothing is counted (no `photo_reads` budget),
    and no side logs the text: the helper logs the outcome and the number of marks.
  - A tapped **phone** rings (`tel:`), a tapped **link** opens (only through §7C.1 `webLink`); the other highlights
    are text.
- The line editing is `frontend/src/notes-edit.ts` (pure).

**Acceptance** (`test/notes-marks.test.ts`, `test/notes-edit.test.ts`, `test/event-access-api.test.ts`):
NH1 the pieces join back into the notes; plain notes are one plain piece. NH2 times and dates. NH3 phone, money, email,
link. NH4 a street address. NH5 a key line is marked to its end, holding what is on it. NH6 a phone → `tel:` digits, a
link → `webLink`, anything else → nothing. NE1 • List on a selection marks every line, again unmarks; with no selection
only the cursor's line. NE2 ☐ Box swaps a bullet for a box; ☐ and ☑ lines unbox together. NE3 a tap flips ☐ ↔ ☑ on
that line only. NE4 Enter continues the list, ☑ → ☐. NE5 Enter on a bare mark ends the list. NE6 Enter on a plain line
is a plain Enter. NS1 `/calendar` gives `hasNotes` true for an event with notes the member may open, false for one
without, and false for a 🔒 event with notes.

**Acceptance, the home AI** (`test/note-marks.test.ts`, `test/home-note-marks.test.ts`, `test/notes-api.test.ts`,
`test/captions-contract.test.ts`): NA1 `validMarks` keeps exact copies on one line, drops a mark not in the text, one
across a line break, an empty one, an unknown kind and a repeat, and caps the count. NA2 `mergeMarks`: the pieces join
back into the line; the AI's marks lead, patterns fill the gaps; every place an AI phrase appears is marked; with no AI
marks it is `markNotes`. NA3 the helper over a fake manager and LM Studio: no `IDENTIFY_MODEL` → `off`, nothing called;
manager unreachable → `off`; manager `busy` → `busy`; model not loaded → `busy`, LM Studio not called; ready → one LM
Studio POST with the model, temperature 0, the json_schema and no `ttl` → ok with the marks; LM Studio non-2xx or bad
JSON → `failed`. Never a lease, load or unload call. NA4 the helper's `/note-marks`: no / a wrong bearer → 401; GET →
405; not JSON or no text → 400; over the cap → 413; a good request → 200 with the report; its log line holds no note
text. NA5 every report the helper's note-marks produces (found by **calling** it) passes the wire into
`noteMarksFromHome`, and every kind `markNotes` can emit is in `NOTE_MARK`. NA6 `POST /notes/marks`: signed out → 401;
blank or over `NOTE_MARKS_TEXT_MAX` → 400; no helper settings → `{ via: 'patterns', why: 'unset' }`; the home answers →
`{ via: 'sogoai', marks }` with only the marks that stand; the home is busy / fails → `{ via: 'patterns', why, reason }`,
200 every time. NA8 remembered: a text whose answer had marks is answered again from `note_marks` with the same marks
and no call to the home, also with no helper settings; an empty answer, a failure and a changed text ask the home
again; a row past `NOTE_MARKS_KEEP_DAYS` is gone after the next store; a stored row whose marks no longer stand
against the text is not used; a row keyed by the text alone (a different asking) is a miss and asks the home.

### 8.5 Alerts screen

The tab is named **⏰ Alerts** (v1.82.1, MojoSOGO 2026-10-19 "Menu rename alarms to alerts"); its **⏰ Alarms** section
button keeps its name, since that section holds the scheduled alarms ⚑ (Q310).

At the very top, under the "Alerts" heading: a **📢 Announce** button. It opens the
**announce box** (modal, titled "📢 Announce"): a one-line **Message** input (16 px,
`maxLength` = `ANNOUNCE_MAX`), the channel checkboxes (☑ 📱 Phone ☑ 🔊 House ☑ 🎪 FunHouse — the same
`ChannelChecks` as the alarm form, chosen each time; the box opens with **every channel ticked, for every
member** — Q36, MojoSOGO 2026-10-11 "ALL for announcement") and **Send** / **Cancel**. Send is disabled while the message is
blank or no channel is ticked. A refusal from the server shows inside the box; on
success the box closes (there is no toast in the app). What happens is §9.3.

Right under it, **🤫 Quiet the house** (§9.2b): 1 hour · 2 hours · 4 hours · Rest of today, or, while quiet,
how long is left, who set it, and **Turn off now**.

Then a **menu of six buttons**, the same grid as Settings (§8.6, `PickGrid`) ⚑ (Q238): **📌 Reminders** (§8.5b ⚑ Q311), **⏰ Alarms**,
**⏱ Rolling timers**, **🧺 Washing machines**, **🍳 Cooking machines**, **💪 Task buddy** (§7G, §8.5a ⚑ Q306). Asked by MojoSOGO 2026-10-11 ("alarms needs its own modal";
then "have two machines buttons; washing machines; cooking machines and move cooking to that new button"). A tap opens
that section in a modal titled with its emoji and name; ✕, Escape or a tap outside closes it back to the tab. An
alarm or timer form opens on top of its section and closing it returns there. Nothing in a section changed what it
does; only where it sits. Alarms and Rolling timers are single-line lists (per the table rules), each with a
**＋ Add** button at its top; Washing machines is one fixed card per machine and has no ＋ Add; Cooking machines has
**＋ Cooking timer**. Chores moved to their own
tab in v1.28.0 (§8.15).

```
Alarms
[ 📢 Announce ]
🤫 Quiet the house  [1 hour] [2 hours] [4 hours] [Rest of today]
[ 📌 Reminders        ] [ ⏰ Alarms          ]
[ ⏱ Rolling timers   ] [ 🧺 Washing machines ]
[ 🍳 Cooking machines ] [ 💪 Task buddy      ]
```

**Acceptance (AM1–AM3, manual on the iPhone at 320 px):** AM1 the tab shows Announce, Quiet the house and the
four buttons; AM2 each button opens its section titled with its name, and closing returns to the tab; AM3 ＋ Add
or a row opens its form over the section, and Save or Cancel returns to the section with the list up to date.

**⏰ Alarms** (scheduled) — one row per alarm (an alarm with days; reminders, §8.5b, are not listed here), sorted by time of day, then title:

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
opens the timer form (title, interval 1–1440 min, **Active from / to**, ☐ **📢 Announce the start of
each day**, channels, repeat alert every, assigned to, Delete).

- **📢 Announce the start of each day** (§5.5a): a checkbox under the Active from / to line, shown only while
  both times are filled; with either time empty it is saved off. Off for a new timer.

- The row shows `· 08:00–21:00` after the interval only when the timer has an active time
  range (§4.2n).
- **Next** is the open fire's `due_at` from the server, in household local time; it names the
  day when that is not today ("Sun 09:00"), and shows just the time when it is. The app never
  re-derives a due time.
- **Active from / to** ⚑ Q50: two plain `<input type="time">` fields side by side on one
  line (16 px, fits 320 px), labelled "Active from" and "to". Both empty = always (no window).
  Filling only one, `from = to`, or an interval not shorter than the range is refused by the
  server; the message shows inside the form.

**🧺 Washing machines** — the fixed machines (§7D): clothes washer, clothes dryer, dish washer. One card
per machine, in `MACHINE` order. Each card: the machine (🫧 Clothes washer, 🌀 Clothes dryer,
🍽️ Dish washer ⚑), a state badge (**free** neutral ·
**running** green · **DONE — waiting** amber), whose load and the done-at time, and its
actions on a second line. At 320 px:

```
🧺 Washing machines                           (modal title)
Start a machine. When it's done, every phone hears; the speakers too when someone is picked.
🔔 Alerts sound weekdays 5:30pm–8:30pm, weekends 9:00am–9:00pm; outside those hours they wait. [Edit hours]
┌──────────────────────────────────────┐
│ 🫧 Clothes washer  DONE — waiting     │
│ Kai·14:05 · alerts Kai                │
│ [Move to clothes dryer] [Still loaded]│
│ [Clear]                               │
├──────────────────────────────────────┤
│ 🌀 Clothes dryer   running            │
│ Sam·~14:50                   [Clear] │
├──────────────────────────────────────┤
│ 🍽️ Dish washer     running            │
│ started by Ana·~15:30 · phones only   │
│                       [Done now][Clear]│
└──────────────────────────────────────┘
```

| State | Clothes washer actions | Clothes dryer actions | Dish washer actions |
|---|---|---|---|
| free | **[Start]** [Done now] | **[Start]** [Done now] | **[Start]** [Done now] |
| running | [Done now] [Clear] | [Done now] [Clear] | [Done now] [Clear] |
| done | **[Move to clothes dryer]** [Still loaded] [🪙 Bounty] [Clear] | **[Unload Clothes Dryer]** [Still loaded] [🪙 Bounty] [Clear] | **[Emptied]** [Still loaded] [🪙 Bounty] [Clear] |

- **Alert hours** (§7D.5): one line under the intro. The Edit hours box says "Machine alerts outside these hours
  wait until they open." **Edit hours** (admins only) opens
  "Machine alert hours": Weekdays and Weekends, each two `<input type="time">` fields (16 px);
  both empty = any time. Save refuses from ≥ to inside the box.
- **Done now** (⚑ Q160) is for a load the app missed. On a free machine it opens the chooser
  titled "The clothes washer is done": *Whose load?* with **Owner unknown** preselected (never assumed;
  a member chip names one), *🔔 Alert when done* (below), then **[It's done]**. On a
  running machine it is one tap. Either way the done alerts start at once.
- **Still loaded** (⚑ Q159) restarts the reminders (§7D.2) with one tap, no confirm; the action
  line wraps at 320 px.
- **🪙 Bounty** (§7D.9, admins only ⚑ Q263) on a done card opens the ＋ Bounty sheet (§8.15b) with the title
  prefilled by `loadBountyTitle`; everything else is the sheet as usual (points 1, note, picture, Post / Cancel).
  Cancel asks to discard only when something was changed from the prefilled sheet.

- **The chooser** (a modal, exported from `Machines.tsx` and reused by the Ringing bar): for
  **Start**, titled "Start the washer" — *Whose load?* one member chip per active member, **me**
  preselected; *🔔 Alert when done (optional)* — **Nobody · phones only** then one chip per active member, preselected to
  the *Whose load?* pick and following it until this row is tapped (§7D.7); *How long?* the machine's minute chips (§7D.2), e.g. **30 · 60 · 90 · 120 min** for the clothes washer. Tapping a minute chip
  starts the machine at once and closes the box: **two taps** from the card (Start → 60). For
  **Move to dryer**, titled "Move Sam's load to the dryer" — only the minute chips.
- Chips are at least 44 px tall; text is 16 px; nothing scrolls sideways at 320 px.
- A refusal (§7D.2) renders inside the chooser, or above the cards for Clear / Unload Clothes Dryer,
  with `role="alert"`. Clear asks once ("Clear the washer? Nothing will ring.").
- Done-at is household local time; the cards re-read `/machines` on every app refresh.

**🍳 Cooking machines** (§7D.8, MojoSOGO 2026-10-11): its own button and modal, apart from 🧺 Washing machines
(which keeps the cards above, the intro and the alert-hours lines) ⚑ Q243:
- a **＋ Cooking timer** button opens the create box: *What?* one chip per `COOK_KIND` (Air fryer preselected), an
  optional *Name* field ("Oven 2", 16 px), *🔔 Alert when done (optional)* as in the chooser (me preselected),
  *How long?* chips **1 · 3 · 5 · 10 · 15 · 20 · 30 · 45 · 60** and, right after 60 on the same row, a small
  **custom** box (light gray "custom" placeholder, MojoSOGO 2026-10-11) for any whole number of minutes; a chip picks
  its value and empties the box, typing in the box unpicks the chips; then **[Start]**.
- one card per open timer, oldest first: emoji + label, a **red ✕** at its top right, the badge (running green /
  **DONE** amber / off neutral), `~14:05` (or `done 14:05`, or `12 min` when off) and `· alerts Sam` / `· phones only`.
  Actions: running **[Edit] [Stop]**; done **[Off]** **[Edit]**; off **[Start again]** **[Edit]**. Edit opens the
  same box titled "Edit Oven 2" with **[Save]**. ✕ on a running timer asks once ("Close Oven 2? It won't ring.");
  otherwise it closes at once. With no timers the group shows "Nothing cooking."
- The cards re-read `/cooking` on every app refresh, like the machines.

**The chore list** — on the 🧹 Chores tab since v1.28.0 (§8.15), under "All chores", with its own
**＋ Add**. One line per chore, sorted by time:

```
Time      Chore            Days        This week
07:30 at  🧺 Laundry ³     Mon Thu     Sam
19:00 by  🗑 Trash          Tue         Kai → Sam
```

- A sunset chore shows `sunset −30` (or `sunset`) in place of the clock time (`whenText` in `ChoresToday.tsx`, §7B.3), on All chores
  and on Today.
- `at`/`by` after the time; a superscript step count when there is more than one step; a **📋** button after
  the title when the chore has a Done means or its room has areas (§7B.6), opening its **What done looks like**
  sheet (§8.15).
- **This week** = whose turn it is now; when people take turns, `→` the next person.
- Tapping a row opens the **chore form** (modal; read-only for anyone who can't change it), not its room
  (v1.68.1, MojoSOGO 2026-10-12: "clicking into a chore should open the chore details not the definition of the
  room"). The sheet's **✎ Edit chore** opens the same form:
  - Title · **Done means…** (one line, e.g. "Bins at the curb, lids shut") · **Room** (No room, then the rooms, §7B.6)
  - Days (chips Sun…Sat, plus "Every day" / "Weekdays")
  - **When:** ( ) **At** a time — it rings · ( ) **By** a time — quiet; ☐ nudge then
  - Time: ( ) **Clock** [time] · ( ) **Before sunset** [30] min (§7B.3; 0 = at sunset)
  - **People:** member chips; the order you tap is the turn order. With two or more:
    "Takes turns, changing every Sunday."
  - **Steps:** one row per step — title · "then ring the next step after ___ min"
    (optional) · who (whose turn / a member chip). **＋ Add step** (max 6). A new chore
    starts with one step named after the title.
  - Channels (☐ Phone ☐ House) · Repeat alert every (Off / 5 / 10 / 15 / 30 min) ·
    Save / Cancel / Delete (creator or owner, like alarms). Delete asks "Delete chore "{title}" and what
    done looks like for it?" (§7B.6).

### 8.5b 📌 Reminders — one-off, until Done (Alerts → 📌 Reminders) — asked by MojoSOGO 2026-10-19

"We need simple reminders in alerts section. Basically something needs to get done and send reminders… like today
after work I need to get bird food." Event reminders (§8.4, Every hour) and every day lists (§7A.4) could do it, but
both hide inside something else. A reminder is the plain one-off.

- **What it is:** a scheduled alarm (§4.2a) with no repeat, so it rings through the reminder pipeline unchanged:
  push `"Reminder: Get bird food"`, the Ringing bar's **Done** / **Snooze**, repeats, phone first (§9.2d), Away (§9.2c),
  Quiet (§9.2b), My alerts (§9.5). `max_alerts` = `REMINDER_MAX_ALERTS` (12 ⚑ Q312); after the last alert it stays in the
  Ringing bar silently until Done (§5.3). Nothing new in the engine or the tick.
- **Done** (any member, §5.4) closes the fire; the reminder leaves the list and never rings again.
- **The list** (soonest first): `Today 5:30pm · Get bird food · Shelly`; the day is **Today**, **Tomorrow**, or the short
  weekday and date ("Thu Oct 22"); a red **ringing** badge while it rings; a dim **missed** when its time passed with no
  alert (an outage longer than §5.2 `MISSED_AFTER_MIN`). The names are the people it reminds, none = Everyone. A done
  reminder is not listed. **＋ Add** at the top; tapping a row opens its form.
- **The form** ("New reminder" / "Edit reminder"):
  - **What?** — one line, required, up to `ALERT_TITLE_MAX` ("Get bird food").
  - **When** — quick chips **In 1 hour** · **After work** / **After school** (that person's own time, below) · **Tonight** (8pm) · **Tomorrow morning** (8am) ⚑ Q311,
    then a **Date** and a **Time** box showing the pick, both editable. A chip picks its next time: today while it is
    still ahead, else tomorrow (Tomorrow morning: always tomorrow; In 1 hour: now + 60 min, up to the next 5 minutes). A new form starts on After work.
  - **Remind** — member chips, **me** preselected ⚑ Q313; none ticked = everyone.
- **After work / After school is each person's own** (v1.84.0, MojoSOGO 2026-10-19: "After work for John is 3:30 and
  should be specific to the account and kids as after school"). Each member has a kind and a time, set in Settings →
  🙂 Me → **After work / After school**: two choices (**Work** / **School**) and a time box; a change saves at once. Not
  set: an admin is **After work at 5:30pm**, a plain member (the kids) **After school at 3:00pm** ⚑ Q315. The founder
  starts at After work 3:30pm (migration 0054). The chip shows and uses the time of the **one person ticked** under
  Remind; with none or several ticked, mine ⚑ Q316. `afterOf` (`shared/reminders.ts`) is the one rule; `GET /members`
  carries each member's resolved `after: { kind, time }`.
  **RM7:** `afterOf` → admin unset 17:30 work, member unset 15:00 school, stored values win; `whenChoice('work', …,
  '15:30')` at 14:00 → today 15:30, at 16:00 → tomorrow 15:30. **RM8:** PATCH /me `{ afterKind: 'school', afterTime:
  '15:00' }` → GET /members shows it; a bad time or kind → 400; `null` clears back to the default.
  - The channel ticks (`ChannelChecks`, defaults as an alarm's).
  - **Repeat until Done** — Every 15 min / **Every 30 min** / Every hour ⚑ Q312. A POST with no `renotifyMin` repeats every 30 min too.
  - Save / Cancel; on an existing one **Delete** (asks once). Creator or admin may change it (§6.3), like alarms.
- The server refuses a time that is not after now: 400 "Pick a time later than now." ⚑ Q314. An edit re-plans like an
  alarm edit (§5.6); editing a missed one to a later time makes it due again.
- **Code:** the `/reminders` route and the form/list follow the placement receipt (`docs/placement-receipts.md`); the
  chip times are `whenChoice` (§0.3 pure).

**Acceptance (RM1–RM6 tests, RM-M manual):**

| # | Check | Expected |
|---|---|---|
| RM1 | POST /reminders `{ title, date, time, channels, renotifyMin, assignedTo }` then GET /reminders and GET /alarms | 201; listed with `state: 'due'`, `dueAt` = that local time in UTC; GET /alarms leaves it out |
| RM2 | ticks at the due time, +30 min | alert 1 `"Reminder: Get bird food"` to the reminded member only; alert 2 at +30 |
| RM3 | Done on its fire, then a tick a day later | GET /reminders leaves it out; no new fire |
| RM4 | POST a past time; a blank title; PATCH by another non-admin member | 400; 400; 403 |
| RM5 | PATCH a missed reminder to a later time; DELETE | `state: 'due'` at the new time; gone from the list, its scheduled fire closed `removed` |
| RM6 | `whenChoice` at 14:00 / 19:00 / 21:00 local | After work → today 17:30 / tomorrow 17:30; Tonight → today 20:00 / today 20:00 / tomorrow 20:00; In 1 hour 14:02 → 15:05; Tomorrow morning → tomorrow 08:00 |
| RM-M | on the iPhone at 320 px | Alerts → 📌 Reminders → ＋ Add, After work, Save; the push comes at 5:30pm and again every 30 min; Done in the Ringing bar clears it from the list |

### 8.5c 🎲 Random times in a window — on chosen days, until Done — asked by MojoSOGO 2026-10-19

"Send me random reminders on weekdays between 8 AM and 11 AM to make an appointment to get my car checked." A
reminder (§8.5b) can ring at random times inside a window on chosen days instead of once at a set time.

- **The form:** under When, a tick **🎲 Random times on chosen days**. Ticked, the chips and the Date / Time boxes give
  way to **Days** (Su–Sa chips, with quick **Weekdays** and **Every day**), **From** and **To**. A new window starts on
  Weekdays, 8:00am–11:00am ⚑ Q328. Repeat until Done is hidden: each day rings once ⚑ Q327.
- **How it rings:** on each chosen day from today on, once, at a time picked inside [From, To) by
  `randomTimeIn(eventId|date)` (§8.4, the same pick as an event reminder's Random time), so a different time each day.
  An unanswered ring stays silently in the Ringing bar and the next day's ring replaces it (§5.6 `superseded`). A day
  that passes with no ring (an outage) is simply skipped: a window reminder is never **missed**.
- **Done** (or Ack) on any day's ring ends it ⚑ Q329: the server sets its repeat's `until` to that day and closes its
  later scheduled fires `removed`, so no day rings again, and it leaves the list. Snooze works as on any reminder.
- **The list row:** `🎲 Weekdays 8:00am–11:00am · Book car check · John`; days read as **Every day**, **Weekdays**,
  **Weekends**, else the short day names ("Mon Wed Fri"). The time of the next ring is not shown.
- **Stored as** an alarm event (§4.2a) with `recurrence` WEEKLY on the days, `start_date` = today, `start_time` =
  From, `remind_offset_min` 0, `remind_random_from` / `remind_random_to` = the window, `renotify_min` NULL,
  `max_alerts` 1. No migration. `GET /alarms` leaves out any row with a Random window; `GET /reminders` lists it.
- **Server checks:** at least one day; From and To both HH:MM, From before To (`randomWindowError`).
- **Editing** (PATCH) takes either shape, so a reminder can switch between a set time and a window ⚑ Q330; it re-plans
  like any reminder edit (§8.5b).

**Acceptance (RW1–RW4 tests, RW-M manual):**

| # | Check | Expected |
|---|---|---|
| RW1 | POST /reminders `{ title, window: { days: [MO..FR], from: '08:00', to: '11:00' }, channels }` then GET /reminders and GET /alarms | 201; listed with its `window`, `state: 'due'`, `dueAt` inside 08:00–11:00 local on the next weekday still ahead; GET /alarms leaves it out |
| RW2 | ticks across a Monday and a Tuesday | one alert each day, at a time inside the window, the two times from `randomTimeIn`; Tuesday's ring supersedes Monday's unanswered one |
| RW3 | Done on Monday's ring, then ticks through Wednesday | GET /reminders leaves it out; the event's `until` = Monday; no new fire, Tuesday's planned fire closed `removed` |
| RW4 | POST a window with no days; From after To | 400; 400 |
| RW-M | on the iPhone at 320 px | Alerts → 📌 Reminders → ＋ Add, tick 🎲, Weekdays 8–11, Save; a push comes once between 8 and 11 on the next weekday; Done clears it |

### 8.5a 💪 Task buddy (Alerts → 💪 Task buddy, §7G)

The modal shows **my** session only; nobody else's sessions are shown anywhere.

- **No open session:** a big box "What are you starting?" (placeholder "Clean the garage for an hour, check on me
  every 15 minutes"), **Read it** fills the fields below from it (§7G.2); then What · How long · Check on me every ·
  What does done look like? · the channel ticks · 🤫 Private · **Start**. Under it, **Recent** (§7G.6).
- **An open session:** a card: the title, its state (Working / On a break until 3:40pm / Paused / Waiting for you
  when a check-in has gone unanswered past its nudge), "Every 15 min", working time, and for a timed task "18 min
  to go" (or "Time's up"). When its check-in is ringing, the answers (§7G.3) sit on the card too. Then **Check in
  now** (the five answers, at any time: it answers the open check-in), **Pause** / **Resume**, **Finish**, **Stop**,
  **+15 min** (timed), and the **Tell Enso** box (§7G.5) with **Say**.
- **Enso's reply** (§7G.4) shows in a small "💪 Enso" modal over whatever screen the answer came from (the Ringing
  bar, an alert card, the session card), with the offer buttons of §7G.3 and **OK**.
- **Ringing bar** (§8.2): a task check-in row is `💪 Clean the garage · check-in` with the five answer buttons
  (time up: Finished! · +15 · +30 · Stop) and Away; no Ack. An alert card (§9.5) for it shows the same.
- **Finish** opens the done check (§7G.6) in a modal; the summary shows after Finish or Stop.
- **Running mark** (v1.82.0 ⚑ Q309): while my session is open, the 💪 Task buddy button on the Alerts menu shows its
  state under the name, from `/status` `myTask.state` as the server decided it: **🟢 Working** / **☕ On a break** /
  **⏸ Paused**; and the tab bar carries the 💪 of §8.1. A Private task still shows them: `/status` is mine alone.

### 8.6 Settings

Asked by MojoSOGO 2026-10-11 ("clean up settings similar to lists"): the **⚙ Settings** tab is a **menu of
buttons**, the same grid as the Lists popup (§8.8, `PickGrid`), instead of one long page. A tap opens that
area in a titled modal; ✕, Escape or a tap outside closes it back to the menu ⚑ (Q226). No setting changed
what it does; only where it sits.

```
Settings
[ 🙂 Me            ] [ 📅 Calendar       ]
[ 📱 Phone alerts  ] [ 🔊 Speakers       ]
[ 🔔 Alerts        ] [ 🏠 Household      ]   ← Household and Members: admins only
[ 👥 Members       ] [ 📊 Status         ]
[ ℹ️ About         ] [ 💡 Requests       ]   ← Requests: admins only (§8.18)
[ Log out ]
```

- **🙂 Me:** name, color, **Clock: 12-hour / 24-hour** (§8.17), **After work / After school** (§8.5b), and (founder only) **🎯 Point at it** on this device (§8.16).
- **📅 Calendar** (named "Calendar items" before v1.67.0): **Optional calendar items** — Public holidays, 📈 options
  expiration, 🌤️ Weather, 🌕 Moon phases, 🏫 School days off, then one line per optional event (emoji, title, how it repeats), each with an **On** switch (§7.5); then,
  for admins only, **Days off** (§7.3) ⚑ Q267 (asked by MojoSOGO 2026-10-12: move Days off "into its own calendar section");
  then **📍 Saved places** for everyone (§7.9b).
- **📱 Phone alerts:** this phone's state and Turn on / Turn off / Send a test (§9.1).
- **🔊 Speakers:** **Speak my alerts on** (§9.2a).
- **💡 Requests (admins):** the feature requests the Ensō button saved (§8.18).
- **🔔 Alerts** (§9.5): every push this phone's member got, newest first — tap a line for its card, a red ❌ on each
  line hides it, **Clear all** at the top. A tapped phone notification opens Settings with this area open, on its
  card.
- **🏠 Household (admins):** name, timezone; then **Rooms** (§7B.6): one line per room (name · n areas), a
  name box with **＋ Add room**. A tap opens the room's sheet: **✎ Rename room**, its areas exactly as the chore's
  sheet shows them (§8.15, with ✎ / ＋ Add an area), **Delete room** (asks first; its chores stay, with no room).
- **👥 Members (admins):** a grid, one row of pills per member, in five columns (MojoSOGO 2026-10-12): **name**
  (colour dot) · **role** (**Owner** / **Admin** / **Member** ⚑ Q264; **Disabled** in red instead while disabled
  ⚑ Q265) · **joined {date}** (when the member was created, e.g. "joined Oct 4"; GET /members sends it to every
  member, as it is not sensitive; MojoSOGO 2026-10-12 "I should see when active accounts joined") · **Make admin** / **Remove admin** (asks first; never on the founder or a disabled member) ·
  **Disable** / **Enable** (never on the founder). The last two are tappable pills. On a phone too narrow for a row,
  the grid scrolls sideways. An admin removing their own admin role is warned that they will lose these settings at
  once. Then **invites (§8.9)**.
- **📊 Status:** a **House announcements** line from `house` (§9.2) ⚑ (Q38): `ok` → "working"
  (good) with the last success time; `failing` → "failing since {lastFailedAt}" (bad) with
  `lastError` beneath; `not_configured` → "not set up" (bad); `untried` → "not tried yet"
  (neutral). Then the last 20 deliveries with their status badge.
- **ℹ️ About** (asked by MojoSOGO 2026-10-11, last in the grid, for everyone ⚑ Q247): the opening screen's look
  (§8.10) inside the modal: the ensō logo, **Ensō**, the tagline on two lines ("Closing the loop." over "Peace of mind, every day.", MojoSOGO
  2026-10-12), and the build stamp as the revision; then
  **"Developed by MojoSOGO · with Claude"** ⚑ (Q248). Nothing to change, nothing fetched.
- **Log out** sits under the grid, not inside an area ⚑ (Q227). No menu button is marked chosen.

**Acceptance (SM1–SM4):** SM1 the tab shows the grid, with Household and Members only for an admin; SM2 each
button opens its area titled with its name, and closing returns to the grid; SM3 a tapped alert notification opens
Settings → 🔔 Alerts on its card, and closing the card leaves the Alerts list open; SM5 ℹ️ About shows the logo,
Ensō, the same tagline as the opening screen (a test holds `frontend/index.html` to it) and the same build stamp as
under the tabs; SM4 every setting listed above is
reachable and behaves as before (manual, on the iPhone at 320 px: the grid is two columns, one under 360 px).

### 8.8 Lists screen

The **🛒 Lists** tab. At the top, a **list button** showing the chosen list with its emoji and count,
and **⋯** beside it. Asked by MojoSOGO 2026-10-05: there are too many lists for the phone's wheel, so the
picker is a **popup of buttons** (a titled "Lists" modal):

```
[ 🛒 Shopping (3)           ▾ ] [⋯]

┌ Lists ─────────────────────── ✕ ┐
│ [✅ Things to do (4)] [🎬 Movies & shows (6)]│
│ [📥 Inbox (2)]     [🍳 Recipes (12)] │
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
  🧹 Chores tab in v1.28.0, §8.15; a device that remembered Today shows Shopping), **📥 Inbox** third (§8.8a),
  **🍳 Recipes** fourth (§8.12, Q393; its count is how many recipes the household has),
  then every list by name with `listEmoji` (§7A.1), then **＋ New list…**. The chosen list's button is marked
  (`aria-pressed`, accent border), so the remembered list is the default: closing the popup (✕, Escape, a tap
  outside) stays on it. Tapping a button opens that list and closes the popup.
- **＋ New list…** opens the **new list** form (Name, Emoji — optional, placeholder shows the default for the
  name typed — Create; errors inside the dialog); after creating, that list opens.
- **⋯** (accessible name "List options") next to the list button opens **Rename**, **Emoji** (empty = the
  default from the name), **☐ Every day** and **☐ Ping owners** (§7A.4; Ping owners is greyed while Every day
  is off) and **Delete list** for the chosen list, shown only to those allowed (§7A.1) and never
  for Things to do, Movies & shows, 📥 Inbox or 🍳 Recipes. Delete asks first and says how many open items go with it.
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
  note (multi-line, with ⤢ for the notes sheet, §8.4a), **Assigned to** (member chips, single choice, plus **Nobody**), Save /
  Cancel / **Delete** (asks first). The old ✕ quick-remove is gone: ticking is the quick
  action, and deleting lives in the form. ⚑
- The item form shows the item's **photo** (§7A.3) when it has one — tap for full size — with
  **Replace photo** / **Remove photo**, or **📷 Add photo** when it has none ⚑ Q121. A photo added here is
  not read ⚑ Q122. The photo saves on **Save**, after the item's fields: a new one is PUT, a removed one
  DELETEd. A photo-only change counts as a change. The image URL carries `?v={updatedAt}` so a replaced
  photo is never shown stale from the private cache.
- The item form has no Mark done / Not done: ticking is the row's tap, everywhere.
- **An every day list** (§7A.4) ⚑ Q290: the item form adds a **Time** box (the phone's time picker, empty = none)
  under Text, and each open row shows its time (`clockText`, §8.17) before the text; rows go by time. The
  ticks clear themselves at midnight, so each morning every box is empty again. With **Ping owners** on, a row
  with a time shows 🔔 after it.
- **Done** is collapsed by default and dim, newest first. Tapping a done row puts it back
  on the list; its ✎ still opens the form. A done row shows who ticked it and when (in
  place of the assignee chip, so it stays one line):
  weekday within the last 6 days (“Sat · Shelly”), else the date (“Sep 12 · Shelly”).
- No due dates and no reminders on any list.

### 8.8a 📥 Inbox (Lists → 📥 Inbox, §7H)

- In the Lists popup, **📥 Inbox (n)** comes third, after 🎬 Movies & shows ⚑ Q326; `n` = my items.
- Newest first, one card each: when it came (weekday and time, or the date), then the **🔗 link** (its host and path,
  tapping opens it in a new tab), the **text** (line breaks kept), and the **photo** (a thumbnail; tap for full size).
- Each card: **📋 Copy** (the url, else the text; a photo has none) and **✓ Clear** (`DELETE /inbox/{id}`, no ask:
  clearing is how an item is marked handled ⚑ Q324). An empty Inbox says "Nothing here yet. Share a link, text or
  photo from your iPhone with Send to Enso."
- At the bottom, **📲 Set up Send to Enso** (a folded section, open when I have no key) — `InboxSetup`:
  "Your key is on (made {date})" or "No key yet", **Make my key** / **Make a new key** (asks first when one exists:
  "The Shortcut with the old key will stop working"), **Turn off**. A key just made shows once in a read-only box with
  📋 Copy and "Copy it now: it is not shown again." Then the §7H.4 steps, numbered, with this server's address in
  them, each with 📋 Copy for the address and `Bearer {key}`.

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
 Closing the loop. Peace of mind, every day.
   https://enso.sogodojo.com
      v0.2.0 · a99e5db
```
- Centred on `--bg`: the ensō, **Ensō** in a large, light-weight serif-free type, under it
  the tagline **"Closing the loop. Peace of mind, every day."** (MojoSOGO's exact words,
  2026-10-11) in small light text on two lines, one sentence each (as in ℹ About),
  then the **full address the app is served from** (`location.origin`, so the home-network server
  shows its own) in small dim text, and last, at the bottom of it all the **build stamp** — `v{version} ·
  {commit}` (decided by MojoSOGO 2026-10-03): the app version from `package.json` and the
  short git commit the page was built from, written into the page **at build time** (never
  typed by hand). A build from a tree with uncommitted changes shows `{commit}-dirty`; a
  build with no git at all shows `unknown build` — never a plausible-looking guess.
  **App version policy** (decided by MojoSOGO 2026-10-03): `1.0.0` at go-live; each merged
  feature bumps the minor (`1.1.0`, `1.2.0`, …), each fix-only merge bumps the patch. The
  version lives only in `package.json` (the stamp reads it); the spec's own version line is
  separate and counts spec revisions.
  Nothing else — no spinner.
- **No mic ask here** ⚑ Q360 (MojoSOGO 2026-10-20 "Ask for mic access here and not startup"): the opening screen never
  asks for the microphone, and no header badge does; the phone asks on the first tap of the Ensō mark in the Ensō popup
  (§8.18 part 2). There is one opening screen: the launch image is the same screen (below).
- One source: the screen is plain HTML in `index.html`, outside the React root, so it
  appears before any script loads; the app removes it when ready (signed in or not).
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
  - Title · From / To dates (both optional) · Place · Address · Phone · Cost · Link · Note. Under Address, the
    **📍 Saved places** picker (§7.9b) fills Place, Address and Note from a saved place.
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

### 8.12 Recipes (Lists → 🍳 Recipes, §7E)

Recipes live inside the 🛒 Lists tab, as its fourth fixed view (§8.8, MojoSOGO 2026-10-27 "move recipes into lists",
Q393). Only the screen moved: the recipes, their emojis, pictures and
links are the same rows, read by the same `/recipes` API. Picking 🍳 Recipes in the Lists popup shows the screen
below under the list button; there is no ⋯ for it.

**Check:** tap 🛒 Lists → the popup shows **🍳 Recipes (n)** after 📥 Inbox → tap it → every recipe from before is
there with its picture and my emoji; paste a link → Read it → the recipe opens. The tab bar has six tabs, no 🍳.

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

**In Settings → 👥 Members → Invites:**

```
Invite someone   [ Their name…        ][ Invite ]

Kai        waiting · until Sat Oct 10        [Revoke]
Shelly     joined Oct 4
Sam        expired
```

- One line per invite, newest first: name · state — **waiting** (with its expiry,
  amber), **joined** (with the date, green), **expired**, **revoked** (neutral). A revoked invite drops off the
  list 24 hours after it was revoked (MojoSOGO 2026-10-12). When the
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
  ⏰ Alerts — alarms and timers
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
Alarms → Chores and Lists → Today ⚑ Q166: **Today** (ticking off is the daily use), **Messes** (§8.15a) and **All
chores** (the chore list of §8.5, with ＋ Add), and from Today or All chores, a chore's **What done looks like** sheet.

**A menu** (v1.55.0, asked by MojoSOGO 2026-10-11: "Chores needs a modal after pressed, which chore sub category are
we pushing into") ⚑ Q245: under the heading "Chores", the same grid as Settings and Alarms (§8.6, `PickGrid`) of
**✅ Today**, **🪙 Bounties**, **🧽 Messes**, **💵 IOUs**, **📋 All chores**, **🏅 Score**, Today first (Bounties and
Score since v1.57.0, §8.15b ⚑ Q255; IOUs since v1.94.0, §8.15c ⚑ Q354). A tap opens that section in a modal titled with its emoji
and name; ✕, Escape or a tap outside closes it back to the tab. A chore form, What done looks like sheet or Report a
mess sheet opens on top of its section and closing it returns there. Nothing inside a section changed; only where it
sits. The mess banner (§8.15a) stays on every screen.

Acceptance (CM1–CM3): CM1 the tab shows the six buttons and no list; CM2 each button opens its section in a modal
and ✕ returns to the grid; CM3 ticking a Today step, tapping a chore row, and 📸 Report a mess all work from inside
their modal.

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
Today row's 📋. Since v1.67.0 the areas are the chore's **room's** (§7B.6): under Done means comes "Room: Kitchen"
and then the room's areas; a chore with no room says "No room yet. Pick one in ✎ Edit chore." Areas edited here
change the room, so every chore in it shows the change ⚑ Q268:

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
  area — a part of the room, with photos of it done right and what to check."
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
- The room's creator or an admin may change what done looks like (Q163); everyone else sees it read-only, without ✎ or ＋ Add an area.

### 8.15a Whose mess? — the banner and the Messes section (§7B.7)

**The banner** — on every screen, under the Ringing bar (§8.2), one row per mess I am still asked about:

```
🧽 Sam cleaned up a mess (Kitchen): pans on the stove. Was it yours?  [photo]  [That was me] [Not me]
```

- The photo is a small thumbnail (tap for full size). The two buttons are ≥ 44 px, stacked at the right: **Not me**
  directly under **That was me** (v1.74.1, MojoSOGO 2026-10-12: "Put not me button under that was me button"); the
  same stack wherever they show (the Messes section, the alert card, §9.5). Answering removes the row.
- It is not red and makes no sound; it stays until I answer, even while the mess is on To talk about.

**The IOU banner** ⚑ Q385 — right under it, the same look, one row per IOU or payment waiting on me (§7B.9 Told to OK:
the person `okError` lets OK it, so an admin sees only their own), oldest first in each direction:

```
💵 Sam paid you $100.00.                                   [Got it] [Decline]
💵 Mom says you owe $300.00 · tickets.                         [OK] [Decline]
```

- The line is `waitingText`; the buttons are the 💵 IOUs card's own (§8.15c, Decline asks first). Answering removes the
  row; a refusal shows inside the banner. Declined rows stay on the card, not here.

**Messes** — a section of the 🧹 Chores tab, the 🧽 Messes button of its menu (§8.15):

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

### 8.15b Bounties and Score (§7B.8)

**🪙 Bounties** — the modal:

```
Waiting for OK                                   (everyone sees it)
  Clean the toilet · 3 · Kai · 10:42        [OK] [Not yet]  [Kai ▾]   (admins only: the buttons and who)
  Trash to the curb (chore) · 2 · Sam · Tue
Bounties                                         [＋ Bounty]  (admins only)
  Clean the toilet · 🪙 3 · Kai is on it                     [Done] [Let it go]   (mine)
  Empty the bathroom bin · 🪙 1                  [I'll do it] [Done]
Chore bounties                                   (admins only)
  Trash to the curb     [ 2 ▾ ]
  Can back in           [ None ▾ ]
```

- **Waiting for OK**: every pending earning, oldest first: title (a chore's marked "(chore)"), points, who, when, and
  the done photo as a thumbnail when there is one (tap for full size, as §8.8's item photo). On my own pending row,
  **📷 Add photo** (or **📷 Replace photo**): the phone offers camera or library, the photo is shrunk as a thing's
  photo (§7C.3) and sent at once; the thumbnail's address then carries a fresh `?v=` so a replaced photo shows at once
  despite the hour's cache ⚑ Q259. Admins also get **OK**, **Not yet** and a who select (active members, the earner
  first); OK sends the one picked. Empty → the section is left out.
- **Done** on a one-off opens a small sheet: **📷 Add photo** (optional), then **Done** / **Cancel**. Done sends the
  Done, then the photo to the new earning; if the photo fails, the Done stands and the refusal shows with 📷 Add photo
  still on the waiting row. An admin's sheet has no 📷 (their Done is OK'd at once, nothing waits for a photo): only
  the dim line "Your points count at once." and **Done** / **Cancel** ⚑ Q261 (v1.60.3).
- **Bounties**: each one-off, newest first: title, 🪙 points, the note as a dim second line, its picture as a
  thumbnail when there is one (tap for full size), and "{name} is on it" while taken ("You're on it" for mine). Buttons by what I may do (§7B.8): **I'll do it**, **Done**, **Let it go**.
  An admin also gets ✕ **Delete** (accessible name "Delete Clean the toilet"; asks first). None → "No bounties right
  now."
- **＋ Bounty** (admins) opens a sheet: **Title** (one line, `maxLength` 60), **Points** (a select 1–10, default 1),
  **Note** (one line, `maxLength` 120), **📷 Add photo** (optional; camera or library, shrunk as a thing's photo), then
  **Post** / **Cancel**. Post sends the bounty, then the picture; if the picture fails, the bounty stands and the
  refusal shows. An admin's card also has **📷 Add photo** / **Replace photo**.
- **Chore bounties** (admins): every chore with a select of None, 1–10; a change saves at once.
- A chore with a bounty shows **🪙 n** after its title on Today and in All chores (§8.15), for everyone.
- Buttons ≥ 44 px; nothing red.

**🏅 Score** — the modal: a table of every active member by name (no order by points, no ranks), columns **This week**
and **This month**, and a **House** row under it with the sums. Under the table, dim: "Points count once an admin
says OK." Pending points are not shown here.

Acceptance (BS1–BS4, manual on the iPhone at 320 px): BS1 an admin posts a bounty and a kid's phone gets the push;
BS2 the kid taps I'll do it, then Done with a photo from the camera, and the admin's phone gets the waiting push, sees
the photo full size and OKs it; BS3 Score shows the
kid's points this week and the House row; BS4 an admin taps Done on a one-off and sees no 📷, only "Your points
count at once." (Q261).

### 8.15c 💵 IOUs (§7B.9)

**💵 IOUs** — the modal (Chores menu, §8.15):

```
                                                   [＋ IOU]
Sam owes Mom  $1,350.00                                   ▸
  Waiting for OK
    $300.00 · tickets · added by Mom         [OK] [Decline]     (Sam's buttons)
    Paid $100.00 · by Sam               [Got it] [Decline]      (Mom's buttons)
  Declined
    $40.00 · pizza · declined by Sam Oct 21     [Ask again] [✕] (Mom's buttons)
  Plan: $100.00 every week from Fri Oct 23 · next Fri Oct 23 · behind $0.00      [End plan]
  Queue (oldest first)
    $1,200.00 · Shelly's phone · Oct 20 · $150.00 paid
    $300.00 · tickets · Oct 21
  Paid back
    $150.00 · Oct 22 · paid
  [Pay back] [Let it go] [Payback plan]
```

- One card per direction I may see (`GET /ious`), most owed first: "{who} owes {whom} {owed}" ("You owe Mom",
  "Sam owes you"). A tap opens it ▾. None → "Nobody owes anybody." A direction with only waiting rows shows $0.00 owed.
- **Waiting for OK**: each waiting IOU and payment. **OK** (an IOU, for the one who owes) / **Got it** (a payment, for
  the one owed) and **Decline** beside it (asks first), and ✕ for whoever may delete it (§7B.9 Records; asks first). A
  dim "Waiting for {name}" for the rest.
- **Declined** (only when there is one): each declined row newest first, "declined by {name} {date}", **Ask again** for
  the one who made it and ✕ for them or an admin (asks first; a refusal shows inside).
- **Plan**: amount, how often, start, next due, behind (only when more than $0), and **End plan** (asks first).
- **Queue**: each OK'd IOU oldest first: amount, note, date, and "$X paid" when part is paid ("paid ✓" when all is).
  An admin gets ✕ on each (asks first; a refusal shows inside).
- **Paid back**: the OK'd payments newest first: amount, date, "paid", "let go" or "off the tab" with its note, and ✕
  for an admin.
- Buttons for the two and admins: **Pay back** and **Payback plan**; **Let it go** for the one owed and admins.
- **＋ IOU** opens a sheet: **Who owes** and **Who is owed** (active members, me first in Who owes), **Amount** (text,
  `inputmode="decimal"`, "$" before it), **Note** (one line, `maxLength` 120), **☐ Split the bill: {payer} paid, {other}
  owes half**, and, only when {payer} owes {other} something, **☐ Take it off {payer}'s tab ({amount} owed to {other})**,
  then **Add** / **Cancel**. Under the
  buttons, dim: "Counts once {name} taps OK." when it will wait, else "Counts at once.".
- **Pay back** / **Let it go** open a sheet: **Amount** (filled with what is owed), then **Save** / **Cancel**, with the
  same dim line ("Counts once {name} taps Got it.").
- **Payback plan** opens a sheet: **Amount each time**, **Every** (Week · 2 weeks · Month), **Starting** (a date,
  today by default; for Month the 1st–28th), then **Start** / **Cancel**; "Replaces the plan now running." when there is one.
- A refusal shows inside its sheet or card. Amounts are typed as dollars; the page sends them as typed and the server
  parses them (`parseAmount`); every amount shown is `centsText`. Buttons ≥ 44 px; nothing red.

Acceptance (IOU1–IOU2, manual on the iPhone at 320 px): IOU1 an adult adds "I owe Mom $1,200" and Mom's card shows it
at once; Mom adds a $300 one, the adult's card shows OK, and after OK the queue shows both; IOU2 a weekly plan pings
the one who owes at 09:00 on its day, phone only, and a payment recorded by them shows Got it on the other's phone;
IOU3 Mom adds an IOU, Sam taps Decline, Mom's phone gets "💵 Declined" and her card shows it under Declined; Ask again
puts it back in Sam's Waiting for OK; IOU4 Sam taps Pay back $100, Mom's phone gets "💵 Got it?" (phone only, nothing
spoken) and every screen of hers shows "💵 Sam paid you $100.00." at the top; Got it there removes it and counts it.


### 8.16 🎯 Point at it — name what I tapped

Asked by MojoSOGO 2026-10-11: "click the screen and the control … its location/path in the display can be captured
so I don't have to over explain", without clashing with what a tap already does. Since v1.58.0 it works like the
Ozymandias dashboard's pick mode (MojoSOGO 2026-10-11: "look at ozymandias and do it like that"): a **pick mode** that
stays on, where every tap is captured, swallowed, and copied as a few lines he pastes into a Claude thread.

- **Founder only** since v1.63.2 (MojoSOGO 2026-10-12: "I am the only editor so that highlight edit select circle should
  only be visible to mojosogo"), by the same founder check as the 🎪 FunHouse tick (Q230): every other member sees no ◎,
  no switch, and Alt+P does nothing (Q234).
- **On by default** for the founder since v1.60.1, like Ozymandias's always-there ◎ (MojoSOGO 2026-10-11: "I don't see the faint circle"). His Settings → 🙂 Me has a switch **🎯 Point at it** (its label says how: tap ◎ bottom left, tap anything, tap ◎ again to stop) that turns it off or on **for this device only**
  (kept in the browser, not the account) ⚑ (Q234).
- **While the switch is on**, a small faint round **◎** button sits in the bottom left corner just above the tab bar on
  every tab, and a **◎** sits in every modal's header beside ✕ ⚑ (Q235). Like Ozymandias's (MojoSOGO 2026-10-11: "I like
  the way ozymandias has the bottom left circle activator"), every ◎ turns amber while pick mode is on. Nothing else
  changes; every other tap works as before.
- **Tapping ◎ turns pick mode on; it stays on** until a ◎ or the bar is tapped again, or **Esc** is pressed. On a
  keyboard **Alt+P** turns it on and off (only while the switch is on) ⚑ (Q236). While on:
  - a bar across the top (inside the topmost open modal when one is open, so it is never hidden behind it) says
    **"◎ Pick mode: tap anything to copy where it is · tap here or ◎ to stop"**;
  - with a mouse, the thing under the pointer gets an outline and the pointer is a crosshair;
  - **every tap is captured, not acted on:** whatever is under the finger does nothing (no button press, no tick, no
    field focus, no keyboard, no select opening, no link).
- **Each pick goes straight to the clipboard**, written inside the tap's own touch or click handling, the only moment a
  phone allows it. A small box near the bottom shows the text under **"✓ Copied. Paste it into Claude."** for 4
  seconds; when the browser refused the copy it says **"Copy blocked: press and hold to select this text."** and stays
  15 seconds. Tapping the box does not pick it.
- **The text**, one piece per line, modeled on Ozymandias's `PDASH pick` ⚑ (Q237):
  1. `Enso pick: ` and the open tab, as on the tab bar (`⚙ Settings`);
  2. `Where: ` and, joined by ` > `, the title of each open modal bottom to top up to the one holding the tap, then
     each named group around the tap from the outside in (an `aria-label`, a fieldset's legend, the first words (up to
     30 characters) of the list row holding it); the line is left out when there are none;
  3. `Element: ` and the thing's kind (`button`, `checkbox`, `field`, `select`, `link`, `picture`, `text`) and its name
     in quotes (its `aria-label`, else its label's text, its own text, title, placeholder or picture text; up to 40
     characters), or the kind alone when it has no name;
  4. `Selector: ` and a CSS selector for the thing: from it outward, stopping at the nearest `id`; each step is the tag,
     its first two classes, and `:nth-of-type(n)` when a sibling has the same tag; steps joined by ` > `;
  5. `Screen: ` and the window size `390x844`, with ` (phone)` when under 700 wide;
  6. the build stamp (§8.1).

  Example:
  ```
  Enso pick: ⚙ Settings
  Where: 🔔 Alerts > Morning pills
  Element: checkbox "FunHouse"
  Selector: dialog > div._body_x1 > label:nth-of-type(2) > input
  Screen: 430x932 (phone)
  v1.58.0 · 1a2b3c4
  ```
- It names what is already on screen; it reads no data from the server and is stored nowhere.

**Acceptance (PA1–PA4):** PA1 the text is built as above from its pieces (tab, modals, groups, thing, kind, selector,
size, stamp), names are cut to their lengths, empty pieces are left out, and the selector stops at an id and adds
`:nth-of-type` only where a sibling shares the tag; PA2 switch off, or signed in as anyone but the founder, no ◎ shows anywhere, Alt+P does nothing, and a non-founder's
🙂 Me has no switch;
PA3 (manual, on the iPhone) on, tapping a tick box, a button, a text field and a select does none of their actions and
each lands on the clipboard (paste into a Claude thread); tapping the bar or ◎ stops it and taps work normally after;
PA4 (manual) a pick inside an open modal names the modal and the bar shows above it.

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

### 8.17 Clock: 12-hour or 24-hour — asked by MojoSOGO 2026-10-12

"Settings me give option to show time as 24hr or 12 hr applies every where." Each member picks, for themselves, in
Settings → 🙂 Me: **Clock** with two choices, **12-hour** (`6:30pm`) and **24-hour** (`18:30`); a tap saves at once
(`PATCH /me { clock24h }`). New members and everyone already here start on 12-hour ⚑ Q277 (before this, most screens
showed 24-hour, a few 12-hour; now they all agree).

Every clock time Enso **shows** goes through one pure formatter, `clockText(hhmm, clock24h)` in `src/shared/time.ts`:
12-hour is the hour without a leading zero, the minutes, then `am`/`pm` with no space ⚑ Q278 (`12:00am` midnight,
`12:00pm` noon); 24-hour is `HH:MM` as stored. That covers the calendar's wide-screen lines and the day sheet, the
Ringing bar, alarms (list and next ring), rolling timers, machines, cooking timers and machine hours, chores and
Today's chores, bounties, messes, My alerts, House quiet, Status, and the approve-a-phone card. Times are still
**stored and sent** as 24-hour `HH:MM` (§4.1).

Not covered, deliberately: the time **pickers** (`<input type="time">`) are the phone's own control and follow the
phone's setting ⚑ Q279; the sign-in screen's "Waiting… (until …)" has no member yet and follows the phone; a recipe's
"Time" is free text.

**Server text:** a push is built for the member it goes to, so the one time any alert text carries (a sun reminder's
"sunset at …", §7.7) follows that member's choice. The speakers and the FunHouse are shared, so they say it 12-hour
⚑ Q280.

**Acceptance (CK1–CK4):** CK1 `clockText` (unit): `18:42` → `6:42pm` / `18:42`; `00:05` → `12:05am` / `00:05`;
`12:00` → `12:00pm`; `09:30` → `9:30am` / `09:30`. CK2 `PATCH /me { clock24h: true }` saves and `GET /me` carries
`clock24h: true`; a non-boolean → 400 and nothing saved. CK3 a sun reminder's alert to two members, one on 24-hour:
their pushes read `sunset at 18:42` and `sunset at 6:42pm`; the house row reads `sunset at 6:42pm`. CK4 (manual, iPhone)
switch Me → Clock to 24-hour and see the alarms list, a machine's done time and My alerts change; switch back.

---

### 8.18 The Ensō button — just say it — asked by MojoSOGO 2026-10-19

Say what you want, in your own words, and Ensō does it, points you to where it already does it, or keeps it for John.
"I can just tell it what I want and the AI processes it … if there is a required feature that I don't have, the AI
should make a log to request the feature on the next build"; "for users like Michelle … we should just ask for what we
want without needing to know if the current build is capable"; "a big Ensō icon … respond back with a natural human
voice … also a text pop-up … yes clarify cancel" (the asks in full, and how this grew: `docs/history.md` §14). Photos and
links keep filling things in as they do (§7.8, §7C.4b, §7E, §7H).

**Reused, nothing reinvented:** the phone's own recorder (MediaRecorder) with Cloudflare's speech-to-text on Ensō's
own account (part 2), or the 🎤 on the iPhone keyboard, the phone's own voices (speechSynthesis; on the iPhone, Settings → Accessibility → Spoken Content →
Voices → an **Enhanced** or **Premium** voice sounds human), the Claude reading every other "fill it in" uses (§7.9),
and the reminder form (§8.5b, §8.5c). No paid voice for speaking ⚑ Q331; writing down a recording costs pennies
(⚑ Q378).

**1. The mark.** A round Ensō mark (the app icon, 84 px), centred just above the tab bar on every tab ⚑ Q332. A **tap**
opens the popup, not listening yet ⚑ Q360 (MojoSOGO 2026-10-20 "tap to open input… tap enso to speak and again to stop").

**2. Talking.** A line over a **text box** that is always there, and a smaller round Ensō mark at the right end of the
buttons under it (after Cancel; MojoSOGO 2026-10-20 "Move logo"). **Tap the mark** and the phone **records**: it
pulses green and the line says "🎤 Recording… tap Ensō to stop."; **tap it again** and it stops, the line says "Writing
it down…", and a second or two later the words go after what the box already holds ("Tap Ensō to talk, or type." the
rest of the time) ⚑ Q378 (MojoSOGO 2026-10-22 "Can we do a 'record' and process VTT?", "Only first does VTT. All others
fail": the iPhone's built-in listener heard only the first talk each opening). Every talk works the same, as many times
as wanted. The first tap is when the phone asks for the microphone (its own Allow / Don't Allow popup); nothing asks
before ⚑ Q360. A recording stops by itself at 60 seconds. The box can be fixed by hand or typed ⚑ Q333. **Done** sends
the box (enabled once it holds words), **🗑 Clear** empties it, **Cancel** closes (a recording in progress is dropped).
With no recorder, a refused microphone, or a clip that can't be written down, the line says "Tap the 🎤 on your keyboard
and talk." and the box still works ⚑ Q338; the next tap of the mark tries again. Tapping the mark to talk puts the
keyboard away first, so the keyboard's own 🎤 never holds the mic. The phone's voice is woken on Done, never while
recording, so the voice and the mic never fight. Admins also see **💡 Requests** here (part 5).

**Writing it down.** `POST /say/hear` takes the clip as it was recorded (audio/mp4 from the iPhone, audio/webm
elsewhere, at most 2 MB) and Cloudflare's speech-to-text (Workers AI Whisper, on Ensō's own Cloudflare account, about
$0.0005 a minute of talk) returns the words. Nothing is stored or logged: not the clip, not the words. It doesn't count
against the daily Claude reads (§7C.4), and there is no daily cap of its own ⚑ Q379 (a member must be signed in; 60
seconds and 2 MB bound each clip).

**3. The reading.** `POST /say { text }`: Claude fixes the words (spelling, grammar, what was misheard) into "heard",
reads one of four, and says it back the way an AREC opens ⚑ Q380 (MojoSOGO 2026-10-23 "something very similar to
abstract and reexplain (see arec, the A and R)"): **want**, one line of what the speaker wants in plain words, the gist
and not the words ("A reminder to book the car check, some time on weekday mornings."), and **steps**, one to four
short lines of what Yes will do, each read after "I will" ("fill a 📌 reminder: Book car check", "ring once between 8
and 11am, Monday to Friday"). Not yet and Outside always get the same steps ("save it as a feature request", "let John
look at it first"; "log it as Out of scope for John", "point you to Lists → Shopping"), as their sentence is always the
same, so Ensō never promises a build. **Said back** (MojoSOGO 2026-10-23 "have it say I will … and then the reexplain
and then ask, did I get that right?"): the sentence is "I will " and the steps ("…, … and …."), then "Did I get that
right?". Not yet keeps its fixed sentence and asks too; Outside keeps its fixed sentence and does not ask (its button is
OK). A reading with no want shows what was heard; one with no steps shows and says its own sentence, then the
question. Nothing is saved by the reading itself.

| Reading | When | What Ensō says | Buttons |
|---|---|---|---|
| **Reminder** | a reminder 📌 Reminders can make: once at a time (§8.5b) or at random times in a window (§8.5c) | one sentence of what it will do ("I'll remind you on weekdays between 8 and 11am to book the car check.") | **Yes** opens the reminder form filled in, to check and Save ⚑ Q335 · Clarify · Cancel |
| **Event** | something on the calendar: a plan at a date, with a time or all day, and who is going (§8.4) | one sentence of what it will add ("I'll add dinner on Friday the 23rd at 8pm for you and Michelle.") | **Yes** opens the new-event form filled in (title, date, time or all day, who), to check and Save ⚑ Q341 · Clarify · Cancel |
| **Already there** | Ensō already does it elsewhere, and it is not a reminder or an event | where ("Alerts → ⏱ Rolling timers") in a sentence | **Yes** closes · Clarify · Cancel |
| **Not yet** | fits what Ensō is for (§1.3), but it can't do it | "Ensō can't do that yet. I can save it as a feature request for the next build." + "It's a big one, so John will look at it first." when big | **Yes** saves it as a request ("Saved. Thanks!"; to an admin, when small: "Saved. Build it now?" with **Build now** · Later, part 6) · Clarify · Cancel (nothing saved) |
| **Outside** | does not fit what Ensō is for (§1.3) | "That's outside what Ensō is for. Ensō keeps the family's calendar, reminders, chores, lists, recipes and house." + where the part that fits lives, when one does | **OK** · Clarify · ✏️ Edit. Leaving any way but Clarify or ✏️ Edit logs it as **Out of scope** for John ⚑ Q339 |

A request (Not yet or Outside) carries Claude's short title, one-line summary and size: **small** (fits beside what
exists in one screen) or **big** (a new area, many screens, outside services, or unclear; unsure = big).

Whatever Ensō can do from the popup it does, not explains: a reminder or an event is never read as Already there.
Who is going is matched to the members by name; the speaker's own name, or "me", is the speaker; nobody named on an
event means just the speaker. An event with no real date is not read (the speaker is asked to say it another way); a
time that is not a real time is left out, so the form opens all day for the speaker to fix.

**4. The answer.** The popup shows **You want:** and the want, **I will:** and the steps numbered, "Did I get that right?" (not on
Outside), then, smaller, "I heard:" and the words, and the buttons (Yes = right); the phone **says the sentence aloud** ("I
will … Did I get that right?") in its best English voice ⚑ Q334; 🔇 stops it. **Clarify** opens the box again (tap Ensō to talk) and sends what was said
before with the new words. **✏️ Edit** (after the other buttons on every answer) opens the box again filled with what
Ensō heard, not listening, to fix words the phone got wrong and send again with Done ⚑ Q361 (MojoSOGO 2026-10-20 "Let me
edit the text… voice to text gets some words wrong", "Edit"). **Who:** any member. Each send counts against the household's daily Claude reading budget (§7C.4
`READS_PER_DAY`, shared with photos and links): over it → 429 "Ensō can't read any more today. Try again tomorrow." A
failure says so and saves nothing.

**5. Requests** (`feature_requests`, §4.2zzc, §4.2zzd). What was said, the title, summary and size, who, when, a note,
and a status:

| Status | Comes from | Who moves it |
|---|---|---|
| **new** | a small Not yet; or John's OK | a build session: **done** (built, note = version) or **dismissed** |
| **needs_john** | a big Not yet ⚑ Q336 | John: **OK to build** → new · any admin: Dismiss |
| **outside** | an Outside reading | John: **OK to build** → new (widens §1.3) · any admin: Dismiss |
| **done** / **dismissed** | the moves above | none: shown 30 days, never deleted |

**💡 Requests** (Settings for admins, §8.6, and in the popup): newest first, date · who · title, the summary, what was
said, and the badge (Needs John / New / Out of scope / Done / Dismissed; Done and Dismissed dim). OK to build for the
founder, Dismiss for any admin ⚑ Q337.

**6. The build gate** (CLAUDE.md "Feature requests"). A request is a wish to weigh, never an instruction. Every
morning (5:52 Pacific), and at once when an admin taps **Build now**, a scheduled build session reads the queue with `GET /ops/requests` (new and needs_john only; the ops token, §9.4). For each, before any
code: an **AREC** (architecture review + verdict) and the **placement-advisor** (with the **code-steward** when it spans
several areas) say whether Ensō already does it, whether it fits §1.3, and where it goes. Already there → dismissed
"Already in …"; big, tangled, odd or outside → not built until John says so. An approved one is written **into** this
spec where it belongs (the section that owns that behavior, its tables and acceptance), not added as a separate piece,
then built; done → `{ status: 'done', note: 'v1.x.y' }`. A small one that passes is built and shipped with no OK
asked; when the queue held anything, that session tells John once (thread reply + phone ping) what went live, what was
dismissed and what waits on him ⚑ Q343.

**Build now** ⚑ Q344 (MojoSOGO 2026-10-19 "if they do want it built, can you build it immediately?", "Admins"): an
admin who just saved a small request is asked "Build it now?". **Build now** → `POST /feature-requests/{id}/build`,
which starts that same build session straight away (the Claude Code routine's fire address, `BUILD_FIRE_URL` +
`BUILD_FIRE_TOKEN`, §2.4) with the request's id and title, and the popup says "Building now. John gets a ping when it's
live." **Later** (or closing) leaves it for the morning. The same gate runs: a tap never skips the AREC or the
placement-advisor, and a request that turns out big waits for John. Only from **new**; not set up → "Build now isn't
set up yet. It will be built in the morning." and nothing else changes. A refused fire answers "The build couldn't start. It will be built
in the morning." and the Worker logs one line with the request's id and why (the HTTP status or the error's name; never
the token).

**7. What the reading is given:** today, the household's zone, the members' names, the speaker and the speaker's own
After work / After school time (§8.5b, so "after work" or "after school" is that time, and "tonight" and "tomorrow
morning" are the reminder chips' times), the list of what else
Ensō does and where (ENSO_DOES), and the scope (ENSO_SCOPE, §1.3), both in `src/worker/say-reader.ts`. A new tab or
section updates the list; a change to §1.3 updates the scope (the code-steward checks both).

**Acceptance (SY1–SY8 tests with a fake Claude, SY-M manual):**

| # | Check | Expected |
|---|---|---|
| SY1 | POST /say, Claude answers a window reminder for "me" | 200 `{ kind: 'reminder', heard, say, reminder: { title, window: { days, from, to }, assignedTo: [my id] } }`; nothing saved; one read counted |
| SY2 | Claude answers "exists"; a request (big) | 200 `{ kind: 'exists', where, say }`; 200 `{ kind: 'request', request: { title, summary, size: 'big' }, say }`; no row saved |
| SY3 | POST /feature-requests `{ text, title, summary, size: 'big' }` then GET /feature-requests as admin, as a plain member | 201 status `needs_john`; listed; 403 |
| SY4 | founder POST …/ok; an admin POST …/dismiss; a non-founder admin …/ok; …/ok on a `new` one | `new`; `dismissed`; 403; 409 |
| SY5 | GET /ops/requests with the token; PATCH one `{ status: 'done', note: 'v1.88.0' }`; no token | the open ones, oldest first; `done` with its note; 401 |
| SY6 | POST /say blank; the day's reads used up; no key | 400; 429; 503 |
| SY7 | Claude answers "outside" for "order our groceries from Amazon every Friday", with where "Lists → Shopping"; with no where | 200 `{ kind: 'outside', say: "That's outside what Ensō is for…", where: 'Lists → Shopping', request: { title, summary, size: 'big' } }`; `where: null`; no row saved by /say |
| SY9 | Claude answers an event "Dinner" on 2026-10-23 at 20:00 for "me" and "Shelly"; an all-day one; a bad date | 200 `{ kind: 'event', event: { title: 'Dinner', date: '2026-10-23', time: '20:00', assignedTo: [me, Shelly] } }`; `time: null`; 502 (not read); nothing saved |
| SY10 | POST /say as a member whose After is school at 15:00; as an admin with no After set | the prompt gives "after school" = 15:00; "after work" = 17:30 |
| SY11 | POST /feature-requests/{id}/build as an admin on a new request (fire answered 200); as a plain member; on a needs_john one; with BUILD_FIRE_TOKEN unset; fire answered 500 | 202 `{ started: true }`, one POST to BUILD_FIRE_URL with the Bearer and the id + title in `text`; 403; 409; 503 `build_now_off`, no fire; 502 `build_failed` and one log line naming the id and `HTTP 500`, never the token |
| SY8 | POST /feature-requests `{ …, outside: true }`; GET /ops/requests; founder …/ok on it; an admin …/dismiss on another | 201 status `outside`, listed in GET /feature-requests after 30 days too; not in /ops/requests; `new`; `dismissed` |
| SY12 | POST /say/hear as a member with an audio/mp4 clip (fake AI answers " Remind me at nine. "); signed out; an image/jpeg body; an empty clip; a clip over 2 MB; the AI throws; no AI binding | 200 `{ text: 'Remind me at nine.' }` and the AI got the clip as base64; 401; 400; 400; 400; 502 `hear_failed`; 503 `hear_off` |
| SY13 | Claude answers a reminder with want and three steps; with no want and no steps; a request (big) and an outside with steps of its own; seven steps | 200 with `want` and `steps` as given; `want` = heard, `steps` = [say]; `steps` = `requestSteps('big')` / `outsideSteps(where)`, never Claude's; the first four. `say` = "I will a, b and c. Did I get that right?"; with no steps, Claude's say + "Did I get that right?"; a request `requestSay` + the question; an outside `outsideSay` alone |
| SY-M | on the iPhone | tap the Ensō button, tap Ensō in the box, say "weekdays 8 to 11 remind me to book the car check", see "You want:" with the gist and "I will:" with numbered steps, hear "I will … Did I get that right?", Yes → the form with 🎲 Weekdays 8–11, Save; say "make the fridge order groceries" → Yes → Settings → 💡 Requests shows it as Needs John; tap the mark → the box opens quiet; tap Ensō in it → the phone asks for the mic once, then "Listening…"; say "remind me tomorrow at 9 to call mom", tap Ensō again → it stops, Done → the answer; a fresh opening of the app never asks for the mic; say "order our groceries from Amazon" → Outside, OK → Out of scope in 💡 Requests; on any answer ✏️ Edit → the box holds what was heard, fix a word, Done → the new answer; tap Ensō, talk, tap Ensō, tap it again and talk more → the new words show too |

### 8.19 🏡 Home — the house's devices, room by room (§9.2e) — asked by MojoSOGO 2026-10-27

"Have a button for home automation; opens to button list of defined rooms in Enso; then assigned items to room."

```
🏡 Home
[ 🚪 Kitchen      ] [ 🚪 John's room  ]
[ 🚪 Living room  ] [ 🚪 Garage       ]

  John's room                       ✕
  ┌───────────────────────────────┐
  │ ❄️ Midea AC            [ Off ] │
  │ Fan                            │
  │   Room 54°        Set 70°      │
  │ [Off] [Cool] [Dry] [Fan] [Auto]│
  │        [ − ]  70°  [ ＋ ]       │
  └───────────────────────────────┘
  [ ✏ Devices ]                [Close]
```

- The **🏡 Home** tab (⚑ Q389; 🏠 stays Settings → Household) shows every room (§7B.6, by `position`) as a button in
  the same grid as Settings (`PickGrid`), each `🚪 {name}`. No rooms → "No rooms yet. An admin adds them in Settings →
  🏠 Household."
- A tap opens the room in a modal: one card per device from `GET /rooms/{id}/devices`, in the order picked. A card
  shows the domain's emoji (❄️ climate, 💡 light, 🔌 switch, 🌀 fan), the device's name, its state in words and one
  **Turn on / Turn off** button. The state is big and bright
  (1.25rem, bold, full text colour; MojoSOGO 2026-10-27 "make status larger font and easier to see"): On / Off, or an
  AC's mode, and under it **Room {current}°** and **Set {target}°** as large figures (1.8rem) with small labels. An AC
  also shows one button per mode HA lists (the current one pressed; names: Off, Cool, Heat, Dry, Fan, Auto, Heat/Cool), and **−
  / ＋** around the target (one step each). Each tap sends `POST /house/devices/{id}` and the card shows the state it
  answers; while it waits the card's buttons are off. A failure shows inside the card (`role="alert"`).
- A device HA can't read shows dim with "Not answering" (or the reason), and no buttons. HA not set up / not
  reachable shows once at the top of the modal, with **Try again** ⚑ Q392; no new badge.
- No devices yet → "No devices in this room yet." (+ " Tap ✏ Devices to pick them." for whoever can).
- **✏ Devices** (the room's creator or an admin, §6.3, ⚑ Q390) swaps the cards for the picker: a **Find** box and one
  checkbox line per device `GET /house/devices` lists (✏ Devices shows only once the room's devices are read, and
  Save only once the list is read, so a slow or failed read never saves an empty room) (emoji, name, a dim entity id), ticked ones first; a device in
  another room shows "in {room}", unticked and off ⚑ Q391. **Save** sends `PUT /rooms/{id}/devices` with the ticked
  ids in the order they were ticked (an id HA no longer lists stays, unseen) and returns to the cards; **Cancel** returns unchanged. 12 at most.
- Text fields 16 px, buttons 44 px tall, one card per row at 320 px.

**Check (HD-UI, on the iPhone):** 🏡 Home → John's room → ✏ Devices → tick Midea AC → Save → its card shows the room
temperature and mode; Cool → the AC beeps and the card reads Cool; ＋ → Set goes up one.


## 9. Delivery

### 9.1 Web Push — phone notifications

Each person turns phone alerts on **once per phone**, in Settings → 📱 Phone alerts (decided by MojoSOGO
2026-10-03: Web Push through the installed app, not SMS).

**Turning it on** (`frontend/src/…` — placement decides):
- A **Phone alerts** area in Settings → 📱 Phone alerts shows this phone's state, honestly:
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
  and `navigate(url)` it, or — when there is none, or it cannot be navigated — `openWindow(url)`; otherwise, with
  `data.alertId` (§9.5), the same for `/settings/alerts?alert={alertId}`; otherwise focus the open app or open `/`.

**Payload** (JSON, encrypted): `{ fireId, kind, tag, title, body, actions, url, alertId }`, under Apple's 4 KB
(`alertId`: the delivery's id, so a tap opens its card, §9.5; `null` on the test push, which has no row):
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

Every call to Home Assistant (speaking here, the speaker list in §9.2a, the devices in §9.2e) goes through one client,
`src/worker/ha.ts`: `haConfigOf(env)` needs only `HA_URL`, `HA_TOKEN` and the Access pair (null otherwise), and
`haCall` makes one GET or POST with the Bearer token through Access, giving the answer's text or an honest reason.

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

Decided by MojoSOGO 2026-10-04: in Settings → 🔊 Speakers each person ticks the house speakers they want to be
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
**announcement** does not use anyone's choice: it is spoken on **every speaker HA lists** (§9.3, Q127). The writer reads those members'
`member_prefs.house_speakers` and stores `speakersFor(…)` on the row as JSON (NULL stays NULL).
**`speakersFor` = `[]` → no house row is written**: nobody it is for wants it spoken ⚑ Q128. The fire still
steps and push still goes out.

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

**The screen** (`🔊 Speak my alerts on`, Settings → 🔊 Speakers):
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
| HS10 | `POST /announce` House with A `[game_room]`, B `[]`; HA lists Game Room, Everywhere, Sogo, Office; then HA answers 500 | one house row on game_room + sogo + the Voice PE (not Everywhere), whatever was ticked; HA down → `speakers` NULL (the defaults) |
| HS-M | migration 0024 | earlier rows intact, both columns NULL; `foreign_key_check` empty |

### 9.2b Quiet the house — `src/shared/house-quiet.ts` — asked by MojoSOGO 2026-10-10

"I need to be able to suppress house alerts (not phone alerts) for a few hours or rest of day." Anyone in the
household can quiet the speakers for a while; phones carry on exactly as before.

**Rules** (pure):
- `HOUSE_QUIET_FOR = ['1h', '2h', '4h', 'today']` (§3) ⚑ Q209 — 1 hour, 2 hours, 4 hours, Rest of today.
- `quietEnd(choice, tz, now)` → the UTC instant quiet ends: `now` + 1 / 2 / 4 h, or for `today` the next
  household-local midnight (Oceanside time) ⚑ Q210.
- `quietState(until, now)` → `until` when `until > now`, else `null` (not quiet). Quiet ends **on its own**:
  nothing clears the column, a past instant simply reads as not quiet.
- `quietError(v)` → a message or `null`: `v` is one of `HOUSE_QUIET_FOR`.
  Message: "Choose how long: 1h, 2h, 4h or today."

**What is quiet** — household-wide ⚑ Q211. While quiet, **no `house` row is written** by any writer: an alert's
house row (tick step 2) and a timer's start announcement (§5.5a). **📢 Announce ignores quiet** and is spoken on
every speaker (§9.3; MojoSOGO 2026-10-12: "announcements are special; they announce everywhere because it is a house
important announcement"). It is the same path as
"nobody ticked a speaker" (§9.2a, HS9): the fire still steps and every `push` row is written and sent unchanged.
An alert that fires while quiet is **skipped on the speakers, not saved for later** ⚑ Q212; a reminder that
repeats (a machine's, a renotify) is spoken again at its first alert after quiet ends. A house row already queued when quiet starts is still spoken.

**API** (member — anyone who can use alerts ⚑ Q211):
- `GET /house/quiet` → `{ until: string | null, byName: string | null }` (`until` from `quietState`; `byName`
  is the setter's display name, only while quiet).
- `PUT /house/quiet { for }` → the same shape; sets `house_quiet_until = quietEnd(…)`, `house_quiet_by` = the
  session member (setting again replaces it). 400 `invalid_input` with `quietError`'s message.
- `DELETE /house/quiet` → `{ until: null, byName: null }`: **Turn off now** (both columns NULL).

**The screen** (Alerts tab, right under 📢 Announce, §8.5):
- Not quiet: a **🤫 Quiet the house** button. It shows one row of chips: **1 hour · 2 hours · 4 hours · Rest of
  today**; one tap sets it (and closes the row).
- Quiet: a line "🤫 House is quiet until {HH:MM} · {N h M min} left · set by {name}" and **[Turn off now]**.
  Phones still ring; the line says "Phones still get alerts." in dim text beneath. The time left is redrawn
  every minute and the line goes away when it reaches the end; it is re-read on every app refresh.
- A refusal shows under the control with `role="alert"`. Chips are 44 px tall; nothing scrolls sideways at
  320 px.

**Acceptance (HQ — each row is a test):**

| # | Check | Expected |
|---|---|---|
| HQ1 | `quietEnd`, `quietState`, `quietError` | 1h/2h/4h add hours; `today` at 15:00 Los Angeles → next 00:00 local (07:00Z in PDT); `quietState` past/equal → null, future → until; `'3h'`, `null` → message |
| HQ2 | `PUT /house/quiet { for: '2h' }`, `GET`, `DELETE` | until = now + 2 h, `byName` the setter; GET the same; DELETE → nulls; bad `for` → 400; no session → 401 |
| HQ3 | tick while quiet: a fire with Phone + House | the push row written and sent; no house row; zero HA calls; the fire steps |
| HQ4 | tick after quiet ended (until in the past) | the house row is written and spoken as before |
| HQ5 | `POST /announce` while quiet | House only → 201, one house row (Announce ignores quiet) |
| HQ6 | a timer's start announcement while quiet | push rows only, no house row |
| HQ-M | migration 0038 | settings row intact, both columns NULL |

### 9.2c "I'm away" on one alert — asked by MojoSOGO 2026-10-10

"Give them an option to say they ack but they are away and suppress house reminders but action still not
complete." The person has seen the alert and can't do it right now because they're not home, so there's no
point in reminding anyone; it stays open in the Ringing bar, silent.

**Rules:**
- **`POST /fires/{id}/away`** (member) — on an open fire (`ringing` or `scheduled`) of any kind, a machine's
  included: sets `away_by` = the session member and `away_at` = now. Nothing else changes: the state, due time
  and alert count stay; the fire is not done, acked or snoozed. Saying it again replaces who. → 200 the fire as
  `GET /fires` shows it. 404 `not_found` for an unknown fire; 409 `invalid_action` "That alert is already
  finished." for a closed one.
- **While a fire is away, no `house` row is written for its alerts** (tick step 2, the same path as §9.2b);
  **and no `push` row either**: the alert goes silent everywhere ⚑ Q213. It still steps (alert count, due) and
  stays in the Ringing bar until someone closes it. MojoSOGO 2026-10-11: "mojosogo still getting tostig
  notifications and he away" → **ALL** (a machine pings every phone, §7D.3, so Tostig's load kept pinging
  everyone after Tostig said Away).
- It lasts **for that fire only**, until it is closed (done, acked, cleared, moved) ⚑ Q214. A fire that
  replaces it (a timer's next countdown after Ack, a machine's Still loaded, a chore's next step, a reminder's
  next occurrence) starts without it, so the speakers speak again. Snooze keeps the same fire, so it stays away.
  **A timer's day ending ends it too** (MojoSOGO 2026-10-14, v1.78.1): when Rule 0 (§5.3) carries a timer fire to
  its next window, `away_by` and `away_at` are cleared, so the next day rings. Before this, one Away silenced a
  timer for good.
- `GET /fires` carries `awayBy` (member id or null) on every fire.

**The screen** (Ringing bar, §8.2): every row that is not away gets an **Away** button (before the row's main
button). An away row shows `· away ({name})` after its sub line, and no Away button; its other buttons stay.

**Acceptance (AW — each row is a test):**

| # | Check | Expected |
|---|---|---|
| AW1 | `POST /fires/{id}/away` on a ringing reminder | 200 with `awayBy` = the caller; state, due and alert count unchanged; `GET /fires` shows `awayBy`; unknown → 404; closed → 409; no session → 401 |
| AW2 | the reminder's next renotify after Away | no delivery row at all (no push, no house), zero HA calls; the alert count still steps |
| AW3 | a timer that is away, then Ack | the next countdown fire has `away_by` NULL (its alerts follow §9.2d like any fire) |
| AW4 | Away on a ringing machine fire | 200; its next reminder writes no delivery row |
| AW5 | a timer 06:30–13:30 ringing and away; tick at 13:31, then at the next day's 07:30 | after 13:31: `scheduled`, due next day 07:30, `away_by`/`away_at` NULL; at 07:30: one `push` row for alert 1 |
| AW-M | migration 0039 | fires and deliveries intact; both columns NULL |

### 9.2d Phone first, then the house — asked by MojoSOGO 2026-10-10

"First announcement should be phone only, then phone and house if selected." An alert that has both Phone and
House ticked and repeats gives people a quiet chance on their phones first; the speakers join from the second
alert on.

**Rule** (pure): `speaksOnHouse(alertNumber, cfg)` → whether this alert of a fire gets a house row:
- House not in `cfg.channels` → no (as before);
- Phone not in `cfg.channels` (House only) → yes, from the first alert ⚑ Q215;
- `alertNumber ≥ 2` → yes;
- the first alert of a fire that **will not alert again** (`renotifyMin` null, or `maxAlerts ≤ 1`) → yes: it would
  otherwise never be spoken ⚑ Q216;
- otherwise (the first of several) → no.

It applies to every fire kind (reminders, timers, chores, things, machines) ⚑ Q215; `alertNumber` is the fire's
`alert_count` after the step, so a snoozed or waited fire (alert count back to 0) starts phone-first again. Fire-less
house rows — a timer's start announcement (§5.5a) and 📢 Announce (§9.3) — are unchanged. It joins the §9.2b and
§9.2c gates in tick step 2; push rows are unchanged. Earlier acceptance rows that counted a house row on a repeating
Phone + House fire's first alert (G5, the T1–T10 timer, L3–L5, L15, HS11) now count from its second alert; the
machine wording checks read the push row, which carries the same words.

**Acceptance (PF — each row is a test):**

| # | Check | Expected |
|---|---|---|
| PF1 | `speaksOnHouse` | Phone+House repeating: 1 → false, 2 → true; House only: 1 → true; Phone+House with renotify null or maxAlerts 1: 1 → true; Phone only: false |
| PF2 | tick: a Phone+House reminder repeating every 5 min | alert 1: push rows, no house row, zero HA calls; alert 2: push rows and one house row, spoken |
| PF3 | tick: a Phone+House reminder with no repeat | its one alert is spoken |

### 9.2e The house's devices, room by room — `src/shared/home-devices.ts` (pure) — asked by MojoSOGO 2026-10-27

MojoSOGO 2026-10-27, after "Can you see the ac via home assistant?" (yes, a Midea AC): Ensō shows and runs the house's
Home Assistant devices, grouped by Ensō's rooms (§7B.6). The screen is §8.19. Ensō **only reads states and calls a
fixed list of services**: it never creates or changes anything in HA (no entities, automations or scenes, §12), and
a caller never names a service.

**A device** is an HA entity id whose prefix is one of `DEVICE_DOMAIN` (§3): `climate.<slug>`, `light.<slug>`,
`switch.<slug>`, `fan.<slug>`; a slug is `[a-z0-9_]+`. A room holds up to `ROOM_DEVICES_MAX` = 12 ⚑; a device is in
at most one room (`room_devices`, §4.2zzl). Its name and state are asked of HA every time, never stored.

**Rules** (pure, imports only vocab):
- `deviceDomain(id)` → the domain or null.
- `parseRoomDevices(v)` → the list, or the message "devices must be a list of up to 12 different Home Assistant device
  ids (climate, light, switch or fan)." for anything but an array of at most 12 distinct ids with a domain.
- `deviceFromState(id, text)` → `Device` from HA's `/api/states/{id}` answer, or null when it isn't one:
  `{ id, name, domain, state, available, on, climate }`. `name` is `attributes.friendly_name` (else the id);
  `available` is false for `unavailable` / `unknown`; `on` is available and not `off`. For a climate device
  `climate` = `{ mode: state, modes: hvac_modes, current: current_temperature, target: temperature, min: min_temp,
  max: max_temp, step: target_temp_step }` (numbers or null; `step` 1 when missing ⚑), else null.
- `deviceUnreachable(id, reason)` → the `Device` shown when HA didn't answer for it: its id as name, `state`
  `unavailable`, not available, with `error` = the reason (a read `Device` has `error` null).
- `devicePickList(text)` → `{ id, name, domain }[]` (A–Z by name, duplicates and ids without a domain dropped) from
  the template answer below, or null when it isn't a JSON array.
- `deviceCall(device, body)` → `{ path, payload }` or the 400 message. `body.action` is one of `DEVICE_ACTION`:
  - `on` / `off` → `/api/services/{domain}/turn_on|turn_off` `{ entity_id }` (an AC too: HA's climate turn_on brings
    back its last mode).
  - `mode` (climate only) → `/api/services/climate/set_hvac_mode` `{ entity_id, hvac_mode }`; `body.mode` must be one
    of the device's `modes`, else "mode must be one of: …".
  - `target` (climate only, with a target) → `/api/services/climate/set_temperature` `{ entity_id, temperature }`;
    `body.target` a number, clamped to min…max and rounded to the step.
  - Anything else → "action must be one of: on, off, mode, target." / "{action} isn't something a {domain} does."

**The routes** — `src/worker/routes/home-devices.ts`, through `src/worker/home-devices.ts` (HA I/O, raw text only):
- **`GET /house/devices`** (member) — the pick list, live. HA not set up (`haConfigOf` null) → 503
  `house_not_configured`, before any fetch. One `POST /api/template` (15 s), body `{ template: DEVICE_TEMPLATE }`,
  which lists every `climate` / `light` / `switch` / `fan` entity with its name. Non-2xx / a throw / unreadable → 502
  `house_unreachable` with the reason. → `{ devices: { id, name, domain, roomId }[] }`, `roomId` the room it is in
  or null.
- **`GET /rooms/{id}/devices`** (member) → `{ devices: Device[] }` in the order picked. No devices → `[]` with no
  fetch. Otherwise 503 when HA isn't set up, and one `GET /api/states/{entity}` per device, all at once (10 s each);
  one that fails or can't be read is `deviceUnreachable`. An unknown room → 404 "That room no longer exists."
- **`PUT /rooms/{id}/devices { devices }`** (the room's creator or an admin, §6.3; else 403) → `{ devices: string[] }`.
  `parseRoomDevices` → 400 `invalid_input`; a device already in another room → 400 "{id} is already in {room}." ⚑
  Q391 (untick it there first). The room's rows are replaced in one batch. Not checked against HA: an id HA no longer
  has shows as not answering.
- **`POST /house/devices/{entity} { action, mode?, target? }`** (any member ⚑ Q390) — only a device that is in a room,
  else 404 "That device isn't in a room."; 503 when HA isn't set up. It reads the device's state, makes `deviceCall`
  (400 with its message), POSTs that one service (15 s; failure → 502 `house_unreachable` with the reason), then reads
  the state again → `Device`.
- Never a token in any answer or log (access.ts).

**Acceptance (HD — each row is a test; a fake HA at https://ha.test):**

| # | Check | Expected |
|---|---|---|
| HD1 | `deviceDomain`, `parseRoomDevices` | `climate.midea_ac_1` climate; `light.x` light; `media_player.x`, `climate.Bad Id`, `""` null; 13 ids / a duplicate / a media player / not an array → the message |
| HD2 | `deviceFromState` on the Midea AC's answer (fan_only, 54.5 current, 70 target, 60–86, no step); on an `unavailable` light; on `"oops"` | climate `{ mode: 'fan_only', modes, current: 54.5, target: 70, min: 60, max: 86, step: 1 }`, on, available; light not available, not on; null |
| HD3 | `deviceCall` | on/off → turn_on/turn_off of its domain; mode cool → set_hvac_mode; mode heat when not listed → 400 text; target 90 → 86, 70.4 → 70; mode or target on a light → 400 text; action `explode` → 400 text |
| HD4 | `devicePickList` | A–Z, a `media_player` and a duplicate dropped; not an array → null |
| HD5 | `GET /house/devices` | one POST `/api/template` with DEVICE_TEMPLATE and the three auth headers; each with its `roomId`; not set up → 503 and no fetch; HA 500 → 502 |
| HD6 | `PUT /rooms/{id}/devices` by an admin, then `GET /rooms/{id}/devices` | saved in order; one GET `/api/states/{id}` each; a failing one shows `available` false with its `error`; an empty room makes no fetch |
| HD7 | PUT a device already in another room; a bad list; by a member who didn't make the room | 400 naming the room; 400; 403 |
| HD8 | `POST /house/devices/{id}` mode cool by a plain member | GET state, POST `/api/services/climate/set_hvac_mode` `{ entity_id, hvac_mode: 'cool' }`, GET state → the new `Device` |
| HD9 | POST for a device in no room; a bad action; HA 500 on the service | 404 and no fetch; 400 and no service call; 502 |
| HD10 | delete a room with devices | its `room_devices` rows gone; the device can be put in another room |
| HD-M | migration 0065 (§4.2zzl) | see §4.2zzl |

### 9.3 Announcements — `src/shared/announce.ts`, `POST /announce`

A member sends a house announcement **now** from the Alerts tab (§8.5; decided by MojoSOGO
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
    `alert_number 1`, `message` = `announceMessage(…)`, `speakers` = **every speaker HA lists**
    (`allHouseSpeakers`, as machines, §7D.3; NULL = the defaults when HA can't say), whatever anyone ticked, `queued`
    (Q127, MojoSOGO 2026-10-12: "not hearing the announcement button audio on all devices"). The Worker speaks it exactly like a House alert (§9.2),
    **right away**: after
    the 201 body is read, `c.executionCtx.waitUntil(sendHouseDeliveries(env, now, [houseId]))`
    — a drain restricted to that one row, so the speaker does not wait for the next tick.
  - **Phone** ticked → one `push` delivery per member of `audience(…).push` (§7.5 — with no
    assignment, every active member) **the sender too**, so their other devices hear it (Q36, MojoSOGO
    2026-10-12: "not getting notifications on all devices"), same `message`, `queued`.
- Then the push deliveries are sent at once with `sendPushDeliveries` (§9.1): each ends `sent`
  or visibly `failed` (`no_subscription`, `push_not_configured`, a push-service error) — a
  member without a phone gets the honest failed row, as alerts do.
- → **201** `{ deliveries: { id, channel, memberId, status }[] }`, read after sending push and
  **before** the house row is spoken (push rows final, the house row `queued`). Every row also shows in Settings → 📊 Status.
- 400 `invalid_input` with `announceError`'s message. (No `no_recipients` / `no_speakers`: the sender is always an
  active member and House always has speakers, so something is always sent.)

**The push:** `{ fireId: null, kind: null, tag: <delivery id>, title: "📢 Announcement", body:
"Shelly says: Dinner is ready", actions: [] }`; tapping it opens the app.

**Acceptance (M4k — each row is a test):**

| # | Check | Expected |
|---|---|---|
| AN1 | `announceError` / `announceMessage` | `"  hi "` ok; `""`, blanks, 201 chars, a non-string → message; channels `[]`, `["sms"]`, `["house","house"]`, not an array → message; `announceMessage("Shelly", " Dinner ")` = `"Shelly says: Dinner"` |
| AN2 | `POST /announce { text: " Dinner is ready ", channels: ["house"] }` | 201; one `house` delivery: `fire_id` NULL, `member_id` NULL, `alert_number` 1, `"MojoSOGO says: Dinner is ready"`, `queued`; no push rows |
| AN3 | the same, with the House settings present and a fake HA (§9.2), after `waitUntil` settles | the 201 still says `queued`; the row is then `sent`, and the fake HA heard `"MojoSOGO says: Dinner is ready"` on both surfaces |
| AN4 | Phone, with the sender, a member with a phone, one without, one disabled | one push row each for the sender and the other two active members; the disabled member gets none; with a phone → `sent`, without → `failed`, `no_subscription` |
| AN5 | the push to that phone | decrypts to the payload above with `tag` = the delivery id; no `topic` header |
| AN6 | blank text, 201 chars, no channels, an unknown channel; no session; a `name` in the body; Phone only with nobody else | 400 with a message ×4; 401; the name in the body is ignored; 201 with one push row, to the sender |
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
   row is written. Announcements (title NULL), sign-in notices (§6.6, `notice` set), a mess's asks (§7B.7,
   `mess_id` set), bounty pushes (§7B.8, `bounty_id` or `earning_id` set) and list pings (§7A.4,
   `list_item_id` set) never count.
6. One delivery: `id` = `newId('dlv')`, `fire_id` NULL, `alert_number` 1, `channel` `push`, `member_id` =
   the founder, `message` = the trimmed text, `title` = `opsTitle(title)`, `queued`.
7. Sent at once with `sendPushDeliveries` (§9.1); then **201 `{ deliveries: [{ id, status, detail }] }`**.
   `failed` with `no_subscription` (the founder has no phone) or `push_not_configured` is the honest
   answer, not an error status. **The ping reached the phone only when `deliveries[0].status` is
   `sent`**; a caller otherwise reports the `detail`.

**The push:** `{ fireId: null, kind: null, tag: <delivery id>, title: <the title>, body: <the text>,
actions: [] }` — like an announcement's, with its own title. Like any delivery it shows in
Settings → 📊 Status' recent deliveries ⚑ (Q111).

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

### 9.4a The same pings on the FunHouse — `GET /ops/pings`, `home/funhouse-poller.ts` — asked by MojoSOGO 2026-10-11

"Me not receiving Enso alerts when threads need me … also not msg funhouse; that best." Project threads run in the
cloud and can reach Ensō over HTTPS only. The FunHouse desk device (a separate project) is reachable only through its
bridge on the dev PC at `http://127.0.0.1:8765/notify`, with no inbound door. So the dev PC **polls** Ensō for new
founder pings and hands each one to the bridge. Ensō stores nothing new: a ping is already its `deliveries` row (§9.4).

**`GET /ops/pings?after=<ISO instant>`**, the same bearer as `/ops/notify` (steps 1–2 of §9.4: 503 `ops_notify_off`,
401 `unauthorized`). → **200 `{ pings: [{ id, title, text, at }] }`**: the founder pings (the rows §9.4 step 5
counts) created after `after` and within the last hour (`opsWindowStart(now)`), oldest first, at most
`OPS_NOTIFY_PER_HOUR`. `id` = the delivery id, `text` = its message, `at` = its `created_at`. `after` missing or not
an ISO instant → the whole last hour. Reading changes nothing (the phone push is unaffected). Since v1.51.0 the list
also carries the FunHouse alerts, each ping with its `channel` (§9.4b).

**The poller** (`home/funhouse-poller.ts`, Node 24 on the dev PC, `npm run build:home` →
`home/dist/funhouse-poller.mjs`, started by `home/funhouse-poller.cmd`; Node globals, `node:fs` and its own file only):
- The token is read from `%USERPROFILE%\.enso\ops-notify-token` at start (the same file §9.4 uses; no new copy).
  Missing or empty → it logs that and exits 1. The token is never logged.
- Every `FUNHOUSE_POLL_MS = 15000` ⚑ it asks `https://enso.sogodojo.com/api/v1/ops/pings?after=<the last handled at>`; at start `after` is
  the one it saved last (`%USERPROFILE%\.enso\funhouse-poller-after`, written whenever it changes) when that is
  within the last 10 minutes, else 10 minutes ago ⚑ Q244. So a restart re-sends nothing already handled (the bridge
  does **not** drop a repeated `id`; MojoSOGO heard repeats after each restart, 2026-10-11, "DUP"); after more than
  10 minutes down, older notices are skipped.
- **Stale pings are dropped:** a ping whose `at` is more than 10 minutes before the poll (`FUNHOUSE_STALE_MS`, the
  same window) is skipped and counted as handled, with one log line and no POST ⚑ Q262. So a backlog left while the
  bridge answered 503 (the board off USB) is not replayed one a poll when it comes back (MojoSOGO 2026-10-11:
  "getting stale alerts on funhouse").
- **Which pings:** a title starting with 🤖 or 🧵 (Claude's) ⚑ Q228. Others (🏛️ Ozymandias, which already
  reaches the FunHouse itself) are skipped and counted as handled.
- **At most one notice a poll** (the bridge allows one per 10 s). It POSTs raw UTF-8 JSON
  `{ source: "Claude", level: "attention", text: "<title>: <text>", sig: "⭕🔁🏠", beep: "look", id: <ping id> }` ⚑ Q229.
  A 🧵 thread ping sends its text alone (`text: "<text>"`): the FunHouse display is small, and a thread writes its
  text as `Enso:<thread title> "<ACTION what>"` (MojoSOGO 2026-10-11: "the prefix has too many words"). The phone
  shows the same text under its title.
  200 or any 4xx (refused; never retried) → handled; 503, a network error or a non-200 from Ensō → not handled, tried
  again next poll. One log line per notice: the id and the bridge's answer.

**Acceptance (each row is a test):**

| # | Check | Expected |
|---|---|---|
| FP1 | `GET /ops/pings` with no token set; a wrong token | 503 `ops_notify_off`; 401 `unauthorized` |
| FP2 | two pings, an announcement, a sign-in notice, a ping older than an hour | only the two pings, oldest first, `{ id, title, text, at }` (mess asks and a fire's pushes are left out by the same predicate §9.4's count uses) |
| FP3 | `after` = the first ping's `at`; `after=nonsense` | only the second; both |
| FP4 | `funhouseNotice` / `forFunhouse` | the body above (a 🤖 ping → "title: text", a 🧵 ping → its text alone); 🤖 and 🧵 titles → true, "🏛️ Ozymandias" → false |
| FP5 | one poll with a fake Ensō and bridge: a 🏛️ ping then two 🧵 pings | one bridge POST (the first 🧵), `after` = its `at`; next poll sends the second |
| FP6 | the bridge answers 503; then 400 | `after` unchanged, sent again next poll; then handled, not retried |
| FP8 | `pollOnce` at 01:05 with a 🧵 ping at 00:54 then one at 01:04; then the 00:54 one alone | no POST for the first, the second POSTed, `after` = 01:04; alone → no POST, `after` = 00:54 |
| FP7 | `startAfter(saved, now)`: saved 30 s ago (with a newline); none; nonsense; an hour old; in the future | the saved instant; 10 min back for the other four |

### 9.4b FunHouse as a place alerts go — `channel = 'funhouse'` — asked by MojoSOGO 2026-10-11

"Add funhouse as reachable location for alerts." Beside 📱 Phone and 🔊 House, an alert can tick **🎪 FunHouse**: the
desk device on the dev PC. It rides §9.4a: the PC poller already asks Ensō every 15 s, so a FunHouse alert is a
`deliveries` row on the `funhouse` channel (§4.2zo) that the same `GET /ops/pings` lists. Nothing new runs anywhere.

**Where it is ticked:** everywhere Phone / House are (`ChannelChecks`, §8.5; an event's Remind via, §8.4): alarms and
event reminders, rolling timers (and their start announcement, §5.5a), chores, things to do, and 📢 Announce. It is
MojoSOGO's desk, so only **the founder** (§6.3) sees the tick, and a new alert of his opens with it
**ticked** (the Announce box opens with it ticked for everyone, so everyone sees it there, §8.5 Q36); nobody else sees it unless the alert they open already has it ticked (Q230, decided by MojoSOGO 2026-10-11:
"funhouse is really just for MojoSOGO … default off for others"). The server takes it from anyone. Validation already takes any `CHANNEL`; at least one of the three is still required. Machines
(washing and cooking) ring it only when the founder is the one alerted (§7D.7; Q231 as changed by MojoSOGO 2026-10-12:
"ping funhouse for MojoSOGO and announcements"); nobody or someone else → no FunHouse row. There is no tick on a machine.

**The row:** `channel` `funhouse`, `member_id` NULL, the same `message` as the alert's push, `title` = what the phone
would show (`pushTitle`, §9.5: "Ensō" for a fire, "📢 Announcement" otherwise), `queued`. One per alert, like House.

**Which rules it follows — the phone's** ⚑ Q232 (the FunHouse sits on a desk, it is not a speaker in the house):
- Away (§9.2c) → no FunHouse row, as no phone row.
- Quiet the house (§9.2b) → still written. (Announce ignores quiet altogether, §9.2b.)
- Phone first (§9.2d) → not delayed: alert 1 already reaches it.
- An optional event (§7.5) → only when its audience is not empty (as House).

**`GET /ops/pings`** lists founder pings **and** `funhouse` rows (the same window, order and limit), each as
`{ id, channel, title, text, at }` (`channel` `push` for a ping, `funhouse` for an alert). Listing marks the listed
`funhouse` rows still `queued` as `sent` (handed to the PC); founder pings are unchanged.

**The poller:** `forFunhouse(ping)` → true for a `funhouse` row, or a 🤖 / 🧵 ping (Q228). A FunHouse alert's notice is
§9.4a's with `source: "Ensō"` ⚑ Q233. The PC rebuilds and restarts it once (README).

**Settings → 📊 Status** shows a FunHouse delivery with 🎪.

**Acceptance (FH — each row is a test):**

| # | Check | Expected |
|---|---|---|
| FH1 | tick: a reminder with Phone + FunHouse, two members | two push rows and one `funhouse` row (`member_id` NULL, `title` "Ensō", the same message) |
| FH2 | tick while quiet; on an away fire | quiet: the `funhouse` row written, no house row; away: no row at all |
| FH3 | tick: a Phone + House + FunHouse reminder repeating every 5 min, alert 1 | push rows and the `funhouse` row, no house row |
| FH4 | `POST /announce` FunHouse only; House + FunHouse while quiet | 201, one `funhouse` row titled "📢 Announcement"; 201, the `funhouse` and `house` rows |
| FH5 | `GET /ops/pings` with a ping and a `funhouse` row | both, oldest first, `channel` `push` / `funhouse`; the `funhouse` row is now `sent` |
| FH6 | `forFunhouse` / `funhouseNotice` on a `funhouse` row titled "Ensō" | true; `source` "Ensō" |
| FH7 | a timer start announcement with FunHouse ticked | one `funhouse` row |
| FH8 | `flagsOf(undefined, true)` / `flagsOf(undefined, false)` / `flagsOf(['house'], true)` | Phone + FunHouse / Phone / House only |
| FH-M | migration 0042 | §4.2zo's check |

### 9.5 My alerts — `src/shared/alert-history.ts`, `/me/alerts` — asked by MojoSOGO 2026-10-11

"If Ensō sends an alert from Ozy, I tap it but it goes away with no detail." Every push is already a `deliveries`
row with its whole message (§9.1); this shows each member their own, and a tap on the phone opens it.

**What is listed:** my push deliveries (`channel = 'push'`, `member_id` = me) that I haven't hidden
(`dismissed_at` NULL), newest first, at most `ALERT_HISTORY_MAX = 200` ⚑ (Q221) — older ones are simply not shown;
nothing is deleted. Every kind of push is there: a fire's alert, an announcement, a timer start announcement, a
founder ping (Ozymandias, Claude), a sign-in notice, a mess ask. The test push has no row and is not.

**Handled ones clear themselves** (v1.75.0, MojoSOGO 2026-10-12: "Already answered? Auto clear"): a fire's push
whose fire is `closed`, and a mess ask (`title` = the ask title, §7B.7) whose mess no longer asks me (`askedOf`), are
left out of the list, derived on each read; no row changes, so Status and the ping limit still count them. Every
other push stays until I hide it ⚑ Q284.

**Rules** (`src/shared/alert-history.ts`, pure, imports vocab and announce only):
- `PUSH_TITLE = "Ensō"` (moved from push.ts). `pushTitle({ hasFire, title })` → the title the phone showed: a fire's
  push → `PUSH_TITLE`; else `title ?? ANNOUNCE_TITLE`. push.ts sends it and the list shows it — one copy.
- `alertSource({ kind, isAlarm, notice, messId, title, hasFire })` → where it came from, in this order: a fire →
  its kind (`reminder` → "Reminder", or "Alarm" when the event `is_alarm` ⚑ Q222; `timer` → "Rolling timer", or "💪 Task buddy" for a task check-in (§7G);
  `chore` → "Chore"; `thing` → "Thing to do"; `machine` → "Machine"); a `notice` → "Sign-in"; a `mess_id` →
  "Whose mess?"; a `title` → that title (a ping: "🏛️ Ozymandias", "🤖 Claude"); else "Announcement" (a timer
  start announcement too ⚑ Q223). The ping branch matches `opsPingsSince` (§9.4), except that a bounty push (§7B.8)
  also takes the title branch ("🪙 New bounty", "🪙 Waiting for OK") but is not a founder ping; an IOU payback ping
  (§7B.9) too ("💵 Payback due", "💵 Declined").
- `ALERTS_PATH = "/settings/alerts"`; a tap opens `/settings/alerts?alert={id}`, built in sw.js. `alertIdFrom(pathname,
  search)` → the id when the path is `ALERTS_PATH` and `alert` is set, else null. sw.js carries its own copy of
  the path (a test pins it).

**API** (`src/worker/routes/my-alerts.ts`, member):
- `GET /me/alerts` → `{ alerts: MyAlert[] }`, `MyAlert = { id, title, message, source, kind, alertNumber, fireId,
  messId, status, detail, createdAt }` — `kind`, `alertNumber` and `fireId` only for a fire's push (else null);
  `messId` only for a mess ask's push (else null).
- `DELETE /me/alerts/{id}` → 204, sets `dismissed_at`; **404 `not_found`** when it isn't my push or is already
  hidden.
- `DELETE /me/alerts` → `{ cleared }`, the number newly hidden (all of mine, not just the 200 shown).
- Only this file reads or writes `dismissed_at`: Status (§8.6), the ping limit (§9.4) and mess asks still count
  hidden rows.

**Screen** (Settings → **🔔 Alerts**, the fifth button; `frontend/src/components/MyAlerts.tsx`):
- **Clear all** at the top (asks "Clear all your alerts?"; disabled when empty) ⚑ Q224; "No alerts yet." when empty.
- One line per alert: the title, the message (one line, cut with …), the time; a red **❌** at the end hides it at
  once, no asking ⚑ Q224.
- Tapping a line opens its **card** (a titled modal): the title, the whole message, when (date and time), From (the
  source), the alert number (a fire's push), and how it went (sent / failed with the detail). **Close** at the
  bottom; no Delete on the card (v1.70.0, MojoSOGO 2026-10-12: "Remove delete; too easy to make mistake").
- **Ack** (v1.75.0, MojoSOGO 2026-10-12: "Let me ack this which will clear it. Ack on left; close on right"): a card
  with nothing else to act on (a ping, an announcement, a notice, a fire not ringing) has **Ack** at the bottom left
  and **Close** at the right. Ack hides the line (as its ❌, `DELETE /me/alerts/{id}`) and closes the card. A card
  with a fire's or a mess's buttons has just Close: acting there clears it (below).
- **Opened from a push:** a tap on a notification (no action button) opens `/settings/alerts?alert={id}`
  (§9.1). On start the app reads it, clears the address to `/`, shows Settings and opens that card — after
  signing in first, if needed ⚑ Q225. An id not in my list (hidden, or handled and cleared) → no card, just the
  list (v1.75.0). An open card closes by itself once its alert leaves the list (it was handled).
- A sign-in request's push still opens its approve page (§6.6); its line is in the list too.
- **Act on it from the card** (v1.70.0, asked by MojoSOGO 2026-10-12: "Let me ack in a notification modal"): when the
  card is a fire's push and that fire is still in the Ringing bar, the card shows the same one-tap buttons as its
  Ringing bar row (§8.2: Away, Snooze 10m, Ack / Done, the machine button) under the details; one tap acts and
  closes the card. Move to … opens the dryer chooser; once the load moves, the fire closes and the card goes with
  it. A fire not ringing but not closed (snoozed) shows just Close ⚑ Q272. Other pushes (pings,
  announcements) have nothing to act on: just Close. The buttons are the Ringing bar's own
  (`frontend/src/components/FireActions.tsx`), one copy.
- **Answer a mess from the card** (v1.74.0, asked by MojoSOGO 2026-10-12: "On the modal that opens from tapping an
  alert, let me respond directly from the modal"): a Whose mess? push's card, while that mess still asks me
  (§7B.7, the banner's list), shows its photo and **That was me** / **Not me** (the banner's own buttons,
  §8.15a); one tap answers and closes the card, and the line clears ⚑ Q283. Bounty pushes (🪙) keep just Close for now ⚑ Q283.

**Acceptance (M4u — each row is a test):**

| # | Check | Expected |
|---|---|---|
| MA1 | `pushTitle` / `alertSource` / `alertIdFrom` | a fire → "Ensō"; titled → the title; neither → "📢 Announcement"; each source branch in order (a fire with a title stays its kind; an alarm → "Alarm"); `alertIdFrom` on `/settings/alerts?alert=dlv_1` → `dlv_1`, on `/` or without `alert` → null |
| MA2 | a ping to the founder, then `GET /me/alerts` as the founder; as another member | one alert `{ title: "🏛️ Ozymandias", message: <the whole text>, source: "🏛️ Ozymandias", kind: null, alertNumber: null, status }`; the other member's list is empty |
| MA3 | a reminder's push and an announcement | the reminder's: title "Ensō", source "Reminder", kind `reminder`, alertNumber 1; newest first |
| MA4 | `DELETE /me/alerts/{id}` mine; again; another member's; a house row's id | 204, gone from my list, the row still in `deliveries`; 404; 404; 404 |
| MA5 | `DELETE /me/alerts` with 3 of mine (1 already hidden) and 1 of someone else's | `{ cleared: 2 }`; my list empty; theirs untouched; `/status` still lists all four |
| MA6 | more than 200 of mine | the newest 200 |
| MA7 | the push payload of a fire, an announcement, a ping; the test push | `alertId` = the delivery id; the test push's `null` |
| MA8 | sw.js | contains `ALERTS_PATH` and builds `${ALERTS_PATH}?alert=` from `data.alertId` (v1.49.1, steward pass 12) |
| MA9 | `GET /me/alerts` with a reminder's push and a ping | the reminder's `fireId` = its fire's id; the ping's `fireId` null |
| MA10 | `GET /me/alerts` with a mess ask's push and a ping | the ask's `messId` = the mess's id; the ping's `messId` null |
| MA11 | a reminder's push, then Done; a mess ask, then That was me; a ping | the reminder's and the ask's lines leave my list, the ping stays; their `deliveries` rows unchanged (`dismissed_at` NULL) |
| MA-M | migration 0041 | §4.2zn's check |

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
| PATCH | `/me` | member | `{ displayName?, color?, showPublicHolidays?, showOptionsExpiration?, showWeather?, showMoon?, showSchool?, houseSpeakers?: string[] \| null, clock24h?: boolean, afterKind?: 'work' \| 'school' \| null, afterTime?: "HH:MM" \| null }` (§9.2a, §8.17, §8.5b) |
| GET | `/house/speakers` | member | → `{ speakers: { id, name, kind }[], mine, defaults }` asked of Home Assistant live; 503 `house_not_configured`; 502 `house_unreachable` (§9.2a) |
| GET | `/house/devices` | member | → `{ devices: { id, name, domain, roomId }[] }` asked of Home Assistant live; 503 `house_not_configured`; 502 `house_unreachable` (§9.2e) |
| POST | `/house/devices/{entity}` | member | `{ action: 'on' \| 'off' \| 'mode' \| 'target', mode?, target? }` → `Device` after one allowed service call; 404 not in a room; 400 / 503 / 502 (§9.2e) |
| GET | `/members` | member | → `{ id, email, displayName, color, role, isFounder, disabledAt, after: { kind, time } }[]` (no hashes; `email` only for owners; `after` §8.5b) |
| PATCH | `/members/{id}` | owner | `{ disabled?: boolean, role?: Role }` — rules in §6.3 |
| GET/POST | `/invites` | owner | GET → `{ id, displayName, createdAt, expiresAt, usedAt, usedBy, revokedAt }[]`; POST `{ displayName }` → `{ code, expiresAt }` (the code is shown only once; the PWA builds the link and QR from it) |
| DELETE | `/invites/{id}` | owner | revoke |
| GET | `/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | member | → `{ occurrences[], publicHolidays[], marketDays[], moonPhases[], schoolDays[], weather[] }` (each occurrence carries `emoji`, `private`, `masked`, and `hasNotes`: true only when it has notes and the member may open it, §8.4a; a private event the member may not open is masked to its date and times, titled Private, §6.3; `moonPhases` and `schoolDays` are `{ date, name, emoji }[]` for the range (§7.12, §7.13); `weather` is the stored forecast days in the range, §7.11); recurring events expanded server-side with `recurrence.ts`; alarms and sun-timed events (§7.7) excluded; **optional events only if on for this member (§7.5)**; public holidays filtered to days off; max range 120 days |
| GET | `/optional-events` | member | → `{ id, title, emoji, recurrence, startDate, on }[]` — every optional event, with this member's switch; a private one this member may not open titled Private with no emoji (§6.3) |
| PUT/DELETE | `/events/{id}/optin` | member | turn an optional event on / off **for me** → 204; 400 if the event isn't optional |
| POST | `/events` | member | event fields → event |
| POST | `/events/read-photo` | member | raw image body → `{ title, startDate, endDate, startTime, endTime, location, notes }` (each nullable); 503 / 502 / 422 / 429 per §7.8 |
| POST | `/notes/marks` | member | `{ text }` (1–`NOTE_MARKS_TEXT_MAX`, else 400) → 200 `{ via: 'sogoai', marks: [{ text, kind }] }` or `{ via: 'patterns', why, reason }` (`why` in `NOTE_MARKS_WHY`), never a 5xx for the home; a remembered answer (`note_marks`, by the text's SHA-256) answers without asking the home, and an answer with ≥ 1 mark is remembered; nothing counted (§8.4a) |
| POST | `/events/read-text` | member | `{ text }` → the same reading as read-photo; 400 / 503 / 502 / 422 / 429 per §7.9 |
| GET/PATCH/DELETE | `/events/{id}` | creator or owner for writes; GET only for who may open it, else 403 (§6.3) (GET includes `thingId`, §7C.2) | PATCH/DELETE close future scheduled fires (§5.6). A sun-timed event (§7.7) is 404 here and on `/exdates` |
| POST | `/events/{id}/exdates` | creator or owner | `{ date }` |
| GET/POST | `/timers` | member | → `Timer[]` / POST `{ title, intervalMin, channels, renotifyMin?, maxAlerts?, assignedTo?, activeFrom?, activeTo?, announceStart? }` → timer (201). `Timer = { id, title, intervalMin, channels, renotifyMin, maxAlerts, assignedTo, running, createdBy, activeFrom, activeTo, announceStart, openFire }`; `announceStart` (default false) needs a window, else 400 (§5.5a); `activeFrom`/`activeTo` are `"HH:MM"` or both `null` (no window). 400 `invalid_input` when only one is set, either is not `HH:MM`, or `timerWindowError` refuses them (§5.1) |
| PATCH/DELETE | `/timers/{id}` | creator or owner | PATCH: the POST fields, all optional, merged over the timer; `activeFrom: null, activeTo: null` clears the window. A PATCH never re-plans the open fire (rule 0 defers it when it comes due) |
| POST | `/timers/{id}/commands` | member | `{ cmd: TimerCmd }`; start plans the fire with `nextTimerDue` and the timer's window |
| GET | `/alarms` | member | → alarms: `{ id, title, time, days: Weekday[], channels, renotifyMin, assignedTo, createdBy, nextDueAt, ringing }` |
| POST | `/alarms` | member | `{ title, time: "HH:MM", days: Weekday[], channels, renotifyMin?, assignedTo? }` → alarm |
| PATCH/DELETE | `/alarms/{id}` | creator or owner | same fields as POST, all optional; closes future scheduled fires like an event edit |
| GET | `/reminders` | member | → open reminders (§8.5b), soonest first: `{ id, title, date, time, channels, renotifyMin, assignedTo, createdBy, state: 'due' \| 'ringing' \| 'missed', dueAt, window: { days: Weekday[], from, to } \| null }` (`dueAt` = the open fire's due time, else the reminder's own; a window's next ring, §8.5c) |
| POST | `/reminders` | member | `{ title, date, time: "HH:MM", channels, renotifyMin?, assignedTo? }` or `{ title, window: { days, from, to }, channels, assignedTo? }` (§8.5c) → reminder (201); 400 when not after now, or a bad window |
| PATCH/DELETE | `/reminders/{id}` | creator or owner | POST fields, all optional, merged; either shape (`window: null` back to a set time, §8.5c); re-plans like an alarm edit |
| POST | `/say/hear` | member | the raw recorded clip (audio/mp4, audio/webm, audio/ogg, audio/wav; ≤ 2 MB) → 200 `{ text }` (§8.18 part 2); nothing stored or logged; 400 wrong type / empty / too big, 502 couldn't write it down, 503 no AI binding |
| POST | `/say` | member | `{ text }` → 200, every reading with `heard, want, say, steps` (⚑ Q380), and: `{ kind: 'reminder', reminder }` / `{ kind: 'exists', where }` / `{ kind: 'request', request: { title, summary, size } }` / `{ kind: 'event', event: { title, date, time, assignedTo } }` / `{ kind: 'outside', where (or null), request: { title, summary, size } }` (§8.18, §1.3); nothing saved; 400 blank, 429 reads used up, 503 no key, 502 / 422 reading failed |
| GET/POST | `/feature-requests` | admin / member | → `FeatureRequest[]` newest first, last 30 days for done / dismissed: `{ id, text, title, summary, size, status, note, createdBy, createdAt }`; POST `{ text, title, summary, size, outside? }` → 201, status from size, or `outside` (§8.18, §1.3) |
| POST | `/feature-requests/{id}/ok` · `/dismiss` | founder · admin | → the request; `ok` only from `needs_john` → `new`; `dismiss` from `new` / `needs_john`; else 409 |
| POST | `/feature-requests/{id}/build` | admin | starts the build session now (§8.18 part 6, ⚑ Q344) → 202 `{ started: true }`; only from `new`, else 409; 503 `build_now_off` (not set up) / 502 `build_failed` (the fire was refused) |
| GET | `/fires?state=ringing` | member | → open fires with titles; every fire carries `startSun` (the event's `start_sun`, §7.7, else `null`); chore fires also carry `choreRunId`, `stepTitle` (only for chores with > 1 step) and `personId` (the current step's person); machine fires carry `machineId`, `title` = the machine's label ("Clothes washer") and `personId` = the load's owner (a cooking timer's fire: its label, §7D.8); every fire carries `awayBy` (§9.2c) |
| GET | `/machines` | member | → `Machine[]` in load order: `{ id, label, state: MachineState, ownerId, minutes, startedAt, doneAt, startedBy, next }` (`state` derived by the server, §7D.1; `next` = the next machine's id or null) |
| POST | `/machines/{id}/start` | member | `{ ownerId, minutes, alertId? }` (§7D.7) → `Machine[]`; 409 `busy` when not free (§7D.2) |
| POST | `/machines/{id}/move` | member | `{ minutes }` → `Machine[]`; 409 `busy` / `not_done` / `invalid_state` |
| POST | `/machines/{id}/finish` | member | Unload Clothes Dryer → `Machine[]`; 409 `not_done` / `invalid_state` |
| GET / PATCH | `/machines/hours` | GET member / PATCH owner | `MachineHours` `{ weekday, weekend }`, each `{ from, to }` or null → the saved hours; 400 `invalid_input` (§7D.5) |
| POST | `/machines/{id}/done` | member | Done now `{ ownerId?, alertId? }` (required when free) → `Machine[]`; 409 `busy` when already done, 400 `invalid_input` (§7D.2) |
| POST | `/machines/{id}/remind` | member | Still loaded → `Machine[]`; 409 `not_done` (§7D.2) |
| POST | `/machines/{id}/clear` | member | → `Machine[]`; 409 `already_free`. Every `/machines` write: 404 for an unknown machine, 400 `invalid_input`, 409 `conflict` when another tap changed the machine first |
| GET | `/cooking` | member | → `Cooking[]`, open timers oldest first: `{ id, kind, name, label, state: MachineState, minutes, startedAt, doneAt, alertId, startedBy }` (§7D.8) |
| POST | `/cooking` | member | Create `{ kind, name?, minutes, alertId? }` → 201 `Cooking[]`; 400 `invalid_input` |
| PATCH | `/cooking/{id}` | member | Edit `{ kind?, name?, minutes?, alertId? }` → `Cooking[]` |
| POST | `/cooking/{id}/off` · `/stop` · `/start` · `/close` | member | → `Cooking[]`; 409 `not_done` / `not_running` / `busy` / `conflict`; 404 for an unknown or closed timer (§7D.8) |
| GET | `/tasks` | member | → `{ active: Task \| null, recent: Task[] (my last 10 ended, newest first), defaults: { intervalMin, channels, private } }` (§7G). `Task = { id, title, state: 'working' \| 'break' \| 'paused' \| 'ended', limitMin, intervalMin, channels, private, doneLooks, startedAt, workedMin, elapsedMin, remainingMin, timeUp, breakUntil, checkins: { at, mood }[], openFire: { id, dueAt, state, alertCount } \| null, outcome, endedAt, doneTicked, summary }` |
| POST | `/tasks` | member | `{ title, limitMin?, intervalMin, doneLooks?, channels, private? }` → 201 `{ task, said }`; 400 `invalid_input`; 409 `busy` (§7G.1) |
| POST | `/tasks/{id}/checkin` | the task's member | `{ mood: TaskMood, breakMin? }` → `{ task, said }`; 409 `ended` |
| PATCH | `/tasks/{id}` | the task's member | `{ intervalMin?, nextInMin?, addMin?, quiet?: true }` → `{ task, said }` (§7G.5) |
| POST | `/tasks/{id}/pause` · `/resume` · `/stop` | the task's member | → `{ task, said }`; 409 `not_working` / `not_paused` / `ended` |
| POST | `/tasks/{id}/finish` | the task's member | `{ ticked?: number[] }` → `{ task, said }` (§7G.6) |
| POST | `/tasks/{id}/check-photo` | the task's member | raw image body → `{ lines: { text, looks: 'yes' \| 'no' \| 'unsure' }[], note }`; 400 with no list; 503 / 502 / 422 / 429 per §7C.4 |
| POST | `/tasks/{id}/again` | the task's member | a stopped session → 201 `{ task, said }`, a new session like it; 409 `busy` |
| POST | `/fires/{id}/actions` | member | `{ action: Action }` → fire (+ next); 409 on `invalid_action` | (409 on a task check-in: it is answered through `/tasks`, §7G.3)
| POST | `/fires/{id}/away` | member | "I'm away": → the fire with `awayBy`; its speakers stop, it stays open (§9.2c); 404; 409 `invalid_action` when closed |
| POST | `/push/subscriptions` | member | `PushSubscriptionJSON` + userAgent → `{ id }` (upserted by endpoint) |
| POST | `/push/test` | member | one test push to my subscriptions → `{ sent }`; 409 when I have none (§9.1) |
| DELETE | `/push/subscriptions/{id}` | owner of the subscription | |
| GET | `/push/vapid-key` | public | → `{ key }` |
| GET/PATCH | `/settings` | GET member / PATCH owner | GET → `{ householdName, timezone, daysOff }`; PATCH `{ householdName?, timezone?, daysOff?: HolidayKey[] }` |
| GET | `/status` | member | → `{ house: { state: HouseState, lastOkAt, lastFailedAt, lastError } (§9.2, derived, never stored), mySubscriptions[] (each with `id`, `endpoint`, `lastOkAt`, `lastError`), recentDeliveries[], myTask: { title, state: working \| break \| paused } \| null (my open task session, §8.5a Q309) }` |
| GET | `/me/alerts` | member | → `{ alerts: { id, title, message, source, kind, alertNumber, status, detail, createdAt }[] }` — my pushes not hidden, newest first, ≤ 200 (§9.5) |
| DELETE | `/me/alerts/{id}` | member (my push) | → 204, hidden from my list; 404 `not_found` otherwise (§9.5) |
| DELETE | `/me/alerts` | member | → `{ cleared }`, all of mine hidden (§9.5) |
| GET / PUT / DELETE | `/house/quiet` | member | GET → `{ until, byName }`; PUT `{ for: '1h' \| '2h' \| '4h' \| 'today' }` → the same; DELETE turns quiet off; 400 `invalid_input` (§9.2b) |
| POST | `/announce` | member | `{ text, channels: Channel[] }` → 201 `{ deliveries: { id, channel, memberId, status }[] }`; spoken (quiet or not, §9.2b) as "{my name} says: {text}" on every speaker and/or pushed to every member, me too, now (§9.3) |
| POST | `/ops/notify` | bearer `OPS_NOTIFY_TOKEN` (no session) | `{ text, title? }` → 201 `{ deliveries: [{ id, status, detail }] }`, one push to the founder's phone, now (§9.4); 503 `ops_notify_off` / 401 `unauthorized` / 400 `invalid_input` / 409 `no_recipients` (no founder yet) / 429 `rate_limited`, in that order |
| GET | `/ops/pings?after=` | bearer `OPS_NOTIFY_TOKEN` (no session) | → `{ pings: [{ id, channel, title, text, at }] }`, the founder pings and FunHouse alerts of the last hour after `after`, oldest first, for the FunHouse poller (§9.4a, §9.4b; listed `funhouse` rows become `sent`); 503 / 401 as `/ops/notify` |
| GET | `/ops/requests` | bearer `OPS_NOTIFY_TOKEN` | → `{ requests: FeatureRequest[] }`, the open ones (`new`, `needs_john`), oldest first (§8.18); 503 / 401 as `/ops/notify` |
| PATCH | `/ops/requests/{id}` | bearer `OPS_NOTIFY_TOKEN` | `{ status: 'done' \| 'dismissed', note? }` → the request; 404 / 400 / 409 (already closed) |
| GET | `/chores` | member | → `Chore[]`: `{ id, title, doneMeans, days, timing, time, sunOffsetMin, nudge, people, steps, channels, renotifyMin, createdBy, thisWeek, nextWeek, areaCount, roomId }` (`thisWeek`/`nextWeek` = member id or null; `areaCount` §7B.6) |
| POST | `/chores` | member | `{ title, doneMeans?, roomId?, days, timing, time, sunOffsetMin?, nudge?, people, steps, channels, renotifyMin? }` (`sunOffsetMin` null = clock time, §7B.3) → chore (201); 400 an unknown room (§7B.6) |
| PATCH/DELETE | `/chores/{id}` | creator or owner | same fields, all optional; re-plans unstarted runs (§7B.3); its room stays (§7B.6) |
| GET | `/chores/today` | member | → `{ date, runs: Run[] }`; `Run = { id, choreId, title, doneMeans, timing, time, sunOffsetMin, step, steps, assigneeId, personId, doneAt, doneBy, nextDueAt, ringing, areaCount }` (`personId` = the current step's person) |
| POST | `/chore-runs/{id}/done` | member | advances one step (§7B.3) → run; 409 `already_done` when finished |
| POST | `/chore-runs/{id}/undo` | member | → run; 409 `nothing_to_undo` at step 0 |
| GET/POST | `/places` | member | GET → `Place[]` by name; POST `{ name, address, notes?, words? }` → place (201); 400 at 100 places (§7.9b) |
| PATCH/DELETE | `/places/{id}` | the place's creator or an admin | PATCH (fields left out are kept) → place; DELETE → 204, events keep their address (§7.9b) |
| GET/POST | `/rooms` | GET member / POST owner | GET → `Room[]` by position; POST `{ name }` → room (201); 400 at 30 rooms (§7B.6) |
| PATCH/DELETE | `/rooms/{id}` | the room's creator or owner | PATCH `{ name }` → room; DELETE → 204 with its areas, photos and device rows, its chores' room cleared (§7B.6) |
| GET/PUT | `/rooms/{id}/devices` | GET member / PUT the room's creator or owner | GET → `{ devices: Device[] }` live from HA; PUT `{ devices: string[] }` (≤ 12, none in another room) → `{ devices }` (§9.2e) |
| GET/POST | `/rooms/{id}/areas` | GET member / POST the room's creator or owner | GET → `RoomArea[]` by position; POST `{ name, expectations? }` → area (201); 400 at 8 areas; 404 when the room is gone (§7B.6) |
| PATCH/DELETE | `/room-areas/{id}` | the room's creator or owner | PATCH `{ name?, expectations? }` → area; DELETE → 204 with its photos (§7B.6) |
| POST | `/room-areas/{id}/photos` | the room's creator or owner | the raw image → area (201); 400 at 4 photos or a bad image (§7B.6) |
| GET/DELETE | `/room-area-photos/{id}` | GET member / DELETE the room's creator or owner | GET → the image, `private, max-age=3600`; DELETE → 204 (§7B.6) |
| GET | `/messes` | member | → `{ messes: Mess[], balances: Balance[] }` — open and To talk about messes for everyone, owed ones for the pair and admins (§7B.7) |
| POST | `/messes?choreId=&note=` | member | the raw photo → `Mess` (201); the first ask to everyone else at once; 400 no or bad photo, a long note; 404 an unknown chore (§7B.7) |
| GET | `/messes/{id}/photo` | member | → the image, `private, max-age=3600`; 404 once deleted (§7B.7) |
| POST | `/messes/{id}/claim` \| `/deny` | member, not the reporter | → `Mess`; 409 `mess_settled` unless open or To talk about (§7B.7) |
| POST | `/messes/{id}/decide` | owner | `{ memberId: string \| null }` → `Mess`: whose it was, or nobody's (§7B.7) |
| POST | `/messes/{id}/settle` | the one owed, or owner | `{ how: 'paid' \| 'forgiven' }` → `Mess`; 409 unless owed (§7B.7) |
| DELETE | `/messes/{id}` | reporter while unanswered, or owner | → 204 (§7B.7) |
| GET | `/ious` | member | → `{ pairs: IouPair[] }`, the pairs I am in, every pair for an admin (§7B.9) |
| POST | `/ious` | member, one of the two or owner | `{ owedBy, owedTo, amount, note?, split?, offTab? }` → `{ pairs }` (201); 400 a bad amount, the same person twice, a long note (§7B.9) |
| POST | `/ious/{id}/ok` | the one who owes | → `IouPair`; 409 `iou_state` once OK'd or declined (§7B.9) |
| POST | `/ious/{id}/decline` | the one who owes | → `IouPair`; pushes the one who made it once; 409 `iou_state` when not waiting (§7B.9) |
| POST | `/ious/{id}/again` | the one who made it | → `IouPair`, waiting again; 409 `iou_state` when not declined (§7B.9) |
| DELETE | `/ious/{id}` | waiting or declined: who made it; OK'd: owner | → 204; 409 when payments already cover it (§7B.9) |
| POST | `/iou-payments` | member, one of the two or owner | `{ owedBy, owedTo, amount, how }` → `IouPair` (201); 409 more than is owed; 403 `let_go` by the one who owes (§7B.9) |
| POST | `/iou-payments/{id}/ok` | the one owed | → `IouPair`; 409 `iou_state` once OK'd or declined (§7B.9) |
| POST | `/iou-payments/{id}/decline` | the one owed | → `IouPair`; pushes the one who made it once; 409 `iou_state` when not waiting (§7B.9) |
| POST | `/iou-payments/{id}/again` | the one who made it | → `IouPair`, waiting again; 409 `iou_state` when not declined, `iou_too_much` past what is owed (§7B.9) |
| DELETE | `/iou-payments/{id}` | waiting or declined: who made it; OK'd: owner | → 204 (§7B.9) |
| POST | `/iou-plans` | member, one of the two or owner | `{ owedBy, owedTo, amount, every, startDate }` → `IouPair` (201); replaces that direction's live plan; 409 nothing owed (§7B.9) |
| DELETE | `/iou-plans/{id}` | one of the two, or owner | → 204, the plan ends (§7B.9) |
| GET | `/bounties` | member | → `{ bounties: Bounty[], waiting: Earning[], scores: Score[] }` (§7B.8) |
| POST | `/bounties` | owner | `{ title, note?, points }` → `Bounty` (201); pushes everyone else once (§7B.8) |
| POST | `/bounties/{id}/take` \| `/let-go` \| `/done` | member | → `Bounty`; 409 `bounty_state` on the wrong state (§7B.8) |
| DELETE | `/bounties/{id}` | owner | → 204; 409 once paid (§7B.8) |
| PUT | `/chores/{id}/bounty` | owner | `{ points: 1–10 \| null }` → `{ choreId, bounty }` (§7B.8) |
| POST | `/earnings/{id}/ok` \| `/not-yet` | owner | `{ memberId? }` → 204; 409 unless pending (§7B.8) |
| GET | `/things` | member | → `{ open: Thing[], closed: Thing[] }` (closed = done/dropped, last 60 days); `Thing = { id, title, note, place, address, phone, cost, url, windowStart, windowEnd, remindStart, remindOn, channels, hasPhoto, status, plannedEventId, plannedDate, createdBy, updatedAt }` |
| POST | `/things` | member | thing fields → thing (201) |
| GET/PATCH/DELETE | `/things/{id}` | GET member / writes creator or owner (§6.3) | GET → thing; PATCH fields, all optional, incl. `status` → thing; DELETE → 204 (and its photo) |
| POST | `/things/{id}/plan` | creator or owner | `{ date, time? }` → `{ thing, eventId }`; 400 outside the window |
| PUT/GET/DELETE | `/things/{id}/photo` | GET member / PUT, DELETE creator or owner | PUT raw image body (≤ 4 MB) → 204; GET → the image; DELETE → 204 |
| POST | `/things/read-photo` | member | raw image body → `{ title, startDate, endDate, place, address, phone, cost, url, note }` (each nullable); 503 / 502 / 422 / 429 per §7C.4 |
| GET | `/shows` | member | → `{ want: Show[], watched: Show[] }` (want newest added first, watched newest watched first); `Show = { id, title, kind, year, rtCritics, rtAudience, watch: { how, where, note }[], summary, note, url, checkedAt, status, watchedAt, watchedBy, createdBy, createdAt, updatedAt }` (§7F) |
| POST | `/shows` | member | `{ title, kind?, year?, rtCritics?, rtAudience?, watch?, summary?, note?, url?, checkedAt? }` → show (201); 400 `invalid_input`; 409 `duplicate` (+ `showId`) |
| GET/PATCH/DELETE | `/shows/{id}` | GET member / writes creator or owner, except a PATCH of only `status` (any member, §6.3) | GET → show; PATCH the POST fields, all optional, merged, plus `status: 'want' \| 'watched'` → show; 409 `duplicate`; DELETE → 204 (soft); 404 when gone |
| POST | `/shows/look-up` | member | `{ title, year?, kind? }` or `{ url }` → `ShowReading` (§7F.2); nothing stored; 400 / 429 / 503 `show_lookup_off` / 422 `show_refused` / 502 `show_lookup_failed` |
| POST | `/shows/look-up-photo` | member | raw image body → `ShowReading`; the picture is never stored; errors as look-up |
| POST | `/things/read-link` | member | `{ url }` → the same reading as read-photo; nothing stored; 400 / 429 / 503 `link_reading_off` / 422 `link_refused` / 502 `link_reading_failed` per §7C.4b |
| GET | `/recipes/{id}/photo` | member | → the recipe's picture (§7E.2b ⚑ Q174), private cache; 404 when none or the recipe is gone |
| PUT/DELETE | `/recipes/{id}/photo` | creator or owner | PUT a raw photo body (`photoBody`, as a thing's) → 204, replacing (and deleting) the old one; DELETE → 204; each bumps `updatedAt`; 400 a bad type or size; 404 when the recipe is gone (⚑ Q175) |
| GET | `/recipes` | member | → `Recipe[]`, newest first; `Recipe = { id, title, videoId, videoTitle, channel, link, hasPhoto, watchUrl, thumbnailUrl, ingredients: string[], steps: string[], servings, time, found, source: RecipeSource[], captionsError, commentsError, createdBy, createdAt, updatedAt, emojis: RecipeEmoji[] }` (`watchUrl` / `thumbnailUrl` derived from `videoId`, null when typed or a link; `link` the page a link recipe was read from, §7E.6; `RecipeEmoji = { memberId, emoji }`, §7E.5) (§7E) |
| POST | `/recipes` | member | `{ title, ingredients, steps, servings?, time? }` → recipe (201), typed by hand; 400 `invalid_input` |
| GET/PATCH/DELETE | `/recipes/{id}` | GET member / writes creator or owner (§6.3) | GET → recipe; PATCH the POST fields, all optional, merged → recipe (found recomputed); DELETE → 204 (soft); 404 when gone |
| PUT/DELETE | `/recipes/{id}/emoji` | member (their own) | PUT `{ emoji }` → recipe (200), my emoji set (upsert); DELETE → recipe (200), mine cleared; 400 `invalid_input` (`emojiError`); 404 when the recipe is gone; `updatedAt` untouched (§7E.5) |
| POST | `/recipes/from-link` | member | `{ url }` → recipe (201): any link, its kind detected (§7E.6); a YouTube video as from-video; a page: 400 / 409 `duplicate` (+ `recipeId`) / 429 / 503 `recipe_reading_off` / 422 `recipe_refused` / 502 `recipe_reading_failed`, in the §7E.6 order |
| POST | `/recipes/from-video` | member | the same handler as from-link (kept for older apps). For a video: `{ url }` → recipe (201); 400 / 409 `duplicate` (+ `recipeId`) / 429 / 503 `recipe_reading_off` / 404 `video_unavailable` / 502 `youtube_failed` / 422 `recipe_refused` / 502 `recipe_reading_failed`, in the §7E.2 order |
| POST | `/recipes/{id}/transcript` | creator or owner | `{ screenshots?: { type, data }[] (≤ 4, base64), text? (≤ PASTED_MAX) }`, at least one → recipe (200), re-read from the pasted transcript; 404 / 400 `invalid_input` / 429 / 503 `recipe_reading_off` / 404 `video_unavailable` / 502 `youtube_failed` / 422 `recipe_refused` / 502 `recipe_reading_failed` / 422 `no_recipe` (nothing changed), in the §7E.2b order |
| GET | `/lists` | member | → `{ id, name, emoji, createdBy, daily, pingOwners, openCount }[]`, by name (§7A); `emoji` null = the default; an every day list counts today's ticks only (§7A.4) |
| POST | `/lists` | member | `{ name, emoji? }` → list (201); 409 `duplicate`; 400 at `LISTS_MAX` or a bad emoji |
| PATCH/DELETE | `/lists/{id}` | creator or admin (seeded lists: admin) | PATCH `{ name, emoji?, daily?: boolean, pingOwners?: boolean }` (absent = unchanged, emoji null = the default) → list; DELETE → 204 (and its items' photos, §7A.3) |
| GET | `/lists/{id}` | member | → `{ list: { id, name, emoji, createdBy, daily, pingOwners }, open: Item[], checked: Item[] }` (§7A.1, §7A.4); `Item = { id, listId, text, note, assigneeId, time, createdBy, createdAt, checkedAt, checkedBy, hasPhoto, updatedAt }` |
| POST | `/lists/{id}/items` | member | `{ text, note?, assigneeId?, time? }` → `{ item, result: "added" \| "existing" \| "reopened" }`, 201 when added, else 200 |
| PATCH | `/list-items/{id}` | creator or owner, except a PATCH of only `checked` (any member, §6.3) | `{ text?, note?, assigneeId?, time?: "HH:MM" \| null, checked?: boolean }` → item; 409 `duplicate` on a key clash |
| DELETE | `/list-items/{id}` | creator or owner | → 204 (and its photo, §7A.3) |
| POST | `/list-items/read-photo` | member | raw image body → `{ name, via: "sogoai" \| "claude" }` (`ItemReading`); nothing stored; 400 / 429 / 503 `photo_reading_off` / 422 `photo_refused` / 502 `photo_reading_failed` / 422 `item_unknown`, in the §7A.3 order |
| PUT/GET/DELETE | `/list-items/{id}/photo` | GET member / PUT, DELETE creator or owner | PUT raw image body (≤ 4 MB) → 204 (replaces); GET → the image (`private, max-age=3600`); DELETE → 204; 404 when the item is gone, and GET also when it has no photo (§7A.3) |
| POST | `/share` | **Bearer my Send to Enso key**, no cookie | form / multipart fields, JSON `{ url?, text? }`, `text/*` or a raw image → **201** `{ saved, items: [{ id, kind }], message }`; 401 `unauthorized` / 400 `nothing_shared` / 400 `invalid_input` / 429 `rate_limited` (§7H.2) |
| GET/POST/DELETE | `/share/key` | member (mine) | GET → `{ on, createdAt }`; POST → **201** `{ key, createdAt }`, replacing any old key; DELETE → 204 (§7H.1) |
| GET | `/inbox` | member (mine) | → `{ items: [{ id, kind, url, text, hasPhoto, createdAt }] }`, newest first, ≤ 200 (§7H.3) |
| DELETE | `/inbox/{id}` | member (mine) | → 204, and its photo; 404 not mine or gone (§7H.3) |
| GET | `/inbox/{id}/photo` | member (mine) | → the image (`private, max-age=3600`); 404 not mine or no photo (§7H.3) |
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
| `predeploy` | `tsx scripts/predeploy.ts` — npm runs it before `deploy`. **Deploy refuses while a migration is pending** (MojoSOGO 2026-10-15, "GRD", after v1.77.0 went live without migration 0050 and no alert went out all day): it runs `wrangler d1 migrations list enso --remote` and lets the deploy go only when that says "No migrations to apply". Anything else (a pending list, an error, text it doesn't know) refuses, names the pending files and says to run `npm run db:migrate:remote` first. A dropping migration that must go after the deploy skips the gate on purpose: `npm run build`, then `npx wrangler deploy`. |
| `deploy` | `npm run build && wrangler deploy` |
| `arch:audit` | `tsx scripts/arch-audit.ts` — size vs cap for every source file, warning band marked (§2.5) |

**Acceptance (DG — each row is a test of `deployGate` in `scripts/pending-migrations.ts`):** DG1 wrangler's "✅ No migrations to apply!" → clear. DG2 a listing that names `0051_timer_away_day.sql` → refuse, and the message names it and `npm run db:migrate:remote`. DG3 an error text, or empty text → refuse.

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

## 11. Milestones — in `docs/history.md`

The build order M0–M4x and each milestone's acceptance checks are history now; they live in
[`docs/history.md`](docs/history.md) §11. New work carries its acceptance checks in its own section.

---

## 12. Later (explicitly out of v1 — do not build or stub)

Captured from v1.0-draft so nothing is lost:

- Capacitor native apps / FCM / APNs
- Real-time WebSockets (would need Durable Objects)
- Offline **editing** and conflict resolution. v1 offline = the cached app shell;
  actions need network, and buttons show disabled "offline".
- Queued offline acks
- Photos anywhere other than Things to do (§7C.3), list items (§7A.3), a room's areas (§7B.6), a mess
  report (§7B.7, kept at most 30 days), a bounty's picture and done photo (§7B.8, kept until paid or dropped) and a recipe's picture
  (§7E.2b, §8.12), and a photo sent to my Inbox (§7H.2, kept until cleared), the only eight attachments. A picture a show is looked up from (§7F.2) is read once and never stored, so it is not one. A recipe's video
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
- Chore points, streaks or rewards — except the one point owed for a mess (§7B.7, decided by MojoSOGO 2026-10-05) and
  bounty points with their score (§7B.8, decided by MojoSOGO 2026-10-11)
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

### 12.5 Bounties — follow-ups (suggested 2026-10-11, not built, need MojoSOGO's word)

- A chore bounty only for the person whose turn it is ("doing your turn earns").
- Members suggesting a bounty for an admin to price; paying a mess point with bounty points; streaks.
- A push to the reporter when someone claims their mess.
- Mess sizes worth more than one point.

### 12.6 Task buddy — follow-ups (suggested 2026-10-19, not built, need MojoSOGO's word)

- Focus Sprint recovery: after repeated distracted / struggling answers, a real 5-minute sprint with its own check-in that celebrates the effort.
- History answers: "How much time did I spend cleaning today?", "How many tasks did I finish this week?".
- Answering a check-in by voice on a speaker (a Home Assistant Assist intent into Enso), and spoken replies.
- An encouragement style (calm, upbeat, playful, coach-like) and a settings page for the defaults.

### 12.7 Send to Enso — follow-ups (suggested 2026-10-19, not built, need MojoSOGO's word)

- Turn an Inbox item into a ✅ to-do (Fill in from this link, §7C.4b), a 🍳 recipe (§7E.6), an 📅 event (§7.9) or a
  list item, with one tap.
- Do that by itself as it arrives (a recipe link becomes a recipe), with a push saying what it made.
- Share to someone else's Inbox, or to a household Inbox.

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

## 13. Decisions and open questions — in `docs/decisions.md`

Every Q-numbered question, MojoSOGO's answer, and every ⚑ DEFAULT awaiting it live in
[`docs/decisions.md`](docs/decisions.md). A new ⚑ default gets the next Q number there; this spec
names it where it applies ("⚑ Q221").

---

## 14. Status and deviations — in `docs/history.md`

What is built, what was built differently from this spec, and what is still owed live in
[`docs/history.md`](docs/history.md) §14, kept apart so a session reads the behavior here without the
build log. `docs/where-things-stand.md` keeps the short list of what is owed now.

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
