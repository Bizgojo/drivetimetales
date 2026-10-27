import { readFileSync } from 'fs'
import { join } from 'path'
import { hashScript } from '@/lib/continuityPin'

// DESCRIPTION-REPAIR-PIN-001: a header-only DESCRIPTION repair re-pins the
// downstream continuity pins that matched the pre-repair script.
describe('DESCRIPTION-REPAIR-PIN-001', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('description repair calls the re-pin helper with old and new hashes', () => {
    const repair = src.slice(src.indexOf('Failed to save repaired series DESCRIPTION'), src.indexOf('Auto-retry ${retryCount}/${MAX_SERIES_DESCRIPTION_RETRIES}'))
    expect(repair).toMatch(/await refreshPinsAfterHeaderOnlyRepair\(\s*result\.episodes,\s*String\(targetEpisode\.id\),\s*hashScript\(String\(targetEpisode\.script\)\),\s*hashScript\(nextScript\),/)
  })
  test('only pins equal to the old hash move', () => {
    const fn = src.slice(src.indexOf('async function refreshPinsAfterHeaderOnlyRepair('), src.indexOf('async function scoreValidateSeriesPackage('))
    expect(fn).toMatch(/if \(!pins \|\| pins\[storyId\] !== oldHash\) continue/)
    expect(fn).toMatch(/continuity_pins_used: \{ \.\.\.pins, \[storyId\]: newHash \}/)
  })
  test('a DESCRIPTION-only change does change the script hash (why the repair broke pins)', () => {
    const a = 'TITLE: X\nDESCRIPTION: old\nNARRATOR: N\n[START AUDIO DRAMA SCRIPT]\nNARRATOR: hi.'
    expect(hashScript(a)).not.toBe(hashScript(a.replace('DESCRIPTION: old', 'DESCRIPTION: new')))
  })
})
