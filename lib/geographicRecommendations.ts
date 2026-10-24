/** Geographic relevance only; existing availability/history gates still apply. */
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
}

export type ListenerLocation = { city?: unknown; state?: unknown }
export type GeographicMatch = 0 | 1 | 2 // none, state, city within state

export function normalizeState(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().replace(/\./g, '').replace(/\s+/g, ' ').toLowerCase()
  if (clean === 'washington dc') return 'DC'
  return Object.keys(STATE_NAMES).find(code =>
    code.toLowerCase() === clean || STATE_NAMES[code].toLowerCase() === clean
  ) || null
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function namesPlace(text: string, place: string): boolean {
  return new RegExp(`\\b${escapeRegex(place).replace(/\s+/g, '\\s+')}\\b`, 'i').test(text)
}

export function geographicMatch(text: string, location: ListenerLocation): GeographicMatch {
  const state = normalizeState(location.state)
  if (!state || !text) return 0
  // A bare IN/OR/ME/etc. can be ordinary dialogue, not a postal abbreviation.
  // Accept abbreviations only after a capitalized city followed by a comma.
  const postalPlace = new RegExp(`\\b[A-Z][a-z]+(?:[ -][A-Z][a-z]+)*,\\s*${state}\\b`)
  const stateText = state === 'WA' ? text.replace(/\bWashington[ ,]+(?:D\.?C\.?|District of Columbia)\b/gi, '')
    : state === 'VA' ? text.replace(/\bWest\s+Virginia\b/gi, '') : text
  let sameState = namesPlace(stateText, STATE_NAMES[state]) || postalPlace.test(text)
  if (state === 'DC') sameState ||= /\bWashington[ ,]+D\.?C\.?\b/i.test(text)
  // Lake Marion also exists outside SC. Both these references identify the
  // Santee Cooper reservoir, rather than guessing from the lake name alone.
  if (state === 'SC') sameState ||= namesPlace(text, 'Lake Marion') && namesPlace(text, 'Santee Cooper')
  if (!sameState) return 0
  const city = typeof location.city === 'string' ? location.city.trim() : ''
  return city.length >= 2 && city.length <= 100 && namesPlace(text, city) ? 2 : 1
}

export function compareRecommendationRank(
  a: { locationMatch: number; score: number },
  b: { locationMatch: number; score: number },
) {
  return b.locationMatch - a.locationMatch || b.score - a.score
}
