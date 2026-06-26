/**
 * Voice Provider Registry
 *
 * Factory entry point. Callers import from here — never from provider files directly.
 * Swap providers by changing the default or passing a different name.
 *
 * Usage:
 *   import { getVoiceProvider } from '@/lib/voice-providers'
 *   const provider = getVoiceProvider()
 *   const audio = await provider.synthesize(voiceId, text)
 *   const voice = await provider.createOrFetchVoice('narrator_quinn_v1', spec)
 */

import type { IVoiceProvider } from './types'
import { ElevenLabsProvider } from './elevenlabs'

export type VoiceProviderName = 'elevenlabs'

/** Singleton cache — one instance per provider name per process lifetime */
const _cache = new Map<string, IVoiceProvider>()

/**
 * Get a voice provider instance.
 *
 * @param name - Provider identifier. Currently only 'elevenlabs'.
 *               Defaults to process.env.VOICE_PROVIDER ?? 'elevenlabs'.
 * @param apiKey - Override the API key (defaults to env var for the provider).
 * @param singleton - Return a cached instance (default true). Pass false to get a fresh instance.
 */
export function getVoiceProvider(
  name?: VoiceProviderName,
  apiKey?: string,
  singleton = true
): IVoiceProvider {
  const resolvedName: VoiceProviderName =
    name ?? ((process.env.VOICE_PROVIDER as VoiceProviderName | undefined) ?? 'elevenlabs')

  const cacheKey = `${resolvedName}:${apiKey ?? '__default__'}`

  if (singleton && _cache.has(cacheKey)) {
    return _cache.get(cacheKey)!
  }

  let provider: IVoiceProvider

  switch (resolvedName) {
    case 'elevenlabs':
      provider = new ElevenLabsProvider(apiKey)
      break

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = resolvedName
      throw new Error(`Unknown voice provider: "${_exhaustive}"`)
    }
  }

  if (singleton) {
    _cache.set(cacheKey, provider)
  }

  return provider
}

// Re-export types for consumer convenience
export type {
  IVoiceProvider,
  VoiceMeta,
  VoicePreview,
  VoiceDesignSpec,
  VoiceSpec,
  VoiceSynthSettings,
  VoiceFilter,
  VoiceProviderError,
  DryRunResult,
  DryRunOutcome,
} from './types'
export { VoiceProviderException } from './types'
export { ElevenLabsProvider } from './elevenlabs'

// Voice code utilities
export {
  parseVoiceCode,
  assertVoiceCode,
  isValidVoiceCode,
  VOICE_CODE_SCHEMA_VERSION,
  VoiceCodeValidationError,
} from './voice-code'
export type { ParsedVoiceCode, VoiceCodeValidationResult } from './voice-code'

// Registry
export { VoiceCodeRegistry, getRegistry } from './registry'
export type { VoiceRegistryRow } from './registry'
