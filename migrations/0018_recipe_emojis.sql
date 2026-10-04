-- §7E.5 — each person's own emoji on a recipe: one per member per recipe. Additive only.
-- A soft-deleted recipe keeps its rows; only live recipes are ever returned (⚑ Q75).
CREATE TABLE recipe_emojis (
  recipe_id  TEXT NOT NULL REFERENCES recipes(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  emoji      TEXT NOT NULL,                      -- one emoji (emojiError, §7.6)
  updated_at TEXT NOT NULL,
  PRIMARY KEY (recipe_id, member_id)
);
