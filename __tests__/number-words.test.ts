/**
 * NUMBER-WORDS tests — shared spoken-numeral normalization
 * (Marc 2026-10-23 16:37 item 1: shared normalization — never regen
 * for Two-vs-2).
 *
 * Proves, with zero DB / zero network / zero writes:
 *   (a) the single normalizer maps one..twenty + first..twentieth to
 *       digits, word-boundary anchored ("someone" never becomes "some1");
 *   (b) title equality is canonical ("Episode 2" ≡ "Episode Two" ≡
 *       "episode two") — the run-next brief-vs-generated title check;
 *   (c) episode-number naming accepts digit/cardinal/ordinal and rejects
 *       substring false-positives — publicationBelleGate + run-next;
 *   (d) directPublish ordering identity comes from the episode_number
 *       COLUMN, never from title parsing;
 *   (e) the Belle fingerprint is numeral-normalized, so a numeral-only
 *       Belle rewrite keeps the fingerprint (existing valid audio is
 *       never regenerated for Two-vs-2).
 */

import {
  episodeNumberNamedIn,
  normalizeNumberWords,
  NUMBER_WORD_TO_DIGIT,
  parseEpisodeNumberToken,
  titlesEqualCanonical,
} from '@/lib/numberWords'
import { evaluateBelleCopyForPublish } from '@/lib/publicationBelleGate'
import {
  assertSeriesContiguity,
  sortEpisodesForPublish,
} from '@/lib/story-gates'
import {
  currentBelleFingerprint,
  freshnessEnvelopeForTextSet,
} from '@/lib/belleFreshness'

describe('normalizeNumberWords', () => {
  test('maps cardinals one..twenty to digits', () => {
    expect(NUMBER_WORD_TO_DIGIT.one).toBe(1)
    expect(NUMBER_WORD_TO_DIGIT.two).toBe(2)
    expect(NUMBER_WORD_TO_DIGIT.twelve).toBe(12)
    expect(NUMBER_WORD_TO_DIGIT.twenty).toBe(20)
    expect(normalizeNumberWords('Episode Two')).toBe('Episode 2')
    expect(normalizeNumberWords('episode twelve')).toBe('episode 12')
  })

  test('maps ordinals first..twentieth to digits', () => {
    expect(NUMBER_WORD_TO_DIGIT.first).toBe(1)
    expect(NUMBER_WORD_TO_DIGIT.second).toBe(2)
    expect(NUMBER_WORD_TO_DIGIT.twentieth).toBe(20)
    expect(normalizeNumberWords('the Second Episode')).toBe('the 2 Episode')
  })

  test('word-boundary anchored: never rewrites inside other words', () => {
    // "someone" and "atonement" are untouched; the standalone word
    // "one" maps (TTS speaks "1" as "one" — identical audio).
    expect(normalizeNumberWords('someone told no one')).toBe('someone told no 1')
    expect(normalizeNumberWords('Episode 12')).toBe('Episode 12')
    expect(normalizeNumberWords('atonement')).toBe('atonement')
  })

  test('case-insensitive, surrounding text untouched', () => {
    expect(normalizeNumberWords('EPISODE TWO: The Drowned Dock')).toBe(
      'EPISODE 2: The Drowned Dock'
    )
  })
})

describe('titlesEqualCanonical (run-next brief-vs-generated title check)', () => {
  test('"Episode 2" ≡ "Episode Two" ≡ "episode two"', () => {
    expect(titlesEqualCanonical('Episode 2', 'Episode Two')).toBe(true)
    expect(titlesEqualCanonical('Episode Two', 'episode two')).toBe(true)
    expect(titlesEqualCanonical('episode two', 'Episode 2')).toBe(true)
  })

  test('genuinely different titles still mismatch', () => {
    expect(titlesEqualCanonical('The Logbook', 'The Wrong Tide')).toBe(false)
    expect(titlesEqualCanonical('Episode 2', 'Episode 3')).toBe(false)
    expect(titlesEqualCanonical('Episode Two', 'Episode Three')).toBe(false)
  })

  test('empty titles never equal', () => {
    expect(titlesEqualCanonical('', '')).toBe(false)
    expect(titlesEqualCanonical('Episode 2', '')).toBe(false)
  })
})

describe('episodeNumberNamedIn (publicationBelleGate + run-next)', () => {
  test('digit, cardinal, and ordinal forms all name the episode', () => {
    expect(episodeNumberNamedIn('Lake Marion, Episode 2: The Ledger', 2)).toBe(true)
    expect(episodeNumberNamedIn('Lake Marion, Episode Two: The Ledger', 2)).toBe(true)
    expect(episodeNumberNamedIn('the second episode of Lake Marion', 2)).toBe(true)
  })

  test('wrong numbers do not match', () => {
    expect(episodeNumberNamedIn('Lake Marion, Episode Three: The Ledger', 2)).toBe(false)
    expect(episodeNumberNamedIn('Lake Marion, Episode 3: The Ledger', 2)).toBe(false)
  })

  test('no substring false-positives (the old includes() bug)', () => {
    expect(episodeNumberNamedIn('someone told the story', 1)).toBe(false)
    expect(episodeNumberNamedIn('Episode 12 docked at noon', 1)).toBe(false)
    expect(episodeNumberNamedIn('Episode 12 docked at noon', 2)).toBe(false)
    expect(episodeNumberNamedIn('Episode 12 docked at noon', 12)).toBe(true)
  })

  test('non-positive episode numbers never match', () => {
    expect(episodeNumberNamedIn('Episode 2', 0)).toBe(false)
    expect(episodeNumberNamedIn('Episode 2', NaN)).toBe(false)
  })
})

describe('parseEpisodeNumberToken (directPublish EPISODE-header fallback)', () => {
  test('digits, cardinals, ordinals parse; garbage is null', () => {
    expect(parseEpisodeNumberToken('2')).toBe(2)
    expect(parseEpisodeNumberToken('Two')).toBe(2)
    expect(parseEpisodeNumberToken('Second')).toBe(2)
    expect(parseEpisodeNumberToken('TWELVE')).toBe(12)
    expect(parseEpisodeNumberToken('Episode Two')).toBe(2)
    expect(parseEpisodeNumberToken('abc')).toBeNull()
    expect(parseEpisodeNumberToken('')).toBeNull()
    expect(parseEpisodeNumberToken(null)).toBeNull()
  })
})

function seriesScript(episodeLine: string): string {
  return [
    'TITLE: The Ledger',
    'NARRATOR: Jane Doe',
    `BELLE B: ${episodeLine}`,
    'Once upon a ledger, numbers moved in the dark.',
    'BELLE B: Sit with that unease — I am Belle, and what you uncovered leads into Episode 3, where the ledger fights back.',
  ].join('\n')
}

describe('gate-path integration: numeral forms pass the same checks', () => {
  function storyFor(introLine: string) {
    return {
      id: 'ep-2',
      title: 'The Ledger',
      script: seriesScript(introLine),
      series_id: 'series-1',
      series_name: 'Lake Marion',
      episode_number: 2,
    }
  }

  test('intro naming "episode two" satisfies episode_number 2 (no number blocker)', () => {
    for (const line of [
      'Lake Marion, Episode 2: The Ledger hides a ledger that was wrong.',
      'Lake Marion, Episode Two: The Ledger hides a ledger that was wrong.',
      'Lake Marion, the second episode: The Ledger hides a ledger that was wrong.',
    ]) {
      const verdict = evaluateBelleCopyForPublish(storyFor(line))
      const numberBlockers = verdict.ok
        ? []
        : (verdict as { blockers: string[] }).blockers.filter((b) =>
            b.includes('episode number')
          )
      expect(numberBlockers).toEqual([])
    }
  })

  test('a genuinely wrong numeral still blocks', () => {
    const verdict = evaluateBelleCopyForPublish(
      storyFor('Lake Marion, Episode Three: The Ledger hides a ledger that was wrong.')
    )
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('episode number'),
      ])
    )
  })
})

describe('directPublish ordering: identity from the episode_number column', () => {
  test('sort follows the column even when titles parse differently', () => {
    const rows = [
      { id: 'b', title: 'Episode One', episode_number: 2 },
      { id: 'a', title: 'Episode 2', episode_number: 1 },
    ]
    const ordered = sortEpisodesForPublish(rows as never[])
    expect(ordered.map((r) => (r as { id: string }).id)).toEqual(['a', 'b'])
    // A title claiming "One" on episode_number 2 changes nothing.
    expect(
      assertSeriesContiguity([
        { id: 'a', title: 'Episode 2', episode_number: 1 },
        { id: 'b', title: 'Episode One', episode_number: 2 },
      ] as never[])
    ).toEqual({ ok: true, numbers: [1, 2] })
  })
})

describe('Belle fingerprint: numeral-only rewrites never invalidate', () => {
  const scriptFor = (introLine: string) =>
    [
      'TITLE: The Ledger',
      'NARRATOR: Jane Doe',
      `BELLE B: ${introLine}`,
      'Once upon a ledger, numbers moved in the dark.',
      'BELLE B: The Ledger closes with a quiet reckoning.',
    ].join('\n')

  const DIGIT = scriptFor('Lake Marion, Episode 2: The Ledger hides a ledger that was wrong.')
  const WORD = scriptFor('Lake Marion, Episode Two: The Ledger hides a ledger that was wrong.')
  const OTHER = scriptFor('Lake Marion, Episode 3: The Ledger hides a ledger that was wrong.')

  test('"Episode 2" and "Episode Two" share a fingerprint; "Episode 3" flips it', () => {
    expect(currentBelleFingerprint(WORD)).toBe(currentBelleFingerprint(DIGIT))
    expect(currentBelleFingerprint(OTHER)).not.toBe(currentBelleFingerprint(DIGIT))
  })

  test('numeral-only rewrite stamps changed=false (render evidence survives)', () => {
    const prior = {
      series_generation: {
        belle_freshness: {
          fingerprint: currentBelleFingerprint(DIGIT),
          text_changed_at: '2026-10-23T16:00:00.000Z',
          audio_stale: false,
          last_verified_render_at: '2026-10-23T17:00:00.000Z',
          render_request_fingerprint: currentBelleFingerprint(DIGIT),
          verified_audio_asset: 'https://cdn.example/mix.mp3',
        },
      },
    }
    const stamp = freshnessEnvelopeForTextSet(prior, WORD, '2026-10-23T18:00:00.000Z')
    expect(stamp.changed).toBe(false)
    expect(stamp.stale).toBe(false)
    expect(stamp.envelope).toEqual(
      (prior as { series_generation: { belle_freshness: unknown } }).series_generation.belle_freshness
    )
  })
})
