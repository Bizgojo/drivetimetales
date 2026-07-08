/**
 * Tests for BLP genre-contract check — GENRE-ATTRIBUTES-SPEC v1.0 §5
 *
 * Covers:
 * - Hard rule AUTO-FAIL case
 * - Pass case (genre contract satisfied)
 * - Fallback to universal floor when no genre attributes exist
 * - isDarkExceptionGenre logic
 */

// ─── Module mocks ────────────────────────────────────────────────────────────

// Mock supabase before anything tries to instantiate it
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        ilike: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
}))

// Shared mock create fn — updated per-test via mockResolvedValue
const mockCreate = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  }
})

jest.mock('../lib/genreAttributes', () => ({
  getGenreAttributes: jest.fn(),
  parseHardRules: jest.requireActual('../lib/genreAttributes').parseHardRules,
  parseEndingFailureModes: jest.requireActual('../lib/genreAttributes').parseEndingFailureModes,
  isDarkExceptionGenre: jest.fn(async (genre: string) => {
    // delegate to the actual getGenreAttributes mock
    const { getGenreAttributes: mockGet } = jest.requireMock('../lib/genreAttributes')
    const attrs = await mockGet(genre)
    if (!attrs?.cover_art_guidance) return false
    return attrs.cover_art_guidance.toLowerCase().includes('dark exception applies')
  }),
}))

import { checkGenreEndingContract } from '../lib/blpGenreContract'
import { getGenreAttributes, parseHardRules, parseEndingFailureModes } from '../lib/genreAttributes'

const mockGetGenreAttributes = getGenreAttributes as jest.MockedFunction<typeof getGenreAttributes>

function makeAnthropicMock(responseJson: object) {
  mockCreate.mockResolvedValue({
    content: [{ text: JSON.stringify(responseJson) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  })
}

// ─── Unit tests: parseHardRules ──────────────────────────────────────────────

describe('parseHardRules', () => {
  it('parses bullet-separated rules', () => {
    const input = '• Rule one\n• Rule two\n• Rule three'
    expect(parseHardRules(input)).toEqual(['Rule one', 'Rule two', 'Rule three'])
  })

  it('parses JSON array rules', () => {
    const input = JSON.stringify(['Rule A', 'Rule B'])
    expect(parseHardRules(input)).toEqual(['Rule A', 'Rule B'])
  })

  it('returns empty array for null', () => {
    expect(parseHardRules(null)).toEqual([])
  })
})

// ─── Unit tests: parseEndingFailureModes ────────────────────────────────────

describe('parseEndingFailureModes', () => {
  it('parses failure modes from bullet text', () => {
    const input = '• Emotional resolution without logical solution\n• Reveal depending on information never given'
    expect(parseEndingFailureModes(input)).toHaveLength(2)
  })
})

// ─── Integration tests: checkGenreEndingContract ────────────────────────────

describe('checkGenreEndingContract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('AUTO-FAIL: returns autoFail=true when a hard rule is violated', async () => {
    makeAnthropicMock({
      pass: false,
      autoFail: true,
      violatedHardRule: 'Solution derivable from planted clues',
      endingTypeDetected: 'unresolved',
      reason: 'The reveal depends on information never given to the listener.',
      confidence: 0.95,
    })

    mockGetGenreAttributes.mockResolvedValue({
      name: 'Mystery',
      listener_contract: 'A fair puzzle the listener could have solved.',
      pacing_profile: 'Methodical; information revealed in layers.',
      ending_contract: 'THE CLICK — a reveal that logically re-orders everything.',
      ending_failure_modes: '• Emotional resolution without logical solution\n• Reveal depending on information never given',
      sound_profile: 'Restrained music.',
      narrator_register: 'Measured, precise, withholding.',
      cover_art_guidance: 'Standard bright rule applies.',
      adjacency_group: 'INVESTIGATIVE',
      hard_rules: '• Solution derivable from planted clues\n• No reveal without prior setup\n• The central question posed in the opening is answered',
      alias_of: null,
    })

    const result = await checkGenreEndingContract(
      'story-001',
      'Mystery',
      'NARRATOR: The killer was someone never mentioned before. The end.',
    )

    expect(result.pass).toBe(false)
    expect(result.autoFail).toBe(true)
    expect(result.violatedRule).toBe('Solution derivable from planted clues')
    expect(result.fallbackToUniversal).toBe(false)
    expect(result.genre).toBe('Mystery')
  })

  it('PASS: returns pass=true when genre contract is satisfied', async () => {
    makeAnthropicMock({
      pass: true,
      autoFail: false,
      violatedHardRule: '',
      endingTypeDetected: 'resolved',
      reason: 'The reveal re-orders all planted clues logically. The opening question is answered.',
      confidence: 0.92,
    })

    mockGetGenreAttributes.mockResolvedValue({
      name: 'Mystery',
      listener_contract: 'A fair puzzle the listener could have solved.',
      pacing_profile: 'Methodical; information revealed in layers.',
      ending_contract: 'THE CLICK — a reveal that logically re-orders everything.',
      ending_failure_modes: '• Emotional resolution without logical solution',
      sound_profile: 'Restrained music.',
      narrator_register: 'Measured, precise, withholding.',
      cover_art_guidance: 'Standard bright rule applies.',
      adjacency_group: 'INVESTIGATIVE',
      hard_rules: '• Solution derivable from planted clues\n• No reveal without prior setup\n• The central question posed in the opening is answered',
      alias_of: null,
    })

    const result = await checkGenreEndingContract(
      'story-002',
      'Mystery',
      'NARRATOR: It was the gardener — the clue was in the soil sample from chapter one. The case is closed.',
    )

    expect(result.pass).toBe(true)
    expect(result.autoFail).toBe(false)
    expect(result.violatedRule).toBeUndefined()
    expect(result.fallbackToUniversal).toBe(false)
  })

  it('FALLBACK: uses universal floor when no genre attributes exist', async () => {
    makeAnthropicMock({
      pass: true,
      autoFail: false,
      violatedHardRule: '',
      endingTypeDetected: 'resolved',
      reason: 'The protagonist resolved the central conflict on-page.',
      confidence: 0.80,
    })

    mockGetGenreAttributes.mockResolvedValue(null)

    const result = await checkGenreEndingContract(
      'story-003',
      'UnknownGenre',
      'NARRATOR: She defeated the monster and walked home.',
    )

    expect(result.pass).toBe(true)
    expect(result.fallbackToUniversal).toBe(true)
  })

  it('FAIL: returns pass=false with genre-specific reason when contract violated holistically', async () => {
    makeAnthropicMock({
      pass: false,
      autoFail: false,
      violatedHardRule: '',
      endingTypeDetected: 'unresolved',
      reason: 'The accumulated pressure deflated before the climax instead of releasing decisively.',
      confidence: 0.88,
    })

    mockGetGenreAttributes.mockResolvedValue({
      name: 'Thriller',
      listener_contract: 'Escalating pressure with everything at stake.',
      pacing_profile: 'A ticking clock; shrinking options.',
      ending_contract: 'RELEASE — the accumulated pressure breaks decisively.',
      ending_failure_modes: '• Tension deflating before the climax\n• Threat resolved off-screen',
      sound_profile: 'Tighter music ducking.',
      narrator_register: 'Urgent, driving, close.',
      cover_art_guidance: 'Standard bright rule applies.',
      adjacency_group: 'SUSPENSE',
      hard_rules: '• A clock or closing window exists and is felt\n• The climax happens on-page\n• The ending releases the pressure',
      alias_of: null,
    })

    const result = await checkGenreEndingContract(
      'story-004',
      'Thriller',
      'NARRATOR: The bomb was already defused by the time she arrived. She went home feeling okay.',
    )

    expect(result.pass).toBe(false)
    expect(result.autoFail).toBe(false)
    expect(result.genre).toBe('Thriller')
  })
})

// ─── Unit tests: isDarkExceptionGenre (via mock) ────────────────────────────

describe('isDarkExceptionGenre (via getGenreAttributes mock)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns true for Horror genre with DARK EXCEPTION APPLIES in cover_art_guidance', async () => {
    mockGetGenreAttributes.mockResolvedValue({
      name: 'Horror',
      listener_contract: 'Dread that lingers.',
      pacing_profile: 'Slow accumulation.',
      ending_contract: 'THE LINGER.',
      ending_failure_modes: null,
      sound_profile: null,
      narrator_register: null,
      cover_art_guidance: 'DARK EXCEPTION APPLIES — subject matter legitimately dictates darker palettes.',
      adjacency_group: 'SUSPENSE',
      hard_rules: null,
      alias_of: null,
    })

    const { isDarkExceptionGenre } = require('../lib/genreAttributes')
    const result = await isDarkExceptionGenre('Horror')
    expect(result).toBe(true)
  })

  it('returns false for Mystery genre (no dark exception)', async () => {
    mockGetGenreAttributes.mockResolvedValue({
      name: 'Mystery',
      listener_contract: 'A fair puzzle.',
      pacing_profile: 'Methodical.',
      ending_contract: 'THE CLICK.',
      ending_failure_modes: null,
      sound_profile: null,
      narrator_register: null,
      cover_art_guidance: 'Standard bright rule applies.',
      adjacency_group: 'INVESTIGATIVE',
      hard_rules: null,
      alias_of: null,
    })

    const { isDarkExceptionGenre } = require('../lib/genreAttributes')
    const result = await isDarkExceptionGenre('Mystery')
    expect(result).toBe(false)
  })
})
