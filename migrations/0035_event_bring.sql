-- SPEC §4.2zh, §7.10 — an event's things to bring (optional). Additive only.
ALTER TABLE events ADD COLUMN bring TEXT;  -- NULL = none; else a JSON list of 1–EVENT_BRING_MAX (20) lines
