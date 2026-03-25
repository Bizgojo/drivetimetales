-- Story Audio Elements Migration
-- Adds separate audio element fields to stories table

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS story_audio_url      TEXT,
  ADD COLUMN IF NOT EXISTS intro_audio_url      TEXT,
  ADD COLUMN IF NOT EXISTS outro_audio_url      TEXT,
  ADD COLUMN IF NOT EXISTS background_music_url TEXT,
  ADD COLUMN IF NOT EXISTS intro_before_url     TEXT,
  ADD COLUMN IF NOT EXISTS intro_after_url      TEXT,
  ADD COLUMN IF NOT EXISTS guest_outro_url      TEXT,
  ADD COLUMN IF NOT EXISTS has_name_slot        BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS name_audio (
  first_name  TEXT        NOT NULL,
  voice_id    TEXT        NOT NULL,
  audio_url   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (first_name, voice_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
  ('sting_url',                 ''),
  ('announcer_voice_id',        'KWDD3Wyq30ZF5NEL01EJ'),
  ('announcer_name',            'Belle B'),
  ('name_personalization_rate', '0.7')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE name_audio ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "name_audio_read" ON name_audio FOR SELECT USING (true);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "app_settings_read" ON app_settings FOR SELECT USING (true);
