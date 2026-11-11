/**
 * RERECORD-RUNNER-002 — render-failure classification and preflight checks.
 */
import { classifyRenderFailure } from '@/lib/rerecordPlan'
import { preflightScript, musicDurationIssue } from '@/lib/preflightCheck'

describe('classifyRenderFailure', () => {
  test('the EP06 silent-outro failure is story-specific', () => {
    const out = [
      '✅ Mix complete: 1122.9s',
      '❌ Post-render validation failed:',
      'Last 10s effectively silent (max_volume -91.0 dB) — outro may be missing or truncated',
      'Belle outro vocal fade detected: max_volume in outro body is -91.0 dB (threshold -35 dB).',
      '[ATL-LOCALMIX-001] ❌ FAILED: Error: Post-render validation failed:',
    ].join('\n')
    expect(classifyRenderFailure(out)).toBe('episode')
  })

  test.each([
    'Missing story segment file segment_0031.mp3',
    'No announcement audio found (expected announcement_*.mp3...)',
    'No outro audio found',
    'No story segments found',
    'Missing story-specific background_music.mp3; generate music before final render.',
    'Duplicate story segment numbers found: 12',
    'Segment file is empty after download (0 bytes)',
    'Segment file too small (40 bytes)',
    'LOUDNESS-001: near-silent or unmeasurable segment(s) detected',
    '[preflight] PARSER CONTRACT FAILURE — this is not a mix problem.',
  ])('story-specific marker %p classifies as episode', (marker) => {
    expect(classifyRenderFailure(`some log\n${marker}\nmore log`)).toBe('episode')
  })

  test.each([
    'TypeError: fetch failed',
    'Error: ENOSPC: no space left on device',
    '[ATL-LOCALMIX-001] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local',
    'Command timed out',
    '',
  ])('an unrecognized failure %p defaults to batch (never silently masks an outage)', (out) => {
    expect(classifyRenderFailure(out)).toBe('batch')
  })

  test.each([
    'MISSING_CORRECTED_INTRO: story_id abc — intro_corrected.mp3 listed in storage but failed to download: fetch failed',
    'MISSING_CORRECTED_OUTRO: story_id abc — outro_corrected.mp3 listed in storage but failed to download: socket hang up',
    'Failed to prepare story segment segment_0005.mp3: TypeError: fetch failed',
    'Failed to prepare all selected story segments',
    'final_mix.mp3 upload silently failed — file not present in storage after upload',
  ])(
    'a wrapper that CAN hide a network/systemic cause %p is never classified episode (dropped from the allowlist, not just override-checked)',
    (out) => {
      expect(classifyRenderFailure(out)).toBe('batch')
    },
  )

  test('a systemic-error signature always wins even alongside a story-level marker', () => {
    // Would match 'Segment file too small' (story-level) but the real cause is a
    // truncated network download, not a genuinely tiny/corrupt source file.
    const out = 'Segment file too small (12 bytes) after download: TypeError: fetch failed'
    expect(classifyRenderFailure(out)).toBe('batch')
  })
})

describe('preflightScript', () => {
  const GOOD_SCRIPT = [
    'TITLE: Origin 2.0 — Episode Nine',
    '',
    'NARRATOR: Ray Dolan - Science',
    '',
    'BELLE B: [LISTENER_NAME], welcome to Origin 2.0. Episode Nine.',
    '',
    'NARRATOR: A short line.',
    '',
    'NARRATOR: Another short line here.',
    '',
    'BELLE B: Origin 2.0, written by Marc Postlewaite — an Endless Tales original.',
  ].join('\n')

  test('a healthy script with music present has no errors', () => {
    const issues = preflightScript(GOOD_SCRIPT, ['background_music.mp3', 'segment_0000.mp3'])
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
  })

  test('missing background_music.mp3 is an error', () => {
    const issues = preflightScript(GOOD_SCRIPT, ['segment_0000.mp3'])
    expect(issues).toContainEqual({ severity: 'error', message: expect.stringContaining('background_music.mp3') })
  })

  test('no BELLE B lines is an error (Belle hard gate will fail)', () => {
    const noBelle = GOOD_SCRIPT.split('\n').filter((l) => !l.startsWith('BELLE B:')).join('\n')
    const issues = preflightScript(noBelle, ['background_music.mp3'])
    expect(issues).toContainEqual({ severity: 'error', message: expect.stringContaining('No BELLE B lines') })
  })

  test('only one BELLE B line is a warning, not an error', () => {
    const oneBelle = GOOD_SCRIPT.split('\n').filter((l, i, arr) => {
      // drop the second BELLE B line
      const belleIdx = arr.map((x, j) => (x.startsWith('BELLE B:') ? j : -1)).filter((j) => j >= 0)
      return i !== belleIdx[1]
    }).join('\n')
    const issues = preflightScript(oneBelle, ['background_music.mp3'])
    expect(issues.some((i) => i.severity === 'error')).toBe(false)
    expect(issues).toContainEqual({ severity: 'warn', message: expect.stringContaining('Only one BELLE B line') })
  })

  test('a long line is flagged as an informational warning, not an error', () => {
    const longLine = 'NARRATOR: ' + Array(70).fill('word').join(' ')
    const withLong = GOOD_SCRIPT + '\n\n' + longLine
    const issues = preflightScript(withLong, ['background_music.mp3'])
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0)
    expect(issues.some((i) => i.severity === 'warn' && i.message.includes('over 60 words'))).toBe(true)
  })

  test('unparseable script is an error, not a crash', () => {
    expect(() => preflightScript(null as unknown as string, [])).not.toThrow()
  })
})

describe('musicDurationIssue', () => {
  test('too short for findStrongMusicOffset is an error', () => {
    expect(musicDurationIssue(12)).toEqual({ severity: 'error', message: expect.stringContaining('12.0s') })
  })
  test('long enough is fine', () => {
    expect(musicDurationIssue(187)).toBeNull()
  })
  test('unmeasurable duration is a warning', () => {
    expect(musicDurationIssue(NaN)?.severity).toBe('warn')
    expect(musicDurationIssue(0)?.severity).toBe('warn')
  })
})
