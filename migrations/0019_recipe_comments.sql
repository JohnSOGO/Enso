-- §7E.2 — why the video creator's comments couldn't be read. Additive only.
ALTER TABLE recipes ADD COLUMN comments_error TEXT; -- NULL = read, none to read, or not tried
