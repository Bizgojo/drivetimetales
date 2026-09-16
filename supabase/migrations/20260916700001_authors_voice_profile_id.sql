-- Add voice_profile_id to authors table, linking each author to their house style card.
-- The generate-script pipeline will fall back to this when stories.voice_profile_id is null.
ALTER TABLE authors ADD COLUMN IF NOT EXISTS voice_profile_id uuid REFERENCES voice_profiles(id);
CREATE INDEX IF NOT EXISTS idx_authors_voice_profile_id ON authors(voice_profile_id);
COMMENT ON COLUMN authors.voice_profile_id IS 'House style card for this author. generate-script uses this as fallback when stories.voice_profile_id is null.';
