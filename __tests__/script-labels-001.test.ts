/**
 * SCRIPT-LABELS-001 — job f5b565be: three writer-proof scripts passed the
 * writer self-check and package validation, then series_voice_preflight
 * refused EP1 (51 lines with mixed-case labels; SFX cues as speaker labels).
 * Lines below are copied from those saved scripts.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { findUnlabeledStoryBodyLines, findSfxLabelLines, normalizeScriptFormat } from '@/lib/scriptLabels'
import { buildWriterRewriteFeedback, checkScriptReadiness } from '@/lib/scriptReadiness'

const script = [
  'TITLE: The Coins at Midnight',
  'NARRATOR: Cole Rafferty',
  'CHARACTER GUIDE',
  '---',
  'NELL FARADAY — 34, female, night toll collector.',
  'Conrad Burke — 60, male, retired deputy.',
  '---',
  'BELLE B ANNOUNCEMENT',
  '---',
  'BELLE B: Episode 1.',
  '[START AUDIO DRAMA SCRIPT]',
  'NARRATOR: The bridge hums.',
  'SFX-001: [distant car engine approaching over bridge, tires on metal grating, slowing to a stop]',
  "Nell Faraday: That's a green Buick, isn't it. Four-door.",
  'SFX: [SFX-zero-zero-two — exterior night, cicadas, distant highway]',
  'SFX: [SFX-A — car engine idling, then reversing on gravel]',
  'Conrad Burke: Write it down.',
  'ANDREW SEATON: Evening.',
  'Andrew Seaton: Again.',
  'Then: she ran.',
  '[END AUDIO DRAMA SCRIPT]',
].join('\n')

describe('SCRIPT-LABELS-001', () => {
  test('voice-preflight check finds the mixed-case lines (same function generate-voices uses)', () => {
    const texts = findUnlabeledStoryBodyLines(script).map((l) => l.text)
    expect(texts).toEqual(expect.arrayContaining(["Nell Faraday: That's a green Buick, isn't it. Four-door.", 'Conrad Burke: Write it down.']))
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(src).toContain("import { findUnlabeledStoryBodyLines } from '@/lib/scriptLabels'")
    expect(src).not.toContain('function findUnlabeledStoryBodyLines(')
  })

  test('SFX cues written as labels are found', () => {
    expect(findSfxLabelLines(script).length).toBe(3)
  })

  test('readiness blocks with quoted evidence, and the rewrite feedback quotes it', () => {
    const r = checkScriptReadiness({ script, storyType: 'series_episode', seriesId: 's', seriesTotalEpisodes: 3, episodeNumber: 1 })
    const gates = r.blockers.map((b) => b.gate)
    expect(gates).toEqual(expect.arrayContaining(['LABELS', 'SFX-FORMAT']))
    const fb = buildWriterRewriteFeedback(r, 15)
    expect(fb).toContain("Nell Faraday: That's a green Buick")
    expect(fb).toMatch(/\[SFX: short description\]/)
  })

  test('format-only repair: labels upper-cased only for known characters; SFX cues rewritten; no words change', () => {
    const { script: fixed, changes } = normalizeScriptFormat(script)
    expect(fixed).toContain("NELL FARADAY: That's a green Buick, isn't it. Four-door.")
    expect(fixed).toContain('CONRAD BURKE: Write it down.')
    expect(fixed).toContain('ANDREW SEATON: Again.')
    expect(fixed).toContain('[SFX: distant car engine approaching over bridge, tires on metal grating, slowing to a stop]')
    expect(fixed).toContain('[SFX: exterior night, cicadas, distant highway]')
    expect(fixed).toContain('[SFX: car engine idling, then reversing on gravel]')
    // unknown Title-Case "label" is left alone (it is not a character)
    expect(fixed).toContain('Then: she ran.')
    // header area untouched
    expect(fixed).toContain('Conrad Burke — 60, male, retired deputy.')
    expect(changes).toBe(6)
    expect(findSfxLabelLines(fixed)).toEqual([])
    expect(findUnlabeledStoryBodyLines(fixed).map((l) => l.text)).toEqual(['Then: she ran.'])
  })

  test('a clean script is unchanged', () => {
    const clean = ['[START AUDIO DRAMA SCRIPT]', 'NARRATOR: Hi.', '[SFX: door]', 'NELL FARADAY: Yes.'].join('\n')
    expect(normalizeScriptFormat(clean)).toEqual({ script: clean, changes: 0 })
  })

  test('series writer applies the repair to every draft before the self-check', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const gen = src.slice(src.indexOf('generate: async (feedback, previousDraft) => {'), src.indexOf('check: async (draftScript)'))
    expect(gen).toMatch(/const formatted = (spellOutSpokenNumerals\()?normalizeScriptFormat\(normalized\.script\)/)
    expect(gen).toMatch(/script: formatted\.script/)
  })
})
