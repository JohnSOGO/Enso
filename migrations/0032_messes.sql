-- §7B.7 — whose mess? A mess someone cleaned up, who owned up to it, and the point they owe. Additive only.
CREATE TABLE messes (
  id          TEXT PRIMARY KEY,                       -- 'mes_' + 16 base32
  reported_by TEXT NOT NULL REFERENCES members(id),   -- who cleaned it up, and is owed
  chore_id    TEXT REFERENCES chores(id),             -- the chore it belongs to; NULL = none named
  note        TEXT,                                   -- 1–120 chars; NULL = none
  photo_key   TEXT,                                   -- R2 messes/{id}/{random}.jpg; never on the wire; NULL once deleted
  claimed_by  TEXT REFERENCES members(id),            -- who owes: claimed it, or recorded by an admin
  claimed_at  TEXT,
  assigned_by TEXT REFERENCES members(id),            -- the admin who recorded it; NULL = claimed by the person
  discuss_at  TEXT,                                   -- moved to To talk about
  closed_at   TEXT,                                   -- closed by an admin as nobody's
  closed_by   TEXT REFERENCES members(id),
  settled_at  TEXT,
  settled_how TEXT CHECK (settled_how IN ('paid','forgiven')),
  settled_by  TEXT REFERENCES members(id),
  deleted_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_messes_created ON messes(created_at);

CREATE TABLE mess_denials (                           -- "Not me"
  mess_id    TEXT NOT NULL REFERENCES messes(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (mess_id, member_id)
);

-- A mess's asks and its To talk about notice: fire-less pushes that point at their mess (counted for the 4 asks).
ALTER TABLE deliveries ADD COLUMN mess_id TEXT REFERENCES messes(id);
CREATE INDEX idx_deliveries_mess ON deliveries(mess_id, member_id);
