-- §7B.3 — a chore can be timed by the sunset: NULL = `time` is a clock time; N = local sunset − N minutes each day.
ALTER TABLE chores ADD COLUMN sun_offset_min INTEGER CHECK (sun_offset_min BETWEEN 0 AND 240);
