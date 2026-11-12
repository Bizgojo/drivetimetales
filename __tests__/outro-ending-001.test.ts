import { readFileSync } from 'fs'
import { join } from 'path'
import { belleOutroLooksCutOff } from '@/lib/belleOutroEnding'

const strip = (t: string) => t.replace(/[.!?]["'”’)]*$/g, '').trim()

describe('OUTRO-ENDING-001', () => {
  test('job d90fe3da EP3 outro ("far from over") is not cut off', () => {
    const outro = "That secret cost Vivian something real to say, and the question of what Harlow wants from Felix at that Monday meeting is one you and we cannot set aside. The truth of what that choice costs is waiting in the next episode — and the shop's story is far from over."
    expect(belleOutroLooksCutOff(strip(outro))).toBe(false)
  })
  test('natural adverb endings pass', () => {
    for (const t of ['The night closes in.', 'Some things stay behind.', 'She finally came through.', 'He kept looking around.', 'The dark waited outside.', 'It had happened before.'])
      expect(belleOutroLooksCutOff(strip(t))).toBe(false)
  })
  test('real cut-offs still fail', () => {
    for (const t of ['And the river keeps moving with.', 'The truth is waiting for the.', 'She reached for the door and.', 'It all comes down to.', 'Everything changes because of.'])
      expect(belleOutroLooksCutOff(strip(t))).toBe(true)
  })
  test('validateBelleText uses the shared rule', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/if \(belleOutroLooksCutOff\(withoutPunctuation\)\) \{\n\s*issues\.push\('outro appears cut off or incomplete\.'\)/)
  })
})

describe('OUTRO-ENDING-002: her/his can end a finished sentence', () => {
  it('passes the two outros that blocked Weekend Wife EP4 and Second Rise EP5 (Nov 12)', () => {
    expect(belleOutroLooksCutOff('In Episode Five of "Weekend Wife in Miami," Connor finally tells Jess the truth about what came before her')).toBe(false)
    expect(belleOutroLooksCutOff('Sadie must decide what the cake — and Caleb — still mean to her')).toBe(false)
    expect(belleOutroLooksCutOff('the choice is his')).toBe(false)
  })
  it('still catches real cut-offs', () => {
    expect(belleOutroLooksCutOff('Jess reaches for the')).toBe(true)
    expect(belleOutroLooksCutOff('and Connor turns to')).toBe(true)
    expect(belleOutroLooksCutOff('Sadie and')).toBe(true)
  })
})
