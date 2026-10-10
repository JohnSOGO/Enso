-- SPEC §4.2zk, §9.2b — quiet the house: speakers say nothing until this instant. Additive only.
ALTER TABLE settings ADD COLUMN house_quiet_until TEXT;                     -- UTC ISO; NULL or past = not quiet
ALTER TABLE settings ADD COLUMN house_quiet_by TEXT REFERENCES members(id); -- who set it
