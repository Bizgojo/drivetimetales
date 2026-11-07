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

describe('PHASED-SERIES-002: explicit not-finale wins over the episode count', () => {
  it('writer self-check and voice rules honor series_is_finale=false', () => {
    expect(src).toContain('const selfCheckIsFinale = targetEpisode.series_is_finale === false')
    const rules = fs.readFileSync('lib/voiceBelleRules.ts', 'utf8')
    expect(rules).toContain("const isFinale = storyRow?.series_is_finale === false")
  })
})

describe('PHASED-SERIES-002b: every Belle finale check honors explicit false', () => {
  it('belleEpisodeState: isFinale=false is not a finale even on the last row', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { belleEpisodeState } = require('../lib/voiceBelleRules')
    expect(belleEpisodeState({ seriesName: 'Rerouted', episodeNumber: 3, seriesTotal: 3, isFinale: false })).toBe('series_non_final')
    expect(belleEpisodeState({ seriesName: 'Rerouted', episodeNumber: 3, seriesTotal: 3, isFinale: null })).toBe('series_finale')
    expect(belleEpisodeState({ seriesName: 'Rerouted', episodeNumber: 3, seriesTotal: 7, isFinale: true })).toBe('series_finale')
  })
  it('belle variants position honors series_is_finale=false', () => {
    const v = fs.readFileSync('app/api/admin/generate-belle-variants/route.ts', 'utf8')
    expect(v).toContain("story?.series_is_finale !== false && total > 0")
  })
})

describe('PHASED-SERIES-002c: metadata validator allows an explicit not-finale last row', () => {
  it('only an explicit false on the last row is allowed', () => {
    expect(src).toContain("const phasedBatchLast = shouldBeFinale && episode.series_is_finale === false")
    expect(src).toContain('if (!phasedBatchLast && Boolean(episode.series_is_finale) !== shouldBeFinale)')
  })
})

describe('PHASED-SERIES-002d: package reviewer is told a phased batch has no finale', () => {
  it('prompt switches to phased-batch rules when the last row is explicitly not finale', () => {
    expect(src).toContain('const phasedBatch = lastEpisode?.series_is_finale === false')
    expect(src).toContain('You are validating an Endless Tales ${packageScope} before audio production.')
    expect(src).toContain('This is a phased batch: there is NO finale here.')
  })
})
