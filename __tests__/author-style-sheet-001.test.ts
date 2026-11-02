/**
 * AUTHOR-STYLE-SHEET-001 (Marc 2026-11-01): every active pen-name author has a
 * detailed style sheet (incl. ending type) that reaches the writer.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUTHOR_STYLE_SHEETS } from '@/lib/authorStyleSheets.data'
import { styleSheetForAuthor, styleSheetProblems, styleSheetPromptLines } from '@/lib/authorStyleSheet'

const ACTIVE = readFileSync(join(__dirname, '../Bible/style-sheets/ACTIVE_AUTHORS.txt'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)

test('every active author has a complete sheet', () => {
  const missing = ACTIVE.filter((n) => !styleSheetForAuthor(n))
  expect(missing).toEqual([])
  for (const s of AUTHOR_STYLE_SHEETS) expect(styleSheetProblems(s)).toEqual([])
})

test('the prompt carries the ending type and both ending rules', () => {
  const lines = styleSheetPromptLines(styleSheetForAuthor('Elena Marsh')).join('\n')
  expect(lines).toContain('STYLE SHEET — Elena Marsh writes in the manner of Emily Henry')
  expect(lines).toMatch(/Ending type: .+\./)
  expect(lines).toContain('Final episode or standalone story:')
  expect(lines).toContain('must still end on a hard cliffhanger')
  expect(lines).toContain('Sample 1:')
})

test('lookup is by name, case-insensitive; unknown → null', () => {
  expect(styleSheetForAuthor('jesse crane')?.model).toMatch(/Elmore Leonard/)
  expect(styleSheetForAuthor('Nobody Atall')).toBeNull()
})

test('writer prompt uses the sheet and its summary replaces the old description', () => {
  const src = readFileSync(join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  expect(src).toContain('const sheetLines = styleSheetPromptLines(profile.style_sheet, { allowOpenEnding: openEndingAllowed(opts.endingSeed) })')
  expect(src).toContain('style_description: cleanAuthorStyleValue(sheet?.summary || (author as any).style_description)')
})

describe('ENDING-OPEN-001: open endings only occasionally', () => {
  const { isOpenEndingType, openEndingAllowed } = require('@/lib/authorStyleSheet')
  test('open-ending authors are recognized', () => {
    expect(isOpenEndingType(styleSheetForAuthor('J. Calloway Reid'))).toBe(true)
    expect(isOpenEndingType(styleSheetForAuthor('Elena Marsh'))).toBe(false)
  })
  test('about 1 story in 5 may end open; stable per id', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `story-${i}`)
    const share = ids.filter((id) => openEndingAllowed(id)).length / ids.length
    expect(share).toBeGreaterThan(0.15)
    expect(share).toBeLessThan(0.25)
    expect(openEndingAllowed('abc')).toBe(openEndingAllowed('abc'))
    expect(openEndingAllowed('')).toBe(false)
  })
  test('prompt says resolve unless this is an allowed one', () => {
    const sheet = styleSheetForAuthor('J. Calloway Reid')
    expect(styleSheetPromptLines(sheet).join('\n')).toContain('do NOT leave the listener hanging')
    expect(styleSheetPromptLines(sheet, { allowOpenEnding: true }).join('\n')).toContain('MAY end open')
    expect(styleSheetPromptLines(styleSheetForAuthor('Elena Marsh')).join('\n')).toContain('never leaves the listener hanging')
  })
  test('series decide once per series, standalones per job', () => {
    const src = readFileSync(join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain("{ endingSeed: String(job.series_id || job.id || '') }")
    expect(src).toContain("{ endingSeed: String(job.id || '') }")
  })
})

test('STYLE-001: an author without a complete style sheet is stopped', () => {
  const { authorStyleGaps } = require('@/lib/authorStyle')
  expect(authorStyleGaps({ name: 'Elena Marsh', style_reference: 'Emily Henry', style_description: 'x' })).toEqual([])
  expect(authorStyleGaps({ name: 'Brand New Author', style_reference: 'Someone', style_description: 'x' })).toEqual(['style sheet'])
  expect(authorStyleGaps({ name: 'Brand New Author', style_reference: 'Someone', style_description: 'x', style_sheet: styleSheetForAuthor('Elena Marsh') })).toEqual([])
})
