// Canonical Belle B voice — "Belle B – Warm Healthcare Support"
// Updated 2026-06-10 per Marc Postlewaite directive.
// Previous canonical (GMhgX8fCR9GUtd3kmlKC, "Belle # 1") moved to legacy.
export const CANONICAL_BELLE_B_VOICE_ID = 'wewocdDkjSLm9ZwjO7TD'

// Belle B is reserved for Endless Tales platform intro/outro/welcome audio only.
// Legacy Belle B IDs remain blocked so older cached rows cannot be selected as story voices.
export const LEGACY_BELLE_B_VOICE_IDS = [
  'GMhgX8fCR9GUtd3kmlKC', // was canonical ("Belle # 1") — superseded 2026-06-10
  'KWDD3Wyq30ZF5NEL01EJ',
  'EXAVITQu4vr4xnSDxMaL',
] as const

export const RESERVED_BELLE_B_VOICE_IDS = new Set<string>([
  CANONICAL_BELLE_B_VOICE_ID,
  ...LEGACY_BELLE_B_VOICE_IDS,
])

export function isBelleBVoiceId(voiceId?: string | null): boolean {
  return RESERVED_BELLE_B_VOICE_IDS.has(String(voiceId || '').trim())
}
