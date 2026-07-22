-- Migration: go_variant_config + preview columns
-- GO-PREVIEW-001 / 2026-07-22
--
-- The go_variant_config table from PR #5 was NOT applied to production before
-- this migration was written. This migration creates the table and adds the
-- preview columns together, so they can be applied in one step.
--
-- IMPORTANT: Apply PR #5 schema review notes alongside this migration.
-- If go_variant_config already exists (PR #5 was applied), the
-- CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS guards are safe.

-- ============================================================================
-- 1. Create go_variant_config (from PR #5 — included here because the table
--    does not exist in production as of 2026-07-22).
-- ============================================================================

CREATE TABLE IF NOT EXISTS go_variant_config (
  id             TEXT PRIMARY KEY,          -- variant key, e.g. 'b', 'bare'
  story_id       TEXT NOT NULL,             -- landing story id
  audio_url      TEXT NOT NULL,
  cover_url      TEXT NOT NULL,
  title          TEXT NOT NULL,
  hook           TEXT NOT NULL,
  genre          TEXT NOT NULL,
  cta_reveal_sec INTEGER NOT NULL DEFAULT 45,
  is_live        BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. Preview columns (GO-PREVIEW-001)
-- ============================================================================

-- URL to the 15-second muted-autoplay preview clip (MP3 in Supabase Storage).
-- Null = no preview configured; /go renders the normal page for this variant.
ALTER TABLE go_variant_config
  ADD COLUMN IF NOT EXISTS preview_clip_url TEXT;

-- URL to the WebVTT captions file for the preview clip (Supabase Storage).
-- Used by the custom overlay renderer in app/go/page.tsx (not a <track>
-- element — Meta in-app browser compatibility).
ALTER TABLE go_variant_config
  ADD COLUMN IF NOT EXISTS preview_captions_url TEXT;

-- Position (seconds) in the FULL episode audio where the preview was extracted
-- from. Used to offer "continue from preview" vs "start from beginning".
-- OPEN DECISION (logged to Marc, 2026-07-22): after preview completes, does
-- the full episode begin at 0:00 or at preview_start_sec (2:02)?
-- Currently defaulting to 0:00 in app/go/page.tsx until Marc decides.
ALTER TABLE go_variant_config
  ADD COLUMN IF NOT EXISTS preview_start_sec INTEGER;

-- ============================================================================
-- 3. Seed preview config for variant 'b' (Murder at Falls Park)
-- ============================================================================

-- Upsert so re-running is idempotent.
INSERT INTO go_variant_config (
  id,
  story_id,
  audio_url,
  cover_url,
  title,
  hook,
  genre,
  cta_reveal_sec,
  is_live,
  preview_clip_url,
  preview_captions_url,
  preview_start_sec
) VALUES (
  'b',
  'go-variant-b',
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/go-variant-b/final_mix.mp3',
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/Covers/landing/go-variant-b/cover_20260712_liberty.jpg',
  'Murder at Falls Park',
  'A shopkeeper lies dead below Liberty Bridge — and all of Greenville has a theory.',
  'Mystery',
  100,
  true,
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/preview/falls-park-he-didnt-fall/clip.mp3',
  'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/preview/falls-park-he-didnt-fall/captions.vtt',
  122  -- 2:02 in the full episode
) ON CONFLICT (id) DO UPDATE SET
  preview_clip_url     = EXCLUDED.preview_clip_url,
  preview_captions_url = EXCLUDED.preview_captions_url,
  preview_start_sec    = EXCLUDED.preview_start_sec,
  updated_at           = NOW();
