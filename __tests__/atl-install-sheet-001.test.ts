// ATL-INSTALL-SHEET-001: iOS browser detection for the Add-to-Home-Screen sheet.
import { detectIosBrowser, iosBrowserLabel } from '@/lib/iosBrowser'

const IOS_BASE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'

describe('detectIosBrowser', () => {
  it('detects real Safari on iPhone', () => {
    expect(detectIosBrowser(`${IOS_BASE} Version/17.5 Mobile/15E148 Safari/604.1`)).toBe('safari')
  })

  it('detects real Safari on iPad', () => {
    expect(detectIosBrowser(
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    )).toBe('safari')
  })

  it('detects Chrome on iOS (CriOS)', () => {
    expect(detectIosBrowser(`${IOS_BASE} CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1`)).toBe('chrome')
  })

  it('detects Firefox on iOS (FxiOS)', () => {
    expect(detectIosBrowser(`${IOS_BASE} FxiOS/126.0 Mobile/15E148 Safari/605.1.15`)).toBe('firefox')
  })

  it('detects Edge on iOS (EdgiOS)', () => {
    expect(detectIosBrowser(`${IOS_BASE} Version/17.0 EdgiOS/124.0.2478.89 Mobile/15E148 Safari/604.1`)).toBe('edge')
  })

  it('classifies Opera on iOS (OPiOS/OPT) as other', () => {
    expect(detectIosBrowser(`${IOS_BASE} Version/17.5 Mobile/15E148 Safari/604.1 OPT/5.3.1`)).toBe('other')
  })

  it('classifies DuckDuckGo on iOS as other', () => {
    expect(detectIosBrowser(`${IOS_BASE} DuckDuckGo/7 Mobile/15E148 Safari/605.1.15`)).toBe('other')
  })

  it('classifies Google app (GSA) as other', () => {
    expect(detectIosBrowser(`${IOS_BASE} GSA/320.0.639621219 Mobile/15E148 Safari/604.1`)).toBe('other')
  })

  it('classifies iOS in-app webview (no Safari token) as other', () => {
    expect(detectIosBrowser(`${IOS_BASE} Mobile/15E148`)).toBe('other')
  })

  it('returns not-ios for Android Chrome', () => {
    expect(detectIosBrowser(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
    )).toBe('not-ios')
  })

  it('returns not-ios for desktop Safari on Mac (also covers iPadOS desktop-mode UA)', () => {
    expect(detectIosBrowser(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    )).toBe('not-ios')
  })

  it('returns not-ios for empty UA', () => {
    expect(detectIosBrowser('')).toBe('not-ios')
  })
})

describe('iosBrowserLabel', () => {
  it('names known browsers', () => {
    expect(iosBrowserLabel('chrome')).toBe('Chrome')
    expect(iosBrowserLabel('firefox')).toBe('Firefox')
    expect(iosBrowserLabel('edge')).toBe('Edge')
  })
  it('uses a generic label otherwise', () => {
    expect(iosBrowserLabel('other')).toBe('this browser')
  })
})
