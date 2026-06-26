-- Migration: 20260626140000_narrator_voice_code
-- Adds voice_code column to narrator_voices so the voice_code_registry can
-- track each narrator's ElevenLabs voice_id via the idempotent createOrFetchVoice
-- path, same as story characters.

ALTER TABLE narrator_voices
  ADD COLUMN IF NOT EXISTS voice_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nv_voice_code
  ON narrator_voices (voice_code)
  WHERE voice_code IS NOT NULL;

COMMENT ON COLUMN narrator_voices.voice_code IS
  'Canonical voice_code in AA-BB-CC-DD-EE-FF format (voice_code_schema_version=1). '
  'Maps narrator to voice_code_registry.voice_code for idempotent EL voice resolution.';
