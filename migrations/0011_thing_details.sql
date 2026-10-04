-- §7C.1 — things gain address, phone and cost (free text, as written).
ALTER TABLE things ADD COLUMN address TEXT;
ALTER TABLE things ADD COLUMN phone TEXT;
ALTER TABLE things ADD COLUMN cost TEXT;
