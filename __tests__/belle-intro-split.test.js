/**
 * Regression test for Belle intro [LISTENER_NAME] split bug.
 *
 * Commit f02b4a87 fixed a production bug where calling generateVoiceLine()
 * with an empty string (when the intro text started with [LISTENER_NAME])
 * caused ElevenLabs to return ~10KB of silence, which validate_belle_assets
 * correctly rejects.
 *
 * The fix conditionally skips generation for empty beforeText / afterText.
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

  if (!beforeText && !afterText) {
    throw new Error('Belle B intro has [LISTENER_NAME] but no surrounding text.')
  }

  let beforeUrl = null
  let afterUrl = null

  // Only generate audio for non-empty parts — empty beforeText / afterText would
  // cause ElevenLabs to return ~10KB of silence, failing silence rejection.
  if (beforeText) beforeUrl = await generateVoiceLine(beforeText, voiceId, storyId, lineIndex, 'intro_before')
  if (afterText)  afterUrl  = await generateVoiceLine(afterText,  voiceId, storyId, lineIndex + 0.1, 'intro_after')

  const primaryUrl = (beforeUrl ?? afterUrl)
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
    'case 1: intro STARTS with [LISTENER_NAME] — no intro_before call; afterUrl is primary; beforeUrl null',
    async () => {
      const introText = '[LISTENER_NAME], a dead man scratched his initials into a bridge abutment.'

      const { beforeUrl, afterUrl, primaryUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // beforeText is empty → NO intro_before call
      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(0)

      // afterUrl IS generated
      const afterCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_after')
      expect(afterCalls).toHaveLength(1)

      // intro_before_url stored as null
      expect(beforeUrl).toBeNull()

      // intro_after_url stored with the URL
      expect(afterUrl).toBe(FAKE_URL)

      // primaryUrl = afterUrl (since beforeUrl is null)
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── Case 2 ────────────────────────────────────────────────────────────────
  test(
    'case 2: [LISTENER_NAME] in the MIDDLE — both intro_before and intro_after generated; both URLs non-null',
    async () => {
      const introText = 'Tonight, [LISTENER_NAME], a mystery begins.'

      const { beforeUrl, afterUrl } = await generateBelleIntroWithName(
        introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX
      )

      // beforeText = "Tonight," → intro_before IS generated with that text
      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(1)
      expect(beforeCalls[0][0]).toBe('Tonight,')

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
    'case 3: intro ENDS with [LISTENER_NAME] — no intro_after call; beforeUrl is primary; afterUrl null',
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

      // beforeUrl IS generated
      const beforeCalls = generateVoiceLine.mock.calls.filter(c => c[4] === 'intro_before')
      expect(beforeCalls).toHaveLength(1)
      expect(beforeUrl).toBe(FAKE_URL)

      // intro_after_url stored as null
      expect(afterUrl).toBeNull()

      // primaryUrl = beforeUrl (since afterUrl is null)
      expect(primaryUrl).toBe(FAKE_URL)
    }
  )

  // ── Case 4 (REGRESSION) ──────────────────────────────────────────────────
  test(
    'case 4 (REGRESSION): only placeholder [LISTENER_NAME] — throws "Belle B intro has [LISTENER_NAME] but no surrounding text."',
    async () => {
      const introText = '[LISTENER_NAME]'

      await expect(
        generateBelleIntroWithName(introText, generateVoiceLine, VOICE_ID, STORY_ID, LINE_INDEX)
      ).rejects.toThrow('Belle B intro has [LISTENER_NAME] but no surrounding text.')

      // No voice generation calls should have been made
      expect(generateVoiceLine).not.toHaveBeenCalled()
    }
  )
})
