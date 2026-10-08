-- SPEC §4.2zf, §5.5a — a rolling timer can announce the start of its day. Additive only.
ALTER TABLE timers ADD COLUMN announce_start INTEGER NOT NULL DEFAULT 0 CHECK (announce_start IN (0, 1));
ALTER TABLE timers ADD COLUMN announced_on TEXT;  -- local YYYY-MM-DD of the window opening last announced
