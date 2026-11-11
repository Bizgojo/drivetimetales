import { buildStoryReadPrompt, geminiBlockingVerdict, geminiRewriteTarget, geminiReadBlocks, MAX_GEMINI_SCRIPT_REWRITES, type GeminiReadState } from '@/lib/geminiStoryRead'

// The real Don't Go Home read stored on Nov 10, 2026 (job 137c9c28): verdict "fix", two
// credibility issues, both voiced and published because the read was report-only.
const dontGoHome: GeminiReadState = {
  stage: 'script',
  at: '2026-11-10T16:07:35.560Z',
  model: 'gemini-flash-latest',
  fingerprint: '7:38ec6795',
  verdict: 'fix',
  questions: [
    { id: 'continuity', pass: true, issues: [] },
    { id: 'logic', pass: true, issues: [] },
    {
      id: 'credibility',
      pass: false,
      issues: [
        { episode: 1, line: 'BELLE B: ... But Maya has twenty-two texts — and a second phone.', problem: "Belle mentions 'a second phone' that is only found in Episode 2.", fix: 'Change the outro.' },
        { episode: 6, line: 'NARRATOR: The shift ended at three in the morning.', problem: 'Shift ends at 3:00 AM, then the clock reads 2:12 AM at home.', fix: 'Shift ends at one.' },
      ],
    },
  ],
}

describe('GEMINI-READ-BLOCK-001: the script read blocks voicing', () => {
  it('is on unless GEMINI_STORY_READ_BLOCK=off', () => {
    expect(geminiReadBlocks({})).toBe(true)
    expect(geminiReadBlocks({ GEMINI_STORY_READ_BLOCK: 'OFF' })).toBe(false)
    expect(MAX_GEMINI_SCRIPT_REWRITES).toBe(2)
  })

  it('PROOF: Don\'t Go Home would have stopped before voicing, rewriting from Episode 1', () => {
    const v = geminiBlockingVerdict(dontGoHome)
    expect(v.pass).toBe(false)
    expect(v.issues).toHaveLength(2)
    const t = geminiRewriteTarget(v)!
    expect(t.episodeNumber).toBe(1)
    expect(t.report).toContain('VALIDATOR RESULT: FAIL')
    expect(t.report).toContain('Episode 6: [credibility]')
    expect(t.report).toContain('Fix: Shift ends at one.')
  })

  it('problems in published (frozen) episodes are reported, never block', () => {
    const v = geminiBlockingVerdict(dontGoHome, new Set([1]))
    expect(v.issues.map((i) => i.episode)).toEqual([6])
    expect(v.frozenIssues).toBe(1)
    const allFrozen = geminiBlockingVerdict(dontGoHome, new Set([1, 6]))
    expect(allFrozen.pass).toBe(true)
    expect(geminiRewriteTarget(allFrozen)).toBeNull()
  })

  it('a pass, a skipped read or an errored read does not block', () => {
    expect(geminiBlockingVerdict({ ...dontGoHome, verdict: 'publish', questions: [{ id: 'logic', pass: true, issues: [] }] }).pass).toBe(true)
    expect(geminiBlockingVerdict({ stage: 'script', at: '', model: '', fingerprint: 'x', skipped: 'GEMINI_API_KEY not set' }).pass).toBe(true)
    expect(geminiBlockingVerdict({ stage: 'script', at: '', model: '', fingerprint: 'x', error: 'timeout' }).pass).toBe(true)
    expect(geminiBlockingVerdict(undefined).pass).toBe(true)
  })

  it('the credibility question names the two Rerouted errors Marc heard on Nov 11', () => {
    const p = buildStoryReadPrompt({ stage: 'script', seriesTitle: 'Rerouted', episodes: [{ episodeNumber: 1, title: 'One', body: 'x' }] })
    expect(p).toMatch(/give the originals to someone you trust/)
    expect(p).toMatch(/shielded cooler/)
  })
})
