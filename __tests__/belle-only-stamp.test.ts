/**
 * BELLE-ONLY-STAMP-001 pins.
 *  1. No flag → never stamps (behavior unchanged).
 *  2. Flag + success + a Belle line regenerated → stamps.
 *  3. Flag but nothing regenerated (both skipped) → no stamp.
 *  4. Flag but the run failed → no stamp.
 *  5. The route reads the flag and calls the helper only in the Belle-only path.
 */

import * as fs from 'fs'
import * as path from 'path'
import { shouldStampAfterBelleOnly } from '@/lib/belleOnlyStamp'

describe('BELLE-ONLY-STAMP-001', () => {
  it('never stamps without the confirmation flag', () => {
    expect(shouldStampAfterBelleOnly({ confirmed: false, success: true, introStatus: 'skipped_existing', outroStatus: 'generated' })).toBe(false)
  })

  it('stamps when confirmed, successful and a Belle line was regenerated', () => {
    expect(shouldStampAfterBelleOnly({ confirmed: true, success: true, introStatus: 'skipped_existing', outroStatus: 'generated' })).toBe(true)
    expect(shouldStampAfterBelleOnly({ confirmed: true, success: true, introStatus: 'generated', outroStatus: 'skipped_existing' })).toBe(true)
  })

  it('does not stamp when nothing was regenerated', () => {
    expect(shouldStampAfterBelleOnly({ confirmed: true, success: true, introStatus: 'skipped_existing', outroStatus: 'skipped_existing' })).toBe(false)
  })

  it('does not stamp when the run failed', () => {
    expect(shouldStampAfterBelleOnly({ confirmed: true, success: false, introStatus: 'skipped_existing', outroStatus: 'failed' })).toBe(false)
  })

  it('route wires the flag into the Belle-only path', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'admin', 'generate-voices', 'route.ts'), 'utf8')
    expect(src).toMatch(/belleEditOnlyConfirmed = false/)
    expect(src).toMatch(/confirmed: belleEditOnlyConfirmed === true/)
    const belleOnlyStart = src.indexOf('if (generateBelleOnly === true) {')
    const stampAt = src.indexOf('shouldStampAfterBelleOnly({')
    const nextPathAt = src.indexOf("const { data: allVoices } = await supabase.from('narrator_voices')")
    expect(belleOnlyStart).toBeGreaterThan(0)
    expect(stampAt).toBeGreaterThan(belleOnlyStart)
    expect(stampAt).toBeLessThan(nextPathAt)
  })
})
