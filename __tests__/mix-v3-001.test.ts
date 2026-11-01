/**
 * MIX-V3-001 (Marc 2026-11-01, stage 1) — music and backgrounds follow Marc's drawing.
 */
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MIX_V3, envelopeExpr, mixV3Enabled, musicLevelAt, outroMusicEnvelope, storyMusicEnvelope } from '@/lib/mixV3'
import { mixV3BedOptions, planLayeredBody, sfxFilterChain, type BodyItem } from '@/lib/sfxLayeredMix'

const close = (a: number, b: number, eps = 0.002) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('switch', () => {
  test('off unless MIX_V3=on or the option says so', () => {
    expect(mixV3Enabled(undefined, {})).toBe(false)
    expect(mixV3Enabled(undefined, { MIX_V3: ' ON ' })).toBe(true)
    expect(mixV3Enabled(false, { MIX_V3: 'on' })).toBe(false)
    expect(mixV3Enabled(true, {})).toBe(true)
  })
})

describe('story music', () => {
  const storySec = 600
  const { segs, totalSec } = storyMusicEnvelope(storySec)
  const start = MIX_V3.PRE_ROLL_SEC
  const end = start + storySec

  test('length = pre-roll + story + end swell', () => {
    close(totalSec, end + MIX_V3.END_SWELL_RAMP_SEC + MIX_V3.END_SWELL_HOLD_SEC)
  })
  test('fades in, swells, then fades smoothly — no instant drop', () => {
    expect(musicLevelAt(segs, 0)).toBe(0)
    close(musicLevelAt(segs, 1.1), MIX_V3.SWELL)
    // still coming down when the first line starts, between swell and bed
    const atFirstLine = musicLevelAt(segs, start)
    expect(atFirstLine).toBeLessThan(MIX_V3.SWELL)
    expect(atFirstLine).toBeGreaterThan(MIX_V3.BED)
    // reaches the bed 1.5s into the first line
    close(musicLevelAt(segs, start + MIX_V3.FADE_DOWN_INTO_STORY_SEC), MIX_V3.BED)
    // never jumps more than a little between 10ms steps through the whole fade
    for (let t = 1.2; t < start + 2; t += 0.01) {
      expect(Math.abs(musicLevelAt(segs, t + 0.01) - musicLevelAt(segs, t))).toBeLessThan(0.02)
    }
  })
  test('bed under the story, crescendo over the last 45s, still under the voices', () => {
    close(musicLevelAt(segs, start + 100), MIX_V3.BED)
    close(musicLevelAt(segs, end - 45), MIX_V3.BED)
    expect(musicLevelAt(segs, end - 20)).toBeGreaterThan(MIX_V3.BED)
    close(musicLevelAt(segs, end - 0.001), MIX_V3.CRESCENDO_PEAK, 0.003)
    expect(MIX_V3.CRESCENDO_PEAK).toBeLessThan(0.3)
  })
  test('swells after the last line', () => {
    close(musicLevelAt(segs, end + MIX_V3.END_SWELL_RAMP_SEC), MIX_V3.SWELL)
    close(musicLevelAt(segs, totalSec - 0.01), MIX_V3.SWELL)
  })
  test('short story: crescendo is a quarter of it and never overlaps the opening fade', () => {
    const s = storyMusicEnvelope(20)
    close(musicLevelAt(s.segs, MIX_V3.PRE_ROLL_SEC + MIX_V3.FADE_DOWN_INTO_STORY_SEC), MIX_V3.BED)
    for (let i = 1; i < s.segs.length; i += 1) expect(s.segs[i].t0).toBeCloseTo(s.segs[i - 1].t1, 6)
  })
})

describe('outro music', () => {
  const { segs, totalSec, belleDelaySec } = outroMusicEnvelope(20)
  test('comes down from the swell before Belle, soft under her (not silent)', () => {
    close(musicLevelAt(segs, 0), MIX_V3.SWELL)
    close(musicLevelAt(segs, belleDelaySec), MIX_V3.OUTRO_BED)
    close(musicLevelAt(segs, belleDelaySec + 10), MIX_V3.OUTRO_BED)
    expect(MIX_V3.OUTRO_BED).toBeGreaterThan(0)
  })
  test('fades to 0 over exactly 3 seconds after she finishes', () => {
    const belleEnd = belleDelaySec + 20
    close(totalSec, belleEnd + 3)
    close(musicLevelAt(segs, belleEnd + 1.5), MIX_V3.OUTRO_BED / 2)
    expect(musicLevelAt(segs, totalSec)).toBe(0)
  })
})

describe('ffmpeg expression', () => {
  test('matches musicLevelAt at sample points', () => {
    const { segs } = storyMusicEnvelope(120)
    const expr = envelopeExpr(segs)
    // evaluate the expression the way ffmpeg would, with a tiny JS stand-in
    const evalExpr = (t: number) => Function('t', 'if_', 'lt', 'pow', `return ${expr.replace(/\bif\(/g, 'if_(')}`)(t, (c: number, a: number, b: number) => (c ? a : b), (a: number, b: number) => (a < b ? 1 : 0), Math.pow)
    for (const t of [0, 0.5, 1.1, 2, 2.5, 3.9, 50, 90, 110, 122.4, 123, 124.5, 200]) close(evalExpr(t), musicLevelAt(segs, t), 0.001)
  })
  const ffmpeg = ['/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find((p) => existsSync(p))
  ;(ffmpeg ? test : test.skip)('ffmpeg accepts both expressions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mixv3-'))
    for (const expr of [envelopeExpr(storyMusicEnvelope(30).segs), envelopeExpr(outroMusicEnvelope(10).segs)]) {
      execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-filter_complex', `[0:a]volume='${expr}':eval=frame[o]`, '-map', '[o]', '-y', join(dir, 'o.wav')])
    }
  })
})

describe('soft backgrounds', () => {
  const v = (idx: number, dur = 3): BodyItem => ({ kind: 'voice', idx, path: `/v${idx}.mp3`, dur })
  const rain: BodyItem = { kind: 'sfx', idx: 2, path: '/rain.mp3', dur: 20, cue: 'steady rain on a tin roof' }
  test('today: the story waits 2s while the background plays at full volume', () => {
    const plan = planLayeredBody([v(1), rain, v(3)])
    expect(plan.voices[1].start).toBe(5)
    expect(sfxFilterChain(plan.sfx[0], 0, 'fx', plan.totalDuration)).toContain('if(lt(t,2.000),1,')
  })
  test('stage 1: no pause, fades in from silence to the soft level', () => {
    const plan = planLayeredBody([v(1), rain, v(3, 30)], mixV3BedOptions())
    expect(plan.voices[1].start).toBe(3)
    const chain = sfxFilterChain(plan.sfx[0], 0, 'fx', plan.totalDuration)
    expect(chain).toContain("volume='0.350*min(1,t/2.500)'")
    expect(chain).not.toContain('),1,')
    expect(chain).toContain('afade=t=out:st=27.000:d=3.000')
  })
  test('stage 1: a short background splits its time between fade in and fade out', () => {
    const plan = planLayeredBody([v(1), rain, v(3)], mixV3BedOptions())
    const chain = sfxFilterChain(plan.sfx[0], 0, 'fx', plan.totalDuration)
    expect(chain).toContain("volume='0.350*min(1,t/1.500)'")
    expect(chain).toContain('afade=t=out:st=1.500:d=1.500')
  })
})

describe('wiring', () => {
  const core = readFileSync(join(__dirname, '../app/api/asc3/render-final-mix/core.ts'), 'utf8')
  test('final mix uses the stage 1 envelopes only when switched on', () => {
    expect(core).toContain('const MIX_V3_ON = V2_MUSIC_SWELL && mixV3Enabled(opts.mixV3)')
    expect(core).toContain('outroMusicOffset = musicOffset + mixV3MusicSec')
    expect(core).toContain('...(mixV3Enabled(opts.mixV3) ? mixV3BedOptions() : {})')
  })
  test('a mix-only preview keeps the published effects plan', () => {
    expect(core).toContain('? await loadOverlayPlan(supabase, storyId, null)')
  })
})
