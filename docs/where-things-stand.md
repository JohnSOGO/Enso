# Where Ensō stands

A hand-off page for a new session (any Claude surface, or a person). It points to the real sources and doesn't
restate them. **SPEC.md is the source of truth**: §14 holds status and deviations, §13 holds the ⚑ defaults
MojoSOGO hasn't confirmed. Run, test and deploy steps live in README.md, ownership in `docs/module-ownership.md`, and
the working agreement in `CLAUDE.md`.

*Last updated 2026-10-10, v1.40.0, main = production.*

## Running where

| Part | Where | Notes |
|---|---|---|
| App (Worker + PWA) | https://enso.sogodojo.com | Cloudflare Worker `enso`, D1 `enso`, R2 photos. The opening screen shows the live version and commit. |
| Home Assistant voice | ha.sogodojo.com → HA (192.168.0.123) | Cloudflare tunnel `haosdojo` (HA Cloudflared add-on), Access service token `enso-worker`. SPEC §9.2. |
| Home helper | sogoai.sogodojo.com → SogoAI 127.0.0.1:8790 | Tunnel `sogoai` (Cloudflared service on SogoAI), the same Access token plus Bearer `CAPTIONS_TOKEN`. It fetches YouTube captions (§7E.2c) and names item photos with LM Studio's `qwen-uncensored` (§7A.3). Built from `home/` with `npm run build:home`. Its notes on SogoAI: `C:\Users\Public\git\SogolAI\ENSO-HOME-HELPER.md`. |
| Claude → MojoSOGO's phone | `POST /api/v1/ops/notify` | Bearer `OPS_NOTIFY_TOKEN` (README "Ping MojoSOGO's phone"). Always goes to the founder, John Redman, who is MojoSOGO. |

## Secrets: where the values live (never in the repo)

- **Worker secrets** (`wrangler secret list`): ANTHROPIC_API_KEY, YOUTUBE_API_KEY, HA_TOKEN, CF_ACCESS_CLIENT_ID,
  CF_ACCESS_CLIENT_SECRET, CAPTIONS_TOKEN, OPS_NOTIFY_TOKEN, VAPID_PRIVATE_KEY, SETUP_TOKEN.
- **Local copies on the dev PC**, in `C:\Users\Public\git\HomeAssistant\secrets\`: ha_token, cf_access_enso,
  cf_tunnel_token / cf_tunnel_sogoai, captions_token, cf_api_token (the YouTube key is the `API_TOK_YT_ENSO` line). The ops ping
  token is in `%USERPROFILE%\.enso\ops-notify-token`. SogoAI's copy of CAPTIONS_TOKEN is in `C:\Enso\captions-helper.env`.
- Set a secret by piping it from its file into `npx wrangler secret put NAME`. Don't use `!`-prefixed prompts: they
  saved an empty key once.
- **Expiry:** the Access service token `enso-worker` expires **2027-10-04**. Renew it before then, or House voice,
  captions and photo naming all fail. The House badge shows it.

## Deploy routine (one session at a time)

1. Merge the topic branch to `main`, then run `npm run typecheck && npm test && npm run arch:audit`. A test-run crash
   with exit -1073740791 is a known flake; rerun it.
2. Additive migration: `CI=1 npm run db:migrate:remote`, **then** `npm run deploy`. Dropping migrations go after the deploy.
3. Check the live stamp: `curl -s https://enso.sogodojo.com/ | grep -oE "v1\.[0-9.]+ · [0-9a-f]+"`.
4. If `home/` or anything it bundles changed (`src/worker/youtube-captions.ts`, `src/shared/item-reading.ts` and what it
   imports, among them `src/shared/photos.ts`, the photo-size cap): rebuild, copy it to SogoAI (`ssh sogoai`), and restart the "Enso captions helper" task (README).

## Owed

- Prune about 25 old merged topic branches.
- Look into the intermittent test-runner crash.
- README has mis-encoded characters (`Â§`) in older sections.
- Each person's speakers (v1.19.0, §9.2a) is live: check Home Assistant's real list in Settings → Me, and have each
  person tick theirs. Q125–Q129 are ⚑ defaults awaiting MojoSOGO.
- Dishwasher (deferred by MojoSOGO). Phase C kitchen display (needs an AREC).
- Real-phone checks still owed per SPEC §14 (Android push, Done/Snooze, the laundry and goat reminders in practice).
- Code-steward: pass 1 items 6–10 wait until those files are next touched; pass 3 items 1–4 and pass 5 items 1–3 and pass 6 items 1–4
  (one maps rule for things and events, and Plan it filling an event's Address; the read-text cap wording) wait on
  MojoSOGO's pick. Reports are in `docs/steward/`.
- Rolling timer day start (v1.36.0, §5.5a): hear it at a real window opening.
- Event address and paste (v1.37.0–v1.38.0, §7.9, §7.9a): on the iPhone, Paste a copied text and a screenshot into a
  new event, and a "moved to…" text into an existing one; Open in Maps.
- Things to bring (v1.40.0, §7.10): hear a real event reminder that carries a list, on the phone and a speaker.
