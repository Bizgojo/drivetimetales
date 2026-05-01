CREATE TABLE IF NOT EXISTS story_queue_items (
  id TEXT PRIMARY KEY,
  story_id UUID NULL REFERENCES stories(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Story Idea',
  premise TEXT NOT NULL DEFAULT '',
  setting TEXT NOT NULL DEFAULT '',
  primary_genre TEXT NOT NULL DEFAULT '',
  secondary_genre TEXT NOT NULL DEFAULT '',
  tertiary_genre TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '15 min',
  author_target TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_v2', 'ready_for_asc', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_queue_items_status_updated
  ON story_queue_items(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_queue_items_story_id
  ON story_queue_items(story_id);
