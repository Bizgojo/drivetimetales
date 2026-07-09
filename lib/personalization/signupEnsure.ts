/**
 * PERS-FIX-002 — signup-hook keying plan.
 *
 * Every signup path (password, magic-link/OAuth callback, promo/GVL
 * redemption) must set users.name_pronunciation_key and ensure the name pool
 * exists (ensureNamePoolForUser). PERS-DIAG-001 found the GVL promo path
 * never called it and /api/user/create early-returned for existing rows
 * before its ensure call — all real signups since Jun 23 had NULL keys.
 *
 * SAFETY RULE encoded here: ensureNamePoolForUser('') resolves a null key and
 * CLEARS an existing name_pronunciation_key. For existing users we therefore
 * only run the ensure when we actually have a non-empty name, and we prefer
 * the DB's first_name (source of truth) over request-supplied guesses (the
 * auth callback passes an email-prefix fallback).
 */

export type SignupEnsurePlan = {
  run: boolean
  firstName: string
}

/**
 * Pick the first usable first name from candidates (highest priority first)
 * and decide whether the ensure hook should run at all.
 *
 * - Candidates should be ordered: DB first_name first, then request payload.
 * - Returns run=false when no candidate is a non-empty string, so callers
 *   never clear an existing pronunciation key with an empty name.
 */
export function planSignupNameEnsure(candidates: Array<unknown>): SignupEnsurePlan {
  for (const candidate of candidates) {
    const firstName = String(candidate ?? '').trim()
    if (firstName) return { run: true, firstName }
  }
  return { run: false, firstName: '' }
}
