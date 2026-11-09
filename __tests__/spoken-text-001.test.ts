import { findSpokenTextIssues } from '@/lib/spokenTextChecks'

const wrap = (body: string) => `TITLE: T\n\nCHARACTER GUIDE\nDANIEL: lead\n\n[START AUDIO DRAMA SCRIPT]\nBELLE B: In Episode Two of "X," the episode begins.\n${body}`

describe('SPOKEN-TEXT-001', () => {
  test('same speaker continuing after a trailing dash is a split sentence', () => {
    const issues = findSpokenTextIssues(wrap('NARRATOR: He was the kind of man who could fill every room —\nNARRATOR: and empty it just as fast.'))
    expect(issues.map(i => i.check)).toContain('SPLIT-DASH')
  })
  test('a dash before another speaker is an interruption, not an issue', () => {
    expect(findSpokenTextIssues(wrap('DANIEL: Wait, I didn\'t —\nRAE: Stop. Just listen.'))).toEqual([])
  })
  test('the same line twice in a row is flagged', () => {
    const issues = findSpokenTextIssues(wrap('DANIEL: Where is she?\nRAE: Where is she?'))
    expect(issues.map(i => i.check)).toEqual(['REPEATED-LINE'])
  })
  test('characters saying chapter or episode are flagged; Belle is exempt', () => {
    const issues = findSpokenTextIssues(wrap('DANIEL: You fall asleep in chapter four every time.'))
    expect(issues.map(i => i.check)).toEqual(['CHAPTER-EPISODE'])
  })
})
