import { normalizeEmotions, genreStartingSet, emotionWriterBlock, EMOTION_PALETTE } from '@/lib/canon/emotionPalette'
import { buildClarityPrompt, parseClarityReview } from '@/lib/storyClarity'

describe('EMOTION-PALETTE-001 (decision 133)', () => {
  it('has the 18 approved emotions', () => {
    expect(EMOTION_PALETTE.length).toBe(18)
    expect(EMOTION_PALETTE.map((e) => e.name)).toContain('fear')
  })
  it('maps loose words to palette names, max 3, de-duplicated', () => {
    expect(normalizeEmotions(['Hate', 'love', 'worry', 'grief'])).toEqual(['hate of the villain', 'love and warmth', 'worry'])
    expect(normalizeEmotions(['nonsense', 'fear', 'fear'])).toEqual(['fear'])
  })
  it('genre starting sets', () => {
    expect(genreStartingSet('Horror')).toEqual(['dread', 'fear', 'relief'])
    expect(genreStartingSet('Mystery')).toEqual(['worry', 'fear', 'glee'])
  })
  it('writer block bans announcing and requires liking', () => {
    const b = emotionWriterBlock([], 'Thriller')
    expect(b).toMatch(/never name the listener's feeling/)
    expect(b).toMatch(/first 3 minutes/)
    expect(b).toMatch(/- worry:/)
  })
  it('clarity reviewer asks for emotions only when planned, report-only', () => {
    expect(buildClarityPrompt('X', { episodeNumber: 1, totalEpisodes: 7 })).not.toMatch(/EMOTIONS/)
    expect(buildClarityPrompt('X', { episodeNumber: 1, totalEpisodes: 7, plannedEmotions: ['grief'] })).toMatch(/EMOTIONS \(report only/)
    const r = parseClarityReview(JSON.stringify({ checks: [], emotions: [{ emotion: 'grief', setup: 'a', trigger: 'b', found: true }], announced: ['I was terrified'] }), 1)
    expect(r.emotions?.[0].found).toBe(true)
    expect(r.announced).toEqual(['I was terrified'])
  })
})
