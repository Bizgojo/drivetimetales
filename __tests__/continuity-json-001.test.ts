/**
 * CONTINUITY-JSON-001 (2026-11-01) — The Last Well failed with "continuity
 * check returned no JSON verdict": the checker's notes on 7 episodes filled
 * the 2000-token reply before it reached the JSON.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { CONTINUITY_MAX_TOKENS, CONTINUITY_JSON_ONLY_RETRY, hasJsonObject } from '@/lib/seriesContinuity'

test('finds JSON alone or after notes; not in a cut-off reply', () => {
  expect(hasJsonObject('{"pass":true,"issues":[]}')).toBe(true)
  expect(hasJsonObject('Tracking:\n- Clara\n{"pass":false,"issues":[]}')).toBe(true)
  expect(hasJsonObject('I need to read carefully through all seven episodes, tracking every character')).toBe(false)
  expect(hasJsonObject('notes... {"pass": false, "issues": [{"episode": 2')).toBe(false)
})

test('more room and a JSON-only retry in the run-next continuity step', () => {
  expect(CONTINUITY_MAX_TOKENS).toBeGreaterThanOrEqual(8000)
  expect(CONTINUITY_JSON_ONLY_RETRY).toMatch(/JSON object only/)
  const src = readFileSync(join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  expect(src).toContain('max_tokens: CONTINUITY_MAX_TOKENS')
  expect(src).toContain('if (!hasJsonObject(rawVerdict)) {')
  expect(src).not.toMatch(/max_tokens: 2000,\s*temperature: 0,\s*messages: \[\{\s*role: 'user',\s*content: buildContinuityPrompt/)
})
