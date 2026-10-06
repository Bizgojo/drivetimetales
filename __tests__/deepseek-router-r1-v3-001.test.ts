/**
 * deepseek-router-r1-v3-001.test.ts — R1-V3 step map router + adapter mock tests.
 * Decision r1-v3-step-map-approved-oct6 (2026-10-06).
 */
import {
  routeStep,
  resolveModelForStep,
  hasDeepSeekEnv,
  legacyStepModels,
  DEEPSEEK_R1_MODEL,
  CLAUDE_SONNET_MODEL,
  FALLBACK_GENERATE_MODEL,
  FALLBACK_VALIDATE_MODEL,
} from '@/lib/model-router'
import { chatR1 } from '@/lib/deepseek/deepseek-r1'
import { chatV3 } from '@/lib/deepseek/deepseek-v3'

describe('model-router routeStep (approved A/B/C map)', () => {
  test('Route A: story-brief / story-idea -> strategos / R1', () => {
    for (const s of ['story-brief', 'story-idea', 'story_brief', 'generate_story_idea']) {
      const r = routeStep(s)
      expect(r.owner).toBe('strategos')
      expect(r.provider).toBe('deepseek-r1')
      expect(r.model).toBe(DEEPSEEK_R1_MODEL)
      expect(r.deterministic).toBe(false)
    }
  })

  test('Route B: validation/scoring/QC steps -> lyra / R1', () => {
    const steps = [
      'validate_script',
      'score_script',
      'score_validate_package',
      'validate_story_resolution',
      'quality_gate_validate',
      'validate_belle_quality',
      'belle_qc_verdict',
      'validate_voice_conformance',
      'validate_series_episode_script',
    ]
    for (const s of steps) {
      const r = routeStep(s)
      expect(r.owner).toBe('lyra')
      expect(r.provider).toBe('deepseek-r1')
      expect(r.model).toBe(DEEPSEEK_R1_MODEL)
    }
  })

  test('Route C: generation / prose repair -> hal / sonnet', () => {
    const steps = [
      'generate_script',
      'generate_episode_script',
      'apply_top_fixes',
      'repair_belle_quality',
      'regenerate_series_description_from_feedback',
    ]
    for (const s of steps) {
      const r = routeStep(s)
      expect(r.owner).toBe('hal')
      expect(r.provider).toBe('claude-sonnet')
      expect(r.model).toBe(CLAUDE_SONNET_MODEL)
    }
  })

  test('Atlas deterministic steps -> no LLM call', () => {
    for (const s of ['generate_voices', 'render_final_mix', 'complete_story_package', 'generate_music']) {
      const r = routeStep(s)
      expect(r.owner).toBe('atlas')
      expect(r.model).toBeNull()
      expect(r.deterministic).toBe(true)
      expect(resolveModelForStep(s)).toBeNull()
    }
  })

  test('run-next orchestration -> orion, no LLM call', () => {
    const r = routeStep('run_next')
    expect(r.owner).toBe('orion')
    expect(r.model).toBeNull()
  })

  test('unknown steps default to hal/sonnet (safe)', () => {
    const r = routeStep('some_future_step_xyz')
    expect(r.owner).toBe('hal')
    expect(r.model).toBe(CLAUDE_SONNET_MODEL)
  })
})

describe('model-router fallback (pre-redeploy safe)', () => {
  const saved = process.env.DEEPSEEK_API_KEY
  afterEach(() => {
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = saved
  })

  test('missing env -> hasDeepSeekEnv false, R1 steps resolve to Claude fallback', () => {
    delete process.env.DEEPSEEK_API_KEY
    expect(hasDeepSeekEnv()).toBe(false)
    expect(resolveModelForStep('validate_script')).toBe(FALLBACK_VALIDATE_MODEL)
    expect(resolveModelForStep('story-idea')).toBe(FALLBACK_VALIDATE_MODEL)
    expect(legacyStepModels()).toEqual({
      generate: FALLBACK_GENERATE_MODEL,
      validate: FALLBACK_VALIDATE_MODEL,
    })
  })

  test('env present -> R1 steps resolve to deepseek-reasoner', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key-never-logged'
    expect(hasDeepSeekEnv()).toBe(true)
    expect(resolveModelForStep('validate_script')).toBe(DEEPSEEK_R1_MODEL)
    expect(resolveModelForStep('generate_script')).toBe(CLAUDE_SONNET_MODEL)
  })
})

describe('deepseek adapters (mock fetch)', () => {
  const saved = process.env.DEEPSEEK_API_KEY
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'test-key-never-logged'
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = saved
  })

  test('chatR1 posts deepseek-reasoner with Bearer auth, returns content', async () => {
    const calls: any[] = []
    const fetchImpl: any = async (url: string, init: any) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"ok":true}', reasoning_content: 'thought' } }],
          usage: { total_tokens: 10 },
        }),
      }
    }
    const r = await chatR1([{ role: 'user', content: 'hi' }], { fetchImpl, timeoutMs: 5000, retries: 0 })
    expect(r.content).toBe('{"ok":true}')
    expect(r.reasoning).toBe('thought')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('api.deepseek.com')
    const body = JSON.parse(calls[0].init.body)
    expect(body.model).toBe('deepseek-reasoner')
    expect(String(calls[0].init.headers.Authorization)).toMatch(/^Bearer /)
  })

  test('chatV3 posts deepseek-chat, retries once on 500 then succeeds', async () => {
    let n = 0
    const fetchImpl: any = async (_url: string, init: any) => {
      n++
      if (n === 1) return { ok: false, status: 500, json: async () => ({}) }
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'v3-ok' } }] }),
      }
    }
    const r = await chatV3([{ role: 'user', content: 'hi' }], { fetchImpl, timeoutMs: 5000, retries: 2 })
    expect(r.content).toBe('v3-ok')
    expect(n).toBe(2)
  })

  test('adapters throw when env key missing (never log value)', async () => {
    delete process.env.DEEPSEEK_API_KEY
    await expect(chatR1([{ role: 'user', content: 'x' }], { retries: 0 })).rejects.toThrow('DEEPSEEK_API_KEY')
    await expect(chatV3([{ role: 'user', content: 'x' }], { retries: 0 })).rejects.toThrow('DEEPSEEK_API_KEY')
  })
})
