import { speakersMissingFromCharacterGuide, parseCharacterGuide } from '@/lib/characterGuide'
import { checkScriptReadiness, buildWriterRewriteFeedback } from '@/lib/scriptReadiness'

const mk = (g: string) => `TITLE: X\nCHARACTER GUIDE\n---\nCLARA — Clara Haines, 30s, female\n${g}\n---\n[START AUDIO DRAMA SCRIPT]\nWEAVER: Hello.`

describe('CAST-GUIDE-COMMA-001', () => {
  test.each([
    'Amos Weaver, telegraph clerk — 50s, male',
    'WEAVER — Amos Weaver, 50s, male telegraph clerk',
    'Amos Weaver — 50s, male',
    'MR. WEAVER — 50s male',
  ])('guide line %s covers speaker WEAVER', (g) => {
    expect(speakersMissingFromCharacterGuide(mk(g), ['WEAVER'])).toEqual([])
  })
  test('the comma form keeps the name only, and plain lines still parse', () => {
    const names = parseCharacterGuide(mk('Amos Weaver, telegraph clerk — 50s, male')).map((c) => c.name)
    expect(names).toEqual(['CLARA', 'Amos Weaver'])
  })
  test('a speaker truly missing is still caught, and the writer is told the exact line form', () => {
    const script = `TITLE: X\nCHARACTER GUIDE\n---\nCLARA — Clara Haines, 30s, female\n---\n[START AUDIO DRAMA SCRIPT]\nWEAVER: Hello.`
    expect(speakersMissingFromCharacterGuide(script, ['WEAVER'])).toEqual(['WEAVER'])
    const report = checkScriptReadiness({ script, requireCastGuide: true })
    const fb = buildWriterRewriteFeedback(report)
    if (report.blockers.some((b) => b.gate === 'CHARACTER-GUIDE')) expect(fb).toMatch(/INSIDE the CHARACTER GUIDE block .*"WEAVER — 50s, male/)
  })
})
