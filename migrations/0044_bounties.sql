-- §7B.8 — bounties: points on a chore, one-off jobs, and the earnings an admin OKs. Additive only.
ALTER TABLE chores ADD COLUMN bounty INTEGER CHECK (bounty BETWEEN 1 AND 10);   -- points a run pays its finisher; NULL = none

CREATE TABLE bounties (                                 -- one-off jobs
  id          TEXT PRIMARY KEY,                         -- 'bty_' + 16 base32
  title       TEXT NOT NULL,                            -- 1–60 chars
  note        TEXT,                                     -- 1–120 chars; NULL = none
  points      INTEGER NOT NULL CHECK (points BETWEEN 1 AND 10),
  created_by  TEXT NOT NULL REFERENCES members(id),     -- an admin
  taken_by    TEXT REFERENCES members(id),              -- I'll do it; lapses TAKE_HOURS after taken_at
  taken_at    TEXT,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE earnings (                                 -- work done for points: pending until OK'd
  id           TEXT PRIMARY KEY,                        -- 'ern_' + 16 base32
  bounty_id    TEXT REFERENCES bounties(id),
  chore_run_id TEXT REFERENCES chore_runs(id),
  member_id    TEXT NOT NULL REFERENCES members(id),    -- who earns it
  points       INTEGER NOT NULL CHECK (points BETWEEN 1 AND 10),   -- copied when done
  done_at      TEXT NOT NULL,
  ok_by        TEXT REFERENCES members(id),
  ok_at        TEXT,
  dropped_at   TEXT,                                    -- Not yet, or the run's Undo; never deleted
  CHECK ((bounty_id IS NULL) != (chore_run_id IS NULL))
);
CREATE UNIQUE INDEX uq_earning_bounty ON earnings(bounty_id) WHERE bounty_id IS NOT NULL AND dropped_at IS NULL;
CREATE UNIQUE INDEX uq_earning_run ON earnings(chore_run_id) WHERE chore_run_id IS NOT NULL AND dropped_at IS NULL;
CREATE INDEX idx_earnings_done ON earnings(done_at);

-- The two bounty pushes point at what they are about, so the founder-ping predicate (§9.4) leaves them out.
ALTER TABLE deliveries ADD COLUMN bounty_id TEXT REFERENCES bounties(id);
ALTER TABLE deliveries ADD COLUMN earning_id TEXT REFERENCES earnings(id);
