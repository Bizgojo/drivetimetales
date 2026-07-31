-- ============================================================
-- MIGRATION: 20260730100000
-- HOOK-GATE-STALE-001: script + audio timestamp columns
--
-- Author:  Atlas (Endless Tales engineering)
-- Date:    2026-07-30
-- Ticket:  HOOK-GATE-STALE-001
-- Approved: Marc Postlewaite 2026-07-30 13:17 EDT
--
-- Idempotent — ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
-- DROP TRIGGER IF EXISTS, UPDATE with WHERE NOT NULL guard.
--
-- Why it is safe to run now:
--   - script_updated_at and segments_generated_at are both
--     confirmed absent from prod (Marc verified).
--   - 118 stories are stuck at audio_ready because
--     generate-voices HOOK-GATE at complete_story_package
--     step references script_updated_at — column missing →
--     every job fails with a Postgres error.
--   - Backfill uses updated_at as a conservative lower-bound.
--     Frozen stories (PV1/PV2/PV3) never re-run generate-
--     voices so the gate will never fire on them.
-- ============================================================

BEGIN;

-- ── Column additions ─────────────────────────────────────────

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS script_updated_at TIMESTAMPTZ;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS segments_generated_at TIMESTAMPTZ;

-- ── Trigger: auto-stamp script_updated_at on script edits ───

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

-- ── Backfill ─────────────────────────────────────────────────
-- Stories with a script but no script_updated_at: use
-- updated_at as the best available proxy (conservative lower-
-- bound — the gate only flags NEW edits after this migration).

UPDATE stories
SET script_updated_at = updated_at
WHERE script IS NOT NULL
  AND script_updated_at IS NULL;

-- segments_generated_at is intentionally left NULL.
-- generate-voices stamps it on next successful generation run.
-- The gate treats NULL as "never generated" and warns only;
-- it does not hard-fail on NULL (see hookGate.ts gate logic).

COMMIT;
