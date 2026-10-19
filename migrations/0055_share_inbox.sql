-- SPEC §4.2zzb, §7H — Send to Enso: each member's one share key (its SHA-256 only) and the items that arrived in their
-- Inbox. An item's kind (photo / link / text) is derived from which columns are set, never stored. New tables only. Additive.
CREATE TABLE share_keys (
  member_id  TEXT PRIMARY KEY REFERENCES members(id),
  key_hash   TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE inbox_items (
  id         TEXT PRIMARY KEY,
  member_id  TEXT NOT NULL REFERENCES members(id),   -- whose Inbox; only they see it
  url        TEXT,                                    -- ≤ 2000
  text       TEXT,                                    -- ≤ 4000
  photo_key  TEXT,                                    -- R2 inbox/{member}/…
  created_at TEXT NOT NULL
);
CREATE INDEX idx_inbox_member ON inbox_items(member_id, created_at);
