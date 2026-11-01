import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// AIRTABLE-ENV-TRIM-001 (2026-11-01): the Vercel AIRTABLE_BASE_ID value carried a
// trailing newline, so every Airtable URL was malformed (404 NOT_FOUND). Every
// read of an Airtable setting must be trimmed.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p)
    return /\.tsx?$/.test(n) ? [p] : []
  })
}

test('every process.env.AIRTABLE_* read is trimmed', () => {
  const root = join(__dirname, '..')
  const offenders: string[] = []
  for (const f of [...files(join(root, 'app')), ...files(join(root, 'lib'))]) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/process\.env\.AIRTABLE_[A-Z_]+[^;,\n]*/g)) {
        if (!/^process\.env\.AIRTABLE_[A-Z_]+\s*\|\|\s*''\)\.trim\(\)/.test(m[0])) offenders.push(`${f.replace(root, '')}:${i + 1}`)
      }
    })
  }
  expect(offenders).toEqual([])
})
