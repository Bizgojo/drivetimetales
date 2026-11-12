import { belleOutroLooksCutOff } from '@/lib/belleOutroEnding'

// OUTRO-ENDING-002 (Nov 12 2026): real outros from Second Rise EP5 and Weekend Wife EP4.
describe('OUTRO-ENDING-002', () => {
  it('"her" and "his" can end a sentence', () => {
    expect(belleOutroLooksCutOff('the engagement is off and Sadie must decide what the cake — and Caleb — still mean to her')).toBe(false)
    expect(belleOutroLooksCutOff('Connor finally tells Jess the truth about what came before her')).toBe(false)
    expect(belleOutroLooksCutOff('the choice was his')).toBe(false)
  })
  it('real cut-offs still fail', () => {
    for (const t of ['In Episode Five of the', 'Sadie and', 'she runs toward', 'it hides its']) expect(belleOutroLooksCutOff(t)).toBe(true)
  })
})
