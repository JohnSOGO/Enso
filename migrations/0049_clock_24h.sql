-- §8.17 — each member picks 12-hour (0, the default) or 24-hour (1) for every clock time Enso shows.
ALTER TABLE member_prefs ADD COLUMN clock_24h INTEGER NOT NULL DEFAULT 0 CHECK (clock_24h IN (0, 1));
