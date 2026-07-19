// UX-GO-001 — /go CTA & conversion rework (Marc approval, msg 2942,
// 2026-07-19 08:13 EDT: Option A card copy + CTA-002 completion state +
// reassurance subtext). REVISED per Marc review verdict (msg 3015,
// 2026-07-19 15:26 EDT): card line adds "Then just $7.99/month.";
// completion heading is variant-aware (series openers a/b vs standalone
// bare default); completion button is now "Hear what happens next →".
//
// Covers (commit 1 / UX):
//   1. CTA-001 Option A — honest card-required trial copy, byte-exact, on
//      BOTH CTA surfaces (bottom sheet + static footer), days always from
//      the fail-quiet GO_BASE_TRIAL_DAYS/getTrialDisplay path (never a
//      hardcoded 14).
//   2. CTA-002 — completion-triggered sheet state: heading/button pivot,
//      byte-exact strings, transition latch (exactly once on 'ended'),
//      one-time ~300ms attention pulse, no audio interaction, cta_click
//      unchanged.
//   3. CTA-004 — footnote present pre-completion, ABSENT post-completion.
//   4. Reveal latch (shouldRevealTrialCta) unchanged.

import fs from 'fs'
import path from 'path'
import {
  getTrialDisplay,
  getGoCtaCopy,
  nextCompletedState,
  shouldRevealTrialCta,
  GO_CTA_COPY_DEFAULT,
  GO_CTA_COPY_COMPLETED,
  GO_COMPLETED_HEADING_SERIES,
  GO_MONTHLY_PRICE_DISPLAY,
  GO_SAMPLE_STORY,
  GO_STORY_VARIANTS,
  GO_BASE_TRIAL_DAYS,
  CTA_REVEAL_LISTEN_SEC,
} from '@/lib/landing'

const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'go', 'page.tsx'), 'utf8')

// ============================================================================
// CTA-001 Option A — honest card-required copy (Marc verbatim basis:
// "card required — you won't be charged before your 14-day trial ends,
// cancel anytime"), reconciled with the old reassurance subtext into ONE
// line. Byte-exact pins — Marc reviews these strings.
// ============================================================================
describe('UX-GO-001 CTA-001 Option A: card-required trial copy', () => {
  test('default (no promo): byte-exact card-honest line (Marc verbatim, msg 3015), 14-day fail-quiet base', () => {
    const d = getTrialDisplay(null, 'none', null)
    expect(d.days).toBe(GO_BASE_TRIAL_DAYS)
    expect(d.subtext).toBe(
      "Card required — you won't be charged before your 14-day free trial ends. Then just $7.99/month. Cancel anytime."
    )
  })

  test('invalid promo / validation down: same fail-quiet 14-day line', () => {
    expect(getTrialDisplay('BOGUS', 'invalid', null).subtext).toBe(
      "Card required — you won't be charged before your 14-day free trial ends. Then just $7.99/month. Cancel anytime."
    )
  })

  test('valid longer promo: days flow from the promo path (never hardcoded 14)', () => {
    const d = getTrialDisplay('LONG30', 'valid', 30)
    expect(d.days).toBe(30)
    expect(d.subtext).toBe(
      "Card required — you won't be charged before your 30-day free trial ends. Then just $7.99/month. Cancel anytime."
    )
  })

  test('price: single source GO_MONTHLY_PRICE_DISPLAY (hardcode flagged — no plan-price config exists)', () => {
    expect(GO_MONTHLY_PRICE_DISPLAY).toBe('$7.99')
    // The subtext template interpolates the constant, not a literal price.
    const landingSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'landing.ts'), 'utf8')
    expect(landingSrc).toContain('${GO_MONTHLY_PRICE_DISPLAY}/month')
  })

  test('the trial-days number is NOT hardcoded in the page or the copy template', () => {
    // The page renders {trial.subtext}; no literal hardcoded trial copy.
    expect(pageSrc).not.toContain('14-day free trial')
    expect(pageSrc).not.toContain('14-day trial')
    // lib template interpolates ${days}.
    const landingSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'landing.ts'), 'utf8')
    expect(landingSrc).toContain("Card required — you won't be charged before your ${days}-day free trial ends. Then just ${GO_MONTHLY_PRICE_DISPLAY}/month. Cancel anytime.")
  })

  test('BOTH surfaces render trial.subtext (sheet + static footer)', () => {
    expect((pageSrc.match(/\{trial\.subtext\}/g) || []).length).toBe(2)
    // The old bare days-line is gone from both surfaces.
    expect(pageSrc).not.toContain('-day free trial · cancel anytime')
    // And the old unreconciled subtext copy no longer exists anywhere.
    const landingSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'landing.ts'), 'utf8')
    expect(landingSrc).not.toContain('Free for ${days} days.')
  })
})

// ============================================================================
// CTA-002 — completion-triggered CTA state (byte-exact copy + latch)
// ============================================================================
describe('UX-GO-001 CTA-002: completion state copy (byte-exact)', () => {
  test('pre-completion copy is the unchanged rev C set', () => {
    expect(GO_CTA_COPY_DEFAULT.heading).toBe('Keep the story going')
    expect(GO_CTA_COPY_DEFAULT.buttonLabel).toBe('Start free trial')
    expect(GO_CTA_COPY_DEFAULT.footnote).toBe('Your story keeps playing while you sign up.')
  })

  test('completion copy default (STANDALONE-safe — bare /go): Marc msg 3015 heading + button, footnote REMOVED (CTA-004)', () => {
    expect(GO_CTA_COPY_COMPLETED.heading).toBe("And that's the story — there are hundreds more.")
    // Marc verbatim (msg 3015) — replaces the earlier build's
    // 'Hear what happens next →'.
    expect(GO_CTA_COPY_COMPLETED.buttonLabel).toBe("Hear what happens next →")
    expect(GO_CTA_COPY_COMPLETED.footnote).toBeNull()
  })

  test('getGoCtaCopy switches on the completed flag', () => {
    expect(getGoCtaCopy(false)).toBe(GO_CTA_COPY_DEFAULT)
    expect(getGoCtaCopy(true)).toBe(GO_CTA_COPY_COMPLETED)
  })

  test('variant-aware completion heading (msg 3015): series openers a/b get the Episode 1 heading', () => {
    expect(GO_COMPLETED_HEADING_SERIES).toBe("That's where Episode 1 ends — for now.")
    for (const v of ['a', 'b'] as const) {
      expect(GO_STORY_VARIANTS[v].completedHeading).toBe(GO_COMPLETED_HEADING_SERIES)
      const copy = getGoCtaCopy(true, GO_STORY_VARIANTS[v])
      expect(copy.heading).toBe("That's where Episode 1 ends — for now.")
      // Button + footnote identical to the standalone case.
      expect(copy.buttonLabel).toBe("Hear what happens next →")
      expect(copy.footnote).toBeNull()
    }
  })

  test('standalone default (bare /go — Grave) + fallback stories use the hundreds-more heading', () => {
    // Grave configures NO completedHeading → standalone-safe fallback.
    expect(GO_SAMPLE_STORY.completedHeading).toBeUndefined()
    expect(getGoCtaCopy(true, GO_SAMPLE_STORY)).toBe(GO_CTA_COPY_COMPLETED)
    expect(getGoCtaCopy(true, GO_SAMPLE_STORY).heading).toBe("And that's the story — there are hundreds more.")
    // No story at all (defensive) → same standalone-safe default.
    expect(getGoCtaCopy(true)).toBe(GO_CTA_COPY_COMPLETED)
  })

  test('pre-completion copy is story-independent (variant never changes the default sheet)', () => {
    expect(getGoCtaCopy(false, GO_STORY_VARIANTS.a)).toBe(GO_CTA_COPY_DEFAULT)
    expect(getGoCtaCopy(false, GO_STORY_VARIANTS.b)).toBe(GO_CTA_COPY_DEFAULT)
    expect(getGoCtaCopy(false, GO_SAMPLE_STORY)).toBe(GO_CTA_COPY_DEFAULT)
  })

  test('page passes the SERVED story into getGoCtaCopy (variant-aware rendering)', () => {
    expect(pageSrc).toContain('const ctaCopy = getGoCtaCopy(completed, story)')
  })

  test('CTA-004: footnote present pre-completion, absent post-completion', () => {
    expect(getGoCtaCopy(false).footnote).toBe('Your story keeps playing while you sign up.')
    expect(getGoCtaCopy(true).footnote).toBeNull()
    // The page renders the footnote conditionally — no unconditional <p>.
    expect(pageSrc).toContain('{ctaCopy.footnote && (')
    // The literal footnote string no longer lives in the page (single source
    // of truth in lib/landing.ts).
    expect(pageSrc).not.toContain('Your story keeps playing while you sign up.')
  })
})

describe('UX-GO-001 CTA-002: completion latch — transitions exactly once', () => {
  test('ended fires → completed', () => {
    expect(nextCompletedState(false, true)).toBe(true)
  })

  test('latch: once completed, stays completed (replay reaching ended again is a no-op)', () => {
    expect(nextCompletedState(true, true)).toBe(true)
    expect(nextCompletedState(true, false)).toBe(true)
  })

  test('no ended, not completed → stays pre-completion', () => {
    expect(nextCompletedState(false, false)).toBe(false)
  })

  test('page wires the latch off the existing onPlaybackEnded hook only', () => {
    // setCompleted appears exactly once, inside handlePlaybackEnded, via the
    // pure latch — nothing else can flip (or unflip) the completion state.
    expect((pageSrc.match(/setCompleted\(/g) || []).length).toBe(1)
    expect(pageSrc).toContain('setCompleted(prev => nextCompletedState(prev, true))')
    const endedHandler = pageSrc.slice(
      pageSrc.indexOf('const handlePlaybackEnded'),
      pageSrc.indexOf('const handleCtaClick')
    )
    expect(endedHandler).toContain('setCompleted(prev => nextCompletedState(prev, true))')
  })

  test('one-time ~300ms attention pulse: iteration-count 1, gated on completed', () => {
    expect(pageSrc).toContain('goCtaCompletionPulse 300ms ease-out 1')
    expect(pageSrc).toContain("animation: completed ? 'goCtaCompletionPulse 300ms ease-out 1' : 'none'")
    expect(pageSrc).toContain('@keyframes goCtaCompletionPulse')
  })

  test('no audio-element interaction from the completion state (render-only)', () => {
    // The page still never touches an audio element directly; the only ended
    // wiring is the existing onPlaybackEnded prop (the <audio> element lives
    // inside GoSamplePlayer only).
    expect(pageSrc).not.toMatch(/audioRef|\.pause\(\)|\.play\(\)|new Audio\(/)
    expect(pageSrc).not.toMatch(/<audio\s/)
    expect(pageSrc).toContain('onPlaybackEnded={handlePlaybackEnded}')
  })

  test('cta_click unchanged: same handler + same href on both buttons in both states', () => {
    expect((pageSrc.match(/onClick=\{handleCtaClick\}/g) || []).length).toBe(2)
    expect((pageSrc.match(/href=\{ctaHref\}/g) || []).length).toBe(2)
    // The href is still the promo+utm campaign builder — no new params.
    expect(pageSrc).toContain('buildCampaignSignupHref(searchParams)')
  })

  test('completion also shows the CTA surfaces (sheetVisible = ctaRevealed || completed)', () => {
    expect(pageSrc).toContain('const sheetVisible = ctaRevealed || completed')
    expect(pageSrc).toContain('aria-hidden={!sheetVisible}')
    expect(pageSrc).toContain("transform: sheetVisible ? 'translateY(0)' : 'translateY(110%)'")
  })
})

// ============================================================================
// Reveal latch unchanged (hard gate)
// ============================================================================
describe('UX-GO-001: 45s+ listen reveal latch UNCHANGED', () => {
  test('shouldRevealTrialCta behavior identical to rev C', () => {
    expect(shouldRevealTrialCta({ listenedSec: 0 })).toBe(false)
    expect(shouldRevealTrialCta({ listenedSec: CTA_REVEAL_LISTEN_SEC - 1 })).toBe(false)
    expect(shouldRevealTrialCta({ listenedSec: CTA_REVEAL_LISTEN_SEC })).toBe(true)
    expect(shouldRevealTrialCta({ listenedSec: 0, alreadyRevealed: true })).toBe(true)
    expect(shouldRevealTrialCta({ listenedSec: 30, revealAfterSec: 70 })).toBe(false)
    expect(shouldRevealTrialCta({ listenedSec: 70, revealAfterSec: 70 })).toBe(true)
    expect(CTA_REVEAL_LISTEN_SEC).toBe(45)
  })

  test('page still owns ctaRevealed via shouldRevealTrialCta with the per-story threshold', () => {
    expect(pageSrc).toContain('shouldRevealTrialCta({ listenedSec: cum, alreadyRevealed: prev, revealAfterSec })')
    expect(pageSrc).toContain('const revealAfterSec = story.ctaRevealSeconds')
    // Completion must NOT write the reveal latch (they are independent).
    const endedHandler = pageSrc.slice(
      pageSrc.indexOf('const handlePlaybackEnded'),
      pageSrc.indexOf('const handleCtaClick')
    )
    expect(endedHandler).not.toContain('setCtaRevealed')
  })

  test('/go hard rules hold: no auth calls introduced', () => {
    // No auth/supabase imports or calls (comments may mention Supabase; the
    // patterns below only match real code identifiers).
    expect(pageSrc).not.toMatch(/@supabase|lib\/supabase|useAuth|createClient\(|getSession\(|onAuthStateChange/)
  })

  test('/go stays in PUBLIC_ROUTES (middleware untouched by this build)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8')
    const match = src.match(/const PUBLIC_ROUTES = new Set\(\[([\s\S]*?)\]\)/)
    expect(match).not.toBeNull()
    const routes = Array.from(match![1].matchAll(/'([^']+)'/g)).map(m => m[1])
    expect(routes).toContain('/go')
  })
})
