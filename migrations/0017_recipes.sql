-- §7E — recipes, household-shared: read from a YouTube video, or typed by hand. Additive only.
-- No url or thumbnail column: both are derived from video_id (§7E.1).
CREATE TABLE recipes (
  id             TEXT PRIMARY KEY,               -- 'rcp_' + 16 base32
  title          TEXT NOT NULL,                  -- 1–120; the dish, else the video's title
  video_id       TEXT,                           -- the 11-character YouTube id; NULL = typed
  video_title    TEXT,                           -- as YouTube gave it; NULL when typed
  channel        TEXT,                           -- the channel's name; NULL when typed
  ingredients    TEXT NOT NULL,                  -- JSON string[], each ≤ INGREDIENT_MAX
  steps          TEXT NOT NULL,                  -- JSON string[]
  servings       TEXT,                           -- free text as stated
  time_text      TEXT,                           -- free text as stated
  found          INTEGER NOT NULL CHECK (found IN (0, 1)),
  source         TEXT NOT NULL,                  -- JSON RECIPE_SOURCE[]: what was read
  captions_error TEXT,                           -- why captions couldn't be read; NULL = read, or not tried
  created_by     TEXT NOT NULL REFERENCES members(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
-- One live recipe per video (§7E.2): a second paste of the same link is 409 duplicate.
CREATE UNIQUE INDEX uq_recipe_video ON recipes(video_id) WHERE deleted_at IS NULL AND video_id IS NOT NULL;

-- Daily cap on reading videos (§7E.2), counted apart from photo_reads.
CREATE TABLE recipe_reads (at TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES members(id));
