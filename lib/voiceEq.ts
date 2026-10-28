/**
 * VOICE-EQ-001 (Marc 2026-10-27 22:16 EDT): Nick Brennan, a recurring hero,
 * uses ElevenLabs voice "Thomas" with a bass lift that Marc approved by ear
 * (+8 dB low shelf at 110 Hz, then the normal loudness normalization).
 *
 * VOICE_POST_EQ: ffmpeg filter applied to every line of that voice, before
 * loudness normalization. RESERVED_HERO_VOICE_IDS: voices kept for a named
 * recurring hero; auto-cast never gives them to another character (the hero
 * gets the voice through an explicit story/series assignment).
 */
export const THOMAS_VOICE_ID = '7OEIvzKJrvam9mL2bzhW'

export const VOICE_POST_EQ: Record<string, string> = {
  [THOMAS_VOICE_ID]: 'bass=g=8:f=110',
}

export const RESERVED_HERO_VOICE_IDS = new Set<string>([THOMAS_VOICE_ID])

export function voicePostEqFilter(voiceId: string | null | undefined): string | null {
  return VOICE_POST_EQ[String(voiceId || '')] || null
}

export function isReservedHeroVoice(voiceId: string | null | undefined): boolean {
  return RESERVED_HERO_VOICE_IDS.has(String(voiceId || ''))
}
