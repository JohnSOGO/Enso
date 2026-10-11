-- §9.5 — a push I hid from my Alerts list; the row is kept (Status and the ping limit still count it). Additive only.
ALTER TABLE deliveries ADD COLUMN dismissed_at TEXT;
CREATE INDEX idx_deliveries_member ON deliveries(member_id, created_at);
