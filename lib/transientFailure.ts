/**
 * TRANSIENT-FAILURE-001 (Marc GO 2026-09-28)
 *
 * Sort production failures into two kinds:
 *
 *   TRANSIENT — the story is fine; something outside it was broken for a
 *     while (bad/empty API key, out of credits, rate limit, provider outage,
 *     network blip, a runner that disappeared). Retrying later with nothing
 *     changed can succeed.
 *
 *   PERMANENT — something about the story itself failed (script, narrator,
 *     QC, Belle quality, missing asset). Retrying unchanged will fail again;
 *     a human or a repair playbook must act.
 *
 * Why this exists (Sep 25-26, 2026 incident, Origin 2.0): a bad ElevenLabs
 * key and an out-of-credit Anthropic key failed 3 jobs in 2h, the dispatch
 * failure circuit treated them as story defects and parked all 18 unproduced
 * episodes in repair_queue — a state with no legal route back to the queue.
 * A temporary outage became a permanent stop.
 *
 * Transient failures are tagged on production_jobs.error_json
 * (`transient: true`, `transient_cause`). Dispatch then:
 *   - does NOT count them toward the failure circuit or the 7-day retry cap,
 *   - does NOT set stories.needs_attention for them,
 *   - backs off instead (see transientDispatchHold in lib/dispatchGuards.ts),
 *     so a still-broken key cannot turn into a retry storm.
 *
 * Patterns are deliberately conservative: anything not clearly an outside
 * outage stays PERMANENT, so no real story defect is ever retried blindly.
 */

export type TransientCause =
  | 'elevenlabs_auth_or_quota'
  | 'anthropic_auth_or_credit'
  | 'openai_quota'
  | 'provider_rate_limit'
  | 'provider_overloaded'
  | 'network'
  | 'zombie_stalled'
  | 'runner_tmp_full'

type Rule = { cause: TransientCause; pattern: RegExp }

const RULES: Rule[] = [
  // ElevenLabs: invalid/missing key, out of credits, account throttled.
  // Error text shapes in this repo: "ElevenLabs error 401: ...",
  // "ElevenLabs TTS failed (401) ...", "ElevenLabs API error: 401".
  { cause: 'elevenlabs_auth_or_quota', pattern: /elevenlabs[^\n]{0,30}?(error|failed)[^\n]{0,4}?[:(\s]\s*(401|402|429)\b/i },
  { cause: 'elevenlabs_auth_or_quota', pattern: /\b(quota_exceeded|detected_unusual_activity|invalid_api_key|missing_permissions)\b/i },

  // Anthropic: empty credit balance, bad key, rate limit, overloaded.
  { cause: 'anthropic_auth_or_credit', pattern: /credit balance is too low to access the Anthropic API/i },
  { cause: 'anthropic_auth_or_credit', pattern: /authentication_error|invalid x-api-key/i },
  { cause: 'provider_rate_limit', pattern: /rate_limit_error/i },
  { cause: 'provider_overloaded', pattern: /overloaded_error|\b529\b[^\n]{0,20}overloaded/i },

  // OpenAI (Whisper QC): out of quota / capped.
  { cause: 'openai_quota', pattern: /insufficient_quota|OpenAI (402|429)\b/i },

  // Upstream gateway errors (any provider).
  { cause: 'provider_overloaded', pattern: /\b(502 Bad Gateway|503 Service Unavailable|504 Gateway Timeout)\b/i },

  // Network-level failures before any response arrived. Case-sensitive and
  // anchored to the runtime's exact error text so dialogue such as
  // "the fetch failed" can never match.
  { cause: 'network', pattern: /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_[A-Z_]+)\b|TypeError: fetch failed|Error: socket hang up/ },

  // TMP-SPACE-LOW-001 (Marc GO 2026-10-06): runner /tmp disk exhaustion.
  // Infra-transient, NOT a story defect — dispatch backs off and retries
  // after cleanup instead of tripping the failure circuit or retry cap.
  // Patterns are anchored to system error tokens so story dialogue can never
  // match: TMP_SPACE_LOW is our own marker, ENOSPC is the errno, and the
  // "no space left" form requires the full strerror suffix "on device".
  // Callers should run stripQuotedScriptText() first (see test file).
  { cause: 'runner_tmp_full', pattern: /\bTMP_SPACE_LOW\b/ },
  { cause: 'runner_tmp_full', pattern: /\bENOSPC\b/ },
  { cause: 'runner_tmp_full', pattern: /no space left on device/i },
]

/**
 * Causes that affect the whole account (every job will fail the same way
 * until a human fixes a key or balance). Dispatch pauses globally on these.
 */
export const ACCOUNT_WIDE_CAUSES: ReadonlySet<TransientCause> = new Set<TransientCause>([
  'elevenlabs_auth_or_quota',
  'anthropic_auth_or_credit',
  'openai_quota',
])

/**
 * Remove quoted script/transcript text from a QC failure message before
 * classifying it, so story dialogue can never look like an outside failure.
 * e.g. 'expected "The fetch failed." partial output "..."' → 'expected "…" partial output "…"'
 */
export function stripQuotedScriptText(text: unknown): string {
  const s = typeof text === 'string' ? text : text == null ? '' : safeStringify(text)
  return s.replace(
    /\b(expected|detected|partial output|transcript(?:ion)?|heard|got|text|line|dialogue)(\s*[:=]?\s*)"[^"]*"/gi,
    '$1$2"…"',
  )
}

/** Classify a failure message. Returns the cause, or null when PERMANENT. */
export function classifyTransientFailure(...texts: Array<unknown>): TransientCause | null {
  const haystack = texts
    .map((t) => (typeof t === 'string' ? t : t == null ? '' : safeStringify(t)))
    .join('\n')
    .slice(0, 20_000)
  if (!haystack.trim()) return null
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) return rule.cause
  }
  return null
}

/** Fields to merge into production_jobs.error_json for a transient failure. */
export function transientErrorFields(cause: TransientCause) {
  const fixRecommendation =
    cause === 'runner_tmp_full'
      ? 'Transient runner disk exhaustion (/tmp full). ' +
        'Dispatch retries automatically with escalating back-off (5m/15m/45m); no story change needed. ' +
        'If it keeps recurring, free runner disk or reduce render concurrency.'
      : 'Transient outside failure (key, credits, rate limit, outage or lost runner). ' +
        'Dispatch retries automatically after a back-off; no story change needed. ' +
        'If it keeps recurring, fix the outside cause (e.g. the API key or balance).'
  return {
    transient: true as const,
    transient_cause: cause,
    marc_required: false,
    fixRecommendation,
  }
}

/** True when a production_jobs row failed for a transient reason. */
export function isTransientJobRow(row: { error_json?: unknown } | null | undefined): boolean {
  const ej = row?.error_json
  if (!ej || typeof ej !== 'object') return false
  const obj = ej as Record<string, unknown>
  return obj.transient === true || obj.kind === 'zombie_stalled'
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
