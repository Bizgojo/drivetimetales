-- Story Excellence Ledger
-- Records creative lessons from Marc's story rejections and review feedback.
-- Every rejection must produce a durable lesson so future stories improve.
-- Distinct from production_learning_events (pipeline/technical failures).

CREATE TABLE IF NOT EXISTS story_excellence_lessons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id          UUID REFERENCES stories(id) ON DELETE SET NULL,
  series_id         UUID,
  series_title      TEXT,
  episode_title     TEXT,
  rejected_by       TEXT NOT NULL DEFAULT 'marc',
  lesson_category   TEXT NOT NULL,  -- belle_quality | story_resolution | hook | cliffhanger | ending_satisfaction | pacing | cover_art | narrator_character | dialogue_quality | script_structure | genre_fidelity | personalization | other
  lesson_text       TEXT NOT NULL,  -- What was wrong — must be specific
  prevention_rule   TEXT,           -- Matches format: contains:<text> or word:<word>
  applies_to_future BOOLEAN NOT NULL DEFAULT true,
  confidence        NUMERIC NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_story_id
  ON story_excellence_lessons(story_id);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_series_id
  ON story_excellence_lessons(series_id);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_category
  ON story_excellence_lessons(lesson_category);

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_applies_to_future
  ON story_excellence_lessons(applies_to_future)
  WHERE applies_to_future = true;

CREATE INDEX IF NOT EXISTS idx_story_excellence_lessons_created_at
  ON story_excellence_lessons(created_at DESC);

COMMENT ON TABLE story_excellence_lessons IS
  'Creative lessons from story rejections. Read by Hal before script generation. Updated by Orion/Atlas on Marc rejection.';

COMMENT ON COLUMN story_excellence_lessons.prevention_rule IS
  'Preflight-compatible rule: "contains:<text>" or "word:<word>". If matched in a future script, Hal is warned before voice generation.';
-- Active Missions table
-- Tracks the current smoke-test or production batch mission.
-- Shared context for Hal, Orion, and Atlas so all agents know what they're doing.
-- Fixes INC-011: Hal did not know the active smoke-test mission.

CREATE TABLE IF NOT EXISTS active_missions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_name      TEXT NOT NULL,
  mission_type      TEXT NOT NULL DEFAULT 'smoke_test',  -- smoke_test | batch_production | repair
  status            TEXT NOT NULL DEFAULT 'active',       -- active | paused | complete | draft
  stories           JSONB NOT NULL DEFAULT '[]',          -- MissionStory[] — story_id, series_title, episode_title, etc.
  objective         TEXT NOT NULL DEFAULT '',
  success_criteria  JSONB NOT NULL DEFAULT '[]',          -- string[]
  created_by        TEXT NOT NULL DEFAULT 'orion',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_missions_status
  ON active_missions(status);

CREATE INDEX IF NOT EXISTS idx_active_missions_created_at
  ON active_missions(created_at DESC);

COMMENT ON TABLE active_missions IS
  'Shared mission context for Hal, Orion, and Atlas. All agents must load the active mission before beginning production work.';

COMMENT ON COLUMN active_missions.stories IS
  'Array of MissionStory objects: {storyId, seriesTitle, episodeTitle, episodeNumber, jobId?, trueState?, safeResumePoint?, marcRequired?}';

-- Seed the three-story autonomy smoke test mission
INSERT INTO active_missions (
  mission_name,
  mission_type,
  status,
  stories,
  objective,
  success_criteria,
  created_by,
  notes
) VALUES (
  'Three-Story Autonomy Smoke Test v1',
  'smoke_test',
  'active',
  '[]'::jsonb,
  'Get three stories through the full production pipeline to ready_for_review without Marc intervention. Each failure must produce a learning event or excellence lesson.',
  '["All three stories reach ready_for_review state", "Zero Marc interventions required", "Every failure produces a structured learning event", "No failure recurs more than once", "Command Center shows true job state for all three stories"]'::jsonb,
  'orion',
  'Seeded by Atlas learning system migration 2026-06-13. Stories to be associated by Orion on session start.'
) ON CONFLICT DO NOTHING;
-- Backfill production learning events for all known failures
-- These are the incidents from the June 2026 incident log.
-- Each record represents a reusable prevention rule derived from a real failure.

-- INC-001: SILENCE_BUFFER short-line false rejection
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'generate_voices',
  'silence_buffer',
  'Flat 20KB SILENCE_BUFFER_SIZE_THRESHOLD rejected valid short-line audio (3-word lines produce ~15-18KB audio from ElevenLabs). Threshold was not word-count aware.',
  'ATL-PIPE-001/ATL-PIPE-006: word-count-aware threshold — segments <10 words use 5KB floor, ≥10 words use 20KB. Permanently fixes false rejection of short-line audio.',
  'code_fix',
  NULL,
  true,
  0.99
) ON CONFLICT DO NOTHING;

-- INC-002: Narrator mismatch — character name in NARRATOR header
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'voice_preflight',
  'narrator_mismatch',
  'Script generated with NARRATOR: Detective Collier (character name) instead of NARRATOR: Ray Dolan (voice name). NARRATOR_IS_CHARACTER: true does not mean use the character name — it means the narrator voices a character.',
  'HAL-SCRIPT-001: Script prompt updated to require voice names in NARRATOR header even when NARRATOR_IS_CHARACTER is true. DB narrator_voice_name is always the fallback truth.',
  'preflight_rule',
  NULL,
  true,
  0.95
) ON CONFLICT DO NOTHING;

-- INC-003: Stale runner / no lock / zombie stall
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'runner',
  'zombie_stalled',
  'Production runner left job in status=running after lease expired or was dropped. No zombie detection surfaced the stall in Command Center.',
  'Pipeline Truth Layer now classifies ZOMBIE state from lock age. Command Center shows true job state.',
  'monitoring',
  NULL,
  true,
  0.9
) ON CONFLICT DO NOTHING;

-- INC-004: Storage list API returning HTML 5xx
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'generate_voices',
  'storage_html_error',
  'Supabase CDN storage list() returned HTML error page (5xx) instead of JSON on long-running Vercel functions. Single attempt failed the job.',
  'ATL-PIPE-006: Retry list() up to 3x with exponential backoff (1.5s, 3s) before failing. HTML errors trigger transient classification.',
  'code_fix',
  NULL,
  true,
  0.9
) ON CONFLICT DO NOTHING;

-- INC-005: Transcript QC returning "?"
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'generate_voices',
  'transcript_question_mark',
  'Whisper returned exactly "?" as the transcript for a segment. This is not a normalization edge case — it means Whisper was confused by the audio. The QC system did not distinguish this from a legitimate transcript mismatch.',
  'classify.ts: transcript "?" is now treated as FAILED_NEEDS_MARC immediately. No retry loop.',
  'preflight_rule',
  NULL,
  true,
  0.95
) ON CONFLICT DO NOTHING;

-- INC-006: segment_0066 deterministic stale loop
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'generate_voices',
  'segment_stale_loop',
  'segment_0066 ("I''m not scared. I''m done being patient." — 7 words, ~15KB) was flagged as stale on every inventory check because retryMissingOnly used 20KB STALE_SIZE_THRESHOLD. This caused an infinite regeneration loop since ElevenLabs consistently returns ~15KB for that line.',
  'ATL-PIPE-006: retryMissingOnly STALE_SIZE_THRESHOLD lowered from 20KB to 5KB. 15KB segments are now treated as valid. Segment_0066 loop eliminated.',
  'code_fix',
  NULL,
  true,
  0.99
) ON CONFLICT DO NOTHING;

-- INC-007: Belle intro/outro QC failures
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'validate_belle_assets',
  'belle_quality',
  'Belle intro text started with [LISTENER_NAME] causing an empty beforeText split, which generated ~10KB silence that validate_belle_assets correctly rejected.',
  'Commit f02b4a87: [LISTENER_NAME] at start/end → generate single standalone intro, not intro_before/intro_after pair. Preflight introOutroCompliance check added.',
  'code_fix',
  NULL,
  true,
  0.95
) ON CONFLICT DO NOTHING;

-- INC-008: Render null LUFS / stale artifact
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'render_final_mix',
  'null_lufs_stale',
  'Render failed because some segments had null LUFS (not analyzed) due to stale/corrupt files from the old pipeline. Stale artifacts were not detected before render.',
  'Artifact Validity Gate now classifies segments: ≤5KB = hard-fail, 5KB–20KB = warn-continue. Stale segments are regenerated in generate_voices before render proceeds.',
  'code_fix',
  NULL,
  true,
  0.9
) ON CONFLICT DO NOTHING;

-- INC-009: Invalid / invisible Ready for Review state
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'ready_for_review',
  'invalid_rfr',
  'Story reached ready_for_review step but did not appear in production console because required fields were missing (audio_url, story_audio_url, cover_url, narrator_voice_id). The gate was not evidence-based.',
  'evaluateApprovalGate in story-gates.ts now checks all 13 required fields. complete_story_package step verifies fields before advancing to ready_for_review.',
  'preflight_rule',
  NULL,
  true,
  0.9
) ON CONFLICT DO NOTHING;

-- INC-010: Empty / vague error_json
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'runner',
  'empty_error_json',
  'Job failed but error_json was {} or contained only an unclassified message. Pipeline Truth Layer could not classify the failure. Marc had to manually inspect logs.',
  'StructuredErrorJson type added to pipeline-runner/types.ts. All failure paths in run-next must populate kind, message, step, and marc_required. Pipeline Truth Layer checks for vague errors.',
  'preflight_rule',
  NULL,
  true,
  0.95
) ON CONFLICT DO NOTHING;

-- INC-011: Mission context not loaded
INSERT INTO production_learning_events (
  stage,
  failure_type,
  root_cause,
  fix_applied,
  fix_type,
  prevention_rule,
  reusable,
  confidence
) VALUES (
  'agent_session_start',
  'mission_context_missing',
  'Hal began story work without loading the active smoke-test mission from the shared mission context. This caused Hal to work on unrelated tasks or use wrong assumptions about story scope.',
  'lib/missionContext.ts created. Bible/SHARED_MISSION_CONTEXT.md created. HAL_LEARNING_LOOP.md step 0 = load mission context. active_missions DB table created.',
  'preflight_rule',
  NULL,
  true,
  0.9
) ON CONFLICT DO NOTHING;
