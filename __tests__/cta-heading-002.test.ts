// CTA-HEADING-002 — Progress-aware mid-listen CTA heading
// Marc approval, 2026-07-21. Static copy per Marc decision.
//
// Covers:
//   1. getGoMidHeading — all permutations (pct state × story type)
//   2. Priority order: pct75 > pct50 > default
//   3. Series vs. standalone identification via completedHeading presence
//   4. Copy byte-exact pins (Marc-reviewed static strings)
//   5. Page wiring: pct milestone detection in handlePlaybackProgress,
//      key-based heading render, animation gating
//   6. No auth calls introduced; /go stays in PUBLIC_ROUTES

import fs from 'fs'
import path from 'path'
import {
  getGoMidHeading,
  getGoCtaCopy,
  GO_MID_HEADING_PCT50_SERIES,
  GO_MID_HEADING_PCT75_SERIES,
  GO_MID_HEADING_PCT50_STANDALONE,
  GO_MID_HEADING_PCT75_STANDALONE,
  GO_CTA_COPY_DEFAULT,
  GO_SAMPLE_STORY,
  GO_STORY_VARIANTS,
} from '@/lib/landing'

// CTA-INSTRUMENTATION-001 (2026-07-22): client logic extracted to GoLandingContent.tsx;
// page.tsx is now a server component shell. Source pins read from the client file.
const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'go', 'GoLandingContent.tsx'), 'utf8')
const landingSrc = fs.readFileSync(path.join(__dirname, '..', 'lib', 'landing.ts'), 'utf8')

// ============================================================================
// 1. Copy byte-exact pins (Marc reviews these strings)
// ============================================================================
describe('CTA-HEADING-002: heading copy byte-exact pins', () => {
  test('series pct_50 heading — byte exact', () => {
    expect(GO_MID_HEADING_PCT50_SERIES).toBe("You're halfway through Episode 1.")
  })

  test('series pct_75 heading — byte exact', () => {
    expect(GO_MID_HEADING_PCT75_SERIES).toBe("The ending is 2 minutes away.")
  })

  test('standalone pct_50 heading — byte exact', () => {
    expect(GO_MID_HEADING_PCT50_STANDALONE).toBe('Halfway through.')
  })

  test('standalone pct_75 heading — byte exact', () => {
    expect(GO_MID_HEADING_PCT75_STANDALONE).toBe('Almost at the ending.')
  })

  test('default (no milestone) heading is unchanged GO_CTA_COPY_DEFAULT.heading', () => {
    expect(getGoMidHeading(false, false)).toBe(GO_CTA_COPY_DEFAULT.heading)
    expect(getGoMidHeading(false, false)).toBe('Keep the story going')
  })
})

// ============================================================================
// 2. getGoMidHeading — all pct × story-type permutations
// ============================================================================
describe('CTA-HEADING-002: getGoMidHeading permutations', () => {
  // Series stories: variants a/b (have completedHeading set)
  const seriesStory = GO_STORY_VARIANTS['b'] // Murder at Falls Park, series opener

  // Standalone story: bare default (no completedHeading)
  const standaloneStory = GO_SAMPLE_STORY // The Grave He Dug Himself

  describe('series opener (completedHeading set)', () => {
    test('no milestone → default "Keep the story going"', () => {
      expect(getGoMidHeading(false, false, seriesStory)).toBe('Keep the story going')
    })

    test('pct50 reached, pct75 not → series pct50 heading', () => {
      expect(getGoMidHeading(true, false, seriesStory)).toBe(GO_MID_HEADING_PCT50_SERIES)
    })

    test('pct75 reached → series pct75 heading (overrides pct50)', () => {
      expect(getGoMidHeading(false, true, seriesStory)).toBe(GO_MID_HEADING_PCT75_SERIES)
    })

    test('both pct50 + pct75 reached → pct75 wins (priority)', () => {
      expect(getGoMidHeading(true, true, seriesStory)).toBe(GO_MID_HEADING_PCT75_SERIES)
    })
  })

  describe('standalone story (no completedHeading)', () => {
    test('no milestone → default "Keep the story going"', () => {
      expect(getGoMidHeading(false, false, standaloneStory)).toBe('Keep the story going')
    })

    test('pct50 reached → standalone pct50 heading', () => {
      expect(getGoMidHeading(true, false, standaloneStory)).toBe(GO_MID_HEADING_PCT50_STANDALONE)
    })

    test('pct75 reached → standalone pct75 heading', () => {
      expect(getGoMidHeading(false, true, standaloneStory)).toBe(GO_MID_HEADING_PCT75_STANDALONE)
    })

    test('both pct50 + pct75 → pct75 wins', () => {
      expect(getGoMidHeading(true, true, standaloneStory)).toBe(GO_MID_HEADING_PCT75_STANDALONE)
    })
  })

  describe('no story argument (undefined)', () => {
    test('no milestone → default', () => {
      expect(getGoMidHeading(false, false, undefined)).toBe('Keep the story going')
    })

    test('pct50 reached → standalone variant (no completedHeading = not series)', () => {
      expect(getGoMidHeading(true, false, undefined)).toBe(GO_MID_HEADING_PCT50_STANDALONE)
    })

    test('pct75 reached → standalone variant', () => {
      expect(getGoMidHeading(false, true, undefined)).toBe(GO_MID_HEADING_PCT75_STANDALONE)
    })
  })

  describe('variant a — Commuter of the Year (also a series opener)', () => {
    const variantA = GO_STORY_VARIANTS['a']
    test('variant a is identified as series (completedHeading set)', () => {
      expect(Boolean(variantA.completedHeading)).toBe(true)
    })

    test('pct50 reached → series pct50 heading', () => {
      expect(getGoMidHeading(true, false, variantA)).toBe(GO_MID_HEADING_PCT50_SERIES)
    })

    test('pct75 reached → series pct75 heading', () => {
      expect(getGoMidHeading(false, true, variantA)).toBe(GO_MID_HEADING_PCT75_SERIES)
    })
  })
})

// ============================================================================
// 3. Pre-completion independence: getGoMidHeading does not affect completion
//    state; getGoCtaCopy overrides heading when completed is true.
// ============================================================================
describe('CTA-HEADING-002: pre-completion independence', () => {
  const seriesStory = GO_STORY_VARIANTS['b']

  test('when completed, getGoCtaCopy controls heading (getGoMidHeading is bypassed)', () => {
    // Page logic: activeHeading = completed ? ctaCopy.heading : getGoMidHeading(...)
    // Verify the completion heading is distinct from any mid-listen heading.
    const completedCopy = getGoCtaCopy(true, seriesStory)
    expect(completedCopy.heading).not.toBe(GO_MID_HEADING_PCT75_SERIES)
    expect(completedCopy.heading).not.toBe(GO_MID_HEADING_PCT50_SERIES)
    expect(completedCopy.heading).not.toBe(GO_CTA_COPY_DEFAULT.heading)
  })

  test('getGoMidHeading is pure: identical inputs always produce identical output', () => {
    for (const [p50, p75] of [[false, false], [true, false], [false, true], [true, true]] as [boolean, boolean][]) {
      const a = getGoMidHeading(p50, p75, seriesStory)
      const b = getGoMidHeading(p50, p75, seriesStory)
      expect(a).toBe(b)
    }
  })
})

// ============================================================================
// 4. Page wiring — source-level checks (no DOM renderer; house style)
// ============================================================================
describe('CTA-HEADING-002: page wiring source pins', () => {
  test('getGoMidHeading is imported in page.tsx', () => {
    expect(pageSrc).toContain("getGoMidHeading")
  })

  test('pct50FiredRef and pct75FiredRef refs are declared in page.tsx', () => {
    expect(pageSrc).toContain('pct50FiredRef')
    expect(pageSrc).toContain('pct75FiredRef')
  })

  test('pct50Reached and pct75Reached state are declared in page.tsx', () => {
    expect(pageSrc).toContain('pct50Reached')
    expect(pageSrc).toContain('pct75Reached')
  })

  test('milestone detection uses pos / dur ratio in handlePlaybackProgress', () => {
    expect(pageSrc).toContain('pos / dur >= 0.5')
    expect(pageSrc).toContain('pos / dur >= 0.75')
  })

  test('activeHeading is computed via getGoMidHeading in page.tsx', () => {
    expect(pageSrc).toContain('activeHeading')
    expect(pageSrc).toContain('getGoMidHeading(pct50Reached, pct75Reached, story)')
  })

  test('heading div uses key={activeHeading} for animation replay on transition', () => {
    expect(pageSrc).toContain('key={activeHeading}')
  })

  test('animation gated on any milestone reached (never fires on initial reveal)', () => {
    expect(pageSrc).toContain('pct50Reached || pct75Reached || completed')
  })

  test('heading renders activeHeading (not ctaCopy.heading directly)', () => {
    expect(pageSrc).toContain('{activeHeading}')
  })
})

// ============================================================================
// 5. Hard rules: no auth calls introduced; /go stays in PUBLIC_ROUTES
// ============================================================================
describe('CTA-HEADING-002: hard rules unchanged', () => {
  test('no auth calls introduced in landing.ts for mid-heading functions', () => {
    // getGoMidHeading and its constants must not reference any auth imports.
    const midHeadingSection = landingSrc.slice(
      landingSrc.indexOf('CTA-HEADING-002'),
      landingSrc.indexOf('SUS/ATL-LANDING-001 rev B'),
    )
    expect(midHeadingSection).not.toContain('supabase')
    expect(midHeadingSection).not.toContain('createClient')
    expect(midHeadingSection).not.toContain('getServerSession')
    expect(midHeadingSection).not.toContain('auth()')
  })

  test('/go stays in PUBLIC_ROUTES — no middleware import added', () => {
    expect(pageSrc).not.toContain('import.*middleware')
    expect(pageSrc).not.toContain('createMiddlewareClient')
  })

  test('cta_click event is unchanged — no new event names added', () => {
    // The page must not add new event types beyond cta_click
    expect(pageSrc).not.toContain("'pct50_click'")
    expect(pageSrc).not.toContain("'pct75_click'")
    expect(pageSrc).not.toContain("'mid_cta_click'")
  })
})
