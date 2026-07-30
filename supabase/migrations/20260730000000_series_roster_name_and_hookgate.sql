-- ============================================================
-- MIGRATION: 20260730000000
-- Two changes queued together — do NOT split and apply
-- partially. Either both land or neither does.
--
-- Author:  Atlas (Endless Tales engineering)
-- Date:    2026-07-30
-- Tickets: HOOK-GATE-STALE-001 + BELL-CAST-001
-- Requires Marc's explicit merge word before applying.
-- ============================================================


-- ── PART A: HOOK-GATE-STALE-001 ─────────────────────────────
-- Adds script_updated_at + segments_generated_at to stories.
-- Enables the HOOK-GATE-001 stale-audio check that is already
-- wired in generate-voices (PR #28, merged 2026-07-24) but
-- has blocked every production_job since merge because the
-- columns don't exist in prod.
--
-- Context: HOOK-GATE fires at complete_story_package step.
-- Until this migration runs, every story fails there with:
--   "column stories.script_updated_at does not exist"
-- The gate is correct; the schema is just behind the code.

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS script_updated_at TIMESTAMPTZ;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS segments_generated_at TIMESTAMPTZ;

-- Trigger: auto-stamp script_updated_at on script edits
CREATE OR REPLACE FUNCTION update_story_script_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.script IS DISTINCT FROM NEW.script THEN
    NEW.script_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stories_script_updated_at ON stories;

CREATE TRIGGER trg_stories_script_updated_at
BEFORE UPDATE ON stories
FOR EACH ROW
EXECUTE FUNCTION update_story_script_updated_at();

-- Backfill: use updated_at as a conservative lower-bound.
-- Frozen/published stories will not be re-flagged because
-- segments_generated_at stays NULL until the next voice
-- generation run — and frozen stories never re-generate.
UPDATE stories
SET script_updated_at = updated_at
WHERE script IS NOT NULL
  AND script_updated_at IS NULL;

-- segments_generated_at is intentionally left NULL on backfill.
-- generate-voices stamps it on next successful generation.


-- ── PART B: BELL-CAST-001 — series_character_roster ────────
-- Adds series_name to series_character_roster so casting
-- entries can be looked up by series display name when no
-- formal series record exists (series_id IS NULL).
--
-- Use case: Bell Beneath Falls Park promos have series_id NULL
-- (no series table entry yet). The casting sheet is currently
-- in a JSON file. This column lets us move it into the DB
-- and have generate-voices resolve characters by series name.
--
-- Lookup priority (generate-voices series_character_roster):
--   1. series_id match (exact FK)
--   2. series_name match (new, for pre-series content)

ALTER TABLE series_character_roster
  ADD COLUMN IF NOT EXISTS series_name TEXT;

-- Index: fast lookup by series_name where series_id is null
CREATE INDEX IF NOT EXISTS idx_scr_series_name
  ON series_character_roster (series_name)
  WHERE series_id IS NULL;

-- Unique constraint: prevent duplicate characters per series
-- (either by series_id OR by series_name when id is null)
-- Two partial uniques — Postgres can't unique-index across
-- a nullable + non-nullable pair in one constraint cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS uix_scr_series_id_name
  ON series_character_roster (series_id, canonical_name_normalized)
  WHERE series_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uix_scr_series_name_char
  ON series_character_roster (series_name, canonical_name_normalized)
  WHERE series_id IS NULL AND series_name IS NOT NULL;

-- Seed: Bell Beneath Falls Park permanent cast (from casting-sheet.json)
-- These rows should only be inserted if they don't already exist.
-- Using ON CONFLICT DO NOTHING against the unique index.
INSERT INTO series_character_roster
  (series_name, canonical_name, canonical_name_normalized, aliases,
   voice_id, voice_name, is_locked, description)
VALUES
  (
    'The Bell Beneath Falls Park',
    'JUNE', 'JUNE',
    ARRAY['JUNE (THROUGH PHONE)', 'JUNE BELL', 'JUNE ON PHONE'],
    'aIu5oHglU5AHNc2x0AZu', 'Jane Hackett',
    true,
    'June Bell — retired local investigator, helped Claire Vance research the Palmetto Hotel 12 years ago. Appears on phone under duress. ATL-HEADPHONE-001 applies.'
  ),
  (
    'The Bell Beneath Falls Park',
    'UNKNOWN MAN', 'UNKNOWN MAN',
    ARRAY['UNKNOWN MAN (THROUGH PHONE)', 'UNKNOWN CALLER'],
    'lKf2tqVafNW1nVb7CgwC', 'Frank',
    true,
    'Unknown Man on phone — controlled, cold. Identity unconfirmed. Series constraint (Marc 2026-07-30): if caller revealed as Silas Crowe, Crowe inherits this voice. Not canon until Marc declares it. ATL-HEADPHONE-001 applies.'
  ),
  (
    'The Bell Beneath Falls Park',
    'MARA', 'MARA',
    ARRAY['MARA VANCE'],
    'ovUpRQCoNYADjai0c9kP', 'Mara Vance',
    true,
    'Mara Vance — protagonist and narrator. First-person mystery. Established PV1 (2026-07-28).'
  ),
  (
    'The Bell Beneath Falls Park',
    'ELI', 'ELI',
    ARRAY['ELI MERCER'],
    'mErDxl2A0Sa7BbP8XhMx', 'Eli Mercer',
    true,
    'Eli Mercer — local historian. Scholarly, measured. Established PV1 (2026-07-28).'
  ),
  (
    'The Bell Beneath Falls Park',
    'LENA', 'LENA',
    ARRAY['DETECTIVE LENA', 'DETECTIVE LENA ORTIZ'],
    '9oUQOEEPHVmXK5XBUirv', 'Detective Lena Ortiz',
    true,
    'Detective Lena Ortiz — Greenville PD. Authoritative, clipped. Established PV1 (2026-07-28).'
  ),
  (
    'The Bell Beneath Falls Park',
    'CLAIRE ON CASSETTE', 'CLAIRE ON CASSETTE',
    ARRAY['CLAIRE VANCE', 'CLAIRE'],
    's4qOXUa0rOmoEFvukAR9', 'Claire Vance',
    true,
    'Claire Vance — Mara''s mother, heard only on cassette recording. Warm, intimate. Established PV2 (2026-07-29).'
  )
ON CONFLICT DO NOTHING;
