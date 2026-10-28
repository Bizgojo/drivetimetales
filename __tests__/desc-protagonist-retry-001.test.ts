/**
 * DESC-PROTAGONIST-RETRY-001 (Marc, 2026-10-28): a DESCRIPTION that centers the
 * wrong character is card copy, rewritten from validator feedback (bounded
 * retries) instead of stopping the series. Behavioural test: the classifier is
 * extracted from run-next and executed.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'

const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
const start = src.indexOf('function extractValidatorFailureLines(')
const end = src.indexOf('function seriesDescriptionFailureFromEpisodeResult(')
const js = ts.transpileModule(src.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2019 } }).outputText
// eslint-disable-next-line no-new-func
const classify = new Function(`${js}; return classifyDescriptionValidatorFailure`)() as (r: string) => any

const SATURDAY_EP2 = [
  '**SUMMARY OF FAILURES:**',
  '❌ VALIDATOR RESULT: FAIL',
  'Do not send to production. Fix the following before resubmitting:',
  '- **DESCRIPTION PROTAGONIST MISMATCH (Hard Fail):** The DESCRIPTION reads "A retired teacher brings his long-stopped mantel clock to Felix\'s shop, but a note tucked inside the case may be the real reason it." This frames the story around Darius Wakefield (the visitor), not the protagonist. Rewrite the DESCRIPTION so it centers on Felix.',
].join('\n')

describe('DESC-PROTAGONIST-RETRY-001', () => {
  test('Saturday Repair Shop EP2 description protagonist mismatch is retryable card copy', () => {
    expect(classify(SATURDAY_EP2)).toMatchObject({ retryable: true, kind: 'mechanical' })
  })
  test('role mismatch in the DESCRIPTION is retryable', () => {
    const report = 'Fix the following before resubmitting:\n- DESCRIPTION role mismatch: says "driver" but the protagonist is a security guard.'
    expect(classify(report)).toMatchObject({ retryable: true })
  })
  test('weak hook in the DESCRIPTION still stops for a human', () => {
    const report = 'Fix the following before resubmitting:\n- DESCRIPTION has a weak hook and does not raise a question.'
    expect(classify(report)).toMatchObject({ retryable: false, kind: 'substantive' })
  })
  test('a non-description failure is not handled by the description path', () => {
    const report = 'Fix the following before resubmitting:\n- CLIMAX happens offscreen; protagonist is passive.'
    expect(classify(report)).toBeNull()
  })
  test('the repair prompt names the protagonist and forbids cut-off endings', () => {
    const fn = src.slice(src.indexOf('async function regenerateSeriesDescriptionFromEpisodeFeedback('), src.indexOf('async function regenerateSeriesDescriptionFromEpisodeFeedback(') + 4000)
    expect(fn).toContain('must center on the PROTAGONIST')
    expect(fn).toContain('never stop mid-phrase')
    expect(fn).toMatch(/protagonist: \(parseCharacterGuide/)
  })
})
