# Home Reminder Calendar

Household calendar + reminder app with Home Assistant integration.

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+ LTS
- npm 10+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up local secrets
cp .env.example .env
# Edit .env: add your HA token, JWT secret, webhook secret

# 3. Initialize database
npm run db:init

# 4. Start dev server (backend) — http://localhost:3001
npm run dev

# 5. In a separate terminal, start PWA frontend — http://localhost:5173
cd packages/frontend && npm run dev
```

### Browser Validation

Open `http://localhost:5173` and resize the browser window to test responsive layouts:

| Width | Target | Check |
|-------|--------|-------|
| 320–480px | Mobile portrait | Calendar, events, reminders render correctly |
| 768px+ | Tablet/desktop | Layout adapts gracefully |

## Deployment (Cloudflare)

```bash
# 1. Create D1 database on Cloudflare
wrangler d1 create hrc

# 2. Run schema on D1
wrangler d1 execute hrc --file=src/db/schema.sql

# 3. Set secrets
wrangler secret put HA_TOKEN
wrangler secret put JWT_SECRET
wrangler secret put WEBHOOK_SECRET

# 4. Update wrangler.toml with your D1 database_id

# 5. Deploy
npm run deploy
```

## Architecture

- **Dev:** Node.js + Hono + SQLite on Windows PC (`src/server.ts`)
- **Production:** Cloudflare Workers + D1 (`wrangler.toml` → `wrangler deploy`)
- **Database abstraction:** `src/lib/db.ts` — swap SQLite ↔ D1 with one config line
- **PWA:** React 19 + Vite + Workbox (`packages/frontend/`)

## Project Structure

```
HomeReminderCalendar/
├── src/
│   ├── api/              # Hono routes (auth, events, reminders, ha)
│   ├── db/               # schema.sql + DB implementations
│   ├── lib/              # DB abstraction, auth, holidays
│   ├── workers/          # Cloudflare Workers entry point
│   └── server.ts         # Local dev server
├── packages/
│   └── frontend/         # PWA (React/Vite)
├── scripts/              # init-db.js
├── .env.example
├── wrangler.toml
└── package.json
```

## Spec

Full specification: [SPEC.md](SPEC.md)
