-- §7B.7 — a mess reported NOT cleaned: asked about and recorded as usual, but a claim owes nobody a point. Additive only.
ALTER TABLE messes ADD COLUMN cleaned INTEGER NOT NULL DEFAULT 1;   -- 1 = the reporter cleaned it up; 0 = found it, not cleaned
