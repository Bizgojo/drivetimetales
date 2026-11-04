/**
 * BELLE-ONLY-STAMP-001 pins.
 *  1. No confirmation → never stamps (behavior unchanged). `true` is not accepted.
 *  2. Confirmed 'outro' + outro regenerated → stamps (Sunset EP3 case).
 *  3. Confirmed 'intro' but intro skipped (old file kept) → no stamp, even if
 *     the outro was regenerated (review finding: stale intro must not pass).
 *  4. Confirmed 'both' needs both regenerated.
 *  5. Failed run → no stamp.
 *  6. The route reads the flag and calls the helper only in the Belle-only path.
 */

import * as fs from 'fs'
import * as path from 'path'
import { shouldStampAfterBelleOnly, parseBelleEditedLines } from '@/lib/belleOnlyStamp'

describe('BELLE-ONLY-STAMP-001', () => {
  it('only accepts intro / outro / both', () => {
    expect(parseBelleEditedLines('outro')).toBe('outro')
    expect(parseBelleEditedLines(true)).toBeNull()
    expect(parseBelleEditedLines(undefined)).toBeNull()
    expect(parseBelleEditedLines('story')).toBeNull()
  })

  it('never stamps without a confirmation', () => {
    expect(shouldStampAfterBelleOnly({ editedLines: null, success: true, introStatus: 'generated', outroStatus: 'generated' })).toBe(false)
  })

  it('stamps when the confirmed line was regenerated (EP3: outro)', () => {
    expect(shouldStampAfterBelleOnly({ editedLines: 'outro', success: true, introStatus: 'skipped_existing', outroStatus: 'generated' })).toBe(true)
  })

  it('does not stamp over an edited intro that was skipped', () => {
    expect(shouldStampAfterBelleOnly({ editedLines: 'intro', success: true, introStatus: 'skipped_existing', outroStatus: 'generated' })).toBe(false)
  })

  it("'both' needs both lines regenerated", () => {
    expect(shouldStampAfterBelleOnly({ editedLines: 'both', success: true, introStatus: 'generated', outroStatus: 'skipped_existing' })).toBe(false)
    expect(shouldStampAfterBelleOnly({ editedLines: 'both', success: true, introStatus: 'generated', outroStatus: 'generated' })).toBe(true)
  })

  it('does not stamp when the run failed', () => {
    expect(shouldStampAfterBelleOnly({ editedLines: 'outro', success: false, introStatus: 'skipped_existing', outroStatus: 'generated' })).toBe(false)
  })

  it('route wires the flag into the Belle-only path', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'admin', 'generate-voices', 'route.ts'), 'utf8')
    expect(src).toMatch(/belleEditOnlyConfirmed = null/)
    expect(src).toMatch(/editedLines: parseBelleEditedLines\(belleEditOnlyConfirmed\)/)
    const belleOnlyStart = src.indexOf('if (generateBelleOnly === true) {')
    const stampAt = src.indexOf('shouldStampAfterBelleOnly({')
    const nextPathAt = src.indexOf("const { data: allVoices } = await supabase.from('narrator_voices')")
    expect(belleOnlyStart).toBeGreaterThan(0)
    expect(stampAt).toBeGreaterThan(belleOnlyStart)
    expect(stampAt).toBeLessThan(nextPathAt)
  })
})
