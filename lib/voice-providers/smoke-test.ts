/**
 * Voice Provider Smoke Test
 * Run with: ELEVENLABS_API_KEY=<your-key> npx ts-node --skip-project lib/voice-providers/smoke-test.ts
 *
 * Tests all 5 capabilities against the real ElevenLabs API.
 * Requires ELEVENLABS_API_KEY in environment — do NOT hardcode or log the key.
 *
 * This is NOT a unit test — it makes real API calls and uses real credits.
 * Use only for manual verification. Keep preview_text short to save credits.
 */

import 'dotenv/config'
import { getVoiceProvider } from './index'

// Sanity-check: key must be in env, not in code
if (!process.env.ELEVENLABS_API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY not set. Pass via env — never hardcode.')
  process.exit(1)
}

const BELLE_B_VOICE_ID = 'GMhgX8fCR9GUtd3kmlKC'
const SHORT_TTS_TEXT = 'This is a quick voice provider smoke test.'

async function main() {
  const provider = getVoiceProvider('elevenlabs')
  console.log(`\n=== Voice Provider Smoke Test [${provider.providerName}] ===\n`)

  // ── 1. TTS from existing voice ──────────────────────────────────────────
  console.log('1. synthesize() — TTS from existing voice (Belle B)...')
  try {
    const audio = await provider.synthesize(BELLE_B_VOICE_ID, SHORT_TTS_TEXT)
    console.log(`   ✅ Got audio buffer: ${audio.byteLength} bytes`)
  } catch (err: any) {
    console.error('   ❌ synthesize() failed:', err.error_json ?? err.message)
  }

  // ── 2. List voices ──────────────────────────────────────────────────────
  console.log('\n2. listVoices() — paginated GET /v2/voices...')
  try {
    const voices = await provider.listVoices({ limit: 5 })
    console.log(`   ✅ Got ${voices.length} voices (first 5):`)
    voices.forEach((v) =>
      console.log(`      - ${v.name} (${v.voice_id}) [${v.category ?? 'unknown'}]`)
    )
  } catch (err: any) {
    console.error('   ❌ listVoices() failed:', err.error_json ?? err.message)
  }

  // ── 3. Voice Design previews ────────────────────────────────────────────
  console.log('\n3. designPreviews() — POST /v1/text-to-voice/design...')
  let previewId: string | null = null
  try {
    const previews = await provider.designPreviews({
      voice_description:
        'Native English. Male, 35-45. Broadcast quality. Persona: warm Western narrator. ' +
        'Emotion: calm, trustworthy. Deep, resonant timbre with natural pacing.',
      preview_text:
        'The sun dipped below the ridge line, painting the canyon walls in shades of amber and rust. ' +
        'Out here, time moved differently — slower, heavier, like the land itself was breathing.',
    })
    previewId = previews[0]?.generated_voice_id ?? null
    console.log(`   ✅ Got ${previews.length} preview(s), first generated_voice_id: ${previewId}`)
    console.log(
      `      Audio (first 80 chars of base64): ${previews[0]?.audio_base64?.slice(0, 80) ?? '(none)'}`
    )
  } catch (err: any) {
    console.error('   ❌ designPreviews() failed:', err.error_json ?? err.message)
  }

  // ── 4. Create voice from preview ────────────────────────────────────────
  let createdVoiceId: string | null = null
  if (previewId) {
    console.log('\n4. createFromPreview() — POST /v1/text-to-voice...')
    try {
      const voice = await provider.createFromPreview(
        previewId,
        'SmokeTest_Western_Narrator',
        'Test voice created by smoke-test. Safe to delete.',
        { voice_code: 'smoke_test_western_narrator_v0', env: 'test' }
      )
      createdVoiceId = voice.voice_id
      console.log(`   ✅ Created voice: ${voice.name} (${voice.voice_id})`)
    } catch (err: any) {
      console.error('   ❌ createFromPreview() failed:', err.error_json ?? err.message)
    }
  } else {
    console.log('\n4. createFromPreview() — SKIPPED (no preview_id from step 3)')
  }

  // ── 5. createOrFetchVoice — idempotency check ───────────────────────────
  console.log('\n5. createOrFetchVoice() — idempotent lookup...')
  try {
    const voice = await provider.createOrFetchVoice('smoke_test_western_narrator_v0', {
      name: 'SmokeTest_Western_Narrator',
      voice_description:
        'Native English. Male, 35-45. Broadcast quality. Persona: warm Western narrator. ' +
        'Emotion: calm, trustworthy. Deep, resonant timbre with natural pacing.',
    })
    const isExisting = voice.voice_id === createdVoiceId
    console.log(
      `   ✅ Returned voice: ${voice.name} (${voice.voice_id}) — ${isExisting ? 'EXISTING (idempotent ✓)' : 'newly created'}`
    )
  } catch (err: any) {
    console.error('   ❌ createOrFetchVoice() failed:', err.error_json ?? err.message)
  }

  console.log('\n=== Done ===\n')
  // Never log API keys or partial keys
  console.log(
    'NOTE: If step 4 created a real voice (SmokeTest_Western_Narrator), ' +
      'delete it from ElevenLabs My Voices to free up a voice slot.\n' +
      'Your API key was not logged.'
  )
}

main().catch(console.error)
