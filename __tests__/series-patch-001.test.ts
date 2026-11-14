import { planSeriesPatch, parsePatchReply, applyPatchEdits, repinAfterPatch, buildPatchPrompt, seriesPatchEnabled, MAX_SERIES_PATCH_RUNS, MAX_SERIES_PATCH_ISSUES } from '@/lib/seriesPatch'
import { hashScript, verifyContinuityPins } from '@/lib/continuityPin'
import { readFileSync } from 'fs'
import { join } from 'path'

const script = [
  'TITLE: The Closing Dinner',
  '[START AUDIO DRAMA SCRIPT]',
  'NARRATOR: Sunday. Seven in the evening.',
  'MARCUS REED: Lovely evening. Miami always delivers in October.',
  'ROBERT HOLLIS: Sit, sit.',
  'CONNOR REED: I spent two years trying to figure out what that meant.',
  'BELLE B OUTRO: That was Episode Six.',
].join('\n') + '\n' + 'NARRATOR: The ocean kept going. '.repeat(40)

const allEps = new Set([1, 2, 3, 4, 5, 6, 7])

describe('SERIES-PATCH-001 plan', () => {
  test('patches open episodes, skips published ones', () => {
    const p = planSeriesPatch({
      issues: [{ episode: 1, problem: 'a', fix: 'b' }, { episode: 6, problem: 'October', fix: 'November' }, { episode: 5, problem: 'x', fix: 'y' }],
      patchRuns: 0, frozenEpisodes: new Set([1]), episodesWithScript: allEps,
    })
    expect(p.action).toBe('patch')
    if (p.action === 'patch') {
      expect(p.run).toBe(1)
      expect([...p.byEpisode.keys()].sort()).toEqual([5, 6])
    }
  })
  test('stops at the budget, on too many issues, and when nothing is open', () => {
    expect(planSeriesPatch({ issues: [{ episode: 2, problem: 'a', fix: '' }], patchRuns: MAX_SERIES_PATCH_RUNS, frozenEpisodes: new Set(), episodesWithScript: allEps }).action).toBe('skip')
    const many = Array.from({ length: MAX_SERIES_PATCH_ISSUES + 1 }, () => ({ episode: 2, problem: 'a', fix: '' }))
    expect(planSeriesPatch({ issues: many, patchRuns: 0, frozenEpisodes: new Set(), episodesWithScript: allEps }).action).toBe('skip')
    expect(planSeriesPatch({ issues: [{ episode: 1, problem: 'a', fix: '' }], patchRuns: 0, frozenEpisodes: new Set([1]), episodesWithScript: allEps }).action).toBe('skip')
    expect(planSeriesPatch({ issues: [], patchRuns: 0, frozenEpisodes: new Set(), episodesWithScript: allEps }).action).toBe('skip')
  })
  test('on by default; SERIES_PATCH=off disables', () => {
    expect(seriesPatchEnabled({})).toBe(true)
    expect(seriesPatchEnabled({ SERIES_PATCH: 'off' })).toBe(false)
  })
})

describe('SERIES-PATCH-001 edits', () => {
  test('applies whole-line edits, including a deletion', () => {
    const r = applyPatchEdits(script, [
      { find: 'MARCUS REED: Lovely evening. Miami always delivers in October.', replace: 'MARCUS REED: Lovely evening. Miami always delivers in November.' },
      { find: 'ROBERT HOLLIS: Sit, sit.\n', replace: '' },
      { find: 'CONNOR REED: I spent two years trying to figure out what that meant.', replace: 'CONNOR REED: I spent eight months trying to figure out what that meant.' },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.script).toContain('delivers in November.')
      expect(r.script).not.toContain('ROBERT HOLLIS')
      expect(r.script).toContain('eight months')
      expect(r.script).toContain('BELLE B OUTRO: That was Episode Six.')
    }
  })
  test('rejects text that is missing, repeated, or part of a line', () => {
    expect(applyPatchEdits(script, [{ find: 'NOT IN THE SCRIPT', replace: 'x' }]).ok).toBe(false)
    expect(applyPatchEdits(script, [{ find: 'NARRATOR: The ocean kept going.', replace: 'x' }]).ok).toBe(false)
    expect(applyPatchEdits(script, [{ find: 'in October.', replace: 'in November.' }]).ok).toBe(false)
    expect(applyPatchEdits(script, []).ok).toBe(false)
  })
  test('rejects a patch that is really a rewrite', () => {
    const big = 'A: one\n' + 'B: two\n'.repeat(10)
    expect(applyPatchEdits(big, [{ find: big.trim(), replace: 'C: new' }]).ok).toBe(false)
  })
  test('parses JSON with or without surrounding text', () => {
    expect(parsePatchReply('{"edits":[{"find":"a","replace":"b"}],"unfixed":[]}')).toEqual({ edits: [{ find: 'a', replace: 'b' }], unfixed: [] })
    expect(parsePatchReply('Here:\n{"edits":[{"find":"a","replace":"b"}]}')?.edits.length).toBe(1)
    expect(parsePatchReply('no json')).toBeNull()
  })
  test('prompt carries the fixes and the whole script', () => {
    const p = buildPatchPrompt({ seriesTitle: 'Weekend Wife in Miami', episodeNumber: 6, title: 'The Closing Dinner', script, issues: [{ episode: 6, problem: 'month is October', fix: "Change 'October' to 'November'." }] })
    expect(p).toContain("Change 'October' to 'November'.")
    expect(p).toContain('MARCUS REED: Lovely evening.')
    expect(p).toMatch(/exactly once/)
  })
})

describe('SERIES-PATCH-001 continuity pins', () => {
  test('later episodes are re-pinned to the patched script, so GATE 2 passes', () => {
    const ep4 = { id: 's4', episode_number: 4, script: 'EP4 old', script_json: {} }
    const ep5 = { id: 's5', episode_number: 5, script: 'EP5', script_json: { series_generation: { continuity_pins_used: { s4: hashScript('EP4 old') } } } }
    const patched = new Map([['s4', 'EP4 new']])
    expect(verifyContinuityPins([{ ...ep4, script: 'EP4 new' }, ep5]).ok).toBe(false)
    const repinned = repinAfterPatch([ep4, ep5], patched)
    expect(repinned.has('s5')).toBe(true)
    expect(verifyContinuityPins([{ ...ep4, script: 'EP4 new' }, { ...ep5, script_json: repinned.get('s5') }]).ok).toBe(true)
  })
})

describe('SERIES-PATCH-001 wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('patch runs before the whole-episode rewrite and before giving up', () => {
    const patch = src.indexOf('SERIES-PATCH-001 (Weekend Wife in Miami')
    const rewrite = src.indexOf('SERIES-REWRITE-001: a story-content failure')
    const giveUp = src.indexOf('`Series validation needs attention:')
    expect(patch).toBeGreaterThan(0)
    expect(patch).toBeLessThan(rewrite)
    expect(rewrite).toBeLessThan(giveUp)
  })
  test('both series reads hand over structured issues', () => {
    expect(src.match(/seriesReadIssues: /g)?.length).toBe(3) // both series reads + STOPPED-BLOCKERS-001
  })
  test('patched episodes are re-validated, never left as passed', () => {
    const block = src.slice(src.indexOf('SERIES-PATCH-001 (Weekend Wife in Miami'), src.indexOf('SERIES-REWRITE-001: a story-content failure'))
    expect(block).toContain("status: 'script_drafted'")
    expect(block).toContain('validator_result: null')
    expect(block).toContain('current_step: NEXT_STEP_AFTER_SERIES_SCRIPTS')
    expect(block).toContain('seriesAutoRepairExempt')
  })
})

describe('SERIES-PATCH-001 budget survives a rewrite', () => {
  test('the whole-episode rewrite keeps patchRuns in seriesRewrite', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain("seriesRewrite: { ...((priorState as any).seriesRewrite || {}), counts: rewriteCounts,")
    expect(src).not.toMatch(/seriesRewrite: \{ counts: rewriteCounts/)
  })
})

describe('SERIES-PATCH-RETRY-001', () => {
  const { buildPatchRetryMessage } = require('@/lib/seriesPatch')
  test('retry message names the failure and asks for all edits again', () => {
    const m = buildPatchRetryMessage('edit 1: text not found: "ROBERT HOLLIS: Sit down."')
    expect(m).toContain('text not found')
    expect(m).toMatch(/character for character/)
    expect(m).toMatch(/ALL edits/)
  })
  test('run-next retries once before falling back to a rewrite', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const block = src.slice(src.indexOf('SERIES-PATCH-RETRY-001'), src.indexOf('SERIES-REWRITE-001: a story-content failure'))
    expect(block.match(/callPatchWriter\(/g)?.length).toBe(2)
    expect(block).toContain('buildPatchRetryMessage(why)')
    expect(block).toContain('(after 1 retry)')
  })
})

describe('SERIES-PATCH-QUOTES-001', () => {
  const { applyPatchEdits: apply, matchKey } = require('@/lib/seriesPatch')
  const curly = 'TITLE: X\nDIANE HOLLIS: There they are. I was starting to think you’d found a better dinner.\nNARRATOR: She smiled — too brightly.\n' + 'NARRATOR: Waves. '.repeat(30)
  test('a straight apostrophe in the quote matches a curly one in the script', () => {
    const r = apply(curly, [{ find: "DIANE HOLLIS: There they are. I was starting to think you'd found a better dinner.", replace: '' }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.script).not.toContain('DIANE HOLLIS')
  })
  test('a hyphen in the quote matches an em dash in the script, and untouched text keeps its curly marks', () => {
    const r = apply(curly, [{ find: 'NARRATOR: She smiled - too brightly.', replace: 'NARRATOR: She smiled — too politely.' }])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.script).toContain('too politely')
      expect(r.script).toContain('you’d')
    }
  })
  test('matching copy keeps the same length', () => {
    expect(matchKey(curly).length).toBe(curly.length)
  })
})

describe('SERIES-PATCH-LINES-001', () => {
  const { applyPatchEdits: apply, locatePatchSpan } = require('@/lib/seriesPatch')
  const spaced = 'TITLE: X\n\nNARRATOR: Then we walked to the table.\n\n[SFX: Footsteps, walking, tile or hallway]\n\nDIANE HOLLIS: There they are. I was starting to think you’d found a better dinner somewhere on the island.\n\nJESS MARLOWE: Never. Your taste is impossible to compete with, Diane.\n\nNARRATOR: Diane laughed.\n' + 'NARRATOR: Waves. '.repeat(40)
  test('a multi-line quote without the blank lines still matches', () => {
    const find = "DIANE HOLLIS: There they are. I was starting to think you'd found a better dinner somewhere on the island.\nJESS MARLOWE: Never. Your taste is impossible to compete with, Diane."
    const r = apply(spaced, [{ find, replace: 'NARRATOR: Diane waved us over.' }])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.script).not.toContain('DIANE HOLLIS')
      expect(r.script).not.toContain('JESS MARLOWE: Never.')
      expect(r.script).toContain('NARRATOR: Diane waved us over.\n\nNARRATOR: Diane laughed.')
      expect(r.script).toContain('NARRATOR: Then we walked to the table.')
    }
  })
  test('a partial line still never matches, and a repeated block is refused', () => {
    expect(apply(spaced, [{ find: 'Your taste is impossible', replace: 'x' }]).ok).toBe(false)
    const twice = 'A: hi\n\nB: yo\n\nA: hi\n\nB: yo\n'
    expect(locatePatchSpan(twice, 'A: hi\nB: yo').error).toMatch(/2 times/)
  })
})
