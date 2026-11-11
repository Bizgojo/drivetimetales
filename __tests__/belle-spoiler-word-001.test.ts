import { readFileSync } from 'fs'
import { join } from 'path'
import { softenBelleSpoilerWords, validateBelleLine } from '@/lib/voiceBelleRules'
import { onlyBelleSpoilerOrLengthBlockers } from '@/lib/scriptReadiness'

// BELLE-SPOILER-WORD-001 (Widow EP5, job c944a59e, Nov 11 2026)
const intro = 'Episode Five of "THE WIDOW WHO WATCHED" — "The Locket" — Nina races to hand over hidden evidence before a stolen key exposes her, and a secret insurance policy reveals who Julian\'s next target was.'
describe('BELLE-SPOILER-WORD-001', () => {
  it('swaps the spoiler words so the real intro passes the word check', () => {
    const fixed = softenBelleSpoilerWords(intro)
    expect(fixed).toContain('shows who Julian')
    expect(validateBelleLine('intro', intro, {} as any).some((e) => /spoiler/.test(e))).toBe(true)
    expect(validateBelleLine('intro', fixed, {} as any).some((e) => /spoiler/.test(e))).toBe(false)
    expect(softenBelleSpoilerWords('Revealed at last. It turns out')).toBe('Uncovered at last. It proves')
  })
  it('fires only when spoiler words (plus length lines) are all that is left', () => {
    const line = 'BELLE-CONTENT: voice step (intro): intro risks spoiler language [current intro: BELLE B: ...]'
    expect(onlyBelleSpoilerOrLengthBlockers([line])).toEqual({ ok: true, intro: true, outro: false })
    expect(onlyBelleSpoilerOrLengthBlockers([line, 'BELLE-CONTENT: outro is too long (44 words; max 42)']).ok).toBe(true)
    expect(onlyBelleSpoilerOrLengthBlockers([line, 'HOOK-GATE: no hook']).ok).toBe(false)
    expect(onlyBelleSpoilerOrLengthBlockers(['BELLE-CONTENT: outro is too long (44 words; max 42)']).ok).toBe(false)
  })
  it('run-next repairs before the outro/description repair and re-runs the same check', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/softenBelleSpoilerWords\(current\)[\s\S]{0,400}await writerSelfCheckFn\(nextScript\)/)
    expect(src.indexOf('BELLE-SPOILER-WORD-001 (Widow EP5')).toBeLessThan(src.indexOf('WRITER-OUTRO-SHORTEN-001 (Weekend Wife'))
  })
})
