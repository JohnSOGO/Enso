-- SPEC §4.2n — a rolling timer's optional active time range (§5.3 rule 0): local wall time
-- HH:MM in the household timezone. Both NULL = no window. No CHECK: the route validates.
ALTER TABLE timers ADD COLUMN active_from TEXT;
ALTER TABLE timers ADD COLUMN active_to TEXT;
