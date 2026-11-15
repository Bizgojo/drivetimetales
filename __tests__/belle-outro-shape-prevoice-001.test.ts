describe('BELLE-OUTRO-SHAPE-PREVOICE-001', () => {
  const s = require('fs').readFileSync(require('path').join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('pre-voice repair also rewrites an outro with the wrong sentence count', () => {
    expect(s).toContain("const outroShapeIssue = (i: string) => /\\boutro must be exactly two sentences\\b/i.test(i)")
    expect(s).toContain('|| outroShapeIssue(i)))')
    expect(s).toContain('countWords(outroNow) > BELLE_OUTRO_MAX_WORDS || epIssues.some(outroShapeIssue)')
  })
  test('the issue text it matches is the one the gate writes', () => {
    const issue = 'non-finale outro must be exactly two sentences: one recap sentence, then the next episode by number (found 3)'
    expect(/\boutro must be exactly two sentences\b/i.test(issue)).toBe(true)
  })
})
