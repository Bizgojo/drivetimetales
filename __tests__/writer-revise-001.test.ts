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
    expect(gen).toMatch(/raw: (spellOutSpokenNumerals\()?normalizeScriptFormat\(rawScript\)\.script/)
  })
})

describe('WRITER-PROMPT-GATES-001: series prompt states the gates', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const fn = src.slice(src.indexOf('function buildSeriesEpisodePrompt('), src.indexOf('\nfunction ', src.indexOf('function buildSeriesEpisodePrompt(') + 10))

  test('Belle intro must name series title, episode number and episode title', () => {
    expect(fn).toMatch(/MUST contain, word for word: the series title "\$\{belleSeriesName\}", the words "Episode \$\{currentEpisodeNumber\}", and \$\{belleEpisodeTitleRef\} in quotes/)
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

describe('WRITER-NUMERAL-EVIDENCE-001: numeral feedback quotes the offending lines', () => {
  const script = [
    'TITLE: The Coins',
    'NARRATOR: Cole Rafferty',
    'BELLE B: Episode 2 of The Toll.',
    '[START AUDIO DRAMA SCRIPT]',
    'NARRATOR: The receipt read transaction 001, then 002.',
    'JUNE: Lane 3 is closed.',
    'NARRATOR: She waited.',
  ].join('\n')
  const report = checkScriptReadiness({ script, storyType: 'series_episode', seriesId: 's', seriesTotalEpisodes: 3, episodeNumber: 2 })
  const numeral = report.blockers.find((b) => b.gate === 'NUMERAL-PRETTS')

  test('blocker carries each offending line with its digits', () => {
    expect(numeral?.evidence).toEqual([
      'NARRATOR: The receipt read transaction 001, then 002.  ← digits: 001, 002',
      'JUNE: Lane 3 is closed.  ← digits: 3',
    ])
  })

  test('rewrite feedback quotes those lines and says how to spell codes', () => {
    const text = buildWriterRewriteFeedback(report, 15)
    expect(text).toMatch(/"001" → "zero zero one"/)
    expect(text).toContain('NARRATOR: The receipt read transaction 001, then 002.')
    expect(text).toContain('JUNE: Lane 3 is closed.')
    // the Belle "Episode 2" passthrough is not reported
    expect(text).not.toContain('BELLE B: Episode 2')
  })
})

describe('WRITER-BELLE-EVIDENCE-001: Belle failures quote the current Belle line', () => {
  const report = {
    ready: false,
    warnings: [],
    metrics: notReady().metrics,
    blockers: [{ gate: 'BELLE-CONTENT', detail: 'outro appears cut off or incomplete.', evidence: ['current outro: BELLE B: And the river keeps moving on.'] }],
  }

  test('feedback quotes the outro and explains the cut-off rule', () => {
    const text = buildWriterRewriteFeedback(report as any, 15)
    expect(text).toContain('current outro: BELLE B: And the river keeps moving on.')
    expect(text).toMatch(/must finish the thought, not a word that needs more after it, such as of, to, the/)
  })

  test('attempt record (and so the failure message) carries the quoted line', async () => {
    const r = await writeWithSelfCheck({
      generate: async () => ({ script: 's', description: 'd' }),
      check: () => report as any,
      maxRewrites: 0,
    })
    expect(r.attempts[0].blockers[0]).toContain('[current outro: BELLE B: And the river keeps moving on.]')
  })

  test('route attaches the current intro/outro to BELLE-CONTENT blockers', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain("evidence: [`current ${isOutro ? 'outro' : 'intro'}: BELLE B: ${current}`]")
  })
})

describe('WRITER-PUBLISH-BELLE-001: writer runs the deterministic publish Belle gate', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const chk = src.slice(src.indexOf('check: async (draftScript) => {'), src.indexOf('} catch (err) {', src.indexOf('check: async (draftScript) => {')))

  test('check closure calls evaluateBelleCopyForPublish and merges its blockers', () => {
    expect(chk).toMatch(/evaluateBelleCopyForPublish\(\{/)
    expect(chk).toMatch(/for \(const b of publishVerdict\.blockers\) if \(!belleIssues\.includes\(b\)\) belleIssues\.push\(b\)/)
  })

  test('saved EP2 intro (job f77a0696) is refused by the publish gate the voice step uses', () => {
    const { evaluateBelleCopyForPublish } = require('@/lib/publicationBelleGate')
    const intro = 'In The Toll at Marsh Crossing, Episode 2, "The Thread Pulls Back" — Nell Faraday turned in those coins and wrote down every detail. Now the coins are gone, and a sergeant with careful eyes wants to know exactly how much she remembers.'
    const outro = "The secret under that bridge has Nell Faraday's father's name on it — and that revelation is going to cost her something she can't give back. You've been following every thread right alongside her, and the next episode is where it all pulls tight."
    const script = `TITLE: The Thread Pulls Back\nNARRATOR: Cole Rafferty\n\nBELLE B ANNOUNCEMENT\n---\nBELLE B: ${intro}\n\n[START AUDIO DRAMA SCRIPT]\nNARRATOR: x.\n\nBELLE B OUTRO\n---\nBELLE B: ${outro}\n`
    const v = evaluateBelleCopyForPublish({ id: 'x', title: 'The Thread Pulls Back', author: 'Dex Carver', script, series_id: 's', series_name: 'The Toll at Marsh Crossing', episode_number: 2, series_is_finale: false })
    expect(v.ok).toBe(false)
    expect(v.blockers).toContain('intro must include a concrete narrative hook (event, danger, secret, conflict, mystery, or story mechanism)')
  })

  test('hook failures get a plain-words hint in the rewrite feedback', () => {
    const text = buildWriterRewriteFeedback({ ready: false, warnings: [], metrics: notReady().metrics, blockers: [{ gate: 'BELLE-CONTENT', detail: 'intro must include a concrete narrative hook (event, danger, secret, conflict, mystery, or story mechanism)' }] } as any, 15)
    expect(text).toMatch(/concrete danger, secret, mystery, or impossible event/)
  })
})
