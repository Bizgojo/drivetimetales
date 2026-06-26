-- Voice Code Registry
-- Maps structured voice_code identifiers (AA-BB-CC-DD-EE-FF format) to
-- provider-specific voice IDs. Acts as a fast, credit-free lookup cache
-- in front of ElevenLabs /v2/voices API calls.
--
-- voice_code format (schema v1): 6 two-character uppercase alphanumeric segments
-- separated by hyphens. Example: NR-MA-45-WM-US-V1
--   [0] ROLE   — NR=Narrator, CH=Character, AN=Announcer, HO=Host
--   [1] GENDER — MA=Male, FE=Female, NB=Non-binary, UN=Unspecified
--   [2] AGE    — 2-digit age band or code (e.g. 35, YA, MA, SA, EL)
--   [3] TONE   — WM=Warm, GV=Grave, HM=Humorous, DR=Dramatic, DP=Deep, NT=Neutral
--   [4] ACCENT — US=US English, UK=British, AU=Australian, EN=Generic English
--   [5] VER    — V1, V2, V3 ... (version slot for re-designs of same role)
--
-- Schema version history:
--   1 (2026-06-26): Initial — AA-BB-CC-DD-EE-FF, 6×2 uppercase alphanumeric

CREATE TABLE IF NOT EXISTS voice_code_registry (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Structured voice identifier (unique per provider)
  voice_code                TEXT NOT NULL,
  voice_code_schema_version INTEGER NOT NULL DEFAULT 1,

  -- Provider binding
  provider                  TEXT NOT NULL DEFAULT 'elevenlabs',
  provider_voice_id         TEXT NOT NULL,

  -- Voice metadata (denormalized for quick reads without joining narrator_voices)
  voice_name                TEXT NOT NULL,
  voice_description         TEXT,
  voice_category            TEXT,          -- e.g. 'generated', 'cloned', 'premade'
  labels                    JSONB,         -- provider-attached labels (includes voice_code)

  -- Lifecycle
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at          TIMESTAMPTZ,   -- last time we confirmed the voice exists in EL

  CONSTRAINT voice_code_registry_voice_code_provider_unique
    UNIQUE (voice_code, provider)
);

-- Primary lookup index
CREATE INDEX IF NOT EXISTS idx_vcr_voice_code_provider
  ON voice_code_registry (voice_code, provider)
  WHERE is_active = true;

-- Reverse lookup: find registry row from a provider voice_id
CREATE INDEX IF NOT EXISTS idx_vcr_provider_voice_id
  ON voice_code_registry (provider, provider_voice_id)
  WHERE is_active = true;

-- Stale verification: find entries not verified recently
CREATE INDEX IF NOT EXISTS idx_vcr_last_verified
  ON voice_code_registry (last_verified_at ASC NULLS FIRST)
  WHERE is_active = true;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_voice_code_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vcr_updated_at ON voice_code_registry;
CREATE TRIGGER trg_vcr_updated_at
  BEFORE UPDATE ON voice_code_registry
  FOR EACH ROW EXECUTE FUNCTION update_voice_code_registry_updated_at();

-- RLS: service role only (admin + pipeline — no public access)
ALTER TABLE voice_code_registry ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; authenticated users have no access by default.
-- Admin routes use SUPABASE_SERVICE_ROLE_KEY and bypass RLS automatically.
-- No explicit policy needed for service role; add user policies here if required later.

COMMENT ON TABLE voice_code_registry IS
  'Maps structured voice_code identifiers (AA-BB-CC-DD-EE-FF) to provider voice IDs. '
  'Acts as a credit-free lookup cache in front of ElevenLabs /v2/voices. '
  'Schema version 1 introduced 2026-06-26.';

COMMENT ON COLUMN voice_code_registry.voice_code IS
  'Structured voice identifier — provisional v1 format: AA-BB-CC-DD-EE-FF '
  '(6 two-char uppercase alphanumeric segments). Unique per provider.';

COMMENT ON COLUMN voice_code_registry.voice_code_schema_version IS
  'Format version of the voice_code string. Allows parsers to handle legacy codes '
  'after future format changes. Current: 1.';

COMMENT ON COLUMN voice_code_registry.last_verified_at IS
  'Timestamp when we last confirmed this voice_id still exists in the provider. '
  'NULL means never verified after creation. Rows unverified for >90 days should be re-checked.';
