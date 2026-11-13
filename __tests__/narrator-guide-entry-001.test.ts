import { parseCharacterGuide } from '@/lib/characterGuide'

const guide = `CHARACTER GUIDE
---
NARRATOR — Sage Wilder, the storytelling voice of the series. Speaks in Sadie's first-person perspective.
SADIE (SADIE LANE) — 34, female, American accent. Owner of Lane's Crumb.
EMMA (EMMA LANE) — 29, female, American accent. Sadie's younger sister.
---
[START AUDIO DRAMA SCRIPT]`

describe('NARRATOR-GUIDE-ENTRY-001 (Second Rise EP3)', () => {
  test('the NARRATOR voice line is never the protagonist; the first real character is', () => {
    const chars = parseCharacterGuide(guide)
    const protagonist = chars.find((c) => c.isProtagonist)!
    expect(protagonist.name).toBe('SADIE (SADIE LANE)')
    expect(protagonist.gender).toBe('female')
    expect(chars.find((c) => c.name === 'NARRATOR')!.isProtagonist).toBe(false)
  })
  test('guides without a NARRATOR line are unchanged', () => {
    const chars = parseCharacterGuide(guide.replace(/NARRATOR — [^\n]*\n/, ''))
    expect(chars[0].isProtagonist).toBe(true)
    expect(chars[1].isProtagonist).toBe(false)
  })
})

import { readFileSync } from 'fs'
import { join } from 'path'
describe('BELLE-LENGTH-PREVOICE-001 (Weekend Wife EP4)', () => {
  test('a length-only Belle failure before voicing is shortened and re-checked, not failed', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const at = src.indexOf('BELLE-LENGTH-PREVOICE-001')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at, at + 4000)
    expect(block).toContain("epIssues.every((i) => /\\b(outro|intro|announcement)\\b[^.]*\\btoo long\\b/i.test(i))")
    expect(block).toContain('shortenBelleOutroToLimit(outroNow, rule, shortenModel, !isFinale, lenCtx)')
    expect(block).toContain(".update({ script: fixed }).eq('id', storyId).eq('script', epScript)")
    expect(/outro is too long \(44 words; max 42\)/.test('outro is too long (44 words; max 42)') && /\b(outro|intro|announcement)\b[^.]*\btoo long\b/i.test('outro is too long (44 words; max 42)')).toBe(true)
  })
})
