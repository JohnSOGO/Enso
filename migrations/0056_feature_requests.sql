-- SPEC §4.2zzc, §8.18 — what Ensō can't do yet, said in plain words (the Ensō button), kept for the next build. A new
-- table only. Additive.
CREATE TABLE feature_requests (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,                                  -- what was said, as said
  title      TEXT NOT NULL,                                  -- Claude's short name for it
  summary    TEXT NOT NULL,                                  -- Claude's one line
  size       TEXT NOT NULL CHECK (size IN ('small','big')),
  status     TEXT NOT NULL CHECK (status IN ('new','needs_john','done','dismissed')),
  note       TEXT,                                           -- why dismissed, or the version it shipped in
  created_by TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_feature_requests_created ON feature_requests(created_at);
