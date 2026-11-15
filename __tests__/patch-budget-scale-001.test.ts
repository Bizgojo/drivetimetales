import { seriesPatchBudget, sfxDeleteBudget, planSeriesPatch, MAX_SERIES_PATCH_RUNS, MAX_SFX_DELETES_PER_JOB } from '@/lib/seriesPatch'

describe('PATCH-BUDGET-SCALE-001', () => {
  test('7-episode series keeps the old caps', () => {
    expect(seriesPatchBudget(7)).toBe(MAX_SERIES_PATCH_RUNS)
    expect(sfxDeleteBudget(7)).toBe(MAX_SFX_DELETES_PER_JOB)
    expect(seriesPatchBudget(0)).toBe(MAX_SERIES_PATCH_RUNS)
    expect(sfxDeleteBudget(NaN)).toBe(MAX_SFX_DELETES_PER_JOB)
  })
  test('30-episode series gets the same rate per episode', () => {
    expect(seriesPatchBudget(30)).toBe(35)
    expect(sfxDeleteBudget(30)).toBe(52)
  })
  test('planSeriesPatch uses the scaled cap', () => {
    const base = { issues: [{ episode: 7, problem: 'x', fix: 'y' }], patchRuns: 8, frozenEpisodes: new Set<number>(), episodesWithScript: new Set([7]) }
    expect(planSeriesPatch(base).action).toBe('skip')
    const plan = planSeriesPatch({ ...base, maxRuns: seriesPatchBudget(30) })
    expect(plan.action).toBe('patch')
    if (plan.action === 'patch') expect(plan.run).toBe(9)
    expect(planSeriesPatch({ ...base, patchRuns: 35, maxRuns: 35 }).action).toBe('skip')
  })
})
