import { readFileSync } from 'fs'
import { join } from 'path'
import { onlyBelleOutroLengthBlockers, onlyOutroOrDescriptionLengthBlockers } from '@/lib/scriptReadiness'

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

  it('Widow EP3 (job 7bf52d9b): outro AND description too long together are both fixable', () => {
    const widow = ['CARD-COPY: DESCRIPTION 110 characters (max 100)', 'BELLE-CONTENT: outro is too long (43 words; max 42) [current outro: BELLE B: Nina ...]']
    expect(onlyOutroOrDescriptionLengthBlockers(widow)).toEqual({ ok: true, outro: true, description: true })
    expect(onlyOutroOrDescriptionLengthBlockers([real[0]])).toEqual({ ok: true, outro: true, description: false })
    // description alone stays with WRITER-DESC-SHORTEN-001; anything else blocks
    expect(onlyOutroOrDescriptionLengthBlockers(['CARD-COPY: DESCRIPTION 110 characters (max 100)']).ok).toBe(false)
    expect(onlyOutroOrDescriptionLengthBlockers([...widow, 'HOOK-GATE: first line has no hook']).ok).toBe(false)
  })

  it('run-next shortens only the outro and re-runs the same self-check before saving', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/check: \(writerSelfCheckFn = async \(draftScript: string\) =>/)
    expect(src).toMatch(/onlyOutroOrDescriptionLengthBlockers\(outroWriterBlockers\)/)
    expect(src).toMatch(/if \(lengthOnly\.description\) \{[\s\S]{0,300}shortenDescriptionToLimit/)
    expect(src).toMatch(/replaceBelleSection\(script, 'outro', shorter\)[\s\S]{0,900}await writerSelfCheckFn\(nextScript\)[\s\S]{0,40}if \(recheck\.ready\)/)
    expect(src).toMatch(/purpose: 'writer-outro-shorten'/)
    // the repair runs before the failure is recorded
    expect(src.indexOf('WRITER-OUTRO-SHORTEN-001 (Weekend Wife')).toBeLessThan(src.indexOf('still fails pre-save checks after'))
  })
})
