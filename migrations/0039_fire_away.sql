-- SPEC §4.2zl, §9.2c — "I'm away" on one alert: its speakers stop, it stays open. Additive only.
ALTER TABLE fires ADD COLUMN away_by TEXT REFERENCES members(id); -- who said they're away; NULL = not
ALTER TABLE fires ADD COLUMN away_at TEXT;                        -- UTC ISO
