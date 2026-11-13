import { validateSeriesOutline, buildSeriesOutlinePrompt } from '@/lib/seriesOutline'
import { nemesisOpenThreadLimit, sequelHookValidatorNote, buildSequelHookPromptBlock, ALTAR_THREE_THREAD_SERIES_TITLE } from '@/lib/seriesSequel'

const ALTAR = 'The Man I Left at the Altar'

function outlineWithOpenThreads(openCount: number, totalEpisodes = 3) {
  const threads = [
    { id: 'T0', question: 'Will the wedding happen?', resolved_in: totalEpisodes },
    ...Array.from({ length: openCount }, (_, i) => ({
      id: `O${i + 1}`,
      question: `Open thread ${i + 1}`,
      resolved_in: 0,
    })),
  ]
  return {
    characters: [
      { name: 'June Hart', label: 'JUNE', role: 'hero' },
      { name: 'Silas Cole', label: 'SILAS', role: 'nemesis' },
    ],
    threads,
    episodes: Array.from({ length: totalEpisodes }, (_, i) => ({
      episode: i + 1,
      goal: `goal ${i + 1}`,
      beats: ['a happens', 'b happens'],
      resolves: i + 1 === totalEpisodes ? ['T0'] : [],
      ends_on: 'hook',
    })),
    // SERIES-FACTS-002: a plan now carries at least five fixed facts.
    facts: [...Array.from({ length: 5 }, (_, i) => ({ fact: `fixed fact ${i + 1}`, from_episode: 1 })), ...Array.from({ length: totalEpisodes }, (_, i) => ({ fact: `Episode ${i + 1} takes place on day ${i + 1}, night.`, from_episode: i + 1 }))],
  }
}

describe('ATLAS NEMESIS-001 3-thread exception (altar30-setup-20261103 step 2)', () => {
  test('limit is 3 for the Altar series only, 1 everywhere else', () => {
    expect(ALTAR_THREE_THREAD_SERIES_TITLE).toBe(ALTAR)
    expect(nemesisOpenThreadLimit(ALTAR)).toBe(3)
    expect(nemesisOpenThreadLimit('  the man i left at the altar ')).toBe(3)
    expect(nemesisOpenThreadLimit('Some Other Series')).toBe(1)
    expect(nemesisOpenThreadLimit('')).toBe(1)
    expect(nemesisOpenThreadLimit(undefined)).toBe(1)
  })

  test('Altar outline with exactly three open threads passes', () => {
    const r = validateSeriesOutline(outlineWithOpenThreads(3), 3, 5, { openThreadRequired: true, seriesTitle: ALTAR })
    expect(r.problems).toEqual([])
    expect(r.outline?.threads.filter((t) => t.resolved_in === 0)).toHaveLength(3)
  })

  test('Altar outline with one open thread is rejected (needs three)', () => {
    const r = validateSeriesOutline(outlineWithOpenThreads(1), 3, 5, { openThreadRequired: true, seriesTitle: ALTAR })
    expect(r.outline).toBeNull()
    expect(r.problems.join(' ')).toMatch(/three threads/)
  })

  test('other series still enforce exactly one open thread', () => {
    const one = validateSeriesOutline(outlineWithOpenThreads(1), 3, 5, { openThreadRequired: true, seriesTitle: 'Chicago River' })
    expect(one.problems).toEqual([])
    const three = validateSeriesOutline(outlineWithOpenThreads(3), 3, 5, { openThreadRequired: true, seriesTitle: 'Chicago River' })
    expect(three.outline).toBeNull()
    expect(three.problems.join(' ')).toMatch(/exactly one thread/)
    // legacy callers with no title keep the old default of 1
    const legacy = validateSeriesOutline(outlineWithOpenThreads(3), 3, 5, { openThreadRequired: true })
    expect(legacy.outline).toBeNull()
  })

  test('no-hook series unchanged: any open thread still fails', () => {
    const r = validateSeriesOutline(outlineWithOpenThreads(1), 3, 5, {})
    expect(r.outline).toBeNull()
    expect(validateSeriesOutline(outlineWithOpenThreads(0), 3, 5, {}).problems).toEqual([])
  })

  test('outline prompt names the three Altar threads, ONLY-thread wording elsewhere', () => {
    const base = {
      title: ALTAR, premise: 'p', setting: 's', genre: 'Romance', totalEpisodes: 30,
      requirements: '', maxMainCharacters: 5, sequelHook: 'hook',
    }
    const altarPrompt = buildSeriesOutlinePrompt({ ...base, seriesTitle: ALTAR })
    expect(altarPrompt).toMatch(/THREE threads/)
    expect(altarPrompt).toMatch(/Vivian/)
    const otherPrompt = buildSeriesOutlinePrompt({ ...base, title: 'Other', seriesTitle: 'Other' })
    expect(otherPrompt).toMatch(/ONLY thread left open/)
    expect(otherPrompt).not.toMatch(/THREE threads/)
  })

  test('validator note and writer block switch wording by series', () => {
    expect(sequelHookValidatorNote('hook', ALTAR)).toMatch(/THREE/)
    expect(sequelHookValidatorNote('hook', ALTAR)).toMatch(/switched DNA result/)
    expect(sequelHookValidatorNote('hook', 'Other')).toMatch(/ONE nemesis escapes/)
    expect(buildSequelHookPromptBlock('hook', { episodeNumber: 30, isFinale: true, seriesTitle: ALTAR })).toMatch(/3-THREAD EXCEPTION/)
    expect(buildSequelHookPromptBlock('hook', { episodeNumber: 5, isFinale: true })).not.toMatch(/3-THREAD EXCEPTION/)
    expect(buildSequelHookPromptBlock('', { episodeNumber: 1, isFinale: false })).toBe('')
  })
})
