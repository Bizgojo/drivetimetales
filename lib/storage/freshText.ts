/**
 * SFX-MANIFEST-FRESH-001 (Orion, Don't Go Home EP1 Sound Ideas preview, Nov 11
 * 2026): the authenticated SDK download of the SFX library manifest and the
 * SFX catalog returned a CDN-cached copy ~30 minutes old, so a catalog build
 * ran on stale input and an ingest pass rewrote the manifest from an old copy.
 * Same defect as VERIFY-READ-001. Read these small JSON files through the
 * public URL with a cache-buster and no-store; fall back to the SDK read.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function downloadFreshText(
  db: SupabaseClient,
  path: string,
  fetchImpl: typeof fetch = fetch,
  bucket = 'audio',
): Promise<string | null> {
  try {
    const publicUrl = db.storage.from(bucket).getPublicUrl(path).data.publicUrl
    if (publicUrl) {
      const sep = publicUrl.includes('?') ? '&' : '?'
      const res = await fetchImpl(`${publicUrl}${sep}cb=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      if (res.ok) return await res.text()
      if (res.status === 404 || res.status === 400) return null
    }
  } catch { /* fall back to the SDK read */ }
  const { data } = await db.storage.from(bucket).download(path)
  return data ? await data.text() : null
}
