CREATE TABLE IF NOT EXISTS voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_slug text UNIQUE NOT NULL,
  display_name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  essence text NOT NULL,
  diction_and_rhythm text NOT NULL,
  signature_techniques text[] NOT NULL DEFAULT '{}',
  tone_handling text NOT NULL,
  banned_list text[] NOT NULL DEFAULT '{}',
  anchors text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stories ADD COLUMN IF NOT EXISTS voice_profile_id uuid REFERENCES voice_profiles(id);

CREATE INDEX IF NOT EXISTS idx_stories_voice_profile_id ON stories(voice_profile_id);

COMMENT ON TABLE voice_profiles IS 'House style cards — prose register and conformance rules for script generation. Style slugs and display names are style descriptions, never author names.';
