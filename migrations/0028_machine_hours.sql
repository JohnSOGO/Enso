-- §7D.5 — the machines' alert hours, household local HH:MM; both ends NULL = any time that day.
ALTER TABLE settings ADD COLUMN machine_weekday_from TEXT DEFAULT '17:30';
ALTER TABLE settings ADD COLUMN machine_weekday_to   TEXT DEFAULT '20:30';
ALTER TABLE settings ADD COLUMN machine_weekend_from TEXT DEFAULT '09:00';
ALTER TABLE settings ADD COLUMN machine_weekend_to   TEXT DEFAULT '21:00';
