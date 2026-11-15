import { listenerScenes, parseJsonReply, predictPrompt } from '@/lib/listenerRead'
const script = `TITLE: X
CHARACTER GUIDE
NORA: lead
[START AUDIO DRAMA SCRIPT]
ANNOUNCER: Belle intro line.
[SCENE: Ferry deck]
NARRATOR: She looked.
[SFX: Ferry horn]
NORA: Home.
<!-- note -->
[SCENE: The inn]
GABRIEL: You came back.
ANNOUNCER: Belle outro.`
describe('LISTENER-READ-001', () => {
  test('splits the episode into heard scenes, spoken lines only', () => {
    const s = listenerScenes(script)
    expect(s.map((x) => x.heading)).toEqual(['Ferry deck', 'The inn'])
    expect(s[0].text).toBe('NARRATOR: She looked.\nNORA: Home.')
    expect(s[1].text).toBe('GABRIEL: You came back.')
  })
  test('prompt shows only what was heard so far', () => {
    const s = listenerScenes(script)
    const p = predictPrompt({ seriesTitle: 'M', episodeNumber: 1, episodeTitle: 'T', earlier: '', soFar: s.slice(0, 1) })
    expect(p).toContain('She looked.')
    expect(p).not.toContain('You came back.')
  })
  test('reads JSON out of a reply', () => {
    expect(parseJsonReply<any>('Sure: {"a":1} done')).toEqual({ a: 1 })
    expect(parseJsonReply('no json')).toBeNull()
  })
})

describe('RETELL-TEST-001', () => {
  const { intendedPlanText, judgePrompt, listenerScenes: ls } = require('@/lib/listenerRead')
  test('finds this episode in the series plan', () => {
    expect(intendedPlanText({ full_episode_plan: [{ episode: 1, beats: 'A' }, { episode: 2, beats: 'B' }] }, 2)).toContain('"B"')
    expect(intendedPlanText({ description: 'desc' }, 3)).toBe('desc')
  })
  test('the judge sees retellings and the plan, and asks for line checks', () => {
    const p = judgePrompt({ seriesTitle: 'M', episodeNumber: 1, episodeTitle: 'T', scenes: ls(script), predictions: [], retells: [{ scene: 1, retell: 'She came home.', lost_track: '' }], intendedPlan: 'Nora returns.' })
    expect(p).toContain('listener retold "She came home."')
    expect(p).toContain('Nora returns.')
    expect(p).toContain('"problem_lines"')
    expect(p).toContain('lines_followable_share')
  })
})
