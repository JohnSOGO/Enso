-- §7.2 / §7.6 — school holidays removed (the table and the member switch); event emoji added.
DROP TABLE school_holidays;
ALTER TABLE member_prefs DROP COLUMN show_school_holidays;
ALTER TABLE events ADD COLUMN emoji TEXT;
