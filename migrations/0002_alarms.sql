-- SPEC §4.2a — scheduled alarms are events with is_alarm = 1.
ALTER TABLE events ADD COLUMN is_alarm INTEGER NOT NULL DEFAULT 0 CHECK (is_alarm IN (0, 1));
