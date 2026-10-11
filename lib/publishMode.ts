/**
 * ATLAS PUBLISH-MODE SWITCH — Canon Rule 4 (PIPELINE-CANON-001, approved 2026-10-04).
 *
 * One setting, `publish_mode`, two values:
 *   - 'rfr'    → hold at ready_for_review for Marc's manual action (status quo ante)
 *   - 'direct' → skip the RFR hold, go straight to the app (initial value per canon)
 *
 * Read point: at the moment the item is about to go live (after ALL quality
 * gates passed), never at dispatch time. No per-story override, no cache —
 * every RFR completion re-reads the current value so a single-setting flip
 * (the documented rollback) takes effect instantly.
 *
 * Store: public.atlas_settings (key/value). See
 * supabase/migrations/20261011164500_atlas_publish_mode.sql.
 */

export const PUBLISH_MODE_KEY = 'publish_mode'
export const PUBLISH_MODE_DIRECT = 'direct' as const
export const PUBLISH_MODE_RFR = 'rfr' as const

export type PublishMode = typeof PUBLISH_MODE_DIRECT | typeof PUBLISH_MODE_RFR

/** Canon Rule 4 initial value (option A, approved 2026-10-04). */
export const PUBLISH_MODE_DEFAULT: PublishMode = PUBLISH_MODE_DIRECT

/** Audit/log reason prefix for every autonomous direct-mode publish. */
export const DIRECT_PUBLISH_REASON_PREFIX = 'PUBLISH-MODE-DIRECT'

/**
 * Unmissable marker emitted ONLY by the first auto-publish under this path
 * (log + audit row + run-next report) so Marc verifies end-to-end before
 * trusting further. Customer-facing content can go live with zero human
 * check under direct — this marker is the tripwire.
 */
export const FIRST_PUBLISH_MARKER = 'PUBLISH-MODE-DIRECT-FIRST-PUBLISH'

export function parsePublishMode(value: unknown): PublishMode {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === PUBLISH_MODE_RFR) return PUBLISH_MODE_RFR
  // Canon default is direct; unknown/empty values fall back to direct.
  // (Unknown values are logged by getPublishMode so a typo'd row is visible.)
  return PUBLISH_MODE_DIRECT
}

type SettingsRow = { value?: unknown }

type MinimalSettingsClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: SettingsRow | null; error: { message: string } | null }>
      }
    }
  }
}

/**
 * Read the current publish_mode.
 *
 * Fallback is split by cause (3-fix N1, 2026-10-11):
 *   - No settings row (pre-migration / absent table content) → canon default
 *     ('direct'). The setting was never configured, so the canon initial
 *     value applies.
 *   - Actual query ERROR or thrown exception → 'rfr' (HOLD). A transient DB
 *     hiccup must never trigger an unreviewed publish; the safe direction
 *     is the human-checked hold, and the failure is logged so it is visible.
 * Never throws, never blocks the pipeline.
 */
export async function getPublishMode(
  supabase: MinimalSettingsClient,
  log: (msg: string) => void = () => {}
): Promise<PublishMode> {
  try {
    const { data, error } = await supabase
      .from('atlas_settings')
      .select('value')
      .eq('key', PUBLISH_MODE_KEY)
      .maybeSingle()
    if (error) {
      // 3-fix N1: a real read error holds at RFR — a transient DB hiccup
      // must never trigger an unreviewed publish.
      log(`[publish-mode] settings read failed (${error.message}); holding at '${PUBLISH_MODE_RFR}' (safe direction)`)
      return PUBLISH_MODE_RFR
    }
    if (!data || data.value == null) {
      log(`[publish-mode] no '${PUBLISH_MODE_KEY}' row; using canon default '${PUBLISH_MODE_DEFAULT}'`)
      return PUBLISH_MODE_DEFAULT
    }
    const mode = parsePublishMode(data.value)
    if (String(data.value).trim().toLowerCase() !== mode) {
      log(`[publish-mode] unrecognised value '${data.value}'; using canon default '${PUBLISH_MODE_DEFAULT}'`)
    }
    return mode
  } catch (e) {
    log(`[publish-mode] settings read threw (${e instanceof Error ? e.message : String(e)}); holding at '${PUBLISH_MODE_RFR}' (safe direction)`)
    return PUBLISH_MODE_RFR
  }
}
