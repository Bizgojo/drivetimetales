/**
 * ElevenLabs Provider — Constants
 *
 * All hard-coded EL values live here. Do not scatter magic strings.
 */

export const EL_BASE_URL = 'https://api.elevenlabs.io'

/** Header name for API key authentication */
export const EL_AUTH_HEADER = 'xi-api-key'

/**
 * Endpoints — verified against official EL docs 2026-06-26
 * Ref: https://elevenlabs.io/docs/api-reference/
 */
export const EL_ENDPOINTS = {
  /** POST /v1/text-to-speech/{voice_id} — returns audio binary */
  TTS: (voiceId: string) => `/v1/text-to-speech/${voiceId}`,

  /**
   * POST /v1/text-to-voice/design
   * Returns list of voice previews with generated_voice_id + base64 audio.
   */
  VOICE_DESIGN: '/v1/text-to-voice/design',

  /**
   * POST /v1/text-to-voice
   * Create a permanent voice from a generated_voice_id.
   * Requires: voice_name, voice_description, generated_voice_id
   */
  VOICE_CREATE: '/v1/text-to-voice',

  /**
   * GET /v2/voices — paginated, filterable
   * NOTE: /v1/voices still works but is deprecated. Use v2 for new code.
   * Discrepancy from existing codebase which uses /v1/voices.
   */
  VOICE_LIST: '/v2/voices',
} as const

/**
 * Voice Design model IDs per EL docs.
 * eleven_ttv_v3 supports audio tags and broader emotion range.
 */
export const EL_VOICE_DESIGN_MODELS = {
  standard: 'eleven_multilingual_ttv_v2',
  v3: 'eleven_ttv_v3',
} as const

export type ELVoiceDesignModelKey = keyof typeof EL_VOICE_DESIGN_MODELS

/**
 * Default TTS model for story production.
 * Matches the canonical setting in generate-voices/route.ts.
 */
export const EL_DEFAULT_TTS_MODEL = 'eleven_multilingual_v2'

/** Default voice settings matching current production values */
export const EL_DEFAULT_VOICE_SETTINGS = {
  stability: 0.49,
  similarity_boost: 0.51,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
} as const

/**
 * Label key used to store voice_code on ElevenLabs voices.
 * Enables idempotent createOrFetchVoice lookups.
 */
export const EL_VOICE_CODE_LABEL = 'voice_code'

/** HTTP status codes that are safe to retry without content changes */
export const EL_RETRY_SAFE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

/** Max page size for /v2/voices list requests */
export const EL_VOICE_LIST_PAGE_SIZE = 100
