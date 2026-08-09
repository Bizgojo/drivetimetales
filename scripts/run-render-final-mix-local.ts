/**
 * ATL-LOCALMIX-001 — Local runner for render-final-mix.
 * Marc auth: 2026-08-09.
 *
 * Bypasses the Vercel 800s hard timeout. Canon: 80+ segments = local mix.
 * This file imports render-final-mix/core.ts and does NOT reimplement the mix.
 *
 * USE:
 *   npx tsx scripts/run-render-final-mix-local.ts <story_id>
 *
 * Pre-flight: reads expected segment file names from parseScriptPositions()
 * (the SAME parser contract as generate-voices) and verifies every file exists
 * in Supabase storage before invoking the mix. A missing segment is a parser
 * contract failure — this runner surfaces it and stops; it never patches around it.
 *
 * ── SPEC DEVIATIONS (surfaced here, not patched) ──────────────────────────
 *   1. dynaudnorm: core.ts uses loudnorm (ITU R-128 two-pass), not dynaudnorm.
 *      Marc spec requires dynaudnorm. Fix belongs in core.ts.
 *   2. Music bed under dialogue: core.ts narrationBedVolume = 0.075 (7.5%).
 *      Marc spec says 15%. Fix belongs in core.ts.
 *   3. Belle B mixed 1.5×: core.ts applies volume=2 compensation after amix
 *      (which halves inputs) resulting in 1.0× unity gain, not 1.5×. Fix
 *      belongs in core.ts.
 *   Items above are logged as warnings at runtime; render proceeds with core.ts
 *   as-is.  Do not remove these warnings without a matching core.ts correction.
 *
 * ── SPEC MATCHES (verified in core.ts) ───────────────────────────────────
 *   • @ffmpeg-installer/ffmpeg: yes (FFMPEG_PATH resolution in core.ts)
 *   • Sting crossfade 1200ms: STING_FADE_DUR = 1.2s ✓
 *   • Belle B voice ID: GMhgX8fCR9GUtd3kmlKC ✓ (via CANONICAL_BELLE_B_VOICE_ID)
 *   • Belle B settings: stability 0.49 / similarity 0.51 / style 0.0 /
 *       boost true / speed 1.0 / eleven_multilingual_v2 ✓ (voiceSettingsOverrides)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import { parseScriptPositions } from '../lib/scriptLineIndex'
import { runRenderFinalMix } from '../app/api/asc3/render-final-mix/core'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

// ── Spec-deviation warnings ───────────────────────────────────────────────
console.warn('[ATL-LOCALMIX-001] SPEC DEVIATION: core.ts uses loudnorm, not dynaudnorm. Fix belongs in core.ts.')
console.warn('[ATL-LOCALMIX-001] SPEC DEVIATION: core.ts narrationBedVolume = 0.075 (7.5%), spec requires 15%. Fix belongs in core.ts.')
console.warn('[ATL-LOCALMIX-001] SPEC DEVIATION: core.ts amix volume=2 yields 1.0× unity, not 1.5×. Fix belongs in core.ts.')

// ── Env validation ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[ATL-LOCALMIX-001] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const storyId = process.argv[2]
if (!storyId || !/^[0-9a-f-]{36}$/.test(storyId)) {
  console.error('[ATL-LOCALMIX-001] Usage: npx tsx scripts/run-render-final-mix-local.ts <story-uuid>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── Non-dialogue speakers excluded from expected segment set ──────────────
// Must match the same set used in generate-voices.
const NON_DIALOGUE_SPEAKERS = new Set([
  'TITLE', 'AUTHOR', 'GENRE', 'DESCRIPTION', 'SERIES', 'EPISODE',
  'EPISODE_TITLE', 'SUNO PROMPT', 'ANNOUNCER', 'BELLE B', 'SANDY',
])

async function preflight(script: string): Promise<{ ok: boolean; missing: string[] }> {
  const positions = parseScriptPositions(script)

  // Build expected file names — same logic as generate-voices expectedSegmentNames.
  const expected = positions
    .filter(p =>
      p.kind === 'sfx' ||
      (p.kind === 'voice' && !NON_DIALOGUE_SPEAKERS.has((p.speaker ?? '').toUpperCase())) ||
      p.kind === 'silence'
    )
    .map(p =>
      p.kind === 'sfx'
        ? `sfx_${String(p.index).padStart(4, '0')}.mp3`
        : `segment_${String(p.index).padStart(4, '0')}.mp3`
    )

  console.log(`[preflight] Script positions: ${positions.length} total`)
  console.log(`[preflight] Expected files: ${expected.length} (${positions.filter(p => p.kind === 'sfx').length} sfx + ${expected.length - positions.filter(p => p.kind === 'sfx').length} segment)`)

  // Read storage once (limit 500 matches generate-voices list call)
  const { data: storageFiles, error: listErr } = await supabase.storage
    .from('audio')
    .list(`asc3/${storyId}`, { limit: 500 })

  if (listErr) {
    console.error('[preflight] Storage list failed:', listErr.message)
    return { ok: false, missing: [`(storage list error: ${listErr.message})`] }
  }

  const present = new Set((storageFiles ?? []).map(f => f.name))
  const missing = expected.filter(name => !present.has(name))

  if (missing.length === 0) {
    console.log(`[preflight] ✅ All ${expected.length} expected files present in storage`)
  } else {
    console.error(`[preflight] ❌ ${missing.length} expected file(s) missing from storage:`)
    missing.forEach(name => console.error(`  missing: ${name}`))
    console.error('[preflight] PARSER CONTRACT FAILURE — this is not a mix problem.')
    console.error('[preflight] Re-run generate-voices to fill the gaps, then retry this runner.')
  }

  return { ok: missing.length === 0, missing }
}

async function main(): Promise<void> {
  console.log(`\n[ATL-LOCALMIX-001] render-final-mix LOCAL RUNNER`)
  console.log(`[ATL-LOCALMIX-001] story: ${storyId}`)
  console.log(`[ATL-LOCALMIX-001] started: ${new Date().toISOString()}\n`)

  // Fetch story script for preflight
  const { data: storyRow, error: storyErr } = await supabase
    .from('stories')
    .select('script, title, status')
    .eq('id', storyId)
    .single()

  if (storyErr || !storyRow?.script) {
    console.error('[ATL-LOCALMIX-001] Could not load story script:', storyErr?.message ?? 'script is null')
    process.exit(1)
  }

  console.log(`[ATL-LOCALMIX-001] title: ${storyRow.title}`)
  console.log(`[ATL-LOCALMIX-001] status: ${storyRow.status}`)

  // ── Pre-flight: verify all expected segments exist before touching the mix ─
  const { ok, missing } = await preflight(storyRow.script)
  if (!ok) {
    console.error('\n[ATL-LOCALMIX-001] STOPPED — preflight failed. Nothing was rendered.')
    process.exit(1)
  }

  // ── Run the mix via core.ts ───────────────────────────────────────────────
  console.log(`\n[ATL-LOCALMIX-001] Preflight passed. Invoking render-final-mix core...`)
  const t0 = Date.now()

  const result = await runRenderFinalMix(storyId)

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n[ATL-LOCALMIX-001] render-final-mix complete in ${elapsedSec}s`)
  console.log('[ATL-LOCALMIX-001] Result:', JSON.stringify(result, null, 2))

  if (result.success) {
    console.log(`\n[ATL-LOCALMIX-001] ✅ SUCCESS`)
    console.log(`  final_audio_url: ${result.finalAudioUrl ?? '(not set)'}`)
    console.log(`  story_body_url:  ${result.storyBodyUrl ?? '(not set)'}`)
    console.log(`  duration_secs:   ${result.durationSecs?.toFixed(1) ?? '(not set)'}`)
  } else {
    console.error(`\n[ATL-LOCALMIX-001] ❌ FAILED: ${result.error ?? 'unknown error'}`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[ATL-LOCALMIX-001] FATAL:', err?.message ?? err)
  process.exit(1)
})
