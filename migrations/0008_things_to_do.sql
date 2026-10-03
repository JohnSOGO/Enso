-- §7C — things to do: ideas with a time window, reminders, an optional photo.
-- fires gains kind 'thing' (+ thing_id); rebuilt exactly like 0006, deliveries stashed.
PRAGMA defer_foreign_keys = true;

CREATE TABLE things (
  id           TEXT PRIMARY KEY,                -- 'thg_' + 16 base32
  title        TEXT NOT NULL,                   -- 1–120
  note         TEXT,                            -- ≤ 2000
  place        TEXT,                            -- ≤ 200
  url          TEXT,                            -- ≤ 500, http(s) only
  window_start TEXT,                            -- local YYYY-MM-DD; NULL = any time
  window_end   TEXT,                            -- local YYYY-MM-DD ≥ window_start; NULL = open-ended
  remind_start INTEGER NOT NULL DEFAULT 0 CHECK (remind_start IN (0, 1)),
  remind_on    TEXT,                            -- local YYYY-MM-DD, a reminder on a picked date
  channels     TEXT NOT NULL DEFAULT '["push"]',-- JSON CHANNEL[] for its reminders
  photo_key    TEXT,                            -- R2 object key; NULL = no photo
  status       TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea','planned','done','dropped')),
  planned_event_id TEXT REFERENCES events(id),  -- set by Plan it
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_things_open ON things(status, window_end) WHERE deleted_at IS NULL;

-- Plan it (§7C.2) links the calendar event back to its thing.
ALTER TABLE events ADD COLUMN thing_id TEXT REFERENCES things(id);

-- Daily cap on photo reading (§7C.4).
CREATE TABLE photo_reads (at TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES members(id));

CREATE TABLE fires_new (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder','timer','chore','thing')),
  event_id        TEXT REFERENCES events(id),
  occurrence_date TEXT,                         -- reminder: the event occurrence; thing: the reminder's date
  timer_id        TEXT REFERENCES timers(id),
  chore_run_id    TEXT REFERENCES chore_runs(id),
  thing_id        TEXT REFERENCES things(id),
  due_at          TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('scheduled','ringing','closed')),
  alert_count     INTEGER NOT NULL DEFAULT 0,
  last_alerted_at TEXT,
  close_reason    TEXT CHECK (close_reason IN ('done','acked','missed','superseded','stopped','removed')),
  closed_by       TEXT REFERENCES members(id),
  closed_at       TEXT,
  CHECK ((kind = 'reminder' AND event_id IS NOT NULL AND occurrence_date IS NOT NULL AND timer_id IS NULL AND chore_run_id IS NULL AND thing_id IS NULL)
      OR (kind = 'timer'    AND timer_id IS NOT NULL AND event_id IS NULL AND chore_run_id IS NULL AND thing_id IS NULL)
      OR (kind = 'chore'    AND chore_run_id IS NOT NULL AND event_id IS NULL AND timer_id IS NULL AND thing_id IS NULL)
      OR (kind = 'thing'    AND thing_id IS NOT NULL AND occurrence_date IS NOT NULL AND event_id IS NULL AND timer_id IS NULL AND chore_run_id IS NULL))
);
INSERT INTO fires_new (id, kind, event_id, occurrence_date, timer_id, chore_run_id, thing_id, due_at, state,
                       alert_count, last_alerted_at, close_reason, closed_by, closed_at)
  SELECT id, kind, event_id, occurrence_date, timer_id, chore_run_id, NULL, due_at, state,
         alert_count, last_alerted_at, close_reason, closed_by, closed_at FROM fires;
CREATE TABLE deliveries_stash AS SELECT * FROM deliveries;
DELETE FROM deliveries;
DROP TABLE fires;
ALTER TABLE fires_new RENAME TO fires;
INSERT INTO deliveries SELECT * FROM deliveries_stash;
DROP TABLE deliveries_stash;
CREATE UNIQUE INDEX uq_fire_occurrence ON fires(event_id, occurrence_date) WHERE kind = 'reminder' AND state != 'closed';
CREATE UNIQUE INDEX uq_timer_open      ON fires(timer_id) WHERE kind = 'timer' AND state != 'closed';
CREATE UNIQUE INDEX uq_chore_run_open  ON fires(chore_run_id) WHERE kind = 'chore' AND state != 'closed';
CREATE UNIQUE INDEX uq_thing_reminder  ON fires(thing_id, occurrence_date) WHERE kind = 'thing' AND state != 'closed';
CREATE INDEX idx_fires_open ON fires(state, due_at) WHERE state != 'closed';
