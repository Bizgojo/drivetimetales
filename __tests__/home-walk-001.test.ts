/**
 * ORION-HOME-WALK-001 — Marc walk feedback fixes (2026-07-12)
 *
 * 1. Post-signup /home leads with a "Continue listening" hero for the /go
 *    sampled story (variants A/B map into the catalog; Grave = fast-follow).
 * 2. RecommendedForYou capped at 3.
 * 3. InstallAppBanner never obscures the bottom nav on /home.
 */

import fs from 'fs'
import path from 'path'
import {
  GO_SAMPLE_STORY,
  GO_STORY_VARIANTS,
  sampleProgressKey,
  serializeSampleProgress,
  goSampleCandidates,
  parseSampleProgressEntry,
  pickFreshestResumableSample,
} from '@/lib/landing'

const NOW = 1_800_000_000_000

function snapshot(entries: Record<string, string>) {
  return (key: string) => entries[key] ?? null
}

describe('ORION-HOME-WALK-001: catalog mapping', () => {
  test('variant A maps to The Borrowed Buick (Commuter ep1)', () => {
    expect(GO_STORY_VARIANTS.a.catalogStoryId).toBe('fe23bfd4-d6c9-4ad9-b833-37657287c0f3')
  })
  test('variant B maps to The Wrong Quote (Falls Park ep1)', () => {
    expect(GO_STORY_VARIANTS.b.catalogStoryId).toBe('09457ef0-e32f-48e2-a1bb-3311ddd68a49')
  })
  test('Grave/control has NO catalog counterpart yet (fast-follow, no dead-end hero)', () => {
    expect(GO_SAMPLE_STORY.catalogStoryId).toBeNull()
  })
  test('candidates = control + both variants', () => {
    const ids = goSampleCandidates().map(s => s.id)
    expect(ids).toEqual([GO_SAMPLE_STORY.id, 'go-variant-a', 'go-variant-b'])
  })
})

describe('ORION-HOME-WALK-001: parseSampleProgressEntry', () => {
  test('valid payload returns seconds + updatedAt', () => {
    const raw = serializeSampleProgress('go-variant-a', 87, NOW)
    expect(parseSampleProgressEntry(raw, 'go-variant-a', NOW)).toEqual({ seconds: 87, updatedAt: NOW })
  })
  test('wrong story, stale, corrupt, and empty payloads return null', () => {
    const raw = serializeSampleProgress('go-variant-a', 87, NOW)
    expect(parseSampleProgressEntry(raw, 'go-variant-b', NOW)).toBeNull()
    const stale = serializeSampleProgress('go-variant-a', 87, NOW - 31 * 24 * 60 * 60 * 1000)
    expect(parseSampleProgressEntry(stale, 'go-variant-a', NOW)).toBeNull()
    expect(parseSampleProgressEntry('{not json', 'go-variant-a', NOW)).toBeNull()
    expect(parseSampleProgressEntry(null, 'go-variant-a', NOW)).toBeNull()
    expect(parseSampleProgressEntry(JSON.stringify({ storyId: 'go-variant-a', seconds: -5, updatedAt: NOW }), 'go-variant-a', NOW)).toBeNull()
  })
})

describe('ORION-HOME-WALK-001: pickFreshestResumableSample', () => {
  test('no progress anywhere → null', () => {
    expect(pickFreshestResumableSample(snapshot({}), NOW)).toBeNull()
  })

  test('variant A progress → resumable sample with catalog id', () => {
    const entries = {
      [sampleProgressKey('go-variant-a')]: serializeSampleProgress('go-variant-a', 120, NOW - 1000),
    }
    const hit = pickFreshestResumableSample(snapshot(entries), NOW)
    expect(hit).not.toBeNull()
    expect(hit!.catalogStoryId).toBe('fe23bfd4-d6c9-4ad9-b833-37657287c0f3')
    expect(hit!.seconds).toBe(120)
    expect(hit!.title).toBe('Commuter of the Year')
  })

  test('both variants present → freshest wins', () => {
    const entries = {
      [sampleProgressKey('go-variant-a')]: serializeSampleProgress('go-variant-a', 120, NOW - 60_000),
      [sampleProgressKey('go-variant-b')]: serializeSampleProgress('go-variant-b', 45, NOW - 1_000),
    }
    const hit = pickFreshestResumableSample(snapshot(entries), NOW)
    expect(hit!.catalogStoryId).toBe('09457ef0-e32f-48e2-a1bb-3311ddd68a49')
    expect(hit!.seconds).toBe(45)
  })

  test('Grave progress alone → null (no catalog counterpart, no dead-end hero)', () => {
    const entries = {
      [sampleProgressKey(GO_SAMPLE_STORY.id)]: serializeSampleProgress(GO_SAMPLE_STORY.id, 300, NOW - 1000),
    }
    expect(pickFreshestResumableSample(snapshot(entries), NOW)).toBeNull()
  })

  test('Grave fresher than variant → variant still wins (Grave is unmapped)', () => {
    const entries = {
      [sampleProgressKey(GO_SAMPLE_STORY.id)]: serializeSampleProgress(GO_SAMPLE_STORY.id, 300, NOW - 1_000),
      [sampleProgressKey('go-variant-a')]: serializeSampleProgress('go-variant-a', 120, NOW - 60_000),
    }
    const hit = pickFreshestResumableSample(snapshot(entries), NOW)
    expect(hit!.sampleId).toBe('go-variant-a')
  })

  test('corrupt storage reads never throw', () => {
    expect(pickFreshestResumableSample(() => '{{{{', NOW)).toBeNull()
  })
})

describe('ORION-HOME-WALK-001: page wiring pins', () => {
  const homeSrc = fs.readFileSync(path.join(process.cwd(), 'app/home/page.tsx'), 'utf8')
  const heroSrc = fs.readFileSync(path.join(process.cwd(), 'components/ContinueSampleHero.tsx'), 'utf8')
  const recSrc = fs.readFileSync(path.join(process.cwd(), 'components/RecommendedForYou.tsx'), 'utf8')
  const bannerSrc = fs.readFileSync(path.join(process.cwd(), 'components/InstallAppBanner.tsx'), 'utf8')

  test('fix 1: hero is mounted FIRST in the home content flow', () => {
    expect(homeSrc).toContain('<ContinueSampleHero')
    const heroIdx = homeSrc.indexOf('<ContinueSampleHero')
    const continueIdx = homeSrc.indexOf('<ContinueListening')
    const newReleasesIdx = homeSrc.indexOf('<NewReleases')
    expect(heroIdx).toBeGreaterThan(-1)
    expect(heroIdx).toBeLessThan(continueIdx)
    expect(heroIdx).toBeLessThan(newReleasesIdx)
  })

  test('fix 1: hero deep-links the canonical player with resume seconds', () => {
    expect(heroSrc).toContain('/player/${sample.catalogStoryId}?resume=${resumeSeconds}')
  })

  test('fix 1: hero verifies the catalog story is live before rendering', () => {
    expect(heroSrc).toContain("eq('status', 'published')")
    expect(heroSrc).toContain("eq('is_hidden', false)")
  })

  test('fix 2: RecommendedForYou capped at 3 (was 5)', () => {
    expect(recSrc).toContain('all.slice(0, 3)')
    expect(recSrc).not.toContain('all.slice(0, 5)')
  })

  test('fix 3: home banner docks above the bottom nav', () => {
    expect(homeSrc).toContain('<InstallAppBanner aboveBottomNav />')
    expect(bannerSrc).toContain("aboveBottomNav ? 'calc(64px + env(safe-area-inset-bottom, 0px))' : 0")
  })
})

describe('ORION-CARD-CANON-001: fix 4 — one canonical HSC card per list', () => {
  const homeSrc2 = fs.readFileSync(path.join(process.cwd(), 'app/home/page.tsx'), 'utf8')
  const recSrc2 = fs.readFileSync(path.join(process.cwd(), 'components/RecommendedForYou.tsx'), 'utf8')
  const hscSrc = fs.readFileSync(path.join(process.cwd(), 'components/HorizontalStoryCard.tsx'), 'utf8')

  test('RecommendedForYou renders NO SeriesCard — HSC only', () => {
    expect(recSrc2).not.toContain('SeriesCard')
    expect(recSrc2).toContain('HorizontalStoryCard')
  })

  test('RecommendedForYou singles pass description (The Manifest stale-card fix)', () => {
    expect(recSrc2).toContain('description={item.story.description}')
  })

  test('home search results render NO SeriesCard — HSC only', () => {
    // SeriesEpisodeCard (player surface) is a different component and allowed.
    expect(homeSrc2).not.toMatch(/from '@\/components\/SeriesCard'/)
    expect(homeSrc2).not.toMatch(/<SeriesCard/)
  })

  test('series groups deep-link the next-up episode through HSC', () => {
    for (const src of [homeSrc2, recSrc2]) {
      expect(src).toContain('item.group.play_episode_id || item.group.episodes[0]?.id || item.group.id')
      expect(src).toContain('series_total={item.group.episode_count}')
    }
  })

  test('HSC play-pill canon intact: Play / Continue / Play Again, orange default, bottom-right', () => {
    expect(hscSrc).toContain("let playLabel = 'Play'")
    expect(hscSrc).toContain("playLabel = 'Play Again'")
    expect(hscSrc).toContain("playLabel = 'Continue'")
    expect(hscSrc).toContain("rgba(249,115,22,0.88)")
    expect(hscSrc).toMatch(/bottom: '7px', right: '7px'/)
  })
})

describe('ATL-CONSOLE-EPCOUNT-001: cold_storage excluded from series math', () => {
  const apiSrc = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/content-approval/route.ts'), 'utf8')
  const pageSrc = fs.readFileSync(path.join(process.cwd(), 'app/admin/production/approval/page.tsx'), 'utf8')

  test('API: present count + missing + blocking use ACTIVE episodes only', () => {
    expect(apiSrc).toContain("episodes.filter((episode) => episode.workflowState !== 'cold_storage')")
    expect(apiSrc).toContain('presentEpisodeCount: activeStories.length,')
    expect(apiSrc).toContain('const missing = missingEpisodes(activeStories, expected)')
    expect(apiSrc).toContain('...activeEpisodes.flatMap((episode) => episode.approvalBlockingReasons')
    // coldStorage visibility count stays.
    expect(apiSrc).toContain("coldStorage: episodes.filter((episode) => episode.workflowState === 'cold_storage').length")
  })

  test('console: review-all-to-enable gate ignores cold_storage rows (Limestone unfreeze)', () => {
    expect(pageSrc).toContain('const selectedGateStories = selectedAllStories.filter(')
    expect(pageSrc).toContain("effectiveWorkflowState(story) !== 'cold_storage'")
    expect(pageSrc).toContain('selectedReviewCompleteCount === selectedGateStories.length')
    expect(pageSrc).toContain('Review all ${selectedGateStories.length || 1} episode')
  })

  test('console: groupPresentCount excludes cold_storage', () => {
    const fn = pageSrc.slice(pageSrc.indexOf('function groupPresentCount'), pageSrc.indexOf('function isTrueSeriesGroup'))
    expect(fn).toContain("effectiveWorkflowState(story) !== 'cold_storage'")
  })
})

// ============================================================================
// WALK-BUG-0713 #5 (Marc, 2026-07-13): hero story must not repeat in the
// Continue Listening list — same title was stacking twice on /home.
// ============================================================================
describe('WALK-BUG-0713 #5: hero/list same-story dedup', () => {
  const fs = require('fs')
  const path = require('path')
  const homeSrc = fs.readFileSync(path.join(process.cwd(), 'app/home/page.tsx'), 'utf8')
  const listSrc = fs.readFileSync(path.join(process.cwd(), 'components/ContinueListening.tsx'), 'utf8')

  test('home passes the hero story id into ContinueListening as excludeStoryId', () => {
    expect(homeSrc).toMatch(/setHeroStoryId\(id\)/)
    expect(homeSrc).toMatch(/<ContinueListening excludeStoryId=\{heroStoryId\}/)
  })

  test('ContinueListening filters the excluded id and falls back to the next row (limit 2)', () => {
    expect(listSrc).toMatch(/excludeStoryId\?: string \| null/)
    expect(listSrc).toMatch(/\.limit\(2\)/)
    expect(listSrc).toMatch(/story_id !== excludeStoryId/)
    // Re-loads when the hero reports late (async live-check).
    expect(listSrc).toMatch(/\[user, excludeStoryId\]/)
    // The old single-row fetch is gone.
    expect(listSrc).not.toMatch(/\.limit\(1\)\s*\n\s*\.single\(\)/)
  })
})

// ============================================================================
// WALK-BUG-0713 #8 (Marc, 2026-07-13): ONE shared header everywhere.
// ============================================================================
describe('WALK-BUG-0713 #8: single shared header', () => {
  const fs = require('fs')
  const path = require('path')
  const glob = (d: string): string[] => fs.readdirSync(d, { recursive: true })
    .map((f: string) => path.join(d, f))
    .filter((f: string) => f.endsWith('.tsx') && !f.includes('restore'))

  test('no per-page header copies remain anywhere in app/', () => {
    for (const f of glob('app')) {
      const src = fs.readFileSync(f, 'utf8')
      expect(src).not.toMatch(/StickyHeaderFull|StickyHeaderHome|StickyHeaderGuest|StickyHeader\b|HomeHeader/)
    }
  })

  test('retired header stub files are deleted', () => {
    for (const stub of ['StickyHeaderFull', 'StickyHeaderHome', 'StickyHeaderGuest', 'StickyHeader', 'HomeHeader']) {
      expect(fs.existsSync(path.join('components', stub + '.tsx'))).toBe(false)
    }
  })

  test('AppHeader: logo goes /home signed-in, / signed-out; avatar goes /account', () => {
    const src = fs.readFileSync('components/AppHeader.tsx', 'utf8')
    expect(src).toMatch(/router\.push\(user \? '\/home' : '\/'\)/)
    expect(src).toMatch(/router\.push\('\/account'\)/)
  })

  test('#8b: Drama chip label carries no glyph', () => {
    const src = fs.readFileSync('app/library/page.tsx', 'utf8')
    expect(src).toMatch(/Drama: 'Drama',/)
  })
})
