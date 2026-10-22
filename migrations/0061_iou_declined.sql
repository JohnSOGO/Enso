-- SPEC §4.2zzh, §7B.9 — a declined IOU or payment is kept (declined_at NULL = not declined) and the one who made it gets
-- one private push, pointed at the row by deliveries.iou_row_id (an IOU or a payment id, so no foreign key). Additive.
ALTER TABLE ious ADD COLUMN declined_at TEXT;
ALTER TABLE ious ADD COLUMN declined_by TEXT REFERENCES members(id);
ALTER TABLE iou_payments ADD COLUMN declined_at TEXT;
ALTER TABLE iou_payments ADD COLUMN declined_by TEXT REFERENCES members(id);
ALTER TABLE deliveries ADD COLUMN iou_row_id TEXT;
