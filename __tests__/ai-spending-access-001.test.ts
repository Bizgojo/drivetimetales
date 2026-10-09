import { NextRequest } from 'next/server'
const mockGetUser = jest.fn()
const mockClient = jest.fn()
jest.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: mockGetUser } }) }))
jest.mock('@supabase/supabase-js', () => ({ createClient: (...args: any[]) => mockClient(...args) }))
jest.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [] }) }))
import { GET, POST } from '../app/api/admin/ai-spending/route'

beforeEach(() => { mockGetUser.mockReset(); mockClient.mockReset() })
test('read and receipt write deny non-admin users before touching spending data', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'listener@example.com' } } })
  expect((await GET()).status).toBe(401)
  expect((await POST(new NextRequest('https://app.endless-tales.com/api/admin/ai-spending', { method: 'POST', body: '{}' }))).status).toBe(401)
  expect(mockClient).not.toHaveBeenCalled()
})
test('invalid payment data never writes a receipt', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'marc@endless-tales.com' } } })
  for (const amount of [-1, 0, 'unknown']) {
    const response = await POST(new NextRequest('https://app.endless-tales.com/api/admin/ai-spending', { method: 'POST', body: JSON.stringify({ amount, provider: 'DeepSeek', agent: 'Lyra', kind: 'credit_purchase', date: '2026-01-01' }) }))
    expect(response.status).toBe(400)
  }
  expect(mockClient).not.toHaveBeenCalled()
})
test('a valid receipt stores explicit provider, agent, model and kind in the shared ledger', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'marc@endless-tales.com' } } })
  const insert = jest.fn().mockResolvedValue({ error: null }), from = jest.fn(() => ({ insert }))
  mockClient.mockReturnValue({ from })
  const response = await POST(new NextRequest('https://app.endless-tales.com/api/admin/ai-spending', { method: 'POST', body: JSON.stringify({ amount: 25, provider: 'DeepSeek', agent: 'Lyra', model: 'DeepSeek R1', kind: 'credit_purchase', date: '2026-01-01', note: 'Invoice 123' }) }))
  expect(response.status).toBe(200)
  expect(from).toHaveBeenCalledWith('expenses_log')
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ vendor: 'DeepSeek', amount_usd: 25, entry_type: 'manual', description: '[AI spending] [agent:Lyra] [kind:credit_purchase] [model:DeepSeek R1] Invoice 123' }))
})
test('reads past the first database page and marks missing sources instead of inventing totals', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'marc@endless-tales.com' } } })
  const openai = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), created_at: '2026-10-09T12:00:00Z', cost_usd: .01, model: 'dall-e-3', metadata: { agent: 'Hal' } }))
  const expenses = [{ id: 'paid1', vendor: 'OpenAI', category: 'AI & Voice', expense_date: '2026-10-09', amount_usd: 50, description: '[agent:Shared] [kind:credit_purchase]' }, { id: 'ad1', vendor: 'Facebook Ads', category: 'Marketing', expense_date: '2026-10-09', amount_usd: 200, description: '' }]
  const ranges: number[] = []
  const from = (table: string) => { const chain: any = {}; chain.select = () => chain; chain.order = () => chain; chain.range = async (start: number, end: number) => {
    if (table === 'anthropic_usage_log') return { data: null, error: { message: 'missing table' } }
    if (table === 'openai_usage_log') { ranges.push(start); return { data: openai.slice(start, end + 1), error: null } }
    return { data: table === 'expenses_log' ? expenses.slice(start, end + 1) : [], error: null }
  }; return chain }
  mockClient.mockReturnValue({ from })
  const priorEL = process.env.ELEVENLABS_API_KEY, priorKie = process.env.KIE_API_KEY, priorDeep = process.env.DEEPSEEK_API_KEY
  delete process.env.ELEVENLABS_API_KEY; delete process.env.KIE_API_KEY; delete process.env.DEEPSEEK_API_KEY
  try {
    const response = await GET(); const payload = await response.json()
    expect(response.status).toBe(200)
    expect(ranges).toEqual([0, 1000])
    expect(payload.daily.find((r: any) => r.kind === 'usage').amount).toBeCloseTo(10.01, 8)
    expect(payload.daily.find((r: any) => r.kind === 'usage').calls).toBe(1001)
    expect(payload.daily.find((r: any) => r.kind === 'credit_purchase').amount).toBe(50)
    expect(payload.daily).toHaveLength(2)
    expect(payload.sources.find((s: any) => s.provider === 'Anthropic').status).toBe('unavailable')
    expect(payload.payments).toHaveLength(1)
  } finally { if(priorEL !== undefined)process.env.ELEVENLABS_API_KEY=priorEL; if(priorKie !== undefined)process.env.KIE_API_KEY=priorKie; if(priorDeep !== undefined)process.env.DEEPSEEK_API_KEY=priorDeep }
})
