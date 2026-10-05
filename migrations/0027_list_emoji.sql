-- §7A.1 — a list's own emoji; NULL = the default picked from its name (defaultListEmoji).
ALTER TABLE lists ADD COLUMN emoji TEXT;  -- one emoji (emojiError, §7.6) or NULL
