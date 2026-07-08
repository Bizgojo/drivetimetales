/**
 * Endless Tales — Cover Attribute Tags (C6)
 *
 * Answers "what KIND of cover wins" by tagging each cover with:
 *   palette          bright | dark
 *   dominant_subject face | figure | object | landscape
 *   face_visible     boolean
 *   temperature      warm | cool
 *
 * Two sources:
 *   'prompt' — derived heuristically at generation time from the story-specific
 *              prompt inputs (NOT the assembled prompt boilerplate, which always
 *              mentions faces/brightness and would pollute the signal).
 *   'vision' — Claude vision pass over the rendered cover image
 *              (scripts/backfill-cover-attributes.mjs). Vision supersedes prompt.
 */

export type CoverPalette = 'bright' | 'dark'
export type CoverSubject = 'face' | 'figure' | 'object' | 'landscape'
export type CoverTemperature = 'warm' | 'cool'

export type CoverAttributes = {
  palette: CoverPalette
  dominant_subject: CoverSubject
  face_visible: boolean
  temperature: CoverTemperature
  source: 'prompt' | 'vision'
  model?: string
  tagged_at: string
}

export type CoverAttributeParams = {
  title?: string
  genre?: string
  tone?: string
  concept?: string
  script?: string
}

const WARM_TERMS = [
  'warm', 'golden', 'amber', 'firelight', 'fire', 'sunset', 'sunrise', 'sunlight',
  'orange', 'glow', 'cozy', 'lantern', 'candle', 'autumn', 'desert', 'dust',
]

const COOL_TERMS = [
  'blue', 'teal', 'moonlight', 'moon', 'cold', 'icy', 'ice', 'snow', 'winter',
  'night', 'silver', 'mist', 'fog', 'rain', 'storm', 'ocean', 'underwater', 'neon',
]

const FACE_TERMS = ['face', 'portrait', 'close-up of a', 'expression', 'eyes']

const PERSON_TERMS = [
  'man', 'woman', 'boy', 'girl', 'child', 'figure', 'person', 'sheriff', 'detective',
  'farmer', 'soldier', 'sailor', 'nurse', 'doctor', 'teacher', 'mother', 'father',
  'cowboy', 'rancher', 'astronaut', 'pilot', 'driver', 'stranger', 'couple',
  ' he ', ' she ', ' his ', ' her ',
]

const LANDSCAPE_TERMS = [
  'landscape', 'vista', 'mountains', 'mountain range', 'valley', 'prairie', 'plains',
  'skyline', 'horizon', 'coastline', 'seascape', 'canyon', 'forest', 'wilderness',
]

const OBJECT_TERMS = [
  'manifest', 'bridge', 'letter', 'photograph', 'truck', 'knife', 'watch', 'key',
  'map', 'radio', 'phone', 'tape', 'journal', 'ring', 'badge', 'lantern', 'house',
  'train', 'station', 'ship', 'boat', 'car', 'door', 'window', 'clock', 'book',
]

const WARM_GENRES = ['romance', 'western', 'heartwarming', 'uplifting', 'dog lover', 'comedy', 'inspirational', 'drama', 'historical']
const COOL_GENRES = ['horror', 'sci-fi', 'science fiction', 'mystery', 'thriller', 'true crime']

function countMatches(haystack: string, terms: string[]): number {
  return terms.reduce((count, term) => (haystack.includes(term) ? count + 1 : count), 0)
}

/**
 * Derive cover attributes from the story-specific generation inputs.
 * `darkException` = Horror dark-exception branch active (see lib/coverPrompt.ts).
 * `luminance` = measured average luminance of the rendered image when available
 * (regenerate-cover computes it) — the strongest palette signal we have.
 */
export function deriveCoverAttributesFromParams(
  params: CoverAttributeParams,
  opts: { darkException?: boolean; luminance?: number | null; luminanceThreshold?: number } = {}
): CoverAttributes {
  const haystack = [params.title, params.genre, params.tone, params.concept, params.script]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const genre = (params.genre || '').toLowerCase()

  // ── palette ──
  let palette: CoverPalette
  if (typeof opts.luminance === 'number' && Number.isFinite(opts.luminance)) {
    palette = opts.luminance < (opts.luminanceThreshold ?? 80) ? 'dark' : 'bright'
  } else {
    // Brightness directive leads every non-Horror prompt → bright by default.
    palette = opts.darkException ? 'dark' : 'bright'
  }

  // ── temperature ──
  const warmScore = countMatches(haystack, WARM_TERMS)
  const coolScore = countMatches(haystack, COOL_TERMS)
  let temperature: CoverTemperature
  if (warmScore > coolScore) temperature = 'warm'
  else if (coolScore > warmScore) temperature = 'cool'
  else if (COOL_GENRES.some(g => genre.includes(g))) temperature = 'cool'
  else if (WARM_GENRES.some(g => genre.includes(g))) temperature = 'warm'
  else temperature = 'warm'

  // ── subject / face ──
  const faceScore = countMatches(haystack, FACE_TERMS)
  const personScore = countMatches(` ${haystack} `, PERSON_TERMS)
  const landscapeScore = countMatches(haystack, LANDSCAPE_TERMS)
  const objectScore = countMatches(haystack, OBJECT_TERMS)

  let dominant_subject: CoverSubject
  if (faceScore >= 1 && personScore >= 1) dominant_subject = 'face'
  else if (personScore >= 1) dominant_subject = 'figure'
  else if (objectScore >= 1 && objectScore >= landscapeScore) dominant_subject = 'object'
  else if (landscapeScore >= 1) dominant_subject = 'landscape'
  else dominant_subject = 'figure' // prompt boilerplate biases toward a foreground subject

  // Cover prompt boilerplate demands visible faces whenever a person is present.
  const face_visible = dominant_subject === 'face' || dominant_subject === 'figure'

  return {
    palette,
    dominant_subject,
    face_visible,
    temperature,
    source: 'prompt',
    tagged_at: new Date().toISOString(),
  }
}
