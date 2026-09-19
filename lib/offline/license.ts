// lib/offline/license.ts — OFFLINE-DL-001 offline license math (pure, shared
// by the server route and the client; unit-tested).
//
// A download of PAID content is playable offline only while the license is
// valid:
//   validUntil = min(verifiedAt + 14 days, subscription_ends_at + grace)
//   grace = 0 if the subscription is cancelled (cancelled_at set), else 3 days
//   (covers a renewal date that passes on a road trip before the device can
//   re-verify — the webhook only moves subscription_ends_at on renewal).
// The license is re-verified (and extended) whenever the app is online; if
// the user is no longer entitled, all paid downloads are deleted.
// Free stories (is_free) don't need a license.

export const OFFLINE_LICENSE_DAYS = 14
export const OFFLINE_GRACE_DAYS = 3
export const OFFLINE_MAX_EPISODES = 10
export const OFFLINE_MAX_BYTES = 500 * 1024 * 1024

const DAY_MS = 24 * 60 * 60 * 1000

export interface OfflineLicense {
  userId: string
  entitled: boolean
  verifiedAt: string
  /** ISO time after which paid downloads refuse to play; null = not entitled. */
  validUntil: string | null
  subscriptionEndsAt: string | null
  cancelled: boolean
}

export function computeOfflineLicense(input: {
  userId: string
  entitled: boolean
  subscriptionEndsAt: string | null | undefined
  cancelledAt: string | null | undefined
  now?: Date
}): OfflineLicense {
  const now = input.now ?? new Date()
  const cancelled = Boolean(input.cancelledAt)
  const endsAt = input.subscriptionEndsAt ? new Date(input.subscriptionEndsAt) : null
  let validUntil: Date | null = null
  if (input.entitled) {
    validUntil = new Date(now.getTime() + OFFLINE_LICENSE_DAYS * DAY_MS)
    if (endsAt && !Number.isNaN(endsAt.getTime())) {
      const cap = new Date(endsAt.getTime() + (cancelled ? 0 : OFFLINE_GRACE_DAYS) * DAY_MS)
      if (cap < validUntil) validUntil = cap
    }
  }
  return {
    userId: input.userId,
    entitled: input.entitled,
    verifiedAt: now.toISOString(),
    validUntil: validUntil ? validUntil.toISOString() : null,
    subscriptionEndsAt: input.subscriptionEndsAt ?? null,
    cancelled,
  }
}

/** Can this download play right now? Free stories always can. */
export function canPlayOffline(
  episode: { isFree: boolean },
  license: Pick<OfflineLicense, 'validUntil'> | null | undefined,
  now: Date = new Date()
): boolean {
  if (episode.isFree) return true
  if (!license?.validUntil) return false
  return new Date(license.validUntil).getTime() > now.getTime()
}

export type DownloadCapCheck = { ok: true } | { ok: false; reason: 'max_episodes' | 'max_bytes' }

export function checkDownloadCaps(existing: { count: number; bytes: number }, incomingBytes: number): DownloadCapCheck {
  if (existing.count >= OFFLINE_MAX_EPISODES) return { ok: false, reason: 'max_episodes' }
  if (existing.bytes + Math.max(0, incomingBytes) > OFFLINE_MAX_BYTES) return { ok: false, reason: 'max_bytes' }
  return { ok: true }
}
