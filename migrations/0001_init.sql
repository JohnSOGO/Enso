-- Home Reminder Calendar — initial schema (SPEC.md §4.2)
CREATE TABLE settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  household_name TEXT NOT NULL DEFAULT 'Home',
  timezone      TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  relay_last_seen TEXT                        -- UTC ISO; updated on every relay claim
);
INSERT INTO settings (id) VALUES (1);

CREATE TABLE members (
  id            TEXT PRIMARY KEY,             -- 'mem_' + 16 random base32 chars
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  color         TEXT NOT NULL,                -- from §8.4 palette
  role          TEXT NOT NULL CHECK (role IN ('owner','member')),
  password_hash TEXT NOT NULL,                -- 'pbkdf2$100000$<salt b64>$<hash b64>'
  created_at    TEXT NOT NULL,
  disabled_at   TEXT                          -- non-null = cannot log in
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id),
  token_hash    TEXT NOT NULL UNIQUE,         -- SHA-256 hex of the cookie token
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL                 -- sliding: now + 90 days on each use
);

CREATE TABLE invites (
  id            TEXT PRIMARY KEY,
  code_hash     TEXT NOT NULL UNIQUE,         -- SHA-256 hex of the normalized code
  display_name  TEXT NOT NULL,
  created_by    TEXT NOT NULL REFERENCES members(id),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,                -- created_at + 7 days
  used_by       TEXT REFERENCES members(id),
  used_at       TEXT,
  revoked_at    TEXT
);

CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  notes         TEXT,
  start_date    TEXT NOT NULL,                -- local YYYY-MM-DD
  start_time    TEXT,                         -- local HH:MM; NULL = all-day
  end_date      TEXT NOT NULL,                -- local; = start_date for single-day
  end_time      TEXT,                         -- local HH:MM; NULL if all-day
  recurrence    TEXT,                         -- JSON, §4.3; NULL = one-off
  exdates       TEXT NOT NULL DEFAULT '[]',   -- JSON array of local YYYY-MM-DD skipped occurrences
  assigned_to   TEXT NOT NULL DEFAULT '[]',   -- JSON array of member ids; [] = everyone
  -- reminder (all NULL = no reminder)
  remind_offset_min INTEGER,                  -- minutes BEFORE start; 0 = at start (all-day: start = 09:00 local ⚑ DEFAULT)
  remind_channels   TEXT,                     -- JSON array of CHANNEL
  renotify_min      INTEGER,                  -- NULL = alert once
  max_alerts        INTEGER NOT NULL DEFAULT 4,
  created_by    TEXT NOT NULL REFERENCES members(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_events_dates ON events(start_date, end_date) WHERE deleted_at IS NULL;

CREATE TABLE timers (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  interval_min  INTEGER NOT NULL CHECK (interval_min BETWEEN 1 AND 1440),
  channels      TEXT NOT NULL,                -- JSON array of CHANNEL
  renotify_min  INTEGER DEFAULT 15,           -- NULL = alert once
  max_alerts    INTEGER NOT NULL DEFAULT 4,
  assigned_to   TEXT NOT NULL DEFAULT '[]',
  running       INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT NOT NULL REFERENCES members(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

-- One row per time an alert is due. Reminders: one per event occurrence.
-- Timers: one per countdown.
CREATE TABLE fires (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('reminder','timer')),
  event_id        TEXT REFERENCES events(id),
  occurrence_date TEXT,                       -- local YYYY-MM-DD of the event occurrence
  timer_id        TEXT REFERENCES timers(id),
  due_at          TEXT NOT NULL,              -- UTC ISO
  state           TEXT NOT NULL CHECK (state IN ('scheduled','ringing','closed')),
  alert_count     INTEGER NOT NULL DEFAULT 0,
  last_alerted_at TEXT,
  close_reason    TEXT CHECK (close_reason IN ('done','acked','missed','superseded','stopped','removed')),
  closed_by       TEXT REFERENCES members(id),
  closed_at       TEXT,
  CHECK ((kind = 'reminder' AND event_id IS NOT NULL AND occurrence_date IS NOT NULL AND timer_id IS NULL)
      OR (kind = 'timer'    AND timer_id IS NOT NULL AND event_id IS NULL))
);
CREATE UNIQUE INDEX uq_fire_occurrence ON fires(event_id, occurrence_date) WHERE kind = 'reminder' AND state != 'closed';
CREATE UNIQUE INDEX uq_timer_open      ON fires(timer_id) WHERE kind = 'timer' AND state != 'closed';
CREATE INDEX idx_fires_open ON fires(state, due_at) WHERE state != 'closed';

CREATE TABLE deliveries (
  id            TEXT PRIMARY KEY,
  fire_id       TEXT NOT NULL REFERENCES fires(id),
  alert_number  INTEGER NOT NULL,             -- which alert of the fire (1 = first)
  channel       TEXT NOT NULL CHECK (channel IN ('push','house')),
  member_id     TEXT REFERENCES members(id),  -- set for push, NULL for house
  message       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','claimed','sent','partial','failed')),
  detail        TEXT,                         -- error text or per-surface result JSON
  attempts      INTEGER NOT NULL DEFAULT 0,
  claimed_at    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_deliveries_queue ON deliveries(channel, status);

CREATE TABLE push_subscriptions (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id),
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TEXT NOT NULL,
  last_ok_at    TEXT,
  last_error    TEXT
);

CREATE TABLE school_holidays (
  date          TEXT PRIMARY KEY,             -- local YYYY-MM-DD
  label         TEXT NOT NULL
);

CREATE TABLE login_failures (             -- §6.4 rate limit; rows older than 15 min are ignored
  email         TEXT NOT NULL COLLATE NOCASE,
  at            TEXT NOT NULL
);
CREATE INDEX idx_login_failures ON login_failures(email, at);

CREATE TABLE member_prefs (
  member_id            TEXT PRIMARY KEY REFERENCES members(id),
  show_public_holidays INTEGER NOT NULL DEFAULT 1,
  show_school_holidays INTEGER NOT NULL DEFAULT 1
);
