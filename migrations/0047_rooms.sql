-- §7B.6 — rooms: what done looks like moves from a chore to a room, and a chore may name its room. Lossless: every
-- chore that has areas becomes a room of the same name ('rom_' + the chore id's suffix, creator kept) and points at it;
-- every area and photo row is copied with its id, name, expectations, position and R2 key unchanged. chore_areas and
-- chore_area_photos are rebuilt as room_areas / room_area_photos (SQLite cannot change a column's table), as 0012 did.
CREATE TABLE rooms (
  id         TEXT PRIMARY KEY,                          -- 'rom_' + 16 base32
  name       TEXT NOT NULL,                             -- 1–40 chars, e.g. "Kitchen"
  position   INTEGER NOT NULL,                          -- the order added
  created_by TEXT REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO rooms (id, name, position, created_by, created_at, updated_at)
  SELECT 'rom_' || substr(ch.id, 5), substr(ch.title, 1, 40), ROW_NUMBER() OVER (ORDER BY ch.created_at, ch.id) - 1,
         ch.created_by, ch.created_at, ch.updated_at
    FROM chores ch WHERE EXISTS (SELECT 1 FROM chore_areas a WHERE a.chore_id = ch.id);

ALTER TABLE chores ADD COLUMN room_id TEXT REFERENCES rooms(id);   -- NULL = no room
UPDATE chores SET room_id = 'rom_' || substr(id, 5) WHERE EXISTS (SELECT 1 FROM chore_areas a WHERE a.chore_id = chores.id);

CREATE TABLE room_areas (
  id           TEXT PRIMARY KEY,                       -- 'cha_' + 16 base32 (ids kept from chore_areas)
  room_id      TEXT NOT NULL REFERENCES rooms(id),
  name         TEXT NOT NULL,                          -- 1–40 chars, e.g. "Sink"
  expectations TEXT NOT NULL DEFAULT '[]',             -- JSON string[], 0–12, each 1–120 chars, in order
  position     INTEGER NOT NULL,                       -- order within the room: the order added
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
INSERT INTO room_areas (id, room_id, name, expectations, position, created_by, created_at, updated_at)
  SELECT id, 'rom_' || substr(chore_id, 5), name, expectations, position, created_by, created_at, updated_at FROM chore_areas;

CREATE TABLE room_area_photos (
  id         TEXT PRIMARY KEY,                         -- 'cap_' + 16 base32
  area_id    TEXT NOT NULL REFERENCES room_areas(id),
  photo_key  TEXT NOT NULL,                            -- R2 key, private; never on the wire
  created_at TEXT NOT NULL
);
INSERT INTO room_area_photos (id, area_id, photo_key, created_at) SELECT id, area_id, photo_key, created_at FROM chore_area_photos;

DROP TABLE chore_area_photos;
DROP TABLE chore_areas;
CREATE INDEX idx_room_areas_room ON room_areas(room_id, position);
CREATE INDEX idx_room_area_photos_area ON room_area_photos(area_id, created_at);
