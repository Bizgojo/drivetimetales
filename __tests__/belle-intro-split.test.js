/**
 * Regression test for Belle intro [LISTENER_NAME] split bug.
 *
 * Commit f02b4a87 fixed a production bug where calling generateVoiceLine()
 * with an empty string (when the intro text started with [LISTENER_NAME])
 * caused ElevenLabs to return ~10KB of silence, which validate_belle_assets
 * correctly rejects.
 *
 * The fix conditionally skips generation for empty/too-short beforeText / empty afterText.
 * This file tests all four acceptance-criteria cases.
 */

'use strict'

// ── Extracted logic from generate-voices/route.ts ────────────────────────────
// This mirrors the exact conditional block introduced in commit f02b4a87.
// We test this logic in isolation so no ElevenLabs / Supabase calls are made.

/**
 * @param {string} introText           - The raw Belle B intro script line
 * @param {Function} generateVoiceLine - Injected mock; mirrors real signature
 * @param {string} voiceId             - Belle B canonical voice ID
 * @param {string} storyId             - Story identifier
 * @param {number} lineIndex           - Script line index
 * @returns {Promise<{beforeUrl: string|null, afterUrl: string|null, primaryUrl: string}>}
 */
async function generateBelleIntroWithName(introText, generateVoiceLine, voiceId, storyId, lineIndex) {
  const parts = introText.split('[LISTENER_NAME]')
  const beforeText = parts[0].trim()
  const afterText = parts[1].trim()
  const usableBeforeText = beforeText.length >= 10 ? beforeText : ''

  if (!usableBeforeText && !afterText) {
    throw new Error('Belle B intro has [LISTENER_NAME] but no usable surrounding text.')
  }

  let beforeUrl = null
  let afterUrl = null
  let primaryUrl

  // When only one side is non-empty, use the 'intro' prefix so render_final_mix finds it
  // as a standalone intro_*.mp3 instead of an orphaned intro_before_* or intro_after_*.
  if (usableBeforeText && afterText) {
    // [LISTENER_NAME] in the middle — generate a matched before/after pair
    beforeUrl = await generateVoiceLine(usableBeforeText, voiceId, storyId, lineIndex, 'intro_before')
    afterUrl  = await generateVoiceLine(afterText,  voiceId, storyId, lineIndex + 0.1, 'intro_after')
    primaryUrl = beforeUrl
  } else if (afterText) {
    // [LISTENER_NAME] at start — only afterText; generate as standalone intro
    primaryUrl = await generateVoiceLine(afterText, voiceId, storyId, lineIndex, 'intro')
  } else {
    // [LISTENER_NAME] at end — only beforeText; generate as standalone intro
    primaryUrl = await generateVoiceLine(usableBeforeText, voiceId, storyId, lineIndex, 'intro')
  }

  return { beforeUrl, afterUrl, primaryUrl }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const VOICE_ID = 'belle-b-canonical-voice-id'
const STORY_ID = 'test-story-001'
const LINE_INDEX = 0
const FAKE_URL = 'https://cdn.supabase.example.com/audio/asc3/test-story-001/intro_0000.mp3'

describe('Belle intro [LISTENER_NAME] split — regression suite (f02b4a87)', () => {
  let generateVoiceLine

  beforeEach(() => {
    generateVoiceLine = jest.fn().mockResolvedValue(FAKE_URL)
  })

  // ── Case 1 ────────────────────────────────────────────────────────────────
  test(
    'case 1: intro STARTS with [LISTENER_NAME] — generates standalone intro (not intro_after); beforeUrl and afterUrl both null',
    async () => {
      const introText = '[LISTENER_NAME], a dead man scratched his initials into a bridge abutment.'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // beforeText is empty → NO intro_before call
      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(0)

      // afterText is non-empty but [LISTENER_NAME] is at the start → use 'intro' prefix (not 'intro_after')
      const afterCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')
      expect(afterCalls).toHaveLength(0)

      // standalone intro call with 'intro' prefix
      const introCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro')
      expect(introCalls).toHaveLength(1)
      expect(introCalls[0][0]).toBe(', a dead man scratched his initials into a bridge abutment.')

      // intro_before_url and intro_after_url are both null (no pairing)
      expect(beforeUrl).toBeNull()
      expect(afterUrl).toBeNull()

      // primaryUrl is the standalone intro URL
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── Case 2 ────────────────────────────────────────────────────────────────
  test(
    'case 2: [LISTENER_NAME] in the MIDDLE — both intro_before and intro_after generated; both URLs non-null',
    async () => {
      const introText = 'Tonight in Briarwood, [LISTENER_NAME], a mystery begins.'

      const { beforeUrl, afterUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // beforeText is long enough → intro_before IS generated with that text
      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(1)
      expect(beforeCalls[0][0]).toBe('Tonight in Briarwood,')

      // afterText = ", a mystery begins." (the comma after [LISTENER_NAME] is preserved)
      // → intro_after IS generated with that text
      const afterCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')
      expect(afterCalls).toHaveLength(1)
      expect(afterCalls[0][0]).toBe(', a mystery begins.')

      // both URLs non-null
      expect(beforeUrl).not.toBeNull()
      expect(afterUrl).not.toBeNull()
    }
  )

  // ── Case 3 ────────────────────────────────────────────────────────────────
  test(
    'case 3: intro ENDS with [LISTENER_NAME] — generates standalone intro (not intro_before); beforeUrl and afterUrl both null',
    async () => {
      // Note: input has no trailing period after [LISTENER_NAME] so afterText
      // trims to "" — if a period were present, afterText would be "." (non-empty).
      // This is the canonical form for an intro that ends with the listener's name.
      const introText = 'A mystery begins for you, [LISTENER_NAME]'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // afterText is empty → NO intro_after call
      const afterCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')
      expect(afterCalls).toHaveLength(0)

      // beforeText is non-empty but [LISTENER_NAME] is at the end → use 'intro' prefix (not 'intro_before')
      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(0)

      // standalone intro call with 'intro' prefix
      const introCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro')
      expect(introCalls).toHaveLength(1)
      expect(introCalls[0][0]).toBe('A mystery begins for you,')

      // intro_before_url and intro_after_url are both null (no pairing)
      expect(beforeUrl).toBeNull()
      expect(afterUrl).toBeNull()

      // primaryUrl is the standalone intro URL
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── Case 4 (REGRESSION) ──────────────────────────────────────────────────
  test(
    'case 4 (REGRESSION): only placeholder [LISTENER_NAME] — throws "Belle B intro has [LISTENER_NAME] but no usable surrounding text."',
    async () => {
      const introText = '[LISTENER_NAME]'

      await expect(
        generateBelleIntroWithName(introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX)
      ).rejects.toThrow('Belle B intro has [LISTENER_NAME] but no usable surrounding text.')

      // No voice generation calls should have been made
      expect(generateVoiceLine).not.toHaveBeenCalled()
    }
  )

  test(
    'case 5: short beforeText is skipped and afterText becomes standalone intro',
    async () => {
      const introText = 'Welcome, [LISTENER_NAME] — the laundry chute was never supposed to open from the inside.'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')).toHaveLength(0)
      expect(generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')).toHaveLength(0)

      const introCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro')
      expect(introCalls).toHaveLength(1)
      expect(introCalls[0][0]).toBe('— the laundry chute was never supposed to open from the inside.')
      expect(beforeUrl).toBeNull()
      expect(afterUrl).toBeNull()
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )
})
