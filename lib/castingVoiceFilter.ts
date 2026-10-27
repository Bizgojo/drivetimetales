/**
 * CAST-VOICE-FIT-001 (job a21df7bd, 2026-10-27): auto-cast gave FRANK WAVERLY,
 * a quiet island handyman, "Dr. Quibble - Nerdy Cartoon Scientist", and an
 * English-speaking character in EP2 a Vietnamese-labelled voice ("Khánh Tư -
 * Giọng kể chuyện và nhân vật"). Both came from the character_voices pool.
 * These voices are never chosen by AUTO-cast for drama characters. An existing
 * story/series assignment is not affected.
 */
const NOVELTY_VOICE_RE = /\b(cartoon|cartoonish|nerdy|goofy|silly|squeaky|wacky|zany|dragon|villain|goblin|gremlin|ogre|troll|monster|wizard|witch|elf|alien|robot|robotic|android|anime|muppet|mascot|toon|chipmunk|demon|creature|pirate)\b/i

/** True when the voice name is labelled in a language other than English (letters outside Latin-1). */
export function hasNonEnglishLabel(name: string | null | undefined): boolean {
  const text = String(name || '')
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    // A letter beyond Latin-1 (e.g. Vietnamese ư, ạ). Punctuation such as an en dash is not a letter.
    if (text.charCodeAt(i) > 0xff && ch.toLowerCase() !== ch.toUpperCase()) return true
  }
  return false
}

export function isUnsuitableAutoCastVoice(voice: { name?: string | null; descriptive?: string | null }): boolean {
  const name = String(voice.name || '')
  if (NOVELTY_VOICE_RE.test(name) || NOVELTY_VOICE_RE.test(String(voice.descriptive || ''))) return true
  return hasNonEnglishLabel(name)
}

/**
 * Use-case bonus for drama casting. The old check `useCase.includes('character')`
 * also matched ElevenLabs' "characters_animation" category and so favoured
 * cartoon voices; animation voices now get no bonus.
 */
export function dramaUseCaseBonus(useCase: string | null | undefined): number {
  const u = String(useCase || '').toLowerCase()
  if (u.includes('animation')) return 0
  if (u.includes('character')) return 8
  if (u.includes('conversational')) return 5
  if (u.includes('entertainment')) return 4
  return 0
}
