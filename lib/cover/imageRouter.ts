/**
 * COVER-PIPELINE-DECOUPLE-001 — Image backend routing (config/routing only)
 *
 * Task 5 (Marc directive 2026-10-08): cover image generation must route through
 * an explicit backend priority chain instead of an implicit single-model call.
 *
 * Priority:
 *   Primary:   ChatGPT → DALL·E 3  (OpenAI images API)
 *   Secondary: Claude Sonnet / Art models
 *   Fallback:  external renderer (SDXL / Midjourney)
 *
 * Rules:
 * - Config/routing ONLY. This module never handles API keys — Marc sets keys;
 *   credential governance lives in env, not in code.
 * - Belle is VOICE-ONLY. There is no Belle image agent; this module asserts
 *   that by refusing any backend id that references Belle.
 * - Pure + dependency-free so it can be unit-tested and reused by both the
 *   regenerate-cover endpoint and the parallel cover phase.
 */

export type ImageBackendId = 'dalle3' | 'claude-art' | 'external-renderer'

export interface ImageBackendRoute {
  id: ImageBackendId
  /** Human label for logs/diagnostics (no secrets). */
  label: string
  /** Provider family. ChatGPT/OpenAI for primary, Anthropic for secondary. */
  provider: 'openai' | 'anthropic' | 'external'
  /** Default model id for this backend (env may override, keys never live here). */
  defaultModel: string
  notes: string
}

export const IMAGE_BACKEND_ROUTES: Record<ImageBackendId, ImageBackendRoute> = {
  'dalle3': {
    id: 'dalle3',
    label: 'Primary — ChatGPT → DALL·E 3',
    provider: 'openai',
    defaultModel: 'dall-e-3',
    notes: 'Default cover renderer. OpenAI images API; key from env (Marc-governed).',
  },
  'claude-art': {
    id: 'claude-art',
    label: 'Secondary — Claude Sonnet / Art models',
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-art',
    notes: 'Secondary when OpenAI is unavailable. Key from env (Marc-governed).',
  },
  'external-renderer': {
    id: 'external-renderer',
    label: 'Fallback — external renderer (SDXL / Midjourney)',
    provider: 'external',
    defaultModel: 'sdxl',
    notes: 'Last resort. External SDXL/Midjourney render path; key from env (Marc-governed).',
  },
}

/** Priority order — primary first, fallback last. */
export const IMAGE_BACKEND_PRIORITY: ImageBackendId[] = ['dalle3', 'claude-art', 'external-renderer']

/** Belle is voice-only. Any backend id referencing Belle is rejected. */
export function assertNotBelleImageAgent(backendId: string): void {
  if (/belle/i.test(String(backendId || ''))) {
    throw new Error(
      `Invalid image backend "${backendId}": Belle is voice-only and is never an image agent ` +
      `(COVER-PIPELINE-DECOUPLE-001). Use dalle3, claude-art, or external-renderer.`,
    )
  }
}

export interface SelectedImageBackend {
  backend: ImageBackendRoute
  /** Effective model: explicit override → env override → backend default. */
  model: string
  /** True when the selection came from an explicit override (env or caller). */
  overridden: boolean
}

/**
 * Resolve which image backend + model to use.
 * Precedence: caller override → COVER_IMAGE_BACKEND / OPENAI_IMAGE_MODEL env →
 * primary default (dall-e-3). Never touches API keys.
 */
export function selectImageBackend(preferred?: string): SelectedImageBackend {
  const raw = String(preferred || process.env.COVER_IMAGE_BACKEND || '').trim().toLowerCase()
  if (raw) {
    assertNotBelleImageAgent(raw)
    const route = (IMAGE_BACKEND_ROUTES as Record<string, ImageBackendRoute>)[raw]
    if (!route) {
      throw new Error(
        `Unknown COVER_IMAGE_BACKEND "${raw}". Valid: ${IMAGE_BACKEND_PRIORITY.join(', ')}.`,
      )
    }
    return {
      backend: route,
      model: String(process.env.OPENAI_IMAGE_MODEL || route.defaultModel).trim() || route.defaultModel,
      overridden: true,
    }
  }
  const primary = IMAGE_BACKEND_ROUTES['dalle3']
  return {
    backend: primary,
    model: String(process.env.OPENAI_IMAGE_MODEL || primary.defaultModel).trim() || primary.defaultModel,
    overridden: Boolean(process.env.OPENAI_IMAGE_MODEL),
  }
}

/** Effective image model id for the OpenAI-images-compatible call path. */
export function resolveImageModel(): string {
  return selectImageBackend().model
}
