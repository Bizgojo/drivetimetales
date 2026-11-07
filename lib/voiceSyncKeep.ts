/** VOICE-SYNC-KEEP-001 (Marc 2026-11-07): the ElevenLabs sync must not undo our voice decisions. */
/** VOICE-SYNC-KEEP-001: ElevenLabs labels win when present; otherwise keep ours. */
export function keepExistingVoiceDecisions(
  existing: { gender: string | null; age: string | null; accent: string | null } | undefined,
  fromElevenLabs: { gender: string | null; age: string | null; accent: string | null },
) {
  return {
    gender: fromElevenLabs.gender || existing?.gender || null,
    age: fromElevenLabs.age || existing?.age || null,
    accent: fromElevenLabs.accent || existing?.accent || null,
  }
}
