-- §7A — items on the two household lists. One row per item; checking it off keeps the
-- row (for "Recently bought" / "Done") until it ages out of view.
CREATE TABLE list_items (
  id          TEXT PRIMARY KEY,               -- 'itm_' + 16 base32
  list        TEXT NOT NULL CHECK (list IN ('shopping','wishlist')),
  text        TEXT NOT NULL,                  -- as typed, trimmed; 1–120 chars
  text_key    TEXT NOT NULL,                  -- itemKey(text), §7A.1
  note        TEXT,                           -- wish list detail; ≤ 1000 chars
  owner_id    TEXT REFERENCES members(id),    -- wish list: whose it is; NULL = household
  created_by  TEXT NOT NULL REFERENCES members(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  checked_at  TEXT,                           -- NULL = open
  checked_by  TEXT REFERENCES members(id),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX uq_list_item_key ON list_items(list, text_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_list_items ON list_items(list, checked_at) WHERE deleted_at IS NULL;
