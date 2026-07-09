/**
 * lib/installReoffer.ts — RETENTION-PATH-001
 *
 * After each COMPLETED story playback (the fulfillment moment) we re-offer
 * the home-screen install banner, even if the user previously dismissed it —
 * unless the app is already installed (standalone display mode).
 *
 * Non-nagging contract:
 *  - CanonicalPlayer fires requestInstallReoffer() at most once per story
 *    mount (guarded by a ref there).
 *  - InstallAppBanner consumes the flag when it shows, so one completion
 *    grants at most one banner re-appearance.
 */

export const INSTALL_REOFFER_KEY = 'et_install_reoffer'
export const INSTALL_REOFFER_EVENT = 'et:install-reoffer'

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    ('standalone' in window.navigator && Boolean((window.navigator as any).standalone)) ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/** Called by the player when a story completes. Safe no-op if installed. */
export function requestInstallReoffer(): void {
  if (typeof window === 'undefined') return
  if (isStandaloneDisplay()) return
  try {
    localStorage.setItem(INSTALL_REOFFER_KEY, String(Date.now()))
  } catch (_) { /* storage unavailable — skip silently */ }
  try {
    window.dispatchEvent(new Event(INSTALL_REOFFER_EVENT))
  } catch (_) {}
}

/** Returns true (and clears the flag) if a re-offer is pending. */
export function consumeInstallReoffer(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (!localStorage.getItem(INSTALL_REOFFER_KEY)) return false
    localStorage.removeItem(INSTALL_REOFFER_KEY)
    return true
  } catch (_) {
    return false
  }
}
