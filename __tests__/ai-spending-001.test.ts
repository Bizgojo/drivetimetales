import { dayKey, monday, shiftDay, summarize, agentFor, providerFor, validAmount, AGENT_ROSTER } from '../lib/ai-spending/core'

describe('AI spending accounting and calendar boundaries', () => {
  test('credit purchases, subscriptions and usage remain separate', () => {
    const result = summarize([
      { date: '2026-10-09', provider: 'Anthropic', agent: 'Orion', kind: 'credit_purchase', amount: 100, calls: 0 },
      { date: '2026-10-09', provider: 'Anthropic', agent: 'Orion', kind: 'usage', amount: 8.125, calls: 3 },
      { date: '2026-10-09', provider: 'Claude', agent: 'Shared', kind: 'subscription', amount: 20, calls: 0 },
    ])
    expect(result).toEqual({ cash: 120, usage: 8.125, subscriptions: 20, credits: 100, calls: 3 })
  })
  test('New York day boundaries respect daylight saving time', () => {
    expect(dayKey('2026-10-09T03:59:59Z')).toBe('2026-10-08')
    expect(dayKey('2026-10-09T04:00:00Z')).toBe('2026-10-09')
    expect(dayKey('2026-12-09T04:59:59Z')).toBe('2026-12-08')
    expect(dayKey('2026-12-09T05:00:00Z')).toBe('2026-12-09')
    expect(dayKey('2026-10-09')).toBe('2026-10-09')
    expect(monday('2026-10-11')).toBe('2026-10-05')
    expect(monday('2026-10-12')).toBe('2026-10-12')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })
  test('agent allocation is explicit and never inferred from job duties', () => {
    expect(agentFor({ agent: 'Lyra' })).toBe('Lyra')
    expect(agentFor({}, '[AI spending] [agent:Atlas]')).toBe('Atlas')
    expect(agentFor({ is_v2: true, purpose: 'story generation' })).toBe('Unassigned')
    expect(agentFor({}, '', 'Anthropic (Hal)')).toBe('Hal')
    expect(AGENT_ROSTER.filter(a => a.type === 'Persistent')).toHaveLength(4)
    expect(AGENT_ROSTER.filter(a => a.type === 'Task role')).toHaveLength(7)
  })
  test('models map to billing accounts without creating duplicate providers', () => {
    expect(providerFor('DeepSeek R1')).toBe('DeepSeek')
    expect(providerFor('DeepSeek V3')).toBe('DeepSeek')
    expect(providerFor('DALL-E')).toBe('OpenAI')
    expect(providerFor('Meta Muse Spark')).toBe('Muse Spark')
    expect(providerFor('Hindsight')).toBe('Hindsight')
    expect(providerFor('Facebook Ads')).toBeNull()
  })
  test('missing and malformed amounts cannot silently become zero', () => {
    expect(validAmount(null)).toBeNull()
    expect(validAmount('')).toBeNull()
    expect(validAmount('unknown')).toBeNull()
    expect(validAmount(-1)).toBeNull()
    expect(validAmount(true)).toBeNull()
    expect(validAmount('0')).toBe(0)
    expect(validAmount('0.125')).toBe(.125)
  })
})
