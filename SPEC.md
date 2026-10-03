# Ensō — Specification v2

**Version:** 2.11-draft · **Date:** 2026-10-03 · **Owner:** MojoSOGO
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
   server, frontend, relay, tests. Never type one of those strings as a literal
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
8. **A fallback must be visible.** A failed push, an offline relay, an unknown value
   renders as an honest marker ("House announcements offline since 14:02"), never
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
| **Chore** | A job on chosen days, **rotating** weekly between people, either *at* a time (rings) or *by* a time (quiet). It can be a **loop** of steps that hand off. | **Alarms** tab (set up) · **Lists → Today** (tick off) | "Laundry": start the washer → move to dryer (60 min later) → fold & put away |
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
- **No shaming.** Nothing overdue is shown in red to the household at large.
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
  |            |                                 |
  |           D1 (SQLite)                        |
  +---------------------------------------------+
            ^
            |  HTTPS poll every 10 s (bearer RELAY_TOKEN)
            |
  +---------------------------+        LAN        +-------------------------+
  |  LAN relay (home PC)       | ----------------> |  Home Assistant          |
  |  relay/relay.ts (tsx)      |   REST + token    |  http://192.168.0.123:8123|
  +---------------------------+                    |  -> 4 Echos, Voice PE    |
                                                   +-------------------------+
```

**Why a relay:** Home Assistant is only on the LAN (`external_url` is null, no
Nabu Casa). A Cloudflare Worker cannot reach it, and HA cannot usefully call the
Worker. So a small process on the home PC **pulls** pending house announcements
from the Worker and speaks them through HA. This is the same pattern AskRoxy uses.

### 2.1 Stack

| Part | Choice | Notes |
|------|--------|-------|
| Backend | Cloudflare Worker + **Hono** + **D1** | One Worker serves API, assets and cron |
| Frontend | **React + TypeScript + Vite**, `vite-plugin-pwa` | No state library in v1; plain `fetch` + hooks |
| Styling | CSS Modules + CSS custom properties | Follow `C:\Users\Public\git\MOJOSOGO-PREFERENCES.md` and the `phone-ui` skill |
| Push | Web Push (VAPID) from the Worker | Must use a WebCrypto-based implementation — the Node `web-push` package does not run on Workers. M5 begins with a spike to confirm the library. |
| Relay | Node 20+ script run with `tsx` | No framework. Imports `src/shared/vocab.ts`. |
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
│   └── 0005_lists.sql      # §4.2d
├── src/
│   ├── shared/             # pure TS, no I/O — imported by worker, frontend, relay
│   │   ├── vocab.ts        # §3
│   │   ├── time.ts         # local wall time <-> UTC, per IANA zone
│   │   ├── recurrence.ts   # §4.3
│   │   ├── holidays.ts     # §7.3
│   │   ├── markets.ts      # §7.4
│   │   ├── lists.ts        # §7A.1 item rules: itemKey, add/reopen decision, limits, 30-day window
│   │   └── engine.ts       # §5
│   └── worker/
│       ├── index.ts        # Hono app + scheduled() handler
│       ├── env.ts          # bindings + secrets type
│       ├── db.ts           # small D1 helpers
│       ├── http.ts         # error envelope (§10), input checks
│       ├── routes/         # auth.ts (setup, login, signup, /me) · members.ts (members,
│       │                   # invites) · events.ts (/calendar, events) · alarms.ts ·
│       │                   # alerts.ts (timers, fires + actions) · household.ts (settings,
│       │                   # days off, school holidays, push subscriptions, /status) · relay.ts ·
│       │                   # lists.ts (§7A)
│       ├── tick.ts         # loads rows, calls engine, writes results
│       ├── push.ts         # Web Push sending
│       └── session.ts      # password hashing, session cookie
├── frontend/               # Vite root
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
├── relay/
│   ├── relay.ts
│   ├── classify.ts         # classifyResult (§9.2), imported by the contract test
│   ├── relay-task.vbs      # logon launcher (§9.2 "Running it")
│   └── relay.config.example.json
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
| Relay | points at `http://localhost:8787` | points at the production URL |
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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Worker | Web Push |
| `RELAY_TOKEN` | Worker + relay | Authenticates the relay |
| HA token | relay only | Read from `C:\Users\Public\git\HomeAssistant\secrets\ha_token.txt` at startup. Never sent to the Worker, never logged. |

Dev secrets go in `.dev.vars` (gitignored); production uses `wrangler secret put`.

### 2.5 Architecture guard

Source files are everything under `src/`, `frontend/src/`, `relay/` and `scripts/`
ending in `.ts`, `.tsx`, `.mjs` or `.css`, found on disk (never listed by hand).
`vitest.config.ts` scans them with `scripts/arch.ts` and hands the result to
`test/architecture.test.ts`, which fails when:

- a source file has no row (exact path or `*` pattern) in `docs/module-ownership.md`,
  or a row names nothing on disk;
- an import crosses a layering ban (`LAYERS` in `scripts/arch.ts`): `src/shared/`
  imports only its own siblings (no packages, no I/O); the worker, the frontend and
  the relay never import each other; nothing imports `scripts/`;
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
export const ALERT_KIND   = ['reminder', 'timer', 'chore'] as const;
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
export const RELAY_REPORT_STATUS = ['sent', 'partial', 'failed'] as const;    // what /relay/report accepts (§9.2)

export type Channel = typeof CHANNEL[number];   // ...and so on for each
```

| Term | Meaning |
|------|---------|
| `push` | Web Push to the phone(s) of the recipients (§5.4) |
| `house` | Spoken on **all four Echos and the Voice PE** via the relay. One announcement per alert, not per person. |
| `scheduled` | Fire exists, due in the future (or snoozed) |
| `ringing` | Due time passed, alert sent, waiting for a human |
| `closed` | Finished; `close_reason` says why |
| `done` | Someone tapped Done on a reminder |
| `acked` | Someone tapped Ack on a timer (the timer restarts) |
| `missed` | A reminder was more than 60 min overdue when the engine first saw it (outage) — closed without alerting |
| `chore` | A fire for one step of one chore run (§7B) |
| `at` | Chore rings at its time, like an alarm |
| `by` | Chore is quiet: due by its time, optionally one nudge then |
| `superseded` | A newer occurrence of the same event started ringing while this one still was |
| `stopped` | The timer was stopped |
| `removed` | The event or timer was edited or deleted, making this fire obsolete |
| `partial` | House delivery reached some surfaces but not all |

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
  relay_last_seen TEXT                        -- UTC ISO; updated on every relay claim
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

A schema change is always a **new** numbered migration plus a §4.2x section here.
An applied migration is never edited.

### 4.3 Recurrence (subset of RFC 5545 RRULE, as JSON)

```ts
interface Recurrence {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;          // default 1; "every 2 weeks" = WEEKLY, interval 2
  byDay?: ('SU'|'MO'|'TU'|'WE'|'TH'|'FR'|'SA')[];   // WEEKLY: days; MONTHLY: exactly one day, with setPos
  setPos?: 1 | 2 | 3 | 4 | -1;  // MONTHLY only: the nth byDay of the month (-1 = last) — RRULE "BYDAY=3FR"
  until?: string;             // local YYYY-MM-DD, inclusive
  count?: number;             // total occurrences; not together with until
}
```

- All expansion happens on **local dates**, then each occurrence is converted to
  UTC with `localToUtc`.
- `MONTHLY` with `byDay` + `setPos` repeats on the nth weekday of the month
  ("3rd Friday" = `{"freq":"MONTHLY","byDay":["FR"],"setPos":3}`; `-1` = last).
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
  last Friday from 2026-10-30 → 2026-10-30, 2026-11-27, 2026-12-25.

---

## 5. Alert engine — `src/shared/engine.ts` (pure)

### 5.1 Functions

```ts
// Which reminder fires should exist in [from, to)? Returns candidates; tick() inserts
// them with INSERT OR IGNORE (the unique index makes this idempotent).
planReminderFires(event: EventRow, tz: string, fromUtc: string, toUtc: string): NewFire[]

// Advance one open fire to `now`. Returns the new fire row and any alerts to send.
stepFire(fire: FireRow, cfg: AlertConfig, now: string): { fire: FireRow; alert: boolean }

// A human acted on a fire. Returns the updated fire, plus the next fire for timers.
applyAction(fire: FireRow, action: Action, cfg: AlertConfig, memberId: string, now: string):
  { fire: FireRow; next?: NewFire } | { error: 'invalid_action' }

// Timer start/stop.
applyTimerCmd(timer: TimerRow, openFire: FireRow | null, cmd: TimerCmd, intervalMin: number, memberId: string, now: string):
  { timer: TimerRow; closeFire?: FireRow; newFire?: NewFire }
```

`AlertConfig` = `{ channels, renotifyMin, maxAlerts, intervalMin? }`, taken from
the event or timer row.

### 5.2 Constants

```ts
export const MATERIALIZE_AHEAD_H = 36;   // reminder fires are created this far ahead
export const MISSED_AFTER_MIN   = 60;    // reminders overdue by more than this close as 'missed'
export const SNOOZE_MIN         = 10;    // ⚑ DEFAULT
```

### 5.3 `stepFire` rules (evaluated in order; first match wins)

| # | Fire state | Condition | Result |
|---|------------|-----------|--------|
| 1 | `scheduled` | `now < due_at` | no change |
| 2 | `scheduled`, kind `reminder` | `now − due_at > MISSED_AFTER_MIN` (strictly — exactly 60 min still rings) | `closed`, reason `missed`, **no alert** |
| 3 | `scheduled` | `now ≥ due_at` | `ringing`, `alert_count = 1`, `last_alerted_at = now`, **alert** |
| 4 | `ringing` | `renotifyMin` set, `alert_count < maxAlerts`, `now ≥ last_alerted_at + renotifyMin` | `alert_count + 1`, `last_alerted_at = now`, **alert** |
| 5 | anything else | — | no change |

Timers and chores are never `missed`. An overdue timer or chore still rings, even
after an outage — a chore does not stop needing doing.

After `maxAlerts` a fire stays `ringing` **silently**. It remains visible in the
app's Ringing bar (§8.2) until someone acts.

### 5.4 `applyAction` rules

| Action | Valid on | Result |
|--------|----------|--------|
| `done` | reminder, `ringing` | `closed`, reason `done`, `closed_by` |
| `snooze` | reminder, `ringing` | `scheduled`, `due_at = now + SNOOZE_MIN`, `alert_count = 0` |
| `done` | chore, `ringing` | advances the run one step (§7B.3) — the route calls `advanceRun`; the fire closes `done` |
| `ack` | timer, `ringing` **or** `scheduled` | `closed`, reason `acked`; **next** = new timer fire `due_at = now + intervalMin` |
| anything else | — | `{ error: 'invalid_action' }` → HTTP 409 |

Any member may act on any fire. ⚑ DEFAULT

### 5.5 `applyTimerCmd` rules

| Cmd | Timer | Result |
|-----|-------|--------|
| `start` | not running | `running = 1`; new fire `due_at = now + intervalMin` |
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
4. Use a D1 `batch()` per fire for the writes. D1 has no `BEGIN`/`COMMIT`.

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
  - from the second alert on, append `" (alert {n})"`

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
| Invites, disable members, household settings, school holidays | ✓ | ✗ |
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

### 7.2 Holidays

| Type | Source | Treatment |
|------|--------|-----------|
| Public (days off) | Computed in `src/shared/holidays.ts`, filtered to the household's **days off** (§7.3) — no hand-typed yearly dates | **Whole cell tinted faint yellow** (`--holiday-public-cell`) + the holiday's **emoji next to the date number**; name in the day sheet |
| School | `school_holidays` table, edited by the owner in Settings → School holidays (add a single date or a date range + label) | Blue (`--holiday-school`) date number + circle + 🏫 next to it; label in the day sheet |

- **Legend:** shown once, directly under the sticky month header: a yellow square
  (`--holiday-public-swatch`) "Public holiday", a blue dot "School holiday", and
  "📈 Options expiration" (§7.4). Each entry shows only while that type is switched
  on for the member.
- **Toggles:** each member can hide either type (`member_prefs`).
- **Both on one day:** the cell is yellow *and* the date has the blue circle; the day
  sheet lists both.

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
- **Any member may create a list.** **Rename or delete:** its creator or an admin; the two
  seeded lists (no creator): admins only. ⚑ DEFAULT
- **Delete** is a soft delete. Its items go with it: they are no longer reachable
  (`GET` → 404, item calls → 404). The name becomes free again.

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
- **Delete** is a soft delete. Adding the same text later creates a new item.
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
| L20 | migration check (§4.2f) | items on the old `shopping`/`wishlist` lists, and wish-list owners, are on `lst_shopping`/`lst_wishlist` with the same assignee |

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
| ■ Public holiday  ● School holiday  |  <- legend
|  S   M   T   W   T   F   S          |
|  ...continuous weeks...             |
+-------------------------------------+
| 📅 Calendar ⏰ Alarms 🛒 Lists ⚙ Settings |  <- bottom tab bar
+-------------------------------------+
```

- The **＋** floating button appears on Calendar only and creates an event. The
  Alarms tab has its own **＋ Add** button in each section header.
- **Status badges:**
  - A **red badge** "House offline" appears in the header when `relay_last_seen`
    is more than 2 min old.
  - A **red badge** "Phone alerts off" appears when the current member has no push
    subscription.
  - Tapping either explains it and how to fix it.

### 8.2 Ringing bar

A stack at the top of every screen, one row per `ringing` fire, newest first:

- Reminder row: `🔔 Take out trash · 19:00` with **[Snooze 10m] [Done]**
- Timer row: `⏱ Check on the dog · ringing 45 min` with **[Ack]**
- Chore row: `🧹 Laundry — Move to dryer · Sam` with **[Done]** (no snooze)
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
  Yearly, plus an optional end date
- Assigned to (member chips, none = everyone)
- **Reminder:**
  - None / At start / 5 / 15 / 30 / 60 min before / 1 day before
  - Channels: ☐ Phone ☐ House
  - Repeat alert every: Off / 5 / 10 / 15 / 30 min

Actions:

- **Save / Cancel**
- Delete (owner or creator)
- For a repeating event: **Delete this occurrence** (adds to `exdates`) and
  **Delete series**

### 8.5 Alarms screen

Two sections, each a single-line list (per the table rules), each with a **＋ Add**
button in its header.

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

**Rolling timers** — as before: `⏱ Check on the dog · every 60 min · next 14:45`, a
status badge (running / ringing / stopped) and **[Start]/[Stop]**; tapping a row
opens the timer form (title, interval 1–1440 min, channels, repeat alert every,
assigned to, Delete).

**Chores** — the third section, with its own **＋ Add**. One line per chore, sorted
by time:

```
Time      Chore            Days        This week
07:30 at  🧺 Laundry ³     Mon Thu     Sam
19:00 by  🗑 Trash          Tue         Kai → Sam
```

- `at`/`by` after the time; a superscript step count when there is more than one step.
- **This week** = whose turn it is now; when people take turns, `→` the next person.
- Tapping a row opens the **chore form** (modal):
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
    Save / Cancel / Delete (creator or owner, like alarms).

### 8.6 Settings

- **Me:** name, color, enable phone alerts (subscribe), show/hide holiday types,
  show/hide 📈 options expiration (§7.4), log out.
- **Household (admins):** name, timezone, days off (§7.3), **invites (§8.9)**, members list:
  one line per member — name · **Owner** / **Admin** chip (nothing for a regular member) ·
  **Make admin** / **Remove admin** (asks first; never on the founder) · **Disable** /
  **Enable** (never on the founder). An admin removing their own admin role is warned
  that they will lose these settings at once.
- **School holidays (admins).**
- **Status:** relay last seen, the current member's push subscriptions with last
  success/error, and the last 20 deliveries with their status badge.

### 8.8 Lists screen

The **🛒 Lists** tab. At the top, a **list picker** — a native `<select>` labelled
"List" (the phone's own picker, not a row of buttons):

```
List [ Shopping (3)          ▾ ] [⋯]
      Today — chores
      Shopping (3)
      Wish list (5)
      Hardware store (1)
      ＋ New list…
```

- Options: **Today — chores** first, then every list by name with its open-item count,
  then **＋ New list…**. Choosing **＋ New list…** opens the **new list** form (name,
  Create; errors inside the dialog); after creating, the picker switches to it.
- **⋯** (accessible name "List options") next to the picker opens **Rename** / **Delete
  list** for the chosen list, shown only to those allowed (§7A.1) and never for Today.
  Delete asks first and says how many open items go with it.
- The choice is remembered per device (by list id), written only when someone picks. If
  the remembered list no longer exists — including the old toggle's `shopping`/`wishlist`
  values — the picker shows **Shopping** (or the first list, if Shopping was deleted).
- Errors: a missing list is 404 "That list no longer exists."; a refused rename/delete is
  403 naming who may ("Only the person who made this list or an admin…", or "Only an
  admin…" for a seeded list). A list's name is trimmed before its length is checked. The list refetches when the tab opens, on focus, and
every 30 s while visible (§10 Freshness).

**Today** (chores, §7B) — a switch **Mine | Everyone** (default Mine; remembered):

```
☐ Laundry — 2/3 Move to dryer     rings 08:40   Sam
   Lint filter cleaned, nothing left in the drum
☐ Trash                           by 19:00      Kai
   Bins at the curb, lids shut
▸ Done today (2)
```

- One row per run of today; **Mine** = runs whose current step is mine (or whose turn
  it is, when the step has no person of its own). Sorted by time.
- Row: title, then `— n/m step title` for multi-step chores; when: `at 07:30`,
  `by 19:00`, `rings 08:40` (a pending wait) or a red `ringing` badge; the person's
  chip. **Done means** is the dim second line.
- Tapping the row marks the **current step** done (≥ 44 px). A ↶ button (accessible
  name "Undo last step of Laundry") appears on runs that have a step done.
- **Done today** is collapsed by default; its rows show who finished (`doneBy`), are
  not tappable (another Done would only be refused), and keep ↶ to undo the last step.
- Nobody's turn shows as **anyone**.
- Nothing from earlier days, nothing red except `ringing` (§1.0).

**Any list** (all alike — Q24):

```
[ Add to Shopping…              ][ Add ]
☐ Milk                       Kai      ✎
☐ Dish soap                           ✎
☐ Paint the fence     📝     Shelly   ✎
▸ Done (12)
```

- The add box is at the **top**, always visible, its placeholder naming the list. Enter or
  **Add** adds the item, clears the box, and keeps focus, so several items go in one after
  another.
- Adding something already open says so under the box in plain text (“Milk is already
  on the list”) — a fact, not an error. Re-opening says “Milk is back on the list”.
  The note clears on the next typing, tick or edit.
- Open items: most recently added or changed first (so a re-added item comes back to
  the top), one line each. **Tapping the row ticks it** (≥ 44 px); a ticked item leaves
  the open list straight away. The row shows 📝 when there is a note and the
  **assignee's chip** when there is one (the chip truncates; the row stays one line).
- **✎** on each row (accessible name "Edit Milk") opens the **item form** (modal): text,
  note (multi-line), **Assigned to** (member chips, single choice, plus **Nobody**), Save /
  Cancel / **Delete** (asks first). The old ✕ quick-remove is gone: ticking is the quick
  action, and deleting lives in the form. ⚑
- The item form has no Mark done / Not done: ticking is the row's tap, everywhere.
- **Done** is collapsed by default and dim, newest first. Tapping a done row puts it back
  on the list; its ✎ still opens the form. A done row shows who ticked it and when (in
  place of the assignee chip, so it stays one line):
  weekday within the last 6 days (“Sat · Shelly”), else the date (“Sep 12 · Shelly”).
- No due dates and no reminders on any list.

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
  ⏰ Alarms — alarms, timers and chores
  🛒 Lists → Today — your chores for today
            [ Got it ]
```

### 8.7 Theme

Dark by default. Colors are defined as tokens on `:root`:

| Token | Value |
|-------|-------|
| `--bg` | `#0F172A` |
| `--surface` | `#1E293B` |
| `--border` | `#334155` |
| `--text` | `#F8FAFC` |
| `--text-dim` | `#94A3B8` |
| `--accent` | `#6366F1` (indigo — kept apart from school-holiday blue ⚑) |
| `--month-a` | `#0F172A` |
| `--month-b` | `#162033` |
| `--holiday-public-cell` | `rgba(250, 204, 21, .16)` — a faint yellow tint over the dark cell, the same 16% strength as a multi-day event's tint; normal light text |
| `--holiday-public-swatch` | `#FACC15` — the legend's public-holiday square |
| `--holiday-school` | `#3B82F6` |

---

## 9. Delivery

### 9.1 Web Push

- **Subscribe:** in Settings → Me, the button calls
  `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then
  `POST /api/v1/push/subscriptions`.
- **Payload** (JSON, encrypted aes128gcm):
  `{ fireId, kind, title, body, actions }`.
- **The service worker's `push` handler** calls `showNotification` with
  `tag: fireId` (a re-alert replaces the old notification rather than stacking)
  and `requireInteraction: true`. Actions:
  - reminder: `[{action:'done'}, {action:'snooze'}]`
  - timer: `[{action:'ack'}]`
  - chore: `[{action:'done'}]`
- **`notificationclick`:**
  - With an action, the handler `POST`s `/api/v1/fires/{id}/actions` with the
    session cookie (same origin) and closes the notification.
  - Without one, it focuses or opens the app.
- **iPhone:** home-screen web apps show no action buttons. Tapping the
  notification opens the app, where the Ringing bar has the buttons. This is
  expected, not a bug.
- **Send results:**
  - HTTP 404/410 → delete the subscription.
  - Any other failure → delivery `failed` with the status code + body in `detail`,
    and the subscription's `last_error` set.
  - A recipient with **no** subscriptions → delivery `failed`, detail
    `no_subscription`. Never skip silently.

### 9.2 LAN relay — `relay/relay.ts`

**Config** (`relay/relay.config.json`, gitignored; example checked in):

```json
{
  "serverUrl": "https://<app-domain>",
  "relayToken": "…",
  "haUrl": "http://192.168.0.123:8123",
  "haTokenPath": "C:\\Users\\Public\\git\\HomeAssistant\\secrets\\ha_token.txt",
  "echoTargets": ["Game Room", "Kid's Room - Echo", "Sogo", "Toasty"],
  "echoType": "announce",
  "satelliteEntity": "assist_satellite.home_assistant_voice_09eb97_assist_satellite",
  "pollSeconds": 10
}
```

**Loop:**

1. `POST /api/v1/relay/claim` (bearer `relayToken`). The server:
   - updates `relay_last_seen`;
   - returns up to 5 `house` deliveries with status `queued`, or `claimed` with
     `claimed_at` more than 2 min old;
   - marks them `claimed` and increments `attempts`.
   
   A delivery with `attempts > 3` is set to `failed` instead of being returned.
2. For each delivery, call **both** surfaces in parallel:
   - Echos: `POST /api/services/notify/alexa_media`
     `{ "target": echoTargets, "message": message, "data": { "type": echoType } }`
   - Voice PE: `POST /api/services/assist_satellite/announce`
     `{ "entity_id": satelliteEntity, "message": message }`. **Timeout 30 s** — it
     takes about 8 s, and that is not a hang.
   - Send UTF-8 JSON (`Kid's` contains an apostrophe).
3. `POST /api/v1/relay/report` `{ id, status, detail }`, where `status` comes from
   `classifyResult(echoOk, satOk)`:
   - both ok → `sent`
   - one ok → `partial`
   - neither → `failed`
   
   `detail` is `{"echo":"ok"|"<error>","voice_pe":"ok"|"<error>"}`.
4. Sleep `pollSeconds` and repeat. On a network error, log it and keep going. The
   relay never exits on its own.

**Running it:** started at logon by `relay/relay-task.vbs`, the same pattern as the
HA watchdog (`C:\Users\Public\git\HomeAssistant\ha-watchdog-task.vbs`): hidden
window, exits if a relay is already running, restarts the relay 30 s after it dies.
It is launched by a shortcut in the user's Startup folder (steps in README). The relay
logs to `relay/relay.log`; a crash's stderr goes to `relay/relay-crash.log`. Never log
the HA token.

**Contract test (M6):** import `classifyResult` from the relay. Call it with all
four boolean combinations. Assert that the server's `/relay/report` validator
accepts every status it returns, and rejects `queued` and `claimed`.

**Latency budget:** cron granularity (≤ 60 s) + poll interval (≤ 10 s) + Voice PE
(~8 s). Up to about 80 s from due time to spoken is acceptable.

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
| POST | `/auth/login` | public | `{ email, password }` → member; sets cookie |
| POST | `/auth/logout` | member | → 204; clears cookie |
| GET | `/me` | member | → member + prefs |
| PATCH | `/me` | member | `{ displayName?, color?, showPublicHolidays?, showSchoolHolidays?, showOptionsExpiration? }` |
| GET | `/members` | member | → `{ id, email, displayName, color, role, isFounder, disabledAt }[]` (no hashes; `email` only for owners) |
| PATCH | `/members/{id}` | owner | `{ disabled?: boolean, role?: Role }` — rules in §6.3 |
| GET/POST | `/invites` | owner | GET → `{ id, displayName, createdAt, expiresAt, usedAt, usedBy, revokedAt }[]`; POST `{ displayName }` → `{ code, expiresAt }` (the code is shown only once; the PWA builds the link and QR from it) |
| DELETE | `/invites/{id}` | owner | revoke |
| GET | `/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` | member | → `{ occurrences[], publicHolidays[], schoolHolidays[], marketDays[] }`; recurring events expanded server-side with `recurrence.ts`; alarms excluded; public holidays filtered to days off; max range 120 days |
| POST | `/events` | member | event fields → event |
| GET/PATCH/DELETE | `/events/{id}` | creator or owner for writes | PATCH/DELETE close future scheduled fires (§5.6) |
| POST | `/events/{id}/exdates` | creator or owner | `{ date }` |
| GET/POST | `/timers` | member | |
| PATCH/DELETE | `/timers/{id}` | creator or owner | |
| POST | `/timers/{id}/commands` | member | `{ cmd: TimerCmd }` |
| GET | `/alarms` | member | → alarms: `{ id, title, time, days: Weekday[], channels, renotifyMin, assignedTo, createdBy, nextDueAt, ringing }` |
| POST | `/alarms` | member | `{ title, time: "HH:MM", days: Weekday[], channels, renotifyMin?, assignedTo? }` → alarm |
| PATCH/DELETE | `/alarms/{id}` | creator or owner | same fields as POST, all optional; closes future scheduled fires like an event edit |
| GET | `/fires?state=ringing` | member | → open fires with titles; chore fires also carry `choreRunId`, `stepTitle` (only for chores with > 1 step) and `personId` (the current step's person) |
| POST | `/fires/{id}/actions` | member | `{ action: Action }` → fire (+ next); 409 on `invalid_action` |
| POST | `/push/subscriptions` | member | `PushSubscriptionJSON` + userAgent |
| DELETE | `/push/subscriptions/{id}` | owner of the subscription | |
| GET | `/push/vapid-key` | public | → `{ key }` |
| GET/PUT | `/school-holidays` | GET member / PUT owner | PUT `{ from, to, label }` (a single date: `from = to`) |
| DELETE | `/school-holidays/{date}` | owner | removes that one date |
| GET/PATCH | `/settings` | GET member / PATCH owner | GET → `{ householdName, timezone, daysOff }`; PATCH `{ householdName?, timezone?, daysOff?: HolidayKey[] }` |
| GET | `/status` | member | → `{ relayLastSeen, mySubscriptions[], recentDeliveries[] }` |
| POST | `/relay/claim` | bearer `RELAY_TOKEN` | → deliveries |
| POST | `/relay/report` | bearer `RELAY_TOKEN` | `{ id, status, detail }` |
| GET | `/chores` | member | → `Chore[]`: `{ id, title, doneMeans, days, timing, time, nudge, people, steps, channels, renotifyMin, createdBy, thisWeek, nextWeek }` (`thisWeek`/`nextWeek` = member id or null) |
| POST | `/chores` | member | `{ title, doneMeans?, days, timing, time, nudge?, people, steps, channels, renotifyMin? }` → chore (201) |
| PATCH/DELETE | `/chores/{id}` | creator or owner | same fields, all optional; re-plans unstarted runs (§7B.3) |
| GET | `/chores/today` | member | → `{ date, runs: Run[] }`; `Run = { id, choreId, title, doneMeans, timing, time, step, steps, assigneeId, personId, doneAt, doneBy, nextDueAt, ringing }` (`personId` = the current step's person) |
| POST | `/chore-runs/{id}/done` | member | advances one step (§7B.3) → run; 409 `already_done` when finished |
| POST | `/chore-runs/{id}/undo` | member | → run; 409 `nothing_to_undo` at step 0 |
| GET | `/lists` | member | → `{ id, name, createdBy, openCount }[]`, by name (§7A) |
| POST | `/lists` | member | `{ name }` → list (201); 409 `duplicate`; 400 at `LISTS_MAX` |
| PATCH/DELETE | `/lists/{id}` | creator or admin (seeded lists: admin) | PATCH `{ name }` → list; DELETE → 204 |
| GET | `/lists/{id}` | member | → `{ list: { id, name, createdBy }, open: Item[], checked: Item[] }` (§7A.1); `Item = { id, listId, text, note, assigneeId, createdBy, createdAt, checkedAt, checkedBy }` |
| POST | `/lists/{id}/items` | member | `{ text, note?, assigneeId? }` → `{ item, result: "added" \| "existing" \| "reopened" }`, 201 when added, else 200 |
| PATCH | `/list-items/{id}` | member | `{ text?, note?, assigneeId?, checked?: boolean }` → item; 409 `duplicate` on a key clash |
| DELETE | `/list-items/{id}` | member | → 204 |
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
| `typecheck` | `tsc --noEmit` for worker + shared + tests, frontend, relay, scripts |
| `db:migrate:local` | `wrangler d1 migrations apply enso --local` |
| `db:migrate:remote` | `wrangler d1 migrations apply enso --remote` |
| `build` | `vite build` → `frontend/dist` |
| `deploy` | `npm run build && wrangler deploy` |
| `relay` | `tsx relay/relay.ts` |
| `arch:audit` | `tsx scripts/arch-audit.ts` — size vs cap for every source file, warning band marked (§2.5) |

`wrangler.toml` essentials:

- `name = "enso"`, `main = "src/worker/index.ts"`
- `[[d1_databases]] binding = "DB"`, `database_name = "enso"`,
  `migrations_dir = "migrations"`
- `[assets] directory = "frontend/dist"`,
  `not_found_handling = "single-page-application"`,
  `run_worker_first = ["/api/*"]`
- `[triggers] crons = ["* * * * *"]`

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

**M5 — Web Push**
- Spike first: send one push from a Worker to Chrome desktop and record which
  library works.
- Then subscriptions, sending, service-worker handlers, "Phone alerts off" badge,
  delivery rows.
- ✅ Manual, **on the deployed URL**:
  - Android: the notification shows Done/Snooze; tapping Done closes the fire.
  - iPhone home-screen app: the notification arrives, and tapping it opens the
    Ringing bar.
  - A revoked subscription produces a `failed` delivery, visible in Settings →
    Status.

**M6 — LAN relay**
- `/relay/claim`, `/relay/report`, `relay.ts`, the "House offline" badge,
  `relay/relay-task.vbs` + logon setup steps in README.
- ✅ Contract test (§9.2).
- ✅ Manual: a 1-min timer with channel House is spoken on the Echos **and** the
  Voice PE.
- ✅ Manual: stop the relay → the "House offline" badge appears within about
  2 min.

**M7 — Production** — `https://enso.sogodojo.com`
- `wrangler d1 create enso` → its id in `wrangler.toml`; `db:migrate:remote`.
- `wrangler.toml`: `[[routes]] pattern = "enso.sogodojo.com", custom_domain = true` (the
  `sogodojo.com` zone is on the same Cloudflare account, like AskRoxy).
- Secrets (§2.4): `SETUP_TOKEN` and `RELAY_TOKEN`, each 32+ random characters, set with
  `wrangler secret put`. **`DEV_ENDPOINTS` is never set in production** (no `/dev/*`).
  VAPID keys wait for M5 — until then the "Phone alerts off" badge stays, honestly.
- **Production starts clean** (decided by MojoSOGO 2026-10-03): no events, alarms, chores,
  timers, list items or accounts. It carries over from the local dev database only the
  household's settings (name, time zone, days off) and its school holidays. Public
  holidays need nothing — they are computed. Shopping and Wish list exist (migration
  0007), empty.
- The owner is created on the live site with the setup token (§6.1); everyone else joins
  by invite (§6.2a). The local dev database and its test accounts are untouched.
- Point the relay at the prod URL with the prod `RELAY_TOKEN` when the relay is set up.
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
- R2 attachments
- Data export
- Audit-log screen
- Event templates
- Week-strip view
- Editing a single occurrence of a series
- Quiet hours ⚑ — see Q2
- Escalation ladders: channel changes per alert number, light blinking, notifying
  the owner on escalation
- HA entity/automation generation; HA events creating reminders (door/motion)
- A separate restricted admin role (admins are co-owners, §6.3); guest role; multiple households
- Holiday calendars for other countries
- Turso / non-Cloudflare hosting
- Adding list items by voice (Voice PE / Home Assistant intent → Worker). If built, it
  goes through Home Assistant's own Assist, never Alexa skills or lists.
- Chore points, streaks or rewards
- Shopping list grouped by store aisle; list sharing outside the household; list ordering by hand

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
| Q2 | Timers can ring overnight. Quiet hours in v1, or rely on Stop? | Rely on Stop; quiet hours in Later |
| Q3 | While a timer rings unacknowledged, re-alert or ring once? | Re-alert every 15 min, 4 alerts max, then silent in the Ringing bar |
| Q4 | Should normal reminders nag too? | Off by default; per-event "repeat alert every" option |
| Q5 | House announcements go to **all four** Echos (incl. Toasty and Kid's Room) and the Voice PE — also at night? | Yes, all surfaces, always; per-alert speaker choice is Later |
| Q6 | App URL | **Decided by MojoSOGO 2026-10-03:** `https://enso.sogodojo.com` (Worker custom domain) |
| Q7 | Accent color: v1 used blue, which collides with school-holiday blue | Indigo `#6366F1` |
| Q8 | Snooze length | 10 min, single option |
| Q9 | Can any member Done/Ack a fire assigned to someone else? | Yes |
| Q10 | Can any member edit or delete any list item (not only their own)? | Yes — they are household lists |
| Q11 | How long do bought / done items stay visible? | 30 days |
| Q12 | Where do chores live? | Set up in **Alarms → Chores**; ticked off in **Lists → Today** (no fifth tab) |
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
| Q22 | What is an admin? | **Decided by MojoSOGO 2026-10-03:** same powers as the founder; any admin can make/remove admins; the founder can never be demoted or disabled |

---

## 14. Prototype status (2026-10-03)

Built: M0–M4 and M4a fully (alarms, with their API tests), plus the later §7 work:
household days off (§7.3), grouped multi-day bars (§7.1), monthly-by-weekday repeat
(§4.3) and the 📈 options-expiration marker (§7.4). M6 code is built (relay + API +
contract test + logon launcher); its manual checks on real speakers are not yet
recorded. M5 is server side only (subscriptions stored; **no sender** — every push
delivery is recorded `failed` with `push_sender_not_built (M5)` or `no_subscription`,
shown in Settings → Status). M7 not started: `wrangler.toml` still carries the
placeholder `database_id`. The §2.5 architecture guard is in place (map, test, `arch:audit`). M4b Lists is built
with its API tests (L1–L12) and its 320 px manual check passed on 2026-10-03. M4c
Chores is built (C1–C14 green; migration 0006 applied to the local dev database with
existing fires and deliveries intact; the Laundry loop exercised end to end through the
live local API — ring, house message, Done → wait, Undo). **Its 320 px manual check is
still to do** (the browser extension was unavailable). M4d Invites is built (I1–I6 and
the link round-trip tests green; `uqr` builds into its own 10 kB lazy chunk, absent from
the entry chunk). Its manual check — a real QR scanned by a phone at home — is still to do.
**M7: live at https://enso.sogodojo.com (2026-10-03)** — production D1 `enso` (all 7
migrations), carry-over of settings + 5 school holidays, secrets SETUP_TOKEN and
RELAY_TOKEN only, the same build as the home-network server. Owner setup and the shared
phone + house reminder check are still to do. Local dev keeps its own database through
`preview_database_id` (local D1 state is keyed by that id). M4e Lists of your own is built (L1–L20 green; 0007 verified against the
local dev data). Admins (§6.3, A1–A7) are built; `Settings.tsx` is at 89 % of its ceiling after the
members-list controls — the next addition there is a placement decision.

Deviations from this spec, deliberately:

- **No service worker / `vite-plugin-pwa` yet.** It arrives with M5, where the push
  handlers need it; installing a caching SW earlier only adds stale-deploy bugs.
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
| **Relay** | The home-PC process that speaks house alerts through Home Assistant |
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
