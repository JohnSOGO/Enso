# Steward pass 7 — after v1.41.0 (2026-10-10)

**Health:** sound. Typecheck green, 730/730 tests (87 files; +8 from WX1–WX6, WX-M and the address/words test),
arch:audit quiet (nearest: EventForm.tsx 195/223, Calendar.tsx 263/302, routes/recipes.ts 233/269, all 87%; engine.ts
258/300, 86%). v1.41.0 (weather on the calendar, §7.11, migration 0036) landed where its placement receipt said:
shared/weather.ts 65 lines (pure: the WMO table, forecastUrl, parseForecast, weatherDue, weatherText), worker/weather-days.ts
47 lines (tick step 3d plus weatherBetween, which returns finished wire rows so neither the route nor the PWA knows WMO
codes), tick.ts +3, routes/events.ts +2, Calendar.tsx +5, DaySheet.tsx +2. It follows the timer-start / timer-starts
pattern (a pure leaf decides, a table owner does the I/O as one tick step), and no hub moved. All three of the
advisor's corrections were taken. No code commit lacks a receipt (8813b07..6f118ad: one code commit, e7897d7, with
its receipt).

## Backlog (ranked)

1. **Two text leftovers from v1.41.0** (LOW, docs and comment only) — **fixed in the same thread right after this pass**
   (the release's own slip, not a backlog pick): SPEC §5.6 step 3d now names `src/worker/weather-days.ts`, and env.ts's
   §9.4 comment is back on OPS_NOTIFY_TOKEN.
2. **Calendar.tsx is 9 lines from the band** (263/302, band at 272). A standing note like EventForm's, and the
   receipt's own watch line. The next change to the calendar cell gets extract-first: the per-day cell goes to
   DayCell.tsx (or buildDays/weekSpans go to a calendar-days module). Don't open it early: Calendar.tsx has had only
   2 commits this month and is still one coherent thing.
3. **alertMessage has 7 positional params** (carried pass-6 item 1, unchanged: engine.ts:239). Use an options object
   that tick fills from Source. Structure only, via the reorganizer. S · low.
4. **EventForm.tsx 6 lines from the band** (carried pass-6 item 2, 195/223, 7 commits this month, still the hottest
   frontend file). The next event-form change gets extract-first: the When block goes to WhenFields.tsx. S · low.
5. **read-text's 429 / 503 still say "photos"** (carried pass-6 item 3; event-photos.ts:30). Write the wording in §7.9
   first. S · low.
6. **Tag-along tidy** (carried pass-6 item 4): event-rows.ts:51's literal "2000 characters" should use
   EVENT_NOTES_MAX, and event-reader.ts's two imports from link-reading (lines 7 and 9) should become one. S · low.

**Carried:** pass-5 item 1 (one maps rule; waits on MojoSOGO), pass-5 item 2, pass-3 items 1 and 3.

**Not flagged:** tick.ts's churn (12 commits since 10-01, but 114/148 and orchestration only, about 2 lines per step);
step 3d's 10 s fetch timeout running before step 4 (at most once a day, or hourly while failing, around local
midnight, when a few seconds of delay to house speech costs nothing); the day-sheet weather line reusing Lists.module.css's
`.holiday` class (cosmetic); the WMO table in shared/weather.ts rather than vocab.ts (display data with no CHECK
constraint, like HOLIDAYS; the advisor ruled on it); weather on /status (left out on purpose).
