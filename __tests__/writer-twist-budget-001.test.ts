import { readFileSync } from 'fs'
import { join } from 'path'
import { twistBudgetWriterBlock, buildClarityPrompt } from '@/lib/storyClarity'

// WRITER-TWIST-BUDGET-001 (canon 130/131; Second Rise EP2 job 35788bd4, Nov 11, 2026)
describe('WRITER-TWIST-BUDGET-001', () => {
  it('writer block states both canon limits', () => {
    const b = twistBudgetWriterBlock()
    expect(b).toMatch(/At most 1 major twist/)
    expect(b).toMatch(/at most 3 story questions/)
    expect(b).toMatch(/decision, plan or condition is not a twist/)
  })

  it('series episode writer prompt includes the block', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/\$\{twistBudgetWriterBlock\(\)\}\n\nUSER NOTES \/ CONSTRAINTS:/)
  })

  it('clarity reviewer is told what is NOT a twist', () => {
    const src = readFileSync(join(__dirname, '..', 'lib/storyClarity.ts'), 'utf8')
    expect(src).toMatch(/NOT a twist: a character's decision, plan, condition, request or bargain/)
    expect(src).toMatch(/background history about one relationship counts as ONE question/)
    expect(typeof buildClarityPrompt).toBe('function')
  })
})
