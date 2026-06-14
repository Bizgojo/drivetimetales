/**
 * Autonomous Repair Playbooks
 *
 * Maps known failure categories to structured repair actions.
 * The goal: when a failure occurs, the system immediately knows
 * what to do next — autonomously or with Marc — without waiting
 * for manual investigation.
 *
 * Core rule: Every playbook must include:
 * 1. Whether it can execute without Marc (autonomous: true/false)
 * 2. Specific repair steps
 * 3. What code/process change prevents this failure permanently
 * 4. How to verify the repair succeeded
 */

export type RepairStepKind =
  | 'db_update'           // Update a DB row
  | 'clear_script'        // Clear generated script and validation state
  | 'reset_job_step'      // Move job back to a safe step
  | 'reset_lease'         // Clear stale lock
  | 're_queue'            // Reset job to queued
  | 'script_fix'          // Rewrite a script section
  | 'preflight_rerun'     // Re-run preflight validator
  | 'segment_regenerate'  // Regenerate a specific segment
  | 'notify_marc'         // Create a Marc action item
  | 'run_next'            // Advance the job one step
  | 'upload_artifact'     // Upload a replacement artifact
  | 'code_fix'            // Code change required (atlas/atlas)
  | 'check_storage'       // Verify storage bucket state
  | 'verify_deployment'   // Confirm Vercel has latest deploy

export type RepairStep = {
  kind: RepairStepKind
  description: string
  params?: Record<string, unknown>
}

export type RepairPlaybook = {
  id: string
  failureKind: string           // Matches classify.ts FailureKind or error_json.kind
  title: string
  autonomous: boolean           // Can execute without Marc?
  marcRequired: boolean         // Requires Marc's decision?
  priority: 'critical' | 'high' | 'medium' | 'normal' | 'low'
  steps: RepairStep[]
  prevention: string            // What permanent fix prevents this
  verificationCheck: string     // How to know the repair worked
  linkedIncident?: string       // INC-XXX from governance log
}

// ---------------------------------------------------------------------------
// The Playbook Registry
// ---------------------------------------------------------------------------

export const REPAIR_PLAYBOOKS: RepairPlaybook[] = [
  // ── INC-001: Short-line silence buffer false rejection ──────────────────
  {
    id: 'pb-001-silence-buffer',
    failureKind: 'silence_buffer',
    title: 'Short-line audio falsely rejected as silence',
    autonomous: false,
    marcRequired: false,
    priority: 'high',
    steps: [
      {
        kind: 'verify_deployment',
        description: 'Confirm Vercel is running code with ATL-PIPE-006 fix (STALE_SIZE_THRESHOLD=5KB). Do NOT re-queue before verifying.',
      },
      {
        kind: 'segment_regenerate',
        description: 'If Vercel fix is live: reset the failed segment. The ATL-PIPE-006 threshold will pass the short-line audio.',
      },
      {
        kind: 're_queue',
        description: 'Reset job to queued at generate_voices step after confirming fix is live.',
      },
    ],
    prevention: 'ATL-PIPE-001 fix: word-count-aware STALE_SIZE_THRESHOLD (5KB for <10 words, 20KB for ≥10 words). Permanent code fix at generate-voices/route.ts.',
    verificationCheck: 'Short-line segment (< 10 words, 15-20KB) passes inventory check without rejection.',
    linkedIncident: 'INC-001',
  },

  // ── INC-002: Narrator mismatch (character name in NARRATOR header) ──────
  {
    id: 'pb-002-narrator-mismatch',
    failureKind: 'narrator_mismatch',
    title: 'NARRATOR header uses character name instead of voice name',
    autonomous: false,
    marcRequired: false,
    priority: 'high',
    steps: [
      {
        kind: 'db_update',
        description: 'Look up narrator_voice_name from stories table for this story_id. If set and valid (exists in narrator_voices), update the script NARRATOR header to match narrator_voice_name.',
        params: { table: 'stories', field: 'narrator_voice_name', use_as_narrator_header: true },
      },
      {
        kind: 'reset_job_step',
        description: 'Reset job current_step to voice_preflight, status to queued.',
      },
      {
        kind: 're_queue',
        description: 'Re-queue; voice_preflight will now pass.',
      },
    ],
    prevention: 'HAL-SCRIPT-001: Update Hal script generation prompt to require voice names in NARRATOR header, never character names, even when NARRATOR_IS_CHARACTER is true.',
    verificationCheck: 'voice_preflight passes: NARRATOR header matches narrator_voices table row.',
    linkedIncident: 'INC-002',
  },

  // ── Zombie / stale runner / no lock ────────────────────────────────────
  {
    id: 'pb-003-zombie-stale-runner',
    failureKind: 'zombie_stalled',
    title: 'Job status=running with stale/missing lock (zombie)',
    autonomous: true,
    marcRequired: false,
    priority: 'high',
    steps: [
      {
        kind: 'reset_lease',
        description: 'Clear the stale lease from pipeline_runner_state. Set lease_holder=null, lease_expires_at=null.',
        params: { table: 'pipeline_runner_state', clear_fields: ['lease_holder', 'lease_expires_at'] },
      },
      {
        kind: 're_queue',
        description: 'Reset job status to queued with current_step preserved. Runner will re-acquire lease on next invocation.',
      },
    ],
    prevention: 'Runner heartbeat + ZOMBIE_STALE_MS enforcement already in run-next. Ensure LEASE_DURATION_MS (850s) > RUNNER_DEADLINE_MS (740s) at all times.',
    verificationCheck: 'Job transitions from ZOMBIE to ACTIVE within one runner cycle.',
    linkedIncident: 'INC-003',
  },

  // ── Storage list API returning HTML 5xx ─────────────────────────────────
  {
    id: 'pb-004-storage-html-error',
    failureKind: 'storage_html_error',
    title: 'Supabase storage list API returned HTML 5xx (non-JSON)',
    autonomous: true,
    marcRequired: false,
    priority: 'medium',
    steps: [
      {
        kind: 'check_storage',
        description: 'ATL-PIPE-006: generate-voices now retries list up to 3x with exponential backoff. Verify the fix is deployed.',
      },
      {
        kind: 're_queue',
        description: 'Re-queue the job. The retry logic will handle transient storage errors.',
      },
    ],
    prevention: 'ATL-PIPE-006: Retry storage list up to 3x with exponential back-off before failing. Code fix already deployed.',
    verificationCheck: 'Storage list errors produce a retry; only a 3x failure causes job failure.',
    linkedIncident: 'INC-004',
  },

  // ── Transcript QC: segment returns "?" ──────────────────────────────────
  {
    id: 'pb-005-transcript-question-mark',
    failureKind: 'transcript_question_mark',
    title: 'Transcript QC returned "?" as the entire detected text',
    autonomous: false,
    marcRequired: true,
    priority: 'critical',
    steps: [
      {
        kind: 'notify_marc',
        description: 'Transcript returned "?" which is NOT a QC normalization edge case — it means Whisper got confused. Marc must approve whether (a) the segment text is safe to accept as-is, (b) needs a script rewrite, or (c) can be skipped as non-semantic.',
      },
    ],
    prevention: 'Add "?" as a hard-fail transcript result in QC logic. Any segment returning exactly "?" or "??" must trigger FAILED_NEEDS_MARC immediately rather than entering a retry loop.',
    verificationCheck: 'Segment transcript "?" causes immediate Marc notification, not a silent retry cycle.',
    linkedIncident: 'INC-005',
  },

  // ── segment_0066 deterministic stale loop (ATL-PIPE-006) ────────────────
  {
    id: 'pb-006-segment-stale-loop',
    failureKind: 'segment_stale_loop',
    title: 'Segment regenerates in infinite loop due to stale threshold mismatch',
    autonomous: false,
    marcRequired: false,
    priority: 'critical',
    steps: [
      {
        kind: 'verify_deployment',
        description: 'Confirm Vercel is running ATL-PIPE-006 (STALE_SIZE_THRESHOLD=5KB in generate-voices retryMissingOnly). Check deployed commit hash.',
      },
      {
        kind: 're_queue',
        description: 'Once ATL-PIPE-006 is confirmed deployed, re-queue. The inventory will treat the 15KB segment as valid and skip regeneration.',
      },
    ],
    prevention: 'ATL-PIPE-006: Lower retryMissingOnly STALE_SIZE_THRESHOLD from 20KB to 5KB. Already deployed. The 5KB floor matches run-next hard-fail floor.',
    verificationCheck: 'Segment at 15KB is treated as valid in inventory; no infinite regeneration loop.',
    linkedIncident: 'INC-006',
  },

  // ── Belle intro/outro QC failures ──────────────────────────────────────
  {
    id: 'pb-007-belle-quality',
    failureKind: 'belle_quality',
    title: 'Belle intro/outro QC failed — text rule violation or empty segment',
    autonomous: false,
    marcRequired: false,
    priority: 'high',
    steps: [
      {
        kind: 'preflight_rerun',
        description: 'Check the belleAssetValidationReport for the specific violated rule (forbidden word, missing credit, promotional language).',
      },
      {
        kind: 'script_fix',
        description: 'Hal should rewrite the Belle intro/outro per the reported violation. Pipeline will auto-route to repair_belle_quality step.',
      },
      {
        kind: 'run_next',
        description: 'After script fix is applied, advance the job. repair_belle_quality will regenerate the asset.',
      },
    ],
    prevention: 'Preflight introOutroCompliance check + validate_belle_assets step-aware classification. Both are in place.',
    verificationCheck: 'validate_belle_assets passes after repair. belleAssetValidationReport shows 0 issues.',
    linkedIncident: 'INC-007',
  },

  // ── Render null LUFS / stale artifact ──────────────────────────────────
  {
    id: 'pb-008-null-lufs-stale',
    failureKind: 'loudness',
    title: 'Render failed: null LUFS or stale/corrupt segment artifact',
    autonomous: true,
    marcRequired: false,
    priority: 'high',
    steps: [
      {
        kind: 'check_storage',
        description: 'Identify the offending segment (≤5KB = hard fail; 5KB-20KB = warn-continue). For hard-fail segments, re-run generate_voices with retryMissingOnly.',
      },
      {
        kind: 'segment_regenerate',
        description: 'Force regeneration of the specific stale/null-LUFS segment.',
      },
      {
        kind: 're_queue',
        description: 'Re-queue at render_final_mix after artifact is replaced.',
      },
    ],
    prevention: 'ATL-PIPE-006 inventory check in generate_voices retryMissingOnly. Stale segments are re-generated, not skipped.',
    verificationCheck: 'render_final_mix succeeds with non-null LUFS on all segments.',
    linkedIncident: 'INC-008',
  },

  // ── Invalid / invisible Ready for Review state ──────────────────────────
  {
    id: 'pb-009-invalid-rfr',
    failureKind: 'invalid_rfr',
    title: 'Story stuck in ready_for_review with invisible or invalid state',
    autonomous: false,
    marcRequired: true,
    priority: 'high',
    steps: [
      {
        kind: 'db_update',
        description: 'Verify stories row: status=audio_ready, is_hidden=true, published_on=null, review_status=pending, audio_url set, story_audio_url set, cover_url set, prose_text set, author_id set, narrator_voice_id set.',
      },
      {
        kind: 'notify_marc',
        description: 'If any field is missing, notify Marc with the specific missing fields and recommended action (Resume Production / Await Metadata).',
      },
    ],
    prevention: 'Hardened evaluateStoryGate + evaluateApprovalGate in story-gates.ts. The complete_story_package step now verifies all fields before advancing to ready_for_review.',
    verificationCheck: 'Story appears in production console Ready For Review list with all gate fields passing.',
    linkedIncident: 'INC-009',
  },

  // ── Empty / vague error_json ────────────────────────────────────────────
  {
    id: 'pb-010-empty-error-json',
    failureKind: 'empty_error_json',
    title: 'Job failed with empty or vague error_json',
    autonomous: false,
    marcRequired: true,
    priority: 'critical',
    steps: [
      {
        kind: 'check_storage',
        description: 'Inspect production_job_events for the most recent failure event on this job. The runner always writes a RunnerEvent before failing; check there.',
      },
      {
        kind: 'notify_marc',
        description: 'Report the raw failure event to Marc. The job cannot be classified without a structured error. Atlas must patch error_json with kind, message, and marc_required.',
      },
    ],
    prevention: 'Mandatory structured error_json schema: all failure paths in run-next must produce StructuredErrorJson with kind, message, step, and marc_required populated. Add CI lint check.',
    verificationCheck: 'All failure paths produce non-empty error_json.kind and error_json.message.',
    linkedIncident: 'INC-010',
  },

  // ── ATL-PIPE-008: validate_script autonomous retry ─────────────────────
  {
    id: 'script_validate_retry',
    failureKind: 'script_blocked_word',
    title: 'validate_script failed — autonomous retry',
    autonomous: true,
    marcRequired: false,
    priority: 'normal',
    steps: [
      {
        kind: 'clear_script',
        description: 'Clear generated script and validation state from story row.',
      },
      {
        kind: 're_queue',
        description: 'Reset job to generate_script. Runner will regenerate on next cycle.',
      },
    ],
    prevention: 'Script generation prompt should avoid blocked DESCRIPTION words. See blocked-words list in validateCardCopy().',
    verificationCheck: 'Job transitions from validate_script FAIL back to generate_script and produces a passing script.',
    linkedIncident: 'ATL-PIPE-008',
  },
  {
    id: 'script_validate_retry',
    failureKind: 'script_editorial_quality',
    title: 'validate_script failed — autonomous retry',
    autonomous: true,
    marcRequired: false,
    priority: 'normal',
    steps: [
      {
        kind: 'clear_script',
        description: 'Clear generated script and validation state from story row.',
      },
      {
        kind: 're_queue',
        description: 'Reset job to generate_script. Runner will regenerate on next cycle.',
      },
    ],
    prevention: 'Script generation prompt should avoid blocked DESCRIPTION words. See blocked-words list in validateCardCopy().',
    verificationCheck: 'Job transitions from validate_script FAIL back to generate_script and produces a passing script.',
    linkedIncident: 'ATL-PIPE-008',
  },

  // ── ATL-PIPE-008: validate_script failure playbooks ─────────────────────

  {
    id: 'pb-012-script-desc-blocked-word',
    failureKind: 'script_description_blocked_word',
    title: 'DESCRIPTION contains forbidden past-tense / blocked word',
    autonomous: true,
    marcRequired: false,
    priority: 'high',
    steps: [
      {
        kind: 'script_fix',
        description: 'The generated script\'s DESCRIPTION line contains a past-tense or blocked word (vanished, was, were, had, found, discovered, left, moved, sealed, signed, forged, buried, hidden). This is a deterministic rule failure — not editorial judgement.',
      },
      {
        kind: 're_queue',
        description: 'Job is autonomously re-queued to generate_script (retry 1 or 2 of 2). The story.script and validator_result have been cleared. The next generate_script call will regenerate from scratch with the blocked-word rules reinforced in the prompt.',
      },
    ],
    prevention: 'VALIDATOR_PROMPT and generate_script prompt both explicitly list blocked DESCRIPTION words. The model must write DESCRIPTION in present tense with active-voice verbs only.',
    verificationCheck: 'validate_script passes: DESCRIPTION uses only present-tense verbs and is ≤70 chars.',
    linkedIncident: 'ATL-PIPE-008',
  },

  {
    id: 'pb-013-script-card-copy-format',
    failureKind: 'script_card_copy_format',
    title: 'TITLE or DESCRIPTION violates card-copy format constraints',
    autonomous: true,
    marcRequired: false,
    priority: 'medium',
    steps: [
      {
        kind: 'script_fix',
        description: 'TITLE exceeds 5 words or 28 chars, or DESCRIPTION exceeds 70 chars. These are deterministic format constraints.',
      },
      {
        kind: 're_queue',
        description: 'Job is autonomously re-queued to generate_script. The story.script and validator_result have been cleared.',
      },
    ],
    prevention: 'generate_script prompt must include TITLE/DESCRIPTION character and word limits explicitly.',
    verificationCheck: 'validateCardCopy() returns no issues: TITLE ≤5 words / 28 chars, DESCRIPTION ≤70 chars.',
    linkedIncident: 'ATL-PIPE-008',
  },

  {
    id: 'pb-014-script-quality-editorial',
    failureKind: 'script_quality_editorial',
    title: 'AI validator: protagonist/description mismatch or editorial quality failure',
    autonomous: true,
    marcRequired: false,
    priority: 'high',
    steps: [
      {
        kind: 'script_fix',
        description: 'AI validator failed due to DESCRIPTION not matching the protagonist role, or editorial issues (weak hook, unclear stakes, etc.). This is retryable because the model can generate a better script with the specific issue surfaced in the prompt.',
      },
      {
        kind: 're_queue',
        description: 'Job is autonomously re-queued to generate_script. story.script cleared. The validator report is preserved as diagnostic evidence for the next generation attempt.',
      },
    ],
    prevention: 'VALIDATOR_PROMPT now includes DESCRIPTION PROTAGONIST RULE: DESCRIPTION must accurately reflect who the protagonist is. generate_script prompt reinforces this.',
    verificationCheck: 'AI validator passes: DESCRIPTION matches protagonist role; hook and editorial quality pass.',
    linkedIncident: 'ATL-PIPE-008',
  },

  {
    id: 'pb-015-script-story-resolution',
    failureKind: 'script_story_resolution',
    title: 'AI validator: climax offscreen or protagonist passive at resolution',
    autonomous: true,
    marcRequired: false,
    priority: 'critical',
    steps: [
      {
        kind: 'script_fix',
        description: 'AI validator caught Difficult Solution Rule violation: protagonist is passive at the climax, or the climax happens offscreen. This is retryable because DSR is reinforced in STORY_RESOLUTION_VALIDATOR_PROMPT and generate_script prompt.',
      },
      {
        kind: 're_queue',
        description: 'Job is autonomously re-queued to generate_script. The validator report is preserved. The next script generation will be prompted to place the protagonist at an active, consequential moment at the climax.',
      },
    ],
    prevention: 'generate_script prompt must include Difficult Solution Rule explicitly: protagonist must take an active, costly action at the climax — not discover the villain already defeated or watch from the side.',
    verificationCheck: 'AI validator passes: protagonist makes an active choice at the climax with real stakes. Ending is emotionally earned.',
    linkedIncident: 'ATL-PIPE-008',
  },

  // ── Mission context not loaded ──────────────────────────────────────────
  {
    id: 'pb-011-mission-context',
    failureKind: 'mission_context_missing',
    title: 'Agent (Hal/Orion/Atlas) did not load shared mission context at session start',
    autonomous: false,
    marcRequired: false,
    priority: 'medium',
    steps: [
      {
        kind: 'script_fix',
        description: 'Read lib/missionContext.ts and Bible/SHARED_MISSION_CONTEXT.md. Load the active mission before any story work.',
      },
      {
        kind: 'notify_marc',
        description: 'If mission context is ambiguous, ask Marc to confirm the active smoke-test mission before proceeding.',
      },
    ],
    prevention: 'Bible/SHARED_MISSION_CONTEXT.md must be read at session start. AGENTS.md instructs this. Add verification to HAL_LEARNING_LOOP.md.',
    verificationCheck: 'Agent correctly names the active smoke-test mission and the three stories in scope before starting any work.',
    linkedIncident: 'INC-011',
  },
]

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getPlaybookByKind(failureKind: string): RepairPlaybook | null {
  return REPAIR_PLAYBOOKS.find(p => p.failureKind === failureKind) ?? null
}

export function getAutonomousPlaybooks(): RepairPlaybook[] {
  return REPAIR_PLAYBOOKS.filter(p => p.autonomous)
}

export function getMarcRequiredPlaybooks(): RepairPlaybook[] {
  return REPAIR_PLAYBOOKS.filter(p => p.marcRequired)
}

/**
 * Returns the playbook that applies to a given truth state + error kind.
 * Used by Command Center to show "what to do next".
 */
export function recommendRepair(
  trueState: string,
  errorKind: string | null,
): RepairPlaybook | null {
  if (errorKind) {
    const byKind = getPlaybookByKind(errorKind)
    if (byKind) return byKind
  }

  // Fallback by truth state
  if (trueState === 'ZOMBIE') return getPlaybookByKind('zombie_stalled')
  if (trueState === 'FAILED_EMPTY_ERROR') return getPlaybookByKind('empty_error_json')

  return null
}
