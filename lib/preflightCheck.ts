/**
 * RERECORD-RUNNER-002 — pure checks for scripts/preflight-remaining.ts.
 *
 * Spends no ElevenLabs credits and calls no generate-voices endpoint. Looks
 * only at a story's script text and its existing storage folder listing, so
 * every remaining episode can be checked in seconds instead of one at a time
 * overnight.
 */
import { parseScriptPositions } from './scriptLineIndex'

export type PreflightIssue = { severity: 'error' | 'warn'; message: string }

const LONG_LINE_WORD_THRESHOLD = 60 // informational only — long lines are more likely to hit the split-rescue path

/**
 * Checks that do not require the music file's actual duration (that check —
 * musicDurationIssues — needs ffmpeg + a download, so it is a separate,
 * optional step the caller runs only when a music file is present).
 */
export function preflightScript(script: string, storageFiles: string[]): PreflightIssue[] {
  const issues: PreflightIssue[] = []

  let positions: ReturnType<typeof parseScriptPositions>
  try {
    positions = parseScriptPositions(script)
  } catch (e) {
    return [{ severity: 'error', message: `Script did not parse: ${String(e)}` }]
  }

  if (positions.length === 0) {
    issues.push({ severity: 'error', message: 'Script parsed to zero positions' })
    return issues
  }

  const announcerLines = positions.filter((p) => p.kind === 'voice' && p.speaker === 'BELLE B')
  if (announcerLines.length === 0) {
    issues.push({ severity: 'error', message: 'No BELLE B lines found — the Belle intro/outro hard gate will fail immediately' })
  } else if (announcerLines.length === 1) {
    issues.push({ severity: 'warn', message: 'Only one BELLE B line found (expected an intro and an outro)' })
  }

  const expectedVoiceOrSilence = positions.filter((p) => p.isExpected)
  if (expectedVoiceOrSilence.length === 0) {
    issues.push({ severity: 'error', message: 'No expected (voiced) segments in script' })
  }

  const longLines = positions.filter(
    (p) => p.kind === 'voice' && p.isExpected && p.text.trim().split(/\s+/).length > LONG_LINE_WORD_THRESHOLD,
  )
  if (longLines.length > 0) {
    issues.push({
      severity: 'warn',
      message: `${longLines.length} line(s) over ${LONG_LINE_WORD_THRESHOLD} words (indices: ${longLines.slice(0, 5).map((p) => p.index).join(', ')}${longLines.length > 5 ? ', …' : ''}) — more likely to hit the split-rescue path`,
    })
  }

  const hasMusic = storageFiles.includes('background_music.mp3')
  if (!hasMusic) {
    issues.push({ severity: 'error', message: 'No background_music.mp3 in storage — the mix step hard-requires it' })
  }

  return issues
}

/** Music duration too short for findStrongMusicOffset's own 20s minimum window. */
export function musicDurationIssue(durationSecs: number): PreflightIssue | null {
  if (!Number.isFinite(durationSecs) || durationSecs <= 0) {
    return { severity: 'warn', message: 'Could not measure background_music.mp3 duration' }
  }
  if (durationSecs < 20) {
    return { severity: 'error', message: `background_music.mp3 is only ${durationSecs.toFixed(1)}s (render needs 20s+ to pick a music offset)` }
  }
  return null
}
