-- §6.6 / §4.2x — Sign in with my phone. Additive only.

-- One row per "Sign in with my phone" request. Rows are never deleted: they are the rate-limit count.
CREATE TABLE login_requests (
  id                 TEXT PRIMARY KEY,                -- 'lgn_' + 16 base32
  member_id          TEXT REFERENCES members(id),     -- NULL = a decoy: no usable member, or over the limit
  email              TEXT NOT NULL COLLATE NOCASE,    -- as asked, trimmed; what the limit counts by
  waiting_token_hash TEXT NOT NULL UNIQUE,            -- SHA-256 hex of the waiting browser's cookie
  match_number       INTEGER NOT NULL,                -- the 2-digit number the browser shows
  choices            TEXT NOT NULL,                   -- JSON [n, n, n]: the match and two decoys, shuffled
  status             TEXT NOT NULL CHECK (status IN ('pending','approved','denied','used')),
  user_agent         TEXT,                            -- the waiting browser's, <= 300 chars
  place              TEXT,                            -- "City, CC" from request.cf; NULL = unknown
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL,                   -- created_at + 2 min
  decided_at         TEXT,                            -- approved or denied
  used_at            TEXT                             -- the session was minted
);
CREATE INDEX idx_login_requests_email ON login_requests(email, created_at);
CREATE INDEX idx_login_requests_member ON login_requests(member_id, status);

-- A push that is a sign-in notice (no fire), and where tapping it goes.
ALTER TABLE deliveries ADD COLUMN notice TEXT CHECK (notice IN ('login','new_sign_in'));
ALTER TABLE deliveries ADD COLUMN url TEXT;
