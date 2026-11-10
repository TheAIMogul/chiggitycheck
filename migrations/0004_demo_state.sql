-- Tracks when someone last changed the demo data, so the cron can put it back an hour later.
CREATE TABLE IF NOT EXISTS demo_state (id INTEGER PRIMARY KEY CHECK (id = 1), changed_at TEXT);
INSERT OR IGNORE INTO demo_state (id, changed_at) VALUES (1, NULL);
