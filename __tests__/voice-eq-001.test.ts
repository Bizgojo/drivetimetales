import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { THOMAS_VOICE_ID, isReservedHeroVoice, voicePostEqFilter } from '@/lib/voiceEq'

// VOICE-EQ-001: Nick Brennan = Thomas + 8 dB low shelf at 110 Hz (Marc approved by ear).
const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
function ffmpegAvailable(): boolean { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } }

describe('VOICE-EQ-001', () => {
  test('Thomas gets the approved bass lift; other voices get none', () => {
    expect(voicePostEqFilter(THOMAS_VOICE_ID)).toBe('bass=g=8:f=110')
    expect(voicePostEqFilter('rkaLzoEcvcQokWOgOgLb')).toBeNull()
  })
  test('Thomas is reserved: auto-cast scoring and the gender fallback skip it', () => {
    expect(isReservedHeroVoice(THOMAS_VOICE_ID)).toBe(true)
    expect(src).toMatch(/\.filter\(v => !isReservedHeroVoice\(v\.voice_id\)\)/)
    expect(src).toMatch(/!isReservedHeroVoice\(v\.voice_id\) &&\n/)
  })
  test('EQ runs before loudness normalization in every TTS attempt', () => {
    expect(src).toMatch(/const eqFilter = voicePostEqFilter\(voiceId\)\n\s*const preBuf = eqFilter \? await applyVoicePostEq\(filteredBuf, eqFilter\) : filteredBuf\n\s*return normalizeSpokenBuffer\(preBuf, inputText, prefix\)/)
  })
  const maybe = ffmpegAvailable() ? test : test.skip
  maybe('the filter lifts a 100 Hz tone by several dB', () => {
    const dir = mkdtempSync(join(tmpdir(), 'veq-'))
    const tone = join(dir, 't.wav'), out = join(dir, 'o.wav')
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=100:d=1', '-af', 'volume=-20dB', tone])
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tone, '-af', 'bass=g=8:f=110', out])
    const vol = (f: string) => {
      const r = require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
      return Number((r.stderr.match(/mean_volume: (-?[\d.]+) dB/) || [])[1])
    }
    expect(vol(out) - vol(tone)).toBeGreaterThan(4)
  })
})
