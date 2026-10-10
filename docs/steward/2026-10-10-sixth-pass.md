# Steward pass 6 — after v1.39.0 and v1.40.0 (2026-10-10)

**Health:** sound. Typecheck green, 722/722 tests (85 files), arch:audit quiet (nearest: EventForm.tsx 195/223 and
routes/recipes.ts 233/269, both 87%; engine.ts 258/300, 86%). Both releases (v1.39.0 paste a link into an event, §7.9;
v1.40.0 things to bring, §7.10, migration 0035) landed where their placement receipts said, at the sizes given. No code
commit lacks a receipt.

## Backlog (ranked)

1. **alertMessage has 7 positional params** (engine.ts:239; one production caller, tick.ts; 17 test calls). Give it an
   options object `{ chore?, startsToday?, sunsetAt?, bring? }` that tick fills from Source, and add alertMessage to the
   engine.ts map row. Structure only, via the reorganizer. Seam if engine.ts reaches the band: `shared/alert-message.ts`.
   S · low.
2. **EventForm.tsx is 6 lines from the band** and changes in most event releases. Standing note: the next event-form
   change gets extract-first, moving the When block to WhenFields.tsx. Don't open it early. S · low.
3. **The read budget's 429 and 503 messages** (routes/event-photos.ts readWith) still talk about photos when copied text
   or a link spent the budget. Write the wording in §7.9 first, then key it off `what` like FAILS; assert in EA4/EA7.
   S · low.
4. **Tag-along tidy** with pass-5 item 2 if picked: event-rows.ts's hard-coded "2000 characters" → EVENT_NOTES_MAX;
   event-reader.ts's two imports from link-reading merged. S · low.

**Carried:** pass-5 item 1 (one maps rule; waits on MojoSOGO), pass-5 item 2, pass-3 items 1 and 3. Pass-5 item 4
(where-things-stand) is done.

**Not flagged:** the three link-reader wirings (logic already shared; ~8 lines of differing wiring each); bringText vs
RecipeView andList (one line, different rule); bring on the sun branch (unreachable: event routes exclude sun events);
`text` keeping the photo error codes (spec'd).
