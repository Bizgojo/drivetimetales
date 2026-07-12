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
