import { buildWriterRewriteFeedback, checkScriptReadiness } from '@/lib/scriptReadiness'

describe('WRITER-SPOKEN-EVIDENCE-001', () => {
  it('quotes the exact line that says "episode" in the rewrite feedback', () => {
    const report = checkScriptReadiness({ script: 'TITLE: X\nNARRATOR: Calm night.\nDR PATEL: She had another episode last night.\n' })
    const fb = buildWriterRewriteFeedback(report)
    expect(fb).toMatch(/SPOKEN-TEXT:/)
    expect(fb).toMatch(/She had another episode last night/)
  })
})
