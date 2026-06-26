/**
 * Voice Provider Abstraction — Types
 *
 * Defines the provider-agnostic interface for all voice operations.
 * ElevenLabs is one implementation; swap by changing the factory in index.ts.
 */

// ---------------------------------------------------------------------------
// Structured error
// ---------------------------------------------------------------------------

export interface VoiceProviderError {
  /** Human-readable summary */
  message: string
  /** Structured error detail — always present on failure */
  error_json: {
    provider: string
    endpoint: string
    status_code: number | null
    response_body_summary: string
    retry_safe: boolean
    original_cause: string
  }
}

export class VoiceProviderException extends Error {
  public readonly error_json: VoiceProviderError['error_json']

  constructor(message: string, error_json: VoiceProviderError['error_json']) {
    super(message)
    this.name = 'VoiceProviderException'
    this.error_json = error_json
  }

  toJSON(): VoiceProviderError {
    return { message: this.message, error_json: this.error_json }
  }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface VoiceMeta {
  /** Provider-specific stable voice ID (e.g. ElevenLabs voice_id) */
  voice_id: string
  /** Human display name */
  name: string
  /** Category as returned by provider (e.g. "generated", "cloned", "premade") */
  category?: string
  /** Provider-attached labels / tags */
  labels?: Record<string, string>
  /** Optional description */
  description?: string
}

export interface VoicePreview {
  /**
   * Ephemeral ID returned from Voice Design.
   * Use this to create a permanent voice via createFromPreview().
   * Expires — do not cache for more than one session.
   */
  generated_voice_id: string
  /** Base64-encoded MP3 audio of the preview */
  audio_base64: string
  /** Optional description as echoed by provider */
  description?: string
}

export interface VoiceDesignSpec {
  /** Natural-language description of the voice to generate (20–1000 chars per EL spec) */
  voice_description: string
  /**
   * Optional preview text (100–1000 chars).
   * If omitted, provider may auto-generate or skip the preview audio.
   */
  preview_text?: string
  /** Model hint — provider maps to its own model identifiers */
  model?: 'standard' | 'turbo' | 'v3'
}

export interface VoiceSpec {
  /** Friendly name to store when creating a new voice */
  name: string
  /** Full voice description for Voice Design generation */
  voice_description: string
  /** Optional preview text passed to Voice Design */
  preview_text?: string
  /** Model preference */
  model?: 'standard' | 'turbo' | 'v3'
  /**
   * Extra labels to attach to the voice when creating it.
   * The provider will always add voice_code as a label for idempotent lookup.
   */
  labels?: Record<string, string>
}

export interface VoiceSynthSettings {
  /** Stability (0–1). Controls expressiveness vs. consistency. */
  stability?: number
  /** Similarity boost (0–1). How closely output mirrors voice sample. */
  similarity_boost?: number
  /** Style exaggeration (0–1). Currently EL-specific. */
  style?: number
  /** Speaker boost — may improve similarity at slight latency cost. */
  use_speaker_boost?: boolean
  /** Speed multiplier (0.25–4.0, EL-specific). 1.0 = normal. */
  speed?: number
  /** Provider-specific TTS model identifier. Falls back to provider default. */
  model_id?: string
}

export interface VoiceFilter {
  /** Filter to a specific category (e.g. "generated", "cloned", "premade") */
  category?: string
  /** Free-text search — behaviour depends on provider */
  search?: string
  /** Max results to return */
  limit?: number
}

// ---------------------------------------------------------------------------
// Dry-run result
// ---------------------------------------------------------------------------

export type DryRunOutcome =
  | 'found_in_registry'    // DB registry hit — no EL call needed
  | 'found_in_el_labels'   // EL label lookup hit — would return without creating
  | 'would_create'         // Not found anywhere — would call design+create
  | 'invalid_voice_code'   // Validation failure — would be blocked at preflight

export interface DryRunResult {
  dry_run: true
  voice_code: string
  outcome: DryRunOutcome
  existing_voice_id: string | null
  /** The request body that would have been sent to Voice Design — for inspection */
  would_send_design_request: Record<string, unknown> | null
  /** Validation error if outcome is invalid_voice_code */
  validation_error: string | null
  /** Human summary */
  summary: string
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface IVoiceProvider {
  readonly providerName: string

  /**
   * Generate TTS audio from an existing voice_id.
   * Returns raw MP3 buffer.
   */
  synthesize(
    voiceId: string,
    text: string,
    settings?: VoiceSynthSettings
  ): Promise<Buffer>

  /**
   * Idempotent: look up a voice by voice_code label; create via Voice Design if absent.
   *
   * voice_code is a stable, caller-defined key using the provisional AA-BB-CC-DD-EE-FF format.
   * The provider stores it as a label on the EL voice AND in the DB registry for fast future lookups.
   *
   * Flow:
   *   1. Parse + validate voice_code — fail fast with structured error if malformed
   *   2. Check DB registry (no EL API cost)
   *   3. If found in registry → return immediately
   *   4. List EL voices, find one where labels.voice_code === voice_code
   *   5. If found in EL → write registry, return
   *   6. Not found → designPreviews → createFromPreview → write registry
   *
   * @param voice_code  Structured voice identifier (AA-BB-CC-DD-EE-FF format)
   * @param spec        Voice spec for creation if not found
   * @param dryRun      When true: validates + checks lookup only, no credits spent
   */
  createOrFetchVoice(voice_code: string, spec: VoiceSpec, dryRun?: false): Promise<VoiceMeta>
  createOrFetchVoice(voice_code: string, spec: VoiceSpec, dryRun: true): Promise<DryRunResult>
  createOrFetchVoice(voice_code: string, spec: VoiceSpec, dryRun?: boolean): Promise<VoiceMeta | DryRunResult>

  /**
   * Generate Voice Design previews without persisting them.
   * Returns up to 3 previews with ephemeral generated_voice_id values.
   */
  designPreviews(spec: VoiceDesignSpec): Promise<VoicePreview[]>

  /**
   * Persist a Voice Design preview as a named, reusable voice.
   * generated_voice_id comes from a previous designPreviews() call.
   */
  createFromPreview(
    generated_voice_id: string,
    name: string,
    description: string,
    labels?: Record<string, string>
  ): Promise<VoiceMeta>

  /**
   * List voices available to this API key.
   */
  listVoices(filter?: VoiceFilter): Promise<VoiceMeta[]>
}
