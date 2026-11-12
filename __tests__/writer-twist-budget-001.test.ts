import { readFileSync } from 'fs'
import { join } from 'path'
import { twistBudgetWriterBlock, buildClarityPrompt } from '@/lib/storyClarity'

// WRITER-TWIST-BUDGET-001 (canon 130/131; Second Rise EP2 job 35788bd4, Nov 11, 2026)
describe('WRITER-TWIST-BUDGET-001', () => {
  it('writer block states both canon limits', () => {
    const b = twistBudgetWriterBlock()
    expect(b).toMatch(/aim for ONE major twist or reveal/)
    expect(b).toMatch(/2 is the hard limit \(TWIST-BUDGET-SERIES-002\)/)
    expect(b).toMatch(/reveals written in this episode's plan are allowed/)
    expect(b).toMatch(/at most 3 story questions/)
    expect(b).toMatch(/decision, plan or condition is not a twist/)
  })

  it('series episode writer prompt includes the block', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    // SCENE-VOICES-001 sits between the twist budget and the user notes.
    expect(src).toMatch(/\$\{twistBudgetWriterBlock\(\)\}\n\n\$\{sceneVoicesWriterBlock\(\)\}\n\nUSER NOTES \/ CONSTRAINTS:/)
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

describe('TWIST-BUDGET-SERIES-002 (Marc, Nov 12, 2026, option A)', () => {
  const { combineClarity } = require('@/lib/storyClarity')
  const llm = (n: number) => ({ checks: [], threeSentences: null, twists: Array.from({ length: n }, (_, i) => `twist ${i + 1}`), openQuestions: [], emotions: [], announced: [] })
  const cast = { id: 'CAST', pass: true, detail: 'ok', speakers: [], newSpeakers: [] }
  const metrics = { grade: 5, avgSentenceWords: 10 }
  const twistCheck = (r: any) => r.checks.find((c: any) => c.id === 'TWIST-BUDGET')
  it('a series episode with 2 twists passes; 3 fails', () => {
    expect(twistCheck(combineClarity(llm(2), cast, metrics, { twistMax: 2 })).pass).toBe(true)
    expect(twistCheck(combineClarity(llm(3), cast, metrics, { twistMax: 2 })).pass).toBe(false)
  })
  it('default (standalone) still allows only 1', () => {
    expect(twistCheck(combineClarity(llm(2), cast, metrics)).pass).toBe(false)
    expect(twistCheck(combineClarity(llm(1), cast, metrics)).pass).toBe(true)
  })
})
