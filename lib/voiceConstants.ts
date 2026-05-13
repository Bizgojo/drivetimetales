export const CANONICAL_BELLE_B_VOICE_ID = 'GMhgX8fCR9GUtd3kmlKC'

// Belle B is reserved for Endless Tales platform intro/outro/welcome audio only.
// Legacy Belle B IDs remain blocked so older cached rows cannot be selected as story voices.
export const LEGACY_BELLE_B_VOICE_IDS = [
  'KWDD3Wyq30ZF5NEL01EJ',
  'wewocdDkjSLm9ZwjO7TD',
  'EXAVITQu4vr4xnSDxMaL',
] as const

export const RESERVED_BELLE_B_VOICE_IDS = new Set<string>([
  CANONICAL_BELLE_B_VOICE_ID,
  ...LEGACY_BELLE_B_VOICE_IDS,
])

export function isBelleBVoiceId(voiceId?: string | null): boolean {
  return RESERVED_BELLE_B_VOICE_IDS.has(String(voiceId || '').trim())
}
