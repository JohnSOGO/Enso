-- SPEC §4.2zzj, §6.3 Private events — a private event shows only its time to whoever may not open it. Additive.
ALTER TABLE events ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
