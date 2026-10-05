/**
 * READY-PUBLISH-URLS-001 regression tests.
 *
 * Locks the rule: an episode is publish-ready ONLY when all three rendered-
 * production URLs exist (audio_url, cover_url, announcement_url). Guards against
 * the Alderton Inheritance gap where an approved script with no rendered audio
 * read as "Ready to Publish".
 */
import { hasRenderedProduction, missingProductionUrls } from '@/lib/publishReadiness'

describe('READY-PUBLISH-URLS-001 — hasRenderedProduction', () => {
  const full = {
    audio_url: 'https://cdn/final_mix.mp3',
    cover_url: 'https://cdn/cover.png',
    announcement_url: 'https://cdn/announcement.mp3',
  }

  it('is true only when all three URLs are present', () => {
    expect(hasRenderedProduction(full)).toBe(true)
  })

  it('is false when audio_url is missing', () => {
    expect(hasRenderedProduction({ ...full, audio_url: null })).toBe(false)
    expect(hasRenderedProduction({ ...full, audio_url: '' })).toBe(false)
    expect(hasRenderedProduction({ ...full, audio_url: '   ' })).toBe(false)
  })

  it('is false when cover_url is missing', () => {
    expect(hasRenderedProduction({ ...full, cover_url: null })).toBe(false)
  })

  it('is false when announcement_url is missing (the Alderton gap)', () => {
    expect(hasRenderedProduction({ ...full, announcement_url: null })).toBe(false)
  })

  it('is false for a script-only episode (no rendered URLs at all)', () => {
    // mirrors Alderton: approved_ready workflow_state but nothing rendered
    expect(hasRenderedProduction({})).toBe(false)
    expect(hasRenderedProduction({ audio_url: null, cover_url: null, announcement_url: null })).toBe(false)
  })

  it('honors the *_ready boolean fallbacks when URLs are not hydrated', () => {
    expect(
      hasRenderedProduction({ audio_ready: true, cover_ready: true, announcement_ready: true })
    ).toBe(true)
    expect(
      hasRenderedProduction({ audio_ready: true, cover_ready: true, announcement_ready: false })
    ).toBe(false)
  })
})

describe('READY-PUBLISH-URLS-001 — missingProductionUrls', () => {
  it('lists exactly the missing URLs', () => {
    expect(missingProductionUrls({})).toEqual(['audio_url', 'cover_url', 'announcement_url'])
    expect(
      missingProductionUrls({ audio_url: 'x', cover_url: 'y', announcement_url: null })
    ).toEqual(['announcement_url'])
    expect(
      missingProductionUrls({ audio_url: 'x', cover_url: 'y', announcement_url: 'z' })
    ).toEqual([])
  })
})
