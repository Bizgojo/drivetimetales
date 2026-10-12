/**
 * ATLAS-RUNNEXT-ORIGIN-002 (2026-10-11, Class A — infra/stale-build):
 *
 * Post-PR-#333 Extraction series_voice_preflight failures still carried the
 * pre-#333 error shape (no fetchErrorCause / transient / attempts), i.e.
 * run-next executed a stale backend build instead of the new
 * fetchWithConnectionRetry path.
 *
 * Runtime chain (verified 2026-10-11):
 *   cron → production-runner → POST {baseUrl}/run-next → run-next self-fetch
 *   `{new URL(req.url).origin}/api/admin/generate-voices`
 * DNS + headers: app.endless-tales.com → AWS EC2 (Caddy front, NOT Vercel);
 * drivetimetales.vercel.app → Vercel, DIFFERENT build (different HTML bytes
 * + page chunks). The EC2 runner has no VERCEL_ENV, so baseUrl() skipped the
 * canonical rule and fell back to the vercel.app deployment URL — a
 * separately-versioned backend. The unset-env fallback is now canonical, so
 * every production-context invocation targets the same current-production
 * backend.
 *
 * No DB writes, no network. Pure unit + source-shape assertions.
 */

import fs from 'fs'
import path from 'path'
import {
  resolveRunnerBaseUrl,
  RUNNER_CANONICAL_HOST,
  alternateBaseUrl,
} from '@/lib/pipeline-runner/runner'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

const OLD_FALLBACK = 'https://drivetimetales.vercel.app'

describe('ATLAS-RUNNEXT-ORIGIN-002: runner host resolution', () => {
  const savedVercelEnv = process.env.VERCEL_ENV
  const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL

  afterEach(() => {
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = savedVercelEnv
    if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl
  })

  test('canonical constant is the production domain', () => {
    expect(RUNNER_CANONICAL_HOST).toBe('https://app.endless-tales.com')
  })

  test('Vercel production → canonical (unchanged)', () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(resolveRunnerBaseUrl()).toBe('https://app.endless-tales.com')
  })

  test('EC2-like env (no VERCEL_ENV, no NEXT_PUBLIC_APP_URL) → canonical, NOT the vercel.app deployment', () => {
    delete process.env.VERCEL_ENV
    delete process.env.NEXT_PUBLIC_APP_URL
    const host = resolveRunnerBaseUrl()
    expect(host).toBe('https://app.endless-tales.com')
    expect(host).not.toBe(OLD_FALLBACK)
  })

  test('explicit NEXT_PUBLIC_APP_URL override still respected (local/preview)', () => {
    delete process.env.VERCEL_ENV
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000/'
    expect(resolveRunnerBaseUrl()).toBe('http://localhost:3000')
    process.env.NEXT_PUBLIC_APP_URL = 'https://preview-xyz.vercel.app///'
    expect(resolveRunnerBaseUrl()).toBe('https://preview-xyz.vercel.app')
  })

  test('Vercel production ignores the override (canonical always tracks prod)', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = OLD_FALLBACK
    expect(resolveRunnerBaseUrl()).toBe('https://app.endless-tales.com')
  })

  test('runner source no longer falls back to the vercel.app deployment URL', () => {
    const src = read('lib/pipeline-runner/runner.ts')
    // The only remaining vercel.app references must be the deliberate
    // one-shot alternate-host retry, never the default host selection.
    expect(src).toContain('RUNNER_CANONICAL_HOST')
    const hits = src.split('drivetimetales.vercel.app').length - 1
    expect(hits).toBe(1) // exactly the fallback const inside alternateBaseUrl
  })

  test('alternate-host retry still targets the two production hosts (unchanged)', () => {
    expect(alternateBaseUrl('https://app.endless-tales.com')).toBe(OLD_FALLBACK)
    expect(alternateBaseUrl(OLD_FALLBACK)).toBe('https://app.endless-tales.com')
  })
})

describe('ATLAS-RUNNEXT-ORIGIN-002: new error-shape evidence in run-next', () => {
  const routeSrc = () => read('app/api/admin/production-jobs/run-next/route.ts')

  test('preflight request uses the connection-retry path', () => {
    const src = routeSrc()
    expect(src).toContain('fetchWithConnectionRetry')
    expect(src).toContain('serializeSelfFetchCause')
    expect(src).toContain('classifySelfFetchTransportError')
  })

  test('transport report persists the full cause chain + attempt evidence', () => {
    const src = routeSrc()
    expect(src).toContain('fetchErrorCause')
    expect(src).toContain('attempts')
  })

  test('series preflight failure write propagates the report transient tag', () => {
    const src = routeSrc()
    // Both the series path and the standalone path spread the report-level
    // transient tag into error_json so dispatch backs off (count must be 2).
    expect((src.match(/ATLAS-SERIES-PREFLIGHT-SELFFETCH-001/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(src).toContain("(result.report as any)?.transient === true")
  })

  test('origin is derived from the inbound request (co-located self-fetch)', () => {
    const src = routeSrc()
    expect(src).toContain('new URL(req.url).origin')
    // run-next must NOT pin its self-fetch to a hardcoded deployment host —
    // host selection belongs to the runner (resolveRunnerBaseUrl).
    expect(src).not.toContain('https://drivetimetales.vercel.app')
  })

  test('self-fetch helper module exposes the retry + classifier surface', () => {
    const src = read('lib/preflightSelfFetch.ts')
    expect(src).toContain('export function serializeSelfFetchCause')
    expect(src).toContain('export function classifySelfFetchTransportError')
    expect(src).toContain('export async function fetchWithConnectionRetry')
  })
})
