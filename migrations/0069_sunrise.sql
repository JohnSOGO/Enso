-- SPEC §4.2zzp — events.start_sun takes 'sunrise' too (§7.7, §8.5d). SQLite cannot change a CHECK in place, so the
-- column is replaced without rebuilding events: rename the old one aside, add the new one, copy, drop the old one.
-- No index, view or trigger names start_sun; a column's own CHECK does not stop DROP COLUMN.
ALTER TABLE events RENAME COLUMN start_sun TO start_sun_0016;
ALTER TABLE events ADD COLUMN start_sun TEXT CHECK (start_sun IN ('sunrise', 'sunset'));
UPDATE events SET start_sun = start_sun_0016 WHERE start_sun_0016 IS NOT NULL;
ALTER TABLE events DROP COLUMN start_sun_0016;
