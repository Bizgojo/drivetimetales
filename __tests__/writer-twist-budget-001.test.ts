import { readFileSync } from 'fs'
import { join } from 'path'
import { twistBudgetWriterBlock, buildClarityPrompt } from '@/lib/storyClarity'

// WRITER-TWIST-BUDGET-001 (canon 130/131; Second Rise EP2 job 35788bd4, Nov 11, 2026)
describe('WRITER-TWIST-BUDGET-001', () => {
  it('writer block states both canon limits', () => {
    const b = twistBudgetWriterBlock()
    expect(b).toMatch(/add at most 1 major twist/)
    expect(b).toMatch(/reveals written in this episode's plan are allowed/)
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

// TWIST-BUDGET-PLANNED-001 (Marc, Nov 11, 2026, option 1; canon 130 changed)
import { approvedEpisodePlanText } from '@/lib/storyClarity'
describe('TWIST-BUDGET-PLANNED-001', () => {
  const brief = { premise: 'Nina must escape the chapel.', description: 'The lab matches the sedative to Celia.', cliffhanger_or_resolution: 'The receipt is in the gallery safe.' }
  it('builds the approved plan text from the brief', () => {
    const t = approvedEpisodePlanText(brief)
    expect(t).toMatch(/Premise: Nina must escape/)
    expect(t).toMatch(/What happens: The lab matches the sedative to Celia/)
    expect(t).toMatch(/Ending: The receipt is in the gallery safe/)
    expect(approvedEpisodePlanText(null)).toBe('')
  })
  it('the reviewer is told planned reveals do not count', () => {
    const p = buildClarityPrompt('SCRIPT', { episodeNumber: 2, totalEpisodes: 7, seriesTitle: 'W', approvedPlan: approvedEpisodePlanText(brief) })
    expect(p).toMatch(/a twist or reveal that this plan calls for does NOT count/)
    expect(p).toMatch(/The lab matches the sedative to Celia/)
    expect(buildClarityPrompt('S', { episodeNumber: 2, totalEpisodes: 7 })).not.toMatch(/APPROVED EPISODE PLAN/)
  })
  it('run-next passes the approved plan to the clarity reviewer', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/approvedPlan: approvedEpisodePlanText\(episode\.brief_json\)/)
  })
})
