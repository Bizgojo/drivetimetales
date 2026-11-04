/**
 * BELLE-ONLY-STAMP-001 (Nov 4, 2026).
 *
 * The hook gate fails "stale audio" when stories.script was edited after
 * stories.segments_generated_at. The generateBelleOnly path re-voices only the
 * Belle intro/outro and never stamped that time, so a Belle-line edit (Sunset
 * EP3) could never pass the gate.
 *
 * The caller names which Belle line(s) a person confirmed were the ONLY edit:
 * 'intro', 'outro' or 'both'. Stamp only when:
 *  - that confirmation is present (sent by hand, never automatic),
 *  - the Belle-only run succeeded,
 *  - every confirmed-edited line was regenerated in THIS run.
 * So an edited intro that was skipped (old file kept) never gets stamped over.
 */

type BelleStatus = 'generated' | 'skipped_existing' | 'missing_script_line' | 'failed'
export type BelleEditedLines = 'intro' | 'outro' | 'both'

export function parseBelleEditedLines(value: unknown): BelleEditedLines | null {
  return value === 'intro' || value === 'outro' || value === 'both' ? value : null
}

export function shouldStampAfterBelleOnly(input: {
  editedLines: BelleEditedLines | null
  success: boolean
  introStatus: BelleStatus
  outroStatus: BelleStatus
}): boolean {
  if (!input.editedLines || !input.success) return false
  const needIntro = input.editedLines === 'intro' || input.editedLines === 'both'
  const needOutro = input.editedLines === 'outro' || input.editedLines === 'both'
  if (needIntro && input.introStatus !== 'generated') return false
  if (needOutro && input.outroStatus !== 'generated') return false
  return true
}
