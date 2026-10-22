/**
 * lib/belleValidation.ts — Belle copy validators shared by the production
 * pipeline (run-next) and unit tests.
 *
 * BELLE-REPAIR-WRITE-INTEGRITY-001: `hasCompanionPresence` moved here verbatim
 * from app/api/admin/production-jobs/run-next/route.ts so the rule has a
 * single definition, plus the pure write-integrity helpers the series Belle
 * retry persist path uses (audit entry, continuity-pin resync, audio
 * invalidation scoping). All helpers are pure (no DB) so they are directly
 * unit-testable with production-shaped fixtures.
 */

import { hashScript } from './continuityPin'

/**
 * FIX-BELLE-SERIES-TEMPLATE-001: True when the outro acknowledges companion
 * presence (Belle as narrator/guide or listener as co-participant). Required
 * for series non-finale outros.
 *
 * BELLE-REPAIR-WRITE-INTEGRITY-001: extended with listener-as-co-participant
 * markers (`you know`, `sit with that`) per the canon COMPANION PRESENCE
 * definition in lib/belleGenerator.ts ("listener as co-participant ...
 * Creates intimate connection, not clinical summary"). Direct second-person
 * address ("now you know why... Sit with that for a moment") passes; flat
 * third-person plot recap with no listener address still fails.
 */
export function hasCompanionPresence(text: string): boolean {
  const companionMarkers = /\b(i'?m belle|belle here|you won't|you will|you can't|you know|alongside|join|discover|tune in|listen|next episode|stay tuned|coming back|keep listening|return|sit with that|we'll|we're|we've|we|our)\b/i
  return companionMarkers.test(text)
}

export { hashScript }

/** Audit entry recorded under script_json.series_generation on Belle repair. */
export interface BelleRepairAuditEntry {
  /** Action string naming the repair, e.g. 'series_belle_retry_repair'. */
  action: string
  /** ISO timestamp of the repair. */
  timestamp: string
  /** production_jobs id that performed the repair. */
  jobId: string
  /** Repaired story id. */
  storyId: string
  /** Episode number (null when unknown). */
  episodeNumber: number | null
  /** sha256 (lib/continuityPin hashScript) of the script before repair. */
  beforeHash: string
  /** sha256 (lib/continuityPin hashScript) of the script after repair. */
  afterHash: string
  repairedIntro: boolean
  repairedOutro: boolean
}

export function buildBelleRepairAuditEntry(args: {
  action?: string
  jobId: string
  storyId: string
  episodeNumber?: number | null
  beforeScript: string | null | undefined
  afterScript: string | null | undefined
  repairedIntro: boolean
  repairedOutro: boolean
  at?: string
}): BelleRepairAuditEntry {
  return {
    action: args.action || 'series_belle_retry_repair',
    timestamp: args.at || new Date().toISOString(),
    jobId: String(args.jobId),
    storyId: String(args.storyId),
    episodeNumber:
      typeof args.episodeNumber === 'number' ? args.episodeNumber : null,
    beforeHash: hashScript(args.beforeScript),
    afterHash: hashScript(args.afterScript),
    repairedIntro: Boolean(args.repairedIntro),
    repairedOutro: Boolean(args.repairedOutro),
  }
}

/**
 * Pure merge: append a Belle repair audit entry under
 * script_json.series_generation.belle_repair_audit (array, append-only).
 * Preserves every existing series_generation key (notably
 * continuity_pins_used).
 */
export function applyBelleRepairAudit(
  scriptJson: any,
  entry: BelleRepairAuditEntry
): Record<string, any> {
  const base =
    scriptJson && typeof scriptJson === 'object' ? { ...scriptJson } : {}
  const seriesGen =
    base.series_generation && typeof base.series_generation === 'object'
      ? { ...base.series_generation }
      : {}
  const prev = Array.isArray(seriesGen.belle_repair_audit)
    ? seriesGen.belle_repair_audit
    : []
  return {
    ...base,
    series_generation: {
      ...seriesGen,
      belle_repair_audit: [...prev, entry],
    },
  }
}

export interface DependentPinUpdate {
  id: string
  script_json: Record<string, any>
}

/**
 * Pure pin resync: for every dependent episode whose
 * script_json.series_generation.continuity_pins_used references the edited
 * story id with a STALE hash, return a replacement script_json with the pin
 * set to the edited episode's new script hash. Episodes that do not pin the
 * edited story, or already carry the new hash, produce no update. Never
 * touches siblings that do not depend on the edited episode.
 */
export function resyncContinuityPinsAfterRepair(
  dependentEpisodes: any[],
  editedStoryId: string,
  newScriptHash: string
): DependentPinUpdate[] {
  const updates: DependentPinUpdate[] = []
  for (const ep of dependentEpisodes || []) {
    if (!ep || String(ep.id) === String(editedStoryId)) continue
    const seriesGen = ep.script_json?.series_generation
    const pins =
      seriesGen && typeof seriesGen === 'object'
        ? (seriesGen.continuity_pins_used as Record<string, string> | undefined)
        : undefined
    if (!pins || typeof pins !== 'object') continue
    if (!(String(editedStoryId) in pins)) continue
    if (String(pins[String(editedStoryId)]) === String(newScriptHash)) continue
    updates.push({
      id: String(ep.id),
      script_json: {
        ...(ep.script_json && typeof ep.script_json === 'object'
          ? ep.script_json
          : {}),
        series_generation: {
          ...(typeof seriesGen === 'object' ? seriesGen : {}),
          continuity_pins_used: {
            ...(pins as Record<string, string>),
            [String(editedStoryId)]: String(newScriptHash),
          },
        },
      },
    })
  }
  return updates
}

/**
 * Column-level audio invalidation scoped to the ONE repaired episode row.
 * Outro repair nulls ONLY outro_audio_url + outro_with_music_url; intro
 * repair nulls ONLY announcement_url. Never siblings, never segments, music,
 * or mixes (audio_url / story_audio_url are mix-level and regenerate via the
 * doneByEp=false retry flags). The caller applies the result with
 * `.eq('id', repairedStoryId)` so no other row is touched.
 */
export function belleRepairAudioInvalidation(
  repairIntro: boolean,
  repairOutro: boolean
): Record<string, null> {
  return {
    ...(repairIntro ? { announcement_url: null } : {}),
    ...(repairOutro
      ? { outro_audio_url: null, outro_with_music_url: null }
      : {}),
  } as Record<string, null>
}
