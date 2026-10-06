/**
 * ATL-VALMODEL-GUARD-001 (decision alderton-rerun-nooverride-guardpr-oct6-1634)
 *
 * Belt-and-suspenders guard for the validation path in
 * app/api/admin/production-jobs/run-next/route.ts (validationModel resolution
 * for score_validate_package and the other validate_* steps).
 *
 * The resolved validation model id is handed directly to the Anthropic client
 * (anthropic.messages.create). This test pins the contract that:
 *   - any non-Claude id (e.g. a stray DeepSeek reasoner id) coerces to the
 *     safe Claude fallback (FALLBACK_VALIDATE_MODEL / claude-sonnet-4-6) and
 *     logs a warning noting the coercion, and
 *   - any Claude id passes through UNCHANGED (no coercion, no warning).
 */
import {
  coerceValidationModelToClaude,
  isClaudeModelId,
  FALLBACK_VALIDATE_MODEL,
} from '@/lib/model-router'

describe('ATL-VALMODEL-GUARD-001: coerceValidationModelToClaude', () => {
  it('sanity: fallback is a Claude model', () => {
    expect(FALLBACK_VALIDATE_MODEL).toBe('claude-sonnet-4-6')
    expect(isClaudeModelId(FALLBACK_VALIDATE_MODEL)).toBe(true)
  })

  describe('non-Claude id in -> fallback out (+ warning)', () => {
    const nonClaude = [
      'deepseek-reasoner',
      'deepseek-chat',
      'deepseek-r1',
      'gpt-4o',
      'gemini-1.5-pro',
      'DEEPSEEK-REASONER',
      'some-random-model',
      '',
      '   ',
    ]

    it.each(nonClaude)('coerces %j to the Claude fallback and warns', (input) => {
      const warn = jest.fn()
      const out = coerceValidationModelToClaude(input, { warn })
      expect(out).toBe(FALLBACK_VALIDATE_MODEL)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toContain('ATL-VALMODEL-GUARD-001')
      expect(warn.mock.calls[0][0]).toContain(FALLBACK_VALIDATE_MODEL)
    })

    it('coerces null/undefined to the fallback and warns', () => {
      const warn = jest.fn()
      expect(coerceValidationModelToClaude(null, { warn })).toBe(FALLBACK_VALIDATE_MODEL)
      expect(coerceValidationModelToClaude(undefined, { warn })).toBe(FALLBACK_VALIDATE_MODEL)
      expect(warn).toHaveBeenCalledTimes(2)
    })
  })

  describe('Claude id in -> unchanged (no warning)', () => {
    const claude = [
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-haiku-4-5',
      'claude-3-5-sonnet-latest',
      'Claude-Sonnet-4-6', // case-insensitive prefix match
    ]

    it.each(claude)('passes %j through unchanged with no warning', (input) => {
      const warn = jest.fn()
      const out = coerceValidationModelToClaude(input, { warn })
      expect(out).toBe(input)
      expect(warn).not.toHaveBeenCalled()
    })

    it('trims surrounding whitespace on a Claude id', () => {
      const warn = jest.fn()
      expect(coerceValidationModelToClaude('  claude-sonnet-4-6  ', { warn })).toBe(
        'claude-sonnet-4-6',
      )
      expect(warn).not.toHaveBeenCalled()
    })
  })

  describe('isClaudeModelId', () => {
    it('true for claude-prefixed ids (case-insensitive, trimmed)', () => {
      expect(isClaudeModelId('claude-sonnet-4-6')).toBe(true)
      expect(isClaudeModelId('  Claude-opus-4-6 ')).toBe(true)
    })
    it('false for non-claude / empty ids', () => {
      expect(isClaudeModelId('deepseek-reasoner')).toBe(false)
      expect(isClaudeModelId('')).toBe(false)
      expect(isClaudeModelId(null)).toBe(false)
      expect(isClaudeModelId(undefined)).toBe(false)
    })
  })
})
