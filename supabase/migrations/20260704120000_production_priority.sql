ALTER TABLE stories ADD COLUMN IF NOT EXISTS production_priority INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_stories_production_priority
  ON stories(production_priority)
  WHERE production_priority > 0;
