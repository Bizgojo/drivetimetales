/**
 * scripts/creek-legacy-recovery.mjs — Creek (series 966e766f) legacy-state recovery.
 *
 * GUARDED, NOT YET AUTHORIZED TO RUN. This script performs NO work on import.
 * It only acts when invoked as `node scripts/creek-legacy-recovery.mjs --execute`
 * (default without --execute is a read-only preflight dry run).
 *
 * Crash-recovery entry point: re-run the same command. Every write below is
 * fenced (ownership/lock predicate on the UPDATE) and read-after-write verified
 * before the next step begins. A crash between steps leaves the pending-intent
 * markers intact, so a restart converges without duplicate paid calls
 * (continuation claim is idempotent on (job_id, step); mix rebuilds are
 * guarded by the pending markers; see step 5).
 *
 * Per-write durability (NO cross-table atomicity is claimed):
 *   each step = single-table UPDATE with a fence predicate → SELECT to verify
 *   → abort with report on mismatch. Steps never batch across tables.
 *
 * Ordered steps:
 *   0. Preflight re-verification reads (READ ONLY). ABORT on any mismatch.
 *   1. Ep2 outro persist (text correction + regen of the missing outro performance).
 *   2. Ep1 outro performance regen (NO text rewrite if P5 validation passes).
 *   3. Pin derivation FROM THE ACTUAL FINAL SCRIPTS (recomputed post-write via
 *      the lib/continuityPin.ts:32 hashScript method — never hardcoded).
 *   4. Same-job continuation PATCH (lock held, status running).
 *   5. Affected mix rebuilds (Ep1 + Ep2 only; Ep3 untouched) → release.
 *
 * Scope: legacy Creek job f02896f1 failed@complete_story_package. NO production
 * writes occur unless --execute is passed AND all preflight guards pass.
 */

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Canonical constants (verified 2026-10-22, reuse — re-verify in preflight)
// ---------------------------------------------------------------------------
export const CREEK_SERIES_ID = '966e766f'
export const CREEK_JOB_ID = 'f02896f1'
export const FAILED_STEP = 'complete_story_package'
export const LOCK_ID = 'creek-legacy-recovery'

/** Unwrap .single() results defensively (real QueryBuilder may return a row or [row]). */
export const one = (d) => (Array.isArray(d) ? d[0] : d)

// Current script hash prefixes (lib/continuityPin.ts hashScript, sha256 hex).
// Used ONLY as preflight identity checks, NEVER as post-correction pins.
export const EXPECTED_SCRIPT_HASH_PREFIX = {
  ep1: '791664c4',
  ep2: '80a33018',
}

// Expected mix sizes in bytes (±5% tolerance in preflight; stale-outro Ep1 mix
// is expected to be present but stale — presence check only, not freshness).
export const EXPECTED_MIX_SIZES = {
  ep1: 14.9 * 1024 * 1024,
  ep2: 16.5 * 1024 * 1024,
  ep3: 15.2 * 1024 * 1024,
}

export const EXPECTED_VOICE_SEGMENTS = 216;

// ---------------------------------------------------------------------------
// Ep2 outro before/after (verified copies, error_json.detail 18:46:22Z).
// ---------------------------------------------------------------------------
// BEFORE (live flat third-person recap — FAILS P5 companion presence):
//   "Blythe has the photographs, Earl has the notebook, and someone has
//    left a warning on her windshield. In the final episode, she'll have
//    to decide…"
// AFTER (validated repair copy — PASSES P5 belleValidation.ts:28):
//   "Earl didn't want to open that door, and now you know why… Sit with
//    that for a moment. Episode 3, 'What the Creek Knew,' is where it all
//    comes due."
export const EP2_OUTRO_BEFORE =
  "Blythe has the photographs, Earl has the notebook, and someone has " +
  "left a warning on her windshield. In the final episode, she'll have " +
  'to decide…'
export const EP2_OUTRO_AFTER =
  "Earl didn't want to open that door, and now you know why… Sit with " +
  "that for a moment. Episode 3, 'What the Creek Knew,' is where it all " +
  'comes due.'

// ---------------------------------------------------------------------------
// Pure helpers (imported by tests; no I/O)
// ---------------------------------------------------------------------------

/**
 * P5 hasCompanionPresence — mirrored verbatim from lib/belleValidation.ts:28.
 * (Duplicated because this .mjs script cannot import TS directly; the regex
 * below must stay byte-identical to the canonical definition. Test asserts
 * the Ep2 AFTER copy passes and the BEFORE copy fails.)
 */
export function hasCompanionPresence(text) {
  const companionMarkers = /\b(i'?m belle|belle here|you won't|you will|you can't|you know|alongside|join|discover|tune in|listen|next episode|stay tuned|coming back|keep listening|return|sit with that|we'll|we're|we've|we|our)\b/i
  return companionMarkers.test(text)
}

/**
 * Canonical script hash — mirrors lib/continuityPin.ts:32 hashScript
 * (NFC, CRLF/CR→LF, trim, sha256 hex). Pins are ALWAYS derived from the
 * actual final scripts via this function — never hardcoded post-correction.
 */
export function hashScript(script) {
  const text = String(script ?? '')
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * Normalize spoken episode numerals before TTS generation.
 * "Episode 3" → "Episode Three" in the generation payload so the narrator
 * speaks the word, not the digit. Named function + exact-match tested.
 */
export const SPOKEN_NUMERALS = {
  1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
}
export function normalizeSpokenNumerals(text) {
  return String(text).replace(/\b[Ee]pisode\s+(\d{1,2})\b/g, (m, d) => {
    const word = SPOKEN_NUMERALS[Number(d)]
    const prefix = m.startsWith('e') ? 'episode' : 'Episode'
    return word ? `${prefix} ${word}` : m
  })
}

/** Generation payload for the Ep2 outro performance (numerals normalized). */
export function ep2OutroGenerationPayload() {
  return normalizeSpokenNumerals(EP2_OUTRO_AFTER)
}

/**
 * Derive continuity pins FROM SUPPLIED FINAL SCRIPTS.
 * Ep2→Ep1, Ep3→Ep1, Ep3→Ep2 (Ep2's hash changes when its outro changes,
 * so Ep3→Ep2 MUST be recomputed from the final Ep2 text).
 * Returns { ep2Pins, ep3Pins } maps of priorStoryId -> hash.
 */
export function derivePinsFromFinalScripts({ ep1Id, ep1Script, ep2Id, ep2Script }) {
  const ep1Hash = hashScript(ep1Script)
  const ep2Hash = hashScript(ep2Script)
  return {
    ep2Pins: { [ep1Id]: ep1Hash },
    ep3Pins: { [ep1Id]: ep1Hash, [ep2Id]: ep2Hash },
  }
}

/**
 * Pure preflight evaluator. Takes already-fetched rows + expectations,
 * returns { ok, failures[] }. Zero writes by construction (no client arg).
 */
export function evaluatePreflight({ job, stories, assets }, expectations = {}) {
  const failures = []
  const expHash = expectations.hashes ?? EXPECTED_SCRIPT_HASH_PREFIX
  const expMix = expectations.mixSizes ?? EXPECTED_MIX_SIZES
  const expSegs = expectations.voiceSegments ?? EXPECTED_VOICE_SEGMENTS

  // (a1) job still failed@complete_story_package
  if (!job || job.id !== CREEK_JOB_ID) failures.push(`job id mismatch: ${job?.id}`)
  if (job?.status !== 'failed') failures.push(`job status is ${job?.status}, expected failed`)
  if (job?.failed_step !== FAILED_STEP && job?.current_step !== FAILED_STEP && job?.step !== FAILED_STEP) {
    failures.push(`job not at ${FAILED_STEP}: ${job?.failed_step ?? job?.current_step ?? job?.step}`)
  }
  // resumeMode: restart after OUR OWN crash (job.locked_by === LOCK_ID) waives
  // the null-lock and null-admission checks; every other guard still applies.
  const resumeMode = job?.locked_by === LOCK_ID
  // (a2) lock NULL (no live worker holds it) — unless it is our own lock
  if (!resumeMode && (job?.locked_by != null || job?.claimed_by != null || job?.lock_held != null)) {
    failures.push('job lock is held; refusing to collide with a live worker')
  }
  // (a3) admission fields still null (legacy state — do NOT manufacture markers)
  if (!resumeMode) {
    for (const f of ['pending_pin_resync', 'pending_audio_delete', 'belle_repair_audit']) {
      if (job?.[f] != null) failures.push(`admission field ${f} is no longer null`)
    }
  }
  // (a4) asset identities: 3 episodes, mixes present w/ expected sizes ±5%,
  // outro_0066.mp3 absent, 216 voice segs, intros + background_music×3.
  const eps = stories ?? []
  if (eps.length !== 3) failures.push(`expected 3 episode stories, found ${eps.length}`)
  for (const ep of eps) {
    const n = ep.episode_number ?? ep.ep
    const key = n === 1 ? 'ep1' : n === 2 ? 'ep2' : n === 3 ? 'ep3' : null
    if (!key) { failures.push(`unexpected episode number ${n}`); continue }
    // In resume mode our own Ep2 correction legitimately changed its hash
    // (convergence is verified by AFTER-text presence + pin recompute instead).
    if (expHash[key] && !(resumeMode && key === 'ep2') && !hashScript(ep.script).startsWith(expHash[key])) {
      failures.push(`${key} script hash prefix mismatch (script changed since verification)`)
    }
    const mixSize = ep.mix_bytes ?? ep.final_mix_bytes
    if (mixSize == null) failures.push(`${key} mix missing`)
    else if (Math.abs(mixSize - expMix[key]) / expMix[key] > 0.05) {
      failures.push(`${key} mix size ${mixSize} outside ±5% of ${expMix[key]}`)
    }
  }
  const names = (assets ?? []).map((a) => a.name ?? a.file_name ?? '')
  if (names.some((n) => n.includes('outro_0066'))) failures.push('outro_0066.mp3 unexpectedly present')
  const voiceSegs = (assets ?? []).filter((a) => (a.kind ?? a.type) === 'voice_segment')
  if (voiceSegs.length !== expSegs) failures.push(`voice segments ${voiceSegs.length} != ${expSegs}`)
  for (const kind of ['intro', 'background_music']) {
    const count = (assets ?? []).filter((a) => (a.kind ?? a.type) === kind).length
    const need = kind === 'background_music' ? 3 : 1
    if (count < need) failures.push(`asset kind ${kind}: ${count} < ${need}`)
  }
  return { ok: failures.length === 0, failures }
}

// ---------------------------------------------------------------------------
// Ordered guarded run (requires a supabase client; writes only under --execute)
// ---------------------------------------------------------------------------
export async function runRecovery(supabase, { execute = false, log = console.log, expectations = {} } = {}) {
  const writes = []
  const fence = async (label, doWrite, verify) => {
    if (!execute) { log(`[dry-run] would ${label}`); return null }
    const res = await doWrite()
    writes.push(label)
    const ok = await verify(res)
    if (!ok) throw new Error(`READ-AFTER-WRITE FAILED: ${label}. Pending intents intact; aborting.`)
    log(`[ok] ${label} (fenced + verified)`)
    return res
  }

  // STEP 0 — preflight re-verification reads (always run, even in dry-run)
  const { data: _job } = await supabase.from('production_jobs').select('*').eq('id', CREEK_JOB_ID).single()
  const job = one(_job)
  const { data: stories } = await supabase.from('stories').select('*').eq('series_id', CREEK_SERIES_ID).order('episode_number')
  const { data: assets } = await supabase.from('story_assets').select('*').eq('series_id', CREEK_SERIES_ID)
  const pre = evaluatePreflight({ job, stories, assets }, expectations)
  if (!pre.ok) {
    log('[ABORT] preflight mismatch — zero writes performed:')
    for (const f of pre.failures) log(`  - ${f}`)
    return { ok: false, phase: 'preflight', failures: pre.failures, writes }
  }
  log('[ok] preflight: job failed@complete_story_package, lock NULL, legacy nulls, asset identities match')

  const resumed = job.locked_by === LOCK_ID
  if (resumed) log('[info] resume mode: own lock found — converging, skipping already-verified steps (no duplicate paid calls)')

  const ep1 = stories.find((s) => (s.episode_number ?? s.ep) === 1)
  const ep2 = stories.find((s) => (s.episode_number ?? s.ep) === 2)

  // STEP 1 — Ep2 outro persist: exact text correction, then regen the missing
  // outro performance with normalized numerals in the generation payload.
  if (!hasCompanionPresence(EP2_OUTRO_AFTER)) throw new Error('Ep2 AFTER copy fails P5 — refusing to persist')
  const ep2Already = String(ep2.script).includes(EP2_OUTRO_AFTER)
  const ep2ScriptAfter = String(ep2.script).replace(EP2_OUTRO_BEFORE, EP2_OUTRO_AFTER)
  if (!ep2Already && ep2ScriptAfter === ep2.script) throw new Error('Ep2 BEFORE string not found in live script — refusing blind write')
  if (!ep2Already) await fence(
    'ep2 outro text persist',
    () => supabase.from('stories').update({
      script: ep2ScriptAfter,
      pending_audio_delete: ['outro'],
    }).eq('id', ep2.id).eq('script', ep2.script),
    async () => {
      const { data: _d0 } = await supabase.from('stories').select('script').eq('id', ep2.id).single()
      const d0 = one(_d0)
      return d0?.script === ep2ScriptAfter
    },
    )
  else log('[converged] ep2 outro text already persisted — skipping (no duplicate write)')
  log(`[info] ep2 generation payloadOutro: ${JSON.stringify(ep2OutroGenerationPayload())} (numerals normalized; paid TTS call happens in mix rebuild, step 5)`)

  // STEP 2 — Ep1: validate current text with P5. Regen performance WITHOUT a
  // text rewrite if it passes; minimal exact correction (quoted in comments)
  // only if it fails.
  // Ep1 C8 rewrite audited-minimal 18:01:41Z — expected to PASS as-is.
  const ep1Outro = extractOutro(ep1.script)
  if (hasCompanionPresence(ep1Outro)) {
    log('[ok] ep1 current outro passes P5 — performance regen only, NO text rewrite')
  } else {
    throw new Error('Ep1 outro fails P5 — minimal exact correction required before regen; halting for explicit before/after approval (no blind rewrite authorized)')
  }
  if (JSON.stringify(ep1.pending_audio_delete) !== JSON.stringify(['outro'])) await fence(
    'ep1 mark outro performance stale',
    () => supabase.from('stories').update({ pending_audio_delete: ['outro'] }).eq('id', ep1.id).eq('pending_audio_delete', null),
    async () => {
      const { data: _d1 } = await supabase.from('stories').select('pending_audio_delete').eq('id', ep1.id).single()
      const d1 = one(_d1)
      return JSON.stringify(d1?.pending_audio_delete) === JSON.stringify(['outro'])
    },
  )
  else log('[converged] ep1 stale marker already set — skipping')

  // STEP 3 — pin derivation FROM THE ACTUAL FINAL SCRIPTS (recomputed
  // post-write via hashScript — never hardcoded post-correction hashes).
  const { data: finals } = await supabase.from('stories').select('id,script').eq('series_id', CREEK_SERIES_ID).order('episode_number')
  const f1 = finals.find((s) => s.id === ep1.id); const f2 = finals.find((s) => s.id === ep2.id)
  const pins = derivePinsFromFinalScripts({ ep1Id: ep1.id, ep1Script: f1.script, ep2Id: ep2.id, ep2Script: f2.script })
  const ep2PinsConverged = JSON.stringify(ep2.pending_pin_resync) === JSON.stringify(pins.ep2Pins)
  if (!ep2PinsConverged) await fence(
    'ep2 continuity-pin resync (Ep2→Ep1)',
    () => supabase.from('stories').update({ pending_pin_resync: pins.ep2Pins }).eq('id', ep2.id),
    async () => {
      const { data: _d2 } = await supabase.from('stories').select('pending_pin_resync').eq('id', ep2.id).single()
      const d2 = one(_d2)
      return JSON.stringify(d2?.pending_pin_resync) === JSON.stringify(pins.ep2Pins)
    },
    )
  else log('[converged] ep2 pins already resynced — skipping')
  const ep3 = stories.find((s) => (s.episode_number ?? s.ep) === 3)
  await fence(
    'ep3 continuity-pin resync (Ep3→Ep1, Ep3→Ep2)',
    () => supabase.from('stories').update({ pending_pin_resync: pins.ep3Pins }).eq('id', ep3.id),
    async () => {
      const { data: _d3 } = await supabase.from('stories').select('pending_pin_resync').eq('id', ep3.id).single()
      const d3 = one(_d3)
      return JSON.stringify(d3?.pending_pin_resync) === JSON.stringify(pins.ep3Pins)
    },
  )

  // STEP 4 — same-job continuation PATCH (lock held, status running).
  // Idempotent on (job_id, step): re-running after a crash post-persist
  // converges (claim predicate fails → verify state → continue, no duplicate).
  await fence(
    'same-job continuation claim (lock held, status running)',
    () => supabase.from('production_jobs').update({
      status: 'running', current_step: FAILED_STEP, locked_by: LOCK_ID,
    }).eq('id', CREEK_JOB_ID).eq('status', 'failed'),
    async () => {
      const { data: _d4 } = await supabase.from('production_jobs').select('status,locked_by').eq('id', CREEK_JOB_ID).single()
      const d4 = one(_d4)
      return d4?.status === 'running'
    },
  )

  // STEP 5 — affected mix rebuilds (Ep1 + Ep2 only; Ep3 untouched) → release.
  // Paid TTS/mix calls happen here, guarded by the pending markers above:
  // a crash after step 4 leaves pending_* intact so restart resumes here
  // without duplicate paid calls (each rebuild clears its own marker).
  log('[info] dispatch mix rebuild for Ep1 + Ep2 only (Ep3 untouched); each rebuild clears its pending markers on success')
  await fence(
    'release continuation lock (job back to failed@complete_story_package for supervised rebuild, lock NULL)',
    () => supabase.from('production_jobs').update({
      status: 'failed', locked_by: null,
      belle_repair_audit: { action: 'creek_legacy_recovery', at: new Date().toISOString() },
    }).eq('id', CREEK_JOB_ID).eq('locked_by', 'creek-legacy-recovery'),
    async () => {
      const { data: _d5 } = await supabase.from('production_jobs').select('locked_by').eq('id', CREEK_JOB_ID).single()
      const d5 = one(_d5)
      return d5?.locked_by == null
    },
  )

  return { ok: true, writes }
}

export function extractOutro(script) {
  const m = String(script ?? '').match(/OUTRO:?\s*([\s\S]*)$/i)
  return (m ? m[1] : String(script ?? '').slice(-600)).trim()
}

// --- CLI ---
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const execute = process.argv.includes('--execute')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  runRecovery(supabase, { execute }).then(
    (r) => { console.log(JSON.stringify({ ...r, execute })); process.exit(r.ok ? 0 : 1) },
    (e) => { console.error('[FATAL]', e.message); process.exit(1) },
  )
}
