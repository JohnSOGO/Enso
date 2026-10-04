-- SPEC §4.2w, §9.2a — the house speakers a member chose: a JSON list of HA entity ids; NULL = not chosen (the default speakers).
ALTER TABLE member_prefs ADD COLUMN house_speakers TEXT;
-- SPEC §4.2w, §9.2a — the speakers a house delivery is spoken on, fixed when it is written; NULL = the default speakers.
ALTER TABLE deliveries ADD COLUMN speakers TEXT;
