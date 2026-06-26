'use strict'

/**
 * voice-provider.test.js
 *
 * Tests for:
 *   - voice_code parser + validator (AA-BB-CC-DD-EE-FF format)
 *   - createOrFetchVoice: existing voice, new voice, idempotency
 *   - createOrFetchVoice: malformed voice_code
 *   - ElevenLabs API failure with preserved original cause
 *   - Missing API key
 *   - /v2/voices pagination
 *   - Dry-run mode: all outcomes without spending credits
 *   - Registry lookup + miss
 *
 * All ElevenLabs API calls and Supabase calls are mocked — no real credentials
 * or credits are used by this test suite.
 *
 * Run: npx jest __tests__/voice-provider.test.js --no-coverage
 */

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Registry mock state — must be declared as 'mock'-prefixed per Jest's factory rule
const mockRegistry = {
  lookup: jest.fn().mockResolvedValue(null),
  upsert: jest.fn().mockResolvedValue(undefined),
}

jest.mock('../lib/voice-providers/registry', () => ({
  getRegistry: () => mockRegistry,
  VoiceCodeRegistry: jest.fn(),
}))

// Convenience aliases used throughout tests
let registryLookupMock
let registryUpsertMock

// Mock fetch globally
let fetchMock

beforeEach(() => {
  fetchMock = jest.fn()
  global.fetch = fetchMock

  // Reset registry mocks to defaults
  mockRegistry.lookup.mockReset().mockResolvedValue(null)
  mockRegistry.upsert.mockReset().mockResolvedValue(undefined)

  // Expose as aliases for test readability
  registryLookupMock = mockRegistry.lookup
  registryUpsertMock = mockRegistry.upsert
})

afterEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

const {
  parseVoiceCode,
  assertVoiceCode,
  isValidVoiceCode,
  VOICE_CODE_SCHEMA_VERSION,
  VoiceCodeValidationError,
} = require('../lib/voice-providers/voice-code')

const { ElevenLabsProvider } = require('../lib/voice-providers/elevenlabs')
const { VoiceProviderException } = require('../lib/voice-providers/types')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(apiKey = 'test-api-key') {
  return new ElevenLabsProvider(apiKey)
}

function makeVoicesPage(voices = [], hasMore = false, nextToken = null) {
  return {
    ok: true,
    json: async () => ({ voices, has_more: hasMore, next_page_token: nextToken }),
    status: 200,
  }
}

function makeAudioResponse(bytes = 1024) {
  const buf = Buffer.alloc(bytes, 0xff)
  return {
    ok: true,
    arrayBuffer: async () => buf.buffer,
    status: 200,
  }
}

function makeErrorResponse(status, body = 'error') {
  return {
    ok: false,
    status,
    text: async () => body,
  }
}

function makeDesignResponse(previews) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ previews }),
  }
}

function makeCreateVoiceResponse(voiceId, name) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ voice_id: voiceId, name, category: 'generated', labels: {} }),
  }
}

const VALID_VOICE_CODE = 'NR-MA-45-WM-US-V1'
const VALID_SPEC = {
  name: 'Test Narrator',
  voice_description: 'Native English. Male, 45. Warm, resonant, trustworthy narrator.',
}

// ---------------------------------------------------------------------------
// 1. voice_code parser — format validation
// ---------------------------------------------------------------------------

describe('parseVoiceCode — format validation', () => {
  test('valid code parses correctly', () => {
    const result = parseVoiceCode('NR-MA-45-WM-US-V1')
    expect(result.valid).toBe(true)
    expect(result.parsed).toMatchObject({
      raw: 'NR-MA-45-WM-US-V1',
      schemaVersion: VOICE_CODE_SCHEMA_VERSION,
      role: 'NR',
      gender: 'MA',
      age: '45',
      tone: 'WM',
      accent: 'US',
      version: 'V1',
    })
  })

  test('valid codes with digits in segments', () => {
    expect(parseVoiceCode('CH-FE-28-HM-UK-V2').valid).toBe(true)
    expect(parseVoiceCode('AN-FE-32-WM-US-V1').valid).toBe(true)
    expect(parseVoiceCode('NR-NB-YA-NT-AU-V9').valid).toBe(true)
  })

  test('null/undefined/empty returns invalid', () => {
    expect(parseVoiceCode(null).valid).toBe(false)
    expect(parseVoiceCode(undefined).valid).toBe(false)
    expect(parseVoiceCode('').valid).toBe(false)
    expect(parseVoiceCode('   ').valid).toBe(false)

    expect(parseVoiceCode(null).error.code).toBe('EMPTY_VOICE_CODE')
  })

  test('wrong number of segments is malformed', () => {
    const r1 = parseVoiceCode('NR-MA-45-WM-US')          // 5 segments
    const r2 = parseVoiceCode('NR-MA-45-WM-US-V1-XX')    // 7 segments
    const r3 = parseVoiceCode('NR')                       // 1 segment
    expect(r1.valid).toBe(false)
    expect(r2.valid).toBe(false)
    expect(r3.valid).toBe(false)
    expect(r1.error.code).toBe('MALFORMED_VOICE_CODE')
  })

  test('lowercase is malformed', () => {
    expect(parseVoiceCode('nr-ma-45-wm-us-v1').valid).toBe(false)
    expect(parseVoiceCode('NR-ma-45-WM-US-V1').valid).toBe(false)
  })

  test('segments longer than 2 chars are malformed', () => {
    expect(parseVoiceCode('NRR-MA-45-WM-US-V1').valid).toBe(false)
    expect(parseVoiceCode('NR-MA-45X-WM-US-V1').valid).toBe(false)
  })

  test('segments shorter than 2 chars are malformed', () => {
    expect(parseVoiceCode('N-MA-45-WM-US-V1').valid).toBe(false)
  })

  test('special characters are malformed', () => {
    expect(parseVoiceCode('NR-MA-45-WM-US-V!').valid).toBe(false)
    expect(parseVoiceCode('NR-MA-45-WM-US-V_').valid).toBe(false)
  })

  test('isValidVoiceCode is a convenience wrapper', () => {
    expect(isValidVoiceCode('NR-MA-45-WM-US-V1')).toBe(true)
    expect(isValidVoiceCode('bad')).toBe(false)
    expect(isValidVoiceCode(null)).toBe(false)
  })

  test('assertVoiceCode throws VoiceCodeValidationError on invalid input', () => {
    expect(() => assertVoiceCode('bad-code')).toThrow(VoiceCodeValidationError)
    expect(() => assertVoiceCode(null)).toThrow(VoiceCodeValidationError)
  })

  test('VoiceCodeValidationError has structured toErrorJson()', () => {
    try {
      assertVoiceCode('BAD-CODE')
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceCodeValidationError)
      const ej = err.toErrorJson()
      expect(ej.provider).toBe('voice-code-parser')
      expect(ej.retry_safe).toBe(false)
      expect(ej.status_code).toBeNull()
      expect(typeof ej.original_cause).toBe('string')
    }
  })

  test('error includes expected_format from schema version', () => {
    const result = parseVoiceCode('bad')
    expect(result.error.expected_format).toBeTruthy()
    expect(result.error.schema_version).toBe(VOICE_CODE_SCHEMA_VERSION)
  })
})

// ---------------------------------------------------------------------------
// 2. Missing API key
// ---------------------------------------------------------------------------

describe('ElevenLabsProvider — missing API key', () => {
  test('throws at construction when no key is available', () => {
    const origKey = process.env.ELEVENLABS_API_KEY
    delete process.env.ELEVENLABS_API_KEY
    try {
      expect(() => new ElevenLabsProvider()).toThrow(/ELEVENLABS_API_KEY is not set/)
    } finally {
      if (origKey) process.env.ELEVENLABS_API_KEY = origKey
    }
  })

  test('accepts explicit apiKey arg without env var', () => {
    const origKey = process.env.ELEVENLABS_API_KEY
    delete process.env.ELEVENLABS_API_KEY
    try {
      expect(() => new ElevenLabsProvider('explicit-key')).not.toThrow()
    } finally {
      if (origKey) process.env.ELEVENLABS_API_KEY = origKey
    }
  })
})

// ---------------------------------------------------------------------------
// 3. createOrFetchVoice — malformed voice_code
// ---------------------------------------------------------------------------

describe('createOrFetchVoice — malformed voice_code', () => {
  test('throws VoiceProviderException with retry_safe=false for malformed code', async () => {
    const provider = makeProvider()
    await expect(provider.createOrFetchVoice('bad-voice-code', VALID_SPEC))
      .rejects.toThrow(VoiceProviderException)

    try {
      await provider.createOrFetchVoice('bad-voice-code', VALID_SPEC)
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceProviderException)
      expect(err.error_json.retry_safe).toBe(false)
      expect(err.error_json.provider).toBe('voice-code-parser')
      expect(err.error_json.status_code).toBeNull()
      expect(err.error_json.original_cause).toContain('MALFORMED_VOICE_CODE')
    }
  })

  test('malformed code never calls fetch (no EL API call made)', async () => {
    const provider = makeProvider()
    await provider.createOrFetchVoice('lowercase-bad', VALID_SPEC).catch(() => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('dry-run returns invalid_voice_code outcome without throwing', async () => {
    const provider = makeProvider()
    const result = await provider.createOrFetchVoice('bad', VALID_SPEC, true)
    expect(result.dry_run).toBe(true)
    expect(result.outcome).toBe('invalid_voice_code')
    expect(result.validation_error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 4. createOrFetchVoice — existing voice found by label (EL label lookup)
// ---------------------------------------------------------------------------

describe('createOrFetchVoice — existing voice found by EL label', () => {
  test('returns existing voice without calling design or create', async () => {
    const existingVoice = {
      voice_id: 'el-voice-123',
      name: 'Test Narrator',
      category: 'generated',
      labels: { voice_code: VALID_VOICE_CODE },
    }

    // Registry miss → fall through to EL label search
    mockRegistry.lookup.mockResolvedValue(null)

    // EL /v2/voices returns our voice
    fetchMock.mockResolvedValue(
      makeVoicesPage([existingVoice], false)
    )

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)

    expect(result.voice_id).toBe('el-voice-123')
    expect(result.name).toBe('Test Narrator')

    // Only one call: GET /v2/voices (generated category)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/voices')

    // Registry should be back-filled
    expect(registryUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ voice_code: VALID_VOICE_CODE })
    )
  })

  test('checks generated category first, then cloned if not found', async () => {
    // Not in generated, found in cloned
    const existingVoice = {
      voice_id: 'cloned-voice-456',
      name: 'Cloned Narrator',
      category: 'cloned',
      labels: { voice_code: VALID_VOICE_CODE },
    }

    mockRegistry.lookup.mockResolvedValue(null)
    fetchMock
      .mockResolvedValueOnce(makeVoicesPage([], false))          // generated: empty
      .mockResolvedValueOnce(makeVoicesPage([existingVoice]))     // cloned: found

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)

    expect(result.voice_id).toBe('cloned-voice-456')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// 5. createOrFetchVoice — found in DB registry
// ---------------------------------------------------------------------------

describe('createOrFetchVoice — found in registry', () => {
  test('returns registry entry without any EL API call', async () => {
    const registryVoice = {
      voice_id: 'registry-voice-789',
      name: 'Registry Narrator',
      category: 'generated',
    }
    mockRegistry.lookup.mockResolvedValue(registryVoice)

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)

    expect(result.voice_id).toBe('registry-voice-789')
    expect(fetchMock).not.toHaveBeenCalled()  // zero EL API calls
  })

  test('dry-run reports found_in_registry', async () => {
    mockRegistry.lookup.mockResolvedValue({
      voice_id: 'registry-voice-789',
      name: 'Registry Narrator',
    })

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC, true)

    expect(result.dry_run).toBe(true)
    expect(result.outcome).toBe('found_in_registry')
    expect(result.existing_voice_id).toBe('registry-voice-789')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 6. createOrFetchVoice — new voice created once (idempotency)
// ---------------------------------------------------------------------------

describe('createOrFetchVoice — new voice creation', () => {
  test('calls design then create when voice is not found anywhere', async () => {
    mockRegistry.lookup.mockResolvedValue(null)

    fetchMock
      .mockResolvedValueOnce(makeVoicesPage([], false))  // generated: empty
      .mockResolvedValueOnce(makeVoicesPage([], false))  // cloned: empty
      .mockResolvedValueOnce(makeDesignResponse([
        { generated_voice_id: 'preview-abc', audio_sample: 'base64audiofoo' },
      ]))
      .mockResolvedValueOnce(makeCreateVoiceResponse('new-voice-001', 'Test Narrator'))

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)

    expect(result.voice_id).toBe('new-voice-001')
    expect(result.name).toBe('Test Narrator')

    // Should have called: list generated, list cloned, design, create
    expect(fetchMock).toHaveBeenCalledTimes(4)

    const calls = fetchMock.mock.calls.map(c => c[0])
    expect(calls.some(u => u.includes('/v2/voices'))).toBe(true)
    expect(calls.some(u => u.includes('/v1/text-to-voice/design'))).toBe(true)
    expect(calls.some(u => u.includes('/v1/text-to-voice'))).toBe(true)

    // Newly created voice is stored in registry
    expect(registryUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        voice_code: VALID_VOICE_CODE,
        voice: expect.objectContaining({ voice_id: 'new-voice-001' }),
      })
    )
  })

  test('voice_code label is attached to newly created voice', async () => {
    mockRegistry.lookup.mockResolvedValue(null)

    fetchMock
      .mockResolvedValueOnce(makeVoicesPage([], false))
      .mockResolvedValueOnce(makeVoicesPage([], false))
      .mockResolvedValueOnce(makeDesignResponse([
        { generated_voice_id: 'preview-abc', audio_sample: '' },
      ]))
      .mockResolvedValueOnce(makeCreateVoiceResponse('new-voice-002', 'Test Narrator'))

    const provider = makeProvider()
    await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)

    // Find the create call (POST /v1/text-to-voice without /design suffix) and check labels
    const createCall = fetchMock.mock.calls.find(c => 
      c[0].includes('/v1/text-to-voice') && !c[0].includes('/design')
    )
    expect(createCall).toBeDefined()
    const createBody = JSON.parse(createCall[1].body)
    expect(createBody.labels).toMatchObject({ voice_code: VALID_VOICE_CODE })
  })
})

// ---------------------------------------------------------------------------
// 7. Idempotency — repeated calls with same voice_code
// ---------------------------------------------------------------------------

describe('createOrFetchVoice — idempotency', () => {
  test('second call with registry hit makes zero EL API calls', async () => {
    // First call: registry miss → EL list → design → create → upsert
    mockRegistry.lookup
      .mockResolvedValueOnce(null)  // first call: miss
      .mockResolvedValueOnce({ voice_id: 'created-voice', name: 'Test Narrator' }) // second call: hit

    fetchMock
      .mockResolvedValueOnce(makeVoicesPage([], false))
      .mockResolvedValueOnce(makeVoicesPage([], false))
      .mockResolvedValueOnce(makeDesignResponse([{ generated_voice_id: 'p1', audio_sample: '' }]))
      .mockResolvedValueOnce(makeCreateVoiceResponse('created-voice', 'Test Narrator'))

    const provider = makeProvider()

    const result1 = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)
    expect(result1.voice_id).toBe('created-voice')
    expect(fetchMock).toHaveBeenCalledTimes(4)

    fetchMock.mockClear()

    // Second call: registry returns the voice
    const result2 = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)
    expect(result2.voice_id).toBe('created-voice')
    expect(fetchMock).toHaveBeenCalledTimes(0)  // zero EL calls
  })
})

// ---------------------------------------------------------------------------
// 8. ElevenLabs API failure with preserved original_cause
// ---------------------------------------------------------------------------

describe('ElevenLabs API failure handling', () => {
  test('synthesize failure includes endpoint, status_code, retry_safe', async () => {
    fetchMock.mockResolvedValue(makeErrorResponse(429, 'rate limit exceeded'))

    const provider = makeProvider()
    await expect(provider.synthesize('voice-id', 'hello')).rejects.toThrow(VoiceProviderException)

    try {
      await provider.synthesize('voice-id', 'hello')
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceProviderException)
      expect(err.error_json.endpoint).toContain('/v1/text-to-speech/voice-id')
      expect(err.error_json.status_code).toBe(429)
      expect(err.error_json.retry_safe).toBe(true)   // 429 is retryable
      expect(err.error_json.response_body_summary).toContain('rate limit')
      expect(err.error_json.original_cause).toBe('HTTP 429')
    }
  })

  test('network error (fetch throws) sets status_code=null and retry_safe=true', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const provider = makeProvider()
    try {
      await provider.synthesize('voice-id', 'hello')
    } catch (err) {
      expect(err.error_json.status_code).toBeNull()
      expect(err.error_json.retry_safe).toBe(true)
      expect(err.error_json.original_cause).toContain('ECONNREFUSED')
    }
  })

  test('500 server error is retry_safe=true', async () => {
    fetchMock.mockResolvedValue(makeErrorResponse(500, 'internal server error'))
    const provider = makeProvider()
    try {
      await provider.synthesize('voice-id', 'test')
    } catch (err) {
      expect(err.error_json.retry_safe).toBe(true)
    }
  })

  test('400 client error is retry_safe=false', async () => {
    fetchMock.mockResolvedValue(makeErrorResponse(400, 'bad request: invalid voice_id'))
    const provider = makeProvider()
    try {
      await provider.synthesize('voice-id', 'test')
    } catch (err) {
      expect(err.error_json.retry_safe).toBe(false)
    }
  })

  test('voice design API failure preserves original cause', async () => {
    mockRegistry.lookup.mockResolvedValue(null)
    fetchMock
      .mockResolvedValueOnce(makeVoicesPage([], false))   // generated
      .mockResolvedValueOnce(makeVoicesPage([], false))   // cloned
      .mockResolvedValueOnce(makeErrorResponse(422, 'voice_description too short'))

    const provider = makeProvider()
    try {
      await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC)
    } catch (err) {
      expect(err).toBeInstanceOf(VoiceProviderException)
      expect(err.error_json.endpoint).toContain('/v1/text-to-voice/design')
      expect(err.error_json.status_code).toBe(422)
      expect(err.error_json.response_body_summary).toContain('voice_description too short')
    }
  })
})

// ---------------------------------------------------------------------------
// 9. /v2/voices pagination
// ---------------------------------------------------------------------------

describe('listVoices — /v2/voices pagination', () => {
  test('follows pagination through multiple pages', async () => {
    const page1Voices = [
      { voice_id: 'v1', name: 'Voice 1', category: 'generated', labels: {} },
      { voice_id: 'v2', name: 'Voice 2', category: 'generated', labels: {} },
    ]
    const page2Voices = [
      { voice_id: 'v3', name: 'Voice 3', category: 'generated', labels: {} },
    ]

    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          voices: page1Voices,
          has_more: true,
          next_page_token: 'token_page2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          voices: page2Voices,
          has_more: false,
          next_page_token: null,
        }),
      })

    const provider = makeProvider()
    const all = await provider.listVoices({ category: 'generated' })

    expect(all).toHaveLength(3)
    expect(all.map(v => v.voice_id)).toEqual(['v1', 'v2', 'v3'])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Second page call must include the token
    const secondUrl = fetchMock.mock.calls[1][0]
    expect(secondUrl).toContain('next_page_token=token_page2')
  })

  test('limit stops pagination early', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        voices: [
          { voice_id: 'v1', name: 'A', category: 'generated', labels: {} },
          { voice_id: 'v2', name: 'B', category: 'generated', labels: {} },
          { voice_id: 'v3', name: 'C', category: 'generated', labels: {} },
        ],
        has_more: true,
        next_page_token: 'page2',
      }),
    })

    const provider = makeProvider()
    const result = await provider.listVoices({ limit: 2 })

    expect(result).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)  // stopped before page 2
  })

  test('empty voice list returns empty array without error', async () => {
    fetchMock.mockResolvedValue(makeVoicesPage([], false))
    const provider = makeProvider()
    const result = await provider.listVoices()
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 10. Dry-run mode — all outcomes
// ---------------------------------------------------------------------------

describe('createOrFetchVoice — dry-run mode', () => {
  test('found_in_registry: no EL calls, reports voice_id', async () => {
    mockRegistry.lookup.mockResolvedValue({ voice_id: 'existing-id', name: 'X' })

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC, true)

    expect(result.dry_run).toBe(true)
    expect(result.outcome).toBe('found_in_registry')
    expect(result.existing_voice_id).toBe('existing-id')
    expect(result.would_send_design_request).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('found_in_el_labels: lists voices but does not design/create', async () => {
    mockRegistry.lookup.mockResolvedValue(null)
    fetchMock.mockResolvedValue(
      makeVoicesPage([{ voice_id: 'el-123', name: 'EL Voice', labels: { voice_code: VALID_VOICE_CODE } }])
    )

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC, true)

    expect(result.outcome).toBe('found_in_el_labels')
    expect(result.existing_voice_id).toBe('el-123')
    // No design or create calls
    const urls = fetchMock.mock.calls.map(c => c[0])
    expect(urls.some(u => u.includes('text-to-voice/design'))).toBe(false)
    expect(urls.some(u => u.includes('/v1/text-to-voice'))).toBe(false)
  })

  test('would_create: reports design request body without calling design', async () => {
    mockRegistry.lookup.mockResolvedValue(null)
    fetchMock
      .mockResolvedValueOnce(makeVoicesPage([], false))   // generated
      .mockResolvedValueOnce(makeVoicesPage([], false))   // cloned

    const provider = makeProvider()
    const result = await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC, true)

    expect(result.outcome).toBe('would_create')
    expect(result.would_send_design_request).toMatchObject({
      voice_description: VALID_SPEC.voice_description,
    })
    expect(result.existing_voice_id).toBeNull()

    // Only list calls — no design/create
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map(c => c[0])
    expect(urls.every(u => u.includes('/v2/voices'))).toBe(true)
  })

  test('dry-run does not upsert to registry', async () => {
    mockRegistry.lookup.mockResolvedValue(null)
    fetchMock
      .mockResolvedValueOnce(makeVoicesPage([
        { voice_id: 'v1', name: 'N', labels: { voice_code: VALID_VOICE_CODE } }
      ]))

    const provider = makeProvider()
    await provider.createOrFetchVoice(VALID_VOICE_CODE, VALID_SPEC, true)

    expect(registryUpsertMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 11. synthesize — TTS generation
// ---------------------------------------------------------------------------

describe('synthesize — TTS', () => {
  test('returns audio buffer on success', async () => {
    fetchMock.mockResolvedValue(makeAudioResponse(2048))

    const provider = makeProvider()
    const buf = await provider.synthesize('voice-id', 'Hello world')

    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.byteLength).toBe(2048)

    const call = fetchMock.mock.calls[0]
    expect(call[0]).toContain('/v1/text-to-speech/voice-id')
    expect(call[1].headers['xi-api-key']).toBe('test-api-key')
    // Key must never be logged or returned in the result
    expect(JSON.stringify(buf)).not.toContain('test-api-key')
  })

  test('passes voice settings in request body', async () => {
    fetchMock.mockResolvedValue(makeAudioResponse())

    const provider = makeProvider()
    await provider.synthesize('voice-id', 'text', {
      stability: 0.9,
      similarity_boost: 0.4,
      style: 0.1,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.voice_settings.stability).toBe(0.9)
    expect(body.voice_settings.similarity_boost).toBe(0.4)
    expect(body.voice_settings.style).toBe(0.1)
  })
})
