/**
 * MIX-V4-001 (Marc 2026-11-01, stage 2) — music follows tension; spot effects
 * don't pause the story; reaction sounds get a ~1s beat.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { MIX_V3, musicLevelAt, storyMusicEnvelope, TENSION_RAMP_SEC } from '@/lib/mixV3'
import { buildMixPlanPrompt, effectId, fallbackMixPlan, guessReaction, mixPlanInputs, mixV4Enabled, sceneLevelsFromTension, TENSION_GAIN, validateMixPlan } from '@/lib/mixPlan'
import { mixV3BedOptions, mixV4SpotOptions, planLayeredBody, sfxFilterChain, spotGapSec, type BodyItem } from '@/lib/sfxLayeredMix'
import { parseScriptPositions } from '@/lib/scriptLineIndex'

const close = (a: number, b: number, eps = 0.002) => expect(Math.abs(a - b)).toBeLessThan(eps)
const v = (idx: number, dur = 3): BodyItem => ({ kind: 'voice', idx, path: `/v${idx}.mp3`, dur })
const fx = (idx: number, cue: string, dur: number, react?: boolean): BodyItem => ({ kind: 'sfx', idx, path: `/fx${idx}.mp3`, dur, cue, ...(react === undefined ? {} : { react }) })

describe('switch', () => {
  test('off unless MIX_V4=on or the option says so', () => {
    expect(mixV4Enabled(undefined, {})).toBe(false)
    expect(mixV4Enabled(undefined, { MIX_V4: 'on' })).toBe(true)
    expect(mixV4Enabled(false, { MIX_V4: 'on' })).toBe(false)
  })
})

describe('spot effects', () => {
  test('gap: ordinary effect 0.3s; reaction sound a short beat of 0.6-1.0s', () => {
    expect(spotGapSec(2.5, false)).toBe(0.3)
    expect(spotGapSec(0.2, false)).toBe(0.2)
    expect(spotGapSec(2.5, true)).toBe(1.0)
    expect(spotGapSec(0.2, true)).toBe(0.6)
    close(spotGapSec(0.5, true), 0.75)
  })
  test('today: the story waits for the whole effect', () => {
    const plan = planLayeredBody([v(1), fx(2, 'a door opens', 3), v(3)])
    expect(plan.voices[1].start).toBe(5.5)
  })
  test('stage 2: an ordinary effect plays under the start of the next line, then drops under the voice', () => {
    const plan = planLayeredBody([v(1), fx(2, 'a door opens', 3, false), v(3)], { ...mixV3BedOptions(), ...mixV4SpotOptions() })
    close(plan.voices[1].start, 3.3)
    const chain = sfxFilterChain(plan.sfx[0], 0, 'fx', plan.totalDuration)
    expect(chain).toContain("volume='if(lt(t,0.300),1,if(lt(t,0.300+0.25),1-(1-0.450)*(t-0.300)/0.25,0.450))':eval=frame")
  })
  test('stage 2: a reaction sound gets a 1s beat before the line', () => {
    const plan = planLayeredBody([v(1), fx(2, 'two gunshots, close', 2, true), v(3)], mixV4SpotOptions())
    close(plan.voices[1].start, 4.0)
  })
  test('stage 2: a short effect that ends before the voice is not ducked', () => {
    const plan = planLayeredBody([v(1), fx(2, 'a click', 0.2, false), v(3)], mixV4SpotOptions())
    expect(plan.sfx[0].duckAt).toBeUndefined()
  })
})

describe('mix plan', () => {
  const effects = [
    { id: 's5', cue: 'two gunshots echo', before: 'Drop it.', after: 'Get down!' },
    { id: 'o9', cue: 'footsteps on gravel', before: 'She walked on.', after: 'The house was dark.' },
  ]
  test('effect ids', () => {
    expect(effectId(5)).toBe('s5')
    expect(effectId(8.5)).toBe('o9')
  })
  test('prompt lists effects and lines', () => {
    const p = buildMixPlanPrompt([{ index: 1, speaker: 'NARRATOR', text: 'It was quiet.' }], effects)
    expect(p).toContain('s5: [two gunshots echo]')
    expect(p).toContain('1. NARRATOR: It was quiet.')
    expect(p).toContain('"reactions"')
  })
  test('validation: ordered, deduped, first mark at the first line, bad marks dropped', () => {
    const raw = { tension: [{ fromLine: 12, level: 4 }, { fromLine: 3, level: 2 }, { fromLine: 20, level: 4 }, { fromLine: 99, level: 5 }, { fromLine: 30, level: 9 }, { fromLine: 40, level: 5 }], reactions: { s5: true } }
    const { tension, reactions } = validateMixPlan(raw, [1, 3, 12, 20, 30, 40], effects)
    expect(tension).toEqual([{ fromLine: 1, level: 2 }, { fromLine: 12, level: 4 }, { fromLine: 40, level: 5 }])
    expect(reactions).toEqual({ s5: true, o9: false })
  })
  test('fallback: flat bed, reactions guessed from the sound', () => {
    const plan = fallbackMixPlan(effects)
    expect(plan.tension).toEqual([])
    expect(plan.reactions).toEqual({ s5: true, o9: false })
    expect(guessReaction('glass breaking in the kitchen')).toBe(true)
    expect(guessReaction('a kettle starts to whistle')).toBe(false)
  })
  test('inputs: lines around each effect; word-anchored effects skipped', () => {
    const positions = parseScriptPositions('[NARRATOR]: Drop it.\n[SFX: two gunshots echo]\n[CLARA]: Get down!\n[NARRATOR]: Silence.')
    const sfxIdx = positions.find((p) => p.kind === 'sfx')!.index
    const { lines, effects: fx2 } = mixPlanInputs(positions, [{ idx: sfxIdx, cue: 'two gunshots echo' }, { idx: 2.5, cue: 'x', anchored: true }])
    expect(lines.length).toBe(3)
    expect(fx2).toEqual([{ id: `s${sfxIdx}`, cue: 'two gunshots echo', before: 'Drop it.', after: 'Get down!' }])
  })
  test('tension marks → music levels at the times their lines start', () => {
    const levels = sceneLevelsFromTension([{ fromLine: 1, level: 2 }, { fromLine: 10, level: 5 }], [{ idx: 1, start: 0 }, { idx: 9, start: 40 }, { idx: 11, start: 61 }])
    expect(levels).toEqual([{ atSec: 0, level: TENSION_GAIN[2] }, { atSec: 61, level: TENSION_GAIN[5] }])
  })
})

describe('music follows tension', () => {
  const storySec = 600
  const start = MIX_V3.PRE_ROLL_SEC
  const scenes = [{ atSec: 0, level: TENSION_GAIN[2] }, { atSec: 120, level: TENSION_GAIN[4] }, { atSec: 300, level: TENSION_GAIN[1] }]
  const { segs } = storyMusicEnvelope(storySec, undefined, scenes)
  test('fades into the first scene level', () => {
    close(musicLevelAt(segs, start + MIX_V3.FADE_DOWN_INTO_STORY_SEC), TENSION_GAIN[2])
  })
  test('ramps over 5s at each change and holds between', () => {
    close(musicLevelAt(segs, start + 100), TENSION_GAIN[2])
    close(musicLevelAt(segs, start + 120 + TENSION_RAMP_SEC), TENSION_GAIN[4])
    const mid = musicLevelAt(segs, start + 122.5)
    expect(mid).toBeGreaterThan(TENSION_GAIN[2])
    expect(mid).toBeLessThan(TENSION_GAIN[4])
    close(musicLevelAt(segs, start + 400), TENSION_GAIN[1])
  })
  test('always under the voices until the last line; crescendo still ends the story', () => {
    for (let t = start + 2; t < start + storySec; t += 1) expect(musicLevelAt(segs, t)).toBeLessThanOrEqual(MIX_V3.CRESCENDO_PEAK + 1e-9)
    close(musicLevelAt(segs, start + storySec - 0.001), MIX_V3.CRESCENDO_PEAK, 0.003)
  })
  test('segments are continuous', () => {
    for (let i = 1; i < segs.length; i += 1) expect(segs[i].t0).toBeCloseTo(segs[i - 1].t1, 6)
  })
  test('a change inside the crescendo is ignored', () => {
    const e = storyMusicEnvelope(600, undefined, [{ atSec: 0, level: 0.12 }, { atSec: 590, level: 0.2 }])
    close(musicLevelAt(e.segs, start + 550), 0.12)
  })
})

describe('wiring', () => {
  const core = readFileSync(join(__dirname, '../app/api/asc3/render-final-mix/core.ts'), 'utf8')
  test('stage 2 only with both switches; plan sets reactions; tension feeds the music', () => {
    expect(core).toContain('const MIX_V4_ON = mixV4Enabled(opts.mixV4) && mixV3Enabled(opts.mixV3)')
    expect(core).toContain('i.react = !!mixPlan.reactions[effectId(i.idx)]')
    expect(core).toContain('...(MIX_V4_ON ? mixV4SpotOptions() : {})')
    expect(core).toContain('storyMusicEnvelope(segsDur, undefined, mixV4SceneLevels)')
  })
})
