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
  ])

  if (!asksForBrighter) return ''

  return 'Editor feedback says the cover is too dark: make the subject brighter, use a clearer key light, lift the midtones, and create stronger separation from the background.'
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

export function buildCoverDirectionBrief(params: CoverPromptParams): CoverDirectionBrief {
  const { genre, tone, concept, coverFeedback } = params
  const feedback = cleanInput(coverFeedback, 500)
  const lightingOverride = feedbackLightingOverride(feedback)

  return {
    primaryVisualSubject: inferPrimaryVisualSubject(params),
    emotionalPromise: inferEmotionalPromise(genre, tone, concept),
    keyObjectSymbol: inferKeyObjectSymbol(concept || params.script, params.title),
    settingBackground: inferSettingBackground(genre, concept || params.script),
    lightingDirection: lightingOverride || 'brighter cinematic key lighting with lifted midtones, clean highlight separation, and high contrast without muddy black shadows',
    compositionCameraDistance: 'clear foreground subject in medium shot or close medium shot; visible face or key object when appropriate; focal point centered or in the upper half of the square frame',
    thumbnailReadabilityInstruction: 'must read instantly as a small audiobook thumbnail: simple shape language, one dominant focal point, strong subject-background separation, no tiny critical details',
    whatToAvoid: [
      'generic noir fog unless the story specifically requires it',
      'dark teal/orange soup',
      'vague silhouettes with no story meaning',
      'muddy blacks, near-black grading, or underexposed faces',
      'generic landscapes, generic portraits, or unrelated scenery',
      feedback ? `anything that ignores this editor feedback: ${feedback}` : '',
    ].filter(Boolean),
  }
}

export function buildCoverPrompt(params: CoverPromptParams): string {
  const { title, author, genre, concept, tone, coverFeedback } = params

  const genreStyle: Record<string, string> = {
    thriller: 'controlled shadows, bright key light, intense close-ups, cinematic dread with clear subject visibility — like a premium suspense novel',
    mystery: 'moody but readable atmospheric lighting, hidden symbols, clear clue-forward composition — like Da Vinci Code or Angels & Demons',
    horror: 'gothic atmosphere, eerie glows, unsettling imagery, visible focal subject, and lifted midtones — like Stephen King hardcovers',
    romance: 'warm intimate lighting, emotional depth, soft bokeh — like a Nora Roberts novel',
    'sci-fi': 'vast cosmic scale, luminous practical light, futuristic atmosphere with clear readable forms — like The Martian or Dune',
    western: 'golden dust, wide open landscapes, lone silhouette — like Cormac McCarthy covers',
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

  // Tone overrides genre for mood-driven styles
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

  // Check tone first — it overrides genre mood
  const toneOverride = Object.entries(toneStyleMap).find(([k]) => t.includes(k))?.[1]
  const styleRef = toneOverride ||
    Object.entries(genreStyle).find(([k]) => g.includes(k))?.[1] ||
    'cinematic, sophisticated, professional audiobook cover quality'

  const toneDesc = tone ? `, ${tone} tone` : ''
  const directionBrief = buildCoverDirectionBrief(params)

  // Build scene description from concept if available
  const sceneInstruction = concept
    ? `The scene must visually reflect this story: "${concept.slice(0, 300)}". Depict the specific setting, mood, and atmosphere described — not a generic landscape. `
    : ''
  const feedbackInstruction = coverFeedback?.trim()
    ? `Apply these cover fix instructions from the editor: "${coverFeedback.trim().slice(0, 500)}". `
    : ''

  // No text in the prompt — title/author added programmatically via sharp overlay
  return (
    `A dramatic, story-specific background image for an audiobook cover. ` +
    `Genre: ${genre}${toneDesc}. ` +
    `Title reference: "${title}" by ${author}. Do not render this text. ` +
    `Visual style: ${styleRef}. ` +
    sceneInstruction +
    feedbackInstruction +
    `Cover Direction Brief: ` +
    `Primary visual subject: ${directionBrief.primaryVisualSubject}. ` +
    `Emotional promise: ${directionBrief.emotionalPromise}. ` +
    `Key object or symbol: ${directionBrief.keyObjectSymbol}. ` +
    `Setting/background: ${directionBrief.settingBackground}. ` +
    `Lighting direction: ${directionBrief.lightingDirection}. ` +
    `Composition/camera distance: ${directionBrief.compositionCameraDistance}. ` +
    `Thumbnail readability: ${directionBrief.thumbnailReadabilityInstruction}. ` +
    `Avoid: ${directionBrief.whatToAvoid.join('; ')}. ` +
    `Square format, fills entire canvas. ` +
    `Bright cinematic key lighting, professional composition, strong contrast, readable thumbnail design. ` +
    `Use a clear foreground subject with a recognizable silhouette and visible face or key object when appropriate. ` +
    `Maintain genre atmosphere without losing visibility; avoid muddy blacks, near-black grading, underexposed shadows, or details disappearing into darkness. ` +
    `The main subject and focal point must be centered or in the upper half of the image. ` +
    `Bottom-right corner must be naturally dark or shadowy — no important subjects there. ` +
    `IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image. ` +
    `Pure atmospheric visual scene only.`
  )
}
