/**
 * SFX-LAYERED-001 — layered sound-effect placement (behind SFX_LAYERED_MIX=on).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { bedCueLoopable, classifySfxCue, layeredMixEnabled, planLayeredBody, sfxFilterChain, type BodyItem } from '@/lib/sfxLayeredMix'

const v = (idx: number, dur = 3, sceneBreak = false): BodyItem => ({ kind: 'voice', idx, path: `/v${idx}.mp3`, dur, sceneBreak })
const fx = (idx: number, cue: string, dur: number): BodyItem => ({ kind: 'sfx', idx, path: `/sfx${idx}.mp3`, dur, cue })

describe('classifySfxCue', () => {
  test.each([
    ['rain against high-rise glass, steady and cold', 'bed'],
    ['car engine accelerating onto a wet expressway, rain loud on the windshield', 'bed'],
    ['police radio burst, then tires on wet pavement, engine accelerating', 'bed'],
    ['footsteps on a wooden sidewalk, fading into street ambience', 'bed'],
    ['a mantel clock beginning to tick, steady and clear', 'bed'],
    ['two gunshots, sharp and close, echoing off concrete', 'spot'],
    ['phone buzzing on a car seat, persistent, unanswered', 'spot'],
    ['a small brass bell above a door, ringing once', 'spot'],
    ['the soft sound of paper unfolding, then silence', 'spot'],
    ['a car door slams over distant traffic', 'spot'],
  ])('%s → %s', (cue, role) => {
    expect(classifySfxCue(cue)).toBe(role)
  })
  test('only steady textures loop', () => {
    expect(bedCueLoopable('rain against high-rise glass, steady and cold')).toBe(true)
    expect(bedCueLoopable('police radio burst, then tires on wet pavement')).toBe(false)
    expect(bedCueLoopable('car engine accelerating onto a wet expressway')).toBe(false)
  })
})

describe('planLayeredBody', () => {
  test('no effects: voices back to back, nothing moved', () => {
    const plan = planLayeredBody([v(1), v(2), v(3)])
    expect(plan.voices.map((x) => x.start)).toEqual([0, 3, 6])
    expect(plan.sfx).toEqual([])
    expect(plan.totalDuration).toBe(9)
  })

  test('spot effect: plays in its gap and the next line comes in 0.5 s before it ends', () => {
    const plan = planLayeredBody([v(1), fx(2, 'two gunshots, sharp and close', 2), v(3)])
    expect(plan.sfx[0]).toMatchObject({ role: 'spot', start: 3, length: 2, loop: false })
    expect(plan.voices[1].start).toBeCloseTo(4.5)
  })

  test('short spot effect overlaps at most 30% of itself', () => {
    const plan = planLayeredBody([v(1), fx(2, 'a door knock', 1), v(3)])
    expect(plan.voices[1].start).toBeCloseTo(3.7)
  })

  test('bed: 2 s on its own, then runs under the voice until the scene break, looped, faded', () => {
    const plan = planLayeredBody([v(1), fx(2, 'rain against high-rise glass, steady', 7), v(3), v(4), v(5), v(6, 1.5, true), v(7)])
    const bed = plan.sfx[0]
    expect(bed).toMatchObject({ role: 'bed', start: 3, lead: 2, loop: true })
    expect(plan.voices[1].start).toBe(5) // voice enters after the 2 s lead
    expect(bed.start + bed.length).toBe(14) // scene break line starts at 14
    expect(bed.fadeOut).toBe(3)
  })

  test('bed is capped at 30 s after the lead and stops at the next effect', () => {
    const long = planLayeredBody([v(0), fx(1, 'rain, steady', 7), ...Array.from({ length: 20 }, (_, i) => v(i + 2))])
    expect(long.sfx[0].length).toBeCloseTo(32)
    const next = planLayeredBody([fx(1, 'rain, steady', 7), v(2), v(3), fx(4, 'a gunshot', 2), v(5)])
    expect(next.sfx[0].start + next.sfx[0].length).toBeCloseTo(next.sfx[1].start)
  })

  test('a bed with a sequence in it plays once (no repeating burst)', () => {
    const plan = planLayeredBody([fx(1, 'police radio burst, then tires on wet pavement, engine accelerating', 3), v(2), v(3), v(4), v(5)])
    expect(plan.sfx[0]).toMatchObject({ role: 'bed', loop: false, length: 3 })
  })

  test('effect at the very end keeps its full length in the body', () => {
    const plan = planLayeredBody([v(1), fx(2, 'a gunshot', 2)])
    expect(plan.totalDuration).toBeCloseTo(4.5)
  })
})

describe('ffmpeg chain + wiring', () => {
  test('bed chain ducks after the lead and fades; every chain is padded to the body length', () => {
    const plan = planLayeredBody([v(1), fx(2, 'rain, steady', 7), v(3), v(4), v(5, 3, true)])
    const chain = sfxFilterChain(plan.sfx[0], 1, 'sfx0', plan.totalDuration)
    expect(chain).toContain('volume=')
    expect(chain).toContain('afade=t=out')
    expect(chain).toContain('adelay=3000|3000')
    expect(chain).toMatch(/apad,atrim=duration=/)
  })
  test('off by default; render uses it only when SFX_LAYERED_MIX=on, with fallback to the old concat', () => {
    expect(layeredMixEnabled({})).toBe(false)
    expect(layeredMixEnabled({ SFX_LAYERED_MIX: 'on' })).toBe(true)
    const core = readFileSync(join(__dirname, '..', 'app/api/asc3/render-final-mix/core.ts'), 'utf8')
    expect(core).toContain('if (layeredMixEnabled() && preparedSfx.length > 0)')
    expect(core).toContain('if (!layeredBuilt)')
  })
})
