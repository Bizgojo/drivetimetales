-- Add manual production standard classification for content approval
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS production_standard TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS production_standard_updated_at TIMESTAMPTZ;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS production_standard_updated_by TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stories_production_standard_check'
      AND conrelid = 'stories'::regclass
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_production_standard_check
      CHECK (production_standard IN (
        'current_standard',
        'remaster_candidate',
        'unknown'
      ));
  END IF;
END $$;
