-- SPEC §4.2zzf, §7B.9 — family IOUs: who owes whom how much (whole US cents), money paid back, let go or taken off a tab, and repeating
-- payback plans. ok_at NULL = waiting for the person it costs. What is owed, the queue and "behind" are derived. Additive.
CREATE TABLE ious (
  id         TEXT PRIMARY KEY,                       -- 'iou_' + 16 base32
  owed_by    TEXT NOT NULL REFERENCES members(id),   -- who owes
  owed_to    TEXT NOT NULL REFERENCES members(id),   -- who is owed
  cents      INTEGER NOT NULL CHECK (cents > 0),
  note       TEXT,                                   -- 1–120 chars; NULL = none
  created_by TEXT NOT NULL REFERENCES members(id),
  ok_at      TEXT,
  ok_by      TEXT REFERENCES members(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (owed_by <> owed_to)
);
CREATE INDEX idx_ious_pair ON ious(owed_by, owed_to, created_at);

CREATE TABLE iou_payments (
  id         TEXT PRIMARY KEY,                       -- 'iop_' + 16 base32
  owed_by    TEXT NOT NULL REFERENCES members(id),
  owed_to    TEXT NOT NULL REFERENCES members(id),
  cents      INTEGER NOT NULL CHECK (cents > 0),
  how        TEXT NOT NULL CHECK (how IN ('paid','let_go','tab')),  -- tab: a split bill taken off the payer's tab
  note       TEXT,                                   -- a tab's note (the bill); NULL = none
  created_by TEXT NOT NULL REFERENCES members(id),
  ok_at      TEXT,
  ok_by      TEXT REFERENCES members(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (owed_by <> owed_to)
);
CREATE INDEX idx_iou_payments_pair ON iou_payments(owed_by, owed_to, created_at);

CREATE TABLE iou_plans (
  id         TEXT PRIMARY KEY,                       -- 'ipl_' + 16 base32
  owed_by    TEXT NOT NULL REFERENCES members(id),
  owed_to    TEXT NOT NULL REFERENCES members(id),
  cents_each INTEGER NOT NULL CHECK (cents_each > 0),
  every      TEXT NOT NULL CHECK (every IN ('week','2weeks','month')),
  start_date TEXT NOT NULL,                          -- household local YYYY-MM-DD
  created_by TEXT NOT NULL REFERENCES members(id),
  ended_at   TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_iou_plan_live ON iou_plans(owed_by, owed_to) WHERE ended_at IS NULL;

-- A payback ping: a fire-less push pointing at its plan ("pinged today" is counted from here).
ALTER TABLE deliveries ADD COLUMN iou_plan_id TEXT REFERENCES iou_plans(id);
CREATE INDEX idx_deliveries_iou_plan ON deliveries(iou_plan_id, created_at);
