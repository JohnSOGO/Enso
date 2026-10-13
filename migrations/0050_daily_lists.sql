-- §7A.4 — every day lists: a tick counts for today only, items may have a time, and Ping owners pushes an item's
-- owner at its time. deliveries.list_item_id marks those pushes (§9.4: never a founder ping).
ALTER TABLE lists ADD COLUMN daily INTEGER NOT NULL DEFAULT 0 CHECK (daily IN (0, 1));
ALTER TABLE lists ADD COLUMN ping_owners INTEGER NOT NULL DEFAULT 0 CHECK (ping_owners IN (0, 1));
ALTER TABLE list_items ADD COLUMN time TEXT;  -- 'HH:MM' (isTime) or NULL
ALTER TABLE deliveries ADD COLUMN list_item_id TEXT REFERENCES list_items(id);
CREATE INDEX idx_deliveries_list_item ON deliveries(list_item_id, created_at);
