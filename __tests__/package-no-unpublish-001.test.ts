import { readFileSync } from 'fs'
import { join } from 'path'

describe('PACKAGE-NO-UNPUBLISH-001', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/complete-story-package/route.ts'), 'utf8')
  test('the review-ready downgrade is skipped for stories already published', () => {
    const i = src.indexOf('PACKAGE-NO-UNPUBLISH-001')
    expect(i).toBeGreaterThan(0)
    const block = src.slice(i, i + 2500)
    expect(block).toMatch(/workflow_state === 'published'/)
    expect(block).toMatch(/if \(alreadyLive\)/)
  })
  test('the downgrade write itself refuses published rows (race-safe)', () => {
    expect(src).toMatch(/\.update\(\{ status: 'audio_ready', is_hidden: true, published_on: null \}\)\s*\n\s*\.eq\('id', storyId\)\s*\n\s*\.or\('workflow_state\.is\.null,workflow_state\.neq\.published'\)/)
    expect(src).not.toMatch(/await updateStory\(storyId, \{\s*status: 'audio_ready'/)
  })
})
