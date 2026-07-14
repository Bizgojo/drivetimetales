/**
 * ORION-SW-RANGE-001 (Marc walk bug 3, 2026-07-14): the SW audio handler was
 * range-blind — cache.match ignores Range headers, so mid-stream range
 * requests received the FULL cached 200 body (reproducible fixed-position
 * stall in Chrome), and response.ok admitted 206 partials to cache.put,
 * which the Cache API rejects (streaming never populated the cache).
 * Pins the v8 range-aware serving contract in public/sw.js.
 */
import fs from 'fs'
import path from 'path'

const sw = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8')

describe('ORION-SW-RANGE-001: range-aware audio serving', () => {
  test('audio fetch routes through the dedicated range-aware handler', () => {
    expect(sw).toMatch(/e\.respondWith\(serveAudio\(e\.request\)\)/)
  })

  test('ranged requests get a synthesized 206 slice with correct Content-Range', () => {
    expect(sw).toMatch(/bytes=\(\\d\+\)-\(\\d\+\)\?/)
    expect(sw).toMatch(/status: 206/)
    expect(sw).toMatch(/'Content-Range': `bytes \$\{start\}-\$\{end\}\/\$\{total\}`/)
    expect(sw).toMatch(/'Accept-Ranges': 'bytes'/)
  })

  test('out-of-bounds ranges return 416 with bytes */total', () => {
    expect(sw).toMatch(/status: 416/)
    expect(sw).toMatch(/'Content-Range': `bytes \*\/\$\{total\}`/)
  })

  test('only full status-200 responses are ever cached (206 partials excluded, put awaited+caught)', () => {
    expect(sw).toMatch(/if \(response\.status === 200\) \{\s*\n\s*try \{ await cache\.put\(request\.url, response\.clone\(\)\) \} catch \(_\) \{\}/)
    expect(sw).toMatch(/if \(r\.status === 200\) return cache\.put\(url, r\)/)
    // the old bug: naked response.ok gating a cache.put in the AUDIO path
    // (the _next/static shell path may keep response.ok — static assets are
    // never range-requested; scope the assertion to serveAudio's body)
    const serveAudioBody = sw.slice(sw.indexOf('async function serveAudio'), sw.indexOf('// ── Message handler'))
    expect(serveAudioBody.length).toBeGreaterThan(100)
    expect(serveAudioBody).not.toMatch(/response\.ok/)
  })

  test('uncached ranged requests pass through to the network untouched', () => {
    expect(sw).toMatch(/return await fetch\(request\)/)
  })

  test('SW version bumped to v8 with the range fix documented', () => {
    expect(sw).toMatch(/Service Worker v8/)
    expect(sw).toMatch(/ORION-SW-RANGE-001/)
  })
})
