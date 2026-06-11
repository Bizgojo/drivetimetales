/**
 * Pipeline Runner — Failure classification
 * Ported from scripts/production-autopilot.js
 */

import type { FailureClassification, FailureContext, FailureKind } from './types'

const MAX_LOUDNESS_RETRIES_PER_SEGMENT = 3
const MAX_TRANSIENT_RETRIES_PER_KEY = 1

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function getNestedReport(payload: Record<string, unknown>): unknown {
  return (
    payload?.voiceGenerationReport ??
    payload?.belleQualityReport ??
    payload?.belleValidationReport ??
    payload?.storyResolutionReport ??
    payload?.validatorReport ??
    payload?.packageReport ??
    payload?.error ??
    payload?.message ??
    payload
  )
}

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

export function failureText(payload: Record<string, unknown>, job: Record<string, unknown>): string {
  return [
    safeString(payload),
    safeString(job?.error_json),
    safeString(getNestedReport(payload)),
  ]
    .join('\n')
    .toLowerCase()
}

export function currentFailureContext(
  payload: Record<string, unknown>,
  job: Record<string, unknown>,
): FailureContext {
  const error = (payload?.error_json ?? job?.error_json ?? {}) as Record<string, unknown>
  const report = (
    (payload?.voiceGenerationReport ?? (error as Record<string, unknown>).voiceGenerationReport ?? {})
  ) as Record<string, unknown>
  const failure = Array.isArray(report.failures) ? (report.failures[0] as Record<string, unknown>) : null

  return {
    step:
      (payload?.currentStep as string | null) ??
      (error?.step as string | null) ??
      (job?.current_step as string | null) ??
      null,
    storyId:
      (payload?.storyId as string | null) ??
      (error?.storyId as string | null) ??
      (failure?.storyId as string | null) ??
      (job?.story_id as string | null) ??
      null,
    seriesId:
      (payload?.seriesId as string | null) ??
      (error?.seriesId as string | null) ??
      (job?.series_id as string | null) ??
      null,
    episodeNumber:
      (payload?.episodeNumber as string | number | null) ??
      (error?.episodeNumber as string | number | null) ??
      null,
    segmentNumber:
      (payload?.segmentNumber as string | number | null) ??
      (error?.segmentNumber as string | number | null) ??
      (failure?.index as string | number | null) ??
      null,
    speaker: (failure?.speaker as string | null) ?? null,
    failure,
    report,
  }
}

export function retryKey(
  kind: FailureKind,
  context: FailureContext,
  jobId: string,
): string {
  return [
    kind,
    jobId,
    context.step ?? 'unknown_step',
    context.storyId ?? 'unknown_story',
    context.episodeNumber ?? 'unknown_episode',
    context.segmentNumber ?? 'unknown_segment',
  ].join(':')
}

export function classifyFailure(
  payload: Record<string, unknown>,
  job: Record<string, unknown>,
): FailureClassification {
  const text = failureText(payload, job)
  const context = currentFailureContext(payload, job)

  if (
    /transcript qc failed|detected|expected|tail|coverage|missing final|dropped/.test(text)
  ) {
    return {
      kind: 'semantic_uncertainty',
      retryable: false,
      needsMarc: true,
      reason: 'Transcript QC failure may involve semantic meaning or a dropped phrase.',
      recommendedAction:
        'Marc should approve the exact script-line patch or confirm it is a safe normalization case.',
      context,
    }
  }

  if (
    /quota|billing|insufficient_quota|rate limit|rate_limit|\b429\b/.test(text)
  ) {
    // Map to transient for retry; needsMarc if cap exceeded (handled by caller)
    return {
      kind: 'transient',
      retryable: true,
      needsMarc: false,
      reason: 'Infrastructure quota, billing, or rate limit issue.',
      recommendedAction:
        'Check provider billing/quota, then rerun this job explicitly.',
      context,
    }
  }

  if (
    /unexpected token '<'|not valid json|non-json|html|econnreset|etimedout|timeout|fetch failed|socket hang up|storage|supabase|503|502|504/.test(
      text,
    )
  ) {
    return {
      kind: 'transient',
      retryable: true,
      needsMarc: false,
      reason: 'Transient storage/API response or network failure.',
      recommendedAction:
        'Autopilot retries once. If it repeats, Marc should inspect storage/API health.',
      context,
    }
  }

  if (
    /loudness|lufs|too quiet|lowloudnesssegments/.test(text) &&
    !/transcript qc failed|tail|coverage|semantic/.test(text)
  ) {
    return {
      kind: 'loudness',
      retryable: true,
      needsMarc: false,
      reason: 'Loudness-only QC failure.',
      recommendedAction: `Autopilot retries up to ${MAX_LOUDNESS_RETRIES_PER_SEGMENT} times for this segment.`,
      context,
    }
  }

  if (
    /validate_story_resolution|story resolution|central conflict|ending|hook|cliffhanger|listener is.*waiting|score_validate_package/.test(
      text,
    )
  ) {
    return {
      kind: 'story_quality',
      retryable: false,
      needsMarc: true,
      reason: 'Story ending, hook, package, or resolution quality needs editorial judgment.',
      recommendedAction:
        'Marc should review the validator report and approve a script repair direction.',
      context,
    }
  }

  if (
    /validate_belle_quality|belle quality|repair_belle_quality|generic host|emotional|endless tales original/.test(
      text,
    )
  ) {
    return {
      kind: 'belle_quality',
      retryable: false,
      needsMarc: true,
      reason: 'Belle quality validation needs editorial judgment or failed after repair.',
      recommendedAction:
        'Marc should review Belle intro/outro issues and approve repair direction.',
      context,
    }
  }

  if (/cover|art direction|image|thumbnail/.test(text)) {
    return {
      kind: 'cover_art',
      retryable: false,
      needsMarc: true,
      reason: 'Cover/art direction needs Marc review.',
      recommendedAction: 'Marc should provide cover feedback before regenerating.',
      context,
    }
  }

  if (
    /not implemented|unknown current_step|unknown step|only .* are implemented/.test(text)
  ) {
    return {
      kind: 'unknown_step',
      retryable: false,
      needsMarc: true,
      reason: 'Production job reached a step Autopilot/run-next cannot safely process.',
      recommendedAction:
        'Implement the next run-next slice or move the job to a supported step after review.',
      context,
    }
  }

  return {
    kind: 'unknown_qc',
    retryable: false,
    needsMarc: true,
    reason: 'Unknown QC or route failure class.',
    recommendedAction: 'Marc or engineering should inspect the raw error before continuing.',
    context,
  }
}

export { MAX_LOUDNESS_RETRIES_PER_SEGMENT, MAX_TRANSIENT_RETRIES_PER_KEY }
