import { buildWriterRewriteFeedback, checkScriptReadiness, seriesMaxSpokenWords } from '@/lib/scriptReadiness'

// SERIES-RUNTIME-MAX-001 (job a21df7bd: EP2 of a 15-min series had 3,801 spoken words, ~24 min).
const body = (n: number) => Array.from({ length: Math.ceil(n / 10) }, () => 'NARRATOR: one two three four five six seven eight nine ten.').join('\n')
const script = (n: number) => `TITLE: X\nDESCRIPTION: A secret.\nNARRATOR: Cole Rafferty\nBELLE B: Hi.\n[START AUDIO DRAMA SCRIPT]\n${body(n)}`
const gate = (n: number, storyType = 'series_episode', briefMinutes: number | null = 15) =>
  checkScriptReadiness({ script: script(n), storyType, seriesId: 's', seriesTotalEpisodes: 3, episodeNumber: 2, briefMinutes })
    .blockers.find((b) => b.gate === 'RUNTIME-SERIES-MAX')

describe('SERIES-RUNTIME-MAX-001', () => {
  test('15-min ceiling is 3240 spoken words (~20 min)', () => expect(seriesMaxSpokenWords(15)).toBe(3240))
  test('a 3,800-word episode is blocked', () => expect(gate(3800)?.detail).toMatch(/max 3240 spoken words/))
  test('the approved proof series length (~3,000 words) passes', () => expect(gate(3000)).toBeUndefined())
  test('standalones and briefless series are not affected', () => {
    expect(gate(3800, 'standalone')).toBeUndefined()
    expect(gate(3800, 'series_episode', null)).toBeUndefined()
  })
  test('rewrite feedback asks for cuts, not additions', () => {
    const r = checkScriptReadiness({ script: script(3800), storyType: 'series_episode', seriesId: 's', seriesTotalEpisodes: 3, episodeNumber: 2, briefMinutes: 15 })
    const text = buildWriterRewriteFeedback(r, 15)
    expect(text).toMatch(/too long/)
    expect(text).toMatch(/Cut it to about 2400 spoken words/)
    expect(text).not.toMatch(/Add real scenes/)
  })
})
