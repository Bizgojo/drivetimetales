// SUS/ATL-LANDING-002: /go landing page redesign (cover-art hero + deferred
// trial CTA bottom sheet). Covers:
//   1. shouldRevealTrialCta — the pure reveal decision:
//        a) 45s cumulative listening triggers
//        b) pause-after-play triggers
//        c) 20s idle triggers ONLY when play was never pressed
//        d) once revealed, stays revealed (latch)
//   2. GO_SAMPLE_STORY.coverUrl — present, https, and the page/player render
//      the hero through the const only (no hardcoded URLs).
//   3. Redesign copy pins — headline 'Stories made for the drive.', CTA sheet
//      copy, no feature bullets, badge copy unchanged.

import fs from 'fs'
import path from 'path'
import {
  shouldRevealTrialCta,
  CTA_REVEAL_LISTEN_SEC,
  CTA_REVEAL_IDLE_SEC,
  GO_SAMPLE_STORY,
  getTrialDisplay,
} from '@/lib/landing'

const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'go', 'page.tsx'), 'utf8')
const playerSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'GoSamplePlayer.tsx'), 'utf8')

// Baseline: fresh arrival — nothing revealed.
const base = { listenedSec: 0, everPlayed: false, pausedAfterPlay: false, idleSec: 0 }

describe('SUS/ATL-LANDING-002: shouldRevealTrialCta', () => {
  test('fresh arrival → hidden', () => {
    expect(shouldRevealTrialCta(base)).toBe(false)
  })

  test('(a) cumulative listening reaches threshold → reveal', () => {
    expect(shouldRevealTrialCta({ ...base, everPlayed: true, listenedSec: CTA_REVEAL_LISTEN_SEC })).toBe(true)
    expect(shouldRevealTrialCta({ ...base, everPlayed: true, listenedSec: CTA_REVEAL_LISTEN_SEC + 30 })).toBe(true)
  })

  test('(a) listening below threshold → still hidden', () => {
    expect(shouldRevealTrialCta({ ...base, everPlayed: true, listenedSec: CTA_REVEAL_LISTEN_SEC - 1 })).toBe(false)
    expect(shouldRevealTrialCta({ ...base, everPlayed: true, listenedSec: 0 })).toBe(false)
  })

  test('(b) pause after having played → reveal (even at low listened time)', () => {
    expect(shouldRevealTrialCta({ ...base, everPlayed: true, pausedAfterPlay: true, listenedSec: 3 })).toBe(true)
  })

  test('(b) stray pause without ever playing → does NOT reveal', () => {
    expect(shouldRevealTrialCta({ ...base, everPlayed: false, pausedAfterPlay: true })).toBe(false)
  })

  test('(c) idle threshold with NO play ever → reveal', () => {
    expect(shouldRevealTrialCta({ ...base, idleSec: CTA_REVEAL_IDLE_SEC })).toBe(true)
    expect(shouldRevealTrialCta({ ...base, idleSec: CTA_REVEAL_IDLE_SEC + 100 })).toBe(true)
  })

  test('(c) idle below threshold → hidden', () => {
    expect(shouldRevealTrialCta({ ...base, idleSec: CTA_REVEAL_IDLE_SEC - 1 })).toBe(false)
  })

  test('(c) idle does NOT apply once the user has played (active listener is not idle)', () => {
    expect(shouldRevealTrialCta({ ...base, everPlayed: true, idleSec: 999, listenedSec: 10 })).toBe(false)
  })

  test('(d) once revealed, stays revealed regardless of other inputs', () => {
    expect(shouldRevealTrialCta({ ...base, alreadyRevealed: true })).toBe(true)
    expect(shouldRevealTrialCta({ listenedSec: 0, everPlayed: true, pausedAfterPlay: false, idleSec: 0, alreadyRevealed: true })).toBe(true)
  })

  test('thresholds are the Marc-spec values (45s listen / 20s idle)', () => {
    expect(CTA_REVEAL_LISTEN_SEC).toBe(45)
    expect(CTA_REVEAL_IDLE_SEC).toBe(20)
  })
})

describe('SUS/ATL-LANDING-002: cover art hero', () => {
  test('GO_SAMPLE_STORY.coverUrl is present and https', () => {
    expect(GO_SAMPLE_STORY.coverUrl).toMatch(/^https:\/\//)
    expect(GO_SAMPLE_STORY.coverUrl).toContain(GO_SAMPLE_STORY.id)
  })

  test('page passes coverUrl through the const only (no hardcoded cover URL)', () => {
    expect(pageSrc).toContain('coverUrl={GO_SAMPLE_STORY.coverUrl}')
    expect(pageSrc).not.toContain(GO_SAMPLE_STORY.coverUrl)
    expect(playerSrc).not.toContain(GO_SAMPLE_STORY.coverUrl)
  })

  test('player has a graceful fallback when the cover image errors', () => {
    expect(playerSrc).toContain('onError')
    expect(playerSrc).toMatch(/coverFailed/)
    expect(playerSrc).toMatch(/linear-gradient/) // dark gradient fallback block
  })

  test('hero overlays: free-sample pill + slim title/genre/duration bar', () => {
    expect(playerSrc).toContain('Free sample — no account needed')
    expect(playerSrc).toContain('{title} · {genre} · {durationMins} min')
  })
})

describe('SUS/ATL-LANDING-002: redesign copy pins', () => {
  test("headline is exactly 'Stories made for the drive.'", () => {
    expect(pageSrc).toContain('Stories made for the drive.')
    // Old LANDING-001 copy must be gone.
    expect(pageSrc).not.toContain('Turn Your Daily Commute Into Story Time')
    expect(pageSrc).not.toContain('press play')
  })

  test('no feature bullets anywhere (Marc rule)', () => {
    expect(pageSrc).not.toContain('✓ Original series')
    expect(pageSrc).not.toContain('Episodes sized to fit your drive')
    expect(pageSrc).not.toMatch(/<ul/)
  })

  test('CTA sheet copy: heading, subline, button, microcopy', () => {
    expect(pageSrc).toContain('Keep the story going')
    expect(pageSrc).toContain('-day free trial · cancel anytime')
    expect(pageSrc).toContain('Start free trial')
    expect(pageSrc).toContain('Your story keeps playing while you sign up.')
  })

  test('CTA sheet is a translateY slide-up, hidden until revealed', () => {
    expect(pageSrc).toMatch(/translateY\(110%\)/)
    expect(pageSrc).toMatch(/translateY\(0\)/)
    expect(pageSrc).toContain('shouldRevealTrialCta')
  })

  test('promo badge copy unchanged (never raw codes)', () => {
    const d = getTrialDisplay('GVLMETA', 'valid', 14)
    expect(d.appliedBadge).toBe('Special offer applied — 14-day free trial ✓')
    expect(pageSrc).toContain('trial.appliedBadge')
  })

  test('CTA href still carries promo + utm via buildCampaignSignupHref', () => {
    expect(pageSrc).toContain('buildCampaignSignupHref(searchParams)')
    expect(pageSrc).toMatch(/href=\{ctaHref\}/)
  })

  test('terms/privacy footer links remain', () => {
    expect(pageSrc).toContain('href="/terms"')
    expect(pageSrc).toContain('href="/privacy"')
  })
})
