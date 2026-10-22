/**
 * CREEK-CASTING-GAP-001: pipe-delimited CHARACTER GUIDE lines must parse.
 *
 * Ep2 guide used pipe format ("KATHERINE | female, 60s | ...") while
 * parseCharacterGuide only accepted em-dash/en-dash/hyphen/colon separators.
 * Every guide line failed nameMatch, availableGuideCharacters came back [],
 * and casting hard-gated with character_description_missing for
 * KATHERINE, BLYTHE, EARL. Ep1/Ep3 em-dash guides parsed fine.
 */

import {
  parseCharacterGuide,
  characterVoiceKeys,
  assignCharacterVoice,
  resolveVoiceForSpeaker,
} from '@/app/api/admin/generate-voices/route'

const PIPE_GUIDE_SCRIPT = `TITLE: Creek Test
NARRATOR: Ray Dolan

CHARACTER GUIDE
---
KATHERINE | female, 60s, Southern accent | warm but steely matriarch
BLYTHE | female, 30s | sharp, ambitious daughter
EARL | male, 70s | gravel-voiced elder

[START AUDIO DRAMA SCRIPT]
NARRATOR: The creek ran high that spring.
KATHERINE: We ain't leaving this land.
`

const EMDASH_GUIDE_SCRIPT = `TITLE: Creek Test
NARRATOR: Ray Dolan

CHARACTER GUIDE
---
KATHERINE — female, 60s, Southern accent, warm but steely matriarch
BLYTHE — female, 30s, sharp, ambitious daughter
EARL — male, 70s, gravel-voiced elder

[START AUDIO DRAMA SCRIPT]
NARRATOR: The creek ran high that spring.
KATHERINE: We ain't leaving this land.
`

describe('CREEK-CASTING-GAP-001 pipe-delimited CHARACTER GUIDE', () => {
  test('pipe guide parses all three speakers (was: zero, availableGuideCharacters=[])', () => {
    const chars = parseCharacterGuide(PIPE_GUIDE_SCRIPT)
    expect(chars.map(c => c.name)).toEqual(['KATHERINE', 'BLYTHE', 'EARL'])
  })

  test('pipe guide detects genders for casting', () => {
    const chars = parseCharacterGuide(PIPE_GUIDE_SCRIPT)
    const byName = Object.fromEntries(chars.map(c => [c.name, c.gender]))
    expect(byName['KATHERINE']).toBe('female')
    expect(byName['BLYTHE']).toBe('female')
    expect(byName['EARL']).toBe('male')
  })

  test('em-dash guide still parses (no regression for Ep1/Ep3 format)', () => {
    const chars = parseCharacterGuide(EMDASH_GUIDE_SCRIPT)
    expect(chars.map(c => c.name)).toEqual(['KATHERINE', 'BLYTHE', 'EARL'])
  })

  test('pipe guide speakers resolve to assigned voices (no character_description_missing)', () => {
    const chars = parseCharacterGuide(PIPE_GUIDE_SCRIPT)
    const voiceMap: Record<string, string> = {}
    chars.forEach((c, i) => assignCharacterVoice(voiceMap, c.name, `voice-${i}`))
    for (const speaker of ['KATHERINE', 'BLYTHE', 'EARL']) {
      expect(resolveVoiceForSpeaker(voiceMap, speaker)).toBeDefined()
    }
  })

  test('first-name speaker resolves against full-name guide entry and vice versa', () => {
    const voiceMap: Record<string, string> = {}
    assignCharacterVoice(voiceMap, 'Katherine Whitfield', 'voice-k')
    // First-name-only speaker label matches full guide name
    expect(resolveVoiceForSpeaker(voiceMap, 'KATHERINE')).toBe('voice-k')

    const voiceMap2: Record<string, string> = {}
    assignCharacterVoice(voiceMap2, 'KATHERINE', 'voice-k2')
    // Full-name speaker label matches first-name-only guide entry
    expect(resolveVoiceForSpeaker(voiceMap2, 'KATHERINE WHITFIELD')).toBe('voice-k2')
    expect(characterVoiceKeys('Katherine Whitfield')).toContain('KATHERINE')
  })
})
