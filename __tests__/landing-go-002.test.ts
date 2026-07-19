// SUS/ATL-LANDING-002 rev C: /go landing page (Marc FINAL spec, Jul 12).
// Covers:
//   1. shouldRevealTrialCta — 45s cumulative listening is the ONLY trigger:
//        a) ≥45s listening reveals; <45s stays hidden
//        b) NO pause-after-play trigger (removed in rev C)
//        c) NO idle fallback (removed in rev C — fired while Marc was reading)
//        d) once revealed, stays revealed (latch)
//   2. Story variants (Greenville A/B, approval-gated) — resolveGoStory:
//      ?v=a|b selection, GO_AB_LIVE=false gate-off behavior, junk values,
//      variant shapes, Greenville hooks.
//   3. Cover art hero — coverUrl through the resolved story only, graceful
//      image fallback, pill retained.
//   4. rev C layout pins — NO headline, NO duration pre-play, below-art
//      title/hook/'Genre · Listen free' stack, CTA sheet copy unchanged,
//      static always-present bottom CTA.

import fs from 'fs'
import path from 'path'
import {
  shouldRevealTrialCta,
  CTA_REVEAL_LISTEN_SEC,
  GO_SAMPLE_STORY,
  GO_STORY_VARIANTS,
  GO_AB_LIVE,
  GO_LIVE_VARIANTS,
  resolveGoStory,
  getTrialDisplay,
} from '@/lib/landing'

const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'go', 'page.tsx'), 'utf8')
const playerSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'GoSamplePlayer.tsx'), 'utf8')
const landingSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'landing.ts'), 'utf8')

describe('SUS/ATL-LANDING-002 rev C: shouldRevealTrialCta (45s-only)', () => {
  test('fresh arrival → hidden', () => {
    expect(shouldRevealTrialCta({ listenedSec: 0 })).toBe(false)
  })

  test('cumulative listening reaches 45s → reveal', () => {
    expect(shouldRevealTrialCta({ listenedSec: CTA_REVEAL_LISTEN_SEC })).toBe(true)
    expect(shouldRevealTrialCta({ listenedSec: CTA_REVEAL_LISTEN_SEC + 30 })).toBe(true)
  })

  test('listening below 45s → still hidden', () => {
    expect(shouldRevealTrialCta({ listenedSec: CTA_REVEAL_LISTEN_SEC - 1 })).toBe(false)
    expect(shouldRevealTrialCta({ listenedSec: 0.0001 })).toBe(false)
  })

  test('garbage listenedSec never reveals', () => {
    expect(shouldRevealTrialCta({ listenedSec: NaN })).toBe(false)
    expect(shouldRevealTrialCta({ listenedSec: Infinity })).toBe(false)
  })

  test('latch: once revealed, stays revealed regardless of listenedSec', () => {
    expect(shouldRevealTrialCta({ listenedSec: 0, alreadyRevealed: true })).toBe(true)
  })

  test('threshold is the Marc-spec value (45s)', () => {
    expect(CTA_REVEAL_LISTEN_SEC).toBe(45)
  })

  test('rev C REMOVED the pause-after-play trigger (no such input exists)', () => {
    // The signature is minimal: pausedAfterPlay/everPlayed are gone from the
    // lib AND the page no longer wires any pause-driven reveal.
    expect(landingSrc).not.toMatch(/pausedAfterPlay/)
    expect(pageSrc).not.toMatch(/pausedAfterPlay|onPauseAfterPlay/)
    expect(playerSrc).not.toMatch(/onPauseAfterPlay|onFirstPlay/)
  })

  test('rev C REMOVED the 20s idle fallback (no timer, no constant)', () => {
    expect(landingSrc).not.toMatch(/CTA_REVEAL_IDLE_SEC|idleSec/)
    expect(pageSrc).not.toMatch(/CTA_REVEAL_IDLE_SEC|idleSec|idleTimer/)
  })
})

describe('SUS/ATL-LANDING-002 rev C: story variants (Greenville A/B, per-variant gate)', () => {
  // Marc 2026-07-12: A approved 13:57; B approved 15:50 (published + hook +
  // Liberty Bridge cover PASS) — full A/B active.
  test('live allowlist: both Greenville variants approved', () => {
    expect(GO_LIVE_VARIANTS).toEqual(['a', 'b'])
    expect(GO_AB_LIVE).toBe(true)
  })

  test('?v=a serves Commuter (approved); case-insensitive + trims', () => {
    expect(resolveGoStory('?v=a')).toBe(GO_STORY_VARIANTS.a)
    expect(resolveGoStory('v=a')).toBe(GO_STORY_VARIANTS.a)
    expect(resolveGoStory('?v=A')).toBe(GO_STORY_VARIANTS.a)
  })

  test('?v=b serves Falls Park (approved 15:50); case-insensitive + trims', () => {
    expect(resolveGoStory('?v=b')).toBe(GO_STORY_VARIANTS.b)
    expect(resolveGoStory('v=b')).toBe(GO_STORY_VARIANTS.b)
    expect(resolveGoStory('?v=B')).toBe(GO_STORY_VARIANTS.b)
  })

  test('empty allowlist = everything defaults (full gate-off)', () => {
    expect(resolveGoStory('?v=a', [])).toBe(GO_SAMPLE_STORY)
    expect(resolveGoStory('?v=b', [])).toBe(GO_SAMPLE_STORY)
  })

  test('missing/junk ?v values fall back to the default, never throw', () => {
    for (const junk of ['', '?v=', '?v=c', '?v=zzz', '?v=aa', '?other=1', '?v=%00', 'utm_source=fb']) {
      expect(resolveGoStory(junk)).toBe(GO_SAMPLE_STORY)
      expect(resolveGoStory(junk, ['a', 'b'])).toBe(GO_SAMPLE_STORY)
    }
  })

  test('default story is Grave (live today), correct id + copy', () => {
    expect(GO_SAMPLE_STORY.id).toBe('49730f36-46a9-4309-927c-6b9140afac79')
    expect(GO_SAMPLE_STORY.title).toBe('The Grave He Dug Himself')
    expect(GO_SAMPLE_STORY.genre).toBe('Adventure')
    expect(GO_SAMPLE_STORY.hook).toContain('retired sheriff')
  })

  test('variant A is Commuter of the Year (Comedy) with the spec URLs', () => {
    const a = GO_STORY_VARIANTS.a
    expect(a.id).toBe('go-variant-a')
    expect(a.title).toBe('Commuter of the Year')
    expect(a.genre).toBe('Comedy')
    expect(a.coverUrl).toBe('https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/Covers/landing/go-variant-a/cover.jpg')
    expect(a.audioUrl).toBe('https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/go-variant-a/final_mix.mp3')
  })

  test('variant B is Murder at Falls Park (Mystery) with the spec URLs', () => {
    const b = GO_STORY_VARIANTS.b
    expect(b.id).toBe('go-variant-b')
    expect(b.title).toBe('Murder at Falls Park')
    expect(b.genre).toBe('Mystery')
    // Liberty Bridge corrected art (Marc redo 2026-07-12) — versioned filename.
    expect(b.coverUrl).toBe('https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/Covers/landing/go-variant-b/cover_20260712_liberty.jpg')
    expect(b.audioUrl).toBe('https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/landing/go-variant-b/final_mix.mp3')
  })

  test('variant hooks are Greenville-localized (a + b)', () => {
    expect(GO_STORY_VARIANTS.a.hook).toContain('Greenville')
    expect(GO_STORY_VARIANTS.b.hook).toContain('Greenville')
  })

  test('hooks are marked SUSAN-PASS (Susan owns final copy)', () => {
    expect((landingSrc.match(/SUSAN-PASS: placeholder hook, Susan owns final copy/g) || []).length)
      .toBeGreaterThanOrEqual(3)
  })

  test('page wires the resolved story (no GO_SAMPLE_STORY direct render, no hardcoded variant URLs)', () => {
    expect(pageSrc).toContain('resolveGoStory(searchParams.toString())')
    expect(pageSrc).toContain('storyId={story.id}')
    expect(pageSrc).not.toContain('go-variant-a')
    expect(pageSrc).not.toContain('go-variant-b')
  })
})

describe('SUS/ATL-LANDING-002: cover art hero', () => {
  test('GO_SAMPLE_STORY.coverUrl is present and https', () => {
    expect(GO_SAMPLE_STORY.coverUrl).toMatch(/^https:\/\//)
    expect(GO_SAMPLE_STORY.coverUrl).toContain(GO_SAMPLE_STORY.id)
  })

  test('page passes coverUrl through the resolved story only (no hardcoded cover URL)', () => {
    expect(pageSrc).toContain('coverUrl={story.coverUrl}')
    expect(pageSrc).not.toContain(GO_SAMPLE_STORY.coverUrl)
    expect(playerSrc).not.toContain(GO_SAMPLE_STORY.coverUrl)
  })

  test('player has a graceful fallback when the cover image errors', () => {
    expect(playerSrc).toContain('onError')
    expect(playerSrc).toMatch(/coverFailed/)
    expect(playerSrc).toMatch(/linear-gradient/) // dark gradient fallback block
  })

  test('free-sample pill retained at the top of the art', () => {
    expect(playerSrc).toContain('Free sample — no account needed')
  })
})

describe('SUS/ATL-LANDING-002 rev C: layout + copy pins', () => {
  test("rev C REMOVED the 'Stories made for the drive.' headline", () => {
    expect(pageSrc).not.toContain('Stories made for the drive.')
    // Old LANDING-001 copy also still gone.
    expect(pageSrc).not.toContain('Turn Your Daily Commute Into Story Time')
  })

  test('rev C REMOVED the slim on-art title bar (title lives below the art)', () => {
    expect(playerSrc).not.toContain('{title} · {genre}')
    expect(playerSrc).not.toMatch(/durationMins/)
  })

  test('NO duration display pre-play anywhere (times only in the progress row once playing)', () => {
    // No minutes copy on page or player.
    expect(pageSrc).not.toMatch(/durationMins|\bmin\b(?![A-Za-z])/)
    expect(playerSrc).not.toMatch(/durationMins|\{.*\} min/)
    // The progress row (formatTime) exists but only inside the hasStarted block.
    expect(playerSrc).toContain('{hasStarted && (')
    expect(playerSrc).toContain('formatTime(duration)')
  })

  test("below-art stack: title → hook → 'Genre · Listen free'", () => {
    expect(pageSrc).toContain('{story.title}')
    expect(pageSrc).toContain('{story.hook}')
    expect(pageSrc).toContain('{story.genre} · Listen free')
  })

  test('below-art stack sizes per spec (19px title / 15px hook / 12.5px genre line)', () => {
    expect(pageSrc).toContain("fontSize: '19px'")
    expect(pageSrc).toContain("fontSize: '15px'")
    expect(pageSrc).toContain("fontSize: '12.5px'")
  })

  test('no feature bullets anywhere (Marc rule)', () => {
    expect(pageSrc).not.toContain('✓ Original series')
    expect(pageSrc).not.toContain('Episodes sized to fit your drive')
    expect(pageSrc).not.toMatch(/<ul/)
  })

  test('CTA sheet copy (UX-GO-001): state copy via getGoCtaCopy, card-honest trial line rendered', () => {
    // Heading/button/footnote now come from lib/landing.ts getGoCtaCopy so
    // the completion state (CTA-002) can pivot them — byte-exact strings are
    // pinned in __tests__/ux-go-001.test.ts.
    expect(pageSrc).toContain('{ctaCopy.heading}')
    expect(pageSrc).toContain('{ctaCopy.buttonLabel}')
    expect(pageSrc).toContain('{ctaCopy.footnote}')
    // CTA-001 Option A: the bare days-line was replaced by trial.subtext.
    expect(pageSrc).toContain('{trial.subtext}')
    expect(pageSrc).not.toContain('-day free trial · cancel anytime')
  })

  test('CTA sheet is a translateY slide-up, hidden until revealed', () => {
    expect(pageSrc).toMatch(/translateY\(110%\)/)
    expect(pageSrc).toMatch(/translateY\(0\)/)
    expect(pageSrc).toContain('shouldRevealTrialCta')
  })

  test('STATIC BOTTOM CTA: in-flow block with button + card-honest subline (WALK-BUG-0713: reveal-gated)', () => {
    expect(pageSrc).toContain('STATIC BOTTOM CTA')
    // The static block keeps its literal 'Start free trial' button (the
    // sheet button is now state-driven via ctaCopy.buttonLabel — CTA-002).
    expect((pageSrc.match(/Start free trial/g) || []).length).toBe(1)
    // Both surfaces carry the same campaign href.
    expect((pageSrc.match(/href=\{ctaHref\}/g) || []).length).toBe(2)
    // The card-honest trial line (UX-GO-001 CTA-001) appears in the sheet
    // AND the static block.
    expect((pageSrc.match(/\{trial\.subtext\}/g) || []).length).toBe(2)
  })

  test('static CTA never animates (no transform/transition) but IS gated on sheetVisible (WALK-BUG-0713 #1 + CTA-002)', () => {
    const staticBlock = pageSrc.slice(pageSrc.indexOf('STATIC BOTTOM CTA'), pageSrc.indexOf('Legal — small, bottom'))
    expect(staticBlock.length).toBeGreaterThan(0)
    expect(staticBlock).not.toMatch(/transform|transition/)
    // Marc 2026-07-13: NO trial CTA of any kind before the hook lands.
    // UX-GO-001: sheetVisible = ctaRevealed || completed (completion may
    // show the CTAs even when the listen latch never fired — seek-to-end).
    expect(staticBlock).toMatch(/\{sheetVisible && \(/)
  })

  test('promo badge copy unchanged (never raw codes)', () => {
    const d = getTrialDisplay('GVLMETA', 'valid', 14)
    expect(d.appliedBadge).toBe('Special offer applied — 14-day free trial ✓')
    expect(pageSrc).toContain('trial.appliedBadge')
  })

  test('CTA hrefs still carry promo + utm via buildCampaignSignupHref', () => {
    expect(pageSrc).toContain('buildCampaignSignupHref(searchParams)')
  })

  test('terms/privacy footer links remain', () => {
    expect(pageSrc).toContain('href="/terms"')
    expect(pageSrc).toContain('href="/privacy"')
  })
})

// ============================================================================
// WALK-BUG-0713 #1 (Marc, 2026-07-13): per-story CTA reveal + NO pre-hook CTA
// ============================================================================
describe('WALK-BUG-0713 #1: per-story CTA reveal', () => {
  test('per-story threshold wins over the 45s default', () => {
    expect(shouldRevealTrialCta({ listenedSec: 45, revealAfterSec: 100 })).toBe(false)
    expect(shouldRevealTrialCta({ listenedSec: 99.9, revealAfterSec: 100 })).toBe(false)
    expect(shouldRevealTrialCta({ listenedSec: 100, revealAfterSec: 100 })).toBe(true)
  })

  test('invalid per-story threshold falls back to 45s default', () => {
    expect(shouldRevealTrialCta({ listenedSec: 45, revealAfterSec: NaN })).toBe(true)
    expect(shouldRevealTrialCta({ listenedSec: 45, revealAfterSec: 0 })).toBe(true)
    expect(shouldRevealTrialCta({ listenedSec: 44, revealAfterSec: undefined })).toBe(false)
  })

  test('latch still wins regardless of threshold', () => {
    expect(shouldRevealTrialCta({ listenedSec: 0, alreadyRevealed: true, revealAfterSec: 100 })).toBe(true)
  })

  test('Falls Park (variant b) reveals at ~100s — hook lands at 1:36', () => {
    expect(GO_STORY_VARIANTS.b.ctaRevealSeconds).toBe(100)
  })

  test('variant a reveals at 70s — whisper-timed hook (Marc confirmed 2026-07-14); default keeps 45', () => {
    expect(GO_STORY_VARIANTS.a.ctaRevealSeconds).toBe(70)
    expect(GO_SAMPLE_STORY.ctaRevealSeconds).toBe(CTA_REVEAL_LISTEN_SEC)
  })

  test('page gates the static bottom CTA behind the reveal/completion gate (no pre-hook CTA)', () => {
    // The static footer CTA must render ONLY inside a {sheetVisible && ...}
    // block (UX-GO-001: sheetVisible = ctaRevealed || completed — the listen
    // latch is unchanged; completion additionally shows the CTAs), and the
    // page must pass the per-story threshold into the check.
    expect(pageSrc).toMatch(/\{sheetVisible && \(/)
    expect(pageSrc).toContain('const sheetVisible = ctaRevealed || completed')
    expect(pageSrc).toMatch(/revealAfterSec/)
    expect(pageSrc).not.toMatch(/Always present from arrival/)
  })
})
