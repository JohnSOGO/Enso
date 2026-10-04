# EnsÅ

The household's loops, kept turning without strain (å††ç›¸, the Zen circle â€” see SPEC Â§1).

Household calendar PWA with reminders, **rolling timers** (restart on Ack) and shared
shopping / wish lists; alerts by
phone push and spoken in the house through Home Assistant. **The spec is `SPEC.md`** â€”
it is the source of truth; Â§14 records the prototype's status and deviations.
Changes go into the spec first, then get built â€” see `CLAUDE.md`.

**Status:** live at https://enso.sogodojo.com. Calendar, alarms, timers, lists, chores, phone
push and house announcements are built; House alerts are spoken by the Worker itself through a
Cloudflare Tunnel to Home Assistant (v1.7.0 â€” no relay at home). Details in SPEC Â§14.

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

### On your phone, at home

`npm run build` then `npm run dev:lan` (instead of `dev:api`) and open
`http://<this PC's LAN IP>:8787` on the phone, e.g. `http://192.168.0.72:8787`. Once, in
an **administrator** PowerShell, let the home network reach it:

```powershell
New-NetFirewallRule -DisplayName "Enso dev server (home network)" -Direction Inbound -Protocol TCP -LocalPort 8787 -Profile Private -Action Allow
```

Everything works there except phone push, which needs HTTPS (SPEC Â§2.3).

Secrets for dev live in `.dev.vars` (gitignored): `SETUP_TOKEN`, `DEV_ENDPOINTS=1`. Without the
three House secrets there (below), local House alerts are visibly `failed`, `house_not_configured`.
Reading photos locally (Things to do, SPEC Â§7C.4) also needs `ANTHROPIC_API_KEY` there; without it
read-photo answers 503 "Reading photos isn't set up yet." (tests pin it empty, so they never call the API).

Things to do, once per account (SPEC Â§11 M4g): `npx wrangler r2 bucket create enso-photos`, then
`npx wrangler secret put ANTHROPIC_API_KEY`.

Recipes from YouTube videos (SPEC Â§7E) also need `YOUTUBE_API_KEY` (a Google Cloud API key with the
YouTube Data API v3 enabled): `npx wrangler secret put YOUTUBE_API_KEY`, typed in a **real PowerShell
window**. Without it (or without `ANTHROPIC_API_KEY`) reading a video answers 503 "Reading recipes from
videos isn't set up yet."; typed recipes still work. Tests pin both keys empty.

### Simulate the clock

The real cron fires every minute in production. Locally, drive it by hand:

```powershell
curl.exe -X POST "http://localhost:8787/api/v1/dev/tick?now=2026-10-06T13:00:00Z"
```

## Tests

```powershell
npm test          # Vitest inside the Workers runtime; applies migrations/ for real
npm run typecheck # worker + shared, frontend, scripts, home
npm run arch:audit # file sizes vs caps; warning band at 90 % (SPEC Â§2.5)
```

## House announcements â€” Cloudflare Tunnel to Home Assistant

The Worker speaks every "House" alert and announcement itself, on the four Echos **and** the
Voice PE, by calling Home Assistant at `https://ha.sogodojo.com` (SPEC Â§9.2,
`src/worker/house.ts`). Nothing runs on the home PC for this; the old LAN relay is retired.
If House stops working the app shows a red **ðŸ”‡ House failing** (or **House not set up**) badge,
and Settings â†’ Status shows the last error.

### Home Assistant side (once)

1. Install the **Cloudflared** add-on and publish `ha.sogodojo.com` â†’ Home Assistant through it.
2. In `configuration.yaml`, let HA trust the add-on's forwarded requests, then restart HA:

   ```yaml
   http:
     use_x_forwarded_for: true
     trusted_proxies:
       - 172.30.33.0/24
   ```

### Cloudflare Access side (once)

1. Zero Trust â†’ Access â†’ Service credentials: create a **service token** for the Worker. Keep its
   Client ID and Client Secret.
2. Protect `ha.sogodojo.com` with an Access application whose policy action is **Service Auth**,
   including that service token. A request without it gets a 302 to the Access login page,
   which the Worker records as `failed` (never as spoken).

### The Worker's secrets (once per account)

The vars (`HA_URL`, `ECHO_TARGETS`, `ECHO_TYPE`, `SATELLITE_ENTITY`) are in `wrangler.toml`. The
three secrets must be typed in a **real PowerShell window** â€” not through a `!` command in a
Claude session, which saves an empty value and still says Success:

```powershell
npx wrangler secret put HA_TOKEN                  # a Home Assistant long-lived access token
npx wrangler secret put CF_ACCESS_CLIENT_ID       # the service token's Client ID
npx wrangler secret put CF_ACCESS_CLIENT_SECRET   # the service token's Client Secret
```

The old `RELAY_TOKEN` secret is no longer used; `npx wrangler secret delete RELAY_TOKEN` tidies it.
For local dev, the same three names go in `.dev.vars`. Tests never use them: `vitest.config.ts`
pins `HA_URL` to `https://ha.test` and the secrets empty, so no test can speak in the house.

**Retiring the old relay on the home PC:** delete the `HRC relay` shortcut from the Startup
folder and end the `node.exe` whose command line contains `relay.ts`.

## Captions from home (SogoAI)

YouTube refuses captions to Cloudflare's addresses (LOGIN_REQUIRED) but serves a home one (SPEC
Â§7E.2c). **SogoAI**, the always-on home PC (Windows 11, Node 24), runs a small helper that polls
`https://enso.sogodojo.com/api/v1/captions/claim` every 10 s, reads a blocked video's captions from
home with the same `youtube-captions.ts`, and posts them to `/captions/report`; the Worker re-reads the
recipe. It only calls out â€” nothing at home is exposed. Without `CAPTIONS_TOKEN` the Worker never queues
a job and the two routes answer 503.

### The Worker's secret (once)

In a **real PowerShell window** (never a `!` command), with a long random value:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$token = -join ($b | ForEach-Object { $_.ToString('x2') }); $token   # keep it for SogoAI's env file
npx wrangler secret put CAPTIONS_TOKEN                                # paste the same value
```

### Files on SogoAI â€” `C:\Enso\`, never in the repo

| File | From |
|---|---|
| `captions-helper.mjs` | `npm run build:home` on the dev PC â†’ `home/dist/captions-helper.mjs` (one file, no packages) |
| `captions-helper.cmd` | `home/captions-helper.cmd` (runs `node --env-file=captions-helper.env captions-helper.mjs`, appending to `captions-helper.log`) |
| `captions-helper.env` | written by hand there: `ENSO_URL` and `CAPTIONS_TOKEN` |

Write the env file without a byte-order mark (PowerShell 5's `Set-Content -Encoding utf8` adds one):

```powershell
New-Item -ItemType Directory -Force C:\Enso | Out-Null
[IO.File]::WriteAllText('C:\Enso\captions-helper.env', "ENSO_URL=https://enso.sogodojo.com`nCAPTIONS_TOKEN=<the token>`n")
```

### The startup task (once, in an **administrator** PowerShell on SogoAI)

Runs at startup whether anyone is logged on or not (S4U: no stored password), never times out, and is
restarted every minute if it fails:

```powershell
$action    = New-ScheduledTaskAction -Execute 'C:\Enso\captions-helper.cmd' -WorkingDirectory 'C:\Enso'
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Enso captions helper' -Action $action -Trigger $trigger -Principal $principal -Settings $settings
Start-ScheduledTask -TaskName 'Enso captions helper'
Get-Content C:\Enso\captions-helper.log -Tail 5   # "captions helper polling https://enso.sogodojo.com every 10 s"
```

`node` must be on the machine PATH (the Node installer puts it there). The log gets one line per job and
one per error; the token is never written to it.

### Updating the helper

On the dev PC `npm run build:home`, copy `home/dist/captions-helper.mjs` over `C:\Enso\captions-helper.mjs`
on SogoAI, then restart it there:

```powershell
Stop-ScheduledTask -TaskName 'Enso captions helper'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object CommandLine -like '*captions-helper.mjs*' |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName 'Enso captions helper'
```

A new token is `npx wrangler secret put CAPTIONS_TOKEN` plus the same value in `captions-helper.env`, then
the restart above.
