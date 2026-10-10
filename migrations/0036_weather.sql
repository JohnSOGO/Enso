-- SPEC §4.2zi, §7.11 — the daily forecast shown on the calendar. Additive only.
CREATE TABLE weather_days (
  date       TEXT PRIMARY KEY,   -- household-local YYYY-MM-DD
  code       INTEGER NOT NULL,   -- WMO weather code (§7.11 table)
  high_f     INTEGER NOT NULL,   -- rounded °F
  low_f      INTEGER NOT NULL,
  fetched_at TEXT NOT NULL       -- UTC ISO of the refresh that wrote it
);
ALTER TABLE settings ADD COLUMN weather_tried_at TEXT;  -- UTC ISO of the last refresh attempt; NULL = never
