/**
 * CAST-GENDER-002 (2026-11-01, The Lake House Summer): gender from plain
 * words, and from every episode of a series.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { inferGender, seriesGenderHints } from '@/lib/characterGender'
import { parseCharacterGuide } from '@/lib/characterGuide'

describe('inferGender', () => {
  test.each([
    ['ALMA — Alma Cooper, late sixties, Southern American accent, retired schoolteacher, grandmother; precise and self-contained', 'female'],
    ['HOLDEN — Holden Cooper, sixteen years old, voice sounds young and unfinished, slight Northern flatness to his vowels; guarded', 'male'],
    ["ROBERT — Robert Morrow (voicemail only), early forties, Holden's father; warm on the recording", 'male'],
    ['SIDNEY — Sidney Wren, seventeen, local South Carolina accent, cheerful and relentless, works the dock', ''],
    ['SIDNEY — Sidney Wren, male, teenage, works the dock, talks too much', 'male'],
    ['MADELEINE — Madeleine Keller, early thirties, female, soft Charleston accent', 'female'],
    ['EARL — Earl Braddock, older, widowed, grieving his late wife, slow and plain-spoken; he rarely smiles', 'male'],
    ['CLARA — Clara Haines, widowed rancher; her husband died last spring; she holds the deed', 'female'],
    ['GRANT — a romance novelist and bar manager, he talks fast', 'male'],
    ["VICTORIA — the bride; high expectations; her warmth exists", 'female'],
  ])('%s → %s', (desc, want) => {
    expect(inferGender(desc)).toBe(want)
  })
  test('words that merely contain "man" are not male', () => {
    expect(inferGender('a romance manager from Germany')).toBe('')
  })
})

describe('series hints', () => {
  test('a later episode settles a character the first episode never gendered', () => {
    const ep1 = parseCharacterGuide('CHARACTER GUIDE\n---\nSIDNEY — Sidney Wren, seventeen, cheerful, works the dock\nALMA — Alma Cooper, grandmother\n---\n')
    const ep3 = parseCharacterGuide('CHARACTER GUIDE\n---\nSIDNEY — Sidney Wren, male, teenage, works the dock\nALMA — Alma Cooper, female, retired schoolteacher\n---\n')
    const hints = seriesGenderHints([ep1, ep3].map((g) => g.map((c) => ({ name: c.name, description: c.description }))))
    expect(hints).toEqual({ SIDNEY: 'male', ALMA: 'female' })
  })
})

test('casting uses the word rules and the series hints', () => {
  const gv = readFileSync(join(__dirname, '../app/api/admin/generate-voices/route.ts'), 'utf8')
  expect(gv).toContain('const gender = inferGender(description)')
  expect(gv).toContain('const seriesGender = genderHints[key]')
  expect(gv).not.toContain("d.includes('male') || d.includes('man')")
})
