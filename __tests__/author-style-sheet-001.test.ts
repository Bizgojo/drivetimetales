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
  expect(src).toContain('const sheetLines = styleSheetPromptLines(profile.style_sheet)')
  expect(src).toContain('style_description: cleanAuthorStyleValue(sheet?.summary || (author as any).style_description)')
})
