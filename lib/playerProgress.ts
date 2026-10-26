'use client'

export type PlayerProgressRecord = {
  storyId: string
  progress: number
  completed: boolean
  durationSecs: number | null
  updatedAt: string
}

const PROGRESS_KEY_PREFIX = 'et_player_progress'

function storageKey(userId?: string | null) {
  return `${PROGRESS_KEY_PREFIX}:${userId || 'guest'}`
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readProgressMap(userId?: string | null): Record<string, PlayerProgressRecord> {
  if (!canUseStorage()) return {}
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeProgressMap(userId: string | null | undefined, value: Record<string, PlayerProgressRecord>) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(value))
  } catch {
    // Storage can be unavailable in private mode or when the quota is full.
  }
}

export function getLocalPlayerProgress(storyId: string, userId?: string | null): PlayerProgressRecord | null {
  if (!storyId) return null
  const record = readProgressMap(userId)[storyId]
  if (!record || typeof record !== 'object') return null
  const progress = Number(record.progress)
  if (!Number.isFinite(progress) || progress < 0) return null
  return {
    storyId,
    progress: Math.floor(progress),
    completed: Boolean(record.completed),
    durationSecs: Number.isFinite(Number(record.durationSecs)) && Number(record.durationSecs) > 0
      ? Math.floor(Number(record.durationSecs))
      : null,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
  }
}

export function saveLocalPlayerProgress(
  storyId: string,
  progressSeconds: number,
  options: { userId?: string | null; completed?: boolean; durationSecs?: number | null } = {}
) {
  if (!storyId) return
  const progress = Math.floor(progressSeconds)
  if (!Number.isFinite(progress) || progress < 0) return

  const existing = getLocalPlayerProgress(storyId, options.userId)
  const completed = Boolean(options.completed || existing?.completed)
  const durationSecs = Number.isFinite(Number(options.durationSecs)) && Number(options.durationSecs) > 0
    ? Math.floor(Number(options.durationSecs))
    : existing?.durationSecs ?? null

  // Resume follows the last listening position, including an intentional rewind.
  // Completion remains sticky independently of the current position.
  const nextProgress = progress

  const map = readProgressMap(options.userId)
  map[storyId] = {
    storyId,
    progress: nextProgress,
    completed,
    durationSecs,
    updatedAt: new Date().toISOString(),
  }
  writeProgressMap(options.userId, map)
}

export function getAllLocalPlayerProgress(userId?: string | null) {
  return readProgressMap(userId)
}

export function clearLocalPlayerProgress(storyId: string, userId?: string | null) {
  if (!storyId) return
  const map = readProgressMap(userId)
  if (!map[storyId]) return
  delete map[storyId]
  writeProgressMap(userId, map)
}

export function mergePlayerProgress(
  server: { progress?: number | null; completed?: boolean | null; last_played?: string | null } | null | undefined,
  local: PlayerProgressRecord | null | undefined
) {
  const serverProgress = Number(server?.progress || 0)
  const localProgress = Number(local?.progress || 0)
  const completed = Boolean(server?.completed || local?.completed)
  const serverTime = Date.parse(server?.last_played || '')
  const localTime = Date.parse(local?.updatedAt || '')
  // A newer local seek must survive refresh even while the server write is pending.
  // A newer server position still wins when listening continues on another device.
  const useLocal = Boolean(local) && (!server || !Number.isFinite(serverTime)
    || (Number.isFinite(localTime) && localTime >= serverTime))
  const progress = useLocal ? localProgress : serverProgress
  return {
    progress: Number.isFinite(progress) && progress > 0 ? Math.floor(progress) : 0,
    completed,
  }
}
