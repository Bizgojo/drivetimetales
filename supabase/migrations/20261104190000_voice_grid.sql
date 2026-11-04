-- Voice grid migration — 2026-11-04 (commission voice-grid-20261104)
-- narrator_voices becomes THE voice grid (single source of truth).
-- ADDITIVE + NULLABLE ONLY. Safe to apply later. No backfill here (see
-- supabase/backfill/20261104_voice_grid_backfill.sql). Do NOT merge without Marc's OK.
--
-- Pre-existing state (live 2026-11-04): voice_code TEXT already exists on ~58 rows
-- (pattern NR-{G}-{A}-{T}-{CC}-Vn, e.g. NR-FE-AD-WM-US-V1); 50 rows have NULL.
-- New columns below do NOT exist yet — this migration adds all of them.

-- voice_code (guard: pre-existing on live; keeps file idempotent for fresh DBs)
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS voice_code text;

-- 1. accent_strength
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS accent_strength text;
DO $$ BEGIN
  ALTER TABLE narrator_voices ADD CONSTRAINT narrator_voices_accent_strength_check
    CHECK (accent_strength IS NULL OR accent_strength IN ('mild','moderate','strong'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN narrator_voices.accent_strength IS 'Gemini-listened: mild / moderate / strong. NULL = not yet scored.';

-- 2. best_use
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS best_use text;
COMMENT ON COLUMN narrator_voices.best_use IS 'Gemini-listened: where this voice shines (free text). NULL = not yet scored.';

-- 3. avoid_for
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS avoid_for text;
COMMENT ON COLUMN narrator_voices.avoid_for IS 'Gemini-listened: genres/registers to avoid (free text). NULL = not yet scored.';

-- 4. pace_energy
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS pace_energy text;
COMMENT ON COLUMN narrator_voices.pace_energy IS 'Gemini-listened: pace/energy read (free text). NULL = not yet scored.';

-- 5. source
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS source text;
DO $$ BEGIN
  ALTER TABLE narrator_voices ADD CONSTRAINT narrator_voices_source_check
    CHECK (source IS NULL OR source IN ('custom','library','default'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN narrator_voices.source IS 'custom = in Marc''s ElevenLabs account designs; library = shared-voice adds; default = original 71/72 seed set (reclassify after Marc confirms).';

-- 6. status
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS status text;
DO $$ BEGIN
  ALTER TABLE narrator_voices ADD CONSTRAINT narrator_voices_status_check
    CHECK (status IS NULL OR status IN ('available','reserved','retired'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE narrator_voices ALTER COLUMN status SET DEFAULT 'available';
COMMENT ON COLUMN narrator_voices.status IS 'available / reserved / retired. Default available.';

-- 7. reserved_for
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS reserved_for text;
COMMENT ON COLUMN narrator_voices.reserved_for IS 'Series + character lock, e.g. "Lake House: ALMA". Only set while status = reserved.';

-- 8. gemini_clarity
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS gemini_clarity numeric;
DO $$ BEGIN
  ALTER TABLE narrator_voices ADD CONSTRAINT narrator_voices_gemini_clarity_check
    CHECK (gemini_clarity IS NULL OR (gemini_clarity >= 0 AND gemini_clarity <= 10));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN narrator_voices.gemini_clarity IS 'Gemini-listened clarity score 0-10. NULL = not yet scored.';

-- 9. gemini_accent
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS gemini_accent numeric;
DO $$ BEGIN
  ALTER TABLE narrator_voices ADD CONSTRAINT narrator_voices_gemini_accent_check
    CHECK (gemini_accent IS NULL OR (gemini_accent >= 0 AND gemini_accent <= 10));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN narrator_voices.gemini_accent IS 'Gemini-listened accent-strength score 0-10. NULL = not yet scored.';

-- 10. notice_period_days
ALTER TABLE narrator_voices ADD COLUMN IF NOT EXISTS notice_period_days integer;
COMMENT ON COLUMN narrator_voices.notice_period_days IS 'Lead time in days before a reserved voice may be re-cast. NULL = none agreed.';

-- voice_code uniqueness (live data verified 2026-11-04: 58 codes, no duplicates; NULLs allowed)
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS narrator_voices_voice_code_uidx ON narrator_voices (voice_code);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
