import { readFileSync } from 'fs'
import { join } from 'path'
import { authorStyleGaps, authorImitationLines, findStockPhrases } from '@/lib/authorStyle'
import { checkScriptReadiness, buildWriterRewriteFeedback } from '@/lib/scriptReadiness'

describe('AUTHOR-STYLE-001', () => {
  test('an author needs both a real-author model and a style description', () => {
    expect(authorStyleGaps({ name: 'Jack Malone', style_reference: 'Lee Child', style_description: 'Stripped-down prose.' })).toEqual([])
    expect(authorStyleGaps({ name: 'Elena Marsh', style_reference: null, style_description: '' })).toEqual(['real-author model', 'style description'])
    expect(authorStyleGaps({ name: 'Kira Vance', style_reference: 'Becky Chambers', style_description: '' })).toEqual(['style description'])
    expect(authorStyleGaps(null)).toContain('author record')
  })

  test('the writer is told what to imitate and never to copy', () => {
    const lines = authorImitationLines('Elmore Leonard').join(' ')
    expect(lines).toMatch(/vocabulary/)
    expect(lines).toMatch(/sentence length and structure/)
    expect(lines).toMatch(/Never copy Elmore Leonard's actual sentences, plots, characters/)
  })

  test('stock phrases are found in spoken lines, not headers', () => {
    const script = [
      'TITLE: In That Moment',
      'NARRATOR: The silence stretched between them.',
      "CLARA: It wasn't just water, it was everything.",
      'NARRATOR: She let out a breath she didn\'t know she was holding.',
      'BUCK: Get the horses.',
    ].join('\n')
    const hits = findStockPhrases(script)
    expect(hits.map((h) => h.label)).toEqual(['the silence stretched', "it wasn't just X, it was Y", "a breath she didn't know she was holding"])
    expect(hits.some((h) => h.line.startsWith('TITLE'))).toBe(false)
  })

  test('readiness blocks stock phrasing only when asked, and quotes each line back', () => {
    const script = 'TITLE: Test\nNARRATOR: In that moment, everything changed.'
    expect(checkScriptReadiness({ script }).blockers.find((b) => b.gate === 'STOCK-PHRASE')).toBeUndefined()
    const report = checkScriptReadiness({ script, stockPhraseCheck: true })
    const b = report.blockers.find((x) => x.gate === 'STOCK-PHRASE')
    expect(b?.evidence?.[0]).toMatch(/\[in that moment\] NARRATOR: In that moment/)
    expect(buildWriterRewriteFeedback(report)).toMatch(/Rewrite each one in the assigned author's own voice/)
  })

  test('the series writer gates on the author row and runs the stock-phrase check', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const gate = src.indexOf('AUTHOR-STYLE-001: no episode is written without')
    const write = src.indexOf("purpose: 'series-episode-script'")
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(write)
    expect(src).toMatch(/stockPhraseCheck: true/)
    expect(src).toMatch(/lines\.push\(\.\.\.authorImitationLines\(styleReference\)\)/)
  })
})

describe('AUTHOR-STYLE-001 never stalls a story', () => {
  const { writeWithSelfCheck } = require('@/lib/scriptReadiness')
  const longBody = Array.from({ length: 10 }, () => 'NARRATOR: Clara walks the fence line.').join('\n')
  test('stock phrasing earns a rewrite; if it persists the story still goes ahead', async () => {
    let n = 0
    const result = await writeWithSelfCheck({
      generate: async () => { n += 1; return { script: `X${n}`, description: '' } },
      check: () => ({ ready: false, blockers: [{ gate: 'STOCK-PHRASE', detail: '1 line' }], warnings: [], metrics: { spokenWords: 100, estimatedMins: 15 } }),
      maxRewrites: 2,
    })
    expect(n).toBe(3)
    expect(result.ok).toBe(true)
  })
  test('a rewrite that breaks a hard gate falls back to the last draft that passed every hard gate', async () => {
    let n = 0
    const result = await writeWithSelfCheck({
      generate: async () => { n += 1; return { script: `draft${n}`, description: '' } },
      check: (s: string) => s === 'draft1'
        ? { ready: false, blockers: [{ gate: 'STOCK-PHRASE', detail: '1 line' }], warnings: [], metrics: { spokenWords: 100, estimatedMins: 15 } }
        : { ready: false, blockers: [{ gate: 'RUNTIME', detail: 'short' }], warnings: [], metrics: { spokenWords: 10, estimatedMins: 1 } },
      maxRewrites: 1,
    })
    expect(result.script).toBe('draft1')
    expect(result.ok).toBe(true)
    void longBody
  })
})
