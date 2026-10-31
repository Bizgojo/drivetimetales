/**
 * atl-campaigns-retry-cache-001: retry + caching for the campaigns route.
 *
 * - 429 retries with backoff and honors Retry-After; surfaces distinctly.
 * - 401/403/404 are never retried.
 * - 5xx and network errors retry with exponential backoff.
 * - TtlCache expires entries after TTL.
 * - No credential values appear in thrown/logged messages.
 */
import {
  AirtableHttpError,
  TtlCache,
  fetchWithRetry,
  statusForAirtableError,
} from '@/lib/admin/airtable-retry'

function mockResponse(status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => 'some upstream body with Bearer secret-should-never-log',
    json: async () => ({ records: [] }),
  } as unknown as Response
}

describe('fetchWithRetry', () => {
  it('returns the first successful response without sleeping', async () => {
    const sleeps: number[] = []
    const res = await fetchWithRetry('https://x', {}, 'list tbl', {
      sleep: async (ms) => { sleeps.push(ms) },
      fetchImpl: (async () => mockResponse(200)) as typeof fetch,
    })
    expect(res.ok).toBe(true)
    expect(sleeps).toEqual([])
  })

  it('retries 429 then succeeds, honoring Retry-After over backoff growth', async () => {
    const sleeps: number[] = []
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return calls === 1 ? mockResponse(429, { 'retry-after': '1' }) : mockResponse(200)
    }) as typeof fetch
    const res = await fetchWithRetry('https://x', {}, 'list tbl', {
      sleep: async (ms) => { sleeps.push(ms) },
      fetchImpl,
    })
    expect(res.ok).toBe(true)
    expect(calls).toBe(2)
    expect(sleeps).toEqual([1000])
  })

  it('retries 5xx with exponential backoff and throws after max attempts', async () => {
    const sleeps: number[] = []
    const fetchImpl = (async () => mockResponse(503)) as typeof fetch
    await expect(fetchWithRetry('https://x', {}, 'list tbl', {
      maxAttempts: 3,
      baseDelayMs: 500,
      sleep: async (ms) => { sleeps.push(ms) },
      fetchImpl,
    })).rejects.toBeInstanceOf(AirtableHttpError)
    expect(sleeps).toEqual([500, 1000])
  })

  it('retries network errors with exponential backoff', async () => {
    const sleeps: number[] = []
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls < 3) throw new Error('socket hang up')
      return mockResponse(200)
    }) as unknown as typeof fetch
    const res = await fetchWithRetry('https://x', {}, 'list tbl', {
      sleep: async (ms) => { sleeps.push(ms) },
      fetchImpl,
    })
    expect(res.ok).toBe(true)
    expect(sleeps).toEqual([500, 1000])
  })

  it.each([401, 403, 404])('never retries %i (fails fast, single call)', async (status) => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return mockResponse(status)
    }) as typeof fetch
    const error = await fetchWithRetry('https://x', {}, 'get tbl/rec', {
      sleep: async () => {},
      fetchImpl,
    }).catch((e) => e)
    expect(error).toBeInstanceOf(AirtableHttpError)
    expect((error as AirtableHttpError).status).toBe(status)
    expect(calls).toBe(1)
  })

  it('never includes upstream body or credentials in error messages', async () => {
    const fetchImpl = (async () => mockResponse(500)) as typeof fetch
    const error = await fetchWithRetry('https://x', {}, 'list tblSECRET', {
      maxAttempts: 1,
      sleep: async () => {},
      fetchImpl,
    }).catch((e) => e as Error)
    expect(error.message).not.toContain('Bearer')
    expect(error.message).not.toContain('secret-should-never-log')
  })
})

describe('statusForAirtableError', () => {
  it('maps 429 distinctly from 404/401 paths', () => {
    expect(statusForAirtableError(new AirtableHttpError(429, 't'))).toBe(429)
    expect(statusForAirtableError(new AirtableHttpError(404, 't'))).toBe(404)
    // Upstream auth failure is a gateway problem (502); the route's own
    // 401 for unauthenticated callers is unchanged.
    expect(statusForAirtableError(new AirtableHttpError(401, 't'))).toBe(502)
    expect(statusForAirtableError(new Error('boom'))).toBe(500)
  })
})

describe('TtlCache', () => {
  it('returns values within TTL and expires them after', async () => {
    const cache = new TtlCache<string>(30)
    cache.set('k', 'v')
    expect(cache.get('k')).toBe('v')
    await new Promise((r) => setTimeout(r, 50))
    expect(cache.get('k')).toBeUndefined()
  })
})
