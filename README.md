# Ensō

The household's loops, kept turning without strain (円相, the Zen circle — see SPEC §1).

Household calendar PWA with reminders, **rolling timers** (restart on Ack) and shared
shopping / wish lists; alerts by
phone push and spoken in the house through Home Assistant. **The spec is `SPEC.md`** —
it is the source of truth; §14 records the prototype's status and deviations.
Changes go into the spec first, then get built — see `CLAUDE.md`.

**Status:** live at https://enso.sogodojo.com. Calendar, alarms, timers, lists, chores, phone
push and house announcements are built; House alerts are spoken by the Worker itself through a
Cloudflare Tunnel to Home Assistant (v1.7.0 — no relay at home). Details in SPEC §14.

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

Everything works there except phone push, which needs HTTPS (SPEC §2.3).

Secrets for dev live in `.dev.vars` (gitignored): `SETUP_TOKEN`, `DEV_ENDPOINTS=1`. Without the
three House secrets there (below), local House alerts are visibly `failed`, `house_not_configured`.
Reading photos locally (Things to do, SPEC §7C.4) also needs `ANTHROPIC_API_KEY` there; without it
read-photo answers 503 "Reading photos isn't set up yet." (tests pin it empty, so they never call the API).

Things to do, once per account (SPEC §11 M4g): `npx wrangler r2 bucket create enso-photos`, then
`npx wrangler secret put ANTHROPIC_API_KEY`.

Recipes from YouTube videos (SPEC §7E) also need `YOUTUBE_API_KEY` (a Google Cloud API key with the
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
npm run typecheck # worker + shared, frontend, scripts
npm run arch:audit # file sizes vs caps; warning band at 90 % (SPEC §2.5)
```

## House announcements — Cloudflare Tunnel to Home Assistant

The Worker speaks every "House" alert and announcement itself, on the four Echos **and** the
Voice PE, by calling Home Assistant at `https://ha.sogodojo.com` (SPEC §9.2,
`src/worker/house.ts`). Nothing runs on the home PC for this; the old LAN relay is retired.
If House stops working the app shows a red **🔇 House failing** (or **House not set up**) badge,
and Settings → Status shows the last error.

### Home Assistant side (once)

1. Install the **Cloudflared** add-on and publish `ha.sogodojo.com` → Home Assistant through it.
2. In `configuration.yaml`, let HA trust the add-on's forwarded requests, then restart HA:

   ```yaml
   http:
     use_x_forwarded_for: true
     trusted_proxies:
       - 172.30.33.0/24
   ```

### Cloudflare Access side (once)

1. Zero Trust → Access → Service credentials: create a **service token** for the Worker. Keep its
   Client ID and Client Secret.
2. Protect `ha.sogodojo.com` with an Access application whose policy action is **Service Auth**,
   including that service token. A request without it gets a 302 to the Access login page,
   which the Worker records as `failed` (never as spoken).

### The Worker's secrets (once per account)

The vars (`HA_URL`, `ECHO_TARGETS`, `ECHO_TYPE`, `SATELLITE_ENTITY`) are in `wrangler.toml`. The
three secrets must be typed in a **real PowerShell window** — not through a `!` command in a
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
