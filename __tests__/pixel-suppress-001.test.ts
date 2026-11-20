// __tests__/pixel-suppress-001.test.ts — PIXEL-SUPPRESS-001
//
// Marc, 2026-11-20: "when et_test is in the URL or the session, skip PageView
// and all trackClientEvent calls. Ad links never carry et_test, so there's no
// risk to real traffic."
//
// Pins three things that must stay true together:
//  1. No path to the Meta pixel exists for a test session — including the
//     <noscript> image, which leaked a PageView for JS-enabled test visits.
//  2. Every named event goes through trackClientEvent, which suppresses test
//     sessions centrally, so no call site can forget the guard.
//  3. Real visitors are unaffected: the PageView path still fires.

import * as fs from 'fs'
import * as path from 'path'
import { isTestSessionClient } from '@/lib/tracking/client'

const ROOT = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

describe('PIXEL-SUPPRESS-001 — no PageView reaches Meta for a test session', () => {
  it('MetaPixel has no <noscript> PageView fallback', () => {
    const src = read('components/MetaPixel.tsx')
    // The noscript img was a second, unguarded path to the pixel.
    // Strip comments first so the explanatory note doesn't trip the check.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/<noscript>/)
    expect(code).not.toContain('noscript=1')
  })

  it('MetaPixel guards both fbevents.js and PageView behind __etTestSession', () => {
    const src = read('components/MetaPixel.tsx')
    expect(src).toContain('if (!window.__etTestSession) {')
    // The init + PageView must live INSIDE that guard block.
    const guardAt = src.indexOf('if (!window.__etTestSession) {')
    const pageViewAt = src.indexOf("fbq('track', 'PageView')")
    expect(guardAt).toBeGreaterThan(-1)
    expect(pageViewAt).toBeGreaterThan(guardAt)
  })

  it('MetaPixel still sets __etTestSession from the et_test query param', () => {
    const src = read('components/MetaPixel.tsx')
    expect(src).toMatch(/et_test=/)
    expect(src).toContain('window.__etTestSession')
  })

  it('TikTokPixel keeps the same guard shape (parity, no noscript leak)', () => {
    const src = read('components/TikTokPixel.tsx')
    expect(src).toContain('if (!window.__etTestSession) {')
    expect(src).not.toContain('noscript=1')
  })
})

describe('PIXEL-SUPPRESS-001 — named events are centrally suppressed', () => {
  it('trackClientEvent returns early for test sessions', () => {
    const src = read('lib/tracking/client.ts')
    const fnAt = src.indexOf('export function trackClientEvent(')
    expect(fnAt).toBeGreaterThan(-1)
    const body = src.slice(fnAt)
    const guardAt = body.indexOf('if (isTestSessionClient()) return')
    const fbqAt = body.indexOf("window.fbq?.('track'")
    expect(guardAt).toBeGreaterThan(-1)
    // Guard must come BEFORE any pixel call, or events leak.
    expect(fbqAt).toBeGreaterThan(guardAt)
  })

  it('every pixel call site routes through trackClientEvent (no raw fbq)', () => {
    // Raw window.fbq(...) outside the two pixel components would bypass the
    // central guard. The components own the base PageView; everything else
    // must use trackClientEvent.
    const files = [
      'app/go/GoLandingContent.tsx',
      'app/go/GoLandingPageClient.tsx',
      'app/signup/page.tsx',
      'app/subscribe/page.tsx',
      'app/home/page.tsx',
      'lib/analytics.ts',
      'lib/goListen.ts',
    ]
    for (const f of files) {
      const src = read(f)
      expect(src).not.toMatch(/window\.fbq\?\.\('track'/)
      expect(src).not.toMatch(/window\.fbq\('track'/)
    }
  })

  it('goListen pixels go through the injectable sendPixel (default trackClientEvent)', () => {
    const src = read('lib/goListen.ts')
    expect(src).toContain('const sendPixel = init.sendPixel ?? trackClientEvent')
  })
})

describe('isTestSessionClient — detection sources', () => {
  const g = globalThis as any
  const savedWindow = g.window
  const savedDocument = g.document

  afterEach(() => {
    g.window = savedWindow
    g.document = savedDocument
  })

  function install(win: any, doc: any = { cookie: '' }) {
    g.window = win
    g.document = doc
  }

  it('true when et_test is in the URL', () => {
    install({
      location: { search: '?v=miami&et_test=orioncheck-20261120' },
      sessionStorage: { getItem: () => null },
      localStorage: { getItem: () => null },
    })
    expect(isTestSessionClient()).toBe(true)
  })

  it('true when et_test is carried in sessionStorage (later pages, same tab)', () => {
    install({
      location: { search: '?v=miami' },
      sessionStorage: { getItem: (k: string) => (k === 'et_test' ? '1' : null) },
      localStorage: { getItem: () => null },
    })
    expect(isTestSessionClient()).toBe(true)
  })

  it('true when __etTestSession flag is set', () => {
    install({
      __etTestSession: true,
      location: { search: '' },
      sessionStorage: { getItem: () => null },
      localStorage: { getItem: () => null },
    })
    expect(isTestSessionClient()).toBe(true)
  })

  it('false for a genuine ad visit (no et_test anywhere)', () => {
    install({
      location: { search: '?v=miami&utm_source=meta&utm_campaign=ww-miami' },
      sessionStorage: { getItem: () => null },
      localStorage: { getItem: () => null },
    })
    expect(isTestSessionClient()).toBe(false)
  })

  it('does not false-positive on a param merely ending in et_test', () => {
    // e.g. ?not_et_test=1 must NOT be treated as a test session.
    install({
      location: { search: '?not_et_test=1' },
      sessionStorage: { getItem: () => null },
      localStorage: { getItem: () => null },
    })
    expect(isTestSessionClient()).toBe(false)
  })
})
