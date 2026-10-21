-- SPEC §4.2zzg, §7.9b — saved places, the household's address book: a place Ensō can't read from a link, with how to
-- arrive, used on an event that names it. words = JSON list of match words. Additive; seeded with Incognito SD.
CREATE TABLE places (
  id         TEXT PRIMARY KEY,                       -- 'plc_' + 16 base32
  name       TEXT NOT NULL,                          -- 1–60 chars
  address    TEXT NOT NULL,                          -- 1–200 chars (EVENT_ADDRESS_MAX)
  notes      TEXT,                                   -- arrival notes, ≤500; NULL = none
  words      TEXT NOT NULL DEFAULT '[]',             -- JSON list, ≤5 words of 3–40 chars
  created_by TEXT REFERENCES members(id),            -- NULL = seeded
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO places (id, name, address, notes, words, created_by, created_at, updated_at) VALUES (
  'plc_incognitosd0000', 'Incognito SD', '2335 Mirador, Vista, CA 92084',
  'Please park in the lower drive, and walk up the stairs to the sliding door entrance.',
  '["Incognito"]', NULL, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z'
);
