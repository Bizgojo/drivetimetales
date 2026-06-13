/**
 * silence-buffer-threshold.test.js
 *
 * Acceptance tests for ATL-PIPE-001 text-length-aware SILENCE_BUFFER threshold.
 *
 * Short segments (< 10 words) use 5KB floor.
 * Standard segments (>= 10 words) use 20KB threshold.
 */

const SHORT_SEGMENT_THRESHOLD = 5 * 1024   // 5,120 bytes
const STANDARD_THRESHOLD = 20 * 1024       // 20,480 bytes

/**
 * Extracted logic mirror of the threshold check in route.ts generateAttempt().
 * Returns null if valid, throws if rejected.
 */
function checkSilenceBuffer(rawText, bufferLength, fileName = 'segment_0005.mp3') {
  const segmentWordCount = rawText.trim().split(/\s+/).length
  const isShortSegment = segmentWordCount < 10
  const effectiveThreshold = isShortSegment ? SHORT_SEGMENT_THRESHOLD : STANDARD_THRESHOLD
  if (bufferLength <= effectiveThreshold) {
    const thresholdLabel = isShortSegment
      ? `${effectiveThreshold} short-segment threshold, ${segmentWordCount} words`
      : `${effectiveThreshold} standard threshold, ${segmentWordCount} words`
    throw new Error(`SILENCE_BUFFER: ${fileName} rejected — ElevenLabs returned ${bufferLength} bytes (≤ ${thresholdLabel})`)
  }
  return null
}

describe('SILENCE_BUFFER text-length-aware threshold', () => {

  // Test 1: 3-word text + 19,688 bytes → should NOT throw (passes short-segment 5KB threshold)
  test('3-word text with 19,688 bytes should NOT be rejected (short-segment threshold)', () => {
    const text = 'She said nothing.'
    expect(() => checkSilenceBuffer(text, 19688)).not.toThrow()
  })

  // Test 2: 3-word text + 2,048 bytes → SHOULD throw (below short-segment 5KB threshold)
  test('3-word text with 2,048 bytes SHOULD be rejected (below 5KB short-segment threshold)', () => {
    const text = 'She said nothing.'
    expect(() => checkSilenceBuffer(text, 2048)).toThrow(/SILENCE_BUFFER/)
    expect(() => checkSilenceBuffer(text, 2048)).toThrow(/short-segment threshold/)
    expect(() => checkSilenceBuffer(text, 2048)).toThrow(/3 words/)
  })

  // Test 3: 25-word text + 19,688 bytes → SHOULD throw (below standard 20KB threshold)
  test('25-word text with 19,688 bytes SHOULD be rejected (below standard 20KB threshold)', () => {
    const text = 'She walked down the long winding road toward the old farmhouse where the lights still burned despite the late hour of the night.'
    const wordCount = text.trim().split(/\s+/).length
    expect(wordCount).toBeGreaterThanOrEqual(10) // confirm it's a standard-threshold segment
    expect(() => checkSilenceBuffer(text, 19688)).toThrow(/SILENCE_BUFFER/)
    expect(() => checkSilenceBuffer(text, 19688)).toThrow(/standard threshold/)
  })

  // Test 4: 25-word text + 25,000 bytes → should NOT throw (above standard threshold)
  test('25-word text with 25,000 bytes should NOT be rejected (above standard 20KB threshold)', () => {
    const text = 'She walked down the long winding road toward the old farmhouse where the lights still burned despite the late hour of the night.'
    expect(() => checkSilenceBuffer(text, 25000)).not.toThrow()
  })

  // Boundary: exactly at short-segment threshold (5120) should still throw
  test('3-word text with exactly 5,120 bytes SHOULD be rejected (≤ threshold)', () => {
    const text = 'She said nothing.'
    expect(() => checkSilenceBuffer(text, 5120)).toThrow(/SILENCE_BUFFER/)
  })

  // Boundary: one byte above short-segment threshold should pass
  test('3-word text with 5,121 bytes should NOT be rejected (> short-segment threshold)', () => {
    const text = 'She said nothing.'
    expect(() => checkSilenceBuffer(text, 5121)).not.toThrow()
  })

  // Word count boundary: exactly 9 words uses short-segment threshold
  test('9-word text with 19,688 bytes should NOT be rejected (short-segment threshold)', () => {
    const text = 'She said nothing as she turned and walked away.'
    const wordCount = text.trim().split(/\s+/).length
    expect(wordCount).toBe(9)
    expect(() => checkSilenceBuffer(text, 19688)).not.toThrow()
  })

  // Word count boundary: exactly 10 words uses standard threshold
  test('10-word text with 19,688 bytes SHOULD be rejected (standard threshold applies)', () => {
    const text = 'She said nothing as she turned and slowly walked away.'
    const wordCount = text.trim().split(/\s+/).length
    expect(wordCount).toBe(10)
    expect(() => checkSilenceBuffer(text, 19688)).toThrow(/standard threshold/)
  })

})
