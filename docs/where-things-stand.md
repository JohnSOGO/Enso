# Where Ensō stands

A hand-off page for a new session (any Claude surface, or a person). It points to the real sources and doesn't
restate them. **SPEC.md is the source of truth** for behavior; `docs/history.md` holds status and deviations
(§14) and `docs/decisions.md` every Q and the ⚑ defaults MojoSOGO hasn't confirmed. Run, test and deploy steps live in README.md, ownership in `docs/module-ownership.md`, and
the working agreement in `CLAUDE.md`.

*Last updated 2026-10-23, v1.106.0, main = production.*

## Running where

| Part | Where | Notes |
|---|---|---|
| App (Worker + PWA) | https://enso.sogodojo.com | Cloudflare Worker `enso`, D1 `enso`, R2 photos. The opening screen shows the live version and commit. |
| Home Assistant voice | ha.sogodojo.com → HA (192.168.0.123) | Cloudflare tunnel `haosdojo` (HA Cloudflared add-on), Access service token `enso-worker`. SPEC §9.2. |
| Home helper | sogoai.sogodojo.com → SogoAI 127.0.0.1:8790 | Tunnel `sogoai` (Cloudflared service on SogoAI), the same Access token plus Bearer `CAPTIONS_TOKEN`. It fetches YouTube captions (§7E.2c), names item photos (§7A.3) and marks notes (§8.4a) with LM Studio's `photo-polish` (`IDENTIFY_MODEL`). Notes are asked only while the PC model manager (127.0.0.1:8793 `/state`, no lease) shows that model loaded and idle. Built from `home/` with `npm run build:home`. Its notes on SogoAI: `C:\Users\Public\git\SogolAI\ENSO-HOME-HELPER.md`. |
| Weather forecast | api.open-meteo.com (free, no key) | `WEATHER_URL` var in wrangler.toml; fetched once a day by the tick (§7.11). Empty turns weather off. |
| Claude → MojoSOGO's phone | `POST /api/v1/ops/notify` | Bearer `OPS_NOTIFY_TOKEN` (README "Ping MojoSOGO's phone"). Always goes to the founder, John Redman, who is MojoSOGO. |
| Claude → the FunHouse | `GET /api/v1/ops/pings`, polled by the dev PC | Scheduled task "Enso FunHouse poller" on SogoGamerPC runs `home/funhouse-poller.cmd` (README "The same pings on the FunHouse"); hands Claude's pings and 🎪 FunHouse alerts (§9.4b) to the bridge on 127.0.0.1:8765. Cloud threads ping with `ENSO_OPS_NOTIFY_TOKEN` from the project's cloud environment. |

## Secrets: where the values live (never in the repo)

- **Worker secrets** (`wrangler secret list`): ANTHROPIC_API_KEY, YOUTUBE_API_KEY, HA_TOKEN, CF_ACCESS_CLIENT_ID,
  CF_ACCESS_CLIENT_SECRET, CAPTIONS_TOKEN, OPS_NOTIFY_TOKEN, VAPID_PRIVATE_KEY, SETUP_TOKEN, BUILD_FIRE_TOKEN (Build now, §8.18 part 6: made at claude.ai/code/routines → "Enso daily feature requests" → Edit → API trigger → Generate token; not set until John does it).
- **Local copies on the dev PC**, in `C:\Users\Public\git\HomeAssistant\secrets\`: ha_token, cf_access_enso,
  cf_tunnel_token / cf_tunnel_sogoai, captions_token, cf_api_token (the YouTube key is the `API_TOK_YT_ENSO` line). The ops ping
  token is in `%USERPROFILE%\.enso\ops-notify-token`. SogoAI's copy of CAPTIONS_TOKEN is in `C:\Enso\captions-helper.env`.
- Set a secret by piping it from its file into `npx wrangler secret put NAME`. Don't use `!`-prefixed prompts: they
  saved an empty key once.
- **Expiry:** the Access service token `enso-worker` expires **2027-10-04**. Renew it before then, or House voice,
  captions and photo naming all fail. The House badge shows it.

## Deploy routine (one session at a time)

A cloud thread deploys through a Remote Control session on SogoGamerPC (folder `C:\Users\Public\git\Enso`), not by
handing MojoSOGO commands. Since 2026-10-11 that checkout's `.claude/settings.local.json` (on the PC only, never
committed) allows these steps by name: typecheck, test, arch:audit, build:home, deploy, db:migrate:remote (also with
`CI=1`) and `git pull`. Run each as its own plain command, exactly as written, so the rule matches. If the permission
check still refuses, say so in the thread: that is the trigger for slice 2 of
`/mnt/project-files/arec-pc-job-runner.md` (a named-job runner on the PC).

1. Merge the topic branch to `main`, then run `npm run typecheck && npm test && npm run arch:audit`. A test-run crash
   with exit -1073740791 is a known flake; rerun it.
2. Additive migration: `CI=1 npm run db:migrate:remote`, **then** `npm run deploy`. Dropping migrations go after the deploy.
   Since v1.78.1 `npm run deploy` refuses while a migration is pending (SPEC §10.1); for a dropping migration that must
   go after the deploy, run `npm run build` then `npx wrangler deploy`. If the PC's safety check blocks the migrate,
   hand MojoSOGO the one-line command at once: v1.77.0 went out without 0050 and no alert sent for a day.
3. Check the live stamp: `curl -s https://enso.sogodojo.com/ | grep -oE "v1\.[0-9.]+ · [0-9a-f]+"`.
4. If `home/` or anything it bundles changed (`src/worker/youtube-captions.ts`, `src/shared/item-reading.ts` and what it
   imports, among them `src/shared/photos.ts`, the photo-size cap): rebuild, copy it to SogoAI (`ssh sogoai`), and restart the "Enso captions helper" task (README).

## Owed

- 🔒 Private events (v1.106.0, §6.3, Q381–Q384): make an event, tick two adults as going, tick 🔒 Private, Save → on a kid's phone the day shows only the time and "🔒 Private", grey, and it doesn't open; on an adult's it shows whole.
- 🧠 You want / I will (v1.105.0–1.105.1, §8.18 parts 3–4, Q380): tap Ensō, say "weekdays 8 to 11 remind me to book the car check", Done → "You want:" the gist, "I will:" numbered steps, "Did I get that right?", a small "I heard:"; the voice says "I will … Did I get that right?"
- 🎤 Record, then write it down (v1.104.0, §8.18 part 2, Q378–Q379): tap Ensō, tap Ensō in the box, talk, tap Ensō → "Writing it down…" → the words in the box; again and again, every time. Workers AI Whisper via the `[ai]` binding (bills to the Cloudflare account, pennies).
- ✨ Guessed event emoji (v1.103.0, §7.6, Q376–Q377 ⚑): on the iPhone, Calendar → tap a day → ＋ → type "Dentist" → the Emoji box shows 🦷 with "✨ guessed"; change the title to "Soccer practice" → ⚽; clear the box → it stays empty; Save → the day shows the emoji. Lists without their own emoji use the same table ("Birthday" list now 🎂).
- 🔒 One privacy rule for money pushes, and highlights tied to how the AI is asked (v1.102.0, §7B.9, §8.4a, Q375):
  nothing new to see. Remembered highlights from v1.101.0 stay; the next prompt change re-asks every note on its own.
- 💾 Remembered highlights (v1.101.0, §8.4a, migration 0062, Q374 ⚑): open an event's notes with ⤢ once and wait for
  "✨ Highlights by the home AI"; close it and open it again (or on another phone) → the same AI highlights show at once,
  with no "Asking…". Edit the notes → it asks again.
- 💵 Declined IOUs (v1.100.0, §7B.9, migration 0061, a 💡 request, AREC arec-iou-declined.md, Q371–Q373 ⚑): Chores → 💵
  IOUs → ＋ IOU someone owes you $1 → on their phone tap **Decline** → your phone gets "💵 Declined" and your card shows it
  under Declined → **Ask again** puts it back in their Waiting for OK. Payments work the same. 🪙 bounty Not yet has the
  same gap (the doer isn't told); John's call.
- ✨ Notes by the home AI (v1.99.0, §8.4a, Q364 confirmed, Q368–Q370 ⚑): on the iPhone, open an event's notes with ⤢.
  The patterns light up at once, the line under the notes reads "✨ Asking the home AI…", then "✨ Highlights by the home
  AI" with things like an allergy or who drives lit up too. With SogoAI busy or off the line says "Highlights by patterns ·
  home AI is busy / is off".
- 📍 Saved places (v1.98.0, §7.9b, migration 0060): on the iPhone, Settings → 📅 Calendar → 📍 Saved places shows Incognito SD.
  New event → 📋 Paste an incognitosd.com event link → Address "2335 Mirador, Vista, CA 92084", the parking notes under
  the notes, "📍 Used Incognito SD."; typing a title with "Incognito" shows 📍 Use Incognito SD. Q365–Q367 are ⚑ defaults.
- 📝 Notes full screen (v1.97.0, §8.4a, Q362–Q364 ⚑): on the iPhone, Calendar → tap a day → an event with 📝 → tap it →
  ⤢ by Notes → the notes fill the screen with times, dates, phones and addresses lit up; tap a phone → it rings; ✏️ Edit →
  • List / ☐ Box; Enter keeps the list going; 👁 View → tap a ☐ to tick it; Done → Save. Same ⤢ on a list item's Note.
- 🎤 Tap to talk + ✏️ Edit (v1.95.0–v1.96.0, §8.18, Q360–Q361; the talk mark is right of Cancel; ✏️ Edit on an answer refills the box with what was heard): reopen the app → no mic ask. Tap the Ensō mark → the box opens quiet; tap
  Ensō in the box → the iPhone asks for the mic once, then it pulses "Listening…"; talk, tap Ensō again → stops; Done.
- 💵 Family IOUs (v1.94.0–v1.94.1, §7B.9, §8.15c, migration 0059; he said "Assume it works", so optional): Chores → 💵 IOUs → ＋ IOU "I owe Mom $1,200" shows on both
  phones at once; one Mom adds waits for your OK; a Pay back waits for her Got it; ☐ Split the bill and ☐ Take it off
  my tab; a weekly Payback plan pings the one who owes at 09:00 on its day, phone only. Q349–Q358 (⚑ except Q349, Q356).
- 🌤️/🌕 on the calendar (v1.92.0–v1.93.0, §7.11, §7.12, §7.5, migration 0058): on the iPhone, the days around Oct 25
  show 🌕 bottom right after the high and the weather emoji; tap one → "🌕 Full moon" in the day sheet. Settings → 📅
  Calendar → Optional calendar items → turn 🌕 Moon phases off → the moons are gone (Weather the same). Q345–Q346, Q348
  are ⚑ defaults.
- 🔔 Only my alerts in my Ringing bar (v1.92.1–v1.92.3, §8.2): a reminder assigned to someone else no longer rings in
  my bar. Q347 is a ⚑ default.
- 🛠 Build now (v1.91.0, §8.18 part 6): an admin saves a small request with the Ensō button → "Build it now?" → Build
  now → the build session starts at once (proved by moon phases, 2026-10-19). Q343–Q344 are ⚑ defaults.
- 📥 Send to Enso (v1.85.0, §7H, §8.8a, migration 0055): on the iPhone, Lists → 📥 Inbox → Set up → Make my key, build the
  Shortcut from the steps, then share a Safari link, a text and a photo; each shows "✅ Saved to your Enso Inbox" and lands in the Inbox. Q319–Q326 are ⚑ defaults.
- The Ensō button (v1.87.0–v1.96.0, §8.18, migrations 0056–0057): on the iPhone, tap the Ensō mark above the tabs, tap Ensō in the box (the mic is asked here, once), say "weekdays 8 to 11 remind me to book the car check", tap Ensō to stop, Done, hear the answer, Yes → the form with 🎲, Save; say something Ensō can't do → Yes → Settings → 💡 Requests (SY-M). Say "order our groceries from Amazon" → Outside, OK → Out of scope in 💡 Requests (Q339). Say "dinner on the 23rd for John and Michelle at 8 PM" → Yes opens the new-event form (Q341). ✏️ Edit on an answer fixes misheard words (Q361). Q331–Q338 are ⚑ defaults. If an old launch picture shows first, remove and re-add the home-screen icon. Build sessions: read `GET /ops/requests` first (CLAUDE.md "Feature requests").
- 🎲 Window reminders (v1.86.0, §8.5c): on the iPhone, Alerts → 📌 Reminders → ＋ Add, tick 🎲, Weekdays 8–11, Save; one push comes between 8 and 11 on the next weekday; Done clears it (RW-M). Q327–Q330 are ⚑ defaults.
- Alert cards (v1.74.0–v1.75.0, §9.5, §8.15a): on the iPhone, tap a Whose mess? push → the card shows the photo and That was me with Not me under it, at the right; answer → the card closes and the line is gone from Settings → Alerts. Same for a ringing alert's Ack. Tap a ping's push → Ack (left) clears it, Close (right) just closes. Q283–Q284 are ⚑ defaults.
- Each person once / Family (v1.73.0, §7.1/§8.3): on the iPhone, an event for everyone shows one green Family chip in the day sheet and one green dot
  on its calendar line; a creator who is also assigned shows once. Q281–Q282 are ⚑ defaults.
- Unassigned emoji by the day number (v1.72.1, §7.2): on the iPhone, an event with nobody assigned shows its emoji beside the date, no line. Q277 is a ⚑ default.
- 12/24-hour clock (v1.72.0, §8.17, migration 0049): on the iPhone, Settings → 🙂 Me → Clock → 24-hour; alarms, a machine's
  done time and My alerts change; switch back (CK4). Q277–Q280 are ⚑ defaults.
- Calendar day lines (v1.71.0, §7.1, Q273–Q276): on the iPhone, a busy day shows one line per event (emoji, then a dot per
  person), shrinks, then `+N`; an event with nobody assigned shows just its emoji (or the event's dot); a wide screen adds time and title.
- Ack in the alert card (v1.70.0, §9.5): on the iPhone, start a 1-min rolling timer, tap its push, see the card with Away / Ack, tap Ack (card closes); tap an old alert's push → the list opens with no card; the card has no Delete. Q272 is a ⚑ default.
- Chores before sunset (v1.69.0, §7B.3, migration 0048): MojoSOGO made "Get the eggs" and said "Works" on 2026-10-12;
  still owed is hearing it actually ring on a phone (and the speakers, if House is ticked) 30 min before that day's sunset.
  Q270–Q271 are ⚑ defaults.
- Rooms (v1.67.0, §7B.6, migration 0047): on the iPhone, Settings → 🏠 Household → Rooms shows Kitchen Cleaning with its 8
  areas and photos; a chore's 📋 shows its room; All chores row opens the chore form (v1.68.1). Q266–Q268 are ⚑ defaults.
- Bounties and Score (v1.57.0, §7B.8, §8.15b, migration 0044): an admin posts a bounty and a kid's phone gets the push; the kid
  taps I'll do it then Done with a camera photo (v1.59.0); the admin's phone gets "🪙 Waiting for OK" and OKs it; 🏅 Score shows it (BS1–BS3). Also (v1.60.0): an admin posts with a camera picture, the kid's card shows it, and it is gone once paid; an admin's own Done has no 📷 (BS4). Q249–Q255, Q260, Q261 are ⚑ defaults.
- Cooking timers (v1.54.0, §7D.8): on the iPhone at 320 px, Alarms → 🍳 Cooking machines → ＋ Cooking timer, start an air fryer
  for 1 minute, Edit it, hear it done, tap Off, then the red ✕. Q239–Q243 are ⚑ defaults.
- Alarms tab as a menu (v1.53.0, §8.5): on the iPhone at 320 px, open each of ⏰ Alarms, ⏱ Rolling timers, 🫧 Machines;
  ＋ Add an alarm and Save, land back on the list (AM1–AM3). Q238 is a ⚑ default.
- 🎯 Point at it (v1.52.0–v1.58.0, §8.16): on the iPhone, turn it on in Settings → 🙂 Me, tap the faint ◎ bottom left (pick mode stays on, ◎ turns amber), then pick a tick box, a button, a text field and a select (none should act, each lands on the clipboard) and one inside a modal; tap the bar to stop (PA3–PA4). Q234–Q237 are ⚑ defaults.
- FunHouse alerts (v1.51.0, §9.4b): rebuild + restart the PC poller, then tick 🎪 FunHouse on a real alert and see it on the desk. Q230–Q233 are ⚑ defaults.
- Prune about 25 old merged topic branches.
- Look into the intermittent test-runner crash.
- README has mis-encoded characters (`Â§`) in older sections.
- Each person's speakers (v1.19.0, §9.2a) is live: check Home Assistant's real list in Settings → Me, and have each
  person tick theirs. Q125–Q129 are ⚑ defaults awaiting MojoSOGO.
- Phase C kitchen display (needs an AREC).
- Real-phone checks still owed per `docs/history.md` §14 (Android push, Done/Snooze, the laundry and goat reminders in practice).
- Code-steward: pass 1 items 6–10 wait until those files are next touched; pass 3 items 1–4 and pass 5 items 1–3 and pass 6 items 1–4 (pass 7: items 3–6 carry them; pass 8 carries them too and adds the machine-hours extract-first note; pass 9 after v1.44.0: sound, nothing new; pass 10 after v1.46.0: sound, a standing house-row-helper note for the next house-gate change, a snooze-keeps-away test and migration-test tidying wait on MojoSOGO's pick; pass 11 after v1.47.0: sound, two LOW fold-ins for the next machines change)
  (one maps rule for things and events, and Plan it filling an event's Address; the read-text cap wording) wait on
  MojoSOGO's pick. Reports are in `docs/steward/`.
- Rolling timer day start (v1.36.0, §5.5a): hear it at a real window opening.
- Event address and paste (v1.37.0–v1.38.0, §7.9, §7.9a): on the iPhone, Paste a copied text and a screenshot into a
  new event, and a "moved to…" text into an existing one; Open in Maps.
- Dish washer (v1.42.0, §7D.6): start one on the iPhone, hear it done, tap Emptied. Q204–Q207 are ⚑ defaults.
- Settings menu (v1.49.0, §8.6): check the button grid and each area on the iPhone at 320 px.
- My alerts (v1.48.0, §9.5): tap a real Ozymandias ping on the iPhone and land on its card in Settings → 🔔 Alerts; ❌ a line,
  Clear all. Q221–Q225 are ⚑ defaults.
- Alert when done (v1.47.0, §7D.7): start the dish washer with Nobody picked and hear only phones; start one for a person
  and hear the speakers from its second alert. Q217–Q220 are ⚑ defaults.
- Away on an alert and phone first (v1.46.0, §9.2c–9.2d): tap Away on a real repeating alert (speakers stop, phone keeps
  buzzing); hear a Phone + House repeating alert reach the speakers only from its second alert. Q213–Q216 are ⚑ defaults.
- Quiet the house (v1.45.0, §9.2b): quiet it on the iPhone, see a phone alert arrive while the speakers stay silent.
  Q209–Q212 are ⚑ defaults.
- Tab bar flush + build stamp (v1.44.0, §8.1): on the installed iPhone, no gap under the bar and the stamp visible under
  the tabs. Q208 is a ⚑ default.
- Owner unknown (v1.43.0, §7D.2): Done now on a free clothes washer with nobody named; hear "Owner unknown" on a speaker.
- Weather on the calendar (v1.41.0, §7.11): see the emojis on the iPhone after the first daily refresh. Q200–Q203 are ⚑ defaults.
- Things to bring (v1.40.0, §7.10): hear a real event reminder that carries a list, on the phone and a speaker.
