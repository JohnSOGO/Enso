-- §7.5 — optional events: shown to, and reminding, only the members who turned them on.
ALTER TABLE events ADD COLUMN optional INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1));
CREATE TABLE event_optins (
  event_id   TEXT NOT NULL REFERENCES events(id),
  member_id  TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, member_id)
);
