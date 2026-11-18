/**
 * PRONUNCIATION-001 regression: "Rerouted" must reach the voice as "Re-rout-ed"
 * (re-ROWT-ed), and the trailing-dash fix must keep working.
 */
import { speakableText } from '../lib/speakableText'
import { applyPronunciationOverrides } from '../lib/pronunciationOverrides'

describe('PRONUNCIATION-001 Rerouted', () => {
  test('mid-sentence lowercase is respelled', () => {
    expect(speakableText('The call was rerouted twice.')).toBe('The call was Re-rout-ed twice.')
  })

  test('sentence-initial capital is respelled', () => {
    expect(speakableText('Rerouted, the driver said.')).toBe('Re-rout-ed, the driver said.')
  })

  test('ALL CAPS stays ALL CAPS', () => {
    expect(speakableText('REROUTED.')).toBe('RE-ROUT-ED.')
  })

  test('does not match inside a longer word', () => {
    expect(speakableText('Unrerouted routes stay put.')).toBe('Unrerouted routes stay put.')
  })

  test('applies to Belle intro wording too', () => {
    const belle = "Welcome to Rerouted. Tonight, a call gets rerouted."
    expect(speakableText(belle)).toBe(
      'Welcome to Re-rout-ed. Tonight, a call gets Re-rout-ed.'
    )
  })

  test('is idempotent', () => {
    const once = applyPronunciationOverrides('Rerouted')
    expect(applyPronunciationOverrides(once)).toBe(once)
  })

  test('trailing dash fix still works and composes with the respelling', () => {
    expect(speakableText('Then everything was rerouted —')).toBe('Then everything was Re-rout-ed…')
  })

  test('symbol-only and empty text pass through untouched', () => {
    expect(speakableText('')).toBe('')
    expect(speakableText('—')).toBe('—')
    expect(speakableText(null as unknown as string)).toBe('')
  })
})
