import { readFileSync } from 'fs'
import { join } from 'path'
import { speakersMissingFromCharacterGuide, parseCharacterGuide } from '@/lib/characterGuide'
import { checkScriptReadiness, buildWriterRewriteFeedback } from '@/lib/scriptReadiness'

// CAST-GUIDE-001 (job a21df7bd EP3: FRANK spoke one line but was not in the
// CHARACTER GUIDE; voices stopped with character_description_missing).
const guide = [
  'CHARACTER GUIDE',
  '---',
  'WARREN COLLIER — late forties, male, North Carolina coastal accent',
  'LOUISA WAVERLY — early forties, female, soft coastal accent',
  'HARKER — mid-fifties, male, gruff island accent',
  'DEPUTY MARSH — early fifties, male, flat official tone',
  'MILES COLLIER — heard only on a recorded voice, mid-fifties, male',
  '',
  'BELLE B ANNOUNCEMENT',
  '---',
].join('\n')
const script = (extra: string) => `TITLE: The Last Crossing\nDESCRIPTION: A secret.\nNARRATOR: Cole Rafferty\n\n${guide}\nBELLE B: Hi.\n\n[START AUDIO DRAMA SCRIPT]\nNARRATOR: Night.\nWARREN: Tell me what Frank knew.\nLOUISA: He made those himself.\nMARSH: Step aside.\nMILES: Nobody will listen, Frank.\n${extra}`
const input = (s: string, requireCastGuide = true) => ({ script: s, storyType: 'series_episode', seriesId: 's', seriesTotalEpisodes: 3, episodeNumber: 3, briefMinutes: 15, requireCastGuide })

describe('CAST-GUIDE-001', () => {
  test('voice step imports and re-exports the moved functions', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(src).toContain("import { parseCharacterGuide, characterVoiceKeys, type CharacterInfo } from '@/lib/characterGuide'")
    expect(src).toContain('export { parseCharacterGuide, characterVoiceKeys }')
    expect(src).not.toMatch(/export function parseCharacterGuide/)
    expect(parseCharacterGuide(script('')).map((c) => c.name)).toEqual(['WARREN COLLIER', 'LOUISA WAVERLY', 'HARKER', 'DEPUTY MARSH', 'MILES COLLIER'])
  })
  test('first names and titles resolve to guide entries; FRANK does not', () => {
    expect(speakersMissingFromCharacterGuide(script(''), ['WARREN', 'LOUISA', 'MARSH', 'MILES', 'HARKER'])).toEqual([])
    expect(speakersMissingFromCharacterGuide(script(''), ['FRANK'])).toEqual(['FRANK'])
  })
  test('the job a21df7bd EP3 line is a writer blocker with plain feedback', () => {
    const r = checkScriptReadiness(input(script('FRANK: I have the ledger, Miles.')))
    const b = r.blockers.find((x) => x.gate === 'CHARACTER-GUIDE')
    expect(b?.evidence).toEqual(['FRANK'])
    expect(buildWriterRewriteFeedback(r, 15)).toMatch(/no line in the CHARACTER GUIDE.*FRANK/)
  })
  test('passes once FRANK is in the guide', () => {
    const fixed = script('FRANK: I have the ledger, Miles.').replace('HARKER — mid', 'FRANK WAVERLY — forties, male, heard on a recording\nHARKER — mid')
    expect(checkScriptReadiness(input(fixed)).blockers.find((x) => x.gate === 'CHARACTER-GUIDE')).toBeUndefined()
  })
  test('other callers (dispatch gate) are unchanged: warning, not blocker', () => {
    const r = checkScriptReadiness(input(script('FRANK: I have the ledger, Miles.'), false))
    expect(r.blockers.find((x) => x.gate === 'CHARACTER-GUIDE')).toBeUndefined()
  })
  test('series writer passes requireCastGuide', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toMatch(/briefMinutes: selfCheckBriefMinutes,\n\s*requireCastGuide: true,/)
  })
})
