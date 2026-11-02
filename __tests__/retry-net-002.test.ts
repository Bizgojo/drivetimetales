/** RETRY-NET-002 / RUNNER-TIMEOUT-001 (2026-11-02). */
import { readFileSync } from 'fs'
import { join } from 'path'
import { errorTextOf, transientResumeDecision } from '@/lib/transientResume'

const lastWell = {
  at: '2026-11-02T08:54:44.350Z', step: 'series_generate_voices', episodeNumber: 1, segmentNumber: 4,
  voiceGenerationReport: { error: `Failed to list existing story segments: Unexpected token '<', "<html>\r\n<h"... is not valid JSON`, success: false },
}

test('the Last Well voice failure (storage answered with an HTML page) is retried automatically', () => {
  expect(errorTextOf(lastWell)).toContain("Unexpected token '<'")
  const d = transientResumeDecision({ status: 'failed', current_step: 'series_generate_voices', job_type: 'series', updated_at: '2026-11-02T08:54:44Z', error_json: lastWell, state_json: {} }, Date.parse('2026-11-02T10:00:00Z'))
  expect(d).toEqual({ action: 'resume', attempt: 1, step: 'series_generate_voices' })
})

test('a story defect is still left alone', () => {
  expect(transientResumeDecision({ status: 'failed', current_step: 'score_validate_package', error_json: { message: 'SERIES-CONTINUITY-001: episode 2 resolves the deed fight twice' } }, Date.now())).toBeNull()
})

test('the runner loop gives up on a hung call', () => {
  const sh = readFileSync(join(__dirname, '../scripts/ec2-deploy/run-next-loop.sh'), 'utf8')
  expect(sh).toContain('curl -sS --max-time "$MAX_SECONDS"')
})
