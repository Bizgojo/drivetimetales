/**
 * Live voice creation test — tests createOrFetchVoice() with real ElevenLabs API
 * This test is marked .skip by default. Run with --testNamePattern="live" to execute.
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

// Note: This test uses real ElevenLabs API credentials and will incur charges
// Only run when explicitly requested with: npx jest --testNamePattern="live"

describe.skip('createOrFetchVoice — LIVE API test', () => {
  let provider

  beforeAll(async () => {
    // Dynamic import of the provider (compiled from TypeScript)
    const { getVoiceProvider } = await import('../lib/voice-providers/index.ts')
    provider = getVoiceProvider('elevenlabs', process.env.ELEVENLABS_API_KEY)
  })

  it.skip('creates Fiona Lennox voice (CH-FE-L3-WM-US-V1) from The Midnight Route', async () => {
    const voiceCode = 'CH-FE-L3-WM-US-V1'
    const voiceSpec = {
      voice_name: 'Fiona Lennox — The Midnight Route',
      voice_description: 'Steady, practical American female in her late thirties. Slight Montana warmth. Dry humor masking deep alertness. Veteran overnight bus driver.',
      age: 'young',
      gender: 'female',
      accent: 'american',
      accent_strength: 0.8,
    }

    const result = await provider.createOrFetchVoice(voiceCode, voiceSpec, false)

    expect(result.ok).toBe(true)
    expect(result.voice_code).toBe(voiceCode)
    expect(result.voice_id).toBeTruthy()
    expect(result.source).toMatch(/created|found/)
    expect(result.registry_saved).toBe(true)
  })

  it.skip('creates Quentin Dyer voice (CH-MA-E4-DK-US-V1) from The Midnight Route', async () => {
    const voiceCode = 'CH-MA-E4-DK-US-V1'
    const voiceSpec = {
      voice_name: 'Quentin Dyer — The Midnight Route',
      voice_description: 'Calm, polite American male in his early forties. Neutral accent with careful enunciation concealing controlled menace. Intelligent and watchful.',
      age: 'middle_aged',
      gender: 'male',
      accent: 'american',
      accent_strength: 0.9,
    }

    const result = await provider.createOrFetchVoice(voiceCode, voiceSpec, false)

    expect(result.ok).toBe(true)
    expect(result.voice_code).toBe(voiceCode)
    expect(result.voice_id).toBeTruthy()
    expect(result.source).toMatch(/created|found/)
    expect(result.registry_saved).toBe(true)
  })
})
