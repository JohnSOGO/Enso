-- SPEC §4.2s, §7E.2c — the captions-from-home job on a recipe row. Additive only.
-- Done and failed are not stored: ending a job puts these back to NULL / 0.
ALTER TABLE recipes ADD COLUMN captions_job TEXT CHECK (captions_job IN ('queued', 'claimed')); -- NULL = no job
ALTER TABLE recipes ADD COLUMN captions_queued_at TEXT;   -- when from-video queued it
ALTER TABLE recipes ADD COLUMN captions_claimed_at TEXT;  -- the latest claim
ALTER TABLE recipes ADD COLUMN captions_attempts INTEGER NOT NULL DEFAULT 0; -- claims so far
CREATE INDEX idx_recipes_captions_job ON recipes(captions_job) WHERE captions_job IS NOT NULL;
