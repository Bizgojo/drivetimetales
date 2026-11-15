// lib/quitPoint.ts — QUIT-POINT-001 (Marc, Nov 15, 2026): where in an episode a listener stopped.

/** QUIT-POINT-001: whole seconds, sane range only (0..6 h); anything else is left unset. */
export function quitPointFields(currentTime: unknown, totalDuration: unknown): { position_seconds?: number; duration_seconds?: number } {
  const pos = Number(currentTime), dur = Number(totalDuration)
  const out: { position_seconds?: number; duration_seconds?: number } = {}
  if (Number.isFinite(dur) && dur > 0 && dur <= 21600) out.duration_seconds = Math.round(dur)
  if (Number.isFinite(pos) && pos >= 0 && pos <= 21600 && (!out.duration_seconds || pos <= out.duration_seconds + 5)) out.position_seconds = Math.floor(pos)
  return out
}

