import { checkCredits, billingErrorServices, alertsDue, creditAlertText, checkDue, LOW } from '@/lib/creditsWatch'

const reply = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as any)
function fakeFetch(map: Record<string, any>) {
  return ((url: string) => {
    const k = Object.keys(map).find((m) => url.includes(m))
    return k ? reply(map[k]) : reply({}, false)
  }) as any
}
const env = { ELEVENLABS_API_KEY: 'x', DEEPSEEK_API_KEY: 'x', KIE_API_KEY: 'x', OPENROUTER_KEY: 'x' }

describe('CREDITS-WATCH-001', () => {
  test('reads each balance and flags low ones', async () => {
    const rows = await checkCredits({
      env,
      fetchImpl: fakeFetch({
        elevenlabs: { character_count: 900000, character_limit: 1000000, tier: 'pro' },
        deepseek: { is_available: true, balance_infos: [{ currency: 'USD', total_balance: '42.10' }] },
        'kie.ai': { code: 200, data: 120 },
        openrouter: { data: { total_credits: 50, total_usage: 10 } },
      }),
      anthropicMonthSpendUsd: 340, anthropicMonthlyLimitUsd: 500, recentBillingErrors: new Set(),
    })
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(by.elevenlabs.status).toBe('low') // 100,000 left < 250,000
    expect(by.elevenlabs.balance).toContain('100,000 characters left')
    expect(by.deepseek.status).toBe('ok')
    expect(by.kie.status).toBe('low')
    expect(by.openrouter.balance).toBe('$40.00')
    expect(by.anthropic.status).toBe('ok')
    expect(by.anthropic.balance).toContain('$160.00 left of $500.00')
    expect(by.openai.status).toBe('cannot_check')
    expect(by.elevenlabs.topUpUrl).toBe('https://elevenlabs.io/app/subscription')
  })
  test('anthropic near its limit is low; unknown limit cannot be checked', async () => {
    const near = await checkCredits({ env: {}, fetchImpl: fakeFetch({}), anthropicMonthSpendUsd: 450, anthropicMonthlyLimitUsd: 500, recentBillingErrors: new Set() })
    expect(near.find((r) => r.id === 'anthropic')!.status).toBe('low')
    const unknown = await checkCredits({ env: {}, fetchImpl: fakeFetch({}), anthropicMonthSpendUsd: 450, anthropicMonthlyLimitUsd: null, recentBillingErrors: new Set() })
    expect(unknown.find((r) => r.id === 'anthropic')!.status).toBe('cannot_check')
    expect(unknown.find((r) => r.id === 'elevenlabs')!.status).toBe('not_connected')
  })
  test('a billing error in the logs marks the service low', async () => {
    const errs = billingErrorServices(['Anthropic error 400: You have reached your specified API usage limits. You will regain access on 2026-12-01'])
    expect(Array.from(errs)).toEqual(['anthropic'])
    const rows = await checkCredits({ env: {}, fetchImpl: fakeFetch({}), anthropicMonthSpendUsd: 10, anthropicMonthlyLimitUsd: 500, recentBillingErrors: errs })
    expect(rows.find((r) => r.id === 'anthropic')!.status).toBe('low')
  })
  test('alerts once per 12 hours and say what, why and where', () => {
    const low = { id: 'elevenlabs', name: 'ElevenLabs', usedFor: 'Character voices', topUpUrl: 'https://elevenlabs.io/app/subscription', card: 'c', status: 'low' as const, balance: '1 left', detail: '', lowBelow: '250,000 characters' }
    const now = Date.parse('2026-11-15T12:00:00Z')
    expect(alertsDue([low], {}, now)).toHaveLength(1)
    expect(alertsDue([low], { elevenlabs: '2026-11-15T06:00:00Z' }, now)).toHaveLength(0)
    expect(alertsDue([low], { elevenlabs: '2026-11-14T23:00:00Z' }, now)).toHaveLength(1)
    const t = creditAlertText(low)
    expect(t).toContain('Used for: Character voices')
    expect(t).toContain('https://elevenlabs.io/app/subscription')
    expect(checkDue(null)).toBe(true)
    expect(checkDue({ checkedAt: new Date(now - 10 * 60000).toISOString(), services: [] }, now)).toBe(false)
    expect(LOW.elevenlabsCharacters).toBe(250000)
  })
})
