-- SPEC §4.2zzo, §9.4c — one row per model call (Claude, Workers AI, SogoAI's LM Studio), so the PC model manager
-- shows cost and usage in one place. Counts only: no prompt, no answer, no member. The estimate is worked out when read. Additive.
CREATE TABLE model_calls (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  at                 TEXT NOT NULL,                     -- when the call ended (ISO)
  feature            TEXT NOT NULL,                     -- MODEL_FEATURE: what it was for
  provider           TEXT NOT NULL,                     -- MODEL_PROVIDER: anthropic | workers-ai | sogoai
  model              TEXT NOT NULL,                     -- the model that answered (or was asked, on a failure)
  ok                 INTEGER NOT NULL,                  -- 1 answered, 0 failed
  ms                 INTEGER NOT NULL DEFAULT 0,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  web_searches       INTEGER NOT NULL DEFAULT 0,
  web_fetches        INTEGER NOT NULL DEFAULT 0,
  audio_seconds      REAL,                              -- NULL when the provider gave no length
  audio_bytes        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX model_calls_at ON model_calls (at);
