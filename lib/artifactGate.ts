/**
 * Artifact Validity Gate
 *
 * Validates audio/asset artifacts before they are used in rendering or
 * promoted through pipeline stages.
 *
 * Centralizes all artifact size/LUFS/URL/ETag checks that were previously
 * scattered across generate-voices/route.ts and run-next/route.ts.
 *
 * Core rule: An artifact that fails this gate must not progress to the
 * next pipeline step. Gate failures must produce structured error_json.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard-fail: segments ≤ this size are definitely silent/corrupt. */
export const ARTIFACT_HARD_FAIL_BYTES = 5 * 1024     // 5KB

/** Warn-but-continue: segments in this range may be short valid lines. */
export const ARTIFACT_WARN_BYTES = 20 * 1024          // 20KB

/** Known ElevenLabs silence placeholder MD5 hash. */
export const KNOWN_SILENCE_ETAG = '4514f4b04df758c455fddd733d4667b4'

/** Minimum acceptable LUFS for a story segment. */
export const MIN_LUFS = -30

/** Maximum acceptable LUFS for a story segment. */
export const MAX_LUFS = -5

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArtifactKind = 'segment' | 'belle_asset' | 'final_mix' | 'music' | 'cover'

export type ArtifactViolation = {
  kind: 'hard_fail' | 'warning'
  code: string
  message: string
}

export type ArtifactGateResult = {
  valid: boolean
  hardFailed: boolean
  violations: ArtifactViolation[]
  artifactPath: string
  artifactKind: ArtifactKind
}

export type ArtifactCheckInput = {
  path: string
  kind: ArtifactKind
  sizeBytes?: number | null
  lufs?: number | null
  etag?: string | null
  url?: string | null
}

// ---------------------------------------------------------------------------
// Core gate function
// ---------------------------------------------------------------------------

/**
 * Check a single artifact for validity.
 * Returns a result with all violations found.
 */
export function checkArtifact(input: ArtifactCheckInput): ArtifactGateResult {
  const violations: ArtifactViolation[] = []

  // ── URL check ────────────────────────────────────────────────────────────
  if (input.url !== undefined) {
    if (!input.url || typeof input.url !== 'string' || !input.url.trim()) {
      violations.push({
        kind: 'hard_fail',
        code: 'MISSING_URL',
        message: `Artifact "${input.path}" has no URL — cannot be used in render.`,
      })
    }
  }

  // ── Size checks ──────────────────────────────────────────────────────────
  if (input.sizeBytes !== undefined && input.sizeBytes !== null) {
    const size = input.sizeBytes

    if (size === 0) {
      violations.push({
        kind: 'hard_fail',
        code: 'ZERO_BYTES',
        message: `Artifact "${input.path}" is 0 bytes — empty file.`,
      })
    } else if (size <= ARTIFACT_HARD_FAIL_BYTES) {
      violations.push({
        kind: 'hard_fail',
        code: 'SILENCE_HARD_FAIL',
        message: `Artifact "${input.path}" is ${size} bytes (≤${ARTIFACT_HARD_FAIL_BYTES}B hard-fail floor). Likely silence or corrupt.`,
      })
    } else if (size <= ARTIFACT_WARN_BYTES && input.kind === 'segment') {
      violations.push({
        kind: 'warning',
        code: 'SHORT_SEGMENT_WARN',
        message: `Segment "${input.path}" is ${size} bytes (${ARTIFACT_HARD_FAIL_BYTES}B–${ARTIFACT_WARN_BYTES}B warn range). May be valid short line — continue but flag.`,
      })
    }
  }

  // ── ETag check ───────────────────────────────────────────────────────────
  if (input.etag) {
    const normalizedEtag = input.etag.replace(/"/g, '').toLowerCase()
    if (normalizedEtag === KNOWN_SILENCE_ETAG) {
      violations.push({
        kind: 'hard_fail',
        code: 'SILENCE_ETAG',
        message: `Artifact "${input.path}" matches known ElevenLabs silence placeholder ETag (${KNOWN_SILENCE_ETAG}). Must regenerate.`,
      })
    }
  }

  // ── LUFS checks (only for audio kinds that have LUFS) ───────────────────
  if (input.lufs !== undefined && input.kind !== 'cover') {
    if (input.lufs === null) {
      violations.push({
        kind: 'hard_fail',
        code: 'NULL_LUFS',
        message: `Artifact "${input.path}" has null LUFS — audio analysis failed. Segment may be corrupt or unexpectedly silent.`,
      })
    } else if (input.lufs < MIN_LUFS) {
      violations.push({
        kind: 'warning',
        code: 'LUFS_TOO_LOW',
        message: `Artifact "${input.path}" LUFS=${input.lufs.toFixed(1)} is below ${MIN_LUFS} dB. Audio may be too quiet.`,
      })
    } else if (input.lufs > MAX_LUFS) {
      violations.push({
        kind: 'warning',
        code: 'LUFS_TOO_HIGH',
        message: `Artifact "${input.path}" LUFS=${input.lufs.toFixed(1)} is above ${MAX_LUFS} dB. Audio may be too loud.`,
      })
    }
  }

  const hardFailed = violations.some(v => v.kind === 'hard_fail')
  return {
    valid: violations.length === 0,
    hardFailed,
    violations,
    artifactPath: input.path,
    artifactKind: input.kind,
  }
}

/**
 * Check a batch of artifacts.
 * Returns summary stats + per-artifact results.
 */
export type BatchArtifactGateResult = {
  allValid: boolean
  anyHardFailed: boolean
  totalChecked: number
  hardFailCount: number
  warningCount: number
  results: ArtifactGateResult[]
  hardFailPaths: string[]
  warningPaths: string[]
}

export function checkArtifactBatch(artifacts: ArtifactCheckInput[]): BatchArtifactGateResult {
  const results = artifacts.map(checkArtifact)
  const hardFailResults = results.filter(r => r.hardFailed)
  const warningResults = results.filter(r => !r.hardFailed && !r.valid)

  return {
    allValid: results.every(r => r.valid),
    anyHardFailed: hardFailResults.length > 0,
    totalChecked: results.length,
    hardFailCount: hardFailResults.length,
    warningCount: warningResults.length,
    results,
    hardFailPaths: hardFailResults.map(r => r.artifactPath),
    warningPaths: warningResults.map(r => r.artifactPath),
  }
}

/**
 * Check segments from a storage inventory list.
 * Classifies each segment as valid, stale-warn, or stale-fail.
 *
 * This is the canonical implementation used by generate-voices retryMissingOnly.
 */
export type InventorySegment = {
  name: string
  metadata?: { size?: number; etag?: string } | null
}

export type SegmentInventoryResult = {
  validSegmentNames: Set<string>
  staleHardFailNames: string[]
  staleWarnNames: string[]
  unknownNames: string[]
}

// ---------------------------------------------------------------------------
// HTTP reachability check
// ---------------------------------------------------------------------------

export type ArtifactHttpCheckResult = {
  url: string
  reachable: boolean
  httpStatus: number | null
  error: string | null
}

/**
 * Verify an artifact URL is reachable and returns HTTP 2xx.
 *
 * Uses HEAD to avoid downloading file content. Falls back gracefully:
 * if the server rejects HEAD (405), retries with GET + Range: bytes=0-0
 * so we only pull a single byte.
 *
 * Always resolves — never throws. Callers decide whether to hard-block or warn.
 *
 * @param url        Full URL of the artifact (audio, cover, etc.)
 * @param timeoutMs  Per-attempt timeout. Default 10 000 ms.
 */
export async function verifyArtifactHttp(
  url: string,
  timeoutMs = 10_000,
): Promise<ArtifactHttpCheckResult> {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { url, reachable: false, httpStatus: null, error: 'URL is empty or invalid' }
  }

  const tryFetch = async (method: 'HEAD' | 'GET', headers: Record<string, string> = {}) => {
    const controller = new AbortController()
    const handle = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, { method, headers, signal: controller.signal })
      clearTimeout(handle)
      return response
    } catch (err) {
      clearTimeout(handle)
      throw err
    }
  }

  try {
    let response = await tryFetch('HEAD')

    // Some object-storage endpoints reject HEAD with 403/405 — retry as GET with Range
    if (response.status === 403 || response.status === 405) {
      response = await tryFetch('GET', { Range: 'bytes=0-0' })
    }

    const ok = response.status >= 200 && response.status < 300
    return {
      url,
      reachable: ok,
      httpStatus: response.status,
      error: ok ? null : `HTTP ${response.status}`,
    }
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      url,
      reachable: false,
      httpStatus: null,
      error: aborted
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err),
    }
  }
}

export function classifySegmentInventory(
  files: InventorySegment[],
  segmentFilePattern = /^segment_\d{4}\.mp3$/,
): SegmentInventoryResult {
  const validSegmentNames = new Set<string>()
  const staleHardFailNames: string[] = []
  const staleWarnNames: string[] = []
  const unknownNames: string[] = []

  for (const file of files) {
    if (!segmentFilePattern.test(file.name)) continue

    const size = file.metadata?.size ?? null
    const etag = file.metadata?.etag ?? null

    if (size === null) {
      unknownNames.push(file.name)
      continue
    }

    const result = checkArtifact({
      path: file.name,
      kind: 'segment',
      sizeBytes: size,
      etag,
    })

    if (result.hardFailed) {
      staleHardFailNames.push(file.name)
    } else if (!result.valid) {
      staleWarnNames.push(file.name)
      // Warn-range segments ARE treated as valid in generate_voices inventory
      // (ATL-PIPE-006: only truly corrupt segments ≤5KB are treated as missing)
      validSegmentNames.add(file.name)
    } else {
      validSegmentNames.add(file.name)
    }
  }

  return { validSegmentNames, staleHardFailNames, staleWarnNames, unknownNames }
}
