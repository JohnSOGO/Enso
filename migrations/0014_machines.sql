-- §7D — the laundry loop: two machines, and fires gain kind 'machine' (+ machine_id).
-- fires is rebuilt exactly like 0006/0008 (SQLite cannot alter a CHECK), deliveries stashed.
PRAGMA defer_foreign_keys = true;

CREATE TABLE machines (
  id         TEXT PRIMARY KEY,                 -- MACHINE (vocab.ts); the route validates with isOneOf
  owner_id   TEXT REFERENCES members(id),      -- whose load; NULL = free
  minutes    INTEGER,                          -- the chip picked (MACHINE_MINUTES)
  started_at TEXT,                             -- UTC ISO; NULL = free
  done_at    TEXT,                             -- started_at + minutes
  started_by TEXT REFERENCES members(id),
  updated_at TEXT
);
INSERT INTO machines (id, updated_at) VALUES ('washer', '2026-10-03T00:00:00.000Z'), ('dryer', '2026-10-03T00:00:00.000Z');

CREATE TABLE fires_new (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder','timer','chore','thing','machine')),
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
  machine_id      TEXT REFERENCES machines(id),
  CHECK ((kind = 'reminder' AND event_id IS NOT NULL AND occurrence_date IS NOT NULL AND timer_id IS NULL AND chore_run_id IS NULL AND thing_id IS NULL AND machine_id IS NULL)
      OR (kind = 'timer'    AND timer_id IS NOT NULL AND event_id IS NULL AND chore_run_id IS NULL AND thing_id IS NULL AND machine_id IS NULL)
      OR (kind = 'chore'    AND chore_run_id IS NOT NULL AND event_id IS NULL AND timer_id IS NULL AND thing_id IS NULL AND machine_id IS NULL)
      OR (kind = 'thing'    AND thing_id IS NOT NULL AND occurrence_date IS NOT NULL AND event_id IS NULL AND timer_id IS NULL AND chore_run_id IS NULL AND machine_id IS NULL)
      OR (kind = 'machine'  AND machine_id IS NOT NULL AND event_id IS NULL AND timer_id IS NULL AND chore_run_id IS NULL AND thing_id IS NULL))
);
INSERT INTO fires_new (id, kind, event_id, occurrence_date, timer_id, chore_run_id, thing_id, due_at, state,
                       alert_count, last_alerted_at, close_reason, closed_by, closed_at, machine_id)
  SELECT id, kind, event_id, occurrence_date, timer_id, chore_run_id, thing_id, due_at, state,
         alert_count, last_alerted_at, close_reason, closed_by, closed_at, NULL FROM fires;
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
CREATE UNIQUE INDEX uq_machine_open    ON fires(machine_id) WHERE kind = 'machine' AND state != 'closed';
CREATE INDEX idx_fires_open ON fires(state, due_at) WHERE state != 'closed';
