import { keepExistingVoiceDecisions } from '@/lib/voiceSyncKeep'
import fs from 'fs'
import path from 'path'

describe('VOICE-SYNC-KEEP-001 the ElevenLabs sync keeps our voice decisions', () => {
  it('keeps labels we filled in where ElevenLabs has none', () => {
    expect(keepExistingVoiceDecisions({ gender: 'female', age: 'old', accent: 'southern' }, { gender: null, age: null, accent: null }))
      .toEqual({ gender: 'female', age: 'old', accent: 'southern' })
  })
  it('uses ElevenLabs labels when present', () => {
    expect(keepExistingVoiceDecisions({ gender: 'female', age: null, accent: null }, { gender: 'male', age: 'young', accent: 'british' }))
      .toEqual({ gender: 'male', age: 'young', accent: 'british' })
  })
  it('existing voices keep their eligibility; only new story voices start excluded', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/api/admin/sync-character-voices/route.ts'), 'utf8')
    expect(src).toMatch(/is_character_eligible: existing \? existing\.is_character_eligible !== false : useCase !== 'narrative_story'/)
    expect(src).toMatch(/select\('voice_id,is_character_eligible,gender,age,accent'\)/)
  })
})
