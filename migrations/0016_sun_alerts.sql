-- SPEC §4.2o — sun-timed alerts (§7.7): the household's place, and an event whose start is the
-- local sunset. A sun row has start_time/end_time NULL and end_date = start_date;
-- remind_offset_min is "minutes before sunset". No event is inserted here (§14).
ALTER TABLE settings ADD COLUMN latitude REAL;
ALTER TABLE settings ADD COLUMN longitude REAL;
UPDATE settings SET latitude = 33.20, longitude = -117.29 WHERE id = 1;  -- ZIP 92056, Oceanside
ALTER TABLE events ADD COLUMN start_sun TEXT CHECK (start_sun IN ('sunset'));
