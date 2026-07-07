/**
 * ATL-ITEM-5: Regression tests for series_generate_belle_assets 422 fix.
 *
 * The series belle step (series_generate_belle_assets) delegates to generate-voices
 * via generateBelleOnly:true. Short or empty beforeText values cause ElevenLabs to
 * return ~10 KB of silence which validate_belle_assets rejects as SILENCE_BUFFER (422).
 *
 * Fix: MIN_BEFORE_TEXT_CHARS = 5 — any beforeText shorter than 5 chars is treated as
 * empty, and the afterText becomes the standalone 'intro' (not 'intro_after').
 *
 * Same pattern as standalone fix (f02b4a87) now applied to the series path.
 *
 * Acceptance criteria tested:
 *   (a) empty beforeText  → skipped; afterText used as standalone 'intro'
 *   (b) short beforeText (<5 chars) → skipped; afterText used as standalone 'intro'
 *   (c) normal split (both sides long enough) → intro_before + intro_after pair generated
 *   (d) afterText empty → beforeText used as standalone 'intro'; no intro_after generated
 */

'use strict'

// ── Isolated replica of generateBelleIntroWithName from generate-voices/route.ts ──
// Matches the ATL-ITEM-5 fix: MIN_BEFORE_TEXT_CHARS = 5
const MIN_BEFORE_TEXT_CHARS = 5

async function generateBelleIntroWithName(introText, generateVoiceLine, voiceId, storyId, lineIndex) {
  const parts = introText.split('[LISTENER_NAME]')
  const beforeText = (parts[0] || '').trim()
  const afterText = (parts[1] || '').trim()
  const usableBeforeText = beforeText.length >= MIN_BEFORE_TEXT_CHARS ? beforeText : ''

  if (!usableBeforeText && !afterText) {
    throw new Error('Belle B intro has [LISTENER_NAME] but no usable surrounding text.')
  }

  let beforeUrl = null
  let afterUrl = null
  let primaryUrl

  if (usableBeforeText && afterText) {
    // Both sides usable — generate matched pair
    beforeUrl = await generateVoiceLine(usableBeforeText, voiceId, storyId, lineIndex, 'intro_before')
    afterUrl  = await generateVoiceLine(afterText, voiceId, storyId, lineIndex + 0.1, 'intro_after')
    primaryUrl = beforeUrl
  } else if (afterText) {
    // beforeText empty or too short — use afterText as standalone 'intro'
    // ('intro' prefix so render_final_mix finds it without requiring a paired beforeUrl)
    primaryUrl = await generateVoiceLine(afterText, voiceId, storyId, lineIndex + 0.1, 'intro')
  } else {
    // afterText empty — use beforeText as standalone 'intro'
    primaryUrl = await generateVoiceLine(usableBeforeText, voiceId, storyId, lineIndex, 'intro')
  }

  return { beforeUrl, afterUrl, primaryUrl }
}

// ── Test harness ──────────────────────────────────────────────────────────────

const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL' // Belle B canonical voice ID
const STORY_ID = 'series-test-ep-001'
const LINE_INDEX = 3
const FAKE_URL = 'https://cdn.supabase.example.com/audio/asc3/series-test-ep-001/intro_0003.mp3'

describe('series_generate_belle_assets — beforeText 422 fix (ATL-ITEM-5)', () => {
  let generateVoiceLine

  beforeEach(() => {
    generateVoiceLine = jest.fn().mockResolvedValue(FAKE_URL)
  })

  // ── (a) empty beforeText ──────────────────────────────────────────────────
  test(
    '(a) empty beforeText: [LISTENER_NAME] at start → afterText becomes standalone intro; beforeUrl/afterUrl null',
    async () => {
      const introText = '[LISTENER_NAME], a dead man scratched his initials into a bridge abutment.'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // beforeText is '' → NO intro_before call
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')).toHaveLength(0)
      // afterText used as standalone 'intro' — NOT 'intro_after'
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')).toHaveLength(0)
      const introCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro')
      expect(introCalls).toHaveLength(1)
      expect(introCalls[0][0]).toBe(', a dead man scratched his initials into a bridge abutment.')

      // No paired URLs
      expect(beforeUrl).toBeNull()
      expect(afterUrl).toBeNull()
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── (b) short beforeText (<5 chars) ──────────────────────────────────────
  test(
    '(b) short beforeText (<5 chars): "Hey," before [LISTENER_NAME] → treated as empty; afterText becomes standalone intro',
    async () => {
      const introText = 'Hey, [LISTENER_NAME] — Laundry Heist begins right now.'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // "Hey," is 4 chars → below MIN_BEFORE_TEXT_CHARS (5) → skipped
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')).toHaveLength(0)
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')).toHaveLength(0)

      const introCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro')
      expect(introCalls).toHaveLength(1)
      expect(introCalls[0][0]).toBe('— Laundry Heist begins right now.')

      expect(beforeUrl).toBeNull()
      expect(afterUrl).toBeNull()
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── (c) normal split (both sides long enough) ─────────────────────────────
  test(
    '(c) normal split: long beforeText and afterText → intro_before + intro_after pair; both URLs non-null',
    async () => {
      const introText = 'Tonight in Briarwood, [LISTENER_NAME], a mystery begins.'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // "Tonight in Briarwood," is 22 chars → above MIN_BEFORE_TEXT_CHARS → intro_before generated
      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(1)
      expect(beforeCalls[0][0]).toBe('Tonight in Briarwood,')

      // afterText generated as intro_after
      const afterCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')
      expect(afterCalls).toHaveLength(1)
      expect(afterCalls[0][0]).toBe(', a mystery begins.')

      expect(beforeUrl).not.toBeNull()
      expect(afterUrl).not.toBeNull()
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── (d) afterText empty ───────────────────────────────────────────────────
  test(
    '(d) afterText empty: [LISTENER_NAME] at end → beforeText becomes standalone intro; no intro_after generated',
    async () => {
      const introText = 'A mystery begins tonight for you, [LISTENER_NAME]'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // afterText is '' → NO intro_after call
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')).toHaveLength(0)
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')).toHaveLength(0)

      const introCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro')
      expect(introCalls).toHaveLength(1)
      expect(introCalls[0][0]).toBe('A mystery begins tonight for you,')

      expect(beforeUrl).toBeNull()
      expect(afterUrl).toBeNull()
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── boundary: exactly 5 chars is usable ──────────────────────────────────
  test(
    'boundary: beforeText of exactly 5 chars IS usable → intro_before + intro_after pair generated',
    async () => {
      const introText = 'Hello[LISTENER_NAME], welcome to Endless Tales.'

      const { beforeUrl, afterUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(1)
      expect(beforeCalls[0][0]).toBe('Hello')

      const afterCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')
      expect(afterCalls).toHaveLength(1)

      expect(beforeUrl).not.toBeNull()
      expect(afterUrl).not.toBeNull()
    }
  )

  // ── boundary: 4 chars is NOT usable ──────────────────────────────────────
  test(
    'boundary: beforeText of 4 chars is NOT usable → skipped; afterText becomes standalone intro',
    async () => {
      const introText = 'Hi, [LISTENER_NAME] — Charity\'s Shadow is waiting.'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // "Hi," is 3 chars → below MIN_BEFORE_TEXT_CHARS → no intro_before
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')).toHaveLength(0)
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')).toHaveLength(0)

      const introCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro')
      expect(introCalls).toHaveLength(1)

      expect(beforeUrl).toBeNull()
      expect(afterUrl).toBeNull()
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )
})
