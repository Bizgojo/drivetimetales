import { readFileSync } from 'fs'
import { join } from 'path'
import {
  checkScriptReadiness,
  RUNNEXT_DESCRIPTION_MAX_WORDS,
  RUNNEXT_DESCRIPTION_PAST_TENSE_RE,
  RUNNEXT_TITLE_MAX_CHARS,
  VALIDATOR_SFX_MAX,
} from '@/lib/scriptReadiness'

const filler = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

function makeScript(opts: {
  title?: string
  description?: string
  narratorLines?: number
  wordsPerLine?: number
  sfx?: number
  extraLines?: string[]
} = {}) {
  const lines: string[] = [
    `TITLE: ${opts.title ?? 'The Wrong Floor'}`,
    `DESCRIPTION: ${opts.description ?? 'A broke temp walks onto the wrong floor and spills coffee on the billionaire who decides her future.'}`,
    'NARRATOR: Nora Ashby',
    '',
    'CHARACTER GUIDE',
    '---',
    'LENA HART — 26, female.',
    'ADRIAN VALE — 34, male.',
    '---',
    '',
    'BELLE B: [LISTENER_NAME], When the CEO Fell for Me — Episode 1: The Wrong Floor.',
    '',
  ]
  for (let i = 0; i < (opts.sfx ?? 3); i++) lines.push(`[SFX: door ${i}]`, '')
  for (let i = 0; i < (opts.narratorLines ?? 40); i++) {
    lines.push(`NARRATOR: ${filler(opts.wordsPerLine ?? 40)}`, '')
    lines.push(`LENA HART: ${filler(25)}`, '')
    lines.push(`ADRIAN VALE: ${filler(10)}`, '')
  }
  lines.push(...(opts.extraLines ?? []))
  return lines.join('\n')
}

const series = { storyType: 'series_episode', seriesId: 's1', seriesTotalEpisodes: 3, episodeNumber: 1 }

describe('SCRIPT-READINESS-001', () => {
  test('a clean, long-enough script is ready', () => {
    const r = checkScriptReadiness({ script: makeScript(), ...series, narratorVoiceNames: ['Nora Ashby'] })
    expect(r.blockers).toEqual([])
    expect(r.ready).toBe(true)
    expect(r.metrics.estimatedMins).toBeGreaterThan(12.5)
  })

  test('reports ALL blockers at once (the CEO run-by-run problem)', () => {
    const script = makeScript({
      description: 'A temp was hired by accident and finds a memo dated before her hiring that reveals everything about the man she works for now.',
      sfx: 12,
      narratorLines: 10,
      extraLines: ['NARRATOR: At 8:52 on a Monday morning.'],
    })
    const r = checkScriptReadiness({ script, ...series })
    const gates = r.blockers.map((b) => b.gate)
    expect(gates).toEqual(expect.arrayContaining(['CARD-COPY', 'NUMERAL-PRETTS', 'SFX-001', 'RUNTIME']))
    expect(r.ready).toBe(false)
  })

  test('series Episode-N digit in Belle copy is allowed (run-next passthrough)', () => {
    const r = checkScriptReadiness({ script: makeScript(), ...series })
    expect(r.blockers.find((b) => b.gate === 'NUMERAL-PRETTS')).toBeUndefined()
  })

  test('Creek-shaped script (narration attributed to characters) is blocked', () => {
    const script = makeScript({ narratorLines: 0, extraLines: [
      ...Array.from({ length: 80 }, () => `LENA HART: She looked at the elevator and ${filler(30)}`),
    ] })
    const r = checkScriptReadiness({ script, ...series })
    expect(r.blockers.map((b) => b.gate)).toContain('NARRATION-PRESENCE-001')
  })

  test('narrator not in narrator_voices is blocked when the list is supplied', () => {
    const r = checkScriptReadiness({ script: makeScript(), ...series, narratorVoiceNames: ['Someone Else'] })
    expect(r.blockers.map((b) => b.gate)).toContain('NARRATOR')
  })

  test('speaker missing from CHARACTER GUIDE is blocked', () => {
    const r = checkScriptReadiness({ script: makeScript({ extraLines: ['ELIAS VALE: Sit down.'] }), ...series })
    expect(r.blockers.find((b) => b.gate === 'CHARACTER-GUIDE')?.detail).toMatch(/ELIAS VALE/)
  })

  test('series member typed single is blocked', () => {
    const r = checkScriptReadiness({ script: makeScript(), ...series, storyType: 'single' })
    expect(r.blockers.map((b) => b.gate)).toContain('SERIES-TYPE')
  })

  test('what-if overrides: canon limits (12 min, 6 SFX)', () => {
    const script = makeScript({ sfx: 5, narratorLines: 26 })
    expect(checkScriptReadiness({ script, ...series }).ready).toBe(false)
    expect(checkScriptReadiness({ script, ...series, minMinutes: 12, sfxMax: 6 }).ready).toBe(true)
  })

  test('RUNTIME-BRIEF predicts the post-render gate (Ghost Town Vote shape: ~14 min script, 20-min brief)', () => {
    const script = makeScript({ narratorLines: 30 })
    const r = checkScriptReadiness({ script, ...series, briefMinutes: 20 })
    expect(r.metrics.estimatedMins).toBeGreaterThan(12.5)
    expect(r.metrics.estimatedMins).toBeLessThan(18)
    expect(r.blockers.map((b) => b.gate)).toEqual(['RUNTIME-BRIEF'])
    const matched = checkScriptReadiness({ script, ...series, briefMinutes: Math.round(r.metrics.estimatedMins) })
    expect(matched.ready).toBe(true)
  })

  test('constants are pinned to the run-next gate that actually blocks production', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain(`const TITLE_MAX_CHARS = ${RUNNEXT_TITLE_MAX_CHARS}`)
    expect(src).toContain(`const DESCRIPTION_MAX_WORDS = ${RUNNEXT_DESCRIPTION_MAX_WORDS}`)
    expect(src).toContain(`const DESCRIPTION_PAST_TENSE_RE = ${RUNNEXT_DESCRIPTION_PAST_TENSE_RE.toString()}`)
    expect(src).toContain(`at most ${VALIDATOR_SFX_MAX} per episode (SFX-001)`)
  })
})
