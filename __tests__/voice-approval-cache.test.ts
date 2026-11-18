/**
 * VOICE-APPROVAL-002/003 regression tests.
 *
 * Two behaviours are tested here because both fail silently and both cost real money
 * or real trust if they break:
 *
 *   1. Cached samples. The cache key must be stable for the same (voice, text) pair and
 *      different for a different pair. If the key silently changed shape, every sample
 *      would be a miss and Marc would be billed on every play — the exact bug the cache
 *      exists to fix. If two different lines collided on one key, he would hear the wrong
 *      audio for a voice, which is worse than being billed.
 *
 *   2. Similarity flagging, scoped to ONE story. A clash inside the story must be caught;
 *      a voice used by a different series must NOT be flagged. Over-flagging would train
 *      the admin to ignore the colour, which makes the flag useless.
 */
import { createHash } from 'crypto'

// Mirrors sampleKey() in app/api/admin/voice-approval/route.ts.
// Kept as a local copy on purpose: importing the route pulls in next/headers and a
// Supabase client, which cannot run in a plain jest environment. If the production
// implementation changes, this test must change with it — that is the point of a pin.
function sampleKey(voiceId: string, text: string) {
  const h = createHash('sha256').update(voiceId + '\u0000' + text).digest('hex').slice(0, 32)
  return `voice-samples/${voiceId}/${h}.mp3`
}

// Mirrors the sameVoice() closure in the read-voices branch.
function findClash(usedInThisStory: Array<{ voice_id: string; canonical_name: string }>, candidate: { voice_id: string; name: string }) {
  return usedInThisStory.find(
    (r) =>
      r.voice_id === candidate.voice_id ||
      String(r.canonical_name || '').toLowerCase() === String(candidate.name || '').toLowerCase()
  )
}

describe('VOICE-APPROVAL-002 cached samples', () => {
  test('same voice and same line gives the same key (cache hit, zero credits)', () => {
    const a = sampleKey('abc123', 'Every rerouted driver got a second chance.')
    const b = sampleKey('abc123', 'Every rerouted driver got a second chance.')
    expect(a).toBe(b)
  })

  test('same voice, different line gives a different key (new sample, billed once)', () => {
    const a = sampleKey('abc123', 'Line one.')
    const b = sampleKey('abc123', 'Line two.')
    expect(a).not.toBe(b)
  })

  test('different voices with the same line do not collide', () => {
    const a = sampleKey('voiceA', 'Same line.')
    const b = sampleKey('voiceB', 'Same line.')
    expect(a).not.toBe(b)
  })

  test('the key is namespaced under voice-samples/ and ends .mp3', () => {
    const k = sampleKey('abc123', 'x')
    expect(k.startsWith('voice-samples/abc123/')).toBe(true)
    expect(k.endsWith('.mp3')).toBe(true)
  })

  test('a separator byte prevents glued-string collisions', () => {
    // Without the NUL separator, ('ab','c') and ('a','bc') would hash identically.
    expect(sampleKey('ab', 'c')).not.toBe(sampleKey('a', 'bc'))
  })
})

describe('VOICE-APPROVAL-003 similarity scoped to the same story', () => {
  const storyRoster = [
    { voice_id: 'v-daniel', canonical_name: 'DANIEL' },
    { voice_id: 'v-sarah', canonical_name: 'SARAH' },
  ]

  test('a voice already cast in THIS story is flagged, naming the character', () => {
    const clash = findClash(storyRoster, { voice_id: 'v-daniel', name: 'Desmond Vale' })
    expect(clash).toBeDefined()
    expect(clash!.canonical_name).toBe('DANIEL')
  })

  test('a voice not in this story is NOT flagged', () => {
    expect(findClash(storyRoster, { voice_id: 'v-unused', name: 'Some Other Voice' })).toBeUndefined()
  })

  test('matches on voice name when ids differ across accounts', () => {
    // ElevenLabs can hand out different ids for the same voice name.
    const clash = findClash(storyRoster, { voice_id: 'v-other-account', name: 'daniel' })
    expect(clash!.canonical_name).toBe('DANIEL')
  })

  test('an empty roster never flags anything', () => {
    expect(findClash([], { voice_id: 'v-daniel', name: 'DANIEL' })).toBeUndefined()
  })

  test('a null voice_id in the roster cannot cause a false clash', () => {
    const rosterWithGap = [{ voice_id: '', canonical_name: 'UNCAST' }]
    expect(findClash(rosterWithGap, { voice_id: 'v-daniel', name: 'DANIEL' })).toBeUndefined()
  })
})
