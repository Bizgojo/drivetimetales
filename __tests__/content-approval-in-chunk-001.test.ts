import { readFileSync } from 'fs'
import { join } from 'path'

// CONTENT-APPROVAL-IN-CHUNK-001: the unfiltered GET must not put every story id
// into one .in() request (it failed with "TypeError: fetch failed" at ~585 ids).
describe('CONTENT-APPROVAL-IN-CHUNK-001', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/content-approval/route.ts'), 'utf8')
  test('story-job lookup is chunked', () => {
    expect(src).toContain(".in('story_id', storyIds.slice(i, i + IN_CHUNK))")
    expect(src).not.toContain(".in('story_id', storyIds)\n")
    expect(src).toMatch(/const IN_CHUNK = 100/)
  })
})
