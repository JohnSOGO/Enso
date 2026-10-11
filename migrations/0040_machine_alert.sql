-- SPEC §4.2zm, §7D.7 — who is alerted when a machine's load is done; NULL = nobody (phones only, no speaker). Additive only.
ALTER TABLE machines ADD COLUMN alert_id TEXT REFERENCES members(id);
-- A load already in a machine keeps alerting its owner; an owner-unknown load goes phones only.
UPDATE machines SET alert_id = owner_id WHERE done_at IS NOT NULL;
