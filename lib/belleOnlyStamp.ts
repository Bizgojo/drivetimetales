/**
 * BELLE-ONLY-STAMP-001 (Nov 4, 2026).
 *
 * The hook gate fails "stale audio" when stories.script was edited after
 * stories.segments_generated_at. The generateBelleOnly path re-voices only the
 * Belle intro/outro and never stamped that time, so a Belle-line edit (Sunset
 * EP3) could never pass the gate.
 *
 * Stamp only when ALL hold:
 *  - a person confirmed the edit touched only Belle lines (flag sent by hand),
 *  - the Belle-only run succeeded,
 *  - at least one Belle line was actually regenerated in this run.
 * The flag is never set automatically, so story-line edits still fail the
 * gate until the story lines are re-voiced.
 */

type BelleStatus = 'generated' | 'skipped_existing' | 'missing_script_line' | 'failed'

export function shouldStampAfterBelleOnly(input: {
  confirmed: boolean
  success: boolean
  introStatus: BelleStatus
  outroStatus: BelleStatus
}): boolean {
  if (!input.confirmed || !input.success) return false
  return input.introStatus === 'generated' || input.outroStatus === 'generated'
}
