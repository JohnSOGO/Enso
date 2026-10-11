-- §7B.8 — a bounty's done photo: one per pending earning, deleted on OK or drop. Additive only.
ALTER TABLE earnings ADD COLUMN photo_key TEXT;   -- R2 earnings/{id}/{random}.jpg; never on the wire; NULL = none
