import { readFileSync } from 'fs'
import { join } from 'path'

// STORY-END-LIBRARY-001 (Marc, Nov 10, 2026): no Play Again when the story is
// over. Playlist: go on to the next story. Not a playlist: end and go to the
// Library (after the review screen when it is due — decision 95).
const src = readFileSync(join(__dirname, '..', 'components/player/CanonicalPlayer.tsx'), 'utf8')
const body = (name: string) => {
  const start = src.indexOf(`const ${name} = `)
  expect(start).toBeGreaterThan(-1)
  return src.slice(start, start + 2500)
}

describe('STORY-END-LIBRARY-001', () => {
  it('waits for the review screen, then goes to the Library', () => {
    const f = body('finishStoryAndLeave')
    expect(f).toMatch(/await maybeShowCompletionReviewPrompt\(\)/)
    expect(f).toMatch(/if \(reviewShown\) return\s*\n\s*returnToSource\('\/library'\)/)
  })

  it('the review prompt is shared, so the exit cannot race it', () => {
    expect(body('maybeShowCompletionReviewPrompt')).toMatch(/reviewPromptPromiseRef\.current = showCompletionReviewPromptOnce\(\)/)
  })

  it('standalone end, series end and playlist end all leave instead of showing the end card', () => {
    const start = src.indexOf('const maybeAutoAdvanceFromNaturalEnd')
    const adv = src.slice(start, src.indexOf('mountedRef.current = true', start))
    expect((adv.match(/await finishStoryAndLeave\(\)/g) || []).length).toBe(3)
    expect(adv).not.toMatch(/setCatalogExhausted\(true\)/)
  })

  it('the playlist still advances to the next story by itself', () => {
    expect(src).toMatch(/if \(next\?\.id\) \{[\s\S]{0,1200}onAdvanceInPlace\(next\.id\)/)
  })
})
