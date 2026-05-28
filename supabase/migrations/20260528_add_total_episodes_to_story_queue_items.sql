-- Add total_episodes to story_queue_items so series jobs carry their episode count
-- through to the production pipeline. No backfill needed; existing rows default to NULL.
ALTER TABLE story_queue_items
  ADD COLUMN IF NOT EXISTS total_episodes INTEGER NULL;
