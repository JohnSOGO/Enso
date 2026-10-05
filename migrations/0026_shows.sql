-- §7F — the household's movies & shows. Soft-deleted; a watched show keeps who and when.
CREATE TABLE shows (
  id           TEXT PRIMARY KEY,                -- 'shw_' + 16 base32
  title        TEXT NOT NULL,                   -- 1–120
  title_key    TEXT NOT NULL,                   -- showKey(title, year): one per key among live rows (§7F.1)
  kind         TEXT CHECK (kind IN ('movie','show')),  -- NULL = unknown
  year         TEXT,                            -- ≤ 20, free text
  rt_critics   INTEGER CHECK (rt_critics BETWEEN 0 AND 100),
  rt_audience  INTEGER CHECK (rt_audience BETWEEN 0 AND 100),
  watch        TEXT NOT NULL DEFAULT '[]',      -- JSON { how, where, note }[] (≤ 12)
  checked_at   TEXT,                            -- when how-to-watch was last looked up; NULL = never
  summary      TEXT,                            -- ≤ 500
  note         TEXT,                            -- ≤ 2000
  url          TEXT,                            -- ≤ 500, http(s) only
  status       TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want','watched')),
  watched_at   TEXT,
  watched_by   TEXT REFERENCES members(id),
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE UNIQUE INDEX uq_shows_key ON shows(title_key) WHERE deleted_at IS NULL;
