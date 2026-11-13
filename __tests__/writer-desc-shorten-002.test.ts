import { readFileSync } from 'fs'
import { join } from 'path'

describe('WRITER-DESC-SHORTEN-002', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fn = src.slice(src.indexOf('async function shortenDescriptionLoop('), src.indexOf('async function shortenDescriptionLoop(') + 1200)
  test('three tries, aiming well below the limit in words and characters', () => {
    expect(fn).toContain('attempt < 3 && description.length > DESCRIPTION_MAX_CHARS')
    expect(fn).toMatch(/at most \$\{attempt > 1 \? 12 : 14\} words and about 80 to 90 characters/)
    expect(fn).toContain('hard limit ${DESCRIPTION_MAX_CHARS}')
  })
})
