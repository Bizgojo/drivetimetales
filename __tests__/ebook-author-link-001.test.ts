import { readFileSync } from 'fs'
import { join } from 'path'

// EBOOK-AUTHOR-LINK-001 (Marc, Nov 11 2026): in the ebook, title first, then the
// author with a small button next to the name that opens About the Author.
const src = readFileSync(join(__dirname, '..', 'components/player/CanonicalPlayer.tsx'), 'utf8')

describe('EBOOK-AUTHOR-LINK-001', () => {
  it('title comes first, then the author line with the info button', () => {
    const title = src.indexOf('>{proseBookTitle}</h1>')
    const author = src.indexOf('data-testid="ebook-author-line"')
    const button = src.indexOf('data-testid="ebook-author-info"')
    expect(title).toBeGreaterThan(0)
    expect(author).toBeGreaterThan(title)
    expect(button).toBeGreaterThan(author)
  })
  it('the button opens About the Author, saves the page, and has a 44px tap target and a label', () => {
    expect(src).toMatch(/aria-label=\{`About the author, \$\{story\.author\}`\}/)
    expect(src).toMatch(/flushCurrentReadingProgress\(\) \} catch \{\} ; setAuthorReturnsToProse\(true\); setActiveModal\('author'\)/)
    expect(src).toMatch(/data-testid="ebook-author-info"[\s\S]{0,400}width: 44, height: 44/)
  })
  it('closing About the Author returns to the book', () => {
    expect(src).toMatch(/if \(activeModal === 'author' && authorReturnsToProse\) \{ setAuthorReturnsToProse\(false\); setActiveModal\('prose'\); return \}/)
    expect(src).toMatch(/aria-label="Close" onClick=\{closeInfoModal\}/)
  })
})
