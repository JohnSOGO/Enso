-- SPEC §4.2zzk, §7.13 — per-member switch for the school days off (§7.5); on by default.
ALTER TABLE member_prefs ADD COLUMN show_school INTEGER NOT NULL DEFAULT 1;
