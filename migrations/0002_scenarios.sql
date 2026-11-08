-- Datasets built from a typed request on /lab.
CREATE TABLE IF NOT EXISTS scenarios (
  id INTEGER PRIMARY KEY,
  prompt TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  model TEXT,
  ms INTEGER,
  created_json TEXT,
  steps_json TEXT,
  highlights_json TEXT,
  dataset_json TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE sessions ADD COLUMN scenario_id INTEGER;
ALTER TABLE sessions ADD COLUMN title TEXT;
ALTER TABLE kids ADD COLUMN scenario_id INTEGER;
ALTER TABLE families ADD COLUMN scenario_id INTEGER;
