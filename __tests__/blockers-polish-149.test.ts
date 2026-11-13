import { classifyIssueText, isPolishCardCopyIssue, isPolishOnlyReport, POLISH_ONLY_MARK, MAX_SERIES_BLOCKER_READS } from '@/lib/issueClass'
import { geminiBlockingVerdict } from '@/lib/geminiStoryRead'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('BLOCKERS-POLISH-001 classification (real Nov 13 findings)', () => {
  test('polish', () => {
    for (const t of [
      '[SFX] Decorative SFX cue violates the SFX rule. The cue `[SFX: Room tone, quiet house]` appears during stillness.',
      '[SFX: Glass, set down on a table] placed between the narrator line and "SADIE: Why?" — no glass action is described in the story.',
      '[TENSE] "no contract covered" is a past-tense construction.',
      'Past-tense banned words check: "broke" — this is past tense.',
      '[OPENING] Question 3 cannot be answered by minute 3.',
      'CLARITY TWIST-BUDGET: 3 major twists in one episode (max 2).',
      'CLARITY SCENE-VOICES: Scene 1 has 4 speaking characters (limit 3).',
      'CLARITY READING-LEVEL: reads at grade 8.',
    ]) expect([t, classifyIssueText(t)]).toEqual([t, 'polish'])
  })
  test('blockers', () => {
    for (const t of [
      '[CONTINUITY] Connor says six weeks; episode 1 says nine days.',
      '[SPOILER] BELLE B ANNOUNCEMENT reveals the culprit.',
      '[ENDING] The episode ends settled, with no cliffhanger.',
      '[PROTAGONIST] DESCRIPTION says driver; the protagonist is a guard.',
      '[logic] "Last week, I sat in the back pew" — contradicts the immediate continuation.',
      '[credibility] Belle describes the lease as signed; it was not.',
      'CLARITY FOLLOW-BY-EAR: a listener cannot tell who is speaking.',
      'Something odd that matches nothing.',
    ]) expect([t, classifyIssueText(t)]).toEqual([t, 'blocker'])
    expect(classifyIssueText('[easy_listening] four voices in one scene')).toBe('polish')
  })
  test('card copy: only the past-tense word check is polish', () => {
    expect(isPolishCardCopyIssue('DESCRIPTION contains forbidden past-tense story-card phrasing.')).toBe(true)
    expect(isPolishCardCopyIssue('DESCRIPTION must be 100 characters or fewer')).toBe(false)
    expect(isPolishOnlyReport(`x\n${POLISH_ONLY_MARK} — fix`)).toBe(true)
  })
  test('the Gemini read never blocks on easy_listening', () => {
    const read: any = { verdict: 'fix', questions: [
      { id: 'easy_listening', pass: false, issues: [{ episode: 5, line: 'ABRAM: x', problem: 'four voices', fix: '' }] },
      { id: 'logic', pass: true, issues: [] },
    ] }
    expect(geminiBlockingVerdict(read).pass).toBe(true)
  })
})

describe('BLOCKERS-POLISH-001 wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('episode check: blockers fail, polish is fixed once then accepted', () => {
    expect(src).toContain("const polishAlreadyFixed = Boolean((episode.script_json as any)?.polish_fixed)")
    expect(src).toContain('TAG EVERY FAIL BULLET (BLOCKERS-POLISH-001)')
    expect(src).toContain('if (noLlmBlockers && String(episode.status) !== \'published\'')
  })
  test('polish never reaches the rewrite', () => {
    const polishAt = src.indexOf('if (polishOnlyFailure && result.episodeResult?.storyId) {')
    expect(polishAt).toBeGreaterThan(0)
    expect(polishAt).toBeLessThan(src.indexOf('SERIES-REWRITE-001: a story-content failure re-writes the failed'))
  })
  test('hard stop after the third series read with blockers, for both reads', () => {
    expect(MAX_SERIES_BLOCKER_READS).toBe(3)
    expect(src.match(/const hardStop = blockerReads >= MAX_SERIES_BLOCKER_READS$/gm)?.length).toBe(2)
    expect(src).toContain('seriesReadIssues: hardStop ? [] :')
    expect(src).toContain("marc_required: true, autonomous_repair: false")
  })
})
