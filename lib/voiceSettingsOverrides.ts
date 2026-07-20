// ATL-VOICE-SETTINGS-001: Per-voice ElevenLabs settings overrides for
// generate-voices character rendering (Sunset Ep1 cast, Marc msg 3038).
//
// Lookup contract: exact ElevenLabs voice_id match → override settings;
// any other voice_id → the global EL_SETTINGS object passed by the caller,
// returned by reference (byte-identical serialization, zero behavior change
// for non-override voices).
//
// This map is shared so both the single-story and series voice-generation
// paths (both route through app/api/admin/generate-voices) resolve the same
// settings. Belle B intro generation (generate-belle-intro) has its own
// EL_SETTINGS constant and does NOT consult this map — her path is untouched.
//
// `speed` is included for override voices only: the generate-voices request
// builder JSON.stringifies the settings object as `voice_settings`, and the
// ElevenLabs API accepts `speed` there (precedent: generate-belle-intro
// already sends speed: 1.0). The global EL_SETTINGS remains speed-less.

export interface ElVoiceSettings {
  stability: number
  similarity_boost: number
  style: number
  use_speaker_boost: boolean
  speed?: number
}

export const VOICE_SETTINGS_OVERRIDES: Record<string, ElVoiceSettings> = {
  // Eve 1 — warm, unhurried, ancient. [Marc-approved v1]
  AXOPpokL7lng4OPc1L0P: { stability: 0.62, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true, speed: 0.95 },
  // Tom 1 — quiet intensity, worn, restrained; pleads better than he commands.
  // [Orion proposal v1, subject to Marc's after-listen adjustment]
  ecF3arP2KBwcy3FM5xRC: { stability: 0.55, similarity_boost: 0.80, style: 0.20, use_speaker_boost: true, speed: 0.97 },
  // Dana 1 — dry, direct, crisp, unhurried; a measurement, not a performance.
  // [Orion proposal v1, subject to Marc's after-listen adjustment]
  xRMpxegKwxAenIn6K3Hn: { stability: 0.68, similarity_boost: 0.80, style: 0.08, use_speaker_boost: true, speed: 1.00 },
  // Miriam Hale (Cass) — dry, husked, clinical restraint; tender underneath.
  // [Marc-approved full-sheet msg 3177, 2026-07-20 — Sunset Eps 2-4 casting]
  gOZRcEzY40chlRuMDmLV: { stability: 0.58, similarity_boost: 0.80, style: 0.18, use_speaker_boost: true, speed: 0.94 },
  // Lena Cho (Ophelia) — matte-flat, even, precise; discipline not coldness.
  // [Marc-approved full-sheet msg 3177, 2026-07-20 — Sunset Eps 2-4 casting]
  '1nFfPv6rPB37Tt2950M0': { stability: 0.70, similarity_boost: 0.80, style: 0.06, use_speaker_boost: true, speed: 0.98 },
}

/**
 * Resolve the ElevenLabs voice_settings for a given voice_id.
 * Exact voice_id match in VOICE_SETTINGS_OVERRIDES wins; otherwise the
 * provided global settings object is returned as-is (same reference).
 */
export function resolveVoiceSettings(voiceId: string, globalSettings: ElVoiceSettings): ElVoiceSettings {
  return VOICE_SETTINGS_OVERRIDES[voiceId] ?? globalSettings
}
