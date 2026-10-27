-- SPEC §4.2zzm, §7.14 — good fishing times: three per-member settings, the coast data and fish event tables the daily
-- refreshes fill, their claims on settings, and the deliveries mark of the evening-before ping. Additive only.
ALTER TABLE member_prefs ADD COLUMN show_fishing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE member_prefs ADD COLUMN fishing_range INTEGER NOT NULL DEFAULT 30;
ALTER TABLE member_prefs ADD COLUMN fishing_alert INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN coast_tried_at TEXT;
ALTER TABLE settings ADD COLUMN fish_events_tried_at TEXT;
ALTER TABLE deliveries ADD COLUMN fishing_on TEXT;

CREATE TABLE tide_turns (
  station    TEXT NOT NULL,
  at         TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('H', 'L')),
  height_ft  REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (station, at)
);

CREATE TABLE coast_days (
  date       TEXT PRIMARY KEY,
  wave_ft    REAL,
  wind_mph   REAL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE fish_events (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL,
  lat        REAL,
  lon        REAL,
  url        TEXT,
  fetched_at TEXT NOT NULL
);
CREATE INDEX fish_events_date ON fish_events (date);
