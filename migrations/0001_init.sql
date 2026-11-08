-- ChiggityCheck schema. Integer keys, ISO-8601 text dates, nothing hard-deleted in normal use.

CREATE TABLE IF NOT EXISTS families (
  id INTEGER PRIMARY KEY,
  household_name TEXT NOT NULL,
  primary_contact_name TEXT NOT NULL,
  relationship TEXT DEFAULT 'Mom',
  phone TEXT,
  email TEXT,
  language TEXT NOT NULL CHECK (language IN ('en','es','ht')),
  address TEXT,
  neighborhood TEXT,
  created_from TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kids (
  id INTEGER PRIMARY KEY,
  family_id INTEGER REFERENCES families(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  dob TEXT,
  school TEXT,
  grade TEXT,
  program TEXT NOT NULL CHECK (program IN ('mentoring','counseling','workshop')),
  site TEXT,
  enrolled_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','changed_school','exited')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kid_status_history (
  id INTEGER PRIMARY KEY,
  kid_id INTEGER NOT NULL REFERENCES kids(id),
  from_status TEXT, to_status TEXT,
  from_school TEXT, to_school TEXT,
  changed_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS mentors (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_volunteer INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  kid_id INTEGER NOT NULL REFERENCES kids(id),
  mentor_id INTEGER NOT NULL REFERENCES mentors(id),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  program TEXT NOT NULL CHECK (program IN ('mentoring','counseling','workshop')),
  site TEXT NOT NULL,
  held_at TEXT NOT NULL,
  start_time TEXT,
  facilitator_mentor_id INTEGER REFERENCES mentors(id),
  source TEXT NOT NULL CHECK (source IN ('photo','manual','seed')),
  photo_key TEXT,
  photo_url TEXT,
  photo_sha256 TEXT UNIQUE,
  header_confidence REAL,
  read_json TEXT,
  read_source TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('uploaded','read','confirmed')),
  captured_by TEXT,
  captured_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  kid_id INTEGER REFERENCES kids(id),
  raw_text TEXT,
  mark TEXT NOT NULL CHECK (mark IN ('present','absent','unclear')),
  row_index INTEGER,
  bbox TEXT,
  match_probability REAL,
  match_method TEXT CHECK (match_method IN ('auto','staff','new','skipped')),
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY,
  entity TEXT NOT NULL CHECK (entity IN ('kid','family','mentor')),
  entity_id INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  normalized TEXT NOT NULL,
  source TEXT,
  source_ref TEXT,
  probability REAL,
  first_seen_at TEXT NOT NULL,
  UNIQUE (entity, entity_id, normalized)
);

CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'webform',
  raw_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  family_id INTEGER REFERENCES families(id),
  kid_id INTEGER REFERENCES kids(id),
  resolve_probability REAL,
  resolved_by TEXT,
  status TEXT NOT NULL DEFAULT 'linked' CHECK (status IN ('linked','new','review'))
);

CREATE TABLE IF NOT EXISTS hours (
  id INTEGER PRIMARY KEY,
  mentor_id INTEGER NOT NULL REFERENCES mentors(id),
  session_id INTEGER REFERENCES sessions(id),
  held_on TEXT NOT NULL,
  site TEXT,
  program TEXT,
  hours REAL NOT NULL,
  reported_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('sheet','text','form','seed')),
  raw_text TEXT,
  dedupe_key TEXT NOT NULL,
  superseded_by INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY,
  kid_id INTEGER NOT NULL REFERENCES kids(id),
  family_id INTEGER REFERENCES families(id),
  reason_json TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('fine','watch','call','urgent')),
  severity_score REAL,
  severity_confidence REAL,
  needs_review INTEGER DEFAULT 0,
  language TEXT,
  draft_text TEXT,
  draft_translation TEXT,
  facts_json TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','sent','replied','closed','not_needed')),
  first_miss_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  sent_at TEXT,
  replied_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  family_id INTEGER REFERENCES families(id),
  kid_id INTEGER REFERENCES kids(id),
  followup_id INTEGER REFERENCES followups(id),
  kind TEXT NOT NULL CHECK (kind IN ('call','text','note','reply')),
  body TEXT,
  happened_at TEXT NOT NULL
);

-- Outbound messages through a channel provider (WhatsApp Business / SMS). Provider is a sandbox
-- that mirrors the real API shape: message ids, status webhooks, inbound replies.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  followup_id INTEGER REFERENCES followups(id),
  family_id INTEGER REFERENCES families(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms')),
  direction TEXT NOT NULL CHECK (direction IN ('out','in')),
  to_number TEXT,
  body TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'sandbox',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS message_events (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  status TEXT NOT NULL,
  payload TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  mode TEXT NOT NULL DEFAULT 'sandbox',
  detail TEXT,
  last_sync_at TEXT,
  last_result TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  bold TEXT,
  link TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id INTEGER PRIMARY KEY,
  quarter_label TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  json TEXT NOT NULL,
  built_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_calls (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  cost_usd REAL,
  ok INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_att_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_att_kid ON attendance(kid_id);
CREATE INDEX IF NOT EXISTS idx_alias_norm ON aliases(normalized);
CREATE INDEX IF NOT EXISTS idx_kids_family ON kids(family_id);
CREATE INDEX IF NOT EXISTS idx_hours_key ON hours(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_fu_status ON followups(status, severity);
CREATE INDEX IF NOT EXISTS idx_sessions_held ON sessions(held_at);
CREATE INDEX IF NOT EXISTS idx_msg_followup ON messages(followup_id);
