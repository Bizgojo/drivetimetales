/**
 * SFX-LIBRARY-001 (Marc 2026-10-29): use real recorded sound effects from our
 * own curated library before asking ElevenLabs to invent one. AI-made effects
 * were the source of wrong / out-of-place sounds (Chicago phone buzz).
 *
 * Library = audio files in storage under sfx-library/ plus one manifest
 * (sfx-library/manifest.json) listing every file with searchable words.
 * Files are added by scripts/sfx-library-ingest.ts (Sonniss GDC bundles,
 * sounds Marc exports from Soundly, ...). Matching is deterministic word
 * overlap: a cue like "[SFX: pistol shot, close]" picks the library file
 * whose name/tags share the most meaningful words. No match good enough →
 * caller falls back to ElevenLabs exactly as before.
 */

export const SFX_LIBRARY_PREFIX = 'sfx-library'
export const SFX_LIBRARY_MANIFEST = `${SFX_LIBRARY_PREFIX}/manifest.json`

export type SfxLibraryEntry = {
  id: string
  path: string // storage path inside the audio bucket
  name: string // human description, e.g. "Pistol shot close indoor"
  tags: string[] // normalized search words
  durationSec?: number
  source?: string // sonniss | soundly | ...
  license?: string
  /** SFX-REVIEW-001: Marc's ear decides. Only 'approved' sounds are used in stories. */
  status?: 'approved' | 'rejected'
  reviewedAt?: string
  /** SFX-PREFILTER-001: 'auto-prefilter' when removed automatically (Marc can restore). */
  reviewedBy?: string
  reviewNote?: string
}

export const SFX_CATEGORIES = [
  'Guns', 'Fights & hits', 'Vehicles', 'Doors', 'Footsteps', 'Phones', 'Glass & breaking', 'Sirens', 'Weather', 'City & crowds', 'Other',
] as const
export type SfxCategory = (typeof SFX_CATEGORIES)[number]

/** Rough grouping for the review page, from the file's words. */
export function sfxCategory(entry: Pick<SfxLibraryEntry, 'id' | 'name' | 'tags'>): SfxCategory {
  const t = ` ${[entry.id, entry.name, ...(entry.tags || [])].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  const has = (re: RegExp) => re.test(t)
  if (has(/ (gun|glock|pistol|rifle|weap|weapon|cartridge|gunmech|shot|firing) /)) return 'Guns'
  if (has(/ (siren|sirens|vehsirn) /)) return 'Sirens'
  if (has(/ (door|doors|gate|doorknck|doorwood|doormetl|doorhdwr|vehdoor|trunk|elevator|lift|machelev|knock) /)) return 'Doors'
  if (has(/ (glass|shatter|break|collapse|debris|explosion) /)) return 'Glass & breaking'
  if (has(/ (punch|grunt|hit|hits|impact|slash|scream|slasher|swsh|swing|woodimpt) /)) return 'Fights & hits'
  if (has(/ (footstep|footsteps|step|steps|walk|feet|feethors) /)) return 'Footsteps'
  if (has(/ (phone|dial|keypad|smartphone|swipe) /)) return 'Phones'
  if (has(/ (rain|thunder|thun|wind|hail|storm|rainconc|rainvege) /)) return 'Weather'
  if (has(/ (car|engine|truck|suv|ford|harley|moto|vehmoto|bus|tram|train|ambulance|volvo|isuzu|kia|scania|vw|golf|sprint|aston|ferrari|tractor|bike|vehicle|ignition|steering|wiper|zil|bumper|infanterikanonvagn|brdm2|polaris|textron) /)) return 'Vehicles'
  if (has(/ (amb|city|crowd|traffic|market|street|pub|park|urban|amburbn|ambrest|ambmrkt|ambpubl|ambsubn|plaza|town|walla) /)) return 'City & crowds'
  return 'Other'
}

export type SfxLibraryManifest = { version: 1; updatedAt: string; entries: SfxLibraryEntry[] }

const STOP = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'from', 'with', 'into', 'onto', 'over', 'under',
  'sfx', 'sound', 'sounds', 'effect', 'fx', 'faint', 'faintly', 'distant', 'soft', 'softly', 'loud', 'loudly',
  'single', 'one', 'two', 'some', 'small', 'big', 'large', 'quick', 'slow', 'slowly', 'sudden', 'suddenly', 'low',
  'high', 'heavy', 'light', 'beat', 'silence', 'then', 'as', 'is', 'are', 'by', 'for', 'its', 'his', 'her', 'their',
  'off', 'up', 'down', 'out', 'away', 'back', 'nearby', 'somewhere', 'outside', 'inside', 'background', 'sec', 'secs',
  'second', 'seconds', 'wav', 'mp3', 'flac', 'aif', 'aiff', 'v1', 'v2', 'v3', 'take', 'var', 'variation', 'mono', 'stereo',
  'ms', 'm', 's', 'stereoized', 'library', 'pack', 'sonniss', 'gdc', 'bundle',
])

/** Words that mean the same thing for matching purposes. */
const SYNONYMS: Record<string, string> = {
  gunshot: 'gun', gunshots: 'gun', gunfire: 'gun', guns: 'gun', pistol: 'gun', handgun: 'gun', revolver: 'gun',
  rifle: 'gun', shotgun: 'gun', shots: 'shot', fired: 'shot', firing: 'shot', fire: 'shot',
  car: 'vehicle', cars: 'vehicle', truck: 'vehicle', trucks: 'vehicle', sedan: 'vehicle', suv: 'vehicle', van: 'vehicle', vehicles: 'vehicle', auto: 'vehicle',
  tyre: 'tire', tyres: 'tire', tires: 'tire', screech: 'skid', screeching: 'skid', squeal: 'skid', squealing: 'skid', skidding: 'skid', skids: 'skid',
  doors: 'door', slams: 'slam', slammed: 'slam', slamming: 'slam', shuts: 'close', shut: 'close', closing: 'close', closes: 'close', closed: 'close',
  opens: 'open', opening: 'open', opened: 'open',
  footsteps: 'footsteps', footstep: 'footsteps', steps: 'footsteps', step: 'footsteps', walking: 'footsteps', walk: 'footsteps', running: 'run', runs: 'run', ran: 'run',
  phone: 'phone', cellphone: 'phone', smartphone: 'phone', mobile: 'phone', buzz: 'vibrate', buzzing: 'vibrate', buzzes: 'vibrate', vibrating: 'vibrate', vibration: 'vibrate',
  ringing: 'ring', rings: 'ring', rang: 'ring', ringtone: 'ring',
  punches: 'punch', punching: 'punch', punched: 'punch', hit: 'punch', hits: 'punch', blow: 'punch',
  glass: 'glass', shatter: 'break', shattering: 'break', shatters: 'break', smash: 'break', smashing: 'break', breaks: 'break', breaking: 'break', crash: 'crash', crashes: 'crash', crashing: 'crash',
  knocks: 'knock', knocking: 'knock', knocked: 'knock',
  rain: 'rain', raining: 'rain', thunder: 'thunder', thunderclap: 'thunder', wind: 'wind', windy: 'wind',
  siren: 'siren', sirens: 'siren', police: 'police', engine: 'engine', engines: 'engine', revs: 'rev', revving: 'rev',
  keys: 'keys', key: 'keys', jingle: 'keys', crowd: 'crowd', crowds: 'crowd', people: 'crowd',
  birds: 'bird', dog: 'dog', dogs: 'dog', barking: 'bark', barks: 'bark',
}

/** Light, symmetric stemming (applied to cues and library names alike). */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 5 && w.endsWith('ed')) return w.slice(0, -2)
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Turn any text (cue, file name, UCS name) into normalized search words. */
export function sfxWords(text: string): string[] {
  const spaced = String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase → words (UCS CatIDs like WEAPGun)
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-./(),:;!?"'[\]{}]+/g, ' ')
  const out: string[] = []
  for (const raw of spaced.split(/\s+/)) {
    if (!raw || /^\d+$/.test(raw) || raw.length < 2) continue
    if (STOP.has(raw)) continue
    const w = SYNONYMS[raw] || stem(raw)
    if (!w || STOP.has(w)) continue
    if (!out.includes(w)) out.push(w)
  }
  return out
}

/** Words that carry the meaning of a cue (the "what"), weighted higher. */
const KEY_NOUNS = new Set([
  'gun', 'shot', 'vehicle', 'tire', 'skid', 'door', 'footsteps', 'run', 'phone', 'vibrate', 'ring', 'punch', 'glass', 'break',
  'crash', 'knock', 'rain', 'thunder', 'wind', 'siren', 'engine', 'rev', 'keys', 'crowd', 'bird', 'dog', 'bark', 'slam',
  'explosion', 'helicopter', 'train', 'water', 'river', 'clock', 'bell', 'scream', 'gasp', 'fight', 'body', 'fall',
])

export type SfxMatch = { entry: SfxLibraryEntry; score: number; matched: string[] }

/**
 * Best library entry for a cue, or null when nothing fits well enough.
 * Requires at least one key noun in common and a minimum overlap score, so
 * "door slam" never picks a gunshot just because both say "close".
 */
export function matchSfxCue(cue: string, entries: SfxLibraryEntry[], minScore = 3): SfxMatch | null {
  const cueWords = sfxWords(cue)
  if (!cueWords.length) return null
  let best: SfxMatch | null = null
  for (const entry of entries) {
    const entryWords = new Set([...(entry.tags || []), ...sfxWords(entry.name)])
    const matched = cueWords.filter((w) => entryWords.has(w))
    if (!matched.some((w) => KEY_NOUNS.has(w))) continue
    let score = 0
    for (const w of matched) score += KEY_NOUNS.has(w) ? 3 : 1
    // Prefer entries that are mostly about this cue (fewer unrelated words).
    score -= Math.max(0, entryWords.size - matched.length) * 0.1
    if (score < minScore) continue
    if (!best || score > best.score || (score === best.score && entry.id < best.entry.id)) best = { entry, score, matched }
  }
  return best
}

/**
 * SFX-ROTATE-001 (Marc 2026-10-30): when several kept takes fit a cue equally
 * well, use a different one at different places in a story instead of the
 * same recording every time. Deterministic per seed (story + line), so a
 * re-render picks the same take again.
 */
export function rankSfxCandidates(cue: string, entries: SfxLibraryEntry[], minScore = 3): SfxMatch[] {
  const out: SfxMatch[] = []
  for (const entry of entries) {
    const m = matchSfxCue(cue, [entry], minScore)
    if (m) out.push(m)
  }
  return out.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
}

export function seedHash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}

/** Best match, rotating among takes that score within 0.5 of the best. */
export function pickSfxVariant(cue: string, entries: SfxLibraryEntry[], seed: string): SfxMatch | null {
  const ranked = rankSfxCandidates(cue, entries)
  if (!ranked.length) return null
  const top = ranked.filter((m) => m.score >= ranked[0].score - 0.5)
  return top[seedHash(seed) % top.length]
}

export function sfxLibraryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_LIBRARY || '').trim().toLowerCase() === 'on'
}

let cached: { at: number; manifest: SfxLibraryManifest | null } | null = null
const CACHE_MS = 5 * 60_000

/** Manifest from the public storage URL (cached 5 min per process). */
export async function loadSfxLibrary(publicBaseUrl: string): Promise<SfxLibraryManifest | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.manifest
  try {
    const res = await fetch(`${publicBaseUrl}/${SFX_LIBRARY_MANIFEST}?v=${Date.now()}`, { cache: 'no-store' })
    const manifest = res.ok ? ((await res.json()) as SfxLibraryManifest) : null
    cached = { at: Date.now(), manifest: manifest && Array.isArray(manifest.entries) ? manifest : null }
  } catch {
    cached = { at: Date.now(), manifest: null }
  }
  return cached.manifest
}

/**
 * Library audio for a cue, or null (caller then uses ElevenLabs).
 * publicBaseUrl = `${SUPABASE_URL}/storage/v1/object/public/audio`.
 */
export async function librarySfxForCue(cue: string, publicBaseUrl: string, log: (m: string) => void = () => {}, seed = ''): Promise<{ audio: Buffer; match: SfxMatch } | null> {
  if (!sfxLibraryEnabled()) return null
  const manifest = await loadSfxLibrary(publicBaseUrl)
  if (!manifest?.entries?.length) return null
  // SFX-REVIEW-001: only sounds Marc approved by ear are ever used.
  const approved = manifest.entries.filter((e) => e.status === 'approved')
  if (!approved.length) return null
  const match = seed ? pickSfxVariant(cue, approved, seed) : matchSfxCue(cue, approved)
  if (!match) {
    log(`[SFX-LIBRARY-001] no library match for "${cue}" — using ElevenLabs`)
    return null
  }
  try {
    const res = await fetch(`${publicBaseUrl}/${match.entry.path}`)
    if (!res.ok) return null
    const audio = Buffer.from(await res.arrayBuffer())
    if (audio.length < 1024) return null
    log(`[SFX-LIBRARY-001] "${cue}" → library "${match.entry.name}" (score ${match.score.toFixed(1)}; ${match.matched.join(', ')})`)
    return { audio, match }
  } catch {
    return null
  }
}
