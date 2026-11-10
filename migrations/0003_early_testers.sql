-- Early-tester waitlist for the official launch. Not touched by demo reset.
CREATE TABLE IF NOT EXISTS early_testers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  organization TEXT NOT NULL,
  role TEXT,
  org_type TEXT,
  people_served TEXT,
  phone TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
