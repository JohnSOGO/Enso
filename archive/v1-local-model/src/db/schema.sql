-- Home Reminder Calendar — Database Schema (D1 / SQLite)
-- Shared between local dev (better-sqlite3) and production (Cloudflare D1)

-- Households
CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES members(id),
    timezone TEXT DEFAULT 'America/Los_Angeles',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Members (users)
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    color TEXT DEFAULT '#6B7280',
    role TEXT CHECK(role IN ('owner', 'admin', 'member')) NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'invited', 'suspended')),
    push_token TEXT,
    timezone TEXT,
    quiet_hours_start TEXT,
    quiet_hours_end TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen TEXT,
    UNIQUE(household_id, email)
);

-- Invite codes
CREATE TABLE IF NOT EXISTS invite_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    household_id TEXT NOT NULL REFERENCES households(id),
    created_by TEXT NOT NULL REFERENCES members(id),
    display_name TEXT,
    role TEXT DEFAULT 'member',
    used_by TEXT REFERENCES members(id),
    expires_at TEXT NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Calendar events
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    creator_id TEXT NOT NULL REFERENCES members(id),
    title TEXT NOT NULL,
    description TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    color TEXT,
    is_all_day INTEGER DEFAULT 0,
    recurring_rule TEXT,
    assigned_to TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    event_id TEXT REFERENCES events(id),
    creator_id TEXT NOT NULL REFERENCES members(id),
    title TEXT NOT NULL,
    type TEXT CHECK(type IN ('fixed', 'repeating', 'delayed')) NOT NULL,
    trigger_at TEXT NOT NULL,
    repeat_interval TEXT,
    ack_delay_minutes INTEGER DEFAULT 30,
    max_repeats INTEGER DEFAULT 3,
    status TEXT DEFAULT 'pending' CHECK(status IN (
        'pending', 'firing', 'acknowledged',
        'delayed', 'completed', 'dismissed', 'escalated'
    )),
    current_repeat_count INTEGER DEFAULT 0,
    last_ack_by TEXT REFERENCES members(id),
    last_ack_at TEXT,
    next_fire_after_ack TEXT,
    channels TEXT DEFAULT '["push"]',
    escalation_config TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Reminder ack history
CREATE TABLE IF NOT EXISTS reminder_ack_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id TEXT NOT NULL REFERENCES reminders(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    action TEXT CHECK(action IN ('acknowledge', 'complete', 'dismiss')) NOT NULL,
    timestamp TEXT DEFAULT (datetime('now')),
    device_type TEXT
);

-- HA sync state
CREATE TABLE IF NOT EXISTS ha_sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id TEXT NOT NULL REFERENCES households(id),
    member_id TEXT REFERENCES members(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_household_time ON events(household_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_reminders_household_status ON reminders(household_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_trigger_at ON reminders(trigger_at);
CREATE INDEX IF NOT EXISTS idx_members_household ON members(household_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_hash ON invite_codes(code_hash);
