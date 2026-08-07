#!/usr/bin/env node
/**
 * PV2 rev6 — Part 2: regen segment_0030 + final mix
 * Steps 1–6 already committed. This script:
 *   1. Deletes segment_0030.mp3 from storage (makes it "missing" for retryMissingOnly)
 *   2. Calls production generate-voices retryMissingOnly=true segmentNumber=30
 *      (regenerates ONLY segment_0030 using the updated script text; all others cached)
 *   3. Calls render-final-mix
 */
'use strict'

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb           = createClient(SUPABASE_URL, SERVICE_KEY)
const STORY_ID     = 'a88084ab-62e3-47f4-9b7a-5cbc32943349'
const PROD_API     = 'https://app.endless-tales.com'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log('\n=== PV2 rev6 Part 2: regen segment_0030 + final mix ===\n')

  // ── Step 1: Delete segment_0030.mp3 ──────────────────────────────────────
  console.log('Step 1: Deleting segment_0030.mp3 from storage...')
  const { error: delErr } = await sb.storage.from('audio')
    .remove([`asc3/${STORY_ID}/segment_0030.mp3`])
  if (delErr) {
    console.warn('  ⚠️  Delete warning:', delErr.message)
  } else {
    console.log('  ✅ segment_0030.mp3 deleted')
  }

  // ── Step 2: Verify deletion ───────────────────────────────────────────────
  await sleep(1000)
  const { data: storageList } = await sb.storage.from('audio').list(`asc3/${STORY_ID}`, { limit: 200 })
  const has30 = storageList?.some(f => f.name === 'segment_0030.mp3')
  if (has30) {
    throw new Error('STOP — segment_0030.mp3 still present after delete. Cannot proceed safely.')
  }
  console.log('  ✅ Confirmed: segment_0030.mp3 not present')

  // ── Step 3: Call production generate-voices retryMissingOnly segmentNumber=30 ─
  console.log('\nStep 3: Calling production generate-voices (retryMissingOnly, segmentNumber=30)...')
  console.log('  This regenerates ONLY segment_0030 using updated script text.')
  console.log('  All other segments stay cached.')

  const genRes = await fetch(`${PROD_API}/api/admin/generate-voices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId: STORY_ID,
      retryMissingOnly: true,
      segmentNumber: 30,
      purgeExisting: false,
    }),
  })
  const genJson = await genRes.json().catch(e => ({ raw: String(e) }))
  console.log('  Response status:', genRes.status)
  console.log('  Response:', JSON.stringify(genJson, null, 2).slice(0, 800))

  if (!genRes.ok) {
    throw new Error(`generate-voices failed: HTTP ${genRes.status}`)
  }
  if (genJson.failures?.length > 0) {
    console.error('  ❌ Segment failures:', JSON.stringify(genJson.failures))
    throw new Error('Segment generation failed')
  }
  if (genJson.generatedSegments?.length === 0 && genJson.message?.includes('already exists')) {
    console.log('  ⚠️  segment_0030 already existed (was not deleted?). Proceeding with existing.')
  } else if (genJson.generatedSegments?.length > 0) {
    console.log('  ✅ Generated:', genJson.generatedSegments.map(s => s.index + ':' + s.speaker).join(', '))
    const genCount = genJson.generatedSegments.length
    if (genCount > 1) {
      throw new Error(`STOP — ${genCount} segments were regenerated. Expected exactly 1. Abort.`)
    }
  }

  // ── Step 4: Verify segment_0030.mp3 is present ────────────────────────────
  await sleep(2000)
  const { data: storageList2 } = await sb.storage.from('audio').list(`asc3/${STORY_ID}`, { limit: 200 })
  const has30After = storageList2?.some(f => f.name === 'segment_0030.mp3')
  if (!has30After) {
    throw new Error('STOP — segment_0030.mp3 not present after generation. Render aborted.')
  }
  console.log('\n  ✅ segment_0030.mp3 confirmed in storage')

  // ── Step 5: Call render-final-mix ─────────────────────────────────────────
  console.log('\nStep 5: Triggering render-final-mix...')
  console.log('  (This may take 2-4 minutes for PV2)')

  const renderRes = await fetch(`${PROD_API}/api/asc3/render-final-mix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: STORY_ID }),
  })
  const renderJson = await renderRes.json().catch(() => ({ raw: renderRes.status }))
  if (!renderRes.ok || !renderJson.success) {
    console.error('  ❌ render-final-mix failed:', JSON.stringify(renderJson).slice(0, 400))
    throw new Error('render-final-mix failed')
  }
  console.log('  ✅ Render complete')

  // ── Summary ───────────────────────────────────────────────────────────────
  const finalMixUrl = `https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/asc3/${STORY_ID}/final_mix.mp3`
  console.log('\n=== PV2 rev6 COMPLETE ===\n')
  console.log('Mix URL:', finalMixUrl)
  console.log('\nVoice segments regenerated:')
  console.log('  • segment_0030.mp3 — MARA: "Lena ran beneath the park, past old brick arches and a rusted gate.')
  console.log('    The fleeing figure cut left toward the service stairs. Lena followed.')
  console.log('    Eli caught my arm beside a wall scratched with names."')
  console.log('\nAll other 37 voice segments: REUSED from storage cache (no EL calls)')
  console.log('\nSFX cue inventory (in script order):')
  console.log('  #  | Timestamp | Cue name                                                   | File                   | Locked')
  console.log('  ---|-----------|-------------------------------------------------------------|------------------------|-------')
  console.log('  1  | ~0:00     | REEDY RIVER ROAR, CLOSE AND FORCEFUL, 2s                   | sfx_0000.mp3           | NO (rev4)')
  console.log('  2  | ~0:03     | PURE SILENCE, 1s                                            | sfx_0001.mp3           | NO (silence)')
  console.log('  3  | ~0:24     | FOOTSTEPS ON WET STONE, APPROACHING + HUM + DRIP           | sfx_0006.mp3           | YES → sfx-locked/footsteps-lena-approved.mp3')
  console.log('  4  | ~1:12     | MASSIVE IRON MILL BELL, BONE-DEEP RESONANCE, 8s             | sfx_0022.mp3           | YES → sfx-locked/bell-strike-r4.mp3')
  console.log('  5  | ~2:00     | HEAVY WATER SPLASH, PERSON RUNNING INTO WATER, TUNNEL ECHO | sfx_0027.mp3           | NO (rev4)')
  console.log('  6  | ~2:01     | RAPID FOOTSTEPS RUNNING ON WET STONE, CHASE                | sfx_0028.mp3           | YES → sfx-locked/footsteps-v2-approved.mp3')
  console.log('  7  | ~2:18     | METALLIC LATCH CLICK + HEAVY IRON DOOR OVER STONE FLOOR    | sfx_0034.mp3           | YES → sfx-locked/door-latch-r4.mp3')
  console.log('  8  | ~3:20     | SINGLE GUNSHOT, SHARP CRACK, BRICK CHAMBER SLAP-BACK       | sfx_0043.mp3           | YES → sfx-locked/gunshot-v3-approved.mp3')
  console.log('\nfootsteps-lena sha256: 73892fc4019cbacba786c2c1a11438c242cb23e138db20814c471271cfce0236')
  console.log('')
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message || e)
  process.exit(1)
})
