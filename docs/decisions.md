# Ensō — decisions

Moved out of `SPEC.md` §13 in SPEC 2.78 (2026-10-11). Every Q-numbered question, MojoSOGO's answer, and every
⚑ DEFAULT awaiting it. A new ⚑ default gets the next Q number here, and the spec names it where it applies.


| # | Question | Built as (⚑ DEFAULT) |
|---|----------|----------------------|
| Q1 | Name for the restart-on-ack alert? | "Rolling timer" in docs; **Timer** in the UI |
| Q2 | Timers can ring overnight. Quiet hours in v1, or rely on Stop? | **Decided by MojoSOGO 2026-10-03 for timers:** each rolling timer may have an active time range ("Active from HH:MM to HH:MM"); it never rings outside it and its countdown restarts when the range opens (§4.2n, §5.3 rule 0). Household-wide quiet hours stay in Later (§12) |
| Q3 | While a timer rings unacknowledged, re-alert or ring once? | Re-alert every 15 min, 4 alerts max, then silent in the Ringing bar |
| Q4 | Should normal reminders nag too? | Off by default; per-event "repeat alert every" option |
| Q5 | House announcements go to **all four** Echos (incl. Toasty and Kid's Room) and the Voice PE — also at night? | Yes, all surfaces, always; per-alert speaker choice is Later |
| Q6 | App URL | **Decided by MojoSOGO 2026-10-03:** `https://enso.sogodojo.com` (Worker custom domain) |
| Q7 | Accent color: v1 used blue, which collides with school-holiday blue | Indigo `#6366F1` |
| Q8 | Snooze length | 10 min, single option |
| Q9 | Can any member Done/Ack a fire assigned to someone else? | Yes |
| Q10 | Can any member edit or delete any list item (not only their own)? | Was yes; since 2026-10-07 (MojoSOGO): anyone checks or unchecks any item, only its creator or an admin edits or deletes it (§6.3) |
| Q11 | How long do bought / done items stay visible? | 30 days |
| Q12 | Where do chores live? | Set up in **Alarms → Chores**; ticked off in **Lists → Today** (no fifth tab). **Superseded by Q166** (v1.28.0): their own 🧹 Chores tab |
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
| Q27 | Where do things to do live? | **Decided by MojoSOGO 2026-10-03:** Lists picker, second entry |
| Q28 | Plan it | **Decided:** creates a real calendar event; the idea becomes Planned |
| Q29 | Reminders | **Decided:** when it starts, and on a picked date (09:00 local ⚑); whole household ⚑ |
| Q31 | Street sweeping / per-person items | **Decided by MojoSOGO 2026-10-03:** optional events any person turns on; reminder the evening before at 8 pm |
| Q32 | Is the creator of an optional event turned on automatically? | Yes ⚑ |
| Q33 | School holidays | **Decided 2026-10-03:** removed; the 5 Fall break days deleted |
| Q34 | Take out trash | **Decided:** optional, every Sunday 18:00, rings at 18:00, 🗑️ |
| Q30 | Reading photos | **Decided:** Claude reads them (`claude-opus-5-5`); ≤ 40 reads a day ⚑ |
| Q35 | Where do the thing form's Open / Map / Call buttons sit, and which maps app? | ⚑ To the right of Link, Address, Phone; Apple Maps on iPhone/iPad, Google Maps elsewhere |
| Q36 | Announcements (§9.3): defaults of the box, length, who is pushed | ⚑ The box opens with House ticked, Phone unticked; at most 200 characters; at least one of Phone / House; the sender gets no push of their own; push goes to every active member (optins `audience`), and one without a phone gets the honest `failed: no_subscription` row; the push is titled "📢 Announcement" with "{name} says: {text}" as its body |
| Q37 | Voice PE timeout now that the Worker speaks (§9.2) | ⚑ 25 s (the relay used 30 s) so a call fits the Worker's ~30 s `waitUntil` budget; it normally takes ~8 s |
| Q38 | House badge and Status wording (§8.1, §8.6) | ⚑ Badges "🔇 House failing" and "🔇 House not set up", whose explanations name Home Assistant and the Cloudflare tunnel; Status line "working" / "failing since …" + the error / "not set up" / "not tried yet" |
| Q39 | House state before anything has been spoken (§9.2) | ⚑ `untried`: no badge, Status says "not tried yet" — a quiet house is not a failure until a delivery fails |
| Q40 | The laundry loop in the Ringing bar and on phones (§7D, §8.2) | ⚑ The washer row has **Move to dryer**, which opens the same dryer-minutes chooser as the card (exported from `Machines.tsx`); the dryer row has **Fold & out**. Phone notifications have no buttons; tapping one opens the app |
| Q41 | Move to dryer while the dryer is still full (§7D.2) | ⚑ Refused in place: "The dryer still has Sam's load." The washer stays DONE — waiting and its reminders run out at 4; every later dryer alert adds " — Kai's load is waiting". Nothing moves automatically |
| Q42 | The done message (§7D.3) | ⚑ "Sam, your laundry in the washer is done" / "… in the dryer is done", plus the waiting suffix; with no active owner "The laundry in the washer is done" |
| Q43 | Undoing a mistaken start (§7D.2, §8.5) | ⚑ A running or done machine offers **Clear**: its fire closes `removed`, nothing rings, the machine is free. A free dryer also offers **Start** with the same chips |
| Q44 | Overnight timer windows (§4.2n) | ⚑ Allowed (22:00–06:00 runs across midnight); only `from = to` is refused |
| Q45 | Is the window's end inside it? | ⚑ Active from `from` up to but not including `to` (08:00–21:00: 20:59 rings, 21:00 does not) |
| Q46 | An interval as long as the window or longer | ⚑ Refused, 400 — the timer could never ring inside it |
| Q47 | Ringing when the window closes | ⚑ The fire goes back to `scheduled`, due at the next window start + interval: it leaves the Ringing bar, goes quiet, and the timer still shows running with its next time (§5.3 rule 0) |
| Q48 | Starting a timer outside its window | ⚑ Allowed; the first ring is the next window start + interval |
| Q49 | Editing the window of a running timer | ⚑ The open fire is not re-planned; rule 0 defers it when it comes due outside the new window |
| Q50 | The timer form and row (§8.5) | ⚑ Two time inputs, "Active from / to", empty = always; the row shows the window; Next names the day when it isn't today |
| Q51 | How often does the goat alert repeat (§7.7)? | ⚑ Every 15 min, up to 3 alerts (−30, −15, at sunset) until Done: the row has `renotify_min` 15, `max_alerts` 3 (the placement-advisor suggested one alert; the coordinator chose repeats so the goats are not forgotten) |
| Q52 | How the sunset time reads | ⚑ "6:42" — 12-hour, no am/pm |
| Q53 | Sunset precision | ⚑ Rounded to the nearest minute |
| Q54 | Sun items on the calendar? | ⚑ Never, by rule: not in `/calendar`, the day sheet or the event routes |
| Q55 | The Settings label for sun items | ⚑ Unchanged: "Optional calendar items" |
| Q56 | The Ringing bar row of a sun item | ⚑ `· sunset` where an all-day reminder shows `· all day` |
| Q57 | The household place | ⚑ 33.20 / −117.29 (ZIP 92056, Oceanside), set by migration 0016; no edit UI |
| Q58 | Who edits or deletes the goat item | ⚑ Only coordinator SQL; the event routes give 404 |
| Q59 | Sunrise too? | ⚑ No — sunset only |
| Q60 | Where do recipes live (§8.1, §8.12)? | ⚑ Their own tab, "Recipes" 🍳, between Lists and Settings; five tabs fit at 320 px (Q12's "no fifth tab" was about chores) |
| Q61 | Pasting a link | ⚑ Saves the recipe at once, then opens its view with the source note; ✎ fixes it |
| Q62 | A recipe row | ⚑ A small thumbnail + the dish's name, plus a "watch it" badge when nothing was found; newest first |
| Q63 | The same link pasted twice | ⚑ 409 `duplicate`; the PWA opens the existing recipe |
| Q64 | The source note | ⚑ Says what was read ("From the description and captions"), plus "captions couldn't be read: {reason}" when that happened |
| Q65 | Recipe reads per day | ⚑ 20 (`RECIPE_READS_PER_DAY`), counted apart from photo reads |
| Q66 | Who edits or deletes a recipe? | Its creator or an admin (MojoSOGO 2026-10-07, §6.3); delete is soft |
| Q67 | A hand edit of a "watch it" recipe | ⚑ Adding ingredients or steps sets found = true (found = has ingredients or steps) |
| Q68 | A typed recipe with a video link | ⚑ Not in v1 — a typed recipe has no video |
| Q69 | Add to Shopping | ⚑ Nothing picked at first, a "Pick all" chip; summary "Added 4 · Milk already on the list"; on a failure it stops and names what wasn't added |
| Q70 | Privacy of recipe reading | ⚑ The video's text goes to Anthropic; the thumbnail loads from i.ytimg.com (no referrer). Accepted |
| Q71 | By emoji: the order of the groups (§7E.5) | ⚑ Biggest group first; ties by the group's newest recipe, then the emoji string; newest first within a group; unrated last, newest first |
| Q72 | Picking my emoji (§8.12) | ⚑ The household's emojis as chips (most used first, 12 at most), a one-emoji input with Set, and Clear when I have one |
| Q73 | Everyone's emoji names a member the PWA doesn't know | ⚑ "Someone" |
| Q74 | Newest \| By emoji | ⚑ Remembered per phone (`localStorage`), not per person on the server |
| Q75 | A soft-deleted recipe's emojis | ⚑ Kept in `recipe_emojis` but never shown — only live recipes are returned |
| Q76 | Whose comments are read (§7E.2) | ⚑ Only top-level comments by the video's own channel; viewers' text and the creator's replies inside threads are ignored |
| Q77 | How many comments | ⚑ 20 threads, relevance order (1 quota unit); the kept text is capped at 5 000 characters |
| Q78 | Comments turned off, or no creator's comment | ⚑ Not an error; no marker |
| Q79 | Comments quota used up or failed | ⚑ The recipe is still saved, with "comments couldn't be read: {reason}" |
| Q80 | The video's channel id is unknown | ⚑ No comments are read (never anyone else's) |
| Q81 | The source note with comments | ⚑ "From the description, captions and the creator's comment" — what was read, joined "A, B and C" |
| Q82 | Quota per read | ⚑ Two YouTube API units per read (video + comments); the 20-a-day cap is unchanged |
| Q83 | Privacy of the creator's comments | ⚑ The creator's kept comment text goes to Anthropic too, like the description |
| Q84 | A pasted transcript: the rest of the video's text (§7E.2b) | ⚑ The description and the creator's comments are fetched again (they are not stored): 2 quota units, and the read counts against the 20 a day |
| Q85 | What a pasted transcript is called | ⚑ Its own source, `transcript` — "From the description and the transcript you added" (screenshots or pasted) — never `captions` |
| Q86 | A pasted transcript that holds no recipe | ⚑ Only a reading that finds a recipe is saved; one that doesn't changes nothing (422, "nothing was changed"); no confirm dialog, the box says what it replaces |
| Q87 | When the transcript, by hand, is offered | ⚑ Only on a "watch it" video recipe or one whose captions couldn't be read; the server allows any video recipe |
| Q88 | Cleaning a pasted transcript | ⚑ Timestamps and YouTube's spoken durations dropped, chapter titles kept, whitespace collapsed, cut to `TRANSCRIPT_MAX` |
| Q89 | The longest paste | ⚑ `PASTED_MAX` = 100 000 characters before cleaning |
| Q90 | Wording | ⚑ "📷 Add transcript screenshots"; hint "On YouTube: ⋯ → Show transcript, then screenshot it."; "or paste the text"; **Read it** |
| Q91 | A transcript when pasting the link | ⚑ Not offered on the paste-a-link step — read the video first, then add it on the recipe |
| Q92 | How many screenshots | ⚑ At most 4 per read (he said one; a transcript usually needs a few) |
| Q93 | Keeping the screenshots | ⚑ Not stored — read once and dropped; no R2, no migration (§12) |
| Q94 | Screenshots or text | ⚑ Screenshots first (the phone); pasting the text is secondary, collapsed under "or paste the text" |
| Q95 | Which captions failures go to the home PC (§7E.2c) | ⚑ Only `blocked` — `none` (no captions) and `failed` would fail at home too |
| Q96 | How long the Worker waits for SogoAI (§7E.2c) | ⚑ 20 s (`HOME_CAPTIONS_TIMEOUT_MS`); longer is a failure, "from home: error: …" |
| Q97 | The home PC couldn't read the captions either | ⚑ `captions_error` = "from home: {reason}" — shown "captions couldn't be read: from home: …" |
| Q102 | Older recipes whose captions were blocked | ⚑ No backfill and no "try from home" button — only new reads ask |
| Q104 | Limits on what the helper answers | ⚑ Text cut to `TRANSCRIPT_MAX` (20 000), a failure reason to 300 characters |
| Q105 | Where the helper listens | ⚑ `127.0.0.1:8790` on SogoAI, loopback only, reached only through the `sogoai` Cloudflare Tunnel behind Access |
| Q106 | Captions blocked and captions from home not set up | ⚑ `captions_error` = "from home: captions from home aren't set up." — shown "captions couldn't be read: from home: …" (the YouTube reason is not kept) |
| Q107 | Who a ping from a Claude session goes to (§9.4) | ⚑ Always the founder; there is no `member` field (one sent is ignored) |
| Q108 | The ping's title | ⚑ The caller's title (e.g. "🤖 Claude ⭕🔁🏠"), or "🤖 Claude"; at most 60 characters |
| Q109 | A `level` for pings (like the FunHouse's) | ⚑ None — an emoji in the title does that job |
| Q110 | How many pings | ⚑ 30 an hour, then 429 `rate_limited` |
| Q111 | Are pings visible to the household? | ⚑ Yes — they show in Settings → Status' last 20 deliveries like any other delivery. His call later |
| Q112 | SogoAI can't tell what a snapped item is (§7A.3) | ⚑ When SogoAI says UNKNOWN, Claude is asked, and that counts against the cap. If Claude can't tell either → 422 "Couldn't tell what that is — type it in." |
| Q113 | Which snaps count against the daily cap | ⚑ Only Claude fallbacks count, sharing the 40-a-day `photo_reads` budget with Things; a name from SogoAI is free and uncounted |
| Q114 | How long a snap may wait | ⚑ 20 s from the Worker to the helper (`HOME_IDENTIFY_TIMEOUT_MS`); 15 s from the helper to LM Studio |
| Q115 | Which local model names items | ⚑ `IDENTIFY_MODEL=qwen-uncensored`, the always-loaded vision model on SogoAI. Unset → SogoAI counts as off and Claude is asked |
| Q116 | How long a name | ⚑ The prompt asks for at most 60 characters (`ITEM_NAME_ASK`); the name is cut at 120 (`TEXT_MAX`) |
| Q117 | The hint under a snapped name | ⚑ "Read from your photo — check it." `via` is always in the answer, but the UI doesn't show it |
| Q118 | Snapping with text already in the box | ⚑ The name replaces whatever text is in the box |
| Q119 | Snapping something already on the list | ⚑ The photo is attached on added, re-opened or already-there alike, replacing any older photo |
| Q120 | Before Add | ⚑ The waiting photo shows as a thumbnail with ✕ |
| Q121 | Seeing a kept photo | ⚑ A 📷 row marker; the photo in the ✎ form (tap for full size; Replace / Remove / Add) |
| Q122 | Adding a photo in the item form | ⚑ It is not read — the form only keeps it |
| Q123 | Bought items' photos | ⚑ Kept indefinitely; adding the item again re-opens it and brings its photo back |
| Q124 | Names for the SogoAI pieces | ⚑ No renames: `CAPTIONS_TOKEN`, `HOME_CAPTIONS_URL` and the `captions-helper` files keep their names though they now carry `/identify` too |
| Q125 | A person who hasn't chosen speakers (§9.2a) | ⚑ The default speakers (`ECHO_TARGETS` + `SATELLITE_ENTITY`, as before), so nothing changes until someone ticks |
| Q126 | An alert for several people | ⚑ Spoken on every speaker any of them ticked (the union) |
| Q127 | Announcements | ⚑ For every active member: everyone's ticked speakers together |
| Q128 | Nobody it is for has a speaker ticked | ⚑ Not spoken at all; push still goes out. An announcement with House alone is 409 `no_speakers` |
| Q129 | Who sets a person's speakers | ⚑ Only that person, in Settings → Me; admins can't set anyone else's |
| Q130 | Which Alexa entries are not speakers | **Decided by MojoSOGO 2026-10-04: tidy.** ⚑ Matched by name: `This Device` and any name containing `Alexa App` are hidden; everything else Alexa Media Player lists stays |

| Q131 | Sign in with my phone (§6.6): limits | ⚑ A request lives 2 minutes; at most 3 per email per 15 minutes (over that: the same 202, no push); at most one pending per member — a new request turns the old one `denied` (the row is kept, it is the rate-limit count) |
| Q132 | A wrong number on the phone | ⚑ Denies the request; no second try on the same request — the PC starts again |
| Q133 | The "New sign-in on …" push | ⚑ After a **password** sign-in only (not after a phone approval, signup or setup); push only, never house; only to a member with a phone subscribed (none → no row); sent before the login answers |
| Q134 | The approve screen | ⚑ A full page at `/approve-login#{id}`, not a modal; with the phone signed out, the sign-in form shows first and the approve screen follows sign-in (the id kept in `sessionStorage`) |
| Q135 | The notice push title | ⚑ "🔑 Ensō sign-in" for both the request and the new-sign-in notice; the request's body "Sign-in request from Chrome on Windows — tap to check" |
| Q136 | Where the approve screen says the browser is | ⚑ Cloudflare's rough city and country for the waiting browser ("Oceanside, US"), or "Place unknown" |
| Q137 | A request that was approved but not collected in time | ⚑ Expires with the request (2 minutes from creation); the PC says "No answer in 2 minutes." |
| Q138 | A link reading's own link | ⚑ The form's Link stays the pasted link; a link the look-up found (a ticket page, say) may go in the note, never replaces it |
| Q139 | Which budget link readings use | ⚑ The same 40-a-day `photo_reads` budget as photos (one read per tap, counted before Claude is asked); no new table |
| Q140 | How hard a link reading looks | ⚑ At most 3 web searches and 2 page fetches per tap |
| Q141 | Sending a link to Anthropic | ⚑ The link, the page's text and the searches go to Anthropic, as photos do (Q30) |
| Q143 | "Closest" for a link with several locations | ⚑ Closest to the household's own place (Oceanside, the sun-alerts location), which MojoSOGO named "San Diego"; with no place set, every location goes in the note |
| Q144 | Where the movies & shows list lives (§8.14) | ⚑ A third option in the Lists picker, "Movies & shows (n)", not a new tab |
| Q145 | Where to watch: which country | ⚑ The United States only (`WATCH_COUNTRY` `US`); theaters: up to 3 showing it, closest to the household's place |
| Q146 | Which ratings | ⚑ Rotten Tomatoes critics (Tomatometer) and audience (Popcornmeter), as rottentomatoes.com shows them; unknown → "🍅 —" |
| Q147 | Which budget look-ups use | ⚑ The same 40-a-day `photo_reads` budget; each Find, 📷 or Check again is one read |
| Q148 | How hard a look-up looks | ⚑ At most 5 web searches and 3 page fetches |
| Q149 | A video clip itself | ⚑ Not read in v1: paste the clip's link, or screenshot a frame |
| Q150 | The picture a show is found from | ⚑ Read once, never stored |
| Q151 | Saving a look-up | ⚑ Find opens the show form filled; nothing is saved until Save (as a thing's link reading) |
| Q152 | The same show twice | ⚑ Same title (ignoring case and spaces) and year → 409 "… is already on the list.", watched or not |
| Q153 | Editing how to watch | ⚑ Lines can be removed (✕) or refreshed (Check again), not typed by hand |
| Q154 | Who may change a show | Anyone adds or marks watched; its creator or an admin edits or deletes (MojoSOGO 2026-10-07, §6.3) |
| Q155 | The row's way to watch | ⚑ The best option: theater, then stream, tv, rent, buy |
| Q156 | Comments read for a YouTube link | ⚑ The top 20 by relevance (one quota unit), plus the title, channel and description; replies not read; other sites' comments only if Claude's own page fetch shows them |
| Q157 | Lists' emojis | ⚑ A list without its own shows one picked from its name (keyword table in §7A.1, else 📋); Today 🧹, Things to do ✅, Movies & shows 🎬 are fixed |
| Q158 | When the Lists popup opens | ⚑ On every tap of the bottom tab's 🛒 Lists (and the list button), not when the app opens on Lists; closing it stays on the remembered list |
| Q159 | A done load nobody has moved (§7D.2, §8.5) | ⚑ A done washer or dryer offers **Still loaded**: the reminders start over now (alert 1, then every 15 min, 4 in all, Phone + House), saying "… is still in the washer — move it to the dryer" / "… still in the dryer — take it out". Move, Fold & out or Clear stops them as before |
| Q160 | A load nobody started in the app, or one that finished early (§7D.2, §8.5) | ⚑ A free or running machine offers **Done now**: free asks whose load, Owner unknown preselected (MojoSOGO 2026-10-10: "don't assume an owner"); the machine shows DONE — waiting and the done alerts ring at once, then Still loaded works as usual |
| Q161 | Machine alerts on "all devices" (§7D.3) | Everyone's phones and every speaker HA lists (decided by MojoSOGO 2026-10-05); ⚑ the `Everywhere` group is left out so each Echo speaks once; HA unreadable → the default speakers |
| Q162 | A machine alert outside its hours (§7D.5) | ⚑ It waits and the reminders start over when the hours open (not dropped); only admins edit the hours, on the Machines section |
| Q163 | Who may change what done looks like (§7B.6) | The chore's creator or an admin, like the chore itself (MojoSOGO 2026-10-07, §6.3) |
| Q164 | How much a chore's done standard holds | ⚑ Up to 8 areas; each a name ≤ 40, up to 12 expectations ≤ 120 characters, and up to 4 photos |
| Q165 | Ticking expectations (§8.15) | ⚑ Only to walk through the job while the sheet is open; never saved, cleared when it closes |
| Q166 | Where chores live (§8.1, §8.15) | ⚑ Their own 🧹 Chores tab between Alarms and Lists: Today on top, All chores under it; they left Alarms and the Lists popup |
| Q142 | Where "Fill in from this link" sits | ⚑ A full-width button right under the Link field, only when the field holds a usable link; reading starts on the tap, never on paste |
| Q167 | A link's duplicate key (§7E.6) | ⚑ The cleaned link: no fragment; Facebook links on `www.facebook.com` keeping only `v`, `id`, `story_fbid`, `fbid`; elsewhere `utm_*`, `fbclid`, `gclid`, `mibextid`, `igsh`, `igshid`, `si` dropped and the rest kept |
| Q168 | A link recipe's picture and name (§7E.6, §8.12) | ⚑ No thumbnail (nothing stored or hotlinked); the site's name (Facebook, Instagram, TikTok, Pinterest, else the host) in place of the channel |
| Q169 | The transcript, by hand, on a link recipe (§7E.2b) | ⚑ Offered like a video's; nothing is re-fetched — Claude reads the screenshots or text with the recipe's title and site |
| Q170 | Where a link's recipe may come from (§7E.6) | ⚑ The page, the post's or reel's caption, or the creator's own recipe for that dish where the post points to it; never another creator's |
| Q171 | A recipe in another language (§7E.2) | ⚑ Always saved in English, translated faithfully; the original is not kept (the link or video still is) |
| Q172 | Metric amounts (§7E.2) | ⚑ Converted to US units by Claude when read, rounded to kitchen measures (180 °C → 350 °F); the metric original is not kept; typed recipes are never converted |
| Q173 | Screenshots in the recipe form (§8.12, §7E.2b) | ⚑ On every existing recipe, typed ones included; Claude reads them with the title (nothing fetched); a brand-new recipe takes them after its first Save |
| Q174 | A recipe's screenshot as its picture (§7E.2b, §8.12) | ⚑ The first screenshot of the latest successful read is kept and shown whole at the top of the view and as the row's picture, ahead of a YouTube thumbnail; a new read replaces it; no separate upload or remove |
| Q175 | A recipe's picture by hand (§8.12) | ⚑ 📷 Add photo in the recipe form, on new and saved recipes alike, by the recipe's creator or an admin (§6.3); it replaces a kept screenshot and is replaced by a later screenshot read; nothing is read from it |
| Q176 | A recipe's picture in the list (§8.12) | Whole, never cropped, inside the usual 64 × 36 slot; every row the same height (decided by MojoSOGO 2026-10-05); YouTube thumbnails keep their crop |
| Q177 | When a mess goes to To talk about (§7B.7) | ⚑ When everyone asked has said Not me, or 24 h after the report with nobody claiming it |
| Q178 | Who sees balances (§7B.7) | ⚑ Each member sees the pairs they are in; admins see every pair |
| Q179 | Who records the outcome of the house talk (§7B.7) | ⚑ Any admin: whose it was (1 point owed to the reporter) or nobody's (closed) |
| Q180 | Mess sizes (§7B.7) | ⚑ None: every mess is 1 point |
| Q181 | Who settles a point (§7B.7) | ⚑ The one owed (Paid back or Let it go), or an admin |
| Q182 | Taking back "That was me" (§7B.7) | ⚑ Not by the claimer; an admin can record someone else or nobody's |
| Q183 | Pushes for a mess (§7B.7) | Asks to everyone but the reporter, up to 4, 15 min apart, plus an in-app banner until answered (decided by MojoSOGO 2026-10-05); ⚑ one push to each admin when it goes to To talk about; ⚑ never spoken in the house |
| Q184 | Naming the reporter (§7B.7) | ⚑ Yes: "Sam cleaned this up" |
| Q185 | A mess photo (§7B.7) | ⚑ Required to report; deleted when settled, closed or deleted, and at most 30 days after the report |
| Q186 | Counting founder pings (§9.4) | Founder pings are counted by elimination in `src/worker/deliveries.ts` `opsPingsSince` (a fire-less push with a title that is neither a sign-in notice nor a mess ask), so a future kind of fire-less push could quietly count. ⚑ Keep the elimination (tested in `test/deliveries.test.ts`); the alternative is a `deliveries` kind/marker column |
| Q187 | Keeping an event's screenshot (§7.8) | ⚑ Not kept: it is read and dropped; events have no photo |
| Q188 | An ambiguous place in a screenshot (§7.8) | ⚑ Read as the one nearest the household (Oceanside) |
| Q189 | What a screenshot may fill (§7.8) | ⚑ Only fields not changed since the form opened; a timed reading sets the times, a date-only one makes it All day |
| Q190 | An event's location from a screenshot (§7.8) | ⚑ Fills the Address (§7.9), when it hasn't been changed since the form opened (until v1.37.0 it was the first line of Notes) |
| Q191 | A timer's start announcement (§5.5a) | ⚑ Opt-in per timer, only with active hours (a timer without a window has no day to start); worded "Pushups timer started — every 60 minutes", on the timer's own channels and people; the push is titled "📢 Announcement" |
| Q192 | A late start announcement (§5.5a) | ⚑ Said up to 60 min after the window opens (an outage, or Start tapped soon after the opening); later than that, nothing until the next day |
| Q193 | Opening an event's address (§7.9) | ⚑ "Open in Maps" in the form, as an Apple Maps link (the family's phones are iPhones); the day sheet doesn't show the address |
| Q194 | What 📋 Paste reads (§7.9) | ⚑ Anything copied — a picture or text — is read by Claude on the shared 40-a-day budget, even a bare address (so it comes back cleaned up and the nearest one is picked) |
| Q195 | What 📋 Paste fills (§7.9) | ⚑ The whole form, like a screenshot (v1.37.0 filled only the Address; changed when MojoSOGO asked for existing events to take later info) |
| Q196 | Later info on an existing event (§7.9a) | ⚑ What the paste names wins over what's saved, except the title (kept) and the notes (added under, never replaced); a date alone keeps the times; nothing saved until Save |
| Q197 | Pasting a link into an event (§7.9) | ⚑ Only a paste that is just one link reads the page (fetched, then looked up with web search, like a thing's link); a link inside other text is read as text |
| Q198 | Things to bring (§7.10) | ⚑ A list to remember, shown in the event form and said in the reminder; no ticking things off as they're packed |
| Q199 | How the reminder says the list (§7.10) | ⚑ "Reminder: Soccer — bring: shin guards, water bottle and snacks", on every alert of the reminder |
| Q200 | Where the weather comes from (§7.11) | ⚑ Open-Meteo's free forecast (no key, no account), in °F, refreshed once a day just after midnight |
| Q201 | Weather on past days (§7.11) | ⚑ None: only today and the next 6 days carry an emoji; yesterday's is dropped at the daily refresh |
| Q202 | Where the weather emoji sits (§7.11) | ⚑ The day cell's top-right corner, apart from the two day icons; high and low only in the day sheet |
| Q203 | Turning the weather off (§7.11) | ⚑ No switch: everyone sees it (it could become a row of Optional calendar items if wanted) |
| Q204 | The dish washer's name and icon (§7D.6) | ⚑ "Dish washer" 🍽️, after the clothes dryer on the Machines section |
| Q205 | Ending a dish washer load (§7D.6) | ⚑ **Emptied** (the dryer's Fold & out, renamed for dishes); Still loaded restarts its reminders like the laundry |
| Q206 | When the dish washer's alerts sound (§7D.6) | ⚑ Like the laundry's: every phone and speaker, only in the machine alert hours (they wait outside them) |
| Q207 | The dish washer's minutes (§7D.6) | ⚑ 60 / 90 / 120 / 150 min chips (dish cycles run longer than the laundry's) |
| Q208 | The build stamp where a screen has no bottom inset (§8.1) | ⚑ The bar's bottom strip is at least 14 px tall so the stamp always shows |
| Q209 | How long the house can be quiet (§9.2b) | ⚑ 1 hour, 2 hours, 4 hours or Rest of today |
| Q210 | When "Rest of today" ends (§9.2b) | ⚑ At household-local midnight |
| Q211 | Who can quiet the house, and for whom (§9.2b) | ⚑ Any member; the whole household's speakers at once; the line says who set it |
| Q212 | What happens to alerts while quiet (§9.2b) | ⚑ Skipped on the speakers, not replayed later; phones are unchanged; announcements are quiet too (House only → refused); a repeating reminder speaks again after quiet ends |
| Q213 | What "I'm away" on an alert does (§9.2c) | Stops that alert's speakers **and every phone ping** (MojoSOGO 2026-10-11: ALL; was ⚑ phones keep reminding); the alert stays open and is not snoozed; it is in the app's Ringing bar, not a phone notification button |
| Q214 | How long "I'm away" lasts (§9.2c) | ⚑ Until that alert is closed; whatever replaces it (next timer countdown, Still loaded, next step) speaks again. No "back home" undo |
| Q215 | Which alerts go phone first (§9.2d) | ⚑ Every alert kind with both Phone and House ticked; House-only alerts speak from the first; Announce and timer start announcements unchanged |
| Q216 | Phone first on an alert that doesn't repeat (§9.2d) | ⚑ It is spoken on its one alert, so a House alert is never silently dropped |
| Q217 | What picking a person changes (§7D.7) | ⚑ Only whether the house speaks: with someone, every phone and every speaker as before; the person's own speaker picks and phone are not singled out |
| Q218 | Does the dish washer's starter get the alert (§7D.7) | ⚑ Preselected (the chooser follows the owner chip) but can be cleared to Nobody |
| Q219 | An alert person who is no longer active (§7D.7) | ⚑ Treated as nobody: phones only |
| Q220 | Changing who is alerted on a load already running (§7D.7) | ⚑ Not offered; Clear and start again. Move carries it to the dryer |
| Q221 | How many alerts My alerts keeps (§9.5) | ⚑ The newest 200 shown; nothing is deleted from the database |
| Q222 | An alarm's push in My alerts (§9.5) | ⚑ "Alarm", apart from "Reminder" |
| Q223 | A timer start announcement in My alerts (§9.5) | ⚑ "Announcement" (the row carries nothing that tells it apart) |
| Q224 | Deleting alerts (§9.5) | ⚑ Each person's own list only; ❌ hides one with no asking; Clear all asks first |
| Q225 | A notification tapped while signed out (§9.5) | ⚑ Sign in first, then the card opens |
| Q226 | Settings as a menu (§8.6) | ⚑ Eight buttons in this order: Me, Calendar items, Phone alerts, Speakers, Alerts, Household, Members, Status; each opens in a modal, closing returns to the menu |
| Q227 | Where Log out sits (§8.6) | ⚑ Under the Settings grid, not inside Me |
| Q22 | What is an admin? | **Decided by MojoSOGO 2026-10-03:** same powers as the founder; any admin can make/remove admins; the founder can never be demoted or disabled |
| Q228 | Which founder pings the FunHouse poller shows (§9.4a) | ⚑ Titles starting 🤖 or 🧵 (Claude's); others, such as 🏛️ Ozymandias which reaches the FunHouse itself, are skipped |
| Q229 | How a ping looks on the FunHouse (§9.4a) | ⚑ source "Claude", level `attention`, beep `look`, sig ⭕🔁🏠, text "title: text" |
| Q230 | Who sees the 🎪 FunHouse tick (§9.4b) | ⚑ Every member, everywhere Phone / House are |
| Q231 | Machines and the FunHouse (§9.4b) | ⚑ Machines keep Phone + House; no FunHouse |
| Q232 | Which rules the FunHouse follows (§9.4b) | ⚑ The phone's: Away stops it, Quiet the house does not, phone first does not delay it |
| Q233 | How an Ensō alert looks on the FunHouse (§9.4b) | ⚑ As a ping (Q229) with source "Ensō" |
