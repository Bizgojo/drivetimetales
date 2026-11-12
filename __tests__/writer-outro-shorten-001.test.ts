import { readFileSync } from 'fs'
import { join } from 'path'
import { onlyBelleOutroLengthBlockers, onlyOutroOrDescriptionLengthBlockers } from '@/lib/scriptReadiness'

// WRITER-OUTRO-SHORTEN-001 (Weekend Wife in Miami job a1058f05, Nov 11, 2026):
// three drafts failed only because the Belle outro was 52 words (max 42).
const real = [
  'BELLE-CONTENT: outro is too long (52 words; max 42) [current outro: BELLE B: Jess and Connor wrote vows ...]',
  'BELLE-CONTENT: voice step (outro): outro is too long for Belle (52 words; max 42 — cut at least 10) [current outro: BELLE B: ...]',
]

describe('WRITER-OUTRO-SHORTEN-001', () => {
  it('matches the exact blockers from the failed job', () => {
    expect(onlyBelleOutroLengthBlockers(real)).toBe(true)
    expect(onlyBelleOutroLengthBlockers([real[0]])).toBe(true)
  })

  it('never fires when anything else is wrong, or on nothing', () => {
    expect(onlyBelleOutroLengthBlockers([])).toBe(false)
    expect(onlyBelleOutroLengthBlockers([...real, 'CARD-COPY: DESCRIPTION 140 characters (max 100)'])).toBe(false)
    expect(onlyBelleOutroLengthBlockers(['BELLE-CONTENT: non-finale outro must be exactly two sentences: one recap sentence, then the next episode by number (found 3)'])).toBe(false)
    expect(onlyBelleOutroLengthBlockers(['BELLE-CONTENT: intro is too long (45 words; max 38)'])).toBe(false)
  })

  it('Widow EP3 (job 7bf52d9b): outro AND description too long together are both fixable', () => {
    const widow = ['CARD-COPY: DESCRIPTION 110 characters (max 100)', 'BELLE-CONTENT: outro is too long (43 words; max 42) [current outro: BELLE B: Nina ...]']
    expect(onlyOutroOrDescriptionLengthBlockers(widow)).toEqual({ ok: true, outro: true, description: true })
    expect(onlyOutroOrDescriptionLengthBlockers([real[0]])).toEqual({ ok: true, outro: true, description: false })
    // description alone stays with WRITER-DESC-SHORTEN-001; anything else blocks
    expect(onlyOutroOrDescriptionLengthBlockers(['CARD-COPY: DESCRIPTION 110 characters (max 100)']).ok).toBe(false)
    expect(onlyOutroOrDescriptionLengthBlockers([...widow, 'HOOK-GATE: first line has no hook']).ok).toBe(false)
  })

  it('run-next shortens only the outro and re-runs the same self-check before saving', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/check: \(writerSelfCheckFn = async \(draftScript: string\) =>/)
    expect(src).toMatch(/onlyOutroOrDescriptionLengthBlockers\(outroWriterBlockers\)/)
    expect(src).toMatch(/if \(lengthOnly\.description\) \{[\s\S]{0,300}shortenDescriptionToLimit/)
    expect(src).toMatch(/replaceBelleSection\(script, 'outro', shorter\)[\s\S]{0,900}await writerSelfCheckFn\(nextScript\)[\s\S]{0,200}if \(recheck\.ready/)
    expect(src).toMatch(/purpose: 'writer-outro-shorten'/)
    // the repair runs before the failure is recorded
    expect(src.indexOf('WRITER-OUTRO-SHORTEN-001 (Weekend Wife')).toBeLessThan(src.indexOf('still fails pre-save checks after'))
  })
})

// WRITER-SOFT-IGNORE-001 (Weekend Wife EP3 job 664ec981, Nov 11): description 101
// characters plus a soft STOCK-PHRASE note failed the episode.
import { onlyDescriptionLengthBlockers as descOnly, onlyOutroOrDescriptionLengthBlockers as outroOrDesc, isSoftBlockerLine } from '@/lib/scriptReadiness'
describe('WRITER-SOFT-IGNORE-001', () => {
  const ww = ['CARD-COPY: DESCRIPTION 101 characters (max 100)', 'STOCK-PHRASE: 1 line(s) use stock AI phrasing instead of the author\'s own voice']
  it('soft stock-phrase notes do not stop the one-line repairs', () => {
    expect(isSoftBlockerLine(ww[1])).toBe(true)
    expect(isSoftBlockerLine(ww[0])).toBe(false)
    expect(descOnly(ww)).toBe(true)
    expect(outroOrDesc(['BELLE-CONTENT: outro is too long (44 words; max 42)', ww[1]]).ok).toBe(true)
  })
  it('soft notes alone, or with a real problem, never trigger a repair', () => {
    expect(descOnly([ww[1]])).toBe(false)
    expect(descOnly([...ww, 'HOOK-GATE: no hook'])).toBe(false)
  })
})

// WRITER-OUTRO-FINAL-WORD-001 (Weekend Wife EP5 job 43257c97, Nov 11)
describe('WRITER-OUTRO-FINAL-WORD-001', () => {
  const ww5 = 'BELLE-CONTENT: voice step (outro): non-final series outro sounds final [current outro: BELLE B: ... Marcus makes his final move at the closing dinner.]'
  it('a final-sounding non-finale outro is repairable on its own and with length issues', () => {
    expect(outroOrDesc([ww5]).ok).toBe(true)
    expect(outroOrDesc([ww5, 'CARD-COPY: DESCRIPTION 104 characters (max 100)']).ok).toBe(true)
    expect(outroOrDesc([ww5, 'HOOK-GATE: no hook']).ok).toBe(false)
  })
  it('the repair loop also fixes banned final words and rejects a result that still has them', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/needsFix = \(t: string\) => countWords\(t\) > BELLE_OUTRO_MAX_WORDS - 2 \|\| \(nonFinale && NON_FINALE_FINAL_WORDS\.test\(t\)\)/)
    expect(src).toMatch(/!\(!selfCheckIsFinale && NON_FINALE_FINAL_WORDS\.test\(shorter\)\)/)
  })
})

// WRITER-OUTRO-SHORTEN-002 (Widow EP4 job 0fc90ff2, Nov 11): quotes in the series
// name broke the JSON reply, so the repair threw and never ran.
import { parseOutroReply } from '@/lib/belleOutroForward'
describe('WRITER-OUTRO-SHORTEN-002', () => {
  const want = 'Nina sent the voicemail to Keller. In Episode Five of "THE WIDOW WHO WATCHED," Celia finds a second policy.'
  it('reads the tag reply, valid JSON, and JSON with raw quotes', () => {
    expect(parseOutroReply(`<outro>${want}</outro>`)).toBe(want)
    expect(parseOutroReply(`Here it is:\n<outro>BELLE B: ${want}</outro>`)).toBe(want)
    expect(parseOutroReply(JSON.stringify({ outro: want }))).toBe(want)
    expect(parseOutroReply(`{"outro": "${want}"}`)).toBe(want)
    expect(parseOutroReply('nothing useful')).toBe('')
  })
  it('run-next asks for tags and records a failed repair in the job error', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/between <outro> and <\/outro> tags/)
    expect(src).toMatch(/const next = parseOutroReply\(/)
    expect(src).toMatch(/WRITER-OUTRO-SHORTEN-002: outro repair failed/)
  })
})

// WRITER-OUTRO-SHORTEN-003 (Second Rise EP5, job 073bbba5, Nov 12): replies cut off at 400 tokens.
describe('WRITER-OUTRO-SHORTEN-003', () => {
  it('reads a line after an unclosed <outro> tag', () => {
    expect(parseOutroReply('<outro>Emma told Caleb the truth. In Episode Six of "Second Rise," Sadie decides.\n(38 words')).toBe('Emma told Caleb the truth. In Episode Six of "Second Rise," Sadie decides.')
  })
  it('run-next gives the call room, asks for no counting aloud, and says why a repair was not accepted', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/max_tokens: 1200,\s*temperature: 0,\s*messages: \[\{ role: 'user', content: `This Belle B outro line/)
    expect(src).toMatch(/Count the words silently/)
    expect(src).toMatch(/WRITER-OUTRO-SHORTEN-003: shortened outro/)
    expect(src).toMatch(/WRITER-OUTRO-SHORTEN-003: outro repair returned/)
    expect(src).toMatch(/OUTRO-RECAP-NOT-SPOILER-001/)
  })
})
