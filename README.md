# EnsÅ

The household's loops, kept turning without strain (å††ç›¸, the Zen circle â€” see SPEC Â§1).

Household calendar PWA with reminders, **rolling timers** (restart on Ack) and shared
shopping / wish lists; alerts by
phone push and spoken in the house through Home Assistant. **The spec is `SPEC.md`** â€”
it is the source of truth; `docs/history.md` records the prototype's status and deviations.
Changes go into the spec first, then get built â€” see `CLAUDE.md`.

**Status:** live at https://enso.sogodojo.com. Calendar, alarms, timers, lists, chores, phone
push and house announcements are built; House alerts are spoken by the Worker itself through a
Cloudflare Tunnel to Home Assistant (v1.7.0 â€” no relay at home). Details in `docs/history.md` §14.

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

Things to do, once per account (`docs/history.md` §11 M4g): `npx wrangler r2 bucket create enso-photos`, then
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
§7E.2c). When it blocks the Worker, `POST /recipes/from-video` asks **SogoAI**, the always-on home PC
(Windows 11, Node 24), **in-line**: one `GET https://sogoai.sogodojo.com/captions?v=…` through Cloudflare
Access and the `sogoai` Cloudflare Tunnel, answered by a small helper that reads the captions from home
with the same `youtube-captions.ts`. The recipe is read once and saved complete; nothing is queued or
polled.

```
Worker --HTTPS, CF-Access-Client-Id/-Secret + Bearer CAPTIONS_TOKEN--> Cloudflare Access (enso-worker token)
  --> tunnel `sogoai` --> cloudflared (a Windows service on SogoAI) --> http://127.0.0.1:8790 (the helper)
```

The helper listens on `127.0.0.1:8790` only, never on the LAN. `cloudflared`, running as a Windows service
on SogoAI, carries the tunnel outbound, so no port is opened at home. Access lets through only the
`enso-worker` service token, the same one House delivery uses (`CF_ACCESS_CLIENT_ID` /
`CF_ACCESS_CLIENT_SECRET`, above), and the helper also checks the bearer. `HOME_CAPTIONS_URL` is a var in
`wrangler.toml`. Without the Access secrets or `CAPTIONS_TOKEN`, a blocked video is saved with "captions
couldn't be read: from home: captions from home aren't set up."

**Snap an item (SPEC §7A.3).** The same helper names a photographed list item: the Worker sends the image to
`POST https://sogoai.sogodojo.com/identify` (same Access token, same bearer, 20 s), and the helper asks **LM
Studio** on SogoAI (`http://127.0.0.1:1234/v1/chat/completions`, OpenAI-compatible) with the always-loaded
vision model named by `IDENTIFY_MODEL` (`qwen-uncensored`), the prompt plus ` /no_think`, the image as a data
URL, 15 s. It answers `{ ok: true, text }` or `{ ok: false, kind: off | failed, reason }`; the Worker cleans the
text into a name. Only when SogoAI gives no name — not set up, failed, or "UNKNOWN" — does the Worker pay for
the Claude API (counted against the 40-a-day photo reads). Without `IDENTIFY_MODEL` the helper still starts
and serves captions; `/identify` answers `off` and Claude is asked.

### The Worker's secret (once)

In a **real PowerShell window** (never a `!` command), with a long random value:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$token = -join ($b | ForEach-Object { $_.ToString('x2') }); $token   # keep it for SogoAI's env file
npx wrangler secret put CAPTIONS_TOKEN                                # paste the same value
```

### Files on SogoAI: `C:\Enso\`, never in the repo

| File | From |
|---|---|
| `captions-helper.mjs` | `npm run build:home` on the dev PC → `home/dist/captions-helper.mjs` (one file; it imports only `node:http`) |
| `captions-helper.cmd` | `home/captions-helper.cmd` (runs `node --env-file=captions-helper.env captions-helper.mjs`, appending to `captions-helper.log`) |
| `captions-helper.env` | written by hand there: `CAPTIONS_TOKEN` and `IDENTIFY_MODEL=qwen-uncensored` |

Write the env file without a byte-order mark (PowerShell 5's `Set-Content -Encoding utf8` adds one):

```powershell
New-Item -ItemType Directory -Force C:\Enso | Out-Null
[IO.File]::WriteAllText('C:\Enso\captions-helper.env', "CAPTIONS_TOKEN=<the token>`nIDENTIFY_MODEL=qwen-uncensored`n")
```

The tunnel's public hostname `sogoai.sogodojo.com` points at `http://127.0.0.1:8790`, and its Access
application allows the `enso-worker` service token (both set up once in the Cloudflare dashboard).

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
Get-Content C:\Enso\captions-helper.log -Tail 5   # "captions helper listening on http://127.0.0.1:8790"
```

`node` must be on the machine PATH (the Node installer puts it there). Without `CAPTIONS_TOKEN` in the env
file the helper logs that and exits (code 1). At start it also logs `identify: model qwen-uncensored` (or
`identify: off (IDENTIFY_MODEL is not set)`). The log gets one line per request (the video id, or `identify`,
and what came back); the token and the image are never written to it.

To check it: on SogoAI, `Invoke-WebRequest http://127.0.0.1:8790/captions?v=x` answers 401 (no bearer), and
`Invoke-WebRequest -Method Post http://127.0.0.1:8790/identify` answers 401 too.
From anywhere else, `https://sogoai.sogodojo.com` answers 403 without the Access service token, and 502
with it while the helper isn't running.

### Updating the helper

On the dev PC `npm run build:home`, then copy `home/dist/captions-helper.mjs` over
`C:\Enso\captions-helper.mjs` on SogoAI and restart it there. The same scheduled task launches the new one:

```powershell
Stop-ScheduledTask -TaskName 'Enso captions helper'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object CommandLine -like '*captions-helper.mjs*' |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName 'Enso captions helper'
Get-Content C:\Enso\captions-helper.log -Tail 3
```

Coming from v1.16.0 or v1.17.0 (captions only): stop it as above, copy the new `.mjs`, add
`IDENTIFY_MODEL=qwen-uncensored` to the env file (keeping `CAPTIONS_TOKEN`; no byte-order mark), then start the
task and check the log says `identify: model qwen-uncensored`:

```powershell
[IO.File]::AppendAllText('C:\Enso\captions-helper.env', "IDENTIFY_MODEL=qwen-uncensored`n")
```

Coming from the polling helper (v1.15.0): stop it as above, copy the new `.mjs`, rewrite the env file to
`CAPTIONS_TOKEN` and `IDENTIFY_MODEL` only (drop `ENSO_URL`), then start the task.

A new token is `npx wrangler secret put CAPTIONS_TOKEN` plus the same value in `captions-helper.env`, then
the restart above.

## Ping MojoSOGO's phone from a Claude session (ops/notify)

A Claude Code session on MojoSOGO's machines can push a message to **his own phone** (the founder's)
with `POST /api/v1/ops/notify` (SPEC §9.4) — "it's live", a question, a blocker. It sits beside the
FunHouse desk device and the house voice. The recipient is always the founder; at most 30 pings an hour
(then 429). There is no session: the call carries `Authorization: Bearer <OPS_NOTIFY_TOKEN>`. With the
secret unset the route answers 503 `ops_notify_off` — never open.

### The token (once)

In a **real PowerShell window** (never a `!` command, which saves an empty secret and still says
Success), make a long random value, keep it in the token file, and give the Worker the same one:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
$token = -join ($b | ForEach-Object { $_.ToString('x2') })
New-Item -ItemType Directory -Force "$env:USERPROFILE\.enso" | Out-Null
[IO.File]::WriteAllText("$env:USERPROFILE\.enso\ops-notify-token", $token)   # no BOM, no newline
npx wrangler secret put OPS_NOTIFY_TOKEN                                     # paste the same value
```

The token file is `%USERPROFILE%\.enso\ops-notify-token` on each machine that pings; it is never in a
repo. A new token is the same steps again.

### Sending one

PowerShell (Windows PowerShell 5.1 too — the body is sent as UTF-8 bytes so the emoji survive):

```powershell
$t = (Get-Content "$env:USERPROFILE\.enso\ops-notify-token" -Raw).Trim(); $r = Invoke-RestMethod -Method Post -Uri https://enso.sogodojo.com/api/v1/ops/notify -Headers @{ Authorization = "Bearer $t" } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{ text = 'Ensō v1.17.0 is live'; title = '🤖 Claude ⭕🔁🏠' } | ConvertTo-Json -Compress))); $r.deliveries[0]
```

curl (Git Bash, where `~` is `%USERPROFILE%`):

```bash
curl -s -X POST https://enso.sogodojo.com/api/v1/ops/notify -H "Authorization: Bearer $(cat ~/.enso/ops-notify-token)" -H 'Content-Type: application/json; charset=utf-8' --data '{"text":"Ensō v1.17.0 is live","title":"🤖 Claude ⭕🔁🏠"}'
```

`text` is 1–200 characters; `title` is optional (at most 60; default "🤖 Claude"). The answer is
`201 { deliveries: [{ id, status, detail }] }`. **The ping was delivered only when
`deliveries[0].status == 'sent'`; otherwise report the `detail`** (`no_subscription` — his phone has
no alerts turned on; `push_not_configured` — the push keys are missing; or the push service's error).
Errors: 503 `ops_notify_off`, 401 `unauthorized`, 400 `invalid_input`, 429 `rate_limited`. Never print
the token or the Authorization header.

### From a project thread in the cloud

Cloud sessions can't read the token file. The project's cloud environment carries it as the environment variable
`ENSO_OPS_NOTIFY_TOKEN` (same value), with `enso.sogodojo.com` under Allowed domains. A thread pings only when it
waits on MojoSOGO, with the title "🧵 Thread needs you":

```bash
curl -sS -m 10 -X POST https://enso.sogodojo.com/api/v1/ops/notify -H "Authorization: Bearer $ENSO_OPS_NOTIFY_TOKEN" -H 'Content-Type: application/json; charset=utf-8' --data "$(jq -nc --arg t 'Thread title: what is needed' '{text:$t[:200],title:"🧵 Thread needs you"}')"
```

### The same pings on the FunHouse (SPEC §9.4a)

The FunHouse bridge on the dev PC listens only on 127.0.0.1:8765, so the dev PC pulls: `home/funhouse-poller.ts`
asks `GET /api/v1/ops/pings` every 15 s and hands Claude's pings (🤖 / 🧵) to the bridge. It reads the same token
file. Build it and start it at logon (once, in a normal PowerShell on the dev PC):

```powershell
cd C:\Users\Public\git\Enso; git pull; npm run build:home
$action  = New-ScheduledTaskAction -Execute 'C:\Users\Public\git\Enso\home\funhouse-poller.cmd' -WorkingDirectory 'C:\Users\Public\git\Enso\home'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'Enso FunHouse poller' -Action $action -Trigger $trigger -Settings $settings -Force
Start-ScheduledTask -TaskName 'Enso FunHouse poller'; Start-Sleep 3
Get-Content C:\Users\Public\git\Enso\home\funhouse-poller.log -Tail 3   # "funhouse poller: … every 15s"
```

After a change to `home/funhouse-poller.ts`: `npm run build:home`, then stop the node process running
`funhouse-poller.mjs` and `Start-ScheduledTask -TaskName 'Enso FunHouse poller'`. `funhouse-poller.log` gets one line
per notice (the ping id and the bridge's answer), never the token.
