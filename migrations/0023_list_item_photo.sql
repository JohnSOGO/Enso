-- SPEC §4.2v, §7A.3 — a list item's photo: its R2 key (list-items/{itemId}/{random}.jpg), NULL when it has none.
ALTER TABLE list_items ADD COLUMN photo_key TEXT;
