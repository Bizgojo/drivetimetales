/** SFX-ALL-OFF-001 (Marc 2026-11-01): no sound effects until the professional library is in. */
import { readFileSync } from 'fs'
import { join } from 'path'
import { sfxGloballyOff } from '@/lib/sfxSwitch'

test('switch', () => {
  expect(sfxGloballyOff({})).toBe(false)
  expect(sfxGloballyOff({ SFX_OFF: ' On ' })).toBe(true)
  expect(sfxGloballyOff({ SFX_OFF: 'off' })).toBe(false)
})

test('voice generation and the final mix both treat SFX_OFF=on as sfx_disabled', () => {
  const gv = readFileSync(join(__dirname, '../app/api/admin/generate-voices/route.ts'), 'utf8')
  expect(gv).toContain('const sfxDisabled = Boolean((storyRow as any)?.sfx_disabled) || sfxGloballyOff()')
  const core = readFileSync(join(__dirname, '../app/api/asc3/render-final-mix/core.ts'), 'utf8')
  expect(core).toContain('const sfxIsDisabled = storyRow?.sfx_disabled === true || sfxGloballyOff()')
  // the extra effects pass is already gated on the same flag
  expect(core).toContain('if (overlayEnabled() && !sfxIsDisabled) {')
})
