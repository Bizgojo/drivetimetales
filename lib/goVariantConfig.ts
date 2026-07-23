// lib/goVariantConfig.ts — CTA-INSTRUMENTATION-001 BUILD 2: GoVariantConfig
//
// Server-side fetch for go_variant_config rows. Called from the /go page
// server component so variant copy + revealSec flow in at render time rather
// than a client-side effect. Never throws — callers always get null on any
// error (table not yet migrated, DB unavailable, env misconfigured, etc.).
//
// HARD RULE (matching the /go page's own posture): this function must NEVER
// crash the page. Any failure returns null; the page falls back to its
// hardcoded values.
//
// APPROVAL GATE (Marc, msg 3616, 2026-07-22):
//   copy variants (heading, subheading, ctaLabel) = Susan's call, logged as decision.
//   Structural changes (revealSec, new fields)     = comes to Marc.

import { createClient } from '@supabase/supabase-js'

/** Shape of a go_variant_config row as returned from Supabase. */
export interface GoVariantConfigRow {
  variant: string
  /** Susan-owned: initial CTA sheet heading (pre-milestone, pre-completion). */
  heading: string | null
  /** Susan-owned: optional subheading below the heading (currently unused in the sheet; reserved for future use). */
  subheading: string | null
  /** Susan-owned: CTA button label in the pre-completion state. */
  cta_label: string | null
  /** Marc-gated: cumulative listened seconds before the CTA reveals; overrides GoStory.ctaRevealSeconds when set. */
  reveal_sec: number | null
  active: boolean
  notes: string | null
}

/**
 * Fetch the go_variant_config row for the given variant key (e.g. 'a', 'b').
 * Returns null when:
 *   - variant is not 'a' or 'b' (bare/control has no config row)
 *   - table doesn't exist yet (pre-migration)
 *   - row not found or row has active=false
 *   - DB/env unavailable
 * Never throws.
 */
export async function fetchGoVariantConfig(
  variant: string | null | undefined
): Promise<GoVariantConfigRow | null> {
  const key = (variant ?? '').trim().toLowerCase()
  // Only 'a' and 'b' have config rows; bare control uses hardcoded defaults.
  if (key !== 'a' && key !== 'b') return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null

  try {
    const client = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })
    const { data, error } = await client
      .from('go_variant_config')
      .select('variant, heading, subheading, cta_label, reveal_sec, active, notes')
      .eq('variant', key)
      .eq('active', true)
      .maybeSingle()

    if (error) {
      // Pre-migration: table doesn't exist yet → fall back silently (never 5xx the page).
      if (/could not find the table|does not exist|schema cache/i.test(error.message ?? '')) {
        return null
      }
      // Any other DB error: fail quietly.
      return null
    }
    return data as GoVariantConfigRow | null
  } catch {
    return null
  }
}
