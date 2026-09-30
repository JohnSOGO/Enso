-- SPEC §7.4 — per-member switch for the 📈 monthly options expiration marker.
ALTER TABLE member_prefs ADD COLUMN show_options_expiration INTEGER NOT NULL DEFAULT 0;
