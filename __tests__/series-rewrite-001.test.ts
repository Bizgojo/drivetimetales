import { extractValidatorFixList, planSeriesEpisodeRewrite, buildRewriteFeedbackBlock, MAX_SERIES_EPISODE_REWRITES } from '@/lib/seriesRewrite'
import { readFileSync } from 'fs'
import { join } from 'path'

const eps = [1, 2, 3, 4, 5].map((n) => ({ id: `s${n}`, episodeNumber: n, hasScript: true }))

describe('SERIES-REWRITE-001', () => {
  test('fix list is the part after VALIDATOR RESULT: FAIL', () => {
    const r = 'checks...\n❌ **VALIDATOR RESULT: FAIL**\nDo not send to production. Fix:\n- personal stakes missing'
    expect(extractValidatorFixList(r)).toMatch(/^Do not send to production\. Fix:\n- personal stakes missing$/)
    expect(extractValidatorFixList('x'.repeat(5000)).length).toBe(3000)
  })

  test('EP1 failure rewrites EP1 and every later episode', () => {
    expect(planSeriesEpisodeRewrite({ failedEpisodeNumber: 1, episodes: eps, rewriteCounts: {} }))
      .toEqual({ action: 'rewrite', attempt: 1, failedEpisodeNumber: 1, clearStoryIds: ['s1', 's2', 's3', 's4', 's5'] })
  })

  test('EP4 failure keeps EP1–3', () => {
    const p = planSeriesEpisodeRewrite({ failedEpisodeNumber: 4, episodes: eps, rewriteCounts: { 4: 1 } })
    expect(p).toEqual({ action: 'rewrite', attempt: 2, failedEpisodeNumber: 4, clearStoryIds: ['s4', 's5'] })
  })

  test('stops after the per-episode budget', () => {
    expect(planSeriesEpisodeRewrite({ failedEpisodeNumber: 2, episodes: eps, rewriteCounts: { 2: MAX_SERIES_EPISODE_REWRITES } }))
      .toEqual({ action: 'exhausted', attempts: MAX_SERIES_EPISODE_REWRITES })
    expect(planSeriesEpisodeRewrite({ failedEpisodeNumber: 0, episodes: eps, rewriteCounts: {} }).action).toBe('none')
  })

  test('feedback block only when there is feedback', () => {
    expect(buildRewriteFeedbackBlock('', 1)).toBe('')
    expect(buildRewriteFeedbackBlock('fix stakes', 2)).toMatch(/REWRITE 2[\s\S]*fix stakes/)
  })

  test('run-next wires the rewrite before giving up, and the writer reads the fix list', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const rw = src.indexOf('SERIES-REWRITE-001: a story-content failure')
    const giveUp = src.indexOf('`Series validation needs attention:')
    expect(rw).toBeGreaterThan(0)
    expect(rw).toBeLessThan(giveUp)
    expect(src).toMatch(/buildRewriteFeedbackBlock\(\(brief as any\)\?\.validator_rewrite\?\.feedback/)
  })
})
