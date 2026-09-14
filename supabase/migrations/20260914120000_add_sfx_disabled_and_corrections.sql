-- 20260914120000_add_sfx_disabled_and_corrections.sql
--
-- PURPOSE: CORRECTION-PERSIST-001 — two columns supporting the correction
-- persistence system.
--
-- stories.sfx_disabled:
--   When true, generate_voices unconditionally skips generation of any
--   sfx_*.mp3 files regardless of [SFX:] markers in the script. Set
--   automatically when SFX markers are bulk-removed from a story script.
--   Manual override: UPDATE stories SET sfx_disabled = true WHERE id = '<id>';
--
-- stories.state_json:
--   JSONB bag for pipeline state that belongs to the story (not the job).
--   Primary use: state_json.corrections[] — an audit log of every correction
--   applied to the story (voice recast, pronoun fix, SFX removal, outro fix).
--   Each entry: { type, applied_at, segments_affected[], protected: true }.
--   In generate_voices, before rendering any segment, the segment name is
--   checked against corrections[*].segments_affected; if found with
--   protected=true, the segment is skipped and the existing storage audio
--   is reused (CORRECTION-PERSIST-001 re-render scope guard).

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS sfx_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS state_json jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN stories.sfx_disabled IS
  'CORRECTION-PERSIST-001: when true, generate_voices skips all sfx_*.mp3 '
  'generation regardless of [SFX:] markers. Set automatically on bulk SFX removal.';

COMMENT ON COLUMN stories.state_json IS
  'CORRECTION-PERSIST-001: story-scoped pipeline state. '
  'state_json.corrections[] holds the correction audit log: '
  '{ type, applied_at, segments_affected[], protected: true }.';
