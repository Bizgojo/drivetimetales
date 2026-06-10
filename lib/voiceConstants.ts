// Canonical Belle B voice — "improved Belle voice" (Marc-selected May 2026)
// Reinstated 2026-06-10 per Work Order 001 Rev D (Section 0a).
// wewocdDkjSLm9ZwjO7TD was briefly set as canonical this session — REVERSED by this order.
export const CANONICAL_BELLE_B_VOICE_ID = 'GMhgX8fCR9GUtd3kmlKC'

// Belle B is reserved for Endless Tales platform intro/outro/welcome audio only.
// Legacy Belle B IDs remain blocked so older cached rows cannot be selected as story voices.
export const LEGACY_BELLE_B_VOICE_IDS = [
  'wewocdDkjSLm9ZwjO7TD', // RETIRED per Work Order 001 Rev D (old original)
  'KWDD3Wyq30ZF5NEL01EJ', // RETIRED — always wrong
  'EXAVITQu4vr4xnSDxMaL',
] as const

export const RESERVED_BELLE_B_VOICE_IDS = new Set<string>([
  CANONICAL_BELLE_B_VOICE_ID,
  ...LEGACY_BELLE_B_VOICE_IDS,
])

export function isBelleBVoiceId(voiceId?: string | null): boolean {
  return RESERVED_BELLE_B_VOICE_IDS.has(String(voiceId || '').trim())
}
