# Ensō

The household's loops, kept turning without strain (円相, the Zen circle — see SPEC §1).

Household calendar PWA with reminders, **rolling timers** (restart on Ack) and shared
shopping / wish lists; alerts by
phone push and spoken in the house through Home Assistant. **The spec is `SPEC.md`** —
it is the source of truth; §14 records the prototype's status and deviations.
Changes go into the spec first, then get built — see `CLAUDE.md`.

**Status:** prototype, local only. Calendar, alarms, timers and the relay work; phone
push is not sent yet (M5), and nothing is deployed (M7). Details in SPEC §14.

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
npm run typecheck # worker + shared, frontend, relay, scripts
npm run arch:audit # file sizes vs caps; warning band at 90 % (SPEC §2.5)
```

## House announcements — the LAN relay

```powershell
copy relay\relay.config.example.json relay\relay.config.json   # then edit serverUrl / relayToken
npm run relay
```

It polls the Worker every 10 s and speaks each "House" alert on the four Echos **and** the
Voice PE (`relay/relay.ts`). While it is not running, the app shows a red **House offline**
badge.

### Start it at logon

`relay/relay-task.vbs` runs the relay in a hidden window, does nothing if one is already
running, and restarts it 30 s after it exits — the same pattern as the HA watchdog.
Put a shortcut to it in your Startup folder:

```powershell
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\HRC relay.lnk")
$lnk.TargetPath = "C:\Users\Public\git\HomeReminderCalendar\relay\relay-task.vbs"
$lnk.Save()
```

Start it now without logging out: `wscript relay\relay-task.vbs`. Logs: `relay\relay.log`
(normal output) and `relay\relay-crash.log` (a crash's stderr). To stop it, end the
`node.exe` whose command line contains `relay.ts`.
