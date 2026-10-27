import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// TRIM-TAIL-001 (job a21df7bd EP3 segment_0035): the quiet-line silence trim
// cut every line at its first internal pause.
const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
const filter = (src.match(/export const SEGMENT_SILENCE_TRIM_FILTER =\s*'([^']+)' \+\s*'([^']+)'/) || []).slice(1).join('')

function ffmpegAvailable(): boolean {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false }
}

describe('TRIM-TAIL-001', () => {
  test('trim filter has no stop_periods (which truncates at the first pause)', () => {
    expect(filter).toBe('silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.12:start_threshold=-45dB,areverse')
    expect(src).not.toMatch(/stop_periods=1:stop_duration=0\.12/)
    expect(src).toMatch(/'-af', SEGMENT_SILENCE_TRIM_FILTER,/)
  })

  const maybe = ffmpegAvailable() ? test : test.skip
  maybe('speech, 0.4 s pause, speech: both parts survive the trim', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trimtail-'))
    const input = join(dir, 'in.mp3'), out = join(dir, 'out.mp3')
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=300:d=0.8', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=0.4', '-f', 'lavfi', '-i', 'sine=f=300:d=0.6', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', '-ar', '44100', input])
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input, '-af', filter, '-ar', '44100', '-ac', '2', out])
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString())
    expect(dur).toBeGreaterThan(1.5) // the old filter returned ~0.89 s (second word lost)
  })
})
