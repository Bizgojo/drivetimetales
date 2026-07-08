/**
 * Genre Attributes — GENRE-ATTRIBUTES-SPEC v1.0
 * feature/genre-attributes-blp
 *
 * Provides DB-backed genre attribute lookups for BLP, Hal briefs, and cover generation.
 * Aliases (alias_of != null) automatically delegate to the parent genre's attributes.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface GenreAttributes {
  name: string
  listener_contract: string | null
  pacing_profile: string | null
  ending_contract: string | null
  ending_failure_modes: string | null
  sound_profile: string | null
  narrator_register: string | null
  cover_art_guidance: string | null
  adjacency_group: string | null
  hard_rules: string | null
  alias_of: string | null
}

/** Cache to avoid repeat DB round-trips within a single request lifecycle */
const _cache = new Map<string, GenreAttributes | null>()

/**
 * Look up genre attributes by name. Follows alias_of one level deep.
 * Returns null if the genre is not found or has no attributes populated.
 */
export async function getGenreAttributes(genreName: string): Promise<GenreAttributes | null> {
  const key = genreName.toLowerCase().trim()
  if (_cache.has(key)) return _cache.get(key)!

  const { data, error } = await supabase
    .from('genres')
    .select('name, listener_contract, pacing_profile, ending_contract, ending_failure_modes, sound_profile, narrator_register, cover_art_guidance, adjacency_group, hard_rules, alias_of')
    .ilike('name', genreName.trim())
    .single()

  if (error || !data) {
    _cache.set(key, null)
    return null
  }

  // Follow alias_of one level deep
  if (data.alias_of) {
    const parentKey = data.alias_of.toLowerCase().trim()
    if (_cache.has(parentKey)) {
      const parentAttr = _cache.get(parentKey)!
      _cache.set(key, parentAttr)
      return parentAttr
    }

    const { data: parentData, error: parentError } = await supabase
      .from('genres')
      .select('name, listener_contract, pacing_profile, ending_contract, ending_failure_modes, sound_profile, narrator_register, cover_art_guidance, adjacency_group, hard_rules, alias_of')
      .ilike('name', data.alias_of.trim())
      .single()

    if (parentError || !parentData) {
      _cache.set(key, null)
      return null
    }

    const parentAttr = parentData as GenreAttributes
    _cache.set(parentKey, parentAttr)
    _cache.set(key, parentAttr)
    return parentAttr
  }

  const attr = data as GenreAttributes
  _cache.set(key, attr)
  return attr
}

/**
 * Parse hard_rules text (bullet or JSON array) into an array of rule strings.
 */
export function parseHardRules(hardRules: string | null): string[] {
  if (!hardRules) return []
  const trimmed = hardRules.trim()

  // Try JSON array first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map((r: unknown) => String(r)).filter(Boolean)
    } catch {
      // fall through to bullet parse
    }
  }

  // Parse bullet-separated (•, -, *, or newlines)
  return trimmed
    .split(/\n|•|-\s/)
    .map((line) => line.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean)
}

/**
 * Parse ending_failure_modes text into an array of failure mode strings.
 */
export function parseEndingFailureModes(failureModes: string | null): string[] {
  return parseHardRules(failureModes)
}

/**
 * Returns true if the genre is a "dark exception" — i.e. its cover_art_guidance
 * explicitly contains "DARK EXCEPTION APPLIES" (case-insensitive).
 * This is the DB-backed replacement for the keyword-heuristic isDarkExceptionStory.
 */
export async function isDarkExceptionGenre(genre: string): Promise<boolean> {
  try {
    const attrs = await getGenreAttributes(genre)
    if (!attrs?.cover_art_guidance) return false
    return attrs.cover_art_guidance.toLowerCase().includes('dark exception applies')
  } catch {
    return false
  }
}
