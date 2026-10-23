/**
 * BELLE-FRESHNESS GATE — publication-time render-freshness enforcement
 * (BELLE-FRESHNESS-001, commission Marc 2026-10-23 standing invalidation /
 * freshness rule + 16:20 safeguard order; bound clearance Marc 2026-10-23
 * 16:37 item 3).
 *
 * Ground truth: the pipeline repair path already invalidates Belle audio
 * files on repair (persistBelleRepairAndInvalidateAudio / deleteBelleAudioFiles
 * in lib/belleRepairPersist.ts), but NOTHING at publication time proves the
 * mix being published was rendered from the CURRENT Belle text. An
 * existing file (or a completed-flag, or a render timestamp) is never
 * freshness evidence: after any Belle text change, dependent mixes are
 * stale until re-verified, and publication must refuse without
 * render-freshness evidence.
 *
 * Clearance binds to TWO facts, never to a timestamp:
 *   (a) the fingerprint of the Belle text ACTUALLY SENT to the render
 *       request equals the current Belle text fingerprint, AND
 *   (b) the cleared asset equals THAT request's output asset id/URL.
 * A render timestamp alone NEVER clears and NEVER certifies — it is
 * recorded for audit only.
 *
 * The fingerprint above is a TEXT-identity check, NOT transcription
 * verification. Transcription verification is the SEPARATE function
 * verifyTranscriptAgainstScript below, which performs an actual
 * transcript-vs-script word comparison. Never call the fingerprint
 * check transcription verification; never use the fingerprint as
 * transcription evidence.
 *
 * Evidence envelope (no migration — rides in script_json.series_generation
 * alongside pending_pin_resync / pending_audio_delete):
 *   belle_freshness: {
 *     fingerprint: string,               // sha256 over normalized intro+outro
 *     text_changed_at: string,           // ISO — last text-set that changed it
 *     audio_stale: boolean,              // explicit stale flag (never inferred)
 *     last_verified_render_at: string | null, // ISO — AUDIT ONLY, never evidence
 *     render_request_fingerprint: string | null, // fp of text sent to the
 *       verifying render request (binding a)
 *     verified_audio_asset: string | null, // that request's output asset
 *       id/URL (binding b)
 *   }
 *
 * Lifecycle:
 *   text set (persistBelleRepair)  → stamp: fp mismatch (or no prior
 *     envelope) sets audio_stale=true + text_changed_at=now and voids the
 *     render bindings (null). Same text preserves the envelope
 *     byte-for-byte (render evidence survives a no-op rewrite).
 *   mix rebuild (runRenderFinalMix) → clearance: clears audio_stale ONLY
 *     when the render request's text fingerprint equals the current text
 *     fingerprint AND the request produced an output asset, recording
 *     both bindings. Anything else — request rendered other text, no
 *     output asset — stamps/stays stale. Timestamps play no part.
 *   publication (every hold-gate writer) → evaluateBelleFreshnessForPublish
 *     refuses becoming-visible writes while any episode is stale (fail
 *     closed, audited refusal code belle_freshness_stale, zero writes).
 *
 * Fail direction everywhere: missing/unparseable evidence refuses.
 * Episodes with no final mix (no audio_url) pass vacuously — there is
 * nothing stale; the field/artifact gates still require audio to publish.
 * Scripts with no Belle sections (e.g. LANDING-STORY-001, no Belle by
 * design) pass vacuously — freshness is about Belle text.
 *
 * Checked by every publication writer (same writers as lib/publicationHold):
 *   - app/api/admin/publish-story/route.ts (series + single)
 *   - app/api/asc3/publish-story/route.ts (single)
 *   - app/api/admin/content-approval/route.ts (set_workflow_state → published)
 *   - lib/storyQueue/directPublish.ts (operator direct-publish executor)
 *   - lib/directPublish.ts (autonomous RFR hooks)
 */

import { createHash } from 'node:crypto'
import { extractBelleSection } from './publicationBelleGate'
import { normalizeNumberWords } from './numberWords'

/** Key under script_json.series_generation holding the freshness envelope. */
export const BELLE_FRESHNESS_KEY = 'belle_freshness'

/** Unmissable log marker emitted on stamp/clear events (audit trail). */
export const BELLE_FRESHNESS_MARKER = 'BELLE-FRESHNESS'

/** Stable refusal code surfaced on every freshness refusal (audited). */
export const BELLE_FRESHNESS_STALE_CODE = 'belle_freshness_stale'

export type BelleFreshnessEnvelope = {
  fingerprint: string
  text_changed_at: string
  audio_stale: boolean
  /** Audit only — NEVER clearance evidence, NEVER certification. */
  last_verified_render_at: string | null
  /** Binding (a): fingerprint of the Belle text actually sent to the
   * verifying render request. Null = no bound render. */
  render_request_fingerprint: string | null
  /** Binding (b): that request's output asset id/URL. Null = no bound asset. */
  verified_audio_asset: string | null
}

function clean(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeBelleText(value: unknown): string {
  // Shared numeral normalization (Marc 2026-10-23 16:37 item 1): TTS
  // speaks "2" and "Two" identically, so a numeral-only Belle rewrite
  // keeps the fingerprint — existing valid audio is never regenerated
  // for Two-vs-2. Whitespace is collapsed for the same reason.
  return normalizeNumberWords(clean(value)).replace(/\s+/g, ' ')
}

/**
 * Stable fingerprint over the Belle intro+outro pair. Normalizes
 * whitespace AND spoken numerals so formatting-only or numeral-only
 * rewrites do not invalidate evidence; any other word change flips the
 * hash. Empty pair → '' (no Belle text — vacuous, never stamped).
 *
 * This is a TEXT-identity check, NOT transcription verification (see
 * verifyTranscriptAgainstScript).
 */
export function fingerprintBelleText(intro: unknown, outro: unknown): string {
  const pair = `${normalizeBelleText(intro)}\n${normalizeBelleText(outro)}`.trim()
  if (!pair) return ''
  return createHash('sha256').update(pair, 'utf8').digest('hex')
}

/** Fingerprint of the Belle sections in a story script column. */
export function currentBelleFingerprint(script: unknown): string {
  const text = String(script ?? '')
  if (!text.trim()) return ''
  return fingerprintBelleText(
    extractBelleSection(text, 'intro'),
    extractBelleSection(text, 'outro')
  )
}

/**
 * Read the envelope from a script_json doc. Null when absent/malformed.
 * Tolerant of pre-binding envelopes (missing render_request_fingerprint /
 * verified_audio_asset read as null): they fail CLOSED at the gate, which
 * requires both bindings — tolerance here never certifies anything.
 */
export function readBelleFreshness(scriptJson: unknown): BelleFreshnessEnvelope | null {
  try {
    const sg =
      scriptJson && typeof scriptJson === 'object'
        ? (scriptJson as Record<string, unknown>).series_generation
        : null
    const env =
      sg && typeof sg === 'object'
        ? (sg as Record<string, unknown>)[BELLE_FRESHNESS_KEY]
        : null
    if (!env || typeof env !== 'object') return null
    const rec = env as Record<string, unknown>
    if (typeof rec.fingerprint !== 'string' || !rec.fingerprint) return null
    if (typeof rec.text_changed_at !== 'string' || !rec.text_changed_at) return null
    const reqFp = rec.render_request_fingerprint
    const asset = rec.verified_audio_asset
    return {
      fingerprint: rec.fingerprint,
      text_changed_at: rec.text_changed_at,
      audio_stale: rec.audio_stale === true,
      last_verified_render_at:
        typeof rec.last_verified_render_at === 'string' && rec.last_verified_render_at
          ? rec.last_verified_render_at
          : null,
      render_request_fingerprint:
        typeof reqFp === 'string' && reqFp ? reqFp : null,
      verified_audio_asset:
        typeof asset === 'string' && asset ? asset : null,
    }
  } catch {
    return null
  }
}

/** Return a script_json doc with the envelope set (shape-preserving). */
export function setBelleFreshness(
  scriptJson: unknown,
  envelope: BelleFreshnessEnvelope
): Record<string, unknown> {
  const base =
    scriptJson && typeof scriptJson === 'object'
      ? { ...(scriptJson as Record<string, unknown>) }
      : {}
  const sgRaw = (base as Record<string, unknown>).series_generation
  const sg =
    sgRaw && typeof sgRaw === 'object'
      ? { ...(sgRaw as Record<string, unknown>) }
      : {}
  return {
    ...base,
    series_generation: {
      ...sg,
      [BELLE_FRESHNESS_KEY]: { ...envelope },
    },
  }
}

/**
 * TEXT-SET STAMP (pure). Called whenever Belle copy is written. Compares
 * the new script's Belle fingerprint against the prior envelope:
 *   - no prior envelope, or fingerprint differs → text changed: fresh
 *     envelope with audio_stale=true, text_changed_at=now, and the render
 *     bindings VOIDED (null — a changed text has no bound render).
 *   - fingerprint identical → the prior envelope is preserved byte-for-byte
 *     (a no-op rewrite must not burn render evidence).
 *   - new script has no Belle sections → no stamp (null envelope); the
 *     copy gate owns that failure, not freshness.
 */
export function freshnessEnvelopeForTextSet(
  priorScriptJson: unknown,
  nextScript: unknown,
  nowIso: string
): { envelope: BelleFreshnessEnvelope | null; changed: boolean; stale: boolean } {
  const nextFp = currentBelleFingerprint(nextScript)
  if (!nextFp) return { envelope: null, changed: false, stale: false }
  const prior = readBelleFreshness(priorScriptJson)
  if (prior && prior.fingerprint === nextFp) {
    return { envelope: prior, changed: false, stale: prior.audio_stale }
  }
  const envelope: BelleFreshnessEnvelope = {
    fingerprint: nextFp,
    text_changed_at: nowIso,
    audio_stale: true,
    last_verified_render_at: prior?.last_verified_render_at ?? null,
    render_request_fingerprint: null,
    verified_audio_asset: null,
  }
  return { envelope, changed: true, stale: true }
}

/**
 * MIX-REBUILD CLEARANCE (pure). Called once per successful final-mix
 * render. Clearance binds to TWO facts and NEVER to a timestamp:
 *   (a) renderRequestFingerprint (fingerprint of the Belle text ACTUALLY
 *       SENT to this render request) equals the current text fingerprint;
 *   (b) outputAsset (THIS request's output asset id/URL) is non-empty and
 *       is recorded as the verified asset.
 * renderAtIso is an AUDIT stamp only — it is recorded, never evaluated.
 * A later/equal/earlier/unparseable timestamp changes NOTHING about the
 * verdict: timestamp alone NEVER clears.
 *   - no envelope → the rebuild establishes the baseline ONLY with both
 *     bindings (established=true). Without bindings it stamps stale.
 *   - envelope fp differs from current text (unstamped drift) → stale
 *     stamp (text_changed_at unknown, so the render time stands in as the
 *     stamping time — fail closed: a SECOND bound rebuild clears it).
 *   - fp matches, bindings match → cleared. Already fresh+bound → the
 *     input doc is returned untouched (same reference — the caller can
 *     skip the write entirely, zero write churn).
 *   - bindings mismatch (request rendered other text, or no output
 *     asset) → stale: the prior asset binding is VOIDED (the mix on file
 *     may have just been overwritten by a render of other text).
 */
export function applyMixRebuildClearance(args: {
  scriptJson: unknown
  scriptText: unknown
  renderRequestFingerprint: string
  outputAsset: unknown
  renderAtIso: string
}): {
  scriptJson: Record<string, unknown>
  changed: boolean
  cleared: boolean
  established: boolean
} {
  const fp = currentBelleFingerprint(args.scriptText)
  const base =
    args.scriptJson && typeof args.scriptJson === 'object'
      ? { ...(args.scriptJson as Record<string, unknown>) }
      : {}
  if (!fp) return { scriptJson: base, changed: false, cleared: false, established: false }
  const requestFp = clean(args.renderRequestFingerprint)
  const asset = clean(args.outputAsset)
  const bindingsHold = Boolean(requestFp) && requestFp === fp && Boolean(asset)
  const env = readBelleFreshness(args.scriptJson)

  if (!env) {
    if (!bindingsHold) {
      return {
        scriptJson: setBelleFreshness(base, {
          fingerprint: fp,
          text_changed_at: args.renderAtIso,
          audio_stale: true,
          last_verified_render_at: null,
          render_request_fingerprint: requestFp || null,
          verified_audio_asset: null,
        }),
        changed: true,
        cleared: false,
        established: false,
      }
    }
    return {
      scriptJson: setBelleFreshness(base, {
        fingerprint: fp,
        text_changed_at: args.renderAtIso,
        audio_stale: false,
        last_verified_render_at: args.renderAtIso,
        render_request_fingerprint: requestFp,
        verified_audio_asset: asset,
      }),
      changed: true,
      cleared: true,
      established: true,
    }
  }
  if (env.fingerprint !== fp) {
    return {
      scriptJson: setBelleFreshness(base, {
        fingerprint: fp,
        text_changed_at: args.renderAtIso,
        audio_stale: true,
        last_verified_render_at: env.last_verified_render_at,
        render_request_fingerprint: requestFp || null,
        verified_audio_asset: null,
      }),
      changed: true,
      cleared: false,
      established: false,
    }
  }
  if (!bindingsHold) {
    if (env.audio_stale && env.verified_audio_asset === null) {
      // Already stale with no asset binding: return the input doc
      // untouched (same reference — zero write churn).
      return { scriptJson: args.scriptJson as Record<string, unknown>, changed: false, cleared: false, established: false }
    }
    return {
      scriptJson: setBelleFreshness(base, {
        ...env,
        audio_stale: true,
        render_request_fingerprint: requestFp || null,
        verified_audio_asset: null,
      }),
      changed: true,
      cleared: false,
      established: false,
    }
  }
  if (
    !env.audio_stale &&
    env.render_request_fingerprint === requestFp &&
    env.verified_audio_asset === asset
  ) {
    // Already fresh and bound to this exact render: return the input doc
    // untouched (same reference — the caller can skip the write
    // entirely, zero write churn).
    return { scriptJson: args.scriptJson as Record<string, unknown>, changed: false, cleared: true, established: false }
  }
  return {
    scriptJson: setBelleFreshness(base, {
      ...env,
      audio_stale: false,
      last_verified_render_at: args.renderAtIso,
      render_request_fingerprint: requestFp,
      verified_audio_asset: asset,
    }),
    changed: true,
    cleared: true,
    established: false,
  }
}

export type BelleFreshnessStory = {
  id?: unknown
  title?: unknown
  script?: unknown
  script_json?: unknown
  audio_url?: unknown
}

export type BelleFreshnessVerdict =
  | { ok: true }
  | { ok: false; code: typeof BELLE_FRESHNESS_STALE_CODE; blockers: string[] }

function hasFinalMix(story: BelleFreshnessStory): boolean {
  const url = clean(story.audio_url)
  return Boolean(url) && !url.startsWith('pending:')
}

/**
 * PUBLICATION GATE (pure, zero writes). Every episode WITH a final mix
 * must carry render-freshness evidence: an envelope whose fingerprint
 * matches the CURRENT Belle text, explicitly not stale, bound to the
 * render that produced the mix on file —
 *   (a) render_request_fingerprint == current Belle fingerprint, AND
 *   (b) verified_audio_asset == the episode's current audio_url.
 * Timestamps are NEVER consulted: last_verified_render_at is audit-only.
 * Anything else — no envelope, fingerprint drift, stale flag, unbound
 * render, asset mismatch — is a blocker. Episodes without a mix, or
 * scripts without Belle sections, pass vacuously.
 */
export function evaluateBelleFreshnessForPublish(
  episodes: Array<BelleFreshnessStory>
): BelleFreshnessVerdict {
  const blockers: string[] = []
  for (const ep of episodes || []) {
    const label =
      clean((ep as { id?: unknown }).id) || clean(ep.title) || '(unknown episode)'
    if (!hasFinalMix(ep)) continue
    const fp = currentBelleFingerprint(ep.script)
    if (!fp) continue
    const env = readBelleFreshness(ep.script_json)
    if (!env) {
      blockers.push(
        `episode ${label}: has a final mix but no Belle-freshness evidence (fingerprint never recorded) — an existing file is not evidence; rebuild/re-verify before publishing`
      )
      continue
    }
    if (env.fingerprint !== fp) {
      blockers.push(
        `episode ${label}: Belle text changed after the last verified render (fingerprint drift) — mix is stale until re-rendered`
      )
      continue
    }
    if (env.audio_stale) {
      blockers.push(
        `episode ${label}: Belle audio explicitly marked stale (text changed at ${env.text_changed_at}) — mix is stale until re-rendered`
      )
      continue
    }
    if (!env.render_request_fingerprint || env.render_request_fingerprint !== fp) {
      blockers.push(
        `episode ${label}: no bound render request for the current Belle text (render-request fingerprint mismatch) — a timestamp alone never certifies; re-render before publishing`
      )
      continue
    }
    const mixUrl = clean(ep.audio_url)
    if (!env.verified_audio_asset || env.verified_audio_asset !== mixUrl) {
      blockers.push(
        `episode ${label}: the mix on file is not the verified render output (asset binding mismatch) — re-render before publishing`
      )
    }
  }
  return blockers.length
    ? { ok: false, code: BELLE_FRESHNESS_STALE_CODE, blockers }
    : { ok: true }
}

export class BelleFreshnessError extends Error {
  code = BELLE_FRESHNESS_STALE_CODE
  blockers: string[]
  constructor(blockers: string[]) {
    super(
      `publication refused: Belle render-freshness is stale on ` +
        `${blockers.length} episode(s). Re-render the mix after the Belle ` +
        `text change — there is no waiver path.`
    )
    this.blockers = blockers
  }
}

/**
 * Writer guard (throws BelleFreshnessError on stale; zero writes itself).
 * Call alongside the Belle copy gate, before the terminal publication
 * write. Episodes are the already-fetched rows (must include script,
 * script_json, audio_url).
 */
export function assertBelleFreshForPublish(
  episodes: Array<BelleFreshnessStory>,
  log: (msg: string) => void = () => {}
): void {
  const verdict = evaluateBelleFreshnessForPublish(episodes)
  if (!verdict.ok) {
    const blockers = (verdict as { blockers: string[] }).blockers
    log(
      `[${BELLE_FRESHNESS_MARKER}] REFUSED becoming-visible write: ${blockers.length} stale episode(s): ${blockers.join(' | ')}`
    )
    throw new BelleFreshnessError(blockers)
  }
}

export type TranscriptVerification = {
  /** True only when the transcript matches the script word-for-word. */
  match: boolean
  transcriptWords: number
  scriptWords: number
  /** Words of common prefix before the first divergence (null when match). */
  firstDivergenceIndex: number | null
  /** matchedPrefixWords / max(transcriptWords, scriptWords). */
  coverage: number
}

function tokenizeForVerification(value: unknown): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * TRANSCRIPTION VERIFICATION — the ONLY function that may be called
 * transcription verification. Performs an ACTUAL transcript-vs-script
 * word comparison (common-prefix match with first-divergence reporting).
 * The fingerprint checks above are text-identity checks and are NEVER
 * transcription verification.
 */
export function verifyTranscriptAgainstScript(
  transcript: unknown,
  script: unknown
): TranscriptVerification {
  const t = tokenizeForVerification(transcript)
  const s = tokenizeForVerification(script)
  let common = 0
  while (common < t.length && common < s.length && t[common] === s[common]) {
    common++
  }
  const match = common === t.length && common === s.length
  const denom = Math.max(t.length, s.length)
  return {
    match,
    transcriptWords: t.length,
    scriptWords: s.length,
    firstDivergenceIndex: match ? null : common,
    coverage: denom === 0 ? 1 : common / denom,
  }
}
