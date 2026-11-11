import { readFileSync } from 'fs'
import { join } from 'path'
import { swipeTarget, isSwipePage, SWIPE_PAGES } from '@/lib/pageSwipe'

// PAGE-SWIPE-001 (Marc, Nov 10, 2026; canon item 135)
const W = 400
const swipe = (pathname: string, dx: number, dy = 0, ms = 300, startX = 200) =>
  swipeTarget({ pathname, startX, startY: 300, endX: startX + dx, endY: 300 + dy, durationMs: ms, screenWidth: W })

describe('PAGE-SWIPE-001', () => {
  it('order is Library, Home, Account', () => {
    expect([...SWIPE_PAGES]).toEqual(['/library', '/home', '/account'])
  })

  it('swiping left goes right along the order, swiping right goes back', () => {
    expect(swipe('/home', -150)).toBe('/account')
    expect(swipe('/home', 150)).toBe('/library')
    expect(swipe('/library', -150)).toBe('/home')
    expect(swipe('/account', 150)).toBe('/home')
  })

  it('no wrap-around at either end', () => {
    expect(swipe('/library', 150)).toBeNull()
    expect(swipe('/account', -150)).toBeNull()
  })

  it('never on the player or any other page', () => {
    for (const p of ['/player/abc', '/playlist', '/account/settings', '/series/x', '/subscribe', '/', null]) {
      expect(isSwipePage(p as any)).toBe(false)
      expect(swipe(p as any, -150)).toBeNull()
    }
  })

  it('short, slanted, slow or edge-started swipes do nothing', () => {
    expect(swipe('/home', -60)).toBeNull()             // under a quarter of the screen
    expect(swipe('/home', -150, 100)).toBeNull()       // too much up/down
    expect(swipe('/home', -150, 0, 1200)).toBeNull()   // slow drag
    expect(swipe('/home', 150, 0, 300, 10)).toBeNull() // starts at the left edge (iPhone back)
    expect(swipe('/home', -150, 0, 300, 395)).toBeNull() // starts at the right edge
  })

  it('is mounted in the app shell, and skips side-scrolling rows and fields', () => {
    const shell = readFileSync(join(__dirname, '..', 'components/AppShell.tsx'), 'utf8')
    expect(shell).toMatch(/<PageSwipeNav \/>/)
    const comp = readFileSync(join(__dirname, '..', 'components/PageSwipeNav.tsx'), 'utf8')
    expect(comp).toMatch(/overflowX === 'auto' \|\| style\.overflowX === 'scroll'/)
    expect(comp).toMatch(/closest\('main'\)/)
    expect(comp).toMatch(/passive: true/)
    expect(comp).toMatch(/querySelector\('\[aria-modal="true"\]'\)\) return/)
  })
})
