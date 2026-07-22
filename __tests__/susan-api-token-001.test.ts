/**
 * __tests__/susan-api-token-001.test.ts
 *
 * Tests for the Susan-scoped marketing API proxy endpoints.
 * feat/susan-api-token-001 — read-only Meta + TikTok insights for Susan agent.
 *
 * These tests run entirely in Node (no network). They mock fetch and env vars.
 */

import { NextRequest } from 'next/server'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TOKEN = 'test-susan-token-abc123'
const OTHER_TOKEN = 'wrong-token-xyz'

function makeReq(
  path: string,
  params: Record<string, string> = {},
  tokenHeader?: string
): NextRequest {
  const url = new URL(`http://localhost:3000${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const headers: Record<string, string> = {}
  if (tokenHeader !== undefined) headers['x-susan-api-key'] = tokenHeader
  return new NextRequest(url.toString(), { headers })
}

function makeReqBearer(
  path: string,
  params: Record<string, string> = {},
  bearer?: string
): NextRequest {
  const url = new URL(`http://localhost:3000${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const headers: Record<string, string> = {}
  if (bearer !== undefined) headers['authorization'] = `Bearer ${bearer}`
  return new NextRequest(url.toString(), { headers })
}

// ─── Meta Insights ─────────────────────────────────────────────────────────────

describe('GET /api/marketing/meta-insights', () => {
  let GET: (req: NextRequest) => Promise<Response>

  beforeEach(() => {
    jest.resetModules()
    jest.resetAllMocks()
  })

  describe('authorization', () => {
    beforeEach(() => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.META_ACCESS_TOKEN = 'fake-meta-token'
      process.env.META_AD_ACCOUNT_ID = 'act_123456'
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ;({ GET } = require('../app/api/marketing/meta-insights/route'))
    })

    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.META_ACCESS_TOKEN
      delete process.env.META_AD_ACCOUNT_ID
    })

    test('returns 401 when no token provided', async () => {
      const req = makeReq('/api/marketing/meta-insights', { campaign_id: 'camp_1' })
      const res = await GET(req)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe('UNAUTHORIZED')
    })

    test('returns 401 when wrong token provided', async () => {
      const req = makeReq('/api/marketing/meta-insights', { campaign_id: 'camp_1' }, OTHER_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(401)
    })

    test('accepts valid token via x-susan-api-key header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [], paging: null }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq('/api/marketing/meta-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(200)
    })

    test('accepts valid token via Bearer Authorization header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [], paging: null }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReqBearer('/api/marketing/meta-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(200)
    })
  })

  describe('missing credentials (503)', () => {
    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.META_ACCESS_TOKEN
      delete process.env.META_AD_ACCOUNT_ID
    })

    test('returns 503 when META_ACCESS_TOKEN is missing', async () => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      delete process.env.META_ACCESS_TOKEN
      process.env.META_AD_ACCOUNT_ID = 'act_123456'
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/meta-insights/route'))

      const req = makeReq('/api/marketing/meta-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toBe('META_CREDENTIALS_NOT_CONFIGURED')
      expect(body.missing).toContain('META_ACCESS_TOKEN')
    })

    test('returns 503 when META_AD_ACCOUNT_ID is missing', async () => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.META_ACCESS_TOKEN = 'fake-meta-token'
      delete process.env.META_AD_ACCOUNT_ID
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/meta-insights/route'))

      const req = makeReq('/api/marketing/meta-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.missing).toContain('META_AD_ACCOUNT_ID')
    })

    test('503 body includes docs URL', async () => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      delete process.env.META_ACCESS_TOKEN
      delete process.env.META_AD_ACCOUNT_ID
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/meta-insights/route'))

      const req = makeReq('/api/marketing/meta-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      const body = await res.json()
      expect(body.docs).toContain('developers.facebook.com')
    })
  })

  describe('param validation', () => {
    beforeEach(() => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.META_ACCESS_TOKEN = 'fake-meta-token'
      process.env.META_AD_ACCOUNT_ID = 'act_123456'
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/meta-insights/route'))
    })

    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.META_ACCESS_TOKEN
      delete process.env.META_AD_ACCOUNT_ID
    })

    test('returns 400 when campaign_id is missing', async () => {
      const req = makeReq('/api/marketing/meta-insights', {}, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('MISSING_PARAM')
    })
  })

  describe('successful data fetch', () => {
    beforeEach(() => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.META_ACCESS_TOKEN = 'fake-meta-token'
      process.env.META_AD_ACCOUNT_ID = 'act_123456'
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/meta-insights/route'))
    })

    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.META_ACCESS_TOKEN
      delete process.env.META_AD_ACCOUNT_ID
    })

    test('returns structured data on success', async () => {
      const mockData = [{ impressions: '1000', clicks: '50', spend: '25.00' }]
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockData, paging: { cursors: {} } }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq(
        '/api/marketing/meta-insights',
        { campaign_id: 'camp_abc', date_preset: 'last_7d' },
        VALID_TOKEN
      )
      const res = await GET(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.source).toBe('meta')
      expect(body.campaign_id).toBe('camp_abc')
      expect(body.date_preset).toBe('last_7d')
      expect(body.data).toEqual(mockData)
      expect(body.fetched_at).toBeDefined()
    })

    test('never sends access_token in response body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [], access_token: 'SHOULD_NOT_APPEAR' }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq('/api/marketing/meta-insights', { campaign_id: 'camp_abc' }, VALID_TOKEN)
      const res = await GET(req)
      const text = await res.text()
      expect(text).not.toContain('fake-meta-token')
      expect(text).not.toContain('SHOULD_NOT_APPEAR')
    })

    test('does not forward PII field requests', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq(
        '/api/marketing/meta-insights',
        { campaign_id: 'camp_abc', fields: 'impressions,email,phone,spend' },
        VALID_TOKEN
      )
      await GET(req)

      // Check that the fetch URL did NOT include email or phone as fields
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][0] as string
      const calledUrl = new URL(fetchCall)
      const fieldsParam = calledUrl.searchParams.get('fields') ?? ''
      expect(fieldsParam).not.toContain('email')
      expect(fieldsParam).not.toContain('phone')
      expect(fieldsParam).toContain('impressions')
      expect(fieldsParam).toContain('spend')
    })
  })
})

// ─── TikTok Insights ───────────────────────────────────────────────────────────

describe('GET /api/marketing/tiktok-insights', () => {
  let GET: (req: NextRequest) => Promise<Response>

  beforeEach(() => {
    jest.resetModules()
    jest.resetAllMocks()
  })

  describe('authorization', () => {
    beforeEach(() => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.TIKTOK_ACCESS_TOKEN = 'fake-tiktok-token'
      process.env.TIKTOK_ADVERTISER_ID = 'adv_789'
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/tiktok-insights/route'))
    })

    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.TIKTOK_ACCESS_TOKEN
      delete process.env.TIKTOK_ADVERTISER_ID
    })

    test('returns 401 when no token provided', async () => {
      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_1' })
      const res = await GET(req)
      expect(res.status).toBe(401)
    })

    test('returns 401 when wrong token provided', async () => {
      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_1' }, OTHER_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(401)
    })

    test('accepts valid token via x-susan-api-key', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { list: [], page_info: {} } }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(200)
    })
  })

  describe('missing credentials (503)', () => {
    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.TIKTOK_ACCESS_TOKEN
      delete process.env.TIKTOK_ADVERTISER_ID
    })

    test('returns 503 when TIKTOK_ACCESS_TOKEN is missing', async () => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      delete process.env.TIKTOK_ACCESS_TOKEN
      process.env.TIKTOK_ADVERTISER_ID = 'adv_789'
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/tiktok-insights/route'))

      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toBe('TIKTOK_CREDENTIALS_NOT_CONFIGURED')
      expect(body.missing).toContain('TIKTOK_ACCESS_TOKEN')
    })

    test('returns 503 when TIKTOK_ADVERTISER_ID is missing', async () => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.TIKTOK_ACCESS_TOKEN = 'fake-tiktok-token'
      delete process.env.TIKTOK_ADVERTISER_ID
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/tiktok-insights/route'))

      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.missing).toContain('TIKTOK_ADVERTISER_ID')
    })

    test('503 body includes docs URL', async () => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      delete process.env.TIKTOK_ACCESS_TOKEN
      delete process.env.TIKTOK_ADVERTISER_ID
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/tiktok-insights/route'))

      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_1' }, VALID_TOKEN)
      const res = await GET(req)
      const body = await res.json()
      expect(body.docs).toContain('tiktok.com')
    })
  })

  describe('param validation', () => {
    beforeEach(() => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.TIKTOK_ACCESS_TOKEN = 'fake-tiktok-token'
      process.env.TIKTOK_ADVERTISER_ID = 'adv_789'
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/tiktok-insights/route'))
    })

    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.TIKTOK_ACCESS_TOKEN
      delete process.env.TIKTOK_ADVERTISER_ID
    })

    test('returns 400 when campaign_id is missing', async () => {
      const req = makeReq('/api/marketing/tiktok-insights', {}, VALID_TOKEN)
      const res = await GET(req)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('MISSING_PARAM')
    })
  })

  describe('successful data fetch', () => {
    beforeEach(() => {
      process.env.SUSAN_MARKETING_TOKEN = VALID_TOKEN
      process.env.TIKTOK_ACCESS_TOKEN = 'fake-tiktok-token'
      process.env.TIKTOK_ADVERTISER_ID = 'adv_789'
      jest.resetModules()
      ;({ GET } = require('../app/api/marketing/tiktok-insights/route'))
    })

    afterEach(() => {
      delete process.env.SUSAN_MARKETING_TOKEN
      delete process.env.TIKTOK_ACCESS_TOKEN
      delete process.env.TIKTOK_ADVERTISER_ID
    })

    test('returns structured data on success', async () => {
      const mockList = [{ metrics: { spend: '50.00', impressions: '2000' } }]
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { list: mockList, page_info: { total_number: 1 } } }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq(
        '/api/marketing/tiktok-insights',
        { campaign_id: 'camp_xyz', date_range: 'last_7d' },
        VALID_TOKEN
      )
      const res = await GET(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.source).toBe('tiktok')
      expect(body.campaign_id).toBe('camp_xyz')
      expect(body.data).toEqual(mockList)
      expect(body.fetched_at).toBeDefined()
    })

    test('never sends TikTok access token in response body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { list: [] } }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_xyz' }, VALID_TOKEN)
      const res = await GET(req)
      const text = await res.text()
      expect(text).not.toContain('fake-tiktok-token')
    })

    test('uses POST method to call TikTok report API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { list: [] } }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_xyz' }, VALID_TOKEN)
      await GET(req)
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      expect(fetchCall[1].method).toBe('POST')
    })

    test('includes Access-Token header in TikTok request, not in URL', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { list: [] } }),
      }) as jest.MockedFunction<typeof fetch>

      const req = makeReq('/api/marketing/tiktok-insights', { campaign_id: 'camp_xyz' }, VALID_TOKEN)
      await GET(req)
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
      // Token must be in headers, not URL
      expect(fetchCall[1].headers['Access-Token']).toBe('fake-tiktok-token')
      expect(fetchCall[0]).not.toContain('fake-tiktok-token')
    })
  })
})
