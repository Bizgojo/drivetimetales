import { buildClarityPrompt, parseClarityReview, sceneVoicesWriterBlock, SCENE_VOICES_MAX } from '@/lib/storyClarity'
import { readFileSync } from 'fs'
import { join } from 'path'

const allPass = (extra: any[] = []) => JSON.stringify({
  want: 'w', obstacle: 'o', stakes: 's', twists: [], open_questions: [],
  checks: ['THREE-SENTENCE', 'GOAL-EARLY', 'INSIDER-WORDS', 'SCENE-PURPOSE', 'RECAP-LINE', 'FOLLOW-BY-EAR'].map((id) => ({ id, pass: true, detail: 'ok' })).concat(extra),
})

describe('SCENE-VOICES-001', () => {
  test('the clarity reviewer is asked to count speakers per scene', () => {
    const p = buildClarityPrompt('NARRATOR: hi', { episodeNumber: 6, totalEpisodes: 7, seriesTitle: 'Weekend Wife in Miami' })
    expect(p).toContain('SCENE-VOICES')
    expect(p).toContain(`more than ${SCENE_VOICES_MAX} speaking characters`)
    expect(p).toContain('{"id":"SCENE-VOICES"')
  })
  test('a five-speaker scene fails the check', () => {
    const r = parseClarityReview(allPass([{ id: 'SCENE-VOICES', pass: false, detail: 'closing dinner: Marcus, Jess, Robert, Diane, Connor', quotes: ['DIANE HOLLIS: We ordered ahead'] }]), 6)
    const c = r.checks.find((x) => x.id === 'SCENE-VOICES')!
    expect(c.pass).toBe(false)
    expect(c.detail).toContain('closing dinner')
  })
  test('a missing answer fails closed', () => {
    const r = parseClarityReview(allPass(), 6)
    expect(r.checks.find((x) => x.id === 'SCENE-VOICES')?.pass).toBe(false)
  })
  test('the series writer is told the limit', () => {
    expect(sceneVoicesWriterBlock()).toContain(`At most ${SCENE_VOICES_MAX} characters SPEAK`)
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('${sceneVoicesWriterBlock()}')
  })
})
