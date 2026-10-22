-- SPEC §4.2zzi, §8.4a — the home AI's highlights, remembered by the exact notes text's SHA-256, so a text opened again
-- shows them without asking SogoAI. No notes text, no link to an event or item. Additive.
CREATE TABLE note_marks (
  text_hash  TEXT PRIMARY KEY,                       -- hex SHA-256 of the notes text, exactly as sent
  marks      TEXT NOT NULL,                          -- JSON FoundMark[] (validMarks), ≥ 1
  created_at TEXT NOT NULL                           -- when stored; pruned after NOTE_MARKS_KEEP_DAYS
);
