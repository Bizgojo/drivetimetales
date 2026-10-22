/**
 * BELLE-OUTRO-RECORDING-001
 *
 * A composite must never satisfy the requirement for a standalone outro
 * recording. `outro_with_music.mp3` is a render OUTPUT (outro voice + music
 * bed); matching it via `startsWith('outro_')` lets generation skip voicing
 * and lets rendering bake stale audio (Creek Ep1, 2026-10-22: corrected
 * outro text marked done with no new recording).
 *
 * Standalone recordings: `outro.mp3`, `outro_<index>.mp3`.
 * Excluded: `outro_corrected*` (separate canon priority, SUNSET-MIX-SPEC-001),
 * `*_with_music*` composites, and anything else (e.g. story_body_with_outro).
 */
export function isStandaloneOutroRecording(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  if (name.includes('_with_music')) return false
  if (name.startsWith('outro_corrected')) return false
  return name === 'outro.mp3' || name.startsWith('outro_')
}
