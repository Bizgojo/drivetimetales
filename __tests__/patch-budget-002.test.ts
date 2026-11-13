import { planSeriesPatch, MAX_PATCHES_PER_EPISODE, MAX_SERIES_PATCH_RUNS } from '@/lib/seriesPatch'
import { softenBelleSpoilerWords } from '@/lib/voiceBelleRules'
import { readFileSync } from 'fs'
import { join } from 'path'

const allEps = new Set([1, 2, 3, 4, 5, 6, 7])
const issue = (episode: number) => ({ episode, problem: 'p', fix: '' })

describe('PATCH-BUDGET-002', () => {
  test('each episode gets its own 2 patches; a capped episode is left for the rewrite', () => {
    const p = planSeriesPatch({ issues: [issue(2), issue(4)], patchRuns: 2, patchCounts: { '2': MAX_PATCHES_PER_EPISODE }, frozenEpisodes: new Set([1]), episodesWithScript: allEps })
    expect(p.action).toBe('patch')
    if (p.action === 'patch') expect(Array.from(p.byEpisode.keys())).toEqual([4])
  })
  test('the Widow case: two patch runs spent elsewhere, EP2 and EP4 still get patched', () => {
    const p = planSeriesPatch({ issues: [issue(2), issue(2), issue(4)], patchRuns: 2, patchCounts: { '7': 2 }, frozenEpisodes: new Set([1]), episodesWithScript: allEps })
    expect(p.action).toBe('patch')
  })
  test('skips when every issue is on a capped episode, and at the job-wide cap', () => {
    const p = planSeriesPatch({ issues: [issue(4)], patchRuns: 3, patchCounts: { '4': 2 }, frozenEpisodes: new Set(), episodesWithScript: allEps })
    expect(p).toEqual({ action: 'skip', reason: `per-episode patch budget used (${MAX_PATCHES_PER_EPISODE} each)` })
    expect(planSeriesPatch({ issues: [issue(4)], patchRuns: MAX_SERIES_PATCH_RUNS, frozenEpisodes: new Set(), episodesWithScript: allEps }).action).toBe('skip')
  })
  test('run-next counts patches per episode', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('patchCounts: (priorPatchState.seriesRewrite?.patchCounts')
    expect(src).toMatch(/patchCounts: \(goodOutcomes as any\[\]\)\.reduce/)
  })
})

describe('WRITER-LENGTH-REPAIR-002', () => {
  test('a shortened Belle line gets the spoiler-word swap before it is checked', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('const shorter = shorterRaw ? (softenBelleSpoilerWords(shorterRaw) || shorterRaw) : shorterRaw')
    expect(src).toContain('const shorterIntro = shorterIntroRaw ? (softenBelleSpoilerWords(shorterIntroRaw) || shorterIntroRaw) : shorterIntroRaw')
    expect(softenBelleSpoilerWords('Next, Jordan reveals what she knows.')).not.toMatch(/\breveals\b/)
  })
})
