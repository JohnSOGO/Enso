-- SPEC §4.2u, §9.4 — a fire-less push delivery may carry its own push title (ops/notify); NULL elsewhere.
ALTER TABLE deliveries ADD COLUMN title TEXT;
