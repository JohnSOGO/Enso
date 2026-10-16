-- SPEC §4.2zy, §8.4 — an event reminder's Random time: the local HH:MM window [from, to) its alert time is picked in.
-- Both NULL = a plain reminder. Additive only.
ALTER TABLE events ADD COLUMN remind_random_from TEXT;
ALTER TABLE events ADD COLUMN remind_random_to TEXT;
