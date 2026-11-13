import { scenesWithSpeakers, sceneVoiceIssues } from '@/lib/countInCode'
import { combineClarity, parseClarityReview, castCheck, sceneVoicesWriterBlock, buildClarityPrompt } from '@/lib/storyClarity'
import { findUnlabeledStoryBodyLines } from '@/lib/scriptLabels'
import { parseScriptPositions } from '@/lib/scriptLineIndex'
import { timelineGaps, factsPromptLines, isTimelineFact } from '@/lib/seriesOutline'
import { isLineLevelIssue } from '@/lib/seriesPatch'

const script = `NARRATOR: Sage Wilder
CHARACTER GUIDE
---
X
---
[START AUDIO DRAMA SCRIPT]
[SCENE: Terrace, Saturday night]
NARRATOR: The terrace is loud.
MARCUS: Connor.
CONNOR: Uncle.
JESS: Hello.
DIANE: Is this family?
[SFX: Glass, set down on a table]
[SCENE: Suite, later that night]
JESS: We need to talk.
CONNOR: I know.`

describe('SCENE-MARKERS-001', () => {
  test('code counts speakers per scene (narrator does not count)', () => {
    const scenes = scenesWithSpeakers(script)!
    expect(scenes.map((s) => s.speakers.length)).toEqual([4, 2])
    const issues = sceneVoiceIssues(script, 3)!
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/^Scene 1 \(Terrace, Saturday night\) has 4 speaking characters \(limit 3\): "MARCUS: Connor\."/)
    expect(isLineLevelIssue({ episode: 4, problem: issues[0], fix: "" })).toBe(true) // quoted lines: fixed in place (item 146)
  })
  test('no markers means no code count (AI fallback stays)', () => {
    expect(sceneVoiceIssues(script.replace(/\[SCENE:[^\n]*\n/g, ''), 3)).toBeNull()
    expect(buildClarityPrompt('JESS: hi', { episodeNumber: 1, totalEpisodes: 3 })).toMatch(/7\. SCENE-VOICES: in every scene, count/)
    expect(buildClarityPrompt(script, { episodeNumber: 1, totalEpisodes: 3 })).toMatch(/7\. SCENE-VOICES: checked by code/)
  })
  test('the marker is silent: not an unlabeled line, not an audio position', () => {
    expect(findUnlabeledStoryBodyLines(script)).toEqual([])
    expect(parseScriptPositions(script).some((p) => /SCENE/.test(String(p.text || '')))).toBe(false)
  })
  test("code's count replaces the AI's SCENE-VOICES verdict", () => {
    const llm = parseClarityReview(JSON.stringify({ checks: ['THREE-SENTENCE', 'GOAL-EARLY', 'INSIDER-WORDS', 'SCENE-PURPOSE', 'RECAP-LINE', 'FOLLOW-BY-EAR', 'SCENE-VOICES'].map((id) => ({ id, pass: true, detail: '' })) }), 2)
    const r = combineClarity(llm, castCheck(script, { totalEpisodes: 7, episodeNumber: 2 }), { grade: 4, avgSentenceWords: 5 } as any, { script })
    expect(r.checks.find((c) => c.id === 'SCENE-VOICES')!.pass).toBe(false)
  })
  test('the writer is told to mark every scene', () => {
    expect(sceneVoicesWriterBlock()).toMatch(/start EVERY scene, including the first, with one line in exactly this form: \[SCENE: place, time\]/)
  })
})

describe('SERIES-TIMELINE-001', () => {
  const tl = (n: number, w = String(n)) => ({ fact: `Episode ${w} takes place on Friday, night.`, from_episode: n })
  test('code finds episodes with no timeline fact (digits or words)', () => {
    expect(timelineGaps([tl(1), tl(2, 'two'), { fact: 'Connor is 34.', from_episode: 1 }], 3)).toEqual([3])
    expect(isTimelineFact(tl(3, 'three'))).toBe(true)
  })
  test('every episode writer sees the whole timeline', () => {
    const lines = factsPromptLines({ characters: [], threads: [], episodes: [], facts: [tl(1), tl(3), { fact: 'Marcus is the heir.', from_episode: 3 }] } as any, 1)
    expect(lines.join('\n')).toMatch(/TIMELINE \(SERIES-TIMELINE-001\)[\s\S]*Episode 3 takes place/)
    expect(lines.join('\n')).toMatch(/Not yet known[\s\S]*Marcus is the heir/)
  })
})
