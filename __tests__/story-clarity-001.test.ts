import { castCheck, parseClarityReview, combineClarity, clarityReportText, readingMetrics, namedSpeakers } from '@/lib/storyClarity'
import { extractValidatorFixList } from '@/lib/seriesRewrite'

const script = (lines: string[]) => ['TITLE: X', 'CHARACTER GUIDE', '---', '---', '[START AUDIO DRAMA SCRIPT]', 'BELLE B: Welcome back.', ...lines].join('\n')

describe('STORY-CLARITY-001', () => {
  it('counts named speakers, not narrator or Belle', () => {
    expect(namedSpeakers(script(['NARRATOR: Night.', 'MAYA: Hi.', 'PARK: Hey.', 'MAYA: Go.'])).sort()).toEqual(['MAYA', 'PARK'])
  })

  it('fails more than 2 new named characters after Episode 1', () => {
    const s = script(['MAYA: a.', 'ANITA: b.', 'BRUNO: c.', 'CLARA: d.'])
    const r = castCheck(s, { totalEpisodes: 7, episodeNumber: 3, priorSpeakers: ['MAYA'] })
    expect(r.pass).toBe(false)
    expect(r.newSpeakers).toEqual(['ANITA', 'BRUNO', 'CLARA'])
  })

  it('treats name variants as the same character', () => {
    const r = castCheck(script(['DANIEL REYES: a.', 'RAE OKORO: b.']), { totalEpisodes: 7, episodeNumber: 2, priorSpeakers: ['DANIEL', 'RAE'] })
    expect(r.newSpeakers).toEqual([])
  })

  it('fails over the cast limit (4 for 3 episodes or fewer)', () => {
    const s = script(['ANITA: a.', 'BRUNO: b.', 'CLARA: c.', 'DEREK: d.', 'ELENA: e.'])
    expect(castCheck(s, { totalEpisodes: 1, episodeNumber: 1 }).pass).toBe(false)
    expect(castCheck(s, { totalEpisodes: 7, episodeNumber: 1 }).pass).toBe(true)
  })

  it('fails closed on unreadable reviewer output', () => {
    const r = parseClarityReview('sorry, I cannot', 2)
    expect(r.checks.some((c) => !c.pass)).toBe(true)
  })

  it('a failed check produces a validator-format FAIL the rewrite path can read', () => {
    const llm = parseClarityReview(JSON.stringify({ want: 'find brother', obstacle: 'Owen', stakes: 'she dies', checks: [
      { id: 'THREE-SENTENCE', pass: true, detail: 'ok' }, { id: 'GOAL-EARLY', pass: true, detail: 'ok' },
      { id: 'INSIDER-WORDS', pass: false, detail: 'HIPAA not explained', quotes: ['That is a HIPAA issue.'] },
      { id: 'SCENE-PURPOSE', pass: true, detail: 'ok' }, { id: 'RECAP-LINE', pass: true, detail: 'ok' }, { id: 'FOLLOW-BY-EAR', pass: true, detail: 'ok' },
    ] }), 2)
    const r = combineClarity(llm, castCheck(script(['MAYA: Hi.']), { totalEpisodes: 7, episodeNumber: 2, priorSpeakers: ['MAYA'] }), readingMetrics(script(['MAYA: Hi there.'])))
    expect(r.passed).toBe(false)
    const fix = extractValidatorFixList(clarityReportText(r))
    expect(fix).toMatch(/CLARITY INSIDER-WORDS/)
    expect(fix).toMatch(/HIPAA issue/)
  })

  it('recap line is not required for Episode 1', () => {
    const r = parseClarityReview(JSON.stringify({ checks: [{ id: 'RECAP-LINE', pass: false, detail: 'none' }] }), 1)
    expect(r.checks.find((c) => c.id === 'RECAP-LINE')?.pass).toBe(true)
  })

  it('reports a reading grade', () => {
    expect(readingMetrics(script(['MAYA: I see the car. It is red. We go now.'])).grade).toBeLessThan(5)
  })
})
