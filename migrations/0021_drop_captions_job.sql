-- SPEC §4.2t, §7E.2c — the captions-from-home job is gone: the Worker asks SogoAI in-line.
-- The index goes first (SQLite refuses to drop an indexed column); 0020's CHECK is column-level.
DROP INDEX idx_recipes_captions_job;
ALTER TABLE recipes DROP COLUMN captions_job;
ALTER TABLE recipes DROP COLUMN captions_queued_at;
ALTER TABLE recipes DROP COLUMN captions_claimed_at;
ALTER TABLE recipes DROP COLUMN captions_attempts;
