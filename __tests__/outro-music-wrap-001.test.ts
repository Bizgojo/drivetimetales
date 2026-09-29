/**
 * OUTRO-MUSIC-WRAP-001 — the outro music clip must be exactly the requested
 * length even when the chosen offset is near the end of a short music file
 * (the loop wraps). Regression: Origin 2.0 EP06 ended with ~20s of dead air.
 * Runs the real bundled ffmpeg on generated tones.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { outroMusicClipArgs } from '@/lib/outroMusicClip'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FFMPEG: string = require('@ffmpeg-installer/ffmpeg').path

function durationOf(file: string): number {
  let out = ''
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' }) } catch (e: any) { out = String(e.stderr) }
  const m = out.match(/Duration: (\d+):(\d+):([\d.]+)/)
  if (!m) throw new Error('no duration')
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}


describe('outroMusicClipArgs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outro-wrap-'))
  const music = path.join(dir, 'music.mp3')
  beforeAll(() => {
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=30', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', music])
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  test.each([
    ['offset near the end → loop wraps (EP06 case)', 22],
    ['offset early → no wrap', 2],
  ])('%s: clip is the requested length', (_label, offset) => {
    const out = path.join(dir, `clip_${offset}.mp3`)
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...outroMusicClipArgs({
      musicPath: music, offsetSec: offset, durationSec: 25.13, volumeExpr: '1', outPath: out,
    })])
    expect(Math.abs(durationOf(out) - 25.13)).toBeLessThan(0.3)
  })

  test('cutting happens in the filter graph, never with input -ss/-t', () => {
    const args = outroMusicClipArgs({ musicPath: 'm.mp3', offsetSec: 176, durationSec: 25, volumeExpr: '1', outPath: 'o.mp3' })
    const beforeInput = args.slice(0, args.indexOf('-i'))
    expect(beforeInput).not.toContain('-ss')
    expect(beforeInput).not.toContain('-t')
    expect(args.join(' ')).toContain('atrim=start=176:duration=25,asetpts=PTS-STARTPTS')
  })
})
