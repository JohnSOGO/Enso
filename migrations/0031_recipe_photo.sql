-- §7E.2b — a recipe's picture: the first screenshot of its latest read from screenshots, in R2. Additive only.
ALTER TABLE recipes ADD COLUMN photo_key TEXT;  -- R2 recipes/{id}/{random}.jpg; never on the wire; NULL = none
