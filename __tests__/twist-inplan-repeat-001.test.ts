import { readFileSync } from 'fs'
import { join } from 'path'
import { parseClarityReview, buildClarityPrompt } from '@/lib/storyClarity'
import { removeSameSpeakerRepeats, findSpokenTextIssues } from '@/lib/spokenTextChecks'

const checks = ['THREE-SENTENCE', 'GOAL-EARLY', 'INSIDER-WORDS', 'SCENE-PURPOSE', 'RECAP-LINE', 'FOLLOW-BY-EAR'].map((id) => ({ id, pass: true, detail: '' }))

// TWIST-INPLAN-001 (Weekend Wife EP5, job 2dd15768, Nov 11 2026)
describe('TWIST-INPLAN-001', () => {
  it('twists the plan calls for do not count; plain strings still do', () => {
    const r = parseClarityReview(JSON.stringify({ checks, twists: [{ quote: "Connor's father's dying words", in_plan: true }, { quote: 'Connor offers the money unconditionally', in_plan: false }] }), 5)
    expect(r.twists).toEqual(['Connor offers the money unconditionally'])
    expect(parseClarityReview(JSON.stringify({ checks, twists: ['a', 'b'] }), 5).twists).toEqual(['a', 'b'])
  })
  it('the prompt asks for in_plan only when a plan is given', () => {
    expect(buildClarityPrompt('x', { episodeNumber: 5, totalEpisodes: 7, approvedPlan: 'Premise: p' })).toContain('"in_plan"')
    expect(buildClarityPrompt('x', { episodeNumber: 5, totalEpisodes: 7 })).not.toContain('"in_plan"')
  })
})

// SPOKEN-REPEAT-REPAIR-001 (Second Rise EP6, job 23d10ad9, Nov 11 2026)
describe('SPOKEN-REPEAT-REPAIR-001', () => {
  const wrap = (body: string) => `TITLE: T\n[START AUDIO DRAMA SCRIPT]\n${body}\n`
  it('removes a same-speaker duplicate so the check passes', () => {
    const s = wrap('SADIE: I kept the card.\nSADIE: I kept the card.\nCALEB: Good.')
    const fixed = removeSameSpeakerRepeats(s)
    expect(fixed.removed).toBe(1)
    expect(findSpokenTextIssues(fixed.script)).toEqual([])
    expect(fixed.script.match(/I kept the card/g)?.length).toBe(1)
  })
  it('leaves an echo by another speaker alone', () => {
    const s = wrap('DANIEL: Where is she?\nRAE: Where is she?')
    expect(removeSameSpeakerRepeats(s)).toEqual({ script: s, removed: 0 })
  })
  it('run-next repairs only when the repeat is the only hard blocker', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/removeSameSpeakerRepeats\(script\)[\s\S]{0,200}await writerSelfCheckFn\(fixed\.script\)/)
  })
})
