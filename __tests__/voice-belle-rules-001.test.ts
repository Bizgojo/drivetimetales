/**
 * VOICE-BELLE-RULES-001 / WRITER-VOICE-BELLE-001 — job 60761b4a: the finale's
 * Belle lines passed the writer's checks, then generate-voices' own Belle line
 * rules flagged them, auto-replaced the outro with a template lacking the
 * narrator credit, and refused it (BELLE_POSTREPAIR_CONFORMANCE_FAILED).
 * The Belle text below is the finale's draft-1 copy, quoted in that job's record.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildBelleValidationContext, validateBelleLine } from '@/lib/voiceBelleRules'
import { buildWriterRewriteFeedback } from '@/lib/scriptReadiness'

const intro = 'The Toll at Marsh Crossing reaches its finale in Episode Three, "What the Bridge Kept" — where Nell Faraday sits alone in a lit booth with a dark car watching from the south end of the bridge, and the only weapon she has left is her voice.'
const ctx = buildBelleValidationContext(
  { title: 'What the Bridge Kept', author: 'Dex Carver', series_name: 'The Toll at Marsh Crossing', episode_number: 3, series_total_episodes: 3, series_is_finale: true },
  'TITLE: What the Bridge Kept\nNARRATOR: Cole Rafferty',
  'x',
)

describe('VOICE-BELLE-RULES-001', () => {
  test('the finale intro breaks the voice step\'s 38-word limit', () => {
    expect(ctx.episodeState).toBe('series_finale')
    expect(validateBelleLine('intro', intro, ctx)).toContain('announcement is too long for a clean handoff')
  })

  test('a finale outro without "Endless Tales" or the author fails the voice step', () => {
    const errs = validateBelleLine('outro', 'Nell Faraday paid the toll. So did everyone else.', ctx)
    expect(errs.join(' ')).toMatch(/credit the author/)
    expect(errs.join(' ')).toMatch(/Endless Tales/)
  })

  test('generate-voices imports the moved rules (one definition)', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(src).toContain("from '@/lib/voiceBelleRules'")
    expect(src).not.toMatch(/^function validateBelleLine\(/m)
    expect(src).not.toMatch(/^const BELLE_GENERIC_PATTERNS/m)
  })

  test('series writer runs validateBelleLine on both Belle lines', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const chk = src.slice(src.indexOf('check: async (draftScript) => {'), src.indexOf('} catch (err) {', src.indexOf('check: async (draftScript) => {')))
    expect(chk).toMatch(/validateBelleLine\(kind, text, voiceBelleCtx\)/)
    expect(chk).toMatch(/voice step \(\$\{kind\}\): \$\{e\}/)
  })

  test('feedback states the word limits', () => {
    const fb = buildWriterRewriteFeedback({ ready: false, warnings: [], metrics: { spokenWords: 3000, estimatedMins: 18 } as any, blockers: [{ gate: 'BELLE-CONTENT', detail: 'voice step (intro): announcement is too long for a clean handoff' }] } as any, 15)
    expect(fb).toMatch(/at most 38 words/)
  })
})
