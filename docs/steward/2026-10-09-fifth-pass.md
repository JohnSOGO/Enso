# Steward pass 5 — after v1.37.0 and v1.38.0 (2026-10-09)

**Health:** minor drift. Typecheck green, 710/710 tests (82 files), arch:audit quiet (nothing in the band; routes/recipes.ts
233/269 and EventForm.tsx 193/223 are nearest, both 87%). Both code commits since pass 4 (v1.37.0 "An event's address with
paste to fill", §7.9, migration 0034; v1.38.0 "Update an event from later pasted info", §7.9a) have their placement
receipts, and the code landed where the verdicts said: AddressField.tsx 18, EventFillBar.tsx 76 (renamed from
EventPhotoFill, no stale references), event-photos.ts 40, event-reader.ts 61, event-rows.ts 137, event-reading.ts 85,
EventForm.tsx 193/223. The map rows and SPEC §14 describe them accurately; EU1–EU5 and EA1–EA5 are tested.

New backlog, by return on effort:

1. **One rule for opening an address, and Plan it's address** (MED, MojoSOGO first). ThingForm.tsx's mapsHref opens
   Apple Maps on iPhone/iPad and Google Maps elsewhere (⚑ Q35); AddressField.tsx always opens Apple Maps (⚑ Q193). Same
   household, same kind of address, two behaviors. Plan it (§7C.2) still writes a thing's address into the new
   event's Notes, though events now have an Address with Open in Maps. Decide one maps rule and whether Plan it
   fills the event's Address; then one mapsHref (exported from AddressField.tsx, ThingForm imports it) and the
   Plan-it change in routes/things.ts + plannedEventNotes, with D6 updated.
2. **Pass-3 items 2 and 4, now next to their right pattern** (LOW, worker, if picked). event-rows.ts still says
   "up to 2000 characters" one line above v1.37.0's EVENT_ADDRESS_MAX line. The §6.3 refusal is a literal in 7 places
   (alarms, alerts, events, chores routes; ChoreForm, EventForm, Alarms), and Timers.tsx shows none.
3. **read-text's 429 / 503 say "photos"** (LOW). event-photos.ts readWith uses the photo wording for pasted text;
   §7.9 gives no text for these two. Spec them, then change the one line and assert it in EA4.
4. **where-things-stand.md stale again** (LOW, docs): still v1.36.0. Refreshed with this report. Proposed: add the
   refresh to CLAUDE.md step 4 so each release does it (MojoSOGO's call).

Still owed from pass 3: 1 the roles-api A9 timeout, 3 the §6.3/§7A.1 lists wording.

Watch:
- EventForm.tsx (193/223, changed in v1.34, v1.37 and v1.38). If it enters the band, extract the When block
  (date, All day, end date, start, end) into WhenFields.tsx with value/onChange, like RepeatFields and ReminderFields.
- routes/recipes.ts (87%): the seam is still the emoji routes.

Deliberately left alone:
- READS_PER_DAY in shared/things.ts with five Worker users: one bundle, nothing gained by moving it yet.
- The fill message counting the hidden end date: §7.9a EU1 specifies it.
- cleanEventReading's unused `_today`: documented, mirrors cleanPhotoReading.
- The alerts-api edited-event test moved to 2030 rather than freed from the real clock: a sweep of the other
  near-date API tests found none that depends on it.
