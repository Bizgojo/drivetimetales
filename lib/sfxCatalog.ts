/**
 * SFX-CATALOG-001 (Marc 2026-10-31): "only allow [Claude] to use those calls
 * for SFX … if the sound he is looking for is not there he does not go to a
 * backup, he just eliminates that sound request."
 *
 * The catalog = fixed names (lib/sfxCatalogNames.ts) + up to 3 takes each,
 * stored in audio/sfx-library/catalog.json. Claude picks a catalog ID or
 * nothing. No ElevenLabs fallback, no free-text search.
 *
 * A take is usable when:
 *   - status 'approved' (Marc approved it for this name), or
 *   - in TEST mode only, it came from a sound Marc already kept in the
 *     library review (source 'kept-library'), even before he approves it
 *     for this name.
 * Production rule (later): a name is live only with 3 approved takes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { SFX_CATALOG_NAMES, type CatalogKind, type CatalogName } from '@/lib/sfxCatalogNames'
import { rankSfxCandidates, seedHash, type SfxLibraryEntry } from '@/lib/sfxLibrary'

export const SFX_CATALOG_FILE = 'sfx-library/catalog.json'
export const TAKES_PER_NAME = 3

export type CatalogTake = {
  libraryId: string
  path: string
  name: string
  source: 'kept-library' | 'licensed'
  status: 'candidate' | 'approved' | 'discarded'
  reviewedAt?: string
}

export type CatalogFile = {
  version: 1
  updatedAt: string
  entries: Record<string, { takes: CatalogTake[] }>
}

export type LiveName = CatalogName & { takes: CatalogTake[] }

export function emptyCatalog(): CatalogFile {
  return { version: 1, updatedAt: new Date().toISOString(), entries: {} }
}

export async function loadCatalog(db: SupabaseClient): Promise<CatalogFile> {
  const { data } = await db.storage.from('audio').download(SFX_CATALOG_FILE)
  if (!data) return emptyCatalog()
  try { return JSON.parse(await data.text()) as CatalogFile } catch { return emptyCatalog() }
}

function usable(t: CatalogTake, mode: 'test' | 'production'): boolean {
  if (t.status === 'approved') return true
  return mode === 'test' && t.status === 'candidate' && t.source === 'kept-library'
}

/** Names Claude may use right now, each with its usable takes. */
export function liveNames(catalog: CatalogFile, mode: 'test' | 'production', names: CatalogName[] = SFX_CATALOG_NAMES): LiveName[] {
  const out: LiveName[] = []
  for (const n of names) {
    const takes = (catalog.entries[n.id]?.takes || []).filter((t) => usable(t, mode))
    const enough = mode === 'production' ? takes.length >= TAKES_PER_NAME : takes.length >= 1
    if (enough) out.push({ ...n, takes })
  }
  return out
}

/** Same place in a story → same take; different places rotate. */
export function pickCatalogTake(name: LiveName, seed: string): CatalogTake {
  return name.takes[seedHash(seed) % name.takes.length]
}

/**
 * Propose up to 3 takes per name from sounds Marc already kept, without
 * touching names he has reviewed (any approved or discarded take). A sound is
 * never proposed for a take it was discarded from.
 */
export function proposeTakesFromKeptLibrary(catalog: CatalogFile, kept: SfxLibraryEntry[], names: CatalogName[] = SFX_CATALOG_NAMES): { catalog: CatalogFile; filled: number; empty: string[] } {
  const next: CatalogFile = { ...catalog, updatedAt: new Date().toISOString(), entries: { ...catalog.entries } }
  let filled = 0
  const empty: string[] = []
  for (const n of names) {
    const existing = next.entries[n.id]?.takes || []
    const reviewed = existing.some((t) => t.status !== 'candidate')
    if (reviewed) continue
    const discarded = new Set(existing.filter((t) => t.status === 'discarded').map((t) => t.libraryId))
    const ranked = rankSfxCandidates(n.name, kept.filter((e) => !discarded.has(e.id)), 3).slice(0, TAKES_PER_NAME)
    const takes: CatalogTake[] = ranked.map((m) => ({ libraryId: m.entry.id, path: m.entry.path, name: m.entry.name, source: 'kept-library', status: 'candidate' }))
    next.entries[n.id] = { takes }
    if (takes.length) filled += 1
    else empty.push(n.id)
  }
  return { catalog: next, filled, empty }
}

export function catalogKind(id: string, names: CatalogName[] = SFX_CATALOG_NAMES): CatalogKind | null {
  return names.find((n) => n.id === id)?.kind || null
}

/** The list Claude sees: "CR-01: Pistol, single shot, indoor (spot)". */
export function catalogPromptList(live: CatalogName[]): string {
  return live.map((n) => `${n.id}: ${n.name} (${n.kind})`).join('\n')
}

/** Which planner a render uses: the catalog for v4 tests or when SFX_PLANNER=catalog. */
export function catalogPlannerEnabled(tag?: string | null, env: Record<string, string | undefined> = process.env): boolean {
  if (tag && /^v4/i.test(String(tag))) return true
  return String(env.SFX_PLANNER || '').trim().toLowerCase() === 'catalog'
}
