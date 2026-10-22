/**
 * scripts/creek-legacy-recovery.ts — Creek legacy-state recovery (guarded artifact).
 *
 * GUARDED, NOT YET AUTHORIZED TO RUN. This script performs NO work on import.
 * It only acts when invoked as `npx tsx scripts/creek-legacy-recovery.ts --execute`
 * (default without --execute is a read-only preflight dry run).
 *
 *CANONICAL IDENTIFIERS (full UUIDs, verified read-only 2026-10-22):
 *   job    f02896f1-6af4-4159-88b9-cd97664f0e31  (failed@complete_story_package)
 *   series 966e766f-cfac-448a-aa4b-82c9107d7293
 *   ep1    f7bf1126-6ad0-47f6-9e83-a82a99608df8
 *   ep2    a10d725a-6e6a-4885-a854-5c4730a5d1e4  (outro repair target)
 *   ep3    d381caca-a186-4deb-9a73-a2adac611637
 *
 * REVIEWED STRUCTURE LOCATIONS (verified by reading the live rows — there are
 * NO top-level pending_audio_delete / pending_pin_resync / belle_repair_audit
 * / raw_script / continuity_pins_used columns on stories; all nest here):
 *   script_json.raw_script                                  (production-consumed copy)
 *   script_json.series_generation.pending_pin_resync       (drain list)
 *   script_json.series_generation.pending_audio_delete     (delete-intent URLs)
 *   script_json.series_generation.continuity_pins_used     (pins)
 *   script_json.series_generation.belle_repair_audit       (append-only array)
 *   stories.outro_text                                     (production-consumed column)
 *   stories.script                                         (canonical text)
 *
 * ORDERED STEPS (lock-first; every write fenced + read-after-write verified;
 * crash between steps converges on restart with zero duplicate paid calls —
 * this script itself makes NO paid calls; generation happens on later ticks):
 *   0. Preflight re-verification reads (READ ONLY). ABORT on any mismatch.
 *      Resume waiver: own-lock-held rows (running + locked_by=LOCK_ID) skip
 *      the failed-status / null-lock / legacy-null checks; all other guards apply.
 *   1. ACQUIRE THE JOB LOCK FIRST (failed→running + own lock value, fenced).
 *      NO story/script write happens before this lock is held.
 *   2. Ep2 outro persist WITH normalization PERSISTED, via the REAL production
 *      persist path (persistBelleRepair): script + raw_script + outro_text all
 *      receive the normalized AFTER text; audit appended via
 *      applyBelleRepairAudit; pins embedded via setPendingPinResync and
 *      drained to Ep3's continuity_pins_used; stale outro audio nulled via
 *      belleRepairAudioInvalidation; exact-URL delete intent embedded via
 *      setPendingAudioDelete. CAS-conditioned on the pre-repair snapshot.
 *   3. Ep1 EXECUTES (in scope — never a warning): P5 must PASS on the live
 *      text (performance regen only, NO text rewrite); its divergent
 *      production-consumed raw copy (script_json.raw_script) is synced to
 *      the validated script text; BOTH dependent pins (Ep2→Ep1, Ep3→Ep1)
 *      are re-derived from the current Ep1 script via the real
 *      continuityPin method and repaired; the recovery is recorded in
 *      belle_repair_audit (append, history intact). Ep1's stale
 *      outro_with_music URL rides as an audio-delete intent (CAS
 *      script_json-only write). Ep3 text untouched.
 *   5. FINAL VERIFICATION (fail-closed): all three continuity links
 *      (Ep2→Ep1, Ep3→Ep1, Ep3→Ep2) are re-read and must match the final
 *      scripts before success is reported — any mismatch is a reported
 *      failure, never a success claim.
 *   4. REAL HANDOFF through runPrePackagingRecoveryWithContinuation (same-job
 *      continuation to series_generate_belle_assets, Ep1+Ep2 stage resets,
 *      lock held until cleanup completes, release strictly after). Final
 *      state is queued@series_generate_belle_assets — never a return to failed.
 */

import { createClient } from '@supabase/supabase-js'
import { hashScript, buildContinuityPins, verifyContinuityPins } from '../lib/continuityPin'
import {
  hasCompanionPresence,
  buildBelleRepairAuditEntry,
  applyBelleRepairAudit,
  resyncContinuityPinsAfterRepair,
  belleRepairAudioInvalidation,
} from '../lib/belleValidation'
import {
  PRE_PACKAGING_CONTINUATION_STEP,
  casUpdateStory,
  recoverStrandedContinuationCleanup,
  releasePrePackagingContinuationLock,
  getPendingPinResync,
  getPendingAudioDelete,
  setPendingPinResync,
  setPendingAudioDelete,
  unionPendingAudioDeletes,
  persistBelleRepair,
  drainPendingPinResync,
} from '../lib/belleRepairPersist'
import { runPrePackagingRecoveryWithContinuation } from '../lib/belleRepairPersist'
import { ownedJobFence } from '../lib/jobLockGuard'

// ---------------------------------------------------------------------------
// Canonical identifiers (full UUIDs — never prefixes)
// ---------------------------------------------------------------------------
export const CREEK_JOB_ID = 'f02896f1-6af4-4159-88b9-cd97664f0e31'
export const CREEK_SERIES_ID = '966e766f-cfac-448a-aa4b-82c9107d7293'
export const CREEK_EP1_ID = 'f7bf1126-6ad0-47f6-9e83-a82a99608df8'
export const CREEK_EP2_ID = 'a10d725a-6e6a-4885-a854-5c4730a5d1e4'
export const CREEK_EP3_ID = 'd381caca-a186-4deb-9a73-a2adac611637'
export const FAILED_STEP = 'complete_story_package'
export const LOCK_ID = 'creek-legacy-recovery'
export const EP1_RAW_SYNC_ACTION = 'creek_legacy_ep1_raw_sync'
export const EP1_PIN_REPAIR_ACTION = 'creek_legacy_ep1_pin_repair'
/** Known live condition 2026-10-22: stale Ep1 pin legs vs live Ep1 script. */
export const EP1_STALE_PIN_PREFIX = 'abefa7c8'
export const EP1_LIVE_PIN_PREFIX = '791664c4'

/** Unwrap .single() results defensively (real QueryBuilder may return a row or [row]). */
export const one = (d: any): any => (Array.isArray(d) ? d[0] : d)

// ---------------------------------------------------------------------------
// Ep2 outro before/after.
// BEFORE = live stories.outro_text + script tail (verified read-only).
// AFTER_RAW = reviewed repair copy (production_jobs.error_json.detail.
// validationOutroText, 2026-10-22T18:46:22Z — passes CURRENT P5
// hasCompanionPresence via listener-as-co-participant markers).
// AFTER = AFTER_RAW with spoken numerals PERSISTED ("Episode 3" →
// "Episode Three", matching the Ep1 C8 precedent "spoken Episode two").
// The SAME AFTER string is persisted (script + raw_script + outro_text)
// and dispatched as the generation payload.
// ---------------------------------------------------------------------------
// Byte shape verified read-only against the live rows 2026-10-22: straight
// ASCII apostrophes throughout, em-dash U+2014 as the only non-ASCII
// codepoint. The BEFORE string occurs EXACTLY ONCE in the live Ep2 script
// (with a "BELLE B: " prefix); any deviation aborts (unknown state).
export const EP2_OUTRO_BEFORE =
  'Blythe has the photographs, Earl has the notebook, and someone has ' +
  "left a warning on her windshield. In the final episode, she'll have " +
  'to decide how far she\u0027s willing to go \u2014 and whether Graham\u0027s ' +
  'death was really an accident.'

export const EP2_OUTRO_AFTER_RAW =
  'Earl didn\u0027t want to open that door, and now you know why. Blythe is ' +
  'holding photographs she wasn\u0027t supposed to find, and someone made ' +
  'sure she knows it. That warning on her windshield changes everything ' +
  '\u2014 because it means someone is still watching. Sit with that for a ' +
  'moment. Episode 3, "What the Creek Knew," is where it all comes due.'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Normalize spoken episode numerals before TTS generation AND persistence.
 * "Episode 3" → "Episode Three" so the narrator speaks the word, not the
 * digit. Named function + exact-match tested. The normalized form is what
 * is BOTH persisted (script + raw_script + outro_text) and dispatched.
 */
export const SPOKEN_NUMERALS: Record<number, string> = {
  1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
}
export function normalizeSpokenNumerals(text: string): string {
  return String(text).replace(/\b[Ee]pisode\s+(\d{1,2})\b/g, (m, d) => {
    const word = SPOKEN_NUMERALS[Number(d)]
    const prefix = m.startsWith('e') ? 'episode' : 'Episode'
    return word ? `${prefix} ${word}` : m
  })
}

/** Persisted + dispatched Ep2 outro (normalization APPLIED, not logged). */
export const EP2_OUTRO_AFTER: string = normalizeSpokenNumerals(EP2_OUTRO_AFTER_RAW)

/** Generation payload for the Ep2 outro performance — identical to the persisted text. */
export function ep2OutroGenerationPayload(): string {
  return EP2_OUTRO_AFTER
}

export function ep2StateOf(script: string): 'before' | 'after' | 'unknown' {
  const s = String(script ?? '')
  const hasAfter = s.includes(EP2_OUTRO_AFTER)
  const hasBefore = s.includes(EP2_OUTRO_BEFORE)
  if (hasAfter && !hasBefore) return 'after'
  if (hasBefore && !hasAfter) return 'before'
  return 'unknown'
}

/**
 * Pure preflight evaluator over already-fetched rows. Zero writes by
 * construction (no client arg). Accepts failed@complete_story_package OR
 * own-lock-held rows (resume waiver); every other guard still applies.
 */
/**
 * Pure Ep1-repair planner over already-fetched rows. Derives the wanted
 * Ep2→Ep1 / Ep3→Ep1 pin from the verified current Ep1 script via the
 * REAL continuityPin method (buildContinuityPins — the same builder the
 * generation path uses), and flags the divergent production-consumed raw
 * copy (script_json.raw_script). Zero writes by construction.
 */
export function ep1PinRepairPlan({ ep1, ep2, ep3 }: { ep1: any; ep2: any; ep3: any }): {
  needed: boolean
  wantPinHash: string
  staleOn: string[]
  rawDivergent: boolean
} {
  const derived = buildContinuityPins([{ id: CREEK_EP1_ID, script: String(ep1?.script ?? '') }])
  const wantPinHash = String(derived[CREEK_EP1_ID] ?? hashScript(ep1?.script))
  const ep2Pins = (ep2?.script_json?.series_generation?.continuity_pins_used ?? {}) as Record<string, string>
  const ep3Pins = (ep3?.script_json?.series_generation?.continuity_pins_used ?? {}) as Record<string, string>
  const staleOn: string[] = []
  if (ep2Pins[CREEK_EP1_ID] !== wantPinHash) staleOn.push(CREEK_EP2_ID)
  if (ep3Pins[CREEK_EP1_ID] !== wantPinHash) staleOn.push(CREEK_EP3_ID)
  const rawDivergent = String(ep1?.script_json?.raw_script ?? '') !== String(ep1?.script ?? '')
  return { needed: staleOn.length > 0 || rawDivergent, wantPinHash, staleOn, rawDivergent }
}

/**
 * Final three-link verification (fail-closed gate): Ep2→Ep1, Ep3→Ep1,
 * Ep3→Ep2 must ALL match the final scripts. ANY mismatch → ok:false.
 *
 * GUARD (fail-closed on missing evidence): verifyContinuityPins alone
 * accepts [] (zero legs checked = zero mismatches) and treats absent pins
 * as warn-only — so the presence requirements below MUST run first. A read
 * with no rows, a subset of the three episodes, an empty script, or a
 * missing pin leg can NEVER verify; each refuses with ok:false.
 * Pure over already-fetched episode rows (each carries id, script,
 * script_json, episode_number).
 */
export function checkFinalContinuity(episodes: any[]): {
  ok: boolean
  mismatches: string[]
} {
  const eps = episodes ?? []
  const byId: Record<string, any> = {}
  for (const s of eps) {
    if (s) byId[String(s.id)] = s
  }
  const expected = [CREEK_EP1_ID, CREEK_EP2_ID, CREEK_EP3_ID]
  const missing: string[] = []
  // 1. The read must contain EXACTLY the three expected episodes.
  for (const id of expected) {
    if (!byId[id]) missing.push(`missing episode row ${String(id).slice(0, 8)}… — refusing blind success`)
  }
  if (eps.length !== expected.length) {
    missing.push(`expected exactly 3 episode rows, found ${eps.length} — refusing blind success`)
  }
  // 2. Every episode must carry a nonempty script (hash input must exist).
  for (const id of expected) {
    const s = byId[id]
    if (s && String(s.script ?? '').length === 0) {
      missing.push(`empty script on ${String(id).slice(0, 8)}… — refusing blind success`)
    }
  }
  // 3. All three pin legs must be PRESENT (absent ≠ matching).
  const pinsOf = (ep: any): Record<string, string> =>
    (ep?.script_json?.series_generation?.continuity_pins_used ?? {}) as Record<string, string>
  const legs: Array<[string, string, string]> = [
    [CREEK_EP2_ID, CREEK_EP1_ID, 'Ep2→Ep1'],
    [CREEK_EP3_ID, CREEK_EP1_ID, 'Ep3→Ep1'],
    [CREEK_EP3_ID, CREEK_EP2_ID, 'Ep3→Ep2'],
  ]
  for (const [dep, prior, label] of legs) {
    if (byId[dep] && !String(pinsOf(byId[dep])[prior] ?? '')) {
      missing.push(`missing pin link ${label} — refusing blind success`)
    }
  }
  if (missing.length > 0) return { ok: false, mismatches: missing }
  const res = verifyContinuityPins(eps)
  const mismatches = (res.mismatches ?? []).map(
    (m: any) => `ep${m.episodeNumber} ${String(m.priorStoryId).slice(0, 8)}…: pinned ${String(m.expectedHash).slice(0, 8)}… vs live ${String(m.actualHash).slice(0, 8)}…`,
  )
  return { ok: res.ok && mismatches.length === 0, mismatches }
}

/**
 * Fail-closed final-read wrapper: a FAILED read is never evidence of
 * success. Every final verification site must go through here — never
 * `checkFinalContinuity(rows ?? [])` directly on a fallible read.
 */
export function finalContinuityFromRead(read: { data: any; error: any }): {
  ok: boolean
  mismatches: string[]
} {
  if (read?.error) {
    const msg = (read.error as any)?.message ?? String(read.error)
    return { ok: false, mismatches: [`final read failed (${msg}) — refusing blind success`] }
  }
  if (!read?.data) {
    return { ok: false, mismatches: ['final read returned no rows — refusing blind success'] }
  }
  return checkFinalContinuity(read.data)
}

export function evaluatePreflight({ job, stories }: { job: any; stories: any[] }): {
  ok: boolean
  failures: string[]
  resumed: boolean
  warnings: string[]
  ep1RepairNeeded: boolean
} {
  const failures: string[] = []
  if (!job || job.id !== CREEK_JOB_ID) failures.push(`job id mismatch: ${job?.id}`)
  const resumed = job?.locked_by === LOCK_ID && job?.status === 'running'
  if (!resumed) {
    if (job?.status !== 'failed') failures.push(`job status is ${job?.status}, expected failed`)
    if ((job?.failed_step ?? job?.current_step ?? job?.step) !== FAILED_STEP) {
      failures.push(`job not at ${FAILED_STEP}: ${job?.failed_step ?? job?.current_step ?? job?.step}`)
    }
    if (job?.locked_by != null || job?.claimed_by != null) {
      failures.push('job lock is held by another worker; refusing to collide')
    }
  }
  const eps = stories ?? []
  if (eps.length !== 3) failures.push(`expected 3 episode stories, found ${eps.length}`)
  const byId: Record<string, any> = {}
  for (const s of eps) byId[String(s.id)] = s
  for (const id of [CREEK_EP1_ID, CREEK_EP2_ID, CREEK_EP3_ID]) {
    if (!byId[id]) failures.push(`missing story row ${id}`)
  }
  if (failures.length > 0) return { ok: false, failures, resumed, warnings: [], ep1RepairNeeded: false }
  const ep1 = byId[CREEK_EP1_ID]; const ep2 = byId[CREEK_EP2_ID]; const ep3 = byId[CREEK_EP3_ID]
  // Ep1 pin drift is IN SCOPE and EXECUTES (step 3): live 2026-10-22 shows
  // Ep2→Ep1 / Ep3→Ep1 pins (abefa7c8…) stale vs the live Ep1 script hash
  // (791664c4…, script_updated_at 18:02:26Z post-dates the C8 pin write),
  // plus a divergent Ep1 raw copy. Stale legs never gate preflight (they
  // are the repair target); they are reported here and repaired under the
  // held lock via ep1PinRepairPlan — never left as a warning.
  const plan = ep1PinRepairPlan({ ep1, ep2, ep3 })
  const warnings: string[] = []
  for (const id of plan.staleOn) warnings.push(`ep1 pin stale on ${String(id).slice(0, 8)}… (in-scope: re-derive from current ep1 script in step 3)`)
  if (plan.rawDivergent) warnings.push('ep1 raw_script divergent from validated script (in-scope: sync in step 3)')
  // Ep2 must be exactly BEFORE or exactly AFTER (never anything else).
  const st = ep2StateOf(ep2.script)
  const ep3LivePins = (ep3.script_json?.series_generation?.continuity_pins_used ?? {}) as Record<string, string>
  if (st === 'unknown') failures.push('ep2 script is neither BEFORE nor AFTER text — refusing blind write')
  if (st === 'before' && ep3LivePins[CREEK_EP2_ID] !== hashScript(ep2.script)) {
    failures.push('ep3→ep2 pin inconsistent with live pre-repair ep2 script')
  }
  if (st === 'after' && ep3LivePins[CREEK_EP2_ID] !== hashScript(ep2.script)) {
    // Post-repair: the pin must equal the hash of the full persisted script —
    // UNLESS a crash interrupted the drain: a non-empty pending_pin_resync
    // list on Ep2 resolving to exactly this hash is the durable record of
    // an unfinished drain (step 2 converges it). Anything else is corruption.
    const postHash = hashScript(ep2.script)
    const leftover = getPendingPinResync(ep2.script_json, CREEK_EP2_ID)
    const resolves = leftover.some((e) =>
      String(e.dependentStoryId) === CREEK_EP3_ID
      && String(e.priorStoryId) === CREEK_EP2_ID
      && String(e.newPinHash) === postHash,
    )
    if (!resolves) failures.push('ep3→ep2 pin inconsistent with persisted post-repair ep2 script (no resolving pending entry)')
  }
  // Ep1 outro must pass CURRENT P5 (regen-only, no text rewrite authorized).
  const ep1Outro = String(ep1.outro_text ?? '')
  if (!hasCompanionPresence(ep1Outro)) failures.push('ep1 outro fails P5 — no blind rewrite authorized')
  if (!hasCompanionPresence(EP2_OUTRO_AFTER)) failures.push('Ep2 AFTER copy fails P5 — refusing to persist')
  return { ok: failures.length === 0, failures, resumed, warnings, ep1RepairNeeded: plan.needed }
}

// ---------------------------------------------------------------------------
// Ordered guarded run
// ---------------------------------------------------------------------------
export async function runRecovery(
  supabase: any,
  { execute = false, log = console.log }: { execute?: boolean; log?: (...a: any[]) => void } = {},
): Promise<{ ok: boolean; phase?: string; failures?: string[]; writes: string[]; generationPayload?: string; continued?: boolean }> {
  const writes: string[] = []
  const fence = async (label: string, doWrite: () => Promise<any>, verify: () => Promise<boolean>) => {
    if (!execute) { log(`[dry-run] would ${label}`); return null }
    const res = await doWrite()
    writes.push(label)
    if (!(await verify())) {
      throw new Error(`READ-AFTER-WRITE FAILED: ${label}. Pending intents intact; aborting.`)
    }
    log(`[ok] ${label} (fenced + verified)`)
    return res
  }

  // STEP 0 — preflight re-verification reads (always run, even in dry-run).
  const { data: _job } = await supabase.from('production_jobs').select('*').eq('id', CREEK_JOB_ID).single()
  const liveJob = one(_job)
  const { data: stories, error: storiesError } = await supabase.from('stories').select('*').eq('series_id', CREEK_SERIES_ID).order('episode_number')
  // Terminal continuation already reached: converge with zero writes —
  // but success is still gated on the final three-link verification.
  if (liveJob?.current_step === PRE_PACKAGING_CONTINUATION_STEP && liveJob?.status === 'queued' && liveJob?.locked_by == null) {
    log('[converged] job already queued@series_generate_belle_assets — zero writes')
    const finCheck = finalContinuityFromRead({ data: stories, error: storiesError })
    if (!finCheck.ok) {
      log('[FAIL] final three-link verification mismatch — no success claimed:')
      for (const m of finCheck.mismatches) log(`  - ${m}`)
      return { ok: false, phase: 'final-verification', failures: finCheck.mismatches, writes }
    }
    log('[ok] final verification: Ep2→Ep1, Ep3→Ep1, Ep3→Ep2 all match final scripts')
    return { ok: true, writes, generationPayload: ep2OutroGenerationPayload(), continued: true }
  }
  const pre = evaluatePreflight({ job: liveJob, stories })
  if (!pre.ok) {
    log('[ABORT] preflight mismatch — zero writes performed:')
    for (const f of pre.failures) log(`  - ${f}`)
    return { ok: false, phase: 'preflight', failures: pre.failures, writes }
  }
  if (pre.resumed) log('[info] resume mode: own lock held — converging, skipping verified steps (no duplicate paid calls)')
  else log('[ok] preflight: full UUIDs, nested sg paths, pin cross-checks, P5 on AFTER — all green')
  for (const w of pre.warnings ?? []) log(`[warn] ${w}`)

  const byId: Record<string, any> = {}
  for (const s of stories) byId[String(s.id)] = s
  const ep1 = byId[CREEK_EP1_ID]; const ep2 = byId[CREEK_EP2_ID]; const ep3 = byId[CREEK_EP3_ID]

  // STEP 1 — ACQUIRE THE JOB LOCK FIRST. No story/script write before this.
  let lockedAt: string | null = null
  if (liveJob.locked_by === LOCK_ID && liveJob.status === 'running') {
    lockedAt = liveJob.locked_at ?? null
    log('[converged] own lock already held — adopting (resume waiver)')
  } else {
    lockedAt = new Date().toISOString()
    await fence(
      'claim job lock (failed→running + own lock, fenced)',
      async () => {
        // Affected-row checked like every reviewed fenced write: zero rows
        // = lock lost / raced (fail-closed before any story mutation).
        const { data, error } = await supabase.from('production_jobs').update({
          status: 'running', locked_at: lockedAt, locked_by: LOCK_ID,
        }).eq('id', CREEK_JOB_ID).eq('status', 'failed').select('id')
        if (error) throw new Error(`claim write failed: ${error.message}`)
        if (!data || data.length === 0) throw new Error('claim matched zero rows (lock lost or raced) — no story writes performed')
        return data
      },
      async () => {
        const { data: _d } = await supabase.from('production_jobs').select('status,locked_by').eq('id', CREEK_JOB_ID).single()
        const d = one(_d)
        return d?.status === 'running' && d?.locked_by === LOCK_ID
      },
    )
  }
  if (!execute) {
    log(`[info] ep2 generation payload (normalized, persisted + dispatched identically): ${JSON.stringify(ep2OutroGenerationPayload())}`)
    return { ok: true, writes, generationPayload: ep2OutroGenerationPayload(), continued: false }
  }
  // In-memory owned job ref for every subsequent fenced mutation.
  const ownedJob: any = {
    ...(liveJob as object),
    id: CREEK_JOB_ID,
    status: 'running',
    locked_at: lockedAt,
    locked_by: LOCK_ID,
  }

  // STEP 2 — Ep2 outro persist WITH normalization PERSISTED, through the REAL
  // production persist path (same storyUpdates shape the route builds).
  const ep2LiveState = ep2StateOf(ep2.script)
  const afterScript = String(ep2.script).includes(EP2_OUTRO_BEFORE)
    ? String(ep2.script).replace(EP2_OUTRO_BEFORE, EP2_OUTRO_AFTER)
    : String(ep2.script)
  const afterRaw = String(ep2.script_json?.raw_script ?? '').includes(EP2_OUTRO_BEFORE)
    ? String(ep2.script_json?.raw_script ?? '').replace(EP2_OUTRO_BEFORE, EP2_OUTRO_AFTER)
    : String(ep2.script_json?.raw_script ?? '')
  const ep2TextConverged =
    ep2LiveState === 'after' &&
    ep2.outro_text === EP2_OUTRO_AFTER &&
    !String(ep2.script_json?.raw_script ?? '').includes(EP2_OUTRO_BEFORE) &&
    String(ep2.script_json?.raw_script ?? '').includes(EP2_OUTRO_AFTER)
  if (!ep2TextConverged) {
    if (ep2LiveState !== 'before') throw new Error('Ep2 BEFORE string not found exactly once in live script — refusing blind write')
    if (String(ep2.script).split(EP2_OUTRO_BEFORE).length !== 2) throw new Error('Ep2 BEFORE string is not unique in live script — refusing blind write')
    const auditEntry = buildBelleRepairAuditEntry({
      action: 'creek_legacy_outro_repair',
      jobId: CREEK_JOB_ID,
      storyId: CREEK_EP2_ID,
      episodeNumber: 2,
      beforeScript: String(ep2.script),
      afterScript,
      repairedIntro: false,
      repairedOutro: true,
    })
    const afterHash = auditEntry.afterHash
    // Fresh series rows for the real pin-resync helper (stale pins only).
    const { data: pinRows } = await supabase.from('stories').select('id,script_json').eq('series_id', CREEK_SERIES_ID)
    const pendingEntries = resyncContinuityPinsAfterRepair(pinRows ?? [], CREEK_EP2_ID, afterHash)
      .map((u) => ({
        dependentStoryId: String(u.id),
        priorStoryId: CREEK_EP2_ID,
        newPinHash: String(afterHash),
      }))
    const repairedScriptJson = {
      ...applyBelleRepairAudit(ep2.script_json, auditEntry),
      raw_script: afterRaw,
    }
    const storyUpdates: Record<string, unknown> = {
      script: afterScript,
      script_json: setPendingPinResync(repairedScriptJson, pendingEntries),
      ...belleRepairAudioInvalidation(false, true),
      outro_text: EP2_OUTRO_AFTER,
    }
    const audioIntent = [
      String(ep2.outro_audio_url ?? ''),
      String(ep2.outro_with_music_url ?? ''),
    ].filter((u) => u.length > 0)
    await fence(
      'ep2 outro persist (normalized AFTER in script + raw_script + outro_text, audit appended, pins embedded, audio nulled, intent embedded)',
      () => persistBelleRepair(supabase, {
        repairedStoryId: CREEK_EP2_ID,
        storyUpdates,
        pendingEntries,
        expectedRepairedScriptJson: ep2.script_json,
        pendingAudioDeleteUrls: audioIntent,
      }),
      async () => {
        const { data: _d } = await supabase.from('stories').select('script,outro_text,script_json').eq('id', CREEK_EP2_ID).single()
        const d = one(_d)
        return d?.script === afterScript
          && d?.outro_text === EP2_OUTRO_AFTER
          && String(d?.script_json?.raw_script ?? '') === afterRaw
          && Array.isArray(d?.script_json?.series_generation?.belle_repair_audit)
          && (d?.script_json?.series_generation?.belle_repair_audit as any[]).some((e: any) => e?.jobId === CREEK_JOB_ID)
      },
    )
  } else {
    log('[converged] ep2 normalized AFTER already persisted in script + raw_script + outro_text — skipping (no duplicate write)')
  }
  // Pin-drain convergence: a crash between persist and drain leaves the
  // pending list behind — drain it explicitly (idempotent set-to-same).
  {
    const { data: _c } = await supabase.from('stories').select('id,script_json').eq('id', CREEK_EP2_ID).single()
    const carrier = one(_c)
    const leftover = getPendingPinResync(carrier?.script_json, CREEK_EP2_ID)
    if (leftover.length > 0) {
      await fence(
        'ep2 leftover pin-drain converge',
        () => drainPendingPinResync(supabase, CREEK_EP2_ID, leftover),
        async () => {
          const { data: _v } = await supabase.from('stories').select('script_json').eq('id', CREEK_EP2_ID).single()
          return getPendingPinResync(one(_v)?.script_json, CREEK_EP2_ID).length === 0
        },
      )
    }
    const { data: _e3 } = await supabase.from('stories').select('script_json').eq('id', CREEK_EP3_ID).single()
    const e3pins = (one(_e3)?.script_json?.series_generation?.continuity_pins_used ?? {}) as Record<string, string>
    const wantHash = hashScript(afterScript)
    if (e3pins[CREEK_EP2_ID] !== wantHash) {
      await fence(
        'ep3 continuity_pins_used converge (Ep3→Ep2 = post-repair hash)',
        () => drainPendingPinResync(supabase, CREEK_EP2_ID, [{
          dependentStoryId: CREEK_EP3_ID,
          priorStoryId: CREEK_EP2_ID,
          newPinHash: wantHash,
        }]),
        async () => {
          const { data: _v3 } = await supabase.from('stories').select('script_json').eq('id', CREEK_EP3_ID).single()
          return (one(_v3)?.script_json?.series_generation?.continuity_pins_used ?? {})[CREEK_EP2_ID] === wantHash
        },
      )
    } else {
      log('[converged] ep3 continuity_pins_used already at post-repair hash — skipping')
    }
  }
  log(`[info] ep2 generation payload: ${JSON.stringify(ep2OutroGenerationPayload())} (identical to persisted outro_text; paid TTS runs on later Belle-generation ticks)`)

  // STEP 3 — Ep1 EXECUTES (in scope, never a warning): P5 passes on the
  // live text (verified in preflight) → regen performance only, NO text
  // rewrite. The validated script text is preserved exactly; its divergent
  // production-consumed raw copy is synced; BOTH dependent pins (Ep2→Ep1,
  // Ep3→Ep1) are re-derived from the current Ep1 script via the real
  // continuityPin method; the recovery is recorded in belle_repair_audit
  // (append, history intact). Each write is fenced + read-after-write
  // verified; every branch converge-checks first (crash-restart safe).
  // 3a — Ep1 raw sync: production-consumed raw_script := validated script.
  {
    const { data: _r1 } = await supabase.from('stories').select('id,script,script_json').eq('id', CREEK_EP1_ID).single()
    const r1 = one(_r1)
    if (String(r1?.script_json?.raw_script ?? '') === String(r1?.script ?? '')) {
      log('[converged] ep1 raw_script already synced to validated script — skipping')
    } else {
      const snapshot = r1?.script_json
      const auditEntry = buildBelleRepairAuditEntry({
        action: EP1_RAW_SYNC_ACTION,
        jobId: CREEK_JOB_ID,
        storyId: CREEK_EP1_ID,
        episodeNumber: 1,
        beforeScript: String(r1?.script_json?.raw_script ?? ''),
        afterScript: String(r1?.script ?? ''),
        repairedIntro: false,
        repairedOutro: false,
      })
      const next = applyBelleRepairAudit({ ...(snapshot ?? {}), raw_script: String(r1?.script ?? '') }, auditEntry)
      await fence(
        'ep1 raw_script sync to validated script (audit appended, history intact)',
        async () => {
          // LARGE-DOC-CAS: server-side compare (body params, no URL filter).
          try {
            await casUpdateStory(supabase, { storyId: CREEK_EP1_ID, expected: snapshot, updates: { script_json: next } })
          } catch (e) {
            throw new Error(`ep1 raw sync write failed: ${(e as Error).message}`)
          }
          return { id: CREEK_EP1_ID }
        },
        async () => {
          const { data: _v } = await supabase.from('stories').select('script,script_json').eq('id', CREEK_EP1_ID).single()
          const v = one(_v)
          return String(v?.script_json?.raw_script ?? '') === String(v?.script ?? '')
            && Array.isArray(v?.script_json?.series_generation?.belle_repair_audit)
            && (v?.script_json?.series_generation?.belle_repair_audit as any[]).some((e: any) => e?.jobId === CREEK_JOB_ID && e?.action === EP1_RAW_SYNC_ACTION)
        },
      )
    }
  }
  // 3b — Ep1 pin re-derivation: Ep2→Ep1 + Ep3→Ep1 := current Ep1 hash.
  for (const depId of [CREEK_EP2_ID, CREEK_EP3_ID]) {
    const { data: _e1 } = await supabase.from('stories').select('id,script').eq('id', CREEK_EP1_ID).single()
    const e1 = one(_e1)
    const derived = buildContinuityPins([{ id: CREEK_EP1_ID, script: String(e1?.script ?? '') }])
    const want = String(derived[CREEK_EP1_ID] ?? hashScript(e1?.script))
    const { data: _dep } = await supabase.from('stories').select('id,script,script_json').eq('id', depId).single()
    const dep = one(_dep)
    const have = String((dep?.script_json?.series_generation?.continuity_pins_used ?? {})[CREEK_EP1_ID] ?? '')
    if (have === want) {
      log(`[converged] ${String(depId).slice(0, 8)}…→ep1 pin already at current ep1 hash — skipping`)
      continue
    }
    const snapshot = dep?.script_json
    const fixed = resyncContinuityPinsAfterRepair([{ id: depId, script_json: snapshot }], CREEK_EP1_ID, want)
    if (fixed.length === 0) throw new Error(`pin resync produced no update for ${String(depId).slice(0, 8)}… (expected stale leg) — refusing blind write`)
    const auditEntry = buildBelleRepairAuditEntry({
      action: EP1_PIN_REPAIR_ACTION,
      jobId: CREEK_JOB_ID,
      storyId: String(depId),
      episodeNumber: String(depId) === CREEK_EP2_ID ? 2 : 3,
      beforeScript: String(dep?.script ?? ''),
      afterScript: String(dep?.script ?? ''),
      repairedIntro: false,
      repairedOutro: false,
    })
    const next = applyBelleRepairAudit(fixed[0].script_json, auditEntry)
    await fence(
      `${String(depId).slice(0, 8)}…→ep1 pin re-derived from current ep1 script (audit appended)`,
      async () => {
        // LARGE-DOC-CAS: server-side compare (body params, no URL filter).
        try {
          await casUpdateStory(supabase, { storyId: String(depId), expected: snapshot, updates: { script_json: next } })
        } catch (e) {
          throw new Error(`ep1 pin repair write failed: ${(e as Error).message}`)
        }
        return { id: String(depId) }
      },
      async () => {
        const { data: _v } = await supabase.from('stories').select('script_json').eq('id', depId).single()
        const v = one(_v)
        return String((v?.script_json?.series_generation?.continuity_pins_used ?? {})[CREEK_EP1_ID] ?? '') === want
          && Array.isArray(v?.script_json?.series_generation?.belle_repair_audit)
          && (v?.script_json?.series_generation?.belle_repair_audit as any[]).some((e: any) => e?.jobId === CREEK_JOB_ID && e?.action === EP1_PIN_REPAIR_ACTION)
      },
    )
  }
  // 3c — Ep1 stale outro_with_music URL rides as an audio-delete intent
  // (CAS script_json-only write, nested path). Text never rewritten.
  {
    const { data: _f1 } = await supabase.from('stories').select('id,script_json,outro_with_music_url').eq('id', CREEK_EP1_ID).single()
    const f1 = one(_f1)
    const staleUrl = String(f1?.outro_with_music_url ?? '')
    if (!staleUrl) {
      log('[converged] ep1 outro_with_music already gone — no intent needed')
    } else {
      const have = getPendingAudioDelete(f1?.script_json, CREEK_EP1_ID)
      if (have.includes(staleUrl)) {
        log('[converged] ep1 audio-delete intent already present — skipping')
      } else {
        const snapshot = f1?.script_json
        const next = setPendingAudioDelete(snapshot, unionPendingAudioDeletes(have, [staleUrl]))
        await fence(
          'ep1 stale-outro audio-delete intent (nested sg path, CAS-guarded)',
          async () => {
            // LARGE-DOC-CAS: server-side compare (body params, no URL filter).
            try {
              await casUpdateStory(supabase, { storyId: CREEK_EP1_ID, expected: snapshot, updates: { script_json: next } })
            } catch (e) {
              throw new Error(`ep1 intent write failed: ${(e as Error).message}`)
            }
            return { id: CREEK_EP1_ID }
          },
          async () => {
            const { data: _v1 } = await supabase.from('stories').select('script_json').eq('id', CREEK_EP1_ID).single()
            return getPendingAudioDelete(one(_v1)?.script_json, CREEK_EP1_ID).includes(staleUrl)
          },
        )
      }
    }
  }

  // STEP 4 — REAL HANDOFF through the reviewed P5 recovery machinery:
  // same-job continuation to series_generate_belle_assets (Ep1+Ep2 stage
  // resets, Ep3 untouched), lock held until cleanup completes, release
  // strictly after. Final state: queued@continuation — never failed.
  {
    const { data: _j } = await supabase.from('production_jobs').select('*').eq('id', CREEK_JOB_ID).single()
    const freshJob = one(_j)
    if (freshJob?.current_step === PRE_PACKAGING_CONTINUATION_STEP && freshJob?.status === 'queued' && freshJob?.locked_by == null) {
      log('[converged] continuation already released — zero further writes')
      const { data: _rel3, error: _rel3Err } = await supabase.from('stories').select('id,script,script_json,episode_number').eq('series_id', CREEK_SERIES_ID)
      const relCheck = finalContinuityFromRead({ data: _rel3, error: _rel3Err })
      if (!relCheck.ok) {
        log('[FAIL] final three-link verification mismatch — no success claimed:')
        for (const m of relCheck.mismatches) log(`  - ${m}`)
        return { ok: false, phase: 'final-verification', failures: relCheck.mismatches, writes }
      }
      log('[ok] final verification: Ep2→Ep1, Ep3→Ep1, Ep3→Ep2 all match final scripts')
      return { ok: true, writes, generationPayload: ep2OutroGenerationPayload(), continued: true }
    }
    if (!(freshJob?.locked_by === LOCK_ID && freshJob?.status === 'running')) {
      throw new Error('job lock not held by us at handoff — refusing unfenced continuation (lock lost?)')
    }
    Object.assign(ownedJob, freshJob, { status: 'running', locked_by: LOCK_ID, locked_at: lockedAt })
    // Crash window: the continuation persisted (current_step moved, lock
    // still held) but cleanup/release never ran. Finish through the
    // reviewed stranded-cleanup guard (certified-only, storage-free) and
    // the fenced release — never re-persist, never package.
    // Production-identical carrier seed: this job's story_id is null and its
    // state carries no storyId, so the route would pass '' here too — the
    // reviewed series-scoped scan then discovers BOTH audio carriers (Ep1 +
    // Ep2; Ep3 carries no intent and stays untouched).
    const failingStoryId = String(
      (freshJob as any)?.story_id ?? (freshJob as any)?.state_json?.storyId ?? '',
    )
    // Fail-closed discovery loader: a FAILED read is never an empty
    // series. Throw with the lock held (same style as the other mid-run
    // guards) — never hand the reviewed machinery a blind [] that would
    // let cleanup/release "succeed" without ever seeing the rows.
    let cachedSeries: any[] | null = null
    const loadSeriesStories = async () => {
      if (!cachedSeries) {
        const { data: rows, error: rowsErr } = await supabase.from('stories').select('id,script_json,episode_number').eq('series_id', CREEK_SERIES_ID)
        if (rowsErr) throw new Error(`series discovery read failed (${rowsErr.message ?? rowsErr}) — refusing blind handoff`)
        cachedSeries = rows ?? []
      }
      return cachedSeries
    }
    // Fail-fast BEFORE either reviewed call: both the stranded-cleanup
    // guard and the handoff tolerate discovery trouble internally
    // (recovered=false / continued=false), which would let a failed read
    // masquerade as "nothing to do" and still reach the fenced release.
    // One verified read here, memoized for both downstream uses.
    await loadSeriesStories()
    if (freshJob?.current_step === PRE_PACKAGING_CONTINUATION_STEP
      && freshJob?.status === 'running' && freshJob?.locked_by === LOCK_ID) {
      log('[resume] continuation already persisted — certified cleanup + fenced release only')
      const stranded = await recoverStrandedContinuationCleanup(supabase, {
        failingStoryId, loadSeriesStories, job: ownedJob,
      })
      writes.push(`stranded continuation cleanup (recovered=${stranded.recovered})`)
      await fence(
        'release continuation lock (fenced, strictly after cleanup)',
        () => releasePrePackagingContinuationLock(supabase, ownedJob, ownedJobFence(ownedJob, LOCK_ID)),
        async () => {
          const { data: _rel } = await supabase.from('production_jobs').select('status,locked_by').eq('id', CREEK_JOB_ID).single()
          const rel = one(_rel)
          return rel?.status === 'queued' && rel?.locked_by == null
        },
      )
      // Stranded-resume success is still gated on final verification.
      {
        const { data: _s3, error: _s3Err } = await supabase.from('stories').select('id,script,script_json,episode_number').eq('series_id', CREEK_SERIES_ID)
        const sCheck = finalContinuityFromRead({ data: _s3, error: _s3Err })
        if (!sCheck.ok) {
          log('[FAIL] final three-link verification mismatch — no success claimed:')
          for (const m of sCheck.mismatches) log(`  - ${m}`)
          return { ok: false, phase: 'final-verification', failures: sCheck.mismatches, writes }
        }
        log('[ok] final verification: Ep2→Ep1, Ep3→Ep1, Ep3→Ep2 all match final scripts')
      }
      return { ok: true, writes, generationPayload: ep2OutroGenerationPayload(), continued: true }
    }
    const handoff = await runPrePackagingRecoveryWithContinuation(supabase, {
      failingStoryId,
      loadSeriesStories,
      job: ownedJob,
      fence: ownedJobFence(ownedJob, LOCK_ID),
    })
    writes.push('same-job continuation (persist w/ lock held → cleanup → release)')
    if (!handoff.continued) {
      throw new Error('handoff returned continued=false (no audio carriers) — refusing to package same-tick; aborting with lock held')
    }
    log(`[ok] handoff continued=true to ${PRE_PACKAGING_CONTINUATION_STEP}; affected=${JSON.stringify(handoff.affectedKeys)}`)
    const { data: _fin } = await supabase.from('production_jobs').select('status,current_step,locked_by').eq('id', CREEK_JOB_ID).single()
    const fin = one(_fin)
    if (!(fin?.status === 'queued' && fin?.current_step === PRE_PACKAGING_CONTINUATION_STEP && fin?.locked_by == null)) {
      throw new Error(`handoff final state mismatch: ${JSON.stringify(fin)} (expected queued@${PRE_PACKAGING_CONTINUATION_STEP}, lock NULL)`)
    }
  }

  // STEP 5 — FINAL VERIFICATION (fail-closed): re-read all three episodes
  // and require Ep2→Ep1, Ep3→Ep1, Ep3→Ep2 to match the final scripts.
  // Any mismatch is a REPORTED FAILURE — never a success claim.
  {
    const { data: _fin3, error: _fin3Err } = await supabase.from('stories').select('id,script,script_json,episode_number').eq('series_id', CREEK_SERIES_ID)
    const finCheck = finalContinuityFromRead({ data: _fin3, error: _fin3Err })
    if (!finCheck.ok) {
      log('[FAIL] final three-link verification mismatch — no success claimed:')
      for (const m of finCheck.mismatches) log(`  - ${m}`)
      return { ok: false, phase: 'final-verification', failures: finCheck.mismatches, writes }
    }
    log('[ok] final verification: Ep2→Ep1, Ep3→Ep1, Ep3→Ep2 all match final scripts')
  }

  return { ok: true, writes, generationPayload: ep2OutroGenerationPayload(), continued: true }
}

// --- CLI (jest-safe: no import.meta so ts-jest CJS transform can import this module) ---
const isMainEntry = typeof process !== 'undefined' && Array.isArray(process.argv)
  && process.argv[1] != null && /creek-legacy-recovery(\.[mc]?[jt]s)?$/.test(String(process.argv[1]))
  && !(process.env.JEST_WORKER_ID)
if (isMainEntry) {
  const execute = process.argv.includes('--execute')
  // CLI-only env load (never on import: the module performs no I/O when imported).
  const boot = async () => {
    try {
      const dotenv = await import('dotenv')
      dotenv.config({ path: '.env.local' })
    } catch { /* env already provided */ }
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    )
  }
  boot().then(
    (supabase) => runRecovery(supabase, { execute }),
  ).then(
    (r) => { console.log(JSON.stringify({ ...r, execute })); process.exit(r.ok ? 0 : 1) },
    (e) => { console.error('[FATAL]', (e as Error).message); process.exit(1) },
  )
}
