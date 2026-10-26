/**
 * WRITER-REVISE-001 + WRITER-PROMPT-GATES-001 (job fd2521c4: EP1 failed 3
 * drafts, each worse). Two causes: rewrites started from scratch, and the
 * series prompt asked for things the downstream gates then rejected.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildWriterRewriteFeedback,
  checkScriptReadiness,
  seriesSpokenWordTarget,
  writeWithSelfCheck,
} from '@/lib/scriptReadiness'
import { SCRIPT_RUNTIME_PREFLIGHT } from '@/lib/scriptRuntimeEstimate'

const notReady = () => checkScriptReadiness({ script: 'TITLE: X\nNARRATOR: N\nNARRATOR: At 3:12 it rang.' })

describe('WRITER-REVISE-001: rewrites revise the previous draft', () => {
  test('first draft gets no previous draft; each rewrite gets the exact previous model output', async () => {
    const seen: Array<string | null> = []
    let n = 0
    await writeWithSelfCheck({
      generate: async (_feedback, previousDraft) => {
        seen.push(previousDraft)
        n += 1
        return { script: `normalized${n}`, description: 'd', raw: `raw${n}` }
      },
      check: () => notReady(),
      maxRewrites: 2,
    })
    expect(seen).toEqual([null, 'raw1', 'raw2'])
  })

  test('falls back to the normalized script when no raw output is supplied', async () => {
    const seen: Array<string | null> = []
    await writeWithSelfCheck({
      generate: async (_f, prev) => { seen.push(prev); return { script: 'only-script', description: 'd' } },
      check: () => notReady(),
      maxRewrites: 1,
    })
    expect(seen).toEqual([null, 'only-script'])
  })

  test('feedback asks for a revision of the draft above, output as a complete script', () => {
    const text = buildWriterRewriteFeedback(notReady(), 15)
    expect(text).toMatch(/REWRITE REQUIRED/)
    expect(text).toMatch(/REVISE that draft/)
    expect(text).toMatch(/COMPLETE episode script/)
    expect(text).toMatch(/Output ONLY the revised script/)
  })

  test('route sends prompt / previous draft / feedback as three turns on a rewrite', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const gen = src.slice(src.indexOf('generate: async (feedback, previousDraft) => {'), src.indexOf('check: async (draftScript)'))
    expect(gen).toMatch(/\{ role: 'user', content: prompt \},\s*\{ role: 'assistant', content: previousDraft \},\s*\{ role: 'user', content: feedback \}/)
    expect(gen).toMatch(/messages: writerMessages/)
    expect(gen).toMatch(/raw: rawScript/)
  })
})

describe('WRITER-PROMPT-GATES-001: series prompt states the gates', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fn = src.slice(src.indexOf('function buildSeriesEpisodePrompt('), src.indexOf('\nfunction ', src.indexOf('function buildSeriesEpisodePrompt(') + 10))

  test('Belle intro must name series title, episode number and episode title', () => {
    expect(fn).toMatch(/MUST contain, word for word: the series title "\$\{belleSeriesName\}", the words "Episode \$\{currentEpisodeNumber\}", and the episode title/)
  })

  test('non-finale outro states reflection, companion and next-episode words that the matchers accept', () => {
    expect(fn).toMatch(/truth, secret, choice, question, cost, moment, revelation/)
    expect(fn).toMatch(/using "you" or "we"/)
    expect(fn).toMatch(/using the words "next episode"/)
    expect(fn).toMatch(/must NOT name the author/)
    // the contradicting old instruction is gone
    expect(fn).not.toMatch(/must restate the episode cliffhanger/)
  })

  test('the words the prompt names actually satisfy the Belle matchers', () => {
    const { hasEmotionalResidueOrReflection, hasCompanionPresence } = require('@/lib/belleValidation')
    const sample = 'The truth Cole found tonight has a cost, and you will feel it in the next episode.'
    expect(hasEmotionalResidueOrReflection(sample)).toBe(true)
    expect(hasCompanionPresence(sample)).toBe(true)
  })

  test('numbers must be words; the digit example is gone', () => {
    expect(fn).toMatch(/Write EVERY number as words in every spoken line/)
    expect(fn).not.toMatch(/3:12/)
  })

  test('length is stated in spoken words, not total words', () => {
    expect(fn).toMatch(/Length is measured in SPOKEN words/)
    expect(fn).toMatch(/Minimum: \$\{spokenTarget\.min/)
  })
})

describe('seriesSpokenWordTarget', () => {
  const floor = SCRIPT_RUNTIME_PREFLIGHT.MIN_ESTIMATED_MINUTES * SCRIPT_RUNTIME_PREFLIGHT.CALIBRATED_WPM

  test('15 min → 2400 spoken target, minimum at or above the 2000-word pre-spend floor', () => {
    const t = seriesSpokenWordTarget('15 min')
    expect(t.target).toBe(2400)
    expect(t.min).toBeGreaterThanOrEqual(floor)
    expect(t.min).toBe(2160)
    expect(t.max).toBe(2640)
  })

  test('short briefs never set a minimum below the floor', () => {
    expect(seriesSpokenWordTarget('10 min').min).toBe(floor)
    expect(seriesSpokenWordTarget('10 min').max).toBeGreaterThan(seriesSpokenWordTarget('10 min').target)
  })

  test('missing runtime defaults to 15 min', () => {
    expect(seriesSpokenWordTarget('').minutes).toBe(15)
  })
})
