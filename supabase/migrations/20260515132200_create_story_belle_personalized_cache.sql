CREATE TABLE IF NOT EXISTS story_belle_personalized_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  variant_context TEXT NOT NULL,
  source_variant_id UUID NULL REFERENCES story_belle_variants(id) ON DELETE SET NULL,
  belle_voice_id TEXT NOT NULL,
  preferred_name TEXT,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_belle_personalized_cache_kind_check
    CHECK (kind IN ('intro', 'outro'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_belle_personalized_cache_unique
  ON story_belle_personalized_cache(user_id, story_id, kind, variant_context, belle_voice_id, text_hash);

CREATE INDEX IF NOT EXISTS idx_story_belle_personalized_cache_user_story
  ON story_belle_personalized_cache(user_id, story_id);

CREATE INDEX IF NOT EXISTS idx_story_belle_personalized_cache_story_kind
  ON story_belle_personalized_cache(story_id, kind);

CREATE OR REPLACE FUNCTION set_story_belle_personalized_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_story_belle_personalized_cache_updated_at ON story_belle_personalized_cache;

CREATE TRIGGER trg_story_belle_personalized_cache_updated_at
BEFORE UPDATE ON story_belle_personalized_cache
FOR EACH ROW
EXECUTE FUNCTION set_story_belle_personalized_cache_updated_at();
