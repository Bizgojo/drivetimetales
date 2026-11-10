import { buildWriterRewriteFeedback, checkScriptReadiness } from '@/lib/scriptReadiness'
import { findSpokenTextIssues } from '@/lib/spokenTextChecks'

const issues = (line: string) => findSpokenTextIssues(`NARRATOR: Night.\nMAYA: ${line}\n`).filter((i) => i.check === 'CHAPTER-EPISODE')

describe('CANON-99 item 128: episode/chapter only when it points at the story', () => {
  it.each(['See you next episode.', 'Like I said in episode two, he lied.', 'This chapter of the story ends here.', 'Remember last episode?'])('flags: %s', (l) => {
    expect(issues(l)).toHaveLength(1)
  })
  it.each(['She had another episode last night.', 'That was a dark chapter of my life.', 'You fall asleep in chapter four every time.', 'The TV show had six episodes.'])('allows: %s', (l) => {
    expect(issues(l)).toHaveLength(0)
  })
})

describe('WRITER-SPOKEN-EVIDENCE-001', () => {
  it('quotes the exact offending line in the rewrite feedback', () => {
    const report = checkScriptReadiness({ script: 'TITLE: X\nNARRATOR: Calm night.\nMAYA: See you next episode.\n' })
    const fb = buildWriterRewriteFeedback(report)
    expect(fb).toMatch(/SPOKEN-TEXT:/)
    expect(fb).toMatch(/See you next episode/)
  })
})
