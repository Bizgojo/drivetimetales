-- Story Pills Migration
-- Adds prose reading text and author FK to stories table

-- Link stories to the authors table (Hal sets this when publishing)
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES authors(id) ON DELETE SET NULL;

-- Full prose version of the story for "Read the Story" pill
-- Hal writes this as plain paragraphs — no script formatting
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS prose_text TEXT;

-- Index for author lookups
CREATE INDEX IF NOT EXISTS idx_stories_author_id ON stories(author_id);
