/**
 * ORION-PLAYER-ENDED-001 (Marc walk bug 4, 2026-07-14): media elements fed a
 * misaligned/truncated response can fire 'ended' before the audio actually
 * finished. The old handler trusted every 'ended': marked the story complete
 * (saveProgress(duration, true)) and auto-advanced/navigated away mid-story.
 * Pins the early-ended guard in CanonicalPlayer's onEnded.
 */
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(process.cwd(), 'components/player/CanonicalPlayer.tsx'),
  'utf8'
)

describe('ORION-PLAYER-ENDED-001: spurious early ended guard', () => {
  test('ended is only trusted when currentTime reached duration (2.5s tolerance)', () => {
    expect(src).toMatch(/el\.currentTime < el\.duration - 2\.5/)
  })

  test('early ended recovers in place instead of completing/advancing', () => {
    expect(src).toMatch(/spurious early ended — treating as stall/)
    const guardIdx = src.indexOf('spurious early ended')
    const completeIdx = src.indexOf('saveProgress(duration, true)')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(completeIdx).toBeGreaterThan(guardIdx) // guard runs BEFORE completion marking
  })

  test('guard logs full element diagnostics for the postmortem trail', () => {
    const guardBlock = src.slice(src.indexOf('spurious early ended'), src.indexOf('spurious early ended') + 400)
    expect(guardBlock).toMatch(/readyState/)
    expect(guardBlock).toMatch(/networkState/)
  })
})
