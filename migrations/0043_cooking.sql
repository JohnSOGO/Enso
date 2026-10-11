-- SPEC §4.2zp, §7D.8 — cooking timers: machines rows made on demand (id cook_…), so a machine fire points at one unchanged.
-- NULL cook_kind = one of the three fixed machines. A closed timer's row stays (its fires point at it). Additive only.
ALTER TABLE machines ADD COLUMN cook_kind TEXT;   -- COOK_KIND (vocab.ts); the route validates with isOneOf
ALTER TABLE machines ADD COLUMN name TEXT;        -- optional, "Oven 2"
ALTER TABLE machines ADD COLUMN created_at TEXT;
ALTER TABLE machines ADD COLUMN closed_at TEXT;   -- NULL = on the list
CREATE INDEX idx_machines_cooking_open ON machines(created_at) WHERE cook_kind IS NOT NULL AND closed_at IS NULL;
