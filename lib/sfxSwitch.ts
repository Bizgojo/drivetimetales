/**
 * SFX-ALL-OFF-001 (Marc 2026-11-01): "turn the sounds off until we have a
 * professional library." SFX_OFF=on treats every story as sfx_disabled:
 * no [SFX:] clips are generated (no ElevenLabs credits spent on them), and
 * the final mix plays no sound effects at all — script cues, extra effects
 * and backgrounds. Voices and music are unchanged. Remove SFX_OFF to undo.
 * Episodes made while it was on keep their [SFX:] cues in the script, so their
 * effects can be added later: make the effect clips, then re-run the final mix
 * (voices are not re-recorded).
 */
export function sfxGloballyOff(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_OFF || '').trim().toLowerCase() === 'on'
}

/**
 * SOUNDSNAP-ONLY-001 (Marc 2026-11-03): "I do not want to use any old sounds
 * or ElevenLabs sounds, only Soundsnap." On by default. While on:
 *   - the only effect path is the catalog planner (licensed Soundsnap takes);
 *     any mix that isn't in catalog mode gets NO effects at all
 *     (no script sfx_*.mp3 clips, no library search, no ElevenLabs fallback);
 *   - no [SFX:] clips are generated with ElevenLabs during voicing.
 * SFX_SOUNDSNAP_ONLY=off restores the old behaviour (not recommended).
 */
export function soundsnapOnly(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_SOUNDSNAP_ONLY || '').trim().toLowerCase() !== 'off'
}
