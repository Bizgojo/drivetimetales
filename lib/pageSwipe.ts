/**
 * PAGE-SWIPE-001 (Marc, Nov 10, 2026; canon item 135)
 *
 * Side swipe moves between the three main pages only: Library, Home, Account
 * (the same left-to-right order as the header: Library button, logo, Account
 * button). No swipe on the player or any other page. No wrap-around.
 */

export const SWIPE_PAGES = ['/library', '/home', '/account'] as const
export type SwipePage = (typeof SWIPE_PAGES)[number]

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
  const index = SWIPE_PAGES.indexOf(pathname)
  // Finger moves left -> the page to the right comes in (like turning a page).
  const nextIndex = dx < 0 ? index + 1 : index - 1
  if (nextIndex < 0 || nextIndex >= SWIPE_PAGES.length) return null
  return SWIPE_PAGES[nextIndex]
}
