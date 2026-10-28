import { readFileSync } from 'fs'
import { join } from 'path'
import { countDescriptionWords, descriptionWordCountMiscount } from '@/lib/descriptionWordCountTruth'

// DESC-WORDCOUNT-TRUTH-001 (job 9a961907): validator said 26 words; it was 24.
const desc = "Nick Brennan enters a secured Chicago tower chasing a stolen address, but the trail inside leads somewhere far more dangerous than a kidnapper's hideout."
const realLine = `**DESCRIPTION exceeds the 24-word limit.** The current DESCRIPTION is 26 words: *"${desc}"* Rule violated: *"Description: ≤24 words, present tense (DISC-001)."* Trim to 24 words or fewer before resubmitting.`

describe('DESC-WORDCOUNT-TRUTH-001', () => {
  test('the job 9a961907 description is 24 words', () => expect(countDescriptionWords(desc)).toBe(24))
  test('word-count-only failure on a 24-word description is overridden', () => {
    expect(descriptionWordCountMiscount([realLine], desc)).toEqual({ override: true, actual: 24 })
  })
  test('a truly long description still fails', () => {
    expect(descriptionWordCountMiscount([realLine], desc + ' And then more words follow.').override).toBe(false)
  })
  test('any other failure (tense, spoiler, second line) is not overridden', () => {
    expect(descriptionWordCountMiscount(['DESCRIPTION uses past tense "walked".'], desc).override).toBe(false)
    expect(descriptionWordCountMiscount(['DESCRIPTION reveals the culprit (spoiler).'], desc).override).toBe(false)
    expect(descriptionWordCountMiscount([realLine, 'SFX count is 4; max 3.'], desc).override).toBe(false)
    expect(descriptionWordCountMiscount([], desc).override).toBe(false)
  })
  test('series validator applies the override', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/const passed = llmPassed \|\| wordCountTruth\.override/)
    expect(src).toMatch(/descriptionWordCountMiscount\(extractValidatorFailureLines\(report\), normalizeHeaderValue\(extractHeader\(script, 'DESCRIPTION'\)\)\)/)
  })
})
