/**
 * APP-UPDATE-001 (Marc 2026-11-01): subscribers must get a new release without
 * closing the app or reinstalling it. An open app compares its own build
 * version with the server's:
 *   - on open / return to the app, nothing playing → reload to the new version
 *   - a story is playing, or this is an admin page → show "Update" banner
 *   - never reload twice for the same server version (no loops)
 */
export const UPDATE_CHECK_EVERY_MS = 30 * 60 * 1000

export type UpdateDecision = 'none' | 'reload' | 'banner'

export function decideUpdate(input: {
  current: string
  server: string | null | undefined
  playing: boolean
  trigger: 'open' | 'return' | 'timer'
  adminPage: boolean
  alreadyReloadedFor: string | null
}): UpdateDecision {
  const server = String(input.server || '').trim()
  const current = String(input.current || '').trim()
  if (!server || !current || server === current) return 'none'
  if (input.alreadyReloadedFor === server) return 'banner'
  if (input.playing || input.adminPage || input.trigger === 'timer') return 'banner'
  return 'reload'
}
