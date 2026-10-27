import { readFileSync } from 'fs'
import { join } from 'path'

// VALIDATION-RESUME-001: a resumed series validation must re-validate episodes
// it previously recorded as failed (job a21df7bd threw "state is inconsistent").
describe('VALIDATION-RESUME-001', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fn = src.slice(src.indexOf('async function scoreValidateSeriesPackage('), src.indexOf('Series validation state is inconsistent'))
  test('falls back to a previously-failed, not-yet-passed episode', () => {
    expect(fn).toMatch(/\) \|\| episodes\.find\(\(episode: any\) =>\s*notPassed\(episode\)\s*&& failedEpisodes\.some/)
  })
  test('fresh episodes are still validated first', () => {
    const first = fn.indexOf('!failedEpisodes.some(')
    const fallback = fn.indexOf('&& failedEpisodes.some(')
    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(fallback)
  })
})
