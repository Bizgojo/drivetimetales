import { planSeriesPatch } from '@/lib/seriesPatch'

describe('STOPPED-BLOCKERS-PATCH-001', () => {
  const issue = { episode: 13, problem: 'The guest is confirmed as Holmes too early', fix: 'Make it a suspicion only' }
  const base = { issues: [issue], patchRuns: 36, maxRuns: 68, frozenEpisodes: new Set<number>(), episodesWithScript: new Set([13]) }
  test('per-episode limit skips a normal story-level issue', () => {
    expect(planSeriesPatch({ ...base, patchCounts: { '13': 2 } }).action).toBe('skip')
  })
  test('kept blockers (empty counts) are patched', () => {
    expect(planSeriesPatch({ ...base, patchCounts: {} }).action).toBe('patch')
  })
  test('run-next bypasses the per-episode count for kept blockers and logs a skip reason', () => {
    const s = require('fs').readFileSync(require('path').join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(s).toContain('stoppedBlockersPatch: true,')
    expect(s).toContain("patchCounts: (result as any).stoppedBlockersPatch ? {} :")
    expect(s).toContain('`Series patch skipped — ${patchPlan.reason}`')
  })
})
