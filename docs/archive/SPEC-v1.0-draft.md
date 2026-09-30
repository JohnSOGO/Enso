# Home Reminder Calendar — Project Specification

**Version:** 1.0-draft  
**Date:** 2026-09-21  
**Status:** Draft — awaiting review  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
   2.4 Local Development — Windows PC as Dev Server
3. [Calendar System](#3-calendar-system)
   3.1 Continuous (Rolling) Calendar View
      3.1.4 Holiday Highlighting
4. [Reminder & Alarm System](#4-reminder--alarm-system)
5. [Multi-User / Household Management](#5-multi-user--household-management)
6. [Home Assistant Integration](#6-home-assistant-integration)
7. [Mobile Push Notifications](#7-mobile-push-notifications)
8. [Offline Sync Strategy](#8-offline-sync-strategy)
9. [Security & Privacy](#9-security--privacy)
10. [Tech Stack](#10-tech-stack)
11. [API Design](#11-api-design)
12. [Data Model](#12-data-model)
13. [UI/UX Specifications](#13-uiux-specifications)
14. [Phased Implementation Plan](#14-phased-implementation-plan)
15. [Open Questions](#15-open-questions)

---

## 1. Project Overview

### 1.1 Purpose

A self-hosted **calendar + reminder application** for a household, delivered as a PWA with native mobile push via Capacitor wrapper. The app manages fixed-time reminders, repeating schedules, and acknowledgment-triggered delayed alarms — all visible on a continuous (rolling) calendar view. House members create accounts via invite code, share events, and receive alerts through multiple channels: phone push, Home Assistant announcements, and smart device actuation.

### 1.2 Key Differentiators

- **Ack-triggered reminders**: A reminder that does not get acknowledged restarts on a configurable delay — useful for "remind me again in 30 min if I have not done this."
- **Continuous calendar layout**: Unbroken weekly rows flowing across month boundaries, no empty grid cells.
- **Deep Home Assistant integration**: Creates entities, triggers automations, and routes alerts through your existing HA ecosystem (Echos, Google Home, etc.).
- **Multi-channel alerting**: Phone push -> HA announcement -> smart speaker voice -> light actuation, with escalation paths.

### 1.3 Non-Goals

- FunHouse integration (separate project)
- Financial tracking, health monitoring, or other domain-specific features
- Public/shared calendars outside the household
- Real-time collaboration (no live cursors or simultaneous editing conflicts — single-writer per event)

---

## 2. Architecture

### 2.1 High-Level Diagram

```
+------------------+     +------------------+     +---------------------+
|   Mobile App     |     |   Desktop Browser|     |   Home Assistant    |
|  (Capacitor PWA) |     |   (PWA fallback) |     |   (HAOSDOJO)        |
|                  |     |                  |     |                     |
| - Push receipts  |     | - Full calendar  |     | - Voice announcements|
| - Offline cache  |     | - Event creation |     | - Light/speaker ctrl|
| - Local DB       |     | - Ack reminders  |     | - Entity registry   |
+--------+---------+     +--------+---------+     +----------+----------+
         |                        |                           |
         |          HTTPS         |                           |
         +------------------------+---------------------------+
                                  |
                     +------------v-------------+
                     |   Cloudflare Workers     |
                     |   (API + Auth)           |
                     |                          |
                     | - REST API               |
                     | - JWT auth               |
                     | - Push relay             |
                     | - HA webhook proxy       |
                     +------------+-------------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
    +---------v-------+  +-------v------+   +--------v-------+
    |   Cloudflare    |  |   R2         |   |   HA REST      |
    |   D1 (SQLite)   |  |   (files,    |   |   API          |
    |                  |  |    backups)  |   |                |
    +-----------------+  +--------------+   +----------------+
```

### 2.2 Hosting Model

- **Cloudflare Workers** — backend API, authentication, push notification relay
- **Cloudflare D1** — primary database (SQLite-compatible, edge-native)
- **Cloudflare R2** — file storage (event attachments, backup exports)
- **Cloudflare Pages** — PWA frontend hosting (`wrangler pages deploy`)
- **Home Assistant** — alert routing target (voice announcements, device actuation)

### 2.3 Deployment

```
Developer PC
    |
    |-- wrangler deploy   → Cloudflare Workers (backend API)
    |-- wrangler pages deploy  → Cloudflare Pages (PWA frontend)
                                    |
                            D1 database (managed by CF)
                            R2 bucket (managed by CF)
```

Self-hosted option: Workers-compatible runtime on HAOSDOJO using **Deno Deploy** or a self-hosted **Hono** server with **Turso** (libSQL/Fork of SQLite).

### 2.4 Local Development — Windows PC as Dev Server

During development, the backend runs on the **Windows desktop PC** (not HAOSDOJO). This gives fast iteration, direct LAN access to Home Assistant for testing, and no cloud dependency while building.

#### 2.4.1 Local Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Runtime | **Node.js 20+** (LTS) on Windows PC | Standard Node, not Workers runtime |
| Framework | **Hono** (same as production) | Runs identically on Node and Workers |
| Database | **SQLite** via `better-sqlite3` | File-based DB on local disk; same SQL as D1 |
| Secrets | `.env` file in project root | HA token, JWT secret, webhook secrets |
| Dev server | Hono's built-in HTTP server (`hono/node-server`) | Auto-reload via `nodemon` or `tsx watch` |
| Cron triggers | **node-cron** library | Replaces Cloudflare Cron Triggers during dev |

#### 2.4.2 Directory Structure (Local)

```
HomeReminderCalendar/
├── src/
│   ├── api/              # Hono routes (same code as production)
│   │   ├── auth.ts
│   │   ├── events.ts
│   │   ├── reminders.ts
│   │   └── ha.ts         # Home Assistant integration module
│   ├── db/
│   │   ├── schema.sql    # DDL — shared between local SQLite and D1
│   │   ├── sqlite.ts     # Local DB implementation (better-sqlite3)
│   │   └── d1.ts         # Cloud DB implementation (D1) — not used locally
│   ├── lib/
│   │   ├── db.ts         # Database abstraction — exports `db` interface
│   │   ├── auth.ts       # JWT generation/validation
│   │   └── holidays.ts   # Built-in US federal holiday list
│   ├── workers/          # Cloudflare Workers entry point (production only)
│   │   ├── index.ts      # Hono app + D1 bindings
│   │   └── cron.ts       # Cron trigger for reminder evaluation
│   └── server.ts         # Local dev server entry point
├── packages/
│   ├── frontend/         # PWA (React/Vite) — same code as production
│   └── mobile/           # Capacitor wrapper — same code as production
├── .env                  # Local secrets (gitignored)
├── .env.example          # Template for new devs
├── package.json
└── wrangler.toml         # Cloudflare Workers config (production only)
```

#### 2.4.3 Database Abstraction Layer

The key to a clean local → cloud migration is abstracting the database behind a single interface:

```typescript
// src/lib/db.ts — shared interface, same for both environments
export interface DB {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  begin(): void;
  commit(): void;
  rollback(): void;
}

// src/db/sqlite.ts — local implementation (better-sqlite3)
import Database from 'better-sqlite3';
export class SQLiteDB implements DB {
  private db: Database.Database;
  constructor(path: string) { this.db = new Database(path); }
  query<T>(sql, params?) { return this.db.prepare(sql).all(params) as T[]; }
  execute(sql, params?) { this.db.prepare(sql).run(params); }
  begin() { this.db.exec('BEGIN'); }
  commit() { this.db.exec('COMMIT'); }
  rollback() { this.db.exec('ROLLBACK'); }
}

// src/db/d1.ts — cloud implementation (D1)
export class D1DB implements DB {
  constructor(private stmt: D1Database) {}
  query<T>(sql, params?) { return this.stmt.prepare(sql).bind(...params).all() as T[];
  execute(sql, params?) { this.stmt.prepare(sql).bind(...params).run(); }
  begin() { this.stmt.exec('BEGIN'); }
  commit() { /* D1 auto-commits */ }
  rollback() { this.stmt.exec('ROLLBACK'); }
}

// src/lib/db.ts — factory: picks the right implementation
import { SQLiteDB } from '../db/sqlite';
import { D1DB } from '../db/d1';

const isLocal = process.env.NODE_ENV === 'development';
export const db: DB = isLocal
  ? new SQLiteDB('./data/hrc.db')   // local file-based SQLite
  : new D1DB(process.env.D1_HRC);    // Cloudflare D1 binding (production)
```

**All API code uses `db` — never the concrete class.** Swapping environments is a one-line config change.

#### 2.4.4 Local Dev Workflow

```bash
# 1. Clone and install
git clone <repo>
cd HomeReminderCalendar
npm install

# 2. Set up local secrets
cp .env.example .env
# Edit .env: add HA token, JWT secret, etc.

# 3. Initialize database (runs schema.sql)
npm run db:init

# 4. Start dev server (auto-reload on file changes)
npm run dev
# → http://localhost:3001/api/v1/...

# 5. Run PWA frontend (separate process)
cd packages/frontend
npm run dev
# → http://localhost:5173
```

#### 2.4.7 Browser Window Validation (Responsive Testing)

All UI validation on the Windows PC is done by **resizing the browser window** to test responsive layouts at different widths.

| Viewport Width | Target Device | Notes |
|----------------|---------------|-------|
| **320–480px** | Mobile phones (portrait) | Primary design target; everything must work here |
| **768px+** | Tablet / small desktop | Secondary check — layout should adapt gracefully |

**Validation procedure:**
1. Open `http://localhost:5173` in Chrome or Edge on the Windows PC
2. Resize browser window to **minimum 320px width** (mobile portrait) — verify calendar, events, reminders all render correctly
3. Widen to ~768px and above — verify desktop layout kicks in
4. Test at intermediate widths (480px, 600px, 1024px) — no layout breakage at any point
5. **Minimum width requirement:** the browser window must be resizable down to **320px** for mobile validation; if the monitor resolution or taskbar prevents this, use Chrome DevTools Device Mode as a fallback

#### 2.4.5 HA Integration During Local Dev

The local server on the Windows PC has direct LAN access to Home Assistant at `http://192.168.0.123:8123`:

- **Testing entity creation** — write template sensors directly to HA via REST API
- **Testing voice announcements** — trigger Echo/Google Home from local dev server
- **Testing light actuation** — blink desk lights as reminder escalation
- **Webhook testing** — configure HA automations to POST to `http://<PC_IP>:3001/api/v1/webhooks/ha-trigger`

No proxy or tunnel needed — the PC is on the same LAN as HAOSDOJO.

#### 2.4.6 Migration: Local → Cloudflare

| Step | Action |
|------|--------|
| 1 | `wrangler d1 create hrc` — create D1 database on Cloudflare |
| 2 | `wrangler d1 execute hrc --file=src/db/schema.sql` — run schema on D1 |
| 3 | Set secrets: `wrangler secret put HA_TOKEN`, `wrangler secret put JWT_SECRET` |
| 4 | `wrangler deploy` — deploys Workers (backend) |
| 5 | `wrangler pages deploy dist/` — deploys PWA frontend from build output |

**No code changes required.** The abstraction layer handles the difference. Only config changes (secrets, D1 binding name).

---

## 3. Calendar System

### 3.1 Continuous (Rolling) Calendar View

The primary calendar display uses a **continuous layout**: weeks flow sequentially down the page without month-boundary gaps. Each row represents exactly one week; each column represents one day. Month transitions are indicated by subtle color changes or text markers rather than grid resets.

#### 3.1.1 Layout Specifications

```
+-------------------------------------------------------------+
|  <- Sep 2025 ->                                             |
|  Sun  Mon  Tue  Wed  Thu  Fri  Sat                         |
|  --------------------------------------------------------  |
|   1    2    3    4    5    6    7     <- Week 1 (Sep starts)|
|   8    9   10   11   12   13   14     <- Week 2            |
|  15   16   17   18   19   20   21     <- Week 3            |
|  22   23   24   25   26   27   28     <- Week 4 (Oct starts)|
|  29   30   31    1    2    3    4      <- Week 5            |
|       ...                                                         |
+-------------------------------------------------------------+

Month demarcation: subtle background color shift + bold date number
```

#### 3.1.2 View Modes

| Mode | Description | Default |
|------|-------------|---------|
| **Continuous** (primary) | Unbroken weekly rows, scrolls vertically forever | Yes |
| **Day detail** | Tap/click a day -> full-day event list with time grid | On demand |
| **Week strip** | Horizontal scrollable week view (compact) | Optional toggle |

#### 3.1.3 Continuous Calendar Features

- **Infinite vertical scroll** — loads weeks on-demand as user scrolls (virtualized rendering for performance)
- **Month demarcation** — subtle background color shift + bold date numbers at month boundaries
- **Event pills** — compact colored bars within each day cell showing event title, time range, and assigned members
- **Color coding by member** — each household member has a persistent color; events they create show that color
- **Multi-day events** — span across cells with gradient fill
- **Today highlight** — current day column gets a subtle vertical accent line
- **Holiday highlighting** — public holidays (everyone off) in red; school holidays (schools off) in blue. See Section 3.1.4.
- **Quick-add** — tap empty cell -> inline event creation form

#### 3.1.4 Holiday Highlighting

Dates that are typical holidays get highlighted directly in the calendar grid so they stand out at a glance.

| Type | Color | Visual Treatment | Description |
|------|-------|-----------------|-------------|
| **Public holiday** (everyone off) | Red (`#EF4444`) | Bold date number + red background pill behind the date cell | US federal holidays: New Year's Day, MLK Day, Presidents' Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas |
| **School holiday** (schools off) | Blue (`#3B82F6`) | Bold date number + blue background pill behind the date cell | Fall break, winter break, spring break, teacher workdays, early dismissal days — configurable per household |

**Implementation:**
- Public holidays are a built-in list (US federal calendar) that auto-populates for each year
- School holidays are user-configurable: add/remove dates via Settings -> Holidays
- Both types render as a colored pill behind the date number in every day cell
- If a holiday falls on a weekend, it is still highlighted (no double-highlight conflict)
- A legend appears at the top of the calendar view:
  ```
  [red pill] Public Holiday    [blue pill] School Holiday
  ```
- Users can toggle visibility: Settings -> Calendar -> Show public holidays / Show school holidays

### 3.2 Event Display on Calendar

```
Event pill format:
+----------------------+
| Medication - 9am     |  <- colored bar (member color)
|    John              |
+----------------------+

Multi-day event:
Day 1: +----------------------+
       | Birthday Party        |
       |   Sep 24-26           |
       +----------------------+
Day 2: -------------------------- (continuation)
Day 3: -------------------------- (continuation)
```

---

## 4. Reminder & Alarm System

### 4.1 Reminder Types

#### 4.1.1 Fixed Reminders

One-time reminders at a specific date/time.

```json
{
  "type": "fixed",
  "trigger_at": "2026-10-15T14:30:00Z",
  "title": "Take out trash",
  "ack_required": true,
  "channels": ["push", "ha_announce"]
}
```

#### 4.1.2 Repeating Reminders

Recurs on a schedule (daily, weekly, monthly, custom interval). Each occurrence is an independent reminder instance with its own ack state.

```json
{
  "type": "repeating",
  "interval": { "frequency": "weekly", "days": [1,3,5] },
  "time": "08:00",
  "title": "Morning medication",
  "ack_required": true,
  "max_occurrences": null,
  "ends_after_ack": false
}
```

**Repeat frequencies supported:**
- `daily` — every day at the same time
- `weekly` — specific days of week (e.g., Mon/Wed/Fri)
- `biweekly` — every other week on specified days
- `monthly` — same date each month
- `custom_interval` — every N hours/days/weeks

#### 4.1.3 Delayed / Ack-Triggered Reminders (Core Feature)

A reminder that **restarts after acknowledgment** of the previous alarm. This creates a "nag loop" where the reminder keeps firing until the user acknowledges it and then completes the task within the delay window.

```json
{
  "type": "delayed",
  "trigger_at": "2026-10-15T14:30:00Z",
  "ack_delay_minutes": 45,
  "max_repeats": 3,
  "title": "Check water heater pressure",
  "escalation": {
    "after_ack": true,
    "delay_after_ack_minutes": 45,
    "next_channels": ["push", "ha_announce", "ha_light_blink"],
    "escalate_to_ha": true
  },
  "channels": ["push"]
}
```

**Behavior:**
1. Alarm fires at `trigger_at` -> push notification sent
2. User **acknowledges** the alarm (taps "Acknowledge")
3. Timer starts: `ack_delay_minutes` (e.g., 45 min)
4. If task not marked complete within delay window -> alarm fires again
5. Repeat up to `max_repeats` times
6. Each repeat can escalate channels (push -> HA announce -> light blink)

**Ack-triggered flow:**
```
Alarm fires --> User sees notification
     |
     |-- User acknowledges --> Timer starts (45 min)
     |                           |
     |                           |-- Task completed in time --> Done
     |                           |
     |                           +-- Time expires --> Alarm fires again
     |                                               |
     |                                               |-- Acknowledge again --> restart timer
     |                                               |
     |                                               +-- Max repeats reached --> escalate + notify admin
     |
     +-- User ignores --> After retry_delay (e.g., 5 min), alarm fires again
                              (same channels, no ack delay)
```

### 4.2 Acknowledgment States

| State | Description | Transition |
|-------|-------------|------------|
| `pending` | Reminder scheduled, not yet fired | -> `firing` at trigger time |
| `firing` | Alarm currently active (notification sent) | -> `acknowledged` on ack; -> `retrying` if ignored |
| `acknowledged` | User tapped acknowledge | -> `delayed` starts timer |
| `delayed` | Waiting in post-ack delay window | -> `completed` if task done; -> `firing` again if time expires |
| `completed` | Task marked complete | Final state |
| `dismissed` | User dismissed without completing | Final state (no repeat) |
| `escalated` | Max repeats reached, escalated to HA | Final state for reminder instance |

### 4.3 Retry Behavior (Ignored Alarms)

If a user ignores an alarm:

```json
{
  "retry": {
    "enabled": true,
    "delay_minutes": [5, 15, 30],
    "max_retries_before_ack_delay": 2,
    "escalate_on_retry": true
  }
}
```

- First ignore: retry in 5 min (same channels)
- Second ignore: retry in 15 min + escalate to HA announcement
- After max retries: switch to ack-delay mode (alarm only fires after user acknowledges)

---

## 5. Multi-User / Household Management

### 5.1 Account Creation via Invite Code

```
Admin generates code --> User visits site with code --> Creates account --> Joins household
```

#### 5.1.1 Invite Code Flow

1. **Admin** (household owner) navigates to Settings -> Members -> "Invite Member"
2. Admin enters member name and optional role
3. System generates a **unique, single-use invite code** (e.g., `HG7X-9K2M-P4QT`)
4. Code is shared with the person (text, email, verbal)
5. Person visits the app URL -> enters invite code on signup page
6. Creates account with email/password or OAuth
7. Automatically added to household

#### 5.1.2 Invite Code Properties

| Property | Value |
|----------|-------|
| Format | `XXXX-XXXX-XXXX` (alphanumeric, case-insensitive) |
| Entropy | 48 bits (~281 trillion combinations) |
| Expiration | 30 days by default (configurable) |
| Usage | Single-use only |
| Revocation | Admin can revoke before use |

### 5.2 Household Members

```json
{
  "id": "mem_abc123",
  "household_id": "hh_xyz789",
  "display_name": "MojoSOGO",
  "avatar_url": null,
  "color": "#FF6B35",
  "role": "admin",
  "status": "active",
  "created_at": "2026-09-01T10:00:00Z",
  "last_seen": "2026-09-21T18:30:00Z",
  "push_token": "fcm:APA9b...",
  "preferences": {
    "timezone": "America/Los_Angeles",
    "default_reminder_channels": ["push", "ha_announce"],
    "quiet_hours": { "enabled": true, "start": "23:00", "end": "07:00" },
    "calendar_view": "continuous"
  }
}
```

### 5.3 Roles & Permissions

| Role | Create Events | Edit Own | Edit Others' | Delete Events | Manage Members | Manage Settings | View All Reminders |
|------|--------------|----------|-------------|---------------|----------------|-----------------|-------------------|
| **Owner** (1 per household) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Admin** | Yes | Yes | Yes | Yes | No | Partial | Yes |
| **Member** | Yes | Yes | No | Own only | No | No | Only own + shared |

### 5.4 Event Sharing

When creating/editing an event, the creator can assign it to specific members:

```json
{
  "event_id": "evt_def456",
  "title": "Grocery run",
  "assigned_to": ["mem_abc123", "mem_jkl012"],
  "created_by": "mem_xyz789"
}
```

- Assigned members get the event on their calendar
- Assigned members receive reminder alerts for that event
- Any member can mark a shared event as complete (but only creator/owner can delete)

---

## 6. Home Assistant Integration

### 6.1 Overview

The app integrates with your existing **Home Assistant** instance at `http://192.168.0.123:8123` for:
- Creating/managing entities and automations
- Sending alerts through HA's notification system
- Triggering voice announcements on Echos/Google Home
- Actuating lights/devices as reminder signals

### 6.2 Integration Methods

#### 6.2.1 Long-Lived Access Token

Use the existing HA long-lived token (stored in `C:\Users\Public\git\HomeAssistant\secrets\ha_token.txt`) for API authentication from Cloudflare Workers. The token is stored encrypted in Cloudflare Secrets/Variables.

**API endpoints used:**
- `GET /api/states` — read entity states
- `POST /api/services/{domain}/{service}` — call services (light.turn_on, media_player.volume_set, etc.)
- `POST /api/events/{event_type}` — fire custom events
- WebSocket API for real-time state updates

#### 6.2.2 Webhook-Based Triggering

The app exposes webhook endpoints that HA can call to trigger reminders:

```
HA Automation -> POST https://<app-domain>/api/v1/webhooks/ha-trigger
{
  "source": "home_assistant",
  "event_type": "motion_detected",
  "entity_id": "binary_sensor.hallway_motion",
  "reminder_template": "Someone at the door"
}
```

#### 6.2.3 HA Entity Creation

The app creates custom entities in HA for each active reminder:

```yaml
# Auto-generated in HA configuration
sensor:
  - platform: template
    sensors:
      hrc_reminder_morning_medication:
        friendly_name: "Morning Medication Reminder"
        value_template: "{{ 'active' if is_state('input_boolean.morning_med', 'on') else 'idle' }}"
        attribute_templates:
          next_trigger: "{{ state_attr('input_datetime.morning_med_next', 'timestamp') | timestamp_custom('%Y-%m-%d %H:%M') }}"
          ack_required: "true"

input_boolean:
  morning_med:
    name: "Morning Medication Acknowledged"

input_text:
  morning_med_message:
    name: "Morning Medication Message"
```

#### 6.2.4 HA Automation Generation

For each reminder with `escalate_to_ha: true`, the app generates an HA automation:

```yaml
# Generated by Home Reminder Calendar
alias: "HRC - Morning Medication Escalation"
trigger:
  - platform: event
    event_type: "hrc_reminder_fired"
    event_data:
      reminder_id: "rem_morning_med_001"
condition: []
action:
  - service: notify.mobile_app_mojo_phone
    data:
      title: "Reminder"
      message: "Morning Medication — not yet acknowledged!"
  - delay: "00:05:00"
  - service: script.announce_text
    data:
      text: "Morning medication reminder, MojoSOGO"
      target: all_speakers
  - delay: "00:10:00"
  - service: light.turn_on
    data:
      brightness_pct: 100
      rgb_color: [255, 255, 0]
    target:
      entity_id: light.desk_lamp
```

### 6.3 Alert Routing Hierarchy

When a reminder fires, alerts are sent through this cascade:

```
Reminder Fires
     |
     |-- Step 1: Push notification to phone(s)
     |           (via Capacitor push / FCM / APNs)
     |
     |-- Step 2 (if no ack in N min): HA announcement
     |           POST /api/services/notify/all
     |           -> Echos speak the reminder text
     |           -> Google Home speaks it
     |
     |-- Step 3 (if still no ack): Device actuation
     |           light.turn_on (blink pattern)
     |           media_player.volume_set (chime sound)
     |
     +-- Step 4 (escalation): Notify admin member
         Push notification: "Reminder '{name}' has escalated — check on house members"
```

### 6.4 HA Integration Features Checklist

| Feature | Status | Notes |
|---------|--------|-------|
| Read HA entity states | Planned | For context-aware reminders (e.g., don't remind if someone's already at the door) |
| Create template sensors | Planned | One sensor per active reminder |
| Generate automations | Planned | YAML-based, stored in HA config via API |
| Voice announcements | Planned | Via `script.announce_text` or native notify service |
| Light/speaker actuation | Planned | As escalation channel |
| Custom event firing | Planned | `hrc_reminder_fired`, `hrc_reminder_acknowledged` |
| Bidirectional ack sync | Planned | HA entity state reflects reminder ack status |

---

## 7. Mobile Push Notifications

### 7.1 Capacitor Wrapper Architecture

The PWA is wrapped with **Capacitor** to enable native push notifications on both iOS and Android:

```
+-------------------------------+
|   Capacitor Native Shell       |
|                               |
|  +-------------------------+  |
|  |   PWA (WebView)         |  |
|  |   - Calendar UI         |  |
|  |   - Event management    |  |
|  |   - Reminder controls   |  |
|  +-------------------------+  |
|                               |
|  +-------------------------+  |
|  |   Push Plugin           |  |
|  |   - FCM (Android)       |  |
|  |   - APNs (iOS)          |  |
|  |   - Token management    |  |
|  +-------------------------+  |
|                               |
|  +-------------------------+  |
|  |   Local Notifications   |  |
|  |   (scheduled locally)   |  |
|  +-------------------------+  |
|                               |
|  +-------------------------+  |
|  |   Background Sync       |  |
|  |   - Event sync          |  |
|  |   - Ack state sync      |  |
|  +-------------------------+  |
+-------------------------------+
```

### 7.2 Push Notification Flow

```
Reminder fires (Worker)
     |
     |-- Check user's push token (stored in D1)
     |
     |-- Android: Send via FCM (Firebase Cloud Messaging)
     |   {
     |     "to": "<fcm_token>",
     |     "notification": {
     |       "title": "Medication",
     |       "body": "Time to take your morning medication"
     |     },
     |     "data": {
     |       "reminder_id": "rem_abc123",
     |       "type": "reminder",
     |       "action": "acknowledge"
     |     }
     |   }
     |
     |-- iOS: Send via APNs (Apple Push Notification service)
     |   {
     |     "token": "<apns_token>",
     |     "aps": {
     |       "alert": { "title": "Medication", "body": "..." },
     |       "badge": 1,
     |       "sound": "default"
     |     }
     |   }
     |
     +-- Fallback: If push fails -> HA announcement (if user has phone on home network)
```

### 7.3 Push Token Management

- Tokens stored in D1 per user, updated on each app launch
- Expired tokens automatically cleaned up
- iOS requires explicit permission prompt on first launch
- Android permissions requested during setup flow

### 7.4 Local (Offline) Notifications

When the device is offline or push fails:
- Capacitor's `LocalNotifications` plugin schedules notifications locally
- Uses the synced reminder data from IndexedDB
- Fires at the correct local time regardless of connectivity

---

## 8. Offline Sync Strategy

### 8.1 Sync Model

**"Next 7 days" default sync with full offline capability:**

| Scenario | Behavior |
|----------|----------|
| **Online** | Full calendar data synced (configurable range: 30 days / 90 days / all) |
| **Default offline** | Next 7 days of events + active reminders cached locally |
| **Full offline mode** | User can request "sync everything" when online, then work fully offline |
| **Reconnect** | Automatic conflict resolution: last-write-wins per event; reminder ack states synced on reconnect |

### 8.2 Local Data Store (IndexedDB)

```javascript
// IndexedDB schema in the PWA
const SCHEMA = {
  events: {
    keyPath: 'id',
    indexes: ['householdId', 'assignedTo', 'startDate', 'endDate']
  },
  reminders: {
    keyPath: 'id',
    indexes: ['householdId', 'status', 'triggerAt', 'ackStatus']
  },
  household: {
    keyPath: 'id'
  },
  members: {
    keyPath: 'id'
  },
  sync_state: {
    keyPath: 'key' // stores last_sync timestamps per entity type
  }
};
```

### 8.3 Sync Protocol

```typescript
// Incremental sync request
interface SyncRequest {
  since: Record<EntityType, string>; // ISO timestamp per entity type
  range_days?: number;               // how many days forward to fetch
}

// Response
interface SyncResponse {
  events: Event[];      // created/updated/deleted in range
  reminders: Reminder[];
  members: Member[];
  sync_state: Record<EntityType, string>; // new last_sync timestamps
  conflicts?: Conflict[]; // if any detected
}

// Acknowledgment push (fire-and-forget)
interface AckPush {
  reminder_id: string;
  user_id: string;
  timestamp: string;
}
```

### 8.4 Conflict Resolution

| Conflict Type | Resolution Strategy |
|--------------|---------------------|
| Same event edited by two members simultaneously | Last-write-wins (based on `updated_at`); both get a notification about the change |
| Reminder acked offline, then modified online | Online modification wins; ack state synced when device reconnects |
| Event deleted by one member, edited by another | Edit wins (data preserved); deletion logged in audit trail |

---

## 9. Security & Privacy

### 9.1 Authentication

- **JWT-based auth** via Cloudflare Workers KV or D1 session store
- **Invite code validation** — single-use, time-limited, cryptographically random
- **Password hashing** — bcrypt (via Cloudflare Workers built-in crypto)
- **Session management** — refresh token rotation, 30-day expiry with re-auth

### 9.2 Authorization

- All API endpoints require household membership verification
- Role-based access control (admin/owner/member) enforced at the API layer
- Cross-household data isolation (tenant_id on every query)

### 9.3 Data Protection

| Data | Encryption |
|------|-----------|
| Passwords | bcrypt hash |
| Push tokens | AES-256 encrypted in D1 |
| HA access token | Cloudflare Secrets (encrypted at rest) |
| Invite codes | Stored hashed, compared with HMAC |
| User data in transit | TLS 1.3 enforced |

### 9.4 Privacy Considerations

- No third-party analytics or tracking
- Reminder content stored only on user's infrastructure (Cloudflare D1)
- HA integration uses local network token — no reminder content leaves the house via HA path
- Users can export all data as JSON at any time

---

## 10. Tech Stack

### 10.1 Frontend (PWA + Capacitor)

| Component | Technology | Notes |
|-----------|------------|-------|
| Framework | **React 18** + TypeScript | Component library, hooks-based |
| State management | **Zustand** | Lightweight, no boilerplate |
| Calendar rendering | Custom (continuous layout) | Virtualized list for performance |
| HTTP client | **TanStack Query** | Offline-first caching, auto-retry |
| Push notifications | **Capacitor PushNotifications** + **LocalNotifications** | Native iOS/Android |
| Service worker | **Workbox** (via Vite plugin) | Cache strategy: stale-while-revalidate |
| Build tool | **Vite** | Fast HMR, PWA plugin built-in |
| Styling | **CSS Modules** + custom properties | No heavy UI framework; phone-first responsive |

### 10.2 Backend (Cloudflare Workers)

| Component | Technology | Notes |
|-----------|------------|-------|
| Runtime | **Cloudflare Workers** | Edge functions, low latency |
| Framework | **Hono** | Lightweight, edge-compatible |
| Database | **Cloudflare D1** | SQLite-compatible, edge-native |
| Object storage | **R2** | Event attachments, exports |
| Secrets | **Cloudflare Secrets Manager** | HA token, JWT keys |
| Auth | Custom JWT middleware | No external auth provider needed |

### 10.3 Home Assistant Integration

| Component | Technology | Notes |
|-----------|------------|-------|
| Communication | REST API + WebSocket | Via existing long-lived token |
| Entity creation | HA config API (YAML generation) | Template sensors, input_booleans |
| Automation generation | YAML files written via SMB/API | Stored in `/config` on HAOSDOJO |
| Event forwarding | Custom events (`hrc_*`) | Bidirectional sync |

### 10.4 Capacitor Native Shell

| Plugin | Purpose |
|--------|---------|
| `@capacitor/core` | Core runtime |
| `@capacitor/push-notifications` | FCM/APNs push |
| `@capacitor/local-notifications` | Offline scheduled notifications |
| `@capacitor/splash-screen` | App launch screen |
| `@capacitor/status-bar` | Status bar styling |
| `@capacitor/app` | App lifecycle (foreground/background) |
| `@capacitor/preferences` | Local key-value store |
| `@capacitor/network` | Connectivity detection |

---

## 11. API Design

### 11.1 REST Endpoints

#### Authentication

```
POST /api/v1/auth/signup-with-code
Body: { invite_code: string, email: string, password: string, display_name: string }
Response: { user_id, household_id, jwt, refresh_token }

POST /api/v1/auth/login
Body: { email: string, password: string }
Response: { user_id, household_id, jwt, refresh_token }

POST /api/v1/auth/refresh
Body: { refresh_token: string }
Response: { jwt, refresh_token }

POST /api/v1/auth/logout
Headers: Authorization: Bearer <jwt>
```

#### Household & Members

```
GET /api/v1/household
Headers: Authorization: Bearer <jwt>
Response: { household_id, name, members[], settings }

POST /api/v1/household/invite
Headers: Authorization: Bearer <jwt>
Body: { display_name: string, role?: "admin" | "member" }
Response: { invite_code, expires_at }

GET /api/v1/household/members/{id}
DELETE /api/v1/household/members/{id}  (owner only)

PUT /api/v1/household/settings
Headers: Authorization: Bearer <jwt>
Body: { name?: string, timezone?: string, default_reminder_channels?: string[] }
```

#### Calendar Events

```
GET /api/v1/events?start=2026-09-01&end=2026-10-01&range_days=30
Headers: Authorization: Bearer <jwt>
Response: Event[]

POST /api/v1/events
Headers: Authorization: Bearer <jwt>
Body: { title, description?, start_time, end_time?, assigned_to?: string[], recurring?: RecurringRule }
Response: Event (created)

GET /api/v1/events/{id}
PUT /api/v1/events/{id}  (creator or admin only)
DELETE /api/v1/events/{id}  (creator or owner only)
```

#### Reminders

```
GET /api/v1/reminders?status=pending|firing|acknowledged|completed&household_id=xxx
Headers: Authorization: Bearer <jwt>
Response: Reminder[]

POST /api/v1/reminders
Headers: Authorization: Bearer <jwt>
Body: { event_id?, title, type: "fixed"|"repeating"|"delayed", trigger_at, ack_delay_minutes?, max_repeats?, channels?: string[], escalation?: EscalationConfig }
Response: Reminder (created)

GET /api/v1/reminders/{id}
POST /api/v1/reminders/{id}/acknowledge
Headers: Authorization: Bearer <jwt>
Body: { user_id }
Response: { status: "acknowledged", next_fire_at? }

POST /api/v1/reminders/{id}/complete
Headers: Authorization: Bearer <jwt>
Body: {}
Response: { status: "completed" }

POST /api/v1/reminders/{id}/dismiss
Headers: Authorization: Bearer <jwt>
Body: {}
Response: { status: "dismissed" }
```

#### Home Assistant Integration

```
GET /api/v1/ha/status
Headers: Authorization: Bearer <jwt>
Response: { online: boolean, entities_count: number, last_sync: string }

POST /api/v1/ha/sync-entities
Headers: Authorization: Bearer <jwt>
Body: { reminders_to_create: Reminder[] }
Response: { created_entities: number, generated_yaml: string }

POST /api/v1/ha/announce
Headers: Authorization: Bearer <jwt>
Body: { text: string, target?: "all" | "speaker_id", volume?: number }
Response: { success: boolean }

GET /api/v1/ha/entities/{entity_id}
```

#### Webhooks (for HA -> App triggers)

```
POST /api/v1/webhooks/ha-trigger  (no auth — IP whitelist + secret header)
Headers: X-HA-Secret: <webhook_secret>
Body: { source, event_type, entity_id?, reminder_template? }
Response: { accepted: boolean, reminder_id? }

POST /api/v1/webhooks/ha-ack  (bidirectional ack sync)
Headers: X-HA-Secret: <webhook_secret>
Body: { reminder_id, user_id, acknowledged_at }
Response: { updated: boolean }
```

### 11.2 WebSocket (Real-Time Updates)

For live calendar updates and reminder state changes:

```typescript
// Client connects on app launch
const ws = new WebSocket('wss://<app-domain>/ws/updates');

// Server pushes events:
interface WSMessage {
  type: 'reminder_fired' | 'reminder_acknowledged' | 'reminder_completed' | 
        'event_created' | 'event_updated' | 'event_deleted' |
        'member_online' | 'member_offline';
  payload: any;
}

// Client subscribes to household events:
ws.send(JSON.stringify({ action: 'subscribe', household_id: 'hh_xyz789' }));
```

---

## 12. Data Model (D1 / SQLite)

### 12.1 Schema

```sql
-- Households
CREATE TABLE households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES members(id),
    timezone TEXT DEFAULT 'America/Los_Angeles',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Members (users)
CREATE TABLE members (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    color TEXT DEFAULT '#6B7280',  -- default gray
    role TEXT CHECK(role IN ('owner', 'admin', 'member')) NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'invited', 'suspended')),
    push_token TEXT,                -- encrypted FCM/APNs token
    timezone TEXT,                  -- overrides household default
    quiet_hours_start TEXT,         -- HH:MM or null
    quiet_hours_end TEXT,           -- HH:MM or null
    created_at TEXT DEFAULT (datetime('now')),
    last_seen TEXT,
    UNIQUE(household_id, email)
);

-- Invite codes
CREATE TABLE invite_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,        -- hashed invite code
    household_id TEXT NOT NULL REFERENCES households(id),
    created_by TEXT NOT NULL REFERENCES members(id),
    display_name TEXT,              -- name of invited person
    role TEXT DEFAULT 'member',
    used_by TEXT REFERENCES members(id),
    expires_at TEXT NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Calendar events
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    creator_id TEXT NOT NULL REFERENCES members(id),
    title TEXT NOT NULL,
    description TEXT,
    start_time TEXT NOT NULL,       -- ISO 8601
    end_time TEXT,                  -- ISO 8601 or null (all-day)
    color TEXT,                     -- override member color
    is_all_day INTEGER DEFAULT 0,
    recurring_rule TEXT,            -- JSON: RRULE format or null
    assigned_to TEXT,               -- JSON array of member IDs
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Reminders
CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    event_id TEXT REFERENCES events(id),  -- null if standalone reminder
    creator_id TEXT NOT NULL REFERENCES members(id),
    title TEXT NOT NULL,
    type TEXT CHECK(type IN ('fixed', 'repeating', 'delayed')) NOT NULL,

    -- Trigger config
    trigger_at TEXT NOT NULL,         -- ISO 8601 (next fire time)
    repeat_interval TEXT,             -- JSON: { frequency, days?, hours? } or null

    -- Ack-delay config (for delayed type)
    ack_delay_minutes INTEGER DEFAULT 30,
    max_repeats INTEGER DEFAULT 3,

    -- Current state
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'firing', 'acknowledged', 
              'delayed', 'completed', 'dismissed', 'escalated')),
    current_repeat_count INTEGER DEFAULT 0,

    -- Ack tracking
    last_ack_by TEXT REFERENCES members(id),
    last_ack_at TEXT,
    next_fire_after_ack TEXT,         -- ISO 8601

    -- Alert channels
    channels TEXT DEFAULT '["push"]', -- JSON array: push, ha_announce, ha_light, etc.
    escalation_config TEXT,           -- JSON escalation rules

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Reminder ack history
CREATE TABLE reminder_ack_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id TEXT NOT NULL REFERENCES reminders(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    action TEXT CHECK(action IN ('acknowledge', 'complete', 'dismiss')) NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    device_type TEXT                  -- 'ios' | 'android' | 'web'
);

-- HA sync state
CREATE TABLE ha_sync_state (
    key TEXT PRIMARY KEY,             -- e.g., 'last_entity_sync', 'last_automation_sync'
    value TEXT NOT NULL,              -- JSON or string
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Audit log (owner/admin view)
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id TEXT NOT NULL REFERENCES households(id),
    member_id TEXT REFERENCES members(id),
    action TEXT NOT NULL,             -- 'event_created', 'reminder_ack', etc.
    entity_type TEXT,                 -- 'event' | 'reminder' | 'member'
    entity_id TEXT,
    details TEXT,                     -- JSON
    timestamp TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_events_household_time ON events(household_id, start_time, end_time);
CREATE INDEX idx_reminders_household_status ON reminders(household_id, status);
CREATE INDEX idx_reminders_trigger_at ON reminders(trigger_at);
CREATE INDEX idx_members_household ON members(household_id);
CREATE INDEX idx_invite_codes_hash ON invite_codes(code_hash);
```

---

## 13. UI/UX Specifications

### 13.1 Design Principles

- **Phone-first, desktop-responsive** — primary use is on mobile; desktop is secondary
- **Glanceable at a glance** — calendar should be readable in <2 seconds
- **Dark mode by default** — matches HA aesthetic and reduces eye strain
- **Minimal taps to action** — acknowledge a reminder in one tap from notification

### 13.2 Screen Layouts

#### 13.2.1 Main Calendar View (Continuous)

```
+-------------------------------------+
| Menu  Home Reminder    Bell  Profile|  <- Top bar: menu, notifications, profile
+-------------------------------------+
|                                     |
|  --- September 2026 ---             |  <- Month header (color shift at boundary)
|  S  M  T  W  T  F  S              |  <- Day-of-week headers
|                                     |
|   1   2   3   4   5   6   7       |  <- Week row 1
| [Med] [Gro]                         |  <- Event pills (colored by member)
|                                     |
|   8   9  10  11  12  13  14       |  <- Week row 2
| [Wat] [Med] [Pet]                   |
|                                     |
|  ...scrolls infinitely...           |
|                                     |
+-------------------------------------+
|  [+ Add Event]   [Today]            |  <- Bottom bar: quick actions
+-------------------------------------+
```

#### 13.2.2 Day Detail View (tap a day)

```
+-------------------------------------+
| <- Sep 15, 2026              ...    |  <- Back button + date
+-------------------------------------+
|                                     |
|  8:00 AM                            |  <- Time grid
|  +-------------------------------+  |
|  | Morning Medication            |  |
|  |    John • Reminder active     |  |
|  +-------------------------------+  |
|                                     |
|  10:30 AM                           |
|  +-------------------------------+  |
|  | Grocery run                   |  |
|  |    MojoSOGO • Assigned to: John|  |
|  +-------------------------------+  |
|                                     |
|  2:00 PM                            |
|  +-------------------------------+  |
|  | Pet vet appointment           |  |
|  |    John • All day             |  |
|  +-------------------------------+  |
|                                     |
|  [+ Add Event]                      |  <- Inline add at bottom of list
|                                     |
+-------------------------------------+
```

#### 13.2.3 Event Creation/Edit Modal

```
+-------------------------------------+
|                     x              |
|  New Event                          |
|                                     |
|  Title: [________________]          |
|                                     |
|  Date:    [Sep 15, 2026   v]       |
|  Start:   [8:00 AM        v]       |
|  End:     [9:00 AM        v]       |
|  All day [ ]                        |
|                                     |
|  Repeat: [Never           v]        |
|         +---------------------+      |
|         | Never / Daily / Weekly|    |
|         | Monthly / Custom      |    |
|         +---------------------+      |
|                                     |
|  Remind me: [At time of       v]    |
|         +---------------------+      |
|         | At time / 5 min bef.|    |
|         | 15 min before        |    |
|         | Custom...            |    |
|         +---------------------+      |
|                                     |
|  Reminder type: [Fixed         v]   |
|         +---------------------+      |
|         | Fixed / Repeating /  |    |
|         | Delayed              |    |
|         +---------------------+      |
|                                     |
|  Assign to:                         |
|  [x] John (orange)   [x] MojoSOGO  |
|                                     |
|  Alert via:                         |
|  [x] Phone push   [x] Home Assist. |
|                                     |
|           [Save]      [Cancel]       |
+-------------------------------------+
```

#### 13.2.4 Active Reminder Card (in-app)

```
After firing:
+-------------------------------------------+
| Alarm - Medication — 9:00 AM              |
|                                            |
| Status: RED Firing                         |
| Ack by: John                              |
|                                            |
| [Acknowledge]  [Dismiss]                  |
|                                            |
| If not done in 45 min, I'll remind you   |
| again and notify the house.               |
+-------------------------------------------+

After acknowledgment:
+-------------------------------------------+
| Medication — Acknowledged                 |
|                                            |
| Next check in: 44 min                     |
| Progress: ████████████░░░░ (78%)          |
|                                            |
| [Mark Complete]                             |
|                                            |
| "I'll remind you again if this isn't      |
| done by 9:45 AM."                         |
+-------------------------------------------+
```

#### 13.2.5 Push Notification (Android)

```
+----------------------+
| Home Reminder        |
| Medication time!     |
| Tap to acknowledge   |
| [Acknowledge] [Snooze]| <- Big reply buttons in notification
+----------------------+
```

#### 13.2.6 Push Notification (iOS)

```
+----------------------+
| Home Reminder        |
| Medication time!     |
| Tap to open          | <- iOS doesn't support inline buttons in standard push
+----------------------+
```

### 13.3 Color Palette (Dark Mode)

| Element | Color |
|---------|-------|
| Background | `#0F172A` (slate-950) |
| Surface | `#1E293B` (slate-800) |
| Border | `#334155` (slate-700) |
| Text primary | `#F8FAFC` (slate-50) |
| Text secondary | `#94A3B8` (slate-400) |
| Accent (primary action) | `#3B82F6` (blue-500) |
| Today highlight | `#1D4ED8` (blue-700, 20% opacity bg) |
| Public holiday | `#EF4444` (red-500), bold date number + red background pill |
| School holiday | `#3B82F6` (blue-500), bold date number + blue background pill |
| Month boundary line | `#475569` (slate-600) |
| Member colors | Per-member palette (see below) |

### 13.4 Member Color Palette

Auto-assigned from a curated set of distinguishable colors:

```
#FF6B35 (orange)    #3B82F6 (blue)     #10B981 (green)
#8B5CF6 (purple)    #EC4899 (pink)     #F59E0B (amber)
#EF4444 (red)       #06B6D4 (cyan)     #84CC16 (lime)
```

### 13.5 Navigation Structure

```
+-- Main App ------------------------------------------+
|                                                       |
|  Calendar (default view)                              |
|  Active Reminders                                     |
|  Create Event / Reminder                              |
|  Members                                              |
|  Settings                                             |
|      |-- Household settings                           |
|      |-- My preferences                               |
|      |-- Home Assistant config                        |
|      |-- Invite members                               |
|      +-- Data export                                  |
|                                                       |
+-------------------------------------------------------+
```

---

## 14. Phased Implementation Plan

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Core infrastructure, auth, and basic calendar rendering

| Task | Details |
|------|---------|
| Set up Cloudflare project | Workers + D1 + R2 + Pages configuration |
| Database schema | Create all tables from Section 12 |
| Auth system | JWT middleware, invite code generation/validation, signup/login flows |
| PWA skeleton | Vite + React + TypeScript + Workbox setup |
| Continuous calendar component | Virtualized week rows, month demarcation, basic event display |
| Holiday list (built-in) | US federal holidays auto-populated per year; configurable by country |
| School holiday editor | User-facing UI to add/remove school break dates; stored in D1 |
| Member color assignment | Auto-assign from palette on account creation |

**Deliverable:** User can sign up with invite code, see a continuous calendar with no events.

### Phase 2: Events & Reminders (Weeks 3-4)

**Goal:** Full event CRUD and reminder system

| Task | Details |
|------|---------|
| Event API endpoints | Create, read, update, delete events |
| Event creation UI | Modal form with date/time/repeat/assign controls |
| Reminder engine (Worker cron) | Scheduled triggers for fixed reminders via Cloudflare Cron Triggers |
| Ack-triggered delayed reminders | Core ack-delay loop logic |
| Reminder state machine | All states from Section 4.2 implemented |
| Calendar event display | Event pills on continuous calendar, multi-day spans |

**Deliverable:** User can create events with reminders; delayed reminders fire after ack delay.

### Phase 3: Multi-User & Sharing (Weeks 5-6)

**Goal:** Household management and shared calendar

| Task | Details |
|------|---------|
| Invite code system | Generation, validation, single-use enforcement |
| Member management UI | List members, roles, remove members |
| Event assignment | Assign events to specific members |
| Shared reminder view | Members see assigned reminders on their calendar |
| WebSocket updates | Real-time sync of event/reminder changes |
| Conflict resolution | Last-write-wins with notification |

**Deliverable:** Multiple household members can create and share events; real-time updates work.

### Phase 4: Home Assistant Integration (Weeks 7-8)

**Goal:** Deep HA integration for alerts and entity management

| Task | Details |
|------|---------|
| HA connection module | REST API client with existing long-lived token |
| Entity sync | Create template sensors per active reminder |
| Automation generation | YAML automation files for escalation paths |
| Voice announcement routing | POST to HA notify service for Echo/Google Home |
| Bidirectional ack sync | Webhook endpoints in app + HA automation to call them |
| Light/speaker actuation | Escalation via HA services (light.turn_on, media_player.play_media) |

**Deliverable:** Reminders trigger through HA — Echos speak alerts, lights blink on escalation.

### Phase 5: Mobile Push & Offline (Weeks 9-10)

**Goal:** Native mobile experience with offline support

| Task | Details |
|------|---------|
| Capacitor project setup | Wrap PWA in native shell |
| Push notification integration | FCM (Android) + APNs (iOS) via Capacitor plugin |
| Local notifications | Scheduled local reminders for offline use |
| IndexedDB sync layer | "Next 7 days" default sync, full offline mode |
| Background sync | Reconnect and sync on app foreground |
| iOS/Android build & test | Test push delivery, offline behavior, ack from notification |

**Deliverable:** Mobile app with reliable push notifications and offline calendar access.

### Phase 6: Polish & Launch (Weeks 11-12)

**Goal:** UX polish, testing, deployment

| Task | Details |
|------|---------|
| Quiet hours support | Suppress non-critical reminders during set hours |
| Event templates | Quick-add for recurring patterns (holidays, birthdays) |
| Data export | JSON export of all household data |
| Audit log view | Admin/owner can see reminder ack history |
| Performance optimization | Calendar virtualization tuning, bundle size reduction |
| PWA install prompt | Proper manifest.json and service worker for "Add to Home Screen" |
| Documentation | Setup guide, HA integration docs, user manual |

**Deliverable:** Production-ready app deployed on Cloudflare with full documentation.

---

## 15. Open Questions

These items need your input before implementation begins:

### Architecture Decisions

1. ~~**Self-hosted fallback?**~~ **RESOLVED:** Dev runs on Windows PC (Node.js + SQLite). Production targets Cloudflare Workers + D1. The database abstraction layer (Section 2.4.3) makes the swap trivial — no self-hosted equivalent needed beyond what's already specified. See Section 2.4 for full details.
2. **D1 vs Turso?** D1 is convenient but vendor-locked. Turso (libSQL) offers easier migration if needed. Preference?
3. ~~**CI/CD pipeline?**~~ **RESOLVED:** Manual `wrangler` CLI commands — no git push, no CI/CD pipeline. Deploy directly from the Windows PC.

### Home Assistant Integration

4. **HA entity naming convention?** Should generated entities follow a specific prefix pattern (e.g., `sensor.hrc_`, `input_boolean.hrc_`) for easy identification in HA?
5. **Automation storage location?** Write YAML files to `/config/automations/hrc_*` via SMB, or use HA's API to create automations programmatically?
6. **HA as trigger source?** Should the app listen to HA events (motion sensors, door contacts) and convert them into reminders? E.g., "front door opened at 2 AM -> create reminder 'Check front door'."

### Reminder System

7. **Ack delay range limits?** Any minimum/maximum for ack_delay_minutes? (e.g., min 5 min, max 4 hours?)
8. **Snooze option?** Should users be able to snooze a firing reminder (delay by 10/15/30 min) instead of acknowledging or dismissing?
9. **Reminder priority?** Do you need priority levels (low/medium/high/critical) that affect escalation speed and channel selection?

### Mobile Push

10. **Push notification service provider?** Firebase Cloud Messaging (FCM) is the standard for Android; APNs for iOS. Should we use a unified service like OneSignal, or handle FCM + APNs separately?
11. **iOS push certificate management?** APNs requires a push certificate (.p8 key). Who will manage this in Apple Developer account?

### Calendar

12. **Time zone handling?** All reminders stored in UTC, displayed in user's local timezone? Or stored in user's timezone? (UTC is recommended for correctness.)
13. **Holidays & observances?** Should the app include built-in holiday lists or let users import them?

### Household Management

14. **Household limits?** Any max number of members per household? (Suggest 20 as a reasonable cap.)
15. **Guest/temporary access?** Should there be a "guest" role with limited permissions for visitors?

---

#### 14.0.5 Holiday Management (New)

| Task | Details |
|------|---------|
| Built-in public holiday list | US federal holidays auto-populated per year, configurable by country |
| School holiday editor | User-facing UI to add/remove school break dates; stored in D1 |
| Holiday legend | Rendered at top of calendar view (toggleable) |
| Holiday toggle settings | Per-user: show/hide public holidays, show/hide school holidays |

### 14. Phased Implementation Plan

| Term | Definition |
|------|------------|
| **Ack** | Acknowledgment — user confirms they have seen and will act on a reminder |
| **Ack delay** | Time window after acknowledgment before the next alarm fires if task is not complete |
| **Continuous calendar** | Calendar layout where weeks flow sequentially without month-boundary gaps |
| **Escalation** | Increasing alert intensity (push -> voice -> lights) when a reminder goes unacknowledged |
| **HA** | Home Assistant |
| **PWA** | Progressive Web App — web app installable on mobile/desktop with offline support |
| **Capacitor** | Framework for wrapping web apps as native iOS/Android apps |
| **D1** | Cloudflare's edge-native SQLite database |
| **R2** | Cloudflare's S3-compatible object storage |

## Appendix B: References

- [Continuous Calendar Design](https://www.jonkrohn.com/posts/2021/6/25/continuous-calendars)
- [Home Assistant REST API Docs](https://developers.home-assistant.io/docs/api/rest/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Capacitor Push Notifications](https://capacitorjs.com/docs/guides/push-notifications)
- [RRULE Specification (RFC 5545)](https://datatracker.ietf.org/doc/html/rfc5545)

