import { readFileSync } from 'fs'
import { join } from 'path'
import { shouldContinueSeriesVoiceBatch, VOICE_BATCH_BUDGET_MS, VOICE_BATCH_MAX_SEGMENTS } from '@/lib/voiceBatch'
import { runNextTimeoutMs } from '@/lib/pipeline-runner/runner'

describe('VOICE-BATCH-001', () => {
  const ok = { complete: false, hardFailure: false, episodeComplete: false }
  test('keeps going while segments succeed within budget and max', () => {
    expect(shouldContinueSeriesVoiceBatch(ok, 1, 5_000)).toBe(true)
    expect(shouldContinueSeriesVoiceBatch(ok, VOICE_BATCH_MAX_SEGMENTS - 1, VOICE_BATCH_BUDGET_MS - 1)).toBe(true)
  })
  test('stops on failure, episode end, series end, max, or budget', () => {
    expect(shouldContinueSeriesVoiceBatch({ ...ok, hardFailure: true }, 1, 0)).toBe(false)
    expect(shouldContinueSeriesVoiceBatch({ ...ok, episodeComplete: true }, 1, 0)).toBe(false)
    expect(shouldContinueSeriesVoiceBatch({ ...ok, complete: true }, 1, 0)).toBe(false)
    expect(shouldContinueSeriesVoiceBatch(ok, VOICE_BATCH_MAX_SEGMENTS, 0)).toBe(false)
    expect(shouldContinueSeriesVoiceBatch(ok, 1, VOICE_BATCH_BUDGET_MS)).toBe(false)
  })
  test('budget leaves room for one slow segment inside the runner abort', () => {
    expect(VOICE_BATCH_BUDGET_MS + 50_000).toBeLessThanOrEqual(runNextTimeoutMs('series_generate_voices'))
  })
  test('run-next loops runSeriesVoiceSegment with the batch rule and saves once', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const block = src.slice(src.indexOf('if (step === NEXT_STEP_AFTER_SERIES_PREFLIGHT) {'), src.indexOf('if (step === NEXT_STEP_AFTER_STANDALONE_VOICES) {'))
    expect(block).toMatch(/while \(shouldContinueSeriesVoiceBatch\(result, batchCount, Date\.now\(\) - batchStartedAt\)\)/)
    expect(block).toMatch(/batchJob = \{ \.\.\.batchJob, state_json: result\.state, logs \}/)
    expect((block.match(/\.from\('production_jobs'\)/g) || []).length).toBe(2) // failure save + progress save, unchanged
  })
})
