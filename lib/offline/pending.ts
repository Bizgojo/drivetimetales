// Persist download requests, never access tokens, across document navigation.
const prefix = 'et_pending_downloads:'
export function pendingDownloads(userId: string): string[] {
  try { const ids = JSON.parse(localStorage.getItem(prefix + userId) || '[]'); return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [] } catch { return [] }
}
export function rememberDownloads(userId: string, ids: string[]) {
  try { localStorage.setItem(prefix + userId, JSON.stringify(Array.from(new Set([...pendingDownloads(userId), ...ids])))) } catch {}
}
export function forgetDownloads(userId: string, ids: string[]) {
  try { localStorage.setItem(prefix + userId, JSON.stringify(pendingDownloads(userId).filter(id => !ids.includes(id)))) } catch {}
}
