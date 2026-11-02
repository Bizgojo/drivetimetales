/** FAIR-ROTATION-001 (2026-11-02): run-next picks the least recently touched job. */
import { readFileSync } from 'fs'
import { join } from 'path'

test('candidate order is updated_at, then created_at', () => {
  const src = readFileSync(join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fn = src.slice(src.indexOf('async function selectCandidate('), src.indexOf('async function lockJob('))
  expect(fn).toMatch(/\.order\('updated_at', \{ ascending: true \}\)\s*\n\s*\.order\('created_at', \{ ascending: true \}\)/)
})
