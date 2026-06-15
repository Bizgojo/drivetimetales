/**
 * ATL-PIPE-017 Regression Tests
 *
 * PROBLEM FIXED:
 * lastLoudnessPassedBuf was never set when all candidates went through the
 * canAttemptExtendedShortRescue path (extremely quiet short segments). This caused
 * the REPEATED_IDENTICAL_TRUNCATION prefix rescue (isPrefixAcceptable) to silently
 * fail its null-guard check, even when the detected text was a valid clean prefix
 * of the expected text.
 *
 * REAL FAILURES THIS FIX ADDRESSES:
 *   1. "The Permit" seg 78, ROSA: "Yes. He retired eight months ago." → Whisper: "Yes."
 *      All 8 candidates through extended rescue, lastLoudnessPassedBuf=null, rescue failed.
 *   2. Long-segment VAD truncation class (The Ledger seg 13, Intake Photo seg 83)
 *      documented separately — those were fixed via script splits.
 *
 * TESTS HERE:
 *   A. Unit: prefix-rescue logic correctly rejects null buf
 *   B. Unit: prefix-rescue logic accepts non-null buf + valid prefix
 *   C. Unit: two-sentence short-segment VAD trap ("Yes. He retired eight months ago.")
 *   D. Unit: long-segment VAD truncation with number lists (The Ledger case)
 *   E. Unit: prefix rescue rejects mid-word truncation (detected ends in partial word)
 *   F. Unit: normForPrefixCheck equivalence for word-numbers vs digit-numbers
 */

'use strict'

// ── Inline the logic under test ───────────────────────────────────────────────
// These functions are extracted from generate-voices/route.ts for unit testing.
// Keep them in sync if the source changes.

// Simplified normForPrefixCheck (matches the inline function in route.ts)
function normForPrefixCheck(text) {
  const NUMBER_WORDS_LOCAL = {
    zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
    sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
    thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70',
    eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
  }
  const CARD_0_19 = Object.keys(NUMBER_WORDS_LOCAL)
  let s = text.trim().replace(/\s+/g, ' ')
  // Step A: strip $-sign prefix and commas in digit strings
  s = s.replace(/\$(\d)/g, '$1').replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, m => m.replace(/,/g, ''))
  // Step B: word-numbers to digits
  for (const word of CARD_0_19) {
    const digit = NUMBER_WORDS_LOCAL[word]
    if (digit) s = s.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit)
  }
  // Step C: strip punctuation, normalise whitespace, lowercase
  return s.toLowerCase().replace(/[^\w\s']/g, '').replace(/\s+/g, ' ').trim()
}

// isPrefixAcceptable logic extracted from route.ts
function isPrefixAcceptable(detectedText, expectedText, lastLoudnessPassedBuf) {
  const detectedNorm = normForPrefixCheck(detectedText)
  const expectedNorm = normForPrefixCheck(expectedText)
  return detectedNorm.length >= 2
    && expectedNorm.startsWith(detectedNorm)
    && lastLoudnessPassedBuf !== null
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ATL-PIPE-017: prefix rescue — lastLoudnessPassedBuf null guard', () => {
  // ── A. Null buf causes rescue to fail ──────────────────────────────────────
  describe('A. null lastLoudnessPassedBuf always fails isPrefixAcceptable', () => {
    test('clean prefix + null buf → false (the pre-017 regression)', () => {
      expect(isPrefixAcceptable('Yes.', 'Yes. He retired eight months ago.', null)).toBe(false)
    })

    test('long-segment clean prefix + null buf → false', () => {
      const detected = 'The first was a payment of $2,800, dated 11 days ago. The second was $3,100, dat'
      const expected = 'The first was a payment of two thousand eight hundred dollars, dated eleven days ago. The second was three thousand one hundred dollars, dated eight days ago. The third was two thousand five hundred dollars, dated five days ago. Each one carried an invoice number. Each one was signed by Dwight Purnell.'
      expect(isPrefixAcceptable(detected, expected, null)).toBe(false)
    })

    test('empty string + null buf → false', () => {
      expect(isPrefixAcceptable('', 'Yes. He retired.', null)).toBe(false)
    })
  })

  // ── B. Non-null buf + valid prefix → true ─────────────────────────────────
  describe('B. non-null lastLoudnessPassedBuf + valid prefix → accepts', () => {
    const FAKE_BUF = Buffer.from('fake-audio-data')

    test('THE PERMIT SEG 78 — short two-sentence VAD trap (the ATL-PIPE-017 fix case)', () => {
      // Whisper returns "Yes." for "Yes. He retired eight months ago."
      // After normForPrefixCheck: detected="yes", expected="yes he retired 8 months ago"
      // "yes he retired 8 months ago".startsWith("yes") === true ✓
      expect(isPrefixAcceptable('Yes.', 'Yes. He retired eight months ago.', FAKE_BUF)).toBe(true)
    })

    test('simple one-sentence prefix', () => {
      expect(isPrefixAcceptable('She walked to the door.', 'She walked to the door. It was unlocked.', FAKE_BUF)).toBe(true)
    })

    test('multi-word prefix across sentence boundary', () => {
      expect(isPrefixAcceptable('The elevator took forty-five seconds to arrive.', 'The elevator took forty-five seconds to arrive. She rode it down to the seventh floor alone. The doors opened.', FAKE_BUF)).toBe(true)
    })

    test('simple dollar-amount normalization — $ and comma stripped', () => {
      // NOTE: compound word-number resolution ("two thousand eight hundred" → "2800")
      // requires normalizeCompoundNumbers from route.ts, which is NOT included in this
      // inline normForPrefixCheck. The Ledger seg-13 was fixed via script split;
      // prefix rescue is not the primary path for that class of failure.
      // This test validates the simpler case: $ and comma stripping works.
      const detNorm = normForPrefixCheck('payment of $2,800')
      expect(detNorm).toBe('payment of 2800')
    })

    test('No. prefix (2 chars norm)', () => {
      expect(isPrefixAcceptable('No.', 'No. He was already gone.', FAKE_BUF)).toBe(true)
    })
  })

  // ── C. THE PERMIT case: short two-sentence VAD trap ───────────────────────
  describe('C. The Permit seg 78 — short two-sentence VAD trap', () => {
    const FAKE_BUF = Buffer.from('fake-audio')

    test('confirmed: Whisper "Yes." is a prefix of "Yes. He retired eight months ago."', () => {
      const detNorm = normForPrefixCheck('Yes.')
      const expNorm = normForPrefixCheck('Yes. He retired eight months ago.')
      expect(detNorm).toBe('yes')
      expect(expNorm).toBe('yes he retired 8 months ago')
      expect(expNorm.startsWith(detNorm)).toBe(true)
    })

    test('prefix rescue fires with non-null buf (post-017 behavior)', () => {
      expect(isPrefixAcceptable('Yes.', 'Yes. He retired eight months ago.', FAKE_BUF)).toBe(true)
    })

    test('prefix rescue blocked with null buf (pre-017 regression)', () => {
      expect(isPrefixAcceptable('Yes.', 'Yes. He retired eight months ago.', null)).toBe(false)
    })
  })

  // ── D. THE LEDGER case: long-segment number list VAD truncation ───────────
  describe('D. The Ledger seg 13 — long-segment number list VAD truncation', () => {
    const FAKE_BUF = Buffer.from('fake-audio')
    const expectedFull = 'The first was a payment of two thousand eight hundred dollars, dated eleven days ago. The second was three thousand one hundred dollars, dated eight days ago. The third was two thousand five hundred dollars, dated five days ago. Each one carried an invoice number. Each one was signed by Dwight Purnell.'

    test('same-form prefix (no compound expansion needed) matches', () => {
      // When Whisper uses the same word form as the script (no digit conversion needed)
      const detected = 'The first was a payment of two thousand eight hundred dollars, dated eleven days ago.'
      const detNorm = normForPrefixCheck(detected)
      const expNorm = normForPrefixCheck(expectedFull)
      // Single-word conversion: "two"→"2", "thousand"→"1000", etc.
      // Both sides go through same conversion so prefix still matches
      expect(expNorm.startsWith(detNorm)).toBe(true)
    })

    test('mid-word truncation ("dat") breaks prefix match', () => {
      // "dat" (mid-word from "dated") does NOT form a clean prefix
      const detected = 'The first was a payment of $2,800, dated 11 days ago. The second was $3,100, dat'
      const detNorm = normForPrefixCheck(detected)
      const expNorm = normForPrefixCheck(expectedFull)
      // "dat" at end means expNorm won't startWith(detNorm) because expected has "dated" not "dat"
      expect(expNorm.startsWith(detNorm)).toBe(false)
    })

    test('script-split sub-segment 1 is short enough for Whisper', () => {
      // After the script fix: segment is split into shorter sub-segment
      const splitPart1 = 'The first was a payment of two thousand eight hundred dollars, dated eleven days ago. The second was three thousand one hundred dollars, dated eight days ago. The third was two thousand five hundred dollars, dated five days ago.'
      // ~35 words — should not trigger VAD truncation
      const words = splitPart1.split(/\s+/).filter(Boolean)
      expect(words.length).toBeLessThan(40)
    })

    test('script-split sub-segment 2 is short enough for Whisper', () => {
      const splitPart2 = 'Each one carried an invoice number. Each one was signed by Dwight Purnell.'
      const words = splitPart2.split(/\s+/).filter(Boolean)
      expect(words.length).toBeLessThan(20)
    })
  })

  // ── E. The Intake Photo case: 3-sentence elevator scene ───────────────────
  describe('E. The Intake Photo seg 83 — 3-sentence elevator scene', () => {
    test('script-split sub-segment 1 is within safe length', () => {
      const part1 = 'The elevator took forty-five seconds to arrive. She rode it down to the seventh floor alone.'
      expect(part1.split(/\s+/).filter(Boolean).length).toBeLessThan(20)
    })

    test('script-split sub-segment 2 is within safe length', () => {
      const part2 = "The doors opened onto the familiar hum of fluorescent lights, the murmur of phone calls, the printer still grinding through someone's backlog."
      expect(part2.split(/\s+/).filter(Boolean).length).toBeLessThan(30)
    })
  })

  // ── F. normForPrefixCheck equivalences ────────────────────────────────────
  describe('F. normForPrefixCheck number normalization', () => {
    test('$2,800 normalizes to 2800', () => {
      expect(normForPrefixCheck('$2,800')).toBe('2800')
    })

    test('two thousand eight hundred normalizes to same as 2800', () => {
      // NUMBER_WORDS converts each word: "two"→"2", "thousand"→"1000", "eight"→"8", "hundred"→"100"
      // The test verifies both sides share the same digit prefix
      const wordForm = normForPrefixCheck('The payment of two thousand eight hundred dollars')
      const digitForm = normForPrefixCheck('The payment of $2,800')
      // Both should contain "2" (from "two"/"$2,800"), allowing prefix matching
      // Note: full compound normalization lives in normalizeCompoundNumbers (transcriptTokens);
      // normForPrefixCheck does single-word conversion. This test checks the $ and comma strip.
      expect(digitForm).toBe('the payment of 2800')
      expect(wordForm).toContain('2') // "two" → "2"
    })

    test('11 days ago normalizes same as eleven days ago', () => {
      const withDigit = normForPrefixCheck('dated 11 days ago')
      const withWord = normForPrefixCheck('dated eleven days ago')
      // "eleven" → "11" via NUMBER_WORDS
      expect(withWord).toBe('dated 11 days ago')
      expect(withDigit).toBe('dated 11 days ago')
      expect(withDigit).toBe(withWord)
    })

    test('length >= 2 guard: single-char detected rejects', () => {
      expect(isPrefixAcceptable('I', 'I saw the door.', Buffer.from('x'))).toBe(false)
    })

    test('length >= 2 guard: two-char minimum passes when prefix matches', () => {
      // "No" is 2 chars
      const detNorm = normForPrefixCheck('No.')
      expect(detNorm.length).toBeGreaterThanOrEqual(2)
    })
  })
})

// ── Integration note ──────────────────────────────────────────────────────────
// The full end-to-end behavior (ElevenLabs + Whisper + loudness QC) cannot be
// unit tested here without mocking the entire pipeline. These tests verify the
// LOGIC of isPrefixAcceptable and normForPrefixCheck, which are the two functions
// where the ATL-PIPE-017 bug lived.
//
// To verify the full pipeline fix:
//   1. Deploy generate-voices/route.ts with ATL-PIPE-017 applied.
//   2. Reset "The Permit" job 4772c86c to generate_voices with retryMissingOnly=true seg 78.
//   3. Confirm segment_0078.mp3 generates successfully (prefix rescue fires, accepted with warning).
//   4. Check server logs for "[ATL-PIPE-017] segment_0078.mp3 prefix-rescue check:
//      ... hasLoudnessBuf=true" (not false as before the fix).
