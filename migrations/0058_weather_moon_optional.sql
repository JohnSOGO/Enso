-- SPEC §4.2zze, §7.5 — per-member switches for the day's weather (§7.11) and moon phases (§7.12); on by default.
ALTER TABLE member_prefs ADD COLUMN show_weather INTEGER NOT NULL DEFAULT 1;
ALTER TABLE member_prefs ADD COLUMN show_moon INTEGER NOT NULL DEFAULT 1;
