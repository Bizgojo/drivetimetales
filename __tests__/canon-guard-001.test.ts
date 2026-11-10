/**
 * CANON-GUARD-001: fails when code or a writer prompt file disagrees with the approved canon.
 * The canon numbers live in lib/canon/numbers.ts. If this test fails, the code drifted from the
 * canon: fix the code, or (only with Marc's approval on CANON-99) change the canon first.
 */
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }) }),
}))
import fs from 'fs'
import path from 'path'
import { CANON } from '@/lib/canon/numbers'
import { DESCRIPTION_MAX_CHARS } from '@/lib/validateCardCopy'
import { BELLE_OUTRO_MAX_WORDS } from '@/lib/belleOutroForward'
import { HOOK_CANON_WORD_LIMIT } from '@/lib/hookGate'
import { maxMainCharacters } from '@/lib/seriesStyle'
import { SPEAKING_RATE_WPM, SERIES_FLOOR_MINS, SERIES_CAP_FACTOR, STANDALONE_TOLERANCE } from '@/lib/episodeLength'
import { SCRIPT_RUNTIME_PREFLIGHT } from '@/lib/scriptRuntimeEstimate'
import { PRICE_MONTHLY, PRICE_ANNUAL, PLOW_BACK } from '@/lib/finance/statement'
import { castReviewEnabled } from '@/lib/castReview'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

describe('CANON-GUARD-001: code matches the canon numbers', () => {
  test('description length (decision 8)', () => expect(DESCRIPTION_MAX_CHARS).toBe(CANON.DESCRIPTION_MAX_CHARS))
  test('Belle outro length (decision 30)', () => expect(BELLE_OUTRO_MAX_WORDS).toBe(CANON.BELLE_OUTRO_MAX_WORDS))
  test('hook within 15 words (decision 3)', () => expect(HOOK_CANON_WORD_LIMIT).toBe(CANON.HOOK_WORDS))
  test('cast size (decision 6)', () => {
    expect(maxMainCharacters(null, 3)).toBe(CANON.CAST_SHORT)
    expect(maxMainCharacters('action', 7)).toBe(CANON.CAST_LONG)
  })
  test('speaking rate and episode length (decision 4)', () => {
    expect(SPEAKING_RATE_WPM).toBe(CANON.SPEAKING_RATE_WPM)
    expect(SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM).toBe(CANON.SPEAKING_RATE_WPM)
    expect(SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES).toBe(CANON.SERIES_FLOOR_MINS)
    expect(SERIES_FLOOR_MINS).toBe(CANON.SERIES_FLOOR_MINS)
    expect(SERIES_CAP_FACTOR).toBe(CANON.SERIES_CAP_FACTOR)
    expect(STANDALONE_TOLERANCE).toBe(CANON.STANDALONE_TOLERANCE)
  })
  test('prices (decision 52) and plow back start (decision 57)', () => {
    expect(PRICE_MONTHLY).toBe(CANON.PRICE_MONTHLY)
    expect(PRICE_ANNUAL).toBe(CANON.PRICE_ANNUAL)
    expect(PLOW_BACK).toBe(CANON.PLOW_BACK_START)
  })
  test('cast approval is retired (decision 33): off unless explicitly switched on', () => {
    expect(castReviewEnabled({})).toBe(false)
  })
})

describe('CANON-GUARD-001: writer prompt files match the canon (CANON-00 rule 8)', () => {
  const files = ['Bible/CANON_REGISTRY_STORY_RULES.md', 'docs/STAGE2_SCRIPT_PROMPT.md']
  test.each(files)('%s has no retired description or sound rules', (f) => {
    const s = read(f)
    expect(s).not.toMatch(/DESCRIPTION: \[24 words|DESCRIPTION 24 words or fewer|3 to 6 anchor SFX cues per story/)
    expect(s).toMatch(/100 characters/)
  })
  test('the registry opens with the canon sync section', () => {
    expect(read('Bible/CANON_REGISTRY_STORY_RULES.md')).toMatch(/## CANON SYNC — approved canon/)
  })
  test('the series writer prompt asks for 100-character descriptions, not 24 words', () => {
    const src = read('app/api/admin/production-jobs/run-next/route.ts')
    expect(src).not.toMatch(/DESCRIPTION must be a (COMPLETE|complete) sentence, ≤24 words/)
    expect(src).toMatch(/100 characters or fewer, counting spaces/)
  })
})
