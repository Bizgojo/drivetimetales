/**
 * SFX-ALL-OFF-001 (Marc 2026-11-01): "turn the sounds off until we have a
 * professional library." SFX_OFF=on treats every story as sfx_disabled:
 * no [SFX:] clips are generated (no ElevenLabs credits spent on them), and
 * the final mix plays no sound effects at all — script cues, extra effects
 * and backgrounds. Voices and music are unchanged. Remove SFX_OFF to undo;
 * an episode mixed while it was on has no effect files until it is re-voiced.
 */
export function sfxGloballyOff(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_OFF || '').trim().toLowerCase() === 'on'
}
