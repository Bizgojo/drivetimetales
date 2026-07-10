// ATL-INSTALL-SHEET-001: detect which browser an iOS user is actually in, so
// the Add-to-Home-Screen sheet can lead with "you need Safari" for non-Safari
// browsers instead of burying that requirement in a footnote.

export type IosBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'other' | 'not-ios'

/**
 * Pure UA-sniff helper. Rules:
 * - Not iPhone/iPad/iPod → 'not-ios' (iPadOS "desktop mode" reports Macintosh
 *   and is intentionally treated as not-ios, matching the banner's existing
 *   iOS gate).
 * - CriOS → 'chrome', FxiOS → 'firefox', EdgiOS → 'edge'.
 * - Other known non-Safari shells (Opera OPiOS/OPT, DuckDuckGo, Google app
 *   GSA, Brave, Yandex) or webviews without a "Safari/" token → 'other'.
 * - Otherwise (Safari/ token, no third-party tokens) → 'safari'.
 */
export function detectIosBrowser(ua: string): IosBrowser {
  if (!/iphone|ipad|ipod/i.test(ua)) return 'not-ios'
  if (/CriOS/i.test(ua)) return 'chrome'
  if (/FxiOS/i.test(ua)) return 'firefox'
  if (/EdgiOS/i.test(ua)) return 'edge'
  if (/OPiOS|OPT\/|DuckDuckGo|GSA\/|Brave|YaBrowser/i.test(ua)) return 'other'
  if (/Safari\//i.test(ua)) return 'safari'
  // iOS webviews (WKWebView in-app browsers) typically lack the Safari/ token.
  return 'other'
}

/** Human label for the sheet headline. 'other' gets a generic phrasing. */
export function iosBrowserLabel(browser: IosBrowser): string {
  switch (browser) {
    case 'chrome': return 'Chrome'
    case 'firefox': return 'Firefox'
    case 'edge': return 'Edge'
    default: return 'this browser'
  }
}
