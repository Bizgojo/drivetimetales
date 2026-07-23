// SUS/ATL-LANDING-001: /go campaign landing page.
// Covers:
//   1. buildCampaignSignupHref — promo + full utm_* set carried to /signup,
//      ?code= alias precedence, no params → plain /signup.
//   2. middleware.ts — '/go' present in PUBLIC_ROUTES (source assertion).
//   3. getTrialDisplay — valid promo copy + applied badge; invalid/missing
//      → 14-day default (GO_BASE_TRIAL_DAYS — the /go ad funnel's Stripe
//      checkout grants 14 days; Marc msg 2868), no badge.
//   4. (rev A/C) sample player — GO_SAMPLE_STORY story shape, player wired
//      into app/go/page.tsx via resolveGoStory only (source pins; jest here
//      is node-env with a ts-only transform, so .tsx cannot be imported).
//   5. (rev B/C) sample progress persistence — pure save/load/expiry/corrupt
//      logic + per-story keys (rev C: variants must not collide; the default
//      Grave story keeps the original bare key so live resume survives).

import fs from 'fs'
import path from 'path'
import { buildCampaignSignupHref, buildSignupCtaHref, UTM_PARAM_KEYS } from '@/lib/utm'
import {
  getTrialDisplay,
  GO_BASE_TRIAL_DAYS,
  GO_SAMPLE_STORY,
  SAMPLE_PROGRESS_KEY,
  SAMPLE_PROGRESS_MAX_AGE_MS,
  sampleProgressKey,
  serializeSampleProgress,
  parseSampleProgress,
  shouldPersistProgress,
} from '@/lib/landing'

const FULL_UTM = {
  utm_source: 'facebook',
  utm_medium: 'paid-social',
  utm_campaign: 'gvl-launch',
  utm_content: 'video-a',
  utm_term: 'commute',
}

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj)
}

describe('SUS/ATL-LANDING-001: buildCampaignSignupHref', () => {
  test('no params → plain /signup', () => {
    expect(buildCampaignSignupHref(new URLSearchParams())).toBe('/signup')
    expect(buildCampaignSignupHref(null)).toBe('/signup')
    expect(buildCampaignSignupHref(undefined)).toBe('/signup')
  })

  test('promo + full utm set all carried to /signup', () => {
    const href = buildCampaignSignupHref(params({ promo: 'GVLMETA', ...FULL_UTM }))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(href.startsWith('/signup?')).toBe(true)
    expect(qs.get('promo')).toBe('GVLMETA')
    for (const key of UTM_PARAM_KEYS) {
      expect(qs.get(key)).toBe(FULL_UTM[key as keyof typeof FULL_UTM])
    }
  })

  test('utm params only (no promo) → carried without promo key', () => {
    const href = buildCampaignSignupHref(params(FULL_UTM))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(qs.get('promo')).toBeNull()
    expect(qs.get('utm_source')).toBe('facebook')
    expect(qs.get('utm_term')).toBe('commute')
  })

  test('?code= works as promo alias', () => {
    const href = buildCampaignSignupHref(params({ code: 'gvlmeta' }))
    expect(href).toBe('/signup?promo=GVLMETA')
  })

  test('?promo= wins over ?code= (same precedence as app/signup/page.tsx)', () => {
    const href = buildCampaignSignupHref(params({ promo: 'GVLMETA', code: 'OTHER' }))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(qs.get('promo')).toBe('GVLMETA')
  })

  test('promo is normalized like the signup page (trim, uppercase, strip spaces/plus)', () => {
    expect(buildCampaignSignupHref(params({ promo: '  gvl meta ' }))).toBe('/signup?promo=GVLMETA')
    expect(buildCampaignSignupHref(params({ promo: 'gvl+meta' }))).toBe('/signup?promo=GVLMETA')
  })

  test('empty/whitespace promo treated as absent', () => {
    expect(buildCampaignSignupHref(params({ promo: '   ' }))).toBe('/signup')
  })

  test('utm values are URL-encoded', () => {
    const href = buildCampaignSignupHref(params({ utm_content: 'a b&c' }))
    expect(href).toBe(`/signup?utm_content=${encodeURIComponent('a b&c')}`)
  })

  test('unrelated params are NOT carried', () => {
    const href = buildCampaignSignupHref(params({ utm_source: 'fb', fbclid: 'xyz', ref: 'abc' }))
    const qs = new URLSearchParams(href.split('?')[1])
    expect(qs.get('fbclid')).toBeNull()
    expect(qs.get('ref')).toBeNull()
    expect(qs.get('utm_source')).toBe('fb')
  })

  test('buildSignupCtaHref remains backward-compatible (untouched legacy behavior)', () => {
    expect(buildSignupCtaHref(null, null)).toBe('/signup')
    expect(buildSignupCtaHref('joes-diner', 'gvlmeta')).toBe('/signup?partner=joes-diner&promo=GVLMETA')
  })
})

describe('SUS/ATL-LANDING-001: middleware PUBLIC_ROUTES', () => {
  test("'/go' is present in middleware.ts PUBLIC_ROUTES", () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8')
    const match = src.match(/const PUBLIC_ROUTES = new Set\(\[([\s\S]*?)\]\)/)
    expect(match).not.toBeNull()
    const routes = Array.from(match![1].matchAll(/'([^']+)'/g)).map(m => m[1])
    expect(routes).toContain('/go')
  })
})

describe('SUS/ATL-LANDING-001: getTrialDisplay', () => {
  test('/go base trial is 14 days (Marc msg 2868 — ad-funnel Stripe grant)', () => {
    expect(GO_BASE_TRIAL_DAYS).toBe(14)
  })

  test('valid promo with 14 days → 14-day copy + applied badge', () => {
    const d = getTrialDisplay('GVLMETA', 'valid', 14)
    expect(d.days).toBe(14)
    expect(d.ctaLabel).toBe('Start Your 14-Day Free Trial')
    // UX-GO-001 CTA-001 Option A (Marc msg 2942): honest card-required line.
    expect(d.subtext).toBe("Card required — you won't be charged before your 14-day free trial ends. Then just $7.99/month. Cancel anytime.")
    // ORION-GO-OFFER-COPY-001: raw promo codes must never appear in copy.
    expect(d.appliedBadge).toBe('Special offer applied — 14-day free trial ✓')
    expect(d.appliedBadge).not.toContain('GVLMETA')
  })

  // Marc msg 2868: the /go ad funnel's Stripe checkout grants 14 days, so
  // the fail-quiet default (no promo / invalid / validate down) is 14-day.
  test('no promo → 14-day default, no badge', () => {
    const d = getTrialDisplay(null, 'none', null)
    expect(d.days).toBe(14)
    expect(d.ctaLabel).toBe('Start Your 14-Day Free Trial')
    expect(d.appliedBadge).toBeNull()
  })

  test('invalid promo → quiet 14-day default, no badge', () => {
    const d = getTrialDisplay('BOGUS', 'invalid', null)
    expect(d.days).toBe(14)
    expect(d.ctaLabel).toBe('Start Your 14-Day Free Trial')
    expect(d.appliedBadge).toBeNull()
  })

  test('valid promo with null days → falls back to 14 (same as checkout math)', () => {
    // Mirrors lib/promo.ts promoGrantedDays: null/0/'' → 14.
    const d = getTrialDisplay('GVLMETA', 'valid', null)
    expect(d.days).toBe(14)
    expect(d.appliedBadge).toBe('Special offer applied — 14-day free trial ✓')
  })

  test('valid promo with days below base → base 14 wins (max math)', () => {
    const d = getTrialDisplay('SHORT3', 'valid', 3)
    expect(d.days).toBe(14)
    expect(d.ctaLabel).toBe('Start Your 14-Day Free Trial')
    // Still validated → badge shows even though days clamp to base.
    expect(d.appliedBadge).toBe('Special offer applied — 14-day free trial ✓')
    expect(d.appliedBadge).not.toContain('SHORT3')
  })
})

describe('SUS/ATL-LANDING-001 rev A/C: sample player', () => {
  // CTA-INSTRUMENTATION-001 (2026-07-22): client logic moved to GoLandingContent.tsx.
  const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'go', 'GoLandingContent.tsx'), 'utf8')
  const playerSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'GoSamplePlayer.tsx'), 'utf8')

  test('GO_SAMPLE_STORY const has a valid, complete story shape (rev C)', () => {
    expect(GO_SAMPLE_STORY.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(GO_SAMPLE_STORY.audioUrl).toMatch(/^https:\/\//)
    expect(GO_SAMPLE_STORY.coverUrl).toMatch(/^https:\/\//)
    expect(GO_SAMPLE_STORY.title.length).toBeGreaterThan(0)
    expect(GO_SAMPLE_STORY.genre.length).toBeGreaterThan(0)
    expect(GO_SAMPLE_STORY.hook.length).toBeGreaterThan(0)
  })

  test('/go page renders the player, wired ONLY through resolveGoStory (swappable, no hardcoded story)', () => {
    expect(pageSrc).toContain('GoSamplePlayer')
    expect(pageSrc).toContain('resolveGoStory')
    // Swappability pin: the page must NOT hardcode the story id or audio URL —
    // changing lib/landing.ts must be the only edit needed.
    expect(pageSrc).not.toContain(GO_SAMPLE_STORY.id)
    expect(pageSrc).not.toContain(GO_SAMPLE_STORY.audioUrl)
  })

  test('player is a real audio player with seek + no auth/paywall surface', () => {
    expect(playerSrc).toContain('<audio')
    expect(playerSrc).toContain('type="range"') // seek bar
    // No-account rule: neither the player nor the page may import supabase
    // or the auth context (comments may mention them; imports may not).
    for (const src of [playerSrc, pageSrc]) {
      expect(src).not.toMatch(/from\s+['"](@\/lib\/supabase|@supabase)/)
      expect(src).not.toMatch(/useAuth|AuthContext/)
    }
  })
})

describe('SUS/ATL-LANDING-001 rev B: sample progress persistence (pure logic)', () => {
  const STORY = GO_SAMPLE_STORY.id
  const NOW = 1_800_000_000_000

  test('save/load roundtrip returns the saved seconds', () => {
    const raw = serializeSampleProgress(STORY, 123.9, NOW)
    expect(parseSampleProgress(raw, STORY, NOW)).toBe(123) // floored
  })

  test('storage key is the stable documented key', () => {
    expect(SAMPLE_PROGRESS_KEY).toBe('et_go_sample_progress')
  })

  test('rev C per-story keys: default Grave story keeps the ORIGINAL bare key (live resume survives)', () => {
    expect(sampleProgressKey(GO_SAMPLE_STORY.id)).toBe('et_go_sample_progress')
  })

  test('rev C per-story keys: variant stories get suffixed keys that never collide', () => {
    expect(sampleProgressKey('go-variant-a')).toBe('et_go_sample_progress:go-variant-a')
    expect(sampleProgressKey('go-variant-b')).toBe('et_go_sample_progress:go-variant-b')
    expect(sampleProgressKey('go-variant-a')).not.toBe(sampleProgressKey('go-variant-b'))
    expect(sampleProgressKey('go-variant-a')).not.toBe(sampleProgressKey(GO_SAMPLE_STORY.id))
  })

  test('different story id → null (stale progress never resumes wrong story)', () => {
    const raw = serializeSampleProgress('other-story-id', 200, NOW)
    expect(parseSampleProgress(raw, STORY, NOW)).toBeNull()
  })

  test('expired progress → null; just-inside-window → seconds', () => {
    const raw = serializeSampleProgress(STORY, 60, NOW)
    expect(parseSampleProgress(raw, STORY, NOW + SAMPLE_PROGRESS_MAX_AGE_MS + 1)).toBeNull()
    expect(parseSampleProgress(raw, STORY, NOW + SAMPLE_PROGRESS_MAX_AGE_MS - 1)).toBe(60)
  })

  test('corrupt/hostile payloads → null, never throws', () => {
    for (const bad of [null, undefined, '', 'not json', '42', '"str"', 'null', '[]', '{}',
      JSON.stringify({ storyId: STORY, seconds: 'NaN', updatedAt: NOW }),
      JSON.stringify({ storyId: STORY, seconds: -5, updatedAt: NOW }),
      JSON.stringify({ storyId: STORY, seconds: 0, updatedAt: NOW }),
      JSON.stringify({ storyId: STORY, seconds: Infinity, updatedAt: NOW }),
      JSON.stringify({ storyId: STORY, seconds: 60 }), // missing updatedAt
    ]) {
      expect(parseSampleProgress(bad as string | null, STORY, NOW)).toBeNull()
    }
  })

  test('serialize clamps negative/fractional seconds to a safe integer', () => {
    expect(JSON.parse(serializeSampleProgress(STORY, -10, NOW)).seconds).toBe(0)
    expect(JSON.parse(serializeSampleProgress(STORY, 61.7, NOW)).seconds).toBe(61)
  })

  test('shouldPersistProgress throttles writes to ≥5s of movement', () => {
    expect(shouldPersistProgress(null, 1)).toBe(true) // first write
    expect(shouldPersistProgress(10, 12)).toBe(false) // <5s delta
    expect(shouldPersistProgress(10, 15)).toBe(true) // =5s delta
    expect(shouldPersistProgress(100, 20)).toBe(true) // backwards seek >5s
    expect(shouldPersistProgress(null, 0)).toBe(false) // nothing to save
    expect(shouldPersistProgress(null, NaN)).toBe(false)
  })
})
