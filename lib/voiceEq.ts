/**
 * VOICE-EQ-001 / NICK-VOICE-001.
 *
 * Nick Brennan is a recurring hero. On 2026-10-28 Marc chose, by ear, the
 * voice he has in "Wrong Side of the River": narrator Vince Caulfield
 * (ElevenLabs qD9ofb9chWh4dfRCWMPx), who voices Nick in first person. That
 * voice now belongs to Nick: it is never auto-cast as any other character,
 * and its author (Jack Malone, whose narrator it is) is used only for
 * Nick Brennan stories (see lib/reservedTalent.ts). The earlier Thomas + bass
 * choice (2026-10-27) is withdrawn, so Thomas is a normal pool voice again
 * and no per-voice EQ is applied.
 *
 * VOICE_POST_EQ: per-voice ffmpeg filter applied before loudness
 * normalization (kept as a mechanism; currently empty).
 * RESERVED_HERO_VOICE_IDS: voices kept for a named recurring hero.
 */
export const THOMAS_VOICE_ID = '7OEIvzKJrvam9mL2bzhW'
export const NICK_BRENNAN_VOICE_ID = 'qD9ofb9chWh4dfRCWMPx'

export const VOICE_POST_EQ: Record<string, string> = {}

export const RESERVED_HERO_VOICE_IDS = new Set<string>([NICK_BRENNAN_VOICE_ID])

export function voicePostEqFilter(voiceId: string | null | undefined): string | null {
  return VOICE_POST_EQ[String(voiceId || '')] || null
}

export function isReservedHeroVoice(voiceId: string | null | undefined): boolean {
  return RESERVED_HERO_VOICE_IDS.has(String(voiceId || ''))
}
