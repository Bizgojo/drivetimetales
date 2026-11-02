/**
 * VOICE-LEVEL-001 (Marc 2026-11-02) — quiet voices (e.g. "Pov - Fine Voice")
 * are brought up to match the rest of the cast; one gain per speaker.
 */
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { VOICE_LEVEL, combinedLufs, planSpeakerGains, speakerGainFilter, voiceLevelEnabled, type MeasuredLine } from '@/lib/voiceLevel'

const line = (idx: number, speaker: string, lufs: number, dur = 4, truePeak = -6): MeasuredLine => ({ idx, speaker, lufs, truePeak, dur })

describe('switch', () => {
  test('on unless VOICE_LEVEL=off', () => {
    expect(voiceLevelEnabled({})).toBe(true)
    expect(voiceLevelEnabled({ VOICE_LEVEL: ' OFF ' })).toBe(false)
  })
})

describe('plan', () => {
  const cast = [
    line(1, 'NARRATOR', -16, 20), line(2, 'GRAVES', -16.5), line(3, 'CI FOSTER', -23), line(4, 'NARRATOR', -15.8, 20),
    line(5, 'BANKS', -15.5), line(6, 'CI FOSTER', -22.6), line(7, 'GRAVES', -16),
  ]
  const { targetLufs, gains } = planSpeakerGains(cast)
  test('target is the typical speaker level', () => expect(Math.abs(targetLufs + 16)).toBeLessThan(0.5))
  test('only the quiet speaker changes, lifted to match', () => {
    expect(gains.map((g) => g.speaker)).toEqual(['CI FOSTER'])
    expect(gains[0].gainDb).toBeGreaterThan(6)
    expect(gains[0].lines).toBe(2)
  })
  test('boost is capped and a limiter is added when peaks would clip', () => {
    const { gains: g } = planSpeakerGains([line(1, 'A', -16, 30), line(2, 'B', -16, 30), line(3, 'SOFT', -35, 4, -4)])
    expect(g[0].gainDb).toBe(VOICE_LEVEL.MAX_BOOST_DB)
    expect(g[0].limiter).toBe(true)
    expect(speakerGainFilter(g[0])).toMatch(/^acompressor=.*,volume=9\.00dB$/)
  })
  test('a loud speaker is brought down', () => {
    const { gains: g } = planSpeakerGains([line(1, 'A', -16, 30), line(2, 'B', -16, 30), line(3, 'LOUD', -11)])
    expect(g[0].gainDb).toBeLessThan(-4)
    expect(g[0].limiter).toBe(false)
  })
  test('one speaker or tiny differences: no change', () => {
    expect(planSpeakerGains([line(1, 'A', -20)]).gains).toEqual([])
    expect(planSpeakerGains([line(1, 'A', -16), line(2, 'B', -17)]).gains).toEqual([])
  })
  test('short lines do not decide a speaker level', () => {
    const { gains: g } = planSpeakerGains([line(1, 'A', -16, 30), line(2, 'B', -16, 30), line(3, 'C', -16, 5), line(4, 'C', -40, 0.3)])
    expect(g).toEqual([])
  })
  test('combined loudness is an energy average', () => {
    expect(combinedLufs([{ lufs: -16, dur: 1 }, { lufs: -16, dur: 3 }])).toBeCloseTo(-16, 5)
    expect(combinedLufs([{ lufs: -10, dur: 1 }, { lufs: -40, dur: 1 }])).toBeGreaterThan(-14)
  })
})

describe('ffmpeg', () => {
  const ffmpeg = ['/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find((p) => existsSync(p))
  ;(ffmpeg ? test : test.skip)('a quiet line comes out at the cast level', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vlvl-'))
    const quiet = join(dir, 'q.wav')
    const out = join(dir, 'o.wav')
    execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=4', '-af', 'volume=-30dB', '-y', quiet])
    const measure = (f: string) => {
      const r = require('child_process').spawnSync(ffmpeg!, ['-hide_banner', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
      const m = String(r.stderr).match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)
      return Number(m?.[1])
    }
    const before = measure(quiet)
    const { gains } = planSpeakerGains([line(1, 'A', before + 8, 30), line(2, 'B', before + 8, 30), line(3, 'SOFT', before, 4, before + 3)])
    execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-i', quiet, '-af', speakerGainFilter(gains[0]), '-y', out])
    expect(Math.abs(measure(out) - (before + 8))).toBeLessThan(0.6)
  })
})

describe('wiring', () => {
  const core = readFileSync(join(__dirname, '../app/api/asc3/render-final-mix/core.ts'), 'utf8')
  test('final mix levels speakers after the loudness check', () => {
    expect(core).toContain('planSpeakerGains(measuredLines)')
    expect(core.indexOf('planSpeakerGains(measuredLines)')).toBeGreaterThan(core.indexOf('LOUDNESS-001: near-silent'))
    expect(core).toContain("speakerGainFilter(g)")
  })
})
