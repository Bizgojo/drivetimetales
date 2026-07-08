export type CoverDirectionBrief = {
  primaryVisualSubject: string
  emotionalPromise: string
  keyObjectSymbol: string
  settingBackground: string
  lightingDirection: string
  compositionCameraDistance: string
  thumbnailReadabilityInstruction: string
  whatToAvoid: string[]
}

type CoverPromptParams = {
  title: string
  author: string
  genre: string
  concept?: string
  tone?: string
  script?: string
  coverFeedback?: string
}

// ─── Brightness / Darkness constants ───────────────────────────────────────

/**
 * Default brightness directive — prepended to EVERY cover prompt unless the
 * story explicitly signals night/darkness (see DARK_STORY_KEYWORDS below).
 */
const BRIGHTNESS_DIRECTIVE =
  'Bright, high-key illustration with a light or daylight background and strong subject contrast.'

/**
 * Ultra-bright directive used on luminance-gate retry (second attempt).
 */
export const ULTRA_BRIGHT_DIRECTIVE =
  'Ultra-bright, high-key, white or pale background — maximum brightness, luminous and airy, strong subject contrast, no dark areas.'

/**
 * Keyword list: if any of these appear in the story content, description, or
 * genre the DARK EXCEPTION BRANCH activates and the brightness directive is
 * suppressed so a legitimately dark cover can be generated.
 */
const DARK_STORY_KEYWORDS = [
  'night', 'nighttime', 'dark', 'darkness', 'shadow', 'shadows', 'midnight',
  'dusk', 'underground', 'cave', 'cavern', 'dungeon', 'cellar', 'noir',
  'haunted', 'gothic', 'abyss', 'tomb', 'crypt', 'void', 'blackout',
  'storm', 'moonless', 'eclipse',
]

/**
 * Palette words that conflict with the brightness directive.
 * These are stripped from the base prompt before a retry instruction is prepended.
 */
const CONFLICTING_PALETTE_WORDS = [
  'dark', 'shadow', 'moody', 'noir', 'dim', 'murky', 'gloomy', 'nighttime',
  'shadowy', 'low-light', 'low light', 'underexposed', 'near-black',
  'blue-black', 'deep-black',
]

// ─── Dark exception branch ──────────────────────────────────────────────────

/**
 * Returns true ONLY when the genre is Horror (case-insensitive).
 *
 * Per GENRE-ATTRIBUTES-SPEC v1.0 §3: Horror is the ONLY genre where the dark
 * exception applies. The previous keyword-heuristic approach incorrectly
 * triggered the exception for any story containing words like "dusk", "shadow",
 * or "dark" — suppressing the brightness directive on Western, Thriller, and
 * other genres where bright covers are required.
 *
 * The dark exception means: darker palettes are ALLOWED, but the brightness
 * floor (thumbnail legibility) still applies. It does NOT mean "suppress all
 * brightness guidance."
 */
export function isDarkExceptionStory(params: CoverPromptParams): boolean {
  const genre = (params.genre || '').toLowerCase().trim()
  return genre === 'horror' || genre === 'horror/psychological'
}

/**
 * Keyword-based heuristic kept as a fallback for legacy callers.
 * @deprecated Use isDarkExceptionStory() which is genre-gated per the spec.
 */
export function isDarkExceptionByKeyword(params: CoverPromptParams): boolean {
  const haystack = [
    params.genre,
    params.tone,
    params.concept,
    params.title,
    params.script,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return DARK_STORY_KEYWORDS.some((kw) => haystack.includes(kw))
}

/**
 * Strip conflicting palette words from a prompt string before retry injection.
 */
export function stripConflictingPaletteWords(prompt: string): string {
  let result = prompt
  for (const word of CONFLICTING_PALETTE_WORDS) {
    // word-boundary-safe replacement: replace whole occurrences but don't
    // break adjacent characters (handles compound forms like "blue-black")
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'gi'), '')
  }
  // Collapse double spaces left by removals
  return result.replace(/  +/g, ' ').trim()
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ENDLESS_TALES_COVER_STANDARD = [
  'Endless Tales Cover Standard:',
  'thumbnail-safe at phone size and readable at 100x100 px',
  'brighter lighting by default with clear subject or object visibility',
  'strong readable silhouette and strong contrast without crushing blacks',
  'avoid murky low-light compositions, black-shadow-heavy scenes, and underexposed noir grading',
  'avoid faces or important objects disappearing into shadow',
  'cinematic lighting is welcome, but it must not be underexposed',
  'mystery covers may be moody, but the important visual element must still be clear',
].join(' ')

function cleanInput(value: string | undefined, max: number): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function containsAny(value: string, terms: string[]): boolean {
  const normalized = value.toLowerCase()
  return terms.some((term) => normalized.includes(term))
}

function titleCaseFallback(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(' ')
}

function feedbackLightingOverride(coverFeedback: string): string {
  if (!coverFeedback) return ''

  const asksForBrighter = containsAny(coverFeedback, [
    'too dark',
    'dark',
    'brighter',
    'brighten',
    'muddy',
    'can\'t see',
    'cannot see',
    'hard to see',
    'underexposed',
    'shadowy',
    'shadow',
    'shadows',
    'black',
    'dim',
    'gloomy',
    'murky',
    'unclear',
    'can\'t tell',
    "can't see it",
    'hard to read',
    'too moody',
    'lost in shadow',
    'low light',
    'low-light',
    'face clearly visible',
    'glows brighter',
    'glow brighter',
  ])

  if (!asksForBrighter) return ''

  return 'Editor feedback says the cover is too dark or unclear: make the image significantly brighter while preserving cinematic realism, increase face/object visibility, reduce black shadows, use warmer or clearer key light, lift the midtones strongly, brighten skin tones, improve thumbnail readability, make the key object glow brighter when appropriate, add stronger edge/rim lighting, reduce deep-black coverage, and do not merely create another dark scene.'
}

function feedbackCompositionOverride(coverFeedback: string): string {
  if (!coverFeedback) return ''

  const asksForLargerSubject = containsAny(coverFeedback, [
    'face larger',
    'larger face',
    'make the face',
    'clearer',
    'easier to read',
    'thumbnail',
    'bigger',
    'larger',
    'close up',
    'close-up',
    'show ',
  ])

  if (!asksForLargerSubject) return ''

  return 'Editor feedback asks for stronger thumbnail readability: make the face and/or key object substantially larger in frame, closer to camera, cleanly lit, high contrast, clearly visible without zooming, and immediately readable on a phone-sized streaming thumbnail at 120px height.'
}

function inferPrimaryVisualSubject(params: CoverPromptParams): string {
  const feedback = cleanInput(params.coverFeedback, 500)
  const concept = cleanInput(params.concept || params.script, 1200)
  const title = cleanInput(params.title, 120)

  if (feedback && containsAny(feedback, ['show ', 'needs ', 'make it ', 'focus on ', 'use '])) {
    return `the editor-requested focal image, interpreted from this feedback: ${feedback}`
  }

  if (concept) {
    const firstSentence = concept.split(/(?<=[.!?])\s+/)[0]
    return `a clear story-specific foreground subject from the narrative: ${cleanInput(firstSentence || concept, 220)}`
  }

  return `a concrete cinematic image inspired by the title "${titleCaseFallback(title || 'Untitled')}"`
}

function inferEmotionalPromise(genre: string, tone?: string, concept?: string): string {
  const combined = `${genre} ${tone || ''} ${concept || ''}`.toLowerCase()

  if (containsAny(combined, ['heartwarming', 'uplifting', 'hopeful', 'inspirational', 'dog lover'])) {
    return 'warmth, relief, and an emotionally satisfying promise'
  }
  if (containsAny(combined, ['horror', 'haunted', 'terror', 'supernatural'])) {
    return 'unease and dread with enough clarity to invite the listener in'
  }
  if (containsAny(combined, ['romance', 'love', 'intimate'])) {
    return 'intimacy, longing, and emotional stakes'
  }
  if (containsAny(combined, ['western', 'frontier', 'ranch', 'sheriff'])) {
    return 'frontier tension, moral pressure, and open-air scale'
  }
  if (containsAny(combined, ['sci-fi', 'science fiction', 'space', 'future'])) {
    return 'wonder, danger, and speculative scale'
  }
  if (containsAny(combined, ['mystery', 'thriller', 'crime', 'noir', 'suspense'])) {
    return 'suspense, discovery, and a specific unresolved danger'
  }

  return 'cinematic curiosity, human stakes, and a strong reason to listen'
}

function inferKeyObjectSymbol(concept?: string, title?: string): string {
  const combined = cleanInput(`${title || ''}. ${concept || ''}`, 1200)
  const lower = combined.toLowerCase()
  const candidates = [
    'manifest',
    'bridge',
    'letter',
    'photograph',
    'truck',
    'knife',
    'watch',
    'key',
    'map',
    'radio',
    'phone',
    'tape',
    'journal',
    'ring',
    'badge',
    'lantern',
    'dog',
    'house',
    'train',
    'station',
    'fire',
  ]
  const found = candidates.find((candidate) => lower.includes(candidate))

  if (found) return `a visible ${found} that carries story meaning`

  return 'one unmistakable story object or symbol, large enough to read at thumbnail size'
}

function inferSettingBackground(genre: string, concept?: string): string {
  const conceptText = cleanInput(concept, 900)
  if (conceptText) {
    return `the actual story setting implied by the context, not a generic backdrop: ${conceptText}`
  }

  const g = genre.toLowerCase()
  if (g.includes('western')) return 'a specific frontier location with open sky, weathered textures, and lived-in detail'
  if (g.includes('sci-fi')) return 'a readable futuristic environment with scale and one grounded human-scale detail'
  if (g.includes('romance')) return 'an intimate real-world setting with warm environmental detail'
  if (g.includes('horror')) return 'a tangible unsettling place with visible architecture or landscape detail'
  if (g.includes('mystery') || g.includes('thriller')) return 'a concrete location tied to the central clue or threat'

  return 'a concrete story location with enough detail to feel specific'
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function buildCoverDirectionBrief(params: CoverPromptParams): CoverDirectionBrief {
  const { genre, tone, concept, coverFeedback } = params
  const feedback = cleanInput(coverFeedback, 500)
  const lightingOverride = feedbackLightingOverride(feedback)
  const compositionOverride = feedbackCompositionOverride(feedback)

  return {
    primaryVisualSubject: inferPrimaryVisualSubject(params),
    emotionalPromise: inferEmotionalPromise(genre, tone, concept),
    keyObjectSymbol: inferKeyObjectSymbol(concept || params.script, params.title),
    settingBackground: inferSettingBackground(genre, concept || params.script),
    lightingDirection: lightingOverride || 'well-exposed cinematic image with a hard minimum brightness floor; the cover must remain readable at 120px thumbnail size; use brighter cinematic key lighting, strongly lifted midtones, strong edge/rim lighting, clean highlight separation, brighter skin tones, visible key object glow when appropriate, and high contrast without muddy black shadows or large dark empty areas; prefer over-exposed-cinematic over under-exposed-cinematic',
    compositionCameraDistance: compositionOverride || 'clear foreground subject in close medium shot or close-up; the main face must be clearly visible without zooming when a person is present, and the key object must be readable; both must occupy meaningful visual area; avoid tiny distant silhouettes; focal point centered or in the upper half of the square frame',
    thumbnailReadabilityInstruction: 'optimized for small streaming-app thumbnail readability and must remain readable on a phone-sized streaming thumbnail at about 120px height and at 100x100 px: simple shape language, one dominant focal point, strong subject-background separation, no tiny critical details',
    whatToAvoid: [
      'generic noir fog unless the story specifically requires it',
      'underexposed noir darkness',
      'dark teal/orange fog soup',
      'vague silhouettes with no story meaning',
      'full-frame darkness',
      'low-contrast blue-black scenes',
      'blue-black shadow soup',
      'tiny dark faces or tiny distant figures',
      'large dark empty areas',
      'deep-black coverage across too much of the frame',
      'muddy blacks, near-black grading, shadow-heavy compositions, or underexposed faces',
      'generic landscapes, generic portraits, or unrelated scenery',
      feedback ? `anything that ignores this editor feedback: ${feedback}` : '',
    ].filter(Boolean),
  }
}

/**
 * Build the final cover prompt string.
 *
 * Prompt structure (STEP 1 fix):
 *   [BRIGHTNESS DIRECTIVE]   ← leads, unless dark exception
 *   [STORY CONTENT]
 *   [STYLE CLOSE]
 *
 * Retry structure (STEP 2 fix):
 *   [RETRY INSTRUCTION]       ← prepended as hard constraint
 *   [BRIGHTNESS DIRECTIVE]
 *   [STORY CONTENT (palette-stripped)]
 *   [STYLE CLOSE]
 */
export function buildCoverPrompt(params: CoverPromptParams): string {
  const { title, author, genre, concept, tone, coverFeedback } = params

  const genreStyle: Record<string, string> = {
    thriller: 'bright controlled lighting, tight well-exposed close-ups, cinematic dread with exceptional subject clarity — like a premium thriller hardcover; darkness may appear at the edges but the subject must have a strong bright key light',
    mystery: 'atmospheric and moody, but brightness-floor enforced: key subject and clue-objects must be clearly readable at thumbnail size, no underexposed noir darkness allowed even for mystery — like Da Vinci Code or Angels & Demons; moody lighting is acceptable but must be bright enough to read',
    horror: 'gothic atmosphere, eerie glows, unsettling imagery, visible focal subject, and lifted midtones — like Stephen King hardcovers',
    romance: 'warm intimate lighting, emotional depth, soft bokeh — like a Nora Roberts novel',
    'sci-fi': 'vast cosmic scale, luminous practical light, futuristic atmosphere with clear readable forms — like The Martian or Dune',
    western: 'golden dust, open landscape context, strong foreground figure or key object, readable face or prop detail — like a premium western cover',
    adventure: 'epic sweeping vistas, bold colors, heroic composition',
    drama: 'cinematic realism, emotionally charged portrait, naturalistic lighting',
    historical: 'period-accurate textures, aged paper tones, dramatic historical atmosphere',
    'true crime': 'gritty evidence-table aesthetic, dramatic but readable lighting, clear key object',
    uplifting: 'warm golden light, soft bright tones, hopeful and life-affirming imagery — like a feel-good bestseller',
    heartwarming: 'cozy warm palette, gentle sunlight, emotional warmth — like a Hallmark novel cover',
    'dog lover': 'warm golden tones, joyful energy, soft natural light, bond between human and animal — heartwarming and bright',
    comedy: 'bright cheerful colors, playful composition, light-hearted whimsy',
    inspirational: 'radiant warm light, uplifting imagery, soft golden hour tones',
  }

  const toneStyleMap: Record<string, string> = {
    uplifting: genreStyle.uplifting,
    heartwarming: genreStyle.heartwarming,
    heartfelt: genreStyle.heartwarming,
    warm: 'soft warm lighting, golden tones, gentle and inviting atmosphere',
    hopeful: 'bright open skies, warm golden light, optimistic and uplifting imagery',
    funny: genreStyle.comedy,
    humorous: genreStyle.comedy,
    inspiring: genreStyle.inspirational,
    emotional: 'deeply emotional, soft cinematic lighting, intimate and moving portrait',
    cozy: 'warm firelight tones, comfortable intimate setting, soft textures',
  }

  const g = genre.toLowerCase()
  const t = (tone || '').toLowerCase()

  const toneOverride = Object.entries(toneStyleMap).find(([k]) => t.includes(k))?.[1]
  const styleRef = toneOverride ||
    Object.entries(genreStyle).find(([k]) => g.includes(k))?.[1] ||
    'cinematic, sophisticated, professional audiobook cover quality'

  const toneDesc = tone ? `, ${tone} tone` : ''
  const directionBrief = buildCoverDirectionBrief(params)

  // ── DARK EXCEPTION BRANCH ────────────────────────────────────────────────
  // Only suppress brightness directive when story content explicitly signals
  // night/darkness/shadow — this must be intentional, not accidental vocabulary bleed.
  const darkException = isDarkExceptionStory(params)
  // Horror dark exception: darker palette is ALLOWED, but the brightness FLOOR
  // still applies. The focal subject and key objects must be well-lit and
  // thumbnail-readable. We swap the full brightness directive for a Horror-specific
  // floor that permits atmosphere without collapsing into unreadable darkness.
  const HORROR_BRIGHTNESS_FLOOR =
    'BRIGHTNESS FLOOR — HORROR EDITION: The entire image must be visibly exposed, not black. Background and environment must read as distinct detail — visible stone texture, atmospheric haze, rock walls, roots, architectural detail, sky, or terrain — never a solid black void. The focal subject (face, object, or key element) must be the brightest element in the frame, lit by a strong practical source (lantern, bioluminescent glow, flashlight, fire, moonlight). Lift the midtones strongly: deep shadows may exist but must not dominate more than 20% of the frame. Think Stephen King hardcover or Guillermo del Toro film still — atmospheric and dark in mood, but every surface is readable. No full-frame darkness. No black void backgrounds.'
  const brightnessDirective = darkException ? HORROR_BRIGHTNESS_FLOOR : BRIGHTNESS_DIRECTIVE

  // ── RETRY / CHANGE COVER PATH (STEP 2 fix) ──────────────────────────────
  // When coverFeedback is present (operator instruction), prepend it as a hard
  // constraint BEFORE the brightness directive. Strip palette words that conflict.
  const hasRetryInstruction = Boolean(coverFeedback?.trim())
  const retryInstruction = hasRetryInstruction
    ? `HARD COVER CONSTRAINT (operator instruction, highest priority): ${coverFeedback!.trim().slice(0, 500)}.`
    : ''

  // Build story content section, stripping conflicting palette words when retrying
  const rawConceptText = concept ? `The scene must visually reflect this story: "${concept.slice(0, 300)}". Depict the specific setting, mood, and atmosphere described — not a generic landscape. ` : ''
  const sceneInstruction = hasRetryInstruction
    ? stripConflictingPaletteWords(rawConceptText)
    : rawConceptText

  // ── STYLE CLOSE ──────────────────────────────────────────────────────────
  // Keep existing style tokens but strip conflicting palette words
  const styleClose = hasRetryInstruction
    ? stripConflictingPaletteWords(styleRef)
    : styleRef

  // ── ASSEMBLE PROMPT ──────────────────────────────────────────────────────
  // Order: [RETRY INSTRUCTION] → [BRIGHTNESS DIRECTIVE] → [STORY CONTENT] → [STYLE CLOSE]
  const parts: string[] = []

  if (retryInstruction) parts.push(retryInstruction)
  if (brightnessDirective) parts.push(brightnessDirective)

  parts.push(
    `A thumbnail-first, story-specific background image for an audiobook cover, optimized for small streaming-app thumbnail readability.`,
    `Hard priority: the cover must remain instantly readable at about 120px height while someone is scrolling.`,
    ENDLESS_TALES_COVER_STANDARD,
    `Genre: ${genre}${toneDesc}.`,
    `Title reference: "${title}" by ${author}. Do not render this text.`,
    `Visual style: ${styleClose}.`,
    sceneInstruction,
    `Cover Direction Brief:`,
    `Primary visual subject: ${directionBrief.primaryVisualSubject}.`,
    `Emotional promise: ${directionBrief.emotionalPromise}.`,
    `Key object or symbol: ${directionBrief.keyObjectSymbol}.`,
    `Setting/background: ${directionBrief.settingBackground}.`,
    `Lighting direction: ${directionBrief.lightingDirection}.`,
    `Composition/camera distance: ${directionBrief.compositionCameraDistance}.`,
    `Thumbnail readability: ${directionBrief.thumbnailReadabilityInstruction}.`,
    `Avoid: ${directionBrief.whatToAvoid.join('; ')}.`,
    `Square format, fills entire canvas.`,
    `Visual hierarchy must be obvious in one glance: who or what matters, the emotional focus, and the key object or symbol.`,
    `Hard rendering floor: the image must be well-exposed with a minimum brightness floor; reduce deep-black coverage, avoid full-frame darkness, and keep the subject readable at 100x100 px.`,
    `Bright cinematic key lighting, stronger midtone lift, strong edge/rim lighting, brighter skin tones, brighter key object glow when appropriate, professional composition, strong contrast, readable thumbnail design.`,
    `Use a large clear foreground subject with a recognizable face, a clearly lit key object, or both; faces must be clearly visible without zooming.`,
    `The main subject must occupy meaningful visual area and should not be a tiny distant silhouette.`,
    `Maintain cinematic realism and dramatic lighting without losing visibility; avoid muddy blacks, near-black grading, underexposed noir darkness, blue-black shadow soup, tiny dark faces, low-contrast blue-black scenes, large dark empty areas, underexposed shadows, or details disappearing into darkness.`,
    `The main subject and focal point must be centered or in the upper half of the image.`,
    `Bottom-right corner must be naturally dark or shadowy — no important subjects there.`,
    `IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image.`,
    `Pure atmospheric visual scene only.`,
  )

  return parts.filter(Boolean).join(' ')
}
