import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')

describe('DESCRIPTION-SPOILER-RETRY-001', () => {
  const fn = src.slice(src.indexOf('function classifyDescriptionValidatorFailure('), src.indexOf('function seriesDescriptionFailureFromEpisodeResult('))
  test('description-only spoiler failures are retryable (rewritten from validator feedback)', () => {
    expect(fn).toMatch(/const spoiler = \/spoiler\|reveals\?\|climax\|twist\|final discovery\|resolution payoff\|outcome\|culprit\|survivor\/i/)
    expect(fn.indexOf('const spoiler')).toBeGreaterThan(fn.indexOf('const substantive'))
    expect(fn).toMatch(/return \{ retryable: true, kind: 'mechanical'/)
  })
  test('weak plot / weak hook / editorial failures still stop for a human', () => {
    expect(fn).toMatch(/const substantive = \/weak plot\|weak hook\|editorial\/i/)
    expect(fn).not.toMatch(/const substantive = \/spoiler/)
  })
  test('retries stay bounded', () => {
    expect(src).toContain('const MAX_SERIES_DESCRIPTION_RETRIES = 2')
  })
})

describe('WRITER-TITLE-PLACEHOLDER-001', () => {
  const fn = src.slice(src.indexOf('function buildSeriesEpisodePrompt('), src.indexOf('\nfunction ', src.indexOf('function buildSeriesEpisodePrompt(') + 10))
  test('placeholder "Episode N" titles are never quoted to Belle as the episode title', () => {
    expect(fn).toMatch(/episodeTitleIsPlaceholder = !rawEpisodeTitle \|\| \/\^episode\\s\+/)
    expect(fn).toContain('the episode title you write on the TITLE: line (never "Episode N")')
    expect(fn).not.toContain('TITLE: [${brief.episode_title || episode.title}')
  })
})
