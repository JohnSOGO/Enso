-- SPEC §4.2zzd, §1.3, §8.18 — a fifth feature_requests.status, 'outside': an ask outside what Ensō is for, logged
-- for John to review. SQLite can't widen a CHECK in place: rebuild the table, copy every row, then the index again.
-- Nothing references feature_requests.
CREATE TABLE feature_requests_new (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,                                  -- what was said, as said
  title      TEXT NOT NULL,                                  -- Claude's short name for it
  summary    TEXT NOT NULL,                                  -- Claude's one line
  size       TEXT NOT NULL CHECK (size IN ('small','big')),
  status     TEXT NOT NULL CHECK (status IN ('new','needs_john','outside','done','dismissed')),
  note       TEXT,                                           -- why dismissed, or the version it shipped in
  created_by TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO feature_requests_new (id, text, title, summary, size, status, note, created_by, created_at, updated_at)
  SELECT id, text, title, summary, size, status, note, created_by, created_at, updated_at FROM feature_requests;
DROP TABLE feature_requests;
ALTER TABLE feature_requests_new RENAME TO feature_requests;
CREATE INDEX idx_feature_requests_created ON feature_requests(created_at);
