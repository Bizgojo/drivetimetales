import { buildSeriesOutlinePrompt, buildOutlineEndingReviewPrompt } from '@/lib/seriesOutline'
import { onlyBelleOrDescriptionLengthBlockers } from '@/lib/scriptReadiness'
import { readFileSync } from 'fs'
import { join } from 'path'

const base = { title: 'Weekend Wife in Miami', premise: 'p', setting: 's', genre: 'romance', totalEpisodes: 7, requirements: '', maxMainCharacters: 5 }

describe('PLAN-INPUTS-001 episode briefs', () => {
  test('every episode brief goes to the planner, with the rule that named people must be plan characters', () => {
    const p = buildSeriesOutlinePrompt({ ...base, episodeBriefs: [
      { episodeNumber: 1, title: 'The Offer', premise: 'Connor offers Jess a fake marriage.' },
      { episodeNumber: 4, title: 'Uninvited', premise: "Connor's uncle Marcus arrives at the resort uninvited." },
    ] })
    expect(p).toContain('EPISODE BRIEFS (PLAN-INPUTS-001)')
    expect(p).toContain(`- Episode 4 "Uninvited": Connor's uncle Marcus arrives at the resort uninvited.`)
    expect(p).toMatch(/Every person they name must be a character in your plan \(relatives may share a surname, but each needs a different first name/)
  })
  test('no block for a single brief or none', () => {
    expect(buildSeriesOutlinePrompt({ ...base, episodeBriefs: [{ episodeNumber: 1, title: 'x', premise: 'y' }] })).not.toContain('EPISODE BRIEFS')
    expect(buildSeriesOutlinePrompt(base)).not.toContain('EPISODE BRIEFS')
  })
  test('run-next passes every episode brief', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain("episodeBriefs: episodes.map((ep: any) => ({ episodeNumber: episodeNumber(ep, 0), title: String(ep.brief_json?.title || ep.title || ''), premise: String(ep.brief_json?.premise || '') })),")
  })
})

describe('PLAN-LOAD-001 plan review', () => {
  test('the plan review also checks twists, open questions and introductions per episode', () => {
    const outline: any = { characters: [], threads: [{ id: 'T1', question: 'q', resolved_in: 7 }], episodes: Array.from({ length: 7 }, (_, i) => ({ episode: i + 1, goal: 'g', beats: ['b'], ends_on: 'e' })) }
    const p = buildOutlineEndingReviewPrompt(outline, 'Widow')
    expect(p).toMatch(/at most 2 major twists or reveals per episode/)
    expect(p).toMatch(/at most 3 story questions open/)
    expect(p).toMatch(/every named person is introduced by role/)
    expect(p).toMatch(/Report only clear breaks of rules 1 to 3/)
  })
})

describe('WRITER-LENGTH-REPAIR-001', () => {
  const intro = 'BELLE-CONTENT: voice step (intro): announcement is too long for a clean handoff (40 words; max 38 — cut at least 2) [current intro: x]'
  const desc = 'CARD-COPY: DESCRIPTION 119 characters (max 100)'
  const outro = 'BELLE-CONTENT: outro is too long (43 words; max 42) [current outro: x]'
  test('intro and description alone qualify (the Second Rise EP6 case)', () => {
    expect(onlyBelleOrDescriptionLengthBlockers([desc, intro])).toEqual({ ok: true, intro: true, outro: false, description: true })
  })
  test('any mix qualifies; anything else does not', () => {
    expect(onlyBelleOrDescriptionLengthBlockers([desc]).ok).toBe(true)
    expect(onlyBelleOrDescriptionLengthBlockers([outro, intro, desc]).ok).toBe(true)
    expect(onlyBelleOrDescriptionLengthBlockers([desc, 'RUNTIME-SERIES-MAX: 3100 spoken words']).ok).toBe(false)
    expect(onlyBelleOrDescriptionLengthBlockers([]).ok).toBe(false)
  })
  test('run-next repairs each line on its own and logs the intro call', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('const lengthOnly = onlyBelleOrDescriptionLengthBlockers(outroWriterBlockers)')
    expect(src).toContain('if (repairable && lengthOnly.intro) {')
    expect(src).toContain("purpose: 'writer-intro-shorten'")
    expect(src).toContain('const BELLE_INTRO_MAX_WORDS = 38')
  })
})
