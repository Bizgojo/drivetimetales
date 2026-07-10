// ATL-PIPE-MODEL-001: per-step model routing in the production pipeline runner.
// Prose is the product — script GENERATION (and prose repair/regeneration) stays
// on Opus; VALIDATION/QC steps run on Sonnet. The jest setup here is node-env
// ts-jest with no route-handler test infra (and Supabase may be unavailable),
// so these are focused source-level assertions on the runner's model routing,
// following the __tests__/atl-autofill-001.test.ts pattern.
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(
  join(__dirname, '..', 'app', 'api', 'admin', 'production-jobs', 'run-next', 'route.ts'),
  'utf8'
)

describe('ATL-PIPE-MODEL-001: STEP_MODELS constants', () => {
  it('pins generation to Opus and validation to Sonnet', () => {
    expect(src).toMatch(/generate:\s*'claude-opus-4-6'/)
    expect(src).toMatch(/validate:\s*'claude-sonnet-4-6'/)
  })

  it('derives model + validationModel from body with STEP_MODELS defaults (canary overrides preserved)', () => {
    expect(src).toContain("const model = String(body.model || STEP_MODELS.generate)")
    expect(src).toContain("const validationModel = String(body.validationModel || STEP_MODELS.validate)")
    // No stray hardcoded default left behind at the old dispatch site.
    expect(src).not.toContain("body.model || 'claude-opus-4-6'")
  })

  it('logs models used at job pickup', () => {
    expect(src).toMatch(/models: generation=\$\{model\} validation=\$\{validationModel\}/)
  })
})

describe('ATL-PIPE-MODEL-001: validation/QC call sites use validationModel', () => {
  const validationCallSites = [
    'validateStandaloneScript(lockedJob, validationModel)',
    'validateStandaloneStoryResolution(lockedJob, validationModel)',
    'validateStandaloneBelleQuality(lockedJob, validationModel)',
    'scoreValidateSeriesPackage(lockedJob, validationModel)',
  ]
  for (const call of validationCallSites) {
    it(`dispatches ${call.split('(')[0]} on validationModel`, () => {
      expect(src).toContain(call)
    })
  }

  it('no validation/score function is still dispatched on the generation model', () => {
    for (const fn of [
      'validateStandaloneScript',
      'validateStandaloneStoryResolution',
      'validateStandaloneBelleQuality',
      'scoreValidateSeriesPackage',
      'validateSeriesEpisodeScript',
      'validateSeriesPackageWithAi',
    ]) {
      expect(src).not.toContain(`${fn}(lockedJob, model)`)
    }
  })

  it('scoreValidateSeriesPackage threads its model param into the two inner series validators', () => {
    // Inner call sites receive scoreValidateSeriesPackage's own `model` param,
    // which is validationModel at the top-level dispatch.
    expect(src).toContain('validateSeriesEpisodeScript(nextEpisode, model, job)')
    expect(src).toContain('validateSeriesPackageWithAi(refreshedEpisodes, metadataIssues, model, job)')
  })
})

describe('ATL-PIPE-MODEL-001: prose-producing steps stay on the generation model (Opus)', () => {
  const generationCallSites = [
    'generateStandaloneScript(lockedJob, model)',
    'generateOneSeriesEpisodeScript(lockedJob, model)',
    // Repair rewrites prose — stays on Opus.
    'repairStandaloneBelleQuality(lockedJob, model)',
    // Rewrites Belle intro/outro prose into the story record — stays on Opus.
    'regenerateSeriesBelleFromFeedback(targetStory, belleRetryTarget, nextEpisode, model)',
  ]
  for (const call of generationCallSites) {
    it(`dispatches ${call.split('(')[0]} on the generation model`, () => {
      expect(src).toContain(call)
    })
  }

  it('regenerateSeriesDescriptionFromEpisodeFeedback (customer-facing copy) stays on the generation model', () => {
    // Multiline call site inside the score_validate_package failure handler.
    expect(src).toMatch(
      /regenerateSeriesDescriptionFromEpisodeFeedback\(\s*targetEpisode,\s*descriptionFailure\.report,\s*model,\s*lockedJob\s*\)/
    )
  })

  it('Haiku narrative-hook fallback is unchanged', () => {
    expect(src).toContain("const NARRATIVE_HOOK_FALLBACK_MODEL = 'claude-haiku-4-5'")
  })

  it('blpGenreContract keeps its pinned Opus default', () => {
    const blp = readFileSync(join(__dirname, '..', 'lib', 'blpGenreContract.ts'), 'utf8')
    expect(blp).toMatch(/model = 'claude-opus-4-6'/)
  })
})
