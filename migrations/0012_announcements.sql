-- §9.3 — an announcement is a delivery with no fire: deliveries.fire_id becomes nullable.
-- SQLite cannot drop a NOT NULL, so deliveries is rebuilt and its rows copied. No table
-- references deliveries, so nothing has to be stashed. Every other column and both CHECKs
-- are unchanged (M1-VOCAB reads them from sqlite_master).
CREATE TABLE deliveries_new (
  id            TEXT PRIMARY KEY,
  fire_id       TEXT REFERENCES fires(id),    -- NULL = an announcement (§9.3)
  alert_number  INTEGER NOT NULL,             -- which alert of the fire (1 = first; an announcement is 1)
  channel       TEXT NOT NULL CHECK (channel IN ('push','house')),
  member_id     TEXT REFERENCES members(id),  -- set for push, NULL for house
  message       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','claimed','sent','partial','failed')),
  detail        TEXT,                         -- error text or per-surface result JSON
  attempts      INTEGER NOT NULL DEFAULT 0,
  claimed_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
INSERT INTO deliveries_new (id, fire_id, alert_number, channel, member_id, message, status, detail, attempts, claimed_at, created_at, updated_at)
  SELECT id, fire_id, alert_number, channel, member_id, message, status, detail, attempts, claimed_at, created_at, updated_at FROM deliveries;
DROP TABLE deliveries;
ALTER TABLE deliveries_new RENAME TO deliveries;
CREATE INDEX idx_deliveries_queue ON deliveries(channel, status);
