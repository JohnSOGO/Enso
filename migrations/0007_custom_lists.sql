-- §7A — lists become household data: any number, named by members. list_items.list (a
-- fixed vocabulary) becomes list_id, and owner_id becomes assignee_id for every list.
-- list_items is rebuilt (SQLite cannot drop a CHECK); nothing references it.
CREATE TABLE lists (
  id         TEXT PRIMARY KEY,                 -- 'lst_' + 16 base32; the two seeded lists keep fixed ids
  name       TEXT NOT NULL,                    -- 1–40 chars, as typed (trimmed)
  name_key   TEXT NOT NULL,                    -- itemKey(name): one list per name
  created_by TEXT REFERENCES members(id),      -- NULL for the two seeded lists
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX uq_list_name ON lists(name_key) WHERE deleted_at IS NULL;
INSERT INTO lists (id, name, name_key, created_by, created_at, updated_at) VALUES
  ('lst_shopping', 'Shopping',  'shopping',  NULL, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  ('lst_wishlist', 'Wish list', 'wish list', NULL, '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z');

CREATE TABLE list_items_new (
  id          TEXT PRIMARY KEY,
  list_id     TEXT NOT NULL REFERENCES lists(id),
  text        TEXT NOT NULL,
  text_key    TEXT NOT NULL,
  note        TEXT,
  assignee_id TEXT REFERENCES members(id),     -- one person, or NULL = the household
  created_by  TEXT NOT NULL REFERENCES members(id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  checked_at  TEXT,
  checked_by  TEXT REFERENCES members(id),
  deleted_at  TEXT
);
INSERT INTO list_items_new (id, list_id, text, text_key, note, assignee_id, created_by, created_at,
                            updated_at, checked_at, checked_by, deleted_at)
  SELECT id, CASE list WHEN 'shopping' THEN 'lst_shopping' ELSE 'lst_wishlist' END, text, text_key, note,
         owner_id, created_by, created_at, updated_at, checked_at, checked_by, deleted_at
    FROM list_items;
DROP TABLE list_items;
ALTER TABLE list_items_new RENAME TO list_items;
CREATE UNIQUE INDEX uq_list_item_key ON list_items(list_id, text_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_list_items ON list_items(list_id, checked_at) WHERE deleted_at IS NULL;
