import fs from 'fs'

const src = fs.readFileSync('app/api/admin/production-jobs/run-next/route.ts', 'utf8')
const fnBody = (name: string) => {
  const start = src.indexOf(`async function ${name}(`)
  expect(start).toBeGreaterThan(-1)
  const next = src.indexOf('\nasync function ', start + 10)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('PHASED-SERIES-001: published episodes are read-only in series jobs', () => {
  it('defines the frozen rule on workflow_state or status = published', () => {
    expect(src).toMatch(/export function isFrozenSeriesEpisode/)
    expect(src).toContain("return wf === 'published' || st === 'published'")
    expect(src).toMatch(/\.select\('id,title,[^']*workflow_state[^']*'\)\s*\n\s*\.eq\('series_id', seriesId\)/)
  })

  it.each([
    'runSeriesCastReview', 'runSeriesVoiceSegment', 'runSeriesBelleAssets',
    'runSeriesMusicGeneration',
  ])('%s works only on non-published episodes', (name) => {
    const body = fnBody(name)
    expect(body).toContain('loadSeriesWorkEpisodes(')
    expect(body).not.toMatch(/=\s*await loadSeriesEpisodes\(/)
  })

  it('final mix works only on non-published episodes', () => {
    const start = src.indexOf('async function runSeriesRenderFinalMix(')
    expect(src.slice(start, start + 800)).toContain('loadSeriesWorkEpisodes(')
  })

  it('voice preflight checks evidence on all episodes but works on non-published ones', () => {
    const body = fnBody('runSeriesVoicePreflight')
    expect(body).toContain('withoutFrozenEpisodes(preflightEpisodes)')
  })

  it('package completion drops published episodes and lowers the expected count', () => {
    const body = fnBody('resolveSeriesPackageEpisodes')
    expect(body).toContain('isFrozenSeriesEpisode(episode)')
    expect(body).toContain('- frozenCount')
  })

  it('repair loops never rewrite a published episode', () => {
    expect(src).toContain('PHASED-SERIES-001: description check failed on PUBLISHED episode')
    expect(src).toContain('PHASED-SERIES-001: validation failed on PUBLISHED episode')
    expect(src).toContain('if (isFrozenSeriesEpisode(ep)) continue')
    expect(src).not.toContain('() => loadSeriesEpisodes(String(lockedJob.series_id))')
  })
})
