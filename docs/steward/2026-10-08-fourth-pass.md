# Steward pass 4 — after v1.36.0 (2026-10-08)

**Health:** minor drift. Typecheck green, 698/698 tests, arch:audit quiet (nothing in the band). The one code
commit since pass 3 (SPEC 2.65 §5.5a, PR #24) has its placement receipt, and the code landed where the verdict
said: shared/timer-start.ts 31, worker/timer-starts.ts 49, tick.ts 111/148, routes/alerts.ts 192, Timers.tsx 182,
engine.ts 255 untouched. Map rows for both new files and tick step 3c are accurate.

New backlog:

5. **where-things-stand.md was stale** (LOW, docs only): fixed in the same commit as this report.

Still owed from pass 3 (none touched by v1.36.0): 1 the roles-api A9 timeout, 2 the refusal sentence in one place
(Timers.tsx still shows no read-only sentence; take it the next time the timer form is touched), 3 the §6.3/§7A.1
lists wording, 4 the notes limit.

Deliberately left alone:
- The fire-less send: tick.ts, routes/announce.ts and timer-starts.ts each write push rows and a house row when
  speakers is null or non-empty. They differ (announce skips the sender and returns 409s; tick has allSpeakers and
  fire fields), so a shared helper today would be shallow. A fourth sender should get one owner via the advisor.
- The PWA's `hasWindow && announceStart` repeats the server rule; the spec settles it (the form saves it off).
- `TIMER_START_LATE_MIN = MISSED_AFTER_MIN` is derived, not a second copy.
- `announced_on` is not reset when the window is edited, matching "once a day" in the spec.
