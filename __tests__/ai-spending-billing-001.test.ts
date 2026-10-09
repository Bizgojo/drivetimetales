import { NextRequest } from 'next/server'
import { providerCosts } from '../lib/ai-spending/billing'
const mockGetUser = jest.fn()
jest.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: mockGetUser } }) }))
jest.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }))
import { GET } from '../app/api/admin/ai-spending/billing/route'
const keys = ['OPENAI_ADMIN_KEY', 'ANTHROPIC_ADMIN_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_BILLING_PROJECT_ID', 'ANTHROPIC_BILLING_WORKSPACE_ID']
const saved: Record<string, string | undefined> = {}
beforeEach(() => { for (const k of keys) { saved[k] = process.env[k]; delete process.env[k] }; mockGetUser.mockReset() })
afterEach(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
const response = (payload: any, status = 200) => new Response(JSON.stringify(payload), { status })
test('missing billing credentials never substitutes a token estimate or zero cost', async () => {
  const f = jest.fn(); const r = await providerCosts('OpenAI', '2026-09-01', '2026-09-02', f)
  expect(r.status).toBe('not_connected'); expect(r.rows).toEqual([]); expect(f).not.toHaveBeenCalled()
})
test('OpenAI costs paginate in dollars, preserve negative adjustments and apply project scope', async () => {
  process.env.OPENAI_ADMIN_KEY = 'test-admin'; process.env.OPENAI_BILLING_PROJECT_ID = 'project1'
  const f = jest.fn().mockResolvedValueOnce(response({ data: [{ start_time: Date.parse('2026-09-01T00:00Z') / 1000, results: [{ amount: { currency: 'usd', value: 12.34 }, project_id: 'project1', line_item: 'images' }] }], has_more: true, next_page: 'p2' })).mockResolvedValueOnce(response({ data: [{ start_time: Date.parse('2026-09-02T00:00Z') / 1000, results: [{ amount: { currency: 'usd', value: -.5 }, project_id: 'project1' }] }], has_more: false, next_page: null }))
  const r = await providerCosts('OpenAI', '2026-09-01', '2026-09-02', f)
  expect(r.status).toBe('connected'); expect(r.rows.map(x => x.amount)).toEqual([12.34, -.5])
  expect(new URL(f.mock.calls[1][0]).searchParams.get('page')).toBe('p2')
  expect(new URL(f.mock.calls[0][0]).searchParams.get('project_ids')).toBe('project1')
  expect(new URL(f.mock.calls[0][0]).searchParams.get('end_time')).toBe(String(Date.parse('2026-09-03T00:00Z') / 1000))
})
test('Anthropic decimal cents become USD dollars and selected workspace excludes other activity', async () => {
  process.env.ANTHROPIC_ADMIN_KEY = 'test-admin'; process.env.ANTHROPIC_BILLING_WORKSPACE_ID = 'w1'
  const f = jest.fn().mockResolvedValue(response({ data: [{ starting_at: '2026-09-01T00:00:00Z', results: [{ amount: '123.78912', currency: 'USD', workspace_id: 'w1', description: 'Input' }, { amount: '1000', currency: 'USD', workspace_id: 'other' }] }], has_more: false }))
  const r = await providerCosts('Anthropic', '2026-09-01', '2026-09-02', f)
  expect(r.status).toBe('connected'); expect(r.rows).toHaveLength(1); expect(r.rows[0].amount).toBeCloseTo(1.2378912, 8)
  expect(new URL(f.mock.calls[0][0]).searchParams.getAll('group_by[]')).toEqual(['workspace_id', 'description'])
})
test('permissions and malformed or incomplete reports never expose partial dollar totals', async () => {
  process.env.OPENAI_ADMIN_KEY = 'test-admin'
  expect((await providerCosts('OpenAI', '2026-09-01', '2026-09-02', jest.fn().mockResolvedValue(response({}, 403)))).status).toBe('permission_required')
  const f = jest.fn().mockResolvedValueOnce(response({ data: [{ start_time: Date.parse('2026-09-01T00:00Z') / 1000, results: [{ amount: { value: 10, currency: 'usd' } }] }], has_more: true, next_page: 'p2' })).mockResolvedValueOnce(response({}, 500))
  const r = await providerCosts('OpenAI', '2026-09-01', '2026-09-02', f); expect(r.status).toBe('unavailable'); expect(r.rows).toEqual([])
  const bad = jest.fn().mockResolvedValue(response({ data: [{ start_time: Date.parse('2026-09-01T00:00Z') / 1000, results: [{ amount: { value: 'unknown', currency: 'usd' } }] }], has_more: false }))
  expect((await providerCosts('OpenAI', '2026-09-01', '2026-09-02', bad)).status).toBe('unavailable')
})
test('billing route requires admin authentication and real dates before provider access', async () => {
  const req = (q: string) => new NextRequest('https://app.endless-tales.com/api/admin/ai-spending/billing?' + q)
  mockGetUser.mockResolvedValue({ data: { user: { email: 'listener@example.com' } } }); expect((await GET(req('from=2026-09-01&to=2026-09-02'))).status).toBe(401)
  mockGetUser.mockResolvedValue({ data: { user: { email: 'marc@endless-tales.com' } } }); expect((await GET(req('from=2026-02-30&to=2026-09-02'))).status).toBe(400)
  const r = await GET(req('from=2026-09-01&to=2026-09-02')); expect(r.status).toBe(200); expect((await r.json()).reports.every((r: any) => r.status === 'not_connected')).toBe(true)
})
