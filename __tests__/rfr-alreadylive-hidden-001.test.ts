import { readFileSync } from 'fs'
import { join } from 'path'

// RFR-ALREADYLIVE-HIDDEN-001: flip iff !alreadyLive.
// alreadyLive = (workflow_state==='published' || status==='published') && is_hidden===false (null-safe).
// Cases: hidden+published (EP26) flips; visible+published untouched; visible+unpublished flips.
describe('RFR-ALREADYLIVE-HIDDEN-001', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/complete-story-package/route.ts'), 'utf8')

  function alreadyLive(ws: string | null, st: string | null, hidden: boolean | null): boolean {
    // Mirror of the route's guard expression (null-safe: null !== 'published').
    return (ws === 'published' || st === 'published') && hidden === false
  }

  test('guard matches !alreadyLive spec (hidden OR neither published)', () => {
    expect(src).toMatch(/const alreadyLive = \(liveCheck\?\.workflow_state === 'published' \|\| liveCheck\?\.status === 'published'\) && liveCheck\?\.is_hidden === false/)
  })

  test('hidden+published (EP26 shape) flips', () => {
    expect(alreadyLive('published', 'draft', true)).toBe(false)
  })

  test('visible+published is untouched', () => {
    expect(alreadyLive('published', 'published', false)).toBe(true)
    expect(alreadyLive(null, 'published', false)).toBe(true)
  })

  test('visible+unpublished flips', () => {
    expect(alreadyLive('draft', 'draft', false)).toBe(false)
    expect(alreadyLive(null, null, false)).toBe(false)
  })

  test('the flip write carries no row-level published/hidden filter', () => {
    const i = src.indexOf('single decision point')
    const block = src.slice(i, i + 1200)
    expect(block).toMatch(/\.update\(\{ status: 'audio_ready', is_hidden: true, published_on: null \}\)\s*\n\s*\.eq\('id', storyId\)\s*\n(?!\s*\.or\(|\s*\.eq\('is_hidden')/)
  })

  test('PACKAGE-NO-UNPUBLISH-001 guard still present', () => {
    expect(src).toContain('PACKAGE-NO-UNPUBLISH-001')
    expect(src).toMatch(/if \(alreadyLive\)/)
  })
})
