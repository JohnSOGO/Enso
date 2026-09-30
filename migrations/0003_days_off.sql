-- SPEC §7.3 — household days off: JSON array of holiday keys; NULL = DEFAULT_DAYS_OFF in holidays.ts.
ALTER TABLE settings ADD COLUMN days_off TEXT;
