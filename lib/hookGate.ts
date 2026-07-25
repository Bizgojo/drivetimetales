/**
 * HOOK-GATE-001 — Pre-flight production spec gate
 *
 * Runs immediately BEFORE a story advances from complete_story_package to
 * ready_for_review. Seven deterministic checks verify that the story meets the
 * Endless Tales production spec before it reaches the human review queue.
 *
 * Also exposes a runHookGate() function for the standalone API endpoint
 * (app/api/admin/hook-gate/route.ts) so operators can trigger the check
 * manually without triggering a pipeline step.
 *
 * HOOK-GATE-STALE-001 (2026-07-25):
 * Check 7 (audioConsistency) compares stories.script_updated_at against
 * stories.segments_generated_at. If the script was edited AFTER the voice
 * segments were generated, the gate fails with STALE_AUDIO.  Requires
 * migration 20260725000000_script_audio_timestamps to hard-fail; gracefully
 * warns when timestamps are absent (schema gap, legacy stories).
 *
 * Return shape:
 *   {
 *     pass: boolean,
 *     warnings: string[],
 *     failures: string[],
 *     checks: {
 *       hook:             HookCheckResult,
 *       sfx:              SfxCheckResult,
 *       genre:            GenreCheckResult,
 *       belle:            BelleCheckResult,
 *       audio:            ArtifactCheckResult,
 *       cover:            ArtifactCheckResult,
 *       audioConsistency: AudioConsistencyCheckResult,   // HOOK-GATE-STALE-001
 *     }
 *   }
 */

import { createClient } from '@supabase/supabase-js'
import { verifyArtifactHttp } from './artifactGate'

// ---------------------------------------------------------------------------
// Supabase client (server-side only)
// ---------------------------------------------------------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Words-per-second assumed for spoken audio drama (3 wps is industry standard). */
const WORDS_PER_SECOND = 3

/** Hook must land before this word count — matches HOOK-FIRST-001 canon: 15 spoken words.
 * Marc ruling 2026-07-24: start at canon, loosen only if data forces it.
 * Previous value was 90 (30 seconds), which let Night Train slip through at word 86. */
const HOOK_PASS_WORD_LIMIT = 15

/** Words before which a hook landing is a warn (16–30 words ≈ 5–10 seconds). */
const HOOK_WARN_WORD_LIMIT = 30

/** For SFX check: scripts pre-dating the [SFX:...] template are legacy. */
// A script is "new" (non-legacy) if it contains at least one [SFX:...] marker
// OR if it was generated after the template change (we detect by presence of tags).

/** Target SFX count range for new scripts. */
const SFX_MIN = 3
const SFX_MAX = 6

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface HookCheckResult {
  status: 'pass' | 'warn' | 'fail'
  wordsBeforeHook: number | null
  hookFound: boolean
  detail: string
}

export interface SfxCheckResult {
  status: 'pass' | 'fail' | 'na'
  sfxCount: number
  hasLegacyScript: boolean
  detail: string
}

export interface GenreCheckResult {
  status: 'pass' | 'warn'
  genre: string
  soundProfile: string | null
  detail: string
}

export interface BelleCheckResult {
  status: 'pass' | 'fail'
  hasAnnouncement: boolean
  hasOutro: boolean
  detail: string
}

export interface ArtifactCheckResult {
  status: 'pass' | 'fail' | 'warn'
  url: string | null
  httpStatus: number | null
  reachable: boolean
  detail: string
}

/**
 * HOOK-GATE-STALE-001: Audio consistency check result.
 *
 * Compares script_updated_at against segments_generated_at to detect cases
 * where voice segments were generated from an older version of the script.
 *
 * status:
 *   'pass'      — segments_generated_at >= script_updated_at (audio is current)
 *   'fail'      — script_updated_at > segments_generated_at (STALE AUDIO detected)
 *   'warn'      — timestamps missing; cannot verify consistency (schema gap or
 *                 segments never generated)
 *   'na'        — story has no script yet; check not applicable
 */
export interface AudioConsistencyCheckResult {
  status: 'pass' | 'fail' | 'warn' | 'na'
  scriptUpdatedAt: string | null
  segmentsGeneratedAt: string | null
  staleByMs: number | null     // positive = segments are older than script by this many ms
  detail: string
}

export interface HookGateResult {
  pass: boolean
  warnings: string[]
  failures: string[]
  checks: {
    hook: HookCheckResult
    sfx: SfxCheckResult
    genre: GenreCheckResult
    belle: BelleCheckResult
    audio: ArtifactCheckResult
    cover: ArtifactCheckResult
    audioConsistency: AudioConsistencyCheckResult
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Count words in a string. Splits on whitespace, ignores empty tokens.
 */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Extract NARRATOR lines from the [START AUDIO DRAMA SCRIPT] section only.
 * Returns the raw text lines joined with spaces.
 *
 * The section begins after the first line matching /^\[START AUDIO DRAMA/i
 * and ends at BELLE B OUTRO (or end of script).
 */
function extractAudioDramaSection(script: string): string {
  // Find [START AUDIO DRAMA SCRIPT] or [START AUDIO DRAMA] boundary
  const startMatch = script.match(/^\[START AUDIO DRAMA(?:\s+SCRIPT)?\]/im)
  if (!startMatch || startMatch.index === undefined) return ''

  // End of drama section: BELLE B OUTRO or end of file
  const dramaSection = script.slice(startMatch.index)
  const outroMatch = dramaSection.match(/^BELLE B OUTRO\s*$/im)
  const endIndex = outroMatch?.index ?? dramaSection.length
  return dramaSection.slice(0, endIndex)
}

/**
 * Detect the hook position in the drama section.
 *
 * "Hook" is a tension or conflict signal. We use the same broad category
 * detection used in ATL-PIPE-020 (narrative hook detection immunity):
 * look for strong narrative hook signals (questions, exclamations, alarm/danger
 * words, emotional beats) in NARRATOR lines.
 *
 * Returns the word offset from the start of the drama section where the
 * first hook-like NARRATOR line starts, or null if none found.
 */
function detectHookWordOffset(dramaSectionText: string): number | null {
  const lines = dramaSectionText.split('\n')
  let wordOffset = 0

  // Patterns that signal a narrative hook
  // HOOK-GATE-FIX-001 (2026-07-24): Tightened from original over-broad patterns.
  //
  // Removed patterns that triggered false positives on normal prose:
  //   - Negation pattern (/\b(no|not|stop|wait|don't|won't)\b/) — fired on "no exceptions",
  //     "didn't", "not yet", etc. in virtually every narrator line.
  //   - "found", "truth", "hiding", "hid", "lie", "lying" from reveal pattern — too common
  //     in non-hook contexts ("never once revealed anything worse than...").
  //   - "never", "only", "last", "final" from urgency pattern — fired on atmospheric prose.
  //
  // Kept: unambiguous alarm signals — physical violence/death words, explicit
  //   narrative tension words (conspiracy, betrayal, discovered, uncovered),
  //   and strong urgency terms (impossible, desperate, urgent, too late, cannot).
  //
  // False positive test cases that now correctly return null (no hook):
  //   "Claire Ashby had a system for hotel rooms. Four minutes, every time, no exceptions."
  //   "The rain hit the windows at a hard diagonal, streaking the glass in lines that
  //    looked like claw marks."
  //   "She had never once revealed anything worse than a retainer case."
  const HOOK_PATTERNS = [
    /\?/,                           // Question — always a tension signal in narration
    /!/,                            // Exclamation — alarm or urgency
    // Physical danger, death, or violence words — unambiguous hooks
    /\b(dead|died|murder|kill|killed|death|blood|scream|stabbed|bleeding|missing|vanished|disappeared|trapped|crash|explosion|shot|shots|threat|terrified|panic|gasp)\b/i,
    // Explicit narrative revelation — must be strong/specific; "revealed" and "revelation"
    // removed (fire on "never once revealed anything worse than..." and similar non-hook prose)
    /\b(betrayed|betrayal|conspiracy|discovered|uncovered)\b/i,
    // Urgency — only unambiguous high-stakes terms
    /\b(cannot|impossible|too late|desperate|urgent)\b/i,
  ]

  for (const line of lines) {
    const trimmed = line.trim()
    // Only count NARRATOR lines
    const narratorMatch = trimmed.match(/^NARRATOR\s*:\s*(.+)$/i)
    if (!narratorMatch) {
      // Non-narrator lines still consume word budget
      const lineWords = wordCount(trimmed)
      wordOffset += lineWords
      continue
    }

    const narratorText = narratorMatch[1]

    // Check if this narrator line is a hook
    const isHook = HOOK_PATTERNS.some(pat => pat.test(narratorText))
    if (isHook) {
      // Return the word count at the start of this line
      return wordOffset
    }

    wordOffset += wordCount(narratorText)
  }

  return null
}

// ---------------------------------------------------------------------------
// Check 1: Hook within 30 spoken seconds
// ---------------------------------------------------------------------------

function checkHook(script: string): HookCheckResult {
  const dramaSection = extractAudioDramaSection(script)
  if (!dramaSection.trim()) {
    return {
      status: 'fail',
      wordsBeforeHook: null,
      hookFound: false,
      detail: '[START AUDIO DRAMA SCRIPT] section not found — cannot check hook timing',
    }
  }

  const hookOffset = detectHookWordOffset(dramaSection)

  if (hookOffset === null) {
    return {
      status: 'fail',
      wordsBeforeHook: null,
      hookFound: false,
      detail: 'No narrative hook detected in NARRATOR lines of audio drama section',
    }
  }

  if (hookOffset <= HOOK_PASS_WORD_LIMIT) {
    return {
      status: 'pass',
      wordsBeforeHook: hookOffset,
      hookFound: true,
      detail: `Hook at word ${hookOffset} (≤${HOOK_PASS_WORD_LIMIT} = ≤30s at ${WORDS_PER_SECOND} wps) — PASS`,
    }
  }

  if (hookOffset <= HOOK_WARN_WORD_LIMIT) {
    return {
      status: 'warn',
      wordsBeforeHook: hookOffset,
      hookFound: true,
      detail: `Hook at word ${hookOffset} (${HOOK_PASS_WORD_LIMIT + 1}–${HOOK_WARN_WORD_LIMIT} = 30–50s range) — WARN`,
    }
  }

  return {
    status: 'fail',
    wordsBeforeHook: hookOffset,
    hookFound: true,
    detail: `Hook at word ${hookOffset} (>${HOOK_WARN_WORD_LIMIT} = >50s) — too late for listener retention — FAIL`,
  }
}

// ---------------------------------------------------------------------------
// Check 2: Anchor SFX
// ---------------------------------------------------------------------------

/**
 * MARC RULING 2026-07-23: [SFX:...] script tag check is N/A for existing catalog
 * (no tags exist). For new scripts: add [SFX:...] markers to ASC template and count.
 *
 * A script is "legacy" if it contains NO [SFX:...] markers at all.
 * New scripts must have 3–6 SFX markers to PASS.
 */
function checkSfx(script: string): SfxCheckResult {
  const sfxMatches = script.match(/\[SFX:[^\]]*\]/gi) || []
  const sfxCount = sfxMatches.length

  // Legacy script: no SFX tags present at all → N/A (not new-template)
  const hasLegacyScript = sfxCount === 0

  if (hasLegacyScript) {
    return {
      status: 'na',
      sfxCount: 0,
      hasLegacyScript: true,
      detail: 'No [SFX:...] markers found — script pre-dates template change (legacy). Check is N/A.',
    }
  }

  // New script: must have 3–6 SFX markers
  if (sfxCount >= SFX_MIN && sfxCount <= SFX_MAX) {
    return {
      status: 'pass',
      sfxCount,
      hasLegacyScript: false,
      detail: `${sfxCount} [SFX:...] markers found (${SFX_MIN}–${SFX_MAX} = PASS)`,
    }
  }

  if (sfxCount > SFX_MAX) {
    return {
      status: 'pass',
      sfxCount,
      hasLegacyScript: false,
      detail: `${sfxCount} [SFX:...] markers found (>${SFX_MAX} — more than target range but present; treating as PASS)`,
    }
  }

  // sfxCount > 0 but < SFX_MIN (new script, too few)
  return {
    status: 'fail',
    sfxCount,
    hasLegacyScript: false,
    detail: `${sfxCount} [SFX:...] markers found — new scripts require ${SFX_MIN}–${SFX_MAX} anchor SFX (FAIL)`,
  }
}

// ---------------------------------------------------------------------------
// Check 3: Genre music mapping
// ---------------------------------------------------------------------------

async function checkGenre(genre: string): Promise<GenreCheckResult> {
  if (!genre) {
    return {
      status: 'warn',
      genre: '',
      soundProfile: null,
      detail: 'Story has no genre set — cannot check sound_profile mapping (WARN)',
    }
  }

  // Look up sound_profile from genres table
  const { data, error } = await supabase
    .from('genres')
    .select('name, sound_profile')
    .ilike('name', genre.trim())
    .single()

  if (error || !data) {
    return {
      status: 'warn',
      genre,
      soundProfile: null,
      detail: `Genre "${genre}" not found in genres table — no sound_profile to check (WARN)`,
    }
  }

  if (data.sound_profile) {
    return {
      status: 'pass',
      genre,
      soundProfile: data.sound_profile,
      detail: `Genre "${genre}" has sound_profile set — PASS`,
    }
  }

  return {
    status: 'warn',
    genre,
    soundProfile: null,
    detail: `Genre "${genre}" has null sound_profile — genre spec may be legitimately absent (WARN, not hard-fail)`,
  }
}

// ---------------------------------------------------------------------------
// Check 4: Belle intro/outro structure
// ---------------------------------------------------------------------------

/**
 * Extracts BELLE B ANNOUNCEMENT and BELLE B OUTRO sections.
 * Returns the line content following "BELLE B:" in each section, or '' if absent.
 */
function extractBelleSectionForGate(script: string, kind: 'intro' | 'outro'): string {
  const markers = kind === 'intro'
    ? ['BELLE B ANNOUNCEMENT', 'BELLE B INTRO']
    : ['BELLE B OUTRO']

  for (const marker of markers) {
    const markerIndex = script.search(new RegExp(`^${marker}\\s*$`, 'im'))
    if (markerIndex < 0) continue
    const afterMarker = script.slice(markerIndex)
    const match = afterMarker.match(/^BELLE B:\s*(.+)$/im)
    if (match && match[1]?.trim()) return match[1].trim()
  }
  return ''
}

function checkBelle(script: string): BelleCheckResult {
  const announcement = extractBelleSectionForGate(script, 'intro')
  const outro = extractBelleSectionForGate(script, 'outro')

  const hasAnnouncement = announcement.length > 0
  const hasOutro = outro.length > 0

  if (hasAnnouncement && hasOutro) {
    return {
      status: 'pass',
      hasAnnouncement: true,
      hasOutro: true,
      detail: 'BELLE B ANNOUNCEMENT and BELLE B OUTRO both present with content — PASS',
    }
  }

  const missing: string[] = []
  if (!hasAnnouncement) missing.push('BELLE B ANNOUNCEMENT (intro)')
  if (!hasOutro) missing.push('BELLE B OUTRO')

  return {
    status: 'fail',
    hasAnnouncement,
    hasOutro,
    detail: `Missing or empty: ${missing.join(', ')} — FAIL`,
  }
}

// ---------------------------------------------------------------------------
// Check 5: Audio file exists (shared verifyArtifactHttp)
// ---------------------------------------------------------------------------

async function checkAudioArtifact(audioUrl: string | null | undefined): Promise<ArtifactCheckResult> {
  const url = String(audioUrl || '').trim()

  if (!url) {
    return {
      status: 'fail',
      url: null,
      httpStatus: null,
      reachable: false,
      detail: 'audio_url is null or empty in DB — audio file does not exist (FAIL)',
    }
  }

  const result = await verifyArtifactHttp(url)

  if (result.reachable) {
    return {
      status: 'pass',
      url,
      httpStatus: result.httpStatus,
      reachable: true,
      detail: `Audio artifact HTTP ${result.httpStatus} — reachable (PASS)`,
    }
  }

  return {
    status: 'fail',
    url,
    httpStatus: result.httpStatus,
    reachable: false,
    detail: `Audio artifact at ${url} returned HTTP ${result.httpStatus ?? 'error'} (${result.error}) — FAIL`,
  }
}

// ---------------------------------------------------------------------------
// Check 6: Cover art exists (soft-warn only)
// ---------------------------------------------------------------------------

async function checkCoverArtifact(coverUrl: string | null | undefined): Promise<ArtifactCheckResult> {
  const url = String(coverUrl || '').trim()

  if (!url) {
    return {
      status: 'warn',
      url: null,
      httpStatus: null,
      reachable: false,
      detail: 'cover_url is null or empty in DB — cover art may be missing (WARN, not hard-fail)',
    }
  }

  const result = await verifyArtifactHttp(url)

  if (result.reachable) {
    return {
      status: 'pass',
      url,
      httpStatus: result.httpStatus,
      reachable: true,
      detail: `Cover artifact HTTP ${result.httpStatus} — reachable (PASS)`,
    }
  }

  return {
    status: 'warn',
    url,
    httpStatus: result.httpStatus,
    reachable: false,
    detail: `Cover artifact at ${url} returned HTTP ${result.httpStatus ?? 'error'} (${result.error}) — WARN (soft gate, not blocking)`,
  }
}

// ---------------------------------------------------------------------------
// Belle quality repair empty check
// ---------------------------------------------------------------------------

/**
 * BELLE QUALITY GATE ADDITION (2026-07-23):
 *
 * When belleQualityRepair in state_json is empty string AND
 * belleQualityValidation.pass = false, the advisory_passed path must NOT
 * proceed. This combination means repair ran but produced nothing.
 *
 * This closes the AWIDKnow EP1 outro defect: repair empty → advisory_passed
 * → defective outro shipped to production.
 *
 * Returns null if OK, or an error message if the combo is detected.
 */
export function detectBelleQualityRepairEmpty(stateJson: Record<string, unknown>): string | null {
  const repair = stateJson?.belleQualityRepair
  const validation = stateJson?.belleQualityValidation as Record<string, unknown> | undefined

  // Check: belleQualityRepair is empty string AND belleQualityValidation.pass === false
  const repairIsEmptyString = typeof repair === 'string' && repair === ''
  const validationFailed =
    validation !== undefined &&
    validation !== null &&
    (validation.pass === false || validation.status === 'failed')

  if (repairIsEmptyString && validationFailed) {
    return 'belle_quality_repair_empty: repair ran but produced an empty result, and validation did not pass — human intervention required (AWIDKnow EP1 pattern)'
  }

  return null
}

// ---------------------------------------------------------------------------
// Main gate function
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Check 7: Script-audio consistency (HOOK-GATE-STALE-001)
// ---------------------------------------------------------------------------

/**
 * Compare script_updated_at against segments_generated_at.
 *
 * Both timestamps must be populated (via the 20260725000000_script_audio_timestamps
 * migration) for a hard-fail verdict. When either is absent the check warns
 * rather than fails so legacy stories are not incorrectly blocked.
 *
 * @param scriptUpdatedAt   ISO string from stories.script_updated_at, or null
 * @param segmentsGeneratedAt  ISO string from stories.segments_generated_at, or null
 * @param hasScript         true when stories.script is non-empty
 */
/** @internal Exported for unit tests (HOOK-GATE-STALE-001) */
export function checkAudioConsistency(
  scriptUpdatedAt: string | null | undefined,
  segmentsGeneratedAt: string | null | undefined,
  hasScript: boolean,
): AudioConsistencyCheckResult {
  const scriptTs = scriptUpdatedAt ? scriptUpdatedAt.trim() : null
  const segTs    = segmentsGeneratedAt ? segmentsGeneratedAt.trim() : null

  if (!hasScript) {
    return {
      status: 'na',
      scriptUpdatedAt: scriptTs,
      segmentsGeneratedAt: segTs,
      staleByMs: null,
      detail: 'Story has no script — audio consistency check not applicable (N/A)',
    }
  }

  // Schema gap: migration not yet applied or story pre-dates tracking
  if (!scriptTs && !segTs) {
    return {
      status: 'warn',
      scriptUpdatedAt: null,
      segmentsGeneratedAt: null,
      staleByMs: null,
      detail:
        'script_updated_at and segments_generated_at are both NULL — ' +
        'migration 20260725000000_script_audio_timestamps not yet applied. ' +
        'Cannot verify audio-script consistency (WARN, schema gap)',
    }
  }

  if (!scriptTs) {
    return {
      status: 'warn',
      scriptUpdatedAt: null,
      segmentsGeneratedAt: segTs,
      staleByMs: null,
      detail:
        'script_updated_at is NULL — cannot determine when script was last edited. ' +
        'Apply migration 20260725000000_script_audio_timestamps (WARN, schema gap)',
    }
  }

  if (!segTs) {
    // Script exists but no segments have been generated through the new path yet.
    // This is expected for stories where voice generation hasn't completed, or for
    // stories processed before the migration was applied.
    return {
      status: 'warn',
      scriptUpdatedAt: scriptTs,
      segmentsGeneratedAt: null,
      staleByMs: null,
      detail:
        'segments_generated_at is NULL — voice segments were not generated through ' +
        'the tracked path (pre-migration audio, or generation not yet complete). ' +
        'Audio consistency cannot be verified (WARN)',
    }
  }

  const scriptTime = new Date(scriptTs).getTime()
  const segTime    = new Date(segTs).getTime()

  if (Number.isNaN(scriptTime) || Number.isNaN(segTime)) {
    return {
      status: 'warn',
      scriptUpdatedAt: scriptTs,
      segmentsGeneratedAt: segTs,
      staleByMs: null,
      detail:
        `Unparseable timestamp — scriptUpdatedAt="${scriptTs}" segmentsGeneratedAt="${segTs}" ` +
        '(WARN, cannot compare)',
    }
  }

  const staleByMs = scriptTime - segTime

  if (staleByMs > 0) {
    // script_updated_at is NEWER than segments_generated_at → stale audio
    const staleBySeconds = Math.round(staleByMs / 1000)
    const staleByMinutes = Math.round(staleByMs / 60_000)
    const staleLabel =
      staleByMinutes < 2 ? `${staleBySeconds}s`
      : staleByMinutes < 120 ? `${staleByMinutes}m`
      : `${Math.round(staleByMinutes / 60)}h`

    return {
      status: 'fail',
      scriptUpdatedAt: scriptTs,
      segmentsGeneratedAt: segTs,
      staleByMs,
      detail:
        `STALE AUDIO: script was edited ${staleLabel} AFTER voice segments were generated. ` +
        `script_updated_at=${scriptTs} > segments_generated_at=${segTs}. ` +
        'Audio does not match the current script. Re-run generate_voices to purge and regenerate. — FAIL',
    }
  }

  return {
    status: 'pass',
    scriptUpdatedAt: scriptTs,
    segmentsGeneratedAt: segTs,
    staleByMs: 0,
    detail:
      `Audio is consistent with script: segments_generated_at=${segTs} \u2265 script_updated_at=${scriptTs} — PASS`,
  }
}

export interface RunHookGateInput {
  storyId: string
  script: string
  genre: string
  audioUrl: string | null | undefined
  coverUrl: string | null | undefined
  stateJson?: Record<string, unknown>
  /** Populated by stories.script_updated_at (migration 20260725000000_script_audio_timestamps) */
  scriptUpdatedAt?: string | null
  /** Populated by stories.segments_generated_at (set by generate-voices on completion) */
  segmentsGeneratedAt?: string | null
}

/**
 * Run all six HOOK-GATE-001 checks plus the Belle quality repair empty check.
 *
 * @param input  Story fields needed for all checks.
 * @returns      Structured gate result with pass/warn/fail per check.
 */
export async function runHookGate(input: RunHookGateInput): Promise<HookGateResult> {
  const {
    storyId, script, genre, audioUrl, coverUrl,
    stateJson = {},
    scriptUpdatedAt,
    segmentsGeneratedAt,
  } = input

  // ── Run all checks in parallel where possible ───────────────────────────
  const [genreCheck, audioCheck, coverCheck] = await Promise.all([
    checkGenre(genre),
    checkAudioArtifact(audioUrl),
    checkCoverArtifact(coverUrl),
  ])

  // LANDING-STORY-001: cold open, no Belle B by design — exempt from belle structure check.
  // Same exemption pattern as PRs #29-37 (generate_belle_assets, validate_belle_assets,
  // validate_belle_quality, score_validate_package, series_generate_belle_assets).
  // Extracts VARIANT header from script; matches 'LANDING-STORY-001' or 'No Belle B'.
  const variantHeader = script.match(/^VARIANT:\s*(.+)$/m)?.[1]?.trim() ?? ''
  const isBelleExempt = /LANDING-STORY-001|No Belle B/i.test(variantHeader)

  const hookCheck = checkHook(script)
  const sfxCheck  = checkSfx(script)
  // Belle check: skip for LANDING-STORY-001 (no Belle B by design)
  const belleCheck: BelleCheckResult = isBelleExempt
    ? {
        status: 'pass',
        hasAnnouncement: false,
        hasOutro: false,
        detail: `LANDING-STORY-001 variant (VARIANT: ${variantHeader}) — Belle B blocks exempt by design. Check skipped.`,
      }
    : checkBelle(script)

  // ── Check 7: Script-audio consistency (HOOK-GATE-STALE-001) ─────────────
  // Compares script_updated_at against segments_generated_at.
  // Requires migration 20260725000000_script_audio_timestamps to hard-fail.
  // Without the migration both timestamps are null and this check warns.
  const audioConsistencyCheck = checkAudioConsistency(
    scriptUpdatedAt ?? null,
    segmentsGeneratedAt ?? null,
    Boolean(script?.trim()),
  )

  // ── Belle quality repair empty check ────────────────────────────────────
  const belleRepairEmptyError = detectBelleQualityRepairEmpty(stateJson)

  // ── Aggregate failures and warnings ─────────────────────────────────────
  const failures: string[] = []
  const warnings: string[] = []

  // Check 1: Hook
  if (hookCheck.status === 'fail') failures.push(`[hook] ${hookCheck.detail}`)
  else if (hookCheck.status === 'warn') warnings.push(`[hook] ${hookCheck.detail}`)

  // Check 2: SFX (N/A is not a failure or warning)
  if (sfxCheck.status === 'fail') failures.push(`[sfx] ${sfxCheck.detail}`)

  // Check 3: Genre (warn only, never hard-fail)
  if (genreCheck.status === 'warn') warnings.push(`[genre] ${genreCheck.detail}`)

  // Check 4: Belle structure
  if (belleCheck.status === 'fail') failures.push(`[belle] ${belleCheck.detail}`)

  // Check 5: Audio artifact (hard gate)
  if (audioCheck.status === 'fail') failures.push(`[audio] ${audioCheck.detail}`)

  // Check 6: Cover (soft gate — warn only)
  if (coverCheck.status === 'fail' || coverCheck.status === 'warn') {
    warnings.push(`[cover] ${coverCheck.detail}`)
  }

  // Check 7: Audio consistency — hard fail on stale, warn on schema gap
  if (audioConsistencyCheck.status === 'fail') {
    failures.push(`[audio_consistency] ${audioConsistencyCheck.detail}`)
  } else if (audioConsistencyCheck.status === 'warn') {
    warnings.push(`[audio_consistency] ${audioConsistencyCheck.detail}`)
  }

  // Belle quality repair empty → hard fail
  if (belleRepairEmptyError) {
    failures.push(`[belle_quality_repair_empty] ${belleRepairEmptyError}`)
  }

  const pass = failures.length === 0

  return {
    pass,
    warnings,
    failures,
    checks: {
      hook:             hookCheck,
      sfx:              sfxCheck,
      genre:            genreCheck,
      belle:            belleCheck,
      audio:            audioCheck,
      cover:            coverCheck,
      audioConsistency: audioConsistencyCheck,
    },
  }
}

/**
 * Fetch story from DB and run the full HOOK-GATE-001 check.
 * Convenience wrapper for the API endpoint and pipeline runner.
 */
export async function runHookGateForStory(
  storyId: string,
  stateJson: Record<string, unknown> = {},
): Promise<HookGateResult> {
  // HOOK-GATE-STALE-001: also fetch script_updated_at and segments_generated_at.
  // These columns exist after migration 20260725000000_script_audio_timestamps is applied.
  // If the migration has not been applied, Supabase returns the row without those fields
  // (or with null), which the gate handles gracefully with a warn instead of fail.
  const { data: story, error } = await supabase
    .from('stories')
    .select('id, script, genre, audio_url, cover_url, script_updated_at, segments_generated_at')
    .eq('id', storyId)
    .single()

  if (error || !story) {
    throw new Error(`HOOK-GATE-001: story ${storyId} not found — ${error?.message ?? 'no data'}`)
  }

  return runHookGate({
    storyId,
    script: String(story.script || ''),
    genre: String(story.genre || ''),
    audioUrl: story.audio_url,
    coverUrl: story.cover_url,
    stateJson,
    scriptUpdatedAt:    (story as any).script_updated_at    ?? null,
    segmentsGeneratedAt:(story as any).segments_generated_at ?? null,
  })
}
