import {
  buildCastReview,
  castReviewCaption,
  castReviewHeader,
  needsCastReview,
  labelMatchesCharacter,
  pickSampleLine,
  formatEpisodes,
} from '@/lib/castReview'
import { readFileSync } from 'fs'
import { join } from 'path'

const roster = [
  { canonical_name: 'ELIZA CALLAHAN', aliases: [], description: 'ELIZA CALLAHAN — twenty-six, female, sharp and self-contained', voice_id: 'v1', voice_name: 'Sienna - Natural and Bright' },
  { canonical_name: 'VIOLA MONROE', aliases: ['VIOLA'], description: 'VIOLA MONROE — forty-five, cultured Southern', voice_id: 'v2', voice_name: 'Diane – Assured and Smooth' },
  { canonical_name: 'HANNAH MONROE', aliases: [], description: 'never speaks', voice_id: 'v3', voice_name: 'Misha' },
  { canonical_name: 'DANA YORK', aliases: ['DANA', 'YORK'], description: 'DANA YORK — forties, detective', voice_id: 'v4', voice_name: 'Vexa – Bold' },
]
const episodes = [
  { episodeNumber: 1, script: 'TITLE: One\nNARRATOR: Rain.\nELIZA CALLAHAN: That means a lot to hear, Mr. Monroe. I feel the same way.\nVIOLA MONROE: Lunch is at one. The children eat at twelve thirty when they are home.\nBELLE B: Welcome back.' },
  { episodeNumber: 2, script: 'ELIZA: Where is the camera?\nVIOLA: Downstairs.\nSUNO PROMPT: dark strings' },
  { episodeNumber: 5, script: 'DANA: I am thirty-eight minutes out. Get to the boathouse and stay low. I am moving now.\nELIZA: Hurry.' },
]

describe('CAST-REVIEW-001 building the review', () => {
  const items = buildCastReview(roster, episodes)

  test('one item per speaking character, biggest parts first; silent characters left out', () => {
    expect(items.map((i) => i.name)).toEqual(['ELIZA CALLAHAN', 'VIOLA MONROE', 'DANA YORK'])
  })

  test('counts lines and episodes across label variants (full name, first name, alias)', () => {
    const eliza = items.find((i) => i.name === 'ELIZA CALLAHAN')!
    expect(eliza.lines).toBe(3)
    expect(eliza.episodes).toEqual([1, 2, 5])
    const viola = items.find((i) => i.name === 'VIOLA MONROE')!
    expect(viola.episodes).toEqual([1, 2])
  })

  test('picks a real line of 8–30 words for the audition', () => {
    expect(items.find((i) => i.name === 'DANA YORK')!.sampleLine).toMatch(/boathouse/)
    expect(pickSampleLine(['Hi.', 'This line has [SFX: door] a cue in it for sure ok'])).toBe('Hi.')
  })

  test('caption has number, name, voice, description, episodes and line count', () => {
    const c = castReviewCaption(items[0], 1)
    expect(c).toBe('1. ELIZA CALLAHAN — voice: Sienna\ntwenty-six, female, sharp and self-contained\nEpisodes 1–2, 5 · 3 lines')
    expect(castReviewHeader('The Nanny Cam', 3, 'Rex Drummond')).toMatch(/VOICES READY — The Nanny Cam/)
  })

  test('label matching', () => {
    expect(labelMatchesCharacter('YORK', roster[3])).toBe(true)
    expect(labelMatchesCharacter('MONROE', roster[1])).toBe(true)
    expect(labelMatchesCharacter('ELI', roster[0])).toBe(false)
    expect(formatEpisodes([3])).toBe('Episode 3')
  })
})

describe('CAST-REVIEW-001 gating', () => {
  const on = { CAST_REVIEW: 'on' }
  test('off unless CAST_REVIEW=on', () => {
    expect(needsCastReview({}, {})).toBe(false)
    expect(needsCastReview({}, on)).toBe(true)
  })
  test('not after approval', () => {
    expect(needsCastReview({ castReview: { approvedAt: '2026-10-29T15:00:00Z' } }, on)).toBe(false)
  })
  test('never pauses a series already recording', () => {
    expect(needsCastReview({ seriesVoiceGeneration: { presentCount: 12 } }, on)).toBe(false)
    expect(needsCastReview({ seriesVoiceGeneration: { progressByEpisode: { 1: {} } } }, on)).toBe(false)
  })
  test('run-next parks the job before recording and generate-voices has castOnly', () => {
    const rn = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const gate = rn.indexOf('if (needsCastReview(lockedJob.state_json))')
    const firstSegment = rn.indexOf('let result = await runSeriesVoiceSegment(batchJob, origin)')
    expect(gate).toBeGreaterThan(0)
    expect(gate).toBeLessThan(firstSegment)
    expect(rn).toMatch(/status: 'waiting_for_external'/)
    const gv = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(gv).toMatch(/if \(castOnly === true\)/)
    expect(gv.indexOf('if (castOnly === true)')).toBeLessThan(gv.indexOf('if (retryMissingOnly === true)'))
  })
})
