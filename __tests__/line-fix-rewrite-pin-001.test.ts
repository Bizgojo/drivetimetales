import { lineFixRewritePinRefreshes } from '@/lib/seriesRewrite'
import { hashScript } from '@/lib/continuityPin'

describe('LINE-FIX-REWRITE-PIN-001', () => {
  test('a rewrite that kept later episodes moves pins from the replaced script to the new one', () => {
    const eps = [{ id: 'e8', script: 'NEW EP8', script_json: { rewrite_backups: [
      { reason: 'sfx_delete', script: 'OLDER' },
      { reason: 'validator_content_fail', kept_later_episodes: true, script: 'OLD EP8' },
    ] } }]
    expect(lineFixRewritePinRefreshes(eps, hashScript)).toEqual([{ storyId: 'e8', oldHash: hashScript('OLD EP8'), newHash: hashScript('NEW EP8') }])
  })
  test('a full rewrite (later episodes rewritten too) or other backups move nothing', () => {
    const eps = [
      { id: 'a', script: 'X', script_json: { rewrite_backups: [{ reason: 'validator_content_fail', script: 'OLD' }] } },
      { id: 'b', script: 'Y', script_json: { rewrite_backups: [{ reason: 'follows_rewritten_episode', kept_later_episodes: true, script: 'OLD' }] } },
      { id: 'c', script: null, script_json: { rewrite_backups: [{ reason: 'validator_content_fail', kept_later_episodes: true, script: 'OLD' }] } },
    ]
    expect(lineFixRewritePinRefreshes(eps, hashScript)).toEqual([])
  })
  test('run-next marks single-episode rewrites and refreshes pins before the gate', () => {
    const s = require('fs').readFileSync(require('path').join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(s).toContain("isFailed && plan.clearStoryIds.length === 1 ? { kept_later_episodes: true }")
    expect(s.indexOf('lineFixRewritePinRefreshes(refreshedEpisodes')).toBeLessThan(s.indexOf('const pinVerify = verifyContinuityPins(refreshedEpisodes)'))
  })
})
