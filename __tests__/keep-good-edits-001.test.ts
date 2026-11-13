import { applyPatchEdits } from '@/lib/seriesPatch'
import { readFileSync } from 'fs'
import { join } from 'path'

const script = 'NARRATOR: It is Saturday night.\n\n[SFX: Door, wood, closes]\n\nNARRATOR: After the arraignment, Rosa squeezes my hand.\n\nKELLER: It was written in Celia\'s name.'

describe('KEEP-GOOD-EDITS-001', () => {
  const edits = [
    { find: 'NARRATOR: It is Saturday night.', replace: 'NARRATOR: It is Wednesday night.' },
    { find: '[SFX: Door, wood, closes]\n\nNARRATOR: After the arraignment, Rosa squeezes my han', replace: '' }, // cut mid-line (Widow EP7)
    { find: 'KELLER: not in the script', replace: 'x' },
  ]
  test('strict mode still fails as a whole', () => {
    expect(applyPatchEdits(script, edits).ok).toBe(false)
  })
  test('keepGood applies the good edit and reports the two bad ones', () => {
    const r: any = applyPatchEdits(script, edits, { keepGood: true })
    expect(r.ok).toBe(true)
    expect(r.script).toContain('It is Wednesday night.')
    expect(r.script).toContain('Rosa squeezes my hand.')
    expect(r.skipped).toHaveLength(2)
    expect(r.skipped[0]).toMatch(/^edit 2: must cover whole lines/)
    expect(r.skipped[1]).toMatch(/^edit 3: text not found/)
  })
  test('keepGood with no edit that applies is still a failure', () => {
    expect(applyPatchEdits(script, [edits[2]], { keepGood: true }).ok).toBe(false)
  })
  test('run-next keeps episodes that patched and only rewrites when none did', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('applied = applyPatchEdits(String(ep.script), reply.edits, { keepGood: true })')
    expect(src).toContain('if (goodOutcomes.length) {')
    expect(src).toContain('const patchedScripts = new Map<string, string>(goodOutcomes.map(')
  })
})
