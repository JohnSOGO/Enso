-- SPEC §4.2zg, §7.9 — an event's address (optional). Additive only.
ALTER TABLE events ADD COLUMN address TEXT;  -- NULL = none; at most EVENT_ADDRESS_MAX (200) characters
