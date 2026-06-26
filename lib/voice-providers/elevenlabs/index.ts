/**
 * ElevenLabs Voice Provider
 *
 * Implements IVoiceProvider using the official ElevenLabs REST API.
 * All API calls are made with raw fetch — no SDK dependency required.
 *
 * Endpoint reference (verified 2026-06-26):
 *   TTS:          POST /v1/text-to-speech/{voice_id}
 *   Voice Design: POST /v1/text-to-voice/design
 *   Voice Create: POST /v1/text-to-voice
 *   Voice List:   GET  /v2/voices  (NOTE: codebase used /v1/voices — now upgraded)
 */

import type {
  IVoiceProvider,
  VoiceMeta,
  VoicePreview,
  VoiceDesignSpec,
  VoiceSpec,
  VoiceSynthSettings,
  VoiceFilter,
  DryRunResult,
} from '../types'
import { VoiceProviderException } from '../types'
import {
  EL_BASE_URL,
  EL_AUTH_HEADER,
  EL_ENDPOINTS,
  EL_VOICE_DESIGN_MODELS,
  EL_DEFAULT_TTS_MODEL,
  EL_DEFAULT_VOICE_SETTINGS,
  EL_VOICE_CODE_LABEL,
  EL_RETRY_SAFE_STATUS_CODES,
  EL_VOICE_LIST_PAGE_SIZE,
} from './constants'
import { parseVoiceCode, VoiceCodeValidationError } from '../voice-code'
import { getRegistry } from '../registry'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildError(opts: {
  message: string
  endpoint: string
  status: number | null
  body: string
  originalCause: string
}): VoiceProviderException {
  const retry_safe =
    opts.status !== null
      ? EL_RETRY_SAFE_STATUS_CODES.has(opts.status)
      : true // network errors are usually retryable

  return new VoiceProviderException(opts.message, {
    provider: 'elevenlabs',
    endpoint: opts.endpoint,
    status_code: opts.status,
    response_body_summary: opts.body.slice(0, 400),
    retry_safe,
    original_cause: opts.originalCause,
  })
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return '(could not read response body)'
  }
}

// ---------------------------------------------------------------------------
// Provider class
// ---------------------------------------------------------------------------

export class ElevenLabsProvider implements IVoiceProvider {
  readonly providerName = 'elevenlabs'

  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey ?? process.env.ELEVENLABS_API_KEY ?? ''
    if (!key) {
      throw new Error(
        'ElevenLabsProvider: ELEVENLABS_API_KEY is not set. ' +
          'Pass apiKey to the constructor or set the env var.'
      )
    }
    this.apiKey = key
    this.baseUrl = (baseUrl ?? EL_BASE_URL).replace(/\/$/, '')
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      [EL_AUTH_HEADER]: this.apiKey,
      'Content-Type': 'application/json',
      ...extra,
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  // -------------------------------------------------------------------------
  // synthesize — POST /v1/text-to-speech/{voice_id}
  // -------------------------------------------------------------------------

  async synthesize(
    voiceId: string,
    text: string,
    settings?: VoiceSynthSettings
  ): Promise<Buffer> {
    const endpoint = EL_ENDPOINTS.TTS(voiceId)

    const body = JSON.stringify({
      text,
      model_id: settings?.model_id ?? EL_DEFAULT_TTS_MODEL,
      voice_settings: {
        stability: settings?.stability ?? EL_DEFAULT_VOICE_SETTINGS.stability,
        similarity_boost:
          settings?.similarity_boost ?? EL_DEFAULT_VOICE_SETTINGS.similarity_boost,
        style: settings?.style ?? EL_DEFAULT_VOICE_SETTINGS.style,
        use_speaker_boost:
          settings?.use_speaker_boost ?? EL_DEFAULT_VOICE_SETTINGS.use_speaker_boost,
        speed: settings?.speed ?? EL_DEFAULT_VOICE_SETTINGS.speed,
      },
    })

    let res: Response
    try {
      res = await fetch(this.url(endpoint), {
        method: 'POST',
        headers: { ...this.headers(), Accept: 'audio/mpeg' },
        body,
      })
    } catch (err) {
      throw buildError({
        message: `ElevenLabs TTS network error for voice ${voiceId}`,
        endpoint,
        status: null,
        body: '',
        originalCause: String(err),
      })
    }

    if (!res.ok) {
      const errBody = await readErrorBody(res)
      throw buildError({
        message: `ElevenLabs TTS failed (${res.status}) for voice ${voiceId}`,
        endpoint,
        status: res.status,
        body: errBody,
        originalCause: `HTTP ${res.status}`,
      })
    }

    try {
      const arrayBuffer = await res.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (err) {
      throw buildError({
        message: `ElevenLabs TTS: failed to read audio response for voice ${voiceId}`,
        endpoint,
        status: res.status,
        body: '',
        originalCause: String(err),
      })
    }
  }

  // -------------------------------------------------------------------------
  // designPreviews — POST /v1/text-to-voice/design
  // Returns up to 3 previews with ephemeral generated_voice_id values.
  // -------------------------------------------------------------------------

  async designPreviews(spec: VoiceDesignSpec): Promise<VoicePreview[]> {
    const endpoint = EL_ENDPOINTS.VOICE_DESIGN

    // Map caller model preference to EL model ID
    const model_id: string =
      spec.model === 'v3'
        ? EL_VOICE_DESIGN_MODELS.v3
        : EL_VOICE_DESIGN_MODELS.standard

    const bodyObj: Record<string, unknown> = {
      voice_description: spec.voice_description,
      model_id,
    }

    if (spec.preview_text) {
      bodyObj.text = spec.preview_text
    } else {
      // Let EL auto-generate suitable preview text
      bodyObj.auto_generate_text = true
    }

    let res: Response
    try {
      res = await fetch(this.url(endpoint), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(bodyObj),
      })
    } catch (err) {
      throw buildError({
        message: 'ElevenLabs Voice Design network error',
        endpoint,
        status: null,
        body: '',
        originalCause: String(err),
      })
    }

    if (!res.ok) {
      const errBody = await readErrorBody(res)
      throw buildError({
        message: `ElevenLabs Voice Design failed (${res.status})`,
        endpoint,
        status: res.status,
        body: errBody,
        originalCause: `HTTP ${res.status}`,
      })
    }

    let json: { previews?: Array<{ generated_voice_id: string; audio_sample?: string }> }
    try {
      json = await res.json()
    } catch (err) {
      throw buildError({
        message: 'ElevenLabs Voice Design: could not parse JSON response',
        endpoint,
        status: res.status,
        body: '',
        originalCause: String(err),
      })
    }

    const previews = json.previews ?? []
    if (previews.length === 0) {
      throw buildError({
        message: 'ElevenLabs Voice Design returned zero previews',
        endpoint,
        status: res.status,
        body: JSON.stringify(json).slice(0, 400),
        originalCause: 'empty previews array',
      })
    }

    return previews.map((p) => ({
      generated_voice_id: p.generated_voice_id,
      audio_base64: p.audio_sample ?? '',
      description: spec.voice_description,
    }))
  }

  // -------------------------------------------------------------------------
  // createFromPreview — POST /v1/text-to-voice
  // Persists a Voice Design preview as a named voice in My Voices.
  // -------------------------------------------------------------------------

  async createFromPreview(
    generated_voice_id: string,
    name: string,
    description: string,
    labels?: Record<string, string>
  ): Promise<VoiceMeta> {
    const endpoint = EL_ENDPOINTS.VOICE_CREATE

    const bodyObj: Record<string, unknown> = {
      voice_name: name,
      voice_description: description,
      generated_voice_id,
    }
    if (labels && Object.keys(labels).length > 0) {
      bodyObj.labels = labels
    }

    let res: Response
    try {
      res = await fetch(this.url(endpoint), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(bodyObj),
      })
    } catch (err) {
      throw buildError({
        message: `ElevenLabs createFromPreview network error (generated_voice_id=${generated_voice_id})`,
        endpoint,
        status: null,
        body: '',
        originalCause: String(err),
      })
    }

    if (!res.ok) {
      const errBody = await readErrorBody(res)
      throw buildError({
        message: `ElevenLabs createFromPreview failed (${res.status}) for generated_voice_id=${generated_voice_id}`,
        endpoint,
        status: res.status,
        body: errBody,
        originalCause: `HTTP ${res.status}`,
      })
    }

    let json: { voice_id?: string; name?: string; category?: string; labels?: Record<string, string>; description?: string }
    try {
      json = await res.json()
    } catch (err) {
      throw buildError({
        message: 'ElevenLabs createFromPreview: could not parse JSON response',
        endpoint,
        status: res.status,
        body: '',
        originalCause: String(err),
      })
    }

    if (!json.voice_id) {
      throw buildError({
        message: 'ElevenLabs createFromPreview: response missing voice_id',
        endpoint,
        status: res.status,
        body: JSON.stringify(json).slice(0, 400),
        originalCause: 'voice_id absent from response',
      })
    }

    return {
      voice_id: json.voice_id,
      name: json.name ?? name,
      category: json.category,
      labels: json.labels,
      description: json.description ?? description,
    }
  }

  // -------------------------------------------------------------------------
  // listVoices — GET /v2/voices (paginated)
  // NOTE: Upgraded from /v1/voices used in older routes (el-voice-search).
  // -------------------------------------------------------------------------

  async listVoices(filter?: VoiceFilter): Promise<VoiceMeta[]> {
    const endpoint = EL_ENDPOINTS.VOICE_LIST
    const results: VoiceMeta[] = []
    let nextPageToken: string | null = null

    do {
      const params = new URLSearchParams()
      params.set('page_size', String(EL_VOICE_LIST_PAGE_SIZE))
      if (nextPageToken) params.set('next_page_token', nextPageToken)
      if (filter?.category) params.set('category', filter.category)
      if (filter?.search) params.set('search', filter.search)

      const urlWithParams = `${this.url(endpoint)}?${params.toString()}`

      let res: Response
      try {
        res = await fetch(urlWithParams, {
          method: 'GET',
          headers: this.headers(),
        })
      } catch (err) {
        throw buildError({
          message: 'ElevenLabs listVoices network error',
          endpoint,
          status: null,
          body: '',
          originalCause: String(err),
        })
      }

      if (!res.ok) {
        const errBody = await readErrorBody(res)
        throw buildError({
          message: `ElevenLabs listVoices failed (${res.status})`,
          endpoint,
          status: res.status,
          body: errBody,
          originalCause: `HTTP ${res.status}`,
        })
      }

      let json: {
        voices?: Array<{
          voice_id: string
          name: string
          category?: string
          labels?: Record<string, string>
          description?: string
        }>
        has_more?: boolean
        next_page_token?: string | null
      }

      try {
        json = await res.json()
      } catch (err) {
        throw buildError({
          message: 'ElevenLabs listVoices: could not parse JSON response',
          endpoint,
          status: res.status,
          body: '',
          originalCause: String(err),
        })
      }

      for (const v of json.voices ?? []) {
        results.push({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category,
          labels: v.labels,
          description: v.description,
        })
        // Apply caller limit if specified
        if (filter?.limit && results.length >= filter.limit) {
          return results
        }
      }

      nextPageToken = json.has_more ? (json.next_page_token ?? null) : null
    } while (nextPageToken)

    return results
  }

  // -------------------------------------------------------------------------
  // createOrFetchVoice — idempotent, registry-backed, voice_code-validated
  //
  // voice_code: structured key in AA-BB-CC-DD-EE-FF format.
  //   Validated before any API call — malformed codes throw VoiceProviderException
  //   with retry_safe=false so generate_voices never fails vaguely.
  //
  // Flow:
  //   1. Parse + validate voice_code format
  //   2. Check DB registry (fast, no EL credit cost)
  //   3. Check EL voice labels via /v2/voices (no credit cost)
  //   4. Not found → design previews → create → write registry
  //
  // dryRun=true: stops before any credit-spending EL calls.
  // -------------------------------------------------------------------------

  async createOrFetchVoice(voice_code: string, spec: VoiceSpec, dryRun?: false): Promise<VoiceMeta>
  async createOrFetchVoice(voice_code: string, spec: VoiceSpec, dryRun: true): Promise<DryRunResult>
  async createOrFetchVoice(voice_code: string, spec: VoiceSpec, dryRun = false): Promise<VoiceMeta | DryRunResult> {

    // Step 1: validate voice_code format
    const parseResult = parseVoiceCode(voice_code)
    if (!parseResult.valid || !parseResult.parsed) {
      const valErr = parseResult.error!
      if (dryRun) {
        return {
          dry_run: true,
          voice_code,
          outcome: 'invalid_voice_code',
          existing_voice_id: null,
          would_send_design_request: null,
          validation_error: valErr.message,
          summary: `BLOCKED: voice_code "${voice_code}" failed format validation. ` +
            `Expected: ${valErr.expected_format}`,
        }
      }
      const vcErr = new VoiceCodeValidationError(valErr)
      throw new VoiceProviderException(vcErr.message, vcErr.toErrorJson())
    }

    // Step 2: DB registry lookup (no EL API cost)
    const registry = getRegistry()
    const fromRegistry = await registry.lookup(voice_code, this.providerName)
    if (fromRegistry) {
      if (dryRun) {
        return {
          dry_run: true,
          voice_code,
          outcome: 'found_in_registry',
          existing_voice_id: fromRegistry.voice_id,
          would_send_design_request: null,
          validation_error: null,
          summary: `FOUND in registry: voice_id=${fromRegistry.voice_id} (${fromRegistry.name}). No EL call needed.`,
        }
      }
      return fromRegistry
    }

    // Step 3: EL label search — generated voices, then cloned
    // (no credit cost, just pagination through /v2/voices)
    let existing: VoiceMeta | undefined
    try {
      const generated = await this.listVoices({ category: 'generated' })
      existing = generated.find((v) => v.labels?.[EL_VOICE_CODE_LABEL] === voice_code)

      if (!existing) {
        const cloned = await this.listVoices({ category: 'cloned' })
        existing = cloned.find((v) => v.labels?.[EL_VOICE_CODE_LABEL] === voice_code)
      }
    } catch (err) {
      throw err // List failure propagates — don't silently duplicate
    }

    if (existing) {
      // Found in EL — back-fill the registry for next time
      if (!dryRun) {
        await registry.upsert({ voice_code, provider: this.providerName, voice: existing })
      }
      if (dryRun) {
        return {
          dry_run: true,
          voice_code,
          outcome: 'found_in_el_labels',
          existing_voice_id: existing.voice_id,
          would_send_design_request: null,
          validation_error: null,
          summary: `FOUND via EL label search: voice_id=${existing.voice_id} (${existing.name}). Registry would be back-filled.`,
        }
      }
      return existing
    }

    // Step 4: Not found anywhere — dry-run stops here
    const designRequest: Record<string, unknown> = {
      voice_description: spec.voice_description,
      model_id:
        spec.model === 'v3'
          ? EL_VOICE_DESIGN_MODELS.v3
          : EL_VOICE_DESIGN_MODELS.standard,
      ...(spec.preview_text
        ? { text: spec.preview_text }
        : { auto_generate_text: true }),
    }

    if (dryRun) {
      return {
        dry_run: true,
        voice_code,
        outcome: 'would_create',
        existing_voice_id: null,
        would_send_design_request: designRequest,
        validation_error: null,
        summary: `NOT FOUND in registry or EL. Would call POST /v1/text-to-voice/design ` +
          `then POST /v1/text-to-voice. Inspect would_send_design_request for request body.`,
      }
    }

    // Step 5: design + create + write registry
    const previews = await this.designPreviews({
      voice_description: spec.voice_description,
      preview_text: spec.preview_text,
      model: spec.model,
    })

    const labels: Record<string, string> = {
      ...(spec.labels ?? {}),
      [EL_VOICE_CODE_LABEL]: voice_code,
    }

    const created = await this.createFromPreview(
      previews[0].generated_voice_id,
      spec.name,
      spec.voice_description,
      labels
    )

    // Write to registry (non-blocking on failure)
    await registry.upsert({ voice_code, provider: this.providerName, voice: created })

    return created
  }
}
