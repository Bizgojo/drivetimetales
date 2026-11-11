/**
 * PAGE-SWIPE-001 (Marc, Nov 10, 2026; canon item 135), changed by
 * PAGE-SWIPE-002 (Marc, Nov 11, 2026): side swipe works on the three main
 * pages only — Home, Library, Account. No swipe on the player or any other page.
 *
 * Marc's exact map ("left to right" = the finger moves toward the right):
 *   Home:    left to right → nothing;   right to left → Library   (PAGE-SWIPE-003, Marc Nov 11 after testing)
 *   Library: left to right → Home;      right to left → Account
 *   Account: left to right → Library;   right to left → nothing
 */

export const SWIPE_PAGES = ['/home', '/library', '/account'] as const
export type SwipePage = (typeof SWIPE_PAGES)[number]

/** Where each page goes for a left-to-right and a right-to-left swipe (null = nothing). */
export const SWIPE_MAP: Record<SwipePage, { leftToRight: SwipePage | null; rightToLeft: SwipePage | null }> = {
  '/home': { leftToRight: null, rightToLeft: '/library' },
  '/library': { leftToRight: '/home', rightToLeft: '/account' },
  '/account': { leftToRight: '/library', rightToLeft: null },
}

/** Finger must travel at least this share of the screen width. */
export const SWIPE_MIN_SHARE = 0.25
/** Sideways travel must be at least this many times the up/down travel. */
export const SWIPE_DIRECTION_RATIO = 2
/** Swipes that start this close to either screen edge are ignored (iPhone back gesture). */
export const SWIPE_EDGE_PX = 24
/** A slow drag is not a swipe. */
export const SWIPE_MAX_MS = 800

export function isSwipePage(pathname: string | null | undefined): pathname is SwipePage {
  return !!pathname && (SWIPE_PAGES as readonly string[]).includes(pathname)
}

export type SwipeInput = {
  pathname: string | null | undefined
  startX: number
  startY: number
  endX: number
  endY: number
  durationMs: number
  screenWidth: number
}

/** Returns the page to go to, or null when the gesture is not a page swipe. */
export function swipeTarget(input: SwipeInput): SwipePage | null {
  const { pathname, startX, startY, endX, endY, durationMs, screenWidth } = input
  if (!isSwipePage(pathname)) return null
  if (!(screenWidth > 0)) return null
  if (startX < SWIPE_EDGE_PX || startX > screenWidth - SWIPE_EDGE_PX) return null
  if (durationMs > SWIPE_MAX_MS) return null
  const dx = endX - startX
  const dy = endY - startY
  if (Math.abs(dx) < screenWidth * SWIPE_MIN_SHARE) return null
  if (Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return null
  const move = SWIPE_MAP[pathname]
  return dx > 0 ? move.leftToRight : move.rightToLeft
}
