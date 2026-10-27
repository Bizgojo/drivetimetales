import { readFileSync } from 'fs'
import { join } from 'path'
import { dramaUseCaseBonus, hasNonEnglishLabel, isUnsuitableAutoCastVoice } from '@/lib/castingVoiceFilter'

// CAST-VOICE-FIT-001 (job a21df7bd): FRANK got "Dr. Quibble - Nerdy Cartoon Scientist";
// GWENDOLYN got a Vietnamese-labelled voice.
describe('CAST-VOICE-FIT-001', () => {
  test('the two job a21df7bd picks are excluded', () => {
    expect(isUnsuitableAutoCastVoice({ name: 'Dr. Quibble - Nerdy Cartoon Scientist' })).toBe(true)
    expect(isUnsuitableAutoCastVoice({ name: 'Khánh Tư - Giọng kể chuyện và nhân vật' })).toBe(true)
    expect(isUnsuitableAutoCastVoice({ name: 'Smoke - The Dragon' })).toBe(true)
    expect(isUnsuitableAutoCastVoice({ name: 'Villain - Harsh, Abrasive, and Volatile' })).toBe(true)
  })
  test('ordinary drama voices stay in the pool, including accented Latin names and dashes', () => {
    for (const name of ['Julian - Authentic, Versatile & Grounded', 'Brian - Midwestern Voice', 'Grant – Composed and Direct', 'José - Warm Storyteller', 'Belle B – Warm & Empathetic Customer Voice', 'Leo v2 - Technical and Precise'])
      expect(isUnsuitableAutoCastVoice({ name })).toBe(false)
    expect(hasNonEnglishLabel('Zoë Renée')).toBe(false)
  })
  test('characters_animation no longer earns the character bonus', () => {
    expect(dramaUseCaseBonus('characters_animation')).toBe(0)
    expect(dramaUseCaseBonus('conversational')).toBe(5)
    expect(dramaUseCaseBonus('entertainment_tv')).toBe(4)
  })
  test('voice step applies the filter in scoring and the gender fallback', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(src).toMatch(/\.filter\(v => !isUnsuitableAutoCastVoice\(v\)\)/)
    expect(src).toMatch(/!isUnsuitableAutoCastVoice\(v\) &&\n\s*\(!meta\.gender/)
    expect(src).toMatch(/score \+= dramaUseCaseBonus\(labels\.use_case\)/)
  })
})
