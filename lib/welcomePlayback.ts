// lib/welcomePlayback.ts — WELCOME-PLAYED-GUARD-001 (2026-09-20)
//
// users.welcome_played must mean "the listener actually heard Belle's
// welcome", because it is the one-shot gate: once true, the welcome is never
// offered again.
//
// It was set from the audio element's 'ended' event alone. On iOS that event
// also fires spuriously — the same false-'ended' class the player already
// guards for story playback (ORION-PLAYER-QUIT-001: stalls, truncated
// streams, an element that never really started). Those guards sit BELOW the
// welcome branch in onEnded, so a false 'ended' during the welcome flipped
// the flag and the listener lost their welcome without hearing it.
//
// This predicate is the guard: the flag may only be written when the clip
// reached (near) its end, or — when the duration is unknown — played for at
// least MIN_PLAYED_SECONDS. An autoplay-blocked clip that never started
// reports currentTime 0, so it stays false and the listener gets another go.

/** How close to the end counts as "heard it" (matches the player's early-ended tolerance). */
export const END_TOLERANCE_SECONDS = 2.5
/** Fallback when duration is unknown (welcome clips run ~9s). */
export const MIN_PLAYED_SECONDS = 1.5

export interface WelcomeClipState {
  currentTime?: number | null
  duration?: number | null
}

export function welcomeClipCompleted(clip: WelcomeClipState | null | undefined): boolean {
  if (!clip) return false
  const currentTime = Number(clip.currentTime)
  if (!Number.isFinite(currentTime) || currentTime <= 0) return false

  const duration = Number(clip.duration)
  const hasDuration = Number.isFinite(duration) && duration > 0
  if (hasDuration) return currentTime >= duration - END_TOLERANCE_SECONDS
  return currentTime >= MIN_PLAYED_SECONDS
}
