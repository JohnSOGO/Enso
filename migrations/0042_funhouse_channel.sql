-- §9.4b — a delivery may go to the FunHouse: deliveries.channel gains 'funhouse'. SQLite cannot change a CHECK, so
-- deliveries is rebuilt and its rows copied, as 0012 did. No table references deliveries. Every other column, the
-- notice CHECK and the three indexes are unchanged (M1-VOCAB reads the CHECKs from sqlite_master).
CREATE TABLE deliveries_new (
  id            TEXT PRIMARY KEY,
  fire_id       TEXT REFERENCES fires(id),    -- NULL = no fire (an announcement, a ping, a notice, a mess ask)
  alert_number  INTEGER NOT NULL,             -- which alert of the fire (1 = first; no fire is 1)
  channel       TEXT NOT NULL CHECK (channel IN ('push','house','funhouse')),
  member_id     TEXT REFERENCES members(id),  -- set for push, NULL for house and funhouse
  message       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','claimed','sent','partial','failed')),
  detail        TEXT,                         -- error text or per-surface result JSON
  attempts      INTEGER NOT NULL DEFAULT 0,
  claimed_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  title         TEXT,
  speakers      TEXT,
  notice        TEXT CHECK (notice IN ('login','new_sign_in')),
  url           TEXT,
  mess_id       TEXT REFERENCES messes(id),
  dismissed_at  TEXT
);
INSERT INTO deliveries_new (id, fire_id, alert_number, channel, member_id, message, status, detail, attempts, claimed_at,
    created_at, updated_at, title, speakers, notice, url, mess_id, dismissed_at)
  SELECT id, fire_id, alert_number, channel, member_id, message, status, detail, attempts, claimed_at,
    created_at, updated_at, title, speakers, notice, url, mess_id, dismissed_at FROM deliveries;
DROP TABLE deliveries;
ALTER TABLE deliveries_new RENAME TO deliveries;
CREATE INDEX idx_deliveries_queue ON deliveries(channel, status);
CREATE INDEX idx_deliveries_mess ON deliveries(mess_id, member_id);
CREATE INDEX idx_deliveries_member ON deliveries(member_id, created_at);
