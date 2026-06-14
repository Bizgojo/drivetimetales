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
