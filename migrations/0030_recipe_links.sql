-- §7E.6 — a recipe read from a link that is not a YouTube video. Additive only.
ALTER TABLE recipes ADD COLUMN link TEXT;  -- recipeLinkOf's cleaned link; NULL for a video or a typed recipe
-- One live recipe per link (§7E.6): a second paste of the same link is 409 duplicate.
CREATE UNIQUE INDEX uq_recipe_link ON recipes(link) WHERE deleted_at IS NULL AND link IS NOT NULL;
