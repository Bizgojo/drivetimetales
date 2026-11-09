jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
import { hookWordLimitFor, HOOK_CANON_WORD_LIMIT } from '../lib/hookGate'

describe('HOOK-15-001: new Episode 1s land the hook within 15 words', () => {
  const NEW = '2026-11-11T12:00:00Z', OLD = '2026-11-01T12:00:00Z'
  test('new standalone → 15', () => expect(hookWordLimitFor('TITLE: X\nGENRE: Thriller', NEW)).toBe(HOOK_CANON_WORD_LIMIT))
  test('new series Episode 1 → 15', () => expect(hookWordLimitFor('SERIES: Rerouted\nEPISODE: 1', NEW)).toBe(15))
  test('new series Episode 4 → old 30', () => expect(hookWordLimitFor('SERIES: Rerouted\nEPISODE: 4', NEW)).toBe(30))
  test('scripts written before the rule keep 30 (live hooks unchanged)', () => expect(hookWordLimitFor('SERIES: Rerouted\nEPISODE: 1', OLD)).toBe(30))
  test('no script date → old 30', () => expect(hookWordLimitFor('TITLE: X', null)).toBe(30))
})
