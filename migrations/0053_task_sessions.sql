-- SPEC §4.2zz, §7G — the 💪 Task buddy: one row per task session. Its id is the id of the timers row (task_…) that
-- does the ringing; this row holds what a timer doesn't. A new table only: the fires kind check is untouched. Additive.
CREATE TABLE task_sessions (
  id            TEXT PRIMARY KEY REFERENCES timers(id),
  member_id     TEXT NOT NULL REFERENCES members(id),   -- whose task; only they are alerted and see it
  limit_min     INTEGER CHECK (limit_min BETWEEN 1 AND 720), -- NULL = open-ended; counts working time
  done_looks    TEXT NOT NULL DEFAULT '[]',              -- JSON list of lines: what done looks like
  private       INTEGER NOT NULL DEFAULT 0,              -- 1 = the title is never spoken on a speaker
  started_at    TEXT NOT NULL,
  worked_ms     INTEGER NOT NULL DEFAULT 0,              -- banked working time
  working_since TEXT,                                    -- set while working
  break_until   TEXT,                                    -- set while on a break
  paused_at     TEXT,                                    -- set while paused
  since_break   TEXT,                                    -- when work last began after the start or a break (long-break hint)
  checkins      TEXT NOT NULL DEFAULT '[]',              -- JSON list of { at, mood, said }
  ended_at      TEXT,
  outcome       TEXT CHECK (outcome IN ('finished','stopped')),
  done_ticked   TEXT,                                    -- JSON list of ticked line numbers at Finish
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_task_sessions_member ON task_sessions(member_id, started_at);
CREATE UNIQUE INDEX uq_task_open ON task_sessions(member_id) WHERE ended_at IS NULL;
