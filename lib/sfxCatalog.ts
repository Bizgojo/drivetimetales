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
  // SFX-TEST-LICENSED-ONLY-001 (Marc 2026-11-02): test mixes use only the
  // Soundsnap sounds Marc picked — never the old kept-library sounds.
  if (mode === 'test') return t.source === 'licensed' && t.status !== 'discarded'
  // SOUNDSNAP-ONLY-001: production too — an approved take must also be a licensed (Soundsnap) sound.
  return t.status === 'approved' && t.source === 'licensed'
}

/**
 * SFX-REPLACE-001 (Marc 2026-11-02): mark takes as discarded when their
 * library ID contains any of the given words (e.g. "cz75-tail" drops the weak
 * "TAIL" pistol shots so the new close shots can take their place). A
 * discarded sound never comes back. Safe to run again.
 */
export function discardTakes(catalog: CatalogFile, matchers: string[]): { catalog: CatalogFile; discarded: string[] } {
  const words = matchers.map((m) => m.trim().toLowerCase()).filter(Boolean)
  const discarded: string[] = []
  if (!words.length) return { catalog, discarded }
  const now = new Date().toISOString()
  const entries: CatalogFile['entries'] = {}
  for (const [id, entry] of Object.entries(catalog.entries)) {
    entries[id] = {
      takes: entry.takes.map((t) => {
        if (t.status === 'discarded' || !words.some((w) => t.libraryId.toLowerCase().includes(w))) return t
        discarded.push(`${id} ${t.libraryId}`)
        return { ...t, status: 'discarded' as const, reviewedAt: now }
      }),
    }
  }
  return { catalog: { ...catalog, updatedAt: now, entries }, discarded }
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

/**
 * SFX-SOUNDSNAP-001 (Marc 2026-11-02, Soundsnap approved): licensed sounds are
 * downloaded into one folder per catalog name (…/soundsnap/ALL-01/<file>), so
 * ingest gives them ids like "soundsnap/all-01/<slug>". The folder decides the
 * name — no word guessing.
 */
export function catalogIdFromLibraryId(libraryId: string, names: CatalogName[] = SFX_CATALOG_NAMES): string | null {
  const m = String(libraryId || '').toLowerCase().match(/^[a-z0-9-]+\/([a-z]{2,3})-(\d{1,3})(?:\/|-)/)
  if (!m) return null
  const id = `${m[1].toUpperCase()}-${m[2].padStart(2, '0')}`
  return names.some((n) => n.id === id) ? id : null
}

/**
 * Licensed sounds go to their catalog name as candidates (up to 3 kept per
 * name). They come first: a kept-library candidate gives up its slot to a
 * licensed one. Approved and discarded takes are never touched, and a
 * discarded sound never comes back.
 */
export function addLicensedTakes(catalog: CatalogFile, licensed: SfxLibraryEntry[], names: CatalogName[] = SFX_CATALOG_NAMES): { catalog: CatalogFile; added: number; byName: Record<string, number> } {
  const next: CatalogFile = { ...catalog, updatedAt: new Date().toISOString(), entries: { ...catalog.entries } }
  const groups = new Map<string, SfxLibraryEntry[]>()
  for (const e of licensed) {
    if (e.status === 'rejected') continue
    const id = catalogIdFromLibraryId(e.id, names)
    if (!id) continue
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id)!.push(e)
  }
  let added = 0
  const byName: Record<string, number> = {}
  for (const [id, entries] of groups) {
    const existing = [...(next.entries[id]?.takes || [])]
    const known = new Set(existing.map((t) => t.libraryId))
    const fresh = entries.filter((e) => !known.has(e.id)).sort((a, b) => a.id.localeCompare(b.id))
    let takes = existing
    for (const e of fresh) {
      const active = takes.filter((t) => t.status !== 'discarded')
      const take: CatalogTake = { libraryId: e.id, path: e.path, name: e.name, source: 'licensed', status: 'candidate' }
      if (active.length < TAKES_PER_NAME) { takes = [...takes, take]; added += 1; byName[id] = (byName[id] || 0) + 1; continue }
      const bump = takes.findIndex((t) => t.status === 'candidate' && t.source === 'kept-library')
      if (bump < 0) break
      takes = [...takes.slice(0, bump), ...takes.slice(bump + 1), take]
      added += 1
      byName[id] = (byName[id] || 0) + 1
    }
    next.entries[id] = { takes }
  }
  return { catalog: next, added, byName }
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
