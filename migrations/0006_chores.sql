-- §7B — chores and their daily runs. fires gains kind 'chore' (+ chore_run_id); SQLite
-- cannot alter a CHECK, so fires is rebuilt and its rows copied.
PRAGMA defer_foreign_keys = true;

CREATE TABLE chores (
  id           TEXT PRIMARY KEY,               -- 'chr_' + 16 base32
  title        TEXT NOT NULL,                  -- 1–60 chars
  done_means   TEXT,                           -- ≤ 200 chars: what "done" looks like
  days         TEXT NOT NULL,                  -- JSON Weekday[], ≥ 1, week order
  timing       TEXT NOT NULL CHECK (timing IN ('at','by')),
  time         TEXT NOT NULL,                  -- local HH:MM
  nudge        INTEGER NOT NULL DEFAULT 0 CHECK (nudge IN (0, 1)),   -- 'by' only
  people       TEXT NOT NULL,                  -- JSON member ids in turn order, 1–8
  steps        TEXT NOT NULL,                  -- JSON ChoreStep[], 1–6 (§7B.2)
  channels     TEXT NOT NULL,                  -- JSON CHANNEL[] (for rings and nudges)
  renotify_min INTEGER,                        -- NULL = ring once
  max_alerts   INTEGER NOT NULL DEFAULT 4,
  start_date   TEXT NOT NULL,                  -- local date created; rotation counts weeks from it
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE TABLE chore_runs (                      -- one per chore per day it is due
  id           TEXT PRIMARY KEY,               -- 'run_' + 16 base32
  chore_id     TEXT NOT NULL REFERENCES chores(id),
  date         TEXT NOT NULL,                  -- local YYYY-MM-DD
  assignee_id  TEXT REFERENCES members(id),    -- whose turn; NULL = nobody active
  step         INTEGER NOT NULL DEFAULT 0,     -- index of the current step; = steps.length when done
  done_at      TEXT,
  done_by      TEXT REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (chore_id, date)
);

CREATE TABLE fires_new (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder','timer','chore')),
  event_id        TEXT REFERENCES events(id),
  occurrence_date TEXT,
  timer_id        TEXT REFERENCES timers(id),
  chore_run_id    TEXT REFERENCES chore_runs(id),
  due_at          TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('scheduled','ringing','closed')),
  alert_count     INTEGER NOT NULL DEFAULT 0,
  last_alerted_at TEXT,
  close_reason    TEXT CHECK (close_reason IN ('done','acked','missed','superseded','stopped','removed')),
  closed_by       TEXT REFERENCES members(id),
  closed_at       TEXT,
  CHECK ((kind = 'reminder' AND event_id IS NOT NULL AND occurrence_date IS NOT NULL AND timer_id IS NULL AND chore_run_id IS NULL)
      OR (kind = 'timer'    AND timer_id IS NOT NULL AND event_id IS NULL AND chore_run_id IS NULL)
      OR (kind = 'chore'    AND chore_run_id IS NOT NULL AND event_id IS NULL AND timer_id IS NULL))
);
INSERT INTO fires_new (id, kind, event_id, occurrence_date, timer_id, chore_run_id, due_at, state,
                       alert_count, last_alerted_at, close_reason, closed_by, closed_at)
  SELECT id, kind, event_id, occurrence_date, timer_id, NULL, due_at, state,
         alert_count, last_alerted_at, close_reason, closed_by, closed_at FROM fires;
DROP TABLE fires;
ALTER TABLE fires_new RENAME TO fires;
CREATE UNIQUE INDEX uq_fire_occurrence ON fires(event_id, occurrence_date) WHERE kind = 'reminder' AND state != 'closed';
CREATE UNIQUE INDEX uq_timer_open      ON fires(timer_id) WHERE kind = 'timer' AND state != 'closed';
CREATE UNIQUE INDEX uq_chore_run_open  ON fires(chore_run_id) WHERE kind = 'chore' AND state != 'closed';
CREATE INDEX idx_fires_open ON fires(state, due_at) WHERE state != 'closed';
