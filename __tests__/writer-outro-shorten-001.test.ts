import { readFileSync } from 'fs'
import { join } from 'path'
import { onlyBelleOutroLengthBlockers } from '@/lib/scriptReadiness'

// WRITER-OUTRO-SHORTEN-001 (Weekend Wife in Miami job a1058f05, Nov 11, 2026):
// three drafts failed only because the Belle outro was 52 words (max 42).
const real = [
  'BELLE-CONTENT: outro is too long (52 words; max 42) [current outro: BELLE B: Jess and Connor wrote vows ...]',
  'BELLE-CONTENT: voice step (outro): outro is too long for Belle (52 words; max 42 — cut at least 10) [current outro: BELLE B: ...]',
]

describe('WRITER-OUTRO-SHORTEN-001', () => {
  it('matches the exact blockers from the failed job', () => {
    expect(onlyBelleOutroLengthBlockers(real)).toBe(true)
    expect(onlyBelleOutroLengthBlockers([real[0]])).toBe(true)
  })

  it('never fires when anything else is wrong, or on nothing', () => {
    expect(onlyBelleOutroLengthBlockers([])).toBe(false)
    expect(onlyBelleOutroLengthBlockers([...real, 'CARD-COPY: DESCRIPTION 140 characters (max 100)'])).toBe(false)
    expect(onlyBelleOutroLengthBlockers(['BELLE-CONTENT: non-finale outro must be exactly two sentences: one recap sentence, then the next episode by number (found 3)'])).toBe(false)
    expect(onlyBelleOutroLengthBlockers(['BELLE-CONTENT: intro is too long (45 words; max 38)'])).toBe(false)
  })

  it('run-next shortens only the outro and re-runs the same self-check before saving', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/check: \(writerSelfCheckFn = async \(draftScript: string\) =>/)
    expect(src).toMatch(/onlyBelleOutroLengthBlockers\(outroWriterBlockers\)/)
    expect(src).toMatch(/replaceBelleSection\(script, 'outro', shorter\)[\s\S]{0,120}await writerSelfCheckFn\(nextScript\)[\s\S]{0,40}if \(recheck\.ready\)/)
    expect(src).toMatch(/purpose: 'writer-outro-shorten'/)
    // the repair runs before the failure is recorded
    expect(src.indexOf('WRITER-OUTRO-SHORTEN-001 (Weekend Wife')).toBeLessThan(src.indexOf('still fails pre-save checks after'))
  })
})
