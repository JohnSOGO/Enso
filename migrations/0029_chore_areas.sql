-- §7B.6 — what done looks like: a chore's named areas, each with a list of expectations and reference photos.
CREATE TABLE chore_areas (
  id           TEXT PRIMARY KEY,                       -- 'cha_' + 16 base32
  chore_id     TEXT NOT NULL REFERENCES chores(id),
  name         TEXT NOT NULL,                          -- 1–40 chars, e.g. "Sink"
  expectations TEXT NOT NULL DEFAULT '[]',             -- JSON string[], 0–12, each 1–120 chars, in order
  position     INTEGER NOT NULL,                       -- order within the chore: the order added
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_chore_areas_chore ON chore_areas(chore_id, position);

CREATE TABLE chore_area_photos (
  id         TEXT PRIMARY KEY,                         -- 'cap_' + 16 base32
  area_id    TEXT NOT NULL REFERENCES chore_areas(id),
  photo_key  TEXT NOT NULL,                            -- R2 chore-areas/{areaId}/{random}.jpg; never on the wire
  created_at TEXT NOT NULL
);
CREATE INDEX idx_chore_area_photos_area ON chore_area_photos(area_id, created_at);
