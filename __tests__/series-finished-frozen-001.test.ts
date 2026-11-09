import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')

describe('SERIES-FINISHED-FROZEN-001', () => {
  test('finished, unchanged episodes are frozen like published ones', () => {
    expect(src).toMatch(/return wf === 'published' \|\| st === 'published' \|\| isFinishedUnchangedEpisode\(episode\)/)
    expect(src).toMatch(/status \|\| ''\)\.trim\(\) !== 'audio_ready'\) return false/)
    expect(src).toMatch(/seg >= scr/)
  })
  test('the series loader selects the timestamps the rule needs', () => {
    expect(src).toMatch(/dispatch_failure_reset_at,script_updated_at,segments_generated_at'\)/)
  })
})
