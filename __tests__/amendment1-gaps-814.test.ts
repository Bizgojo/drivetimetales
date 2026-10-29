// __tests__/amendment1-gaps-814.test.ts — Amendment 1 Gap 8.4 + 8.1 fixes.
import { isEtTestQuery, landingRouteMatches, sanitizeEtTestId, appendEtTest } from '@/lib/marketing/adTests'

describe('Gap 8.4 — et_test session detection (browser pixel suppression)', () => {
  it('detects et_test as first, middle, or only query param', () => {
    expect(isEtTestQuery('?et_test=run-1')).toBe(true)
    expect(isEtTestQuery('?utm_source=meta&et_test=run-1')).toBe(true)
    expect(isEtTestQuery('?et_test=run-1&utm_source=meta')).toBe(true)
  })
  it('does not match lookalike params or empty search', () => {
    expect(isEtTestQuery('')).toBe(false)
    expect(isEtTestQuery('?utm_source=meta')).toBe(false)
    expect(isEtTestQuery('?my_et_test=x')).toBe(false)
    expect(isEtTestQuery('?et_testx=1')).toBe(false)
  })
})

describe('Gap 8.1 — exact landing route (not just 200)', () => {
  it('passes when final URL matches expected route exactly', () => {
    expect(
      landingRouteMatches('https://endless-tales.com/go/x', 'https://endless-tales.com/go/x')
    ).toBe(true)
  })
  it('tolerates added/stripped query params and trailing slash', () => {
    expect(
      landingRouteMatches(
        'https://endless-tales.com/go/x?utm_source=meta',
        'https://endless-tales.com/go/x'
      )
    ).toBe(true)
    expect(
      landingRouteMatches('https://endless-tales.com/go/x/', 'https://endless-tales.com/go/x')
    ).toBe(true)
  })
  it('FAILS a mistyped path on our own domain (the blind spot)', () => {
    expect(
      landingRouteMatches('https://endless-tales.com/', 'https://endless-tales.com/go/x')
    ).toBe(false)
    expect(
      landingRouteMatches('https://endless-tales.com/go/typo', 'https://endless-tales.com/go/x')
    ).toBe(false)
  })
  it('FAILS cross-origin landings and invalid URLs', () => {
    expect(
      landingRouteMatches('https://evil.example.com/go/x', 'https://endless-tales.com/go/x')
    ).toBe(false)
    expect(landingRouteMatches('not-a-url', 'https://endless-tales.com/go/x')).toBe(false)
  })
})

describe('Gap 8.4b — magic-link new-tab carry (et_test in redirect URLs)', () => {
  it('accepts strict run ids, rejects anything else', () => {
    expect(sanitizeEtTestId('adtest-123')).toBe('adtest-123')
    expect(sanitizeEtTestId('run_1')).toBe('run_1')
    expect(sanitizeEtTestId(null)).toBe(null)
    expect(sanitizeEtTestId(undefined)).toBe(null)
    expect(sanitizeEtTestId('')).toBe(null)
    expect(sanitizeEtTestId('a b')).toBe(null)
    expect(sanitizeEtTestId('x?y=1')).toBe(null)
    expect(sanitizeEtTestId('<script>')).toBe(null)
    expect(sanitizeEtTestId('x'.repeat(65))).toBe(null)
  })
  it('appends et_test to relative and absolute URLs', () => {
    expect(appendEtTest('/home', 'run-1')).toBe('/home?et_test=run-1')
    expect(appendEtTest('/home?welcome=true', 'run-1')).toBe('/home?welcome=true&et_test=run-1')
    expect(appendEtTest('https://app.example.com/auth/confirm', 'run-1')).toBe(
      'https://app.example.com/auth/confirm?et_test=run-1'
    )
  })
  it('never duplicates or echoes invalid ids', () => {
    expect(appendEtTest('/home?et_test=run-1', 'run-2')).toBe('/home?et_test=run-1')
    expect(appendEtTest('/home', 'bad id')).toBe('/home')
    expect(appendEtTest('/home', null)).toBe('/home')
  })
})
