/**
 * GATE-ENGINE — unified autonomous pipeline gate engine
 * Branch: feat/unified-gate-engine (Marc-authorized feature-branch build;
 * full-autonomy-oct7 decisions. NO MERGE — branch only.)
 *
 * Purpose (PIPELINE CANON 001, Rules 1–3):
 *   Every A/B defect is auto-detected, auto-fixed, auto-retried (bounded caps),
 *   auto-validated. Only S-class halts for Marc:
 *     S = safety | legal | catastrophic-corruption | unrecoverable-infra-threatening-data.
 *   All other marc_required flags convert to autonomous retry/fix paths with
 *   audit trails (before/after) and per-episode circuit caps.
 *
 * Design constraints:
 *   - PURE: no DB, no network, no LLM calls. Callers (run-next, dispatch-queue,
 *     repair playbooks) supply inputs and persist audit entries.
 *   - CONSERVATIVE DEFAULT: unknown/unclassified failure kinds HALT (treated as
 *     S until given an explicit autonomous route). New kinds halt by default.
 *   - Terminal non-S exhaustion PARKS (needs_attention for normal review,
 *     marc_required:false) — the pipeline never waits, Marc is never paged.
 *   - Preserves Sep-14 quality floor (>=24 publish, <24 rewrite x3 then park),
 *     S-class halts, audit trails, per-ep circuit caps, sequential ordering.
 *
 * Integration: lib/pipeline-runner/types.ts buildStructuredError() consults
 * applyGateRouting() — the single choke point through which every failure path
 * already funnels — so all marc_required flags with a registered autonomous
 * route are downgraded with playbook + resume point attached.
 */

export type DefectClass = 'A' | 'B' | 'S'

export type AutonomousActionKind =
  | 'retry_step'
  | 'sendback_rewrite'
  | 'metadata_fix'
  | 'canonical_regen'
  | 'library_fallback'
  | 'retranscribe'
  | 'recast'
  | 'tmp_sweep_retry'
  | 'cover_regen'
  | 'accept'
  | 'park'
  | 'halt_for_marc'

export interface DefectSignal {
  kind: string
  message?: string | null
  detail?: unknown
}

export interface Classification {
  defectClass: DefectClass
  reason: string
}

export interface AutonomousRoute {
  marc_required: boolean
  autonomous_repair: boolean
  action: AutonomousActionKind
  safe_resume_point: string | null
  playbookId: string
  max_retries: number
  reason: string
}

// ---------------------------------------------------------------------------
// S-CLASS detection — the ONLY halt class.
// S = safety | legal | catastrophic-corruption | unrecoverable-infra-threatening-data.
// ---------------------------------------------------------------------------

const S_SAFETY_RE = /\b(self-?harm|suicid|csam|child.+abus|terroris|bioweapon|grooming)\b/i
const S_LEGAL_RE = /\b(copyright|dmca|takedown|defamation|libel|cease.?and.?desist|subpoena|lawsuit|infringement)\b/i
const S_CATASTROPHIC_RE = /\b(widespread.+corrupt|mass.+delet|database.+corrupt|storage.+breach|credential.+(leak|expos)|all.+episodes.+corrupt)\b/i
const S_INFRA_DATA_RE = /\b(unrecoverable|data.?loss|threaten.+data|wal.+corrupt|disk.+fail|enospc.+(db|database|storage))\b/i

export function isSClassSignal(message?: string | null, detail?: unknown): boolean {
  const hay = `${message ?? ''} ${typeof detail === 'string' ? detail : ''}`
  return (
    S_SAFETY_RE.test(hay) || S_LEGAL_RE.test(hay) || S_CATASTROPHIC_RE.test(hay) || S_INFRA_DATA_RE.test(hay)
  )
}

const S_EXPLICIT_KINDS = new Set(['safety_block', 'legal_block', 'catastrophic_corruption', 'infra_data_threat'])

export function classifyDefect(sig: DefectSignal): Classification {
  const kind = String(sig.kind || '')
  if (S_EXPLICIT_KINDS.has(kind) || isSClassSignal(sig.message, sig.detail)) {
    return { defectClass: 'S', reason: `S-class signal in kind/message: ${kind}` }
  }
  if (!kind || kind === 'unknown' || kind === 'empty_error_json' || kind === 'unknown_step' || kind === 'unknown_qc') {
    // S-conservative: unclassified => halt until a human or an explicit route classifies it.
    return { defectClass: 'S', reason: `unclassified kind "${kind || '(empty)'}" — S-conservative halt` }
  }
  if (/transient|storage|stale_runner|zombie|tmp|render|loudness|silence|infra/i.test(kind)) {
    return { defectClass: 'A', reason: `pipeline/infra defect kind: ${kind}` }
  }
  return { defectClass: 'B', reason: `story/metadata defect kind: ${kind}` }
}
/**
 * GATE-ENGINE part 2 — autonomous routing table.
 *
 * Every known non-S failure kind maps to a bounded autonomous path.
 * Unknown kinds (or S signals) => halt_for_marc (S-conservative default).
 * Cap exhaustion on a non-S path => park (never auto-halt, never page Marc).
 */

// Resume-step vocabulary mirrors run-next step names.
const R = {
  generateScript: 'generate_script',
  generateEpisodeScript: 'generate_episode_script',
  voicePreflight: 'voice_preflight',
  seriesVoicePreflight: 'series_voice_preflight',
  generateVoices: 'generate_voices',
  generateBelleAssets: 'generate_belle_assets',
  repairBelleQuality: 'repair_belle_quality',
  generateMusic: 'generate_music',
  renderFinalMix: 'render_final_mix',
  seriesRenderFinalMix: 'series_render_final_mix',
  completeStoryPackage: 'complete_story_package',
  readyForReview: 'ready_for_review',
} as const

interface RouteSpec {
  action: AutonomousActionKind
  safe_resume_point: string | null
  playbookId: string
  max_retries: number
  reason: string
}

function spec(
  action: AutonomousActionKind,
  safe_resume_point: string | null,
  playbookId: string,
  max_retries: number,
  reason: string,
): RouteSpec {
  return { action, safe_resume_point, playbookId, max_retries, reason }
}

// Quality-floor send-back (Sep-14: <24 rewrite x3 then park).
const REWRITE_BACK = (playbook: string, resume: string, cap = 3) =>
  spec('sendback_rewrite', resume, playbook, cap, 'Class B content defect — Hal rewrite send-back, bounded, then park')

const ROUTES: Record<string, RouteSpec> = {
  // ── script validation (ATL-PIPE-008 canonical kinds) ──
  script_description_blocked_word: REWRITE_BACK('hal-metadata-fix', R.generateScript, 2),
  script_card_copy_format: REWRITE_BACK('hal-metadata-fix', R.generateScript, 2),
  script_quality_editorial: REWRITE_BACK('hal-rewrite-editorial', R.generateScript),
  script_story_resolution: REWRITE_BACK('hal-rewrite-resolution', R.generateScript),
  script_blocked_word: REWRITE_BACK('hal-metadata-fix', R.generateScript, 2),
  script_editorial_quality: REWRITE_BACK('hal-rewrite-editorial', R.generateScript),
  story_quality: REWRITE_BACK('hal-rewrite-quality-floor', R.generateScript),
  script_unlabeled_lines: REWRITE_BACK('hal-structure-fix', R.generateScript, 2),
  duplicate_segments: REWRITE_BACK('hal-dedupe-fix', R.generateScript, 2),
  numeral_pre_tts: REWRITE_BACK('hal-spell-out-numerals', R.generateScript, 3),
  // ── premise / casting (formerly marc_required, never auto-retryable) ──
  // premise_collision: brief bounced for premise-variant regen (cap) then park.
  // NOTE: standing "override only by Marc's recorded word" now applies ONLY to
  // manual override; the autonomous regen path below is the default.
  premise_collision: REWRITE_BACK('hal-premise-variant', R.generateScript, 2),
  // character_description_missing: resolved by the Casting module (auto-cast).
  character_description_missing: spec('recast', R.generateVoices, 'casting-autocast', 2, 'Missing character voice — Casting module auto-selects, then resume voices'),
  // ── continuity pin (GATE 2): regen HEAD episode against refreshed bundle (cap 2).
  // Canon Rule 3 preserved: passed episodes stay locked; only the head reprocesses.
  continuity_pin_mismatch: spec('retry_step', R.generateEpisodeScript, 'continuity-head-regen', 2, 'Pin mismatch — regen head episode with refreshed continuity bundle, passed eps locked'),
  // ── belle assets / quality (all auto-repairable via canonical regen) ──
  belle_quality_hook_missing: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle intro defect — canonical-template regen'),
  belle_quality_title_missing: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle title defect — canonical-template regen'),
  belle_quality_listener_missing: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle listener-placeholder defect — canonical-template regen'),
  belle_quality_repair_failed: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle repair failed deterministic checks — canonical-template regen'),
  belle_asset_blocked: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle asset blocked — canonical-template regen (was MAX_BELLE_BLOCKED_RETRIES=2)'),
  belle_quality_blocked: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle quality blocked — canonical-template regen (was MAX_BELLE_BLOCKED_RETRIES=2)'),
  belle_quality_unknown: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Unclassified Belle failure — canonical regen, then park'),
  belle_quality: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle quality (legacy) — canonical-template regen'),
  belle_quality_repair_empty: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 2, 'Belle repair empty — canonical-template regen'),
  series_belle_retry_validation_failed: spec('canonical_regen', R.repairBelleQuality, 'belle-canonical-regen', 3, 'Series Belle retry validation failed — canonical regen (was MAX_SERIES_BELLE_RETRIES=3)'),
  // ── transcript / audio QC: voice-only re-render or re-transcribe ──
  transcript_qc: spec('retranscribe', R.generateVoices, 'voice-only-repair', 2, 'Transcript QC — re-transcribe / voice-only re-render, then park'),
  transcript_question_mark: spec('retranscribe', R.generateVoices, 'voice-only-repair', 2, 'Transcript ambiguous — re-transcribe, then park'),
  transcript_numeric_equivalence: spec('accept', null, 'transcript-normalization-accept', 0, 'Digit/currency form accepted after normalization — no action'),
  transcript_hyphenated_numeric: spec('accept', null, 'transcript-normalization-accept', 0, 'Hyphenated number accepted after normalization — no action'),
  narrator_mismatch: spec('metadata_fix', null, 'narrator-db-fix', 2, 'Narrator mismatch — Atlas DB fix (no re-render), then park'),
  silence_buffer: spec('retry_step', R.renderFinalMix, 'audio-rerender', 2, 'Silence buffer — re-render, then park'),
  loudness: spec('retry_step', R.renderFinalMix, 'audio-rerender', 2, 'Loudness — re-render, then park'),
  null_lufs_segments: spec('retry_step', R.renderFinalMix, 'audio-rerender', 2, 'Null LUFS — re-render, then park'),
  null_lufs_stale: spec('retry_step', R.renderFinalMix, 'audio-rerender', 2, 'Null LUFS stale — re-render, then park'),
  voice_map_check_failed: spec('retry_step', R.generateVoices, 'voice-remap', 2, 'Voice map — re-resolve voices, then park'),
  garble_gate_failed: spec('retry_step', R.generateVoices, 'voice-only-repair', 2, 'Garble — voice-only re-render, then park'),
  garble_gate_error: spec('retry_step', R.generateVoices, 'voice-only-repair', 2, 'Garble gate error — voice-only re-render, then park'),
  hook_gate_failed: spec('sendback_rewrite', R.generateScript, 'hal-rewrite-hook', 2, 'Hook gate — Hal hook rewrite, then park'),
  orphan_check_failed: spec('retry_step', R.renderFinalMix, 'audio-rerender', 2, 'Orphan check — re-render, then park'),
  artifact_missing: spec('retry_step', R.completeStoryPackage, 'artifact-refetch', 2, 'Artifact missing — refetch/rebuild, then park'),
  // ── music: library fallback (lib/music-library.json) instead of Marc ──
  music_retry_exhausted: spec('library_fallback', R.generateMusic, 'music-library-fallback', 1, 'Music retries exhausted — fall back to licensed library track, audit, continue'),
  // ── render: tmp sweep + retry (TMP-SPACE-LOW-001) ──
  series_render_retry_exhausted: spec('tmp_sweep_retry', R.seriesRenderFinalMix, 'tmp-sweep-retry', 2, 'Series render exhausted — sweep stale et-mix-* dirs, retry, then park'),
  // ── RFR gate: correction loop, then park ──
  rfr_outro_narrator_missing: spec('canonical_regen', R.readyForReview, 'rfr-credit-fix', 2, 'RFR outro narrator credit — canonical fix, then park'),
  rfr_visibility_failed: spec('metadata_fix', R.readyForReview, 'rfr-visibility-fix', 2, 'RFR visibility — metadata fix, then park'),
  rfr_audio_missing: spec('retry_step', R.renderFinalMix, 'artifact-refetch', 2, 'RFR audio missing — refetch/rebuild mix, then park'),
  invalid_rfr: spec('sendback_rewrite', R.readyForReview, 'rfr-correction-loop', 2, 'RFR invalid — correction loop, then park'),
  // ── quality floor exhausted: park (floor decision, not a Marc page) ──
  quality_gate_exhausted: spec('park', null, 'quality-floor-park', 0, 'Quality floor exhausted (<24 after x3 rewrites) — park for normal review'),
  // ── infra / transient: bounded retry with back-off (caller applies back-off) ──
  transient: spec('retry_step', null, 'transient-backoff', 3, 'Transient infra — back-off retry'),
  storage_html_error: spec('retry_step', null, 'transient-backoff', 3, 'Storage HTML error — back-off retry'),
  zombie_stalled: spec('retry_step', null, 'zombie-resume', 2, 'Zombie stall — resume from safe point'),
  stale_runner: spec('retry_step', null, 'zombie-resume', 2, 'Stale runner — resume from safe point'),
  segment_stale_loop: spec('retry_step', R.generateVoices, 'stale-segment-refresh', 2, 'Stale segment loop — refresh and retry, then park'),
  mission_context_missing: spec('metadata_fix', null, 'mission-context-backfill', 1, 'Mission context missing — backfill, then park'),
  // ── cover: cover module regen ──
  cover_art: spec('cover_regen', null, 'cover-module-regen', 2, 'Cover defect — Cover module regen, then park'),
}

export function resolveAutonomousRoute(kind: string, message?: string | null, detail?: unknown): AutonomousRoute {
  const k = String(kind || '')
  const cls = classifyDefect({ kind: k, message, detail })
  if (cls.defectClass === 'S') {
    return {
      marc_required: true,
      autonomous_repair: false,
      action: 'halt_for_marc',
      safe_resume_point: null,
      playbookId: 's-class-halt',
      max_retries: 0,
      reason: cls.reason,
    }
  }
  const r = ROUTES[k]
  if (!r) {
    // S-conservative: kinds without a registered autonomous route halt.
    return {
      marc_required: true,
      autonomous_repair: false,
      action: 'halt_for_marc',
      safe_resume_point: null,
      playbookId: 'unrouted-kind-halt',
      max_retries: 0,
      reason: `no autonomous route registered for kind "${k}" — S-conservative halt`,
    }
  }
  return {
    marc_required: false,
    autonomous_repair: r.action !== 'park' && r.action !== 'accept',
    action: r.action,
    safe_resume_point: r.safe_resume_point,
    playbookId: r.playbookId,
    max_retries: r.max_retries,
    reason: `${cls.defectClass === 'A' ? 'Class A' : 'Class B'} — ${r.reason}`,
  }
}

/**
 * Choke-point adapter for buildStructuredError().
 * - proposed marc_required=false (already autonomous) => untouched.
 * - proposed true + registered autonomous route => downgraded with playbook attached.
 * - proposed true + S/unrouted => untouched (still halts).
 * Never clobbers explicitly-set autonomous fields in opts.
 */
export function applyGateRouting(
  kind: string,
  message: string | null | undefined,
  opts: {
    marc_required?: boolean
    autonomous_repair?: boolean
    safe_resume_point?: string | null
    playbookId?: string | null
    max_retries?: number
    detail?: unknown
  } = {},
): {
  marc_required: boolean
  autonomous_repair?: boolean
  safe_resume_point?: string | null
  playbookId?: string | null
  max_retries?: number
} {
  const out: {
    marc_required: boolean
    autonomous_repair?: boolean
    safe_resume_point?: string | null
    playbookId?: string | null
    max_retries?: number
  } = { marc_required: opts.marc_required ?? true }
  if (opts.autonomous_repair !== undefined) out.autonomous_repair = opts.autonomous_repair
  if (opts.safe_resume_point !== undefined) out.safe_resume_point = opts.safe_resume_point
  if (opts.playbookId !== undefined) out.playbookId = opts.playbookId
  if (opts.max_retries !== undefined) out.max_retries = opts.max_retries
  if (out.marc_required === false) return out
  const route = resolveAutonomousRoute(kind, message, opts.detail)
  if (route.action === 'halt_for_marc') return out
  out.marc_required = false
  if (out.autonomous_repair === undefined) out.autonomous_repair = route.autonomous_repair
  if (out.safe_resume_point === undefined && route.safe_resume_point) out.safe_resume_point = route.safe_resume_point
  if (out.playbookId === undefined) out.playbookId = route.playbookId
  if (out.max_retries === undefined) out.max_retries = route.max_retries
  return out
}
/**
 * GATE-ENGINE part 3 — bounded retry driver, audit trail, quality floor, sequential ordering.
 */

// ---------------------------------------------------------------------------
// Bounded retry driver + per-episode circuit caps (Canon Rule 3: per-ep counting)
// ---------------------------------------------------------------------------

export interface AttemptState {
  attempt: number
  cap: number
}

export function nextAttempt(state: AttemptState): { allow: boolean; attempt: number } {
  if (state.attempt < state.cap) return { allow: true, attempt: state.attempt + 1 }
  return { allow: false, attempt: state.attempt }
}

export interface CircuitLedger {
  counts: Record<string, number>
  caps: Record<string, number>
}

export function createCircuit(caps: Record<string, number> = {}): CircuitLedger {
  return { counts: {}, caps }
}

export function circuitCheck(ledger: CircuitLedger, key: string, defaultCap: number): { allow: boolean; used: number; cap: number } {
  const cap = ledger.caps[key] ?? defaultCap
  const used = ledger.counts[key] ?? 0
  return { allow: used < cap, used, cap }
}

export function circuitRecord(ledger: CircuitLedger, key: string): number {
  ledger.counts[key] = (ledger.counts[key] ?? 0) + 1
  return ledger.counts[key]
}

export function episodeCircuitKey(seriesId: string, episodeNumber: number, failureKind: string): string {
  return `${seriesId}:ep${episodeNumber}:${failureKind}`
}

// ---------------------------------------------------------------------------
// Audit trail — every autonomous fix logged with before/after
// ---------------------------------------------------------------------------

export interface AuditEntry {
  at: string
  kind: string
  defectClass: DefectClass
  action: AutonomousActionKind
  attempt: number
  before: string
  after: string
  note: string
}

export function auditFix(e: Omit<AuditEntry, 'at'>): AuditEntry {
  return { ...e, at: new Date().toISOString() }
}

export function appendAudit(log: AuditEntry[], e: AuditEntry): AuditEntry[] {
  return [...log, e]
}

export function formatAudit(e: AuditEntry): string {
  return `[gate-engine] ${e.at} kind=${e.kind} class=${e.defectClass} action=${e.action} attempt=${e.attempt} before=${JSON.stringify(e.before).slice(0, 200)} after=${JSON.stringify(e.after).slice(0, 200)} note=${e.note}`
}

// ---------------------------------------------------------------------------
// Quality floor (Sep-14, UNCHANGED): >=24 publish, <24 auto-rewrite x3 then park.
// Threshold value lives in lib/storyQualityGate.ts (QUALITY_GATE_AUTO_PUBLISH_THRESHOLD).
// This constant MUST equal it — enforced by __tests__/unified-gate-engine.test.ts.
// ---------------------------------------------------------------------------

export const QUALITY_FLOOR_PUBLISH = 24
export const QUALITY_REWRITE_CAP = 3

export type FloorDecision = 'publish' | 'rewrite' | 'park'

export function applyQualityFloor(score: number, rewriteCount: number): { decision: FloorDecision; reason: string } {
  if (score >= QUALITY_FLOOR_PUBLISH) {
    return { decision: 'publish', reason: `score ${score} >= floor ${QUALITY_FLOOR_PUBLISH} — publish` }
  }
  if (rewriteCount < QUALITY_REWRITE_CAP) {
    return { decision: 'rewrite', reason: `score ${score} < floor ${QUALITY_FLOOR_PUBLISH} — auto-rewrite ${rewriteCount + 1}/${QUALITY_REWRITE_CAP}` }
  }
  return { decision: 'park', reason: `score ${score} < floor after ${QUALITY_REWRITE_CAP} rewrites — park for normal review` }
}

// ---------------------------------------------------------------------------
// Sequential ordering (Canon Rule 3): head-of-line episodes only.
// passed+locked episodes are never re-checked; waiting episodes never start early.
// ---------------------------------------------------------------------------

export type EpisodeGateState = 'waiting' | 'head' | 'passed_locked' | 'blocked'

export interface SeriesGateLine {
  seriesId: string
  states: Record<number, EpisodeGateState>
}

export function headEpisode(line: SeriesGateLine): number | null {
  const nums = Object.keys(line.states).map(Number).sort((a, b) => a - b)
  for (const n of nums) {
    const s = line.states[n]
    if (s === 'head' || s === 'blocked') return n
    if (s === 'waiting') return n
  }
  return null
}

export function markEpisodePassed(line: SeriesGateLine, episodeNumber: number): SeriesGateLine {
  const states = { ...line.states, [episodeNumber]: 'passed_locked' as EpisodeGateState }
  const next = Object.keys(states).map(Number).sort((a, b) => a - b).find((n) => states[n] === 'waiting')
  if (next !== undefined) states[next] = 'head'
  return { ...line, states }
}

export function markEpisodeBlocked(line: SeriesGateLine, episodeNumber: number): SeriesGateLine {
  return { ...line, states: { ...line.states, [episodeNumber]: 'blocked' as EpisodeGateState } }
}
/**
 * GATE-ENGINE part 4 — six autonomous modules (pure functions).
 * (a) Casting  (b) Pen Name  (c) Intro Canonicalization
 * (d) Announcement  (e) Cover  (f) Metadata
 */

// ---------------------------------------------------------------------------
// (a) CASTING — auto-select narrator + character voices by genre.
// Callers supply the available voice catalog (DB roster at call time); the
// engine contributes genre->register prioritization + deterministic selection.
// ---------------------------------------------------------------------------

export type NarratorRegister = 'warm-intimate' | 'low-slowburn' | 'bright-propulsive' | 'dry-wry' | 'deep-epic'

export const HOUSE_NARRATOR_REGISTER_BY_GENRE: Record<string, NarratorRegister> = {
  romance: 'warm-intimate',
  thriller: 'low-slowburn',
  mystery: 'low-slowburn',
  horror: 'low-slowburn',
  adventure: 'bright-propulsive',
  comedy: 'dry-wry',
  fantasy: 'deep-epic',
  'sci-fi': 'bright-propulsive',
  drama: 'warm-intimate',
  crime: 'low-slowburn',
}

export const DEFAULT_NARRATOR_REGISTER: NarratorRegister = 'warm-intimate'

export interface VoiceProfile {
  voice_id: string
  voice_name: string
  register?: NarratorRegister | string | null
  locked?: boolean
}

export interface CastAssignment {
  role: string
  voice_id: string
  voice_name: string
  register: string
  why: string
}

export interface CastResult {
  ok: boolean
  narrator?: CastAssignment
  characters?: CastAssignment[]
  register?: NarratorRegister
  reason?: string
  action?: 'retry_step' | 'park'
}

export function registerForGenre(genre: string | null | undefined): NarratorRegister {
  const g = String(genre || '').toLowerCase().trim()
  return HOUSE_NARRATOR_REGISTER_BY_GENRE[g] ?? DEFAULT_NARRATOR_REGISTER
}

export function autoCastVoices(input: {
  genre?: string | null
  characters?: string[]
  catalog?: VoiceProfile[]
  lockedAssignments?: Record<string, string>
}): CastResult {
  const register = registerForGenre(input.genre)
  const catalog = input.catalog ?? []
  if (catalog.length === 0) {
    return { ok: false, reason: 'no-voice-catalog — caller must supply roster catalog; retry when available', action: 'retry_step' }
  }
  const locked = input.lockedAssignments ?? {}
  const pick = (role: string, preferRegister: boolean): VoiceProfile | null => {
    if (locked[role]) {
      const found = catalog.find((v) => v.voice_id === locked[role]) ?? null
      if (found) return found
    }
    if (preferRegister) {
      const match = catalog.find((v) => (v.register || '').toLowerCase() === register)
      if (match) return match
    }
    return catalog.find((v) => !Object.values(locked).includes(v.voice_id)) ?? catalog[0] ?? null
  };
  const narratorVoice = pick('NARRATOR', true)
  if (!narratorVoice) return { ok: false, reason: 'catalog-exhausted', action: 'park' }
  const used = new Set([narratorVoice.voice_id])
  const characters: CastAssignment[] = []
  for (const name of input.characters ?? []) {
    const v = pick(name, false)
    if (!v) continue
    // Avoid doubling the narrator voice on a character when alternatives exist.
    const alt = used.has(v.voice_id) ? (catalog.find((c) => !used.has(c.voice_id)) ?? v) : v
    used.add(alt.voice_id)
    characters.push({ role: name, voice_id: alt.voice_id, voice_name: alt.voice_name, register: String(alt.register ?? 'unspecified'), why: `genre=${input.genre ?? 'unknown'} distinct-voice` })
  }
  return {
    ok: true,
    register,
    narrator: { role: 'NARRATOR', voice_id: narratorVoice.voice_id, voice_name: narratorVoice.voice_name, register: String(narratorVoice.register ?? register), why: `genre=${input.genre ?? 'unknown'} register=${register}` },
    characters,
  }
}

// ---------------------------------------------------------------------------
// (b) PEN NAME — house pen name default unless series metadata specifies.
// OPEN: the actual house pen name VALUE needs Marc's word. Sourced from
// HOUSE_PEN_NAME env; when unset the module reports needsDecision (it does NOT
// invent a name). This is flagged in the build report.
// ---------------------------------------------------------------------------

export const HOUSE_PEN_NAME_UNSET = 'HOUSE_PEN_NAME_UNSET'

export function housePenName(env?: Record<string, string | undefined>): string {
  const v = (env ?? (typeof process !== 'undefined' ? process.env : {})).HOUSE_PEN_NAME
  return v && v.trim() ? v.trim() : HOUSE_PEN_NAME_UNSET
}

export interface PenNameResult {
  penName: string
  source: 'series_metadata' | 'house_default'
  needsDecision: boolean
}

export function resolvePenName(
  seriesMetadata: { pen_name?: string | null; author?: string | null } | null | undefined,
  env?: Record<string, string | undefined>,
): PenNameResult {
  const specified = String(seriesMetadata?.pen_name || '').trim()
  if (specified) return { penName: specified, source: 'series_metadata', needsDecision: false }
  const house = housePenName(env)
  return { penName: house, source: 'house_default', needsDecision: house === HOUSE_PEN_NAME_UNSET }
}

// ---------------------------------------------------------------------------
// (c) INTRO CANONICALIZATION — canonical "Series — Episode N: Title" digit format.
// Canonical series intro (per run-next Belle rules):
//   [LISTENER_NAME], "Series Name," Episode N: "Episode Title." <hook>
// The episode number is ALWAYS a digit (TTS reads "Episode 3" correctly — this
// is the numeral-scan pass-through that resolves the Alderton contradiction).
// ---------------------------------------------------------------------------

export const EPISODE_TOKEN_RE = /episode\s+(\d+)\b/i

export interface CanonicalIntroInput {
  seriesName: string
  episodeNumber: number
  episodeTitle: string
  hook?: string
  includeListenerPlaceholder?: boolean
}

export function canonicalizeSeriesIntro(input: CanonicalIntroInput): string {
  const series = String(input.seriesName || '').trim()
  const title = String(input.episodeTitle || '').trim()
  const n = Math.trunc(Number(input.episodeNumber))
  const hook = String(input.hook || '').trim()
  const opener = input.includeListenerPlaceholder === false ? '' : '[LISTENER_NAME], '
  const head = `${opener}"${series}," Episode ${n}: "${title}."`
  return hook ? `${head} ${hook}` : head
}

/** True when intro text carries the canonical digit episode token for ep N. */
export function introHasCanonicalEpisodeDigit(introText: string, episodeNumber: number): boolean {
  const m = String(introText || '').match(EPISODE_TOKEN_RE)
  return m !== null && Number(m[1]) === Number(episodeNumber)
}

/**
 * Package-check mirror (run-next validateIntroOutroPositionRules, series branch):
 * series intro must name series title + episode number (digit accepted) + episode title.
 */
export function introSatisfiesPackageCheck(
  introText: string,
  opts: { seriesName: string; episodeNumber: number; episodeTitle: string },
): { passed: boolean; issues: string[] } {
  const issues: string[] = []
  const hay = String(introText || '').toLowerCase()
  if (opts.seriesName && !hay.includes(opts.seriesName.toLowerCase())) {
    issues.push(`series intro must name the series title "${opts.seriesName}"`)
  }
  if (!introHasCanonicalEpisodeDigit(introText, opts.episodeNumber)) {
    issues.push(`series intro must name the episode number (episode ${opts.episodeNumber})`)
  }
  if (opts.episodeTitle && !hay.includes(opts.episodeTitle.toLowerCase())) {
    issues.push(`series intro must name the episode title "${opts.episodeTitle}"`)
  }
  return { passed: issues.length === 0, issues }
}

/**
 * ALDERTON-CONTRADICTION-001 resolution.
 * Narrow episode-number-token pass-through for the numeral pre-TTS scan: a BARE
 * integer token equal to the episode number, occurring in "Episode N" context,
 * is TTS-safe ("episode three") and MUST NOT be flagged — the package check
 * requires exactly this digit. All other digit spans (decimals, grouped
 * thousands, bare integers outside Episode context) still fail.
 */
export function isEpisodeNumberPassThrough(span: string, surroundingText: string, episodeNumber: number | null | undefined): boolean {
  if (episodeNumber === null || episodeNumber === undefined) return false
  const t = String(span || '').trim()
  if (!/^\d+$/.test(t)) return false
  if (Number(t) !== Number(episodeNumber)) return false
  return new RegExp(`episode\\s*${Number(episodeNumber)}\\b`, 'i').test(String(surroundingText || ''))
}

// ---------------------------------------------------------------------------
// (d) ANNOUNCEMENT — auto-generate announcement scripts (deterministic).
// ---------------------------------------------------------------------------

export type AnnouncementKind = 'series_intro' | 'series_non_finale_outro' | 'series_finale_outro' | 'standalone_intro' | 'standalone_outro'

export interface AnnouncementInput {
  kind: AnnouncementKind
  seriesName?: string
  episodeNumber?: number
  episodeTitle?: string
  standaloneTitle?: string
  author?: string
  narrator?: string
  nextTease?: string
  hook?: string
  includeListenerPlaceholder?: boolean
}

export function generateAnnouncementScript(input: AnnouncementInput): { text: string; checks: string[] } {
  const checks: string[] = []
  switch (input.kind) {
    case 'series_intro': {
      const hook = String(input.hook || '').trim()
      const text = canonicalizeSeriesIntro({
        seriesName: input.seriesName || '',
        episodeNumber: Number(input.episodeNumber ?? 1),
        episodeTitle: input.episodeTitle || '',
        hook: hook || '[HOOK]',
        includeListenerPlaceholder: input.includeListenerPlaceholder,
      })
      checks.push('names-series', 'names-episode-digit', 'names-title')
      checks.push(hook ? 'hook' : 'hook-missing')
      return { text, checks }
    }
    case 'series_non_finale_outro': {
      const tease = String(input.nextTease || 'The road keeps going — join us next episode.').trim()
      const text = `Belle here — that moment is going to stay with you. ${tease}`
      checks.push('emotional-residue', 'companion-presence', 'next-tease', 'no-author-credit', 'no-narrator-credit')
      return { text, checks }
    }
    case 'series_finale_outro': {
      const series = String(input.seriesName || '').trim()
      const author = String(input.author || '').trim()
      const narrator = String(input.narrator || '').trim()
      const text = `"${series}" has come to its ending — thank you for riding with us.${author ? ` Written by ${author}.` : ''}${narrator ? ` Narrated by ${narrator}.` : ''}`
      checks.push('names-series-or-title', 'author-credit', 'narrator-credit')
      return { text, checks }
    }
    case 'standalone_intro': {
      const title = String(input.standaloneTitle || '').trim()
      const hook = String(input.hook || '').trim()
      const text = `"${title}." ${hook || '[HOOK]'}`.trim()
      checks.push('names-title')
      checks.push(hook ? 'hook' : 'hook-missing')
      return { text, checks }
    }
    case 'standalone_outro': {
      const title = String(input.standaloneTitle || '').trim()
      const author = String(input.author || '').trim()
      const narrator = String(input.narrator || '').trim()
      const text = `"${title}" — a complete story.${author ? ` Written by ${author}.` : ''}${narrator ? ` Narrated by ${narrator}.` : ''}`
      checks.push('names-title', 'author-credit', 'narrator-credit', 'no-next-tease')
      return { text, checks }
    }
  }
}

// ---------------------------------------------------------------------------
// (e) COVER — auto-generate cover prompts (pure; render stays a pipeline step).
// ---------------------------------------------------------------------------

export interface CoverInput {
  title: string
  genre?: string | null
  concept?: string
  tone?: string
  darkException?: boolean
  feedback?: string
}

export interface CoverPromptResult {
  prompt: string
  bright: boolean
  attemptsUsed: number
}

export const COVER_RETRY_CAP = 2

export function buildCoverPrompt(input: CoverInput): CoverPromptResult {
  const bright = !input.darkException
  const parts = [
    bright
      ? 'Bright, high-key illustration with a light or daylight background and strong subject contrast.'
      : 'Moody, cinematic illustration true to the story’s darkness, subject clearly readable at thumbnail size.',
    `Audio fiction cover for "${String(input.title || '').trim()}" (${String(input.genre || 'drama').trim()}).`,
  ]
  if (input.concept) parts.push(`Concept: ${input.concept.trim()}`)
  if (input.tone) parts.push(`Tone: ${input.tone.trim()}`)
  parts.push('No text, no words, no letters anywhere in the image. Square 1:1 composition.')
  if (input.feedback) parts.push(`Revision feedback to apply: ${input.feedback.trim()}`)
  return { prompt: parts.join(' '), bright, attemptsUsed: input.feedback ? 1 : 0 }
}

// ---------------------------------------------------------------------------
// (f) METADATA — series description + app metadata (pure).
// Rules mirrored from run-next: description <= 24 words, present tense
// (past-tense markers rejected), title <= 28 chars.
// ---------------------------------------------------------------------------

export const DESCRIPTION_MAX_WORDS = 24
export const TITLE_MAX_CHARS = 28
const PAST_TENSE_RE = /\b(vanished|was|were|had|found|discovered|left|moved|sealed|signed|forged|buried|hidden|lost)\b/i

export interface SeriesMetadataInput {
  seriesName: string
  premise: string
  genre?: string | null
  totalEpisodes?: number
  penName?: string | null
}

export interface SeriesMetadataResult {
  ok: boolean
  title: string
  description: string
  genre: string
  totalEpisodes: number
  author: string
  issues: string[]
}

export function wordCount(s: string): number {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length
}

export function buildSeriesMetadata(input: SeriesMetadataInput, env?: Record<string, string | undefined>): SeriesMetadataResult {
  const issues: string[] = []
  const title = String(input.seriesName || '').trim()
  if (title.length > TITLE_MAX_CHARS) issues.push(`title exceeds ${TITLE_MAX_CHARS} chars`)
  let description = String(input.premise || '').trim()
  const words = description.split(/\s+/).filter(Boolean)
  if (words.length > DESCRIPTION_MAX_WORDS) {
    description = words.slice(0, DESCRIPTION_MAX_WORDS).join(' ')
    issues.push(`description trimmed to ${DESCRIPTION_MAX_WORDS} words`)
  }
  if (PAST_TENSE_RE.test(description)) issues.push('description uses past tense — rewrite in present tense')
  const pen = resolvePenName({ pen_name: input.penName ?? null }, env)
  return {
    ok: issues.length === 0,
    title,
    description,
    genre: String(input.genre || 'drama').trim(),
    totalEpisodes: Number(input.totalEpisodes ?? 0),
    author: pen.penName,
    issues,
  }
}
