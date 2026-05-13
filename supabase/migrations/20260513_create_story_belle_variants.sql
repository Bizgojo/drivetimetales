CREATE TABLE IF NOT EXISTS story_belle_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('intro', 'outro')),
  variant_key TEXT NOT NULL,
  text TEXT NOT NULL,
  uses_name BOOLEAN NOT NULL DEFAULT FALSE,
  tone TEXT,
  series_position TEXT,
  opening_style TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_belle_variants_story_kind
  ON story_belle_variants(story_id, kind);

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_belle_variants_unique_variant
  ON story_belle_variants(story_id, kind, variant_key);
