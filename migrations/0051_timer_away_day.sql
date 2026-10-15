-- SPEC §4.2zx, §9.2c — a timer's day ending ends Away. Clears Away on the open timer fires that carried it into a
-- later day before that rule existed. Data only, no schema change.
UPDATE fires SET away_by = NULL, away_at = NULL WHERE kind = 'timer' AND state = 'scheduled' AND away_by IS NOT NULL;
