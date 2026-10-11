-- §7B.8 — a bounty's picture: one per one-off, set by an admin, deleted when paid or deleted. Additive only.
ALTER TABLE bounties ADD COLUMN photo_key TEXT;   -- R2 bounties/{id}/{random}.jpg; never on the wire; NULL = none
