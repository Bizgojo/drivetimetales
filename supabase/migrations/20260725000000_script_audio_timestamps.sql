-- HOOK-GATE-STALE-001: Script-audio consistency timestamp fields
--
-- Adds two timestamp columns to the stories table that enable the gate to
-- detect stale audio (audio generated from an older version of the script):
--
--   script_updated_at     — set by a trigger whenever stories.script changes.
--                           Reflects the last time the script text was edited.
--
--   segments_generated_at — set by generate-voices when voice segment
--                           generation for a story completes successfully.
--
-- Gate logic (hookGate.ts):
--   IF script_updated_at > segments_generated_at → STALE_AUDIO → FAIL
--   IF segments_generated_at IS NULL (no generation yet) → WARN
--   IF script_updated_at IS NULL (schema gap) → WARN
--
-- Requires Marc's explicit merge and manual application to production DB.
-- Do NOT apply autonomously.
--
-- Author:  Atlas (Endless Tales engineering sub-agent)
-- Date:    2026-07-25
-- Ticket:  HOOK-GATE-STALE-001

-- ── Column additions ─────────────────────────────────────────────────────────

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS script_updated_at TIMESTAMPTZ;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS segments_generated_at TIMESTAMPTZ;

-- ── Trigger: auto-update script_updated_at when stories.script changes ────────

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

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Stories with an existing script but no script_updated_at: use updated_at as
-- the best available proxy. This is a conservative lower-bound — it means the
-- gate will only flag truly new edits that happen after the migration runs.

UPDATE stories
SET script_updated_at = updated_at
WHERE script IS NOT NULL
  AND script_updated_at IS NULL;

-- segments_generated_at is intentionally left NULL on backfill.
-- The generate-voices route will populate it on next successful generation.
-- Stories already in ready_for_review/published are not retroactively flagged —
-- this gate applies to new production runs after the migration is applied.
