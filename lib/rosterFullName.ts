/**
 * ROSTER-FULLNAME-001 (Chicago rewrite EP5, 2026-10-30): one episode's guide
 * says "LOOMIS — Commander Bruce Loomis, …", another says "Commander Bruce
 * Loomis — …". The roster did not see these as one person (different first
 * word), so he got two voices — the "voices change mid-series" bug. The name
 * written right after the label in a guide description is that character's
 * full name, and the roster now matches on it.
 */

/** "LOOMIS — Commander Bruce Loomis, male, …" → "Commander Bruce Loomis" (or ''). */
export function guideDescriptionNameCandidate(description: unknown): string {
  const text = String(description || '').trim()
  const m = text.match(/^[^—–:]{1,60}?\s*[—–:]\s*([^,.;(]{2,60})/) || text.match(/^[A-Z][A-Z .'-]{1,40}\s+-\s+([^,.;(]{2,60})/)
  if (!m) return ''
  const candidate = m[1].trim()
  // Only a name: 1–4 capitalized words (an optional title like "Commander" included).
  return /^[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3}$/.test(candidate) ? candidate : ''
}

/** "DESK GUARD — Male, forties" gives "MALE": a description, not a name. */
export function isDescriptorNotName(normalizedName: string): boolean {
  return /^(MALE|FEMALE|MAN|WOMAN|BOY|GIRL|AGE|LATE|EARLY|MID|YOUNG|OLD|ELDERLY)\b/.test(String(normalizedName || ''))
}
