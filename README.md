# Home Reminder Calendar

Household calendar PWA with reminders and **rolling timers** (restart on Ack), alerts by
phone push and spoken in the house through Home Assistant. **The spec is `SPEC.md`** —
it is the source of truth; §14 records the prototype's status and deviations.

The previous local-model build is archived in `archive/v1-local-model/` (reference only).

## Run it locally (Windows, Node 20+)

```powershell
npm install
npm run db:migrate:local      # creates the local D1 in .wrangler/
npm run build                 # builds the PWA into frontend/dist
npm run dev:api               # Worker + API + built PWA on http://localhost:8787
npm run seed:dev              # (fresh DB only) test accounts from scripts/dev-seed.json + sample data
```

For frontend hot reload use `npm run dev` instead (Vite on :5173, proxying `/api`).

Secrets for dev live in `.dev.vars` (gitignored): `SETUP_TOKEN`, `RELAY_TOKEN`, `DEV_ENDPOINTS=1`.

### Simulate the clock

The real cron fires every minute in production. Locally, drive it by hand:

```powershell
curl.exe -X POST "http://localhost:8787/api/v1/dev/tick?now=2026-10-06T13:00:00Z"
```

## Tests

```powershell
npm test          # Vitest inside the Workers runtime; applies migrations/ for real
npm run typecheck # worker + shared, frontend, relay
```

## House announcements — the LAN relay

```powershell
copy relay\relay.config.example.json relay\relay.config.json   # then edit serverUrl / relayToken
npm run relay
```

It polls the Worker every 10 s and speaks each "House" alert on the four Echos **and** the
Voice PE (`relay/relay.ts`). Run it as a Scheduled Task at logon, like the HA watchdog.
While it is not running, the app shows a red **House offline** badge.
