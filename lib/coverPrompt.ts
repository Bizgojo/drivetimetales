export function buildCoverPrompt(params: {
  title: string
  author: string
  genre: string
  concept?: string
  tone?: string
  script?: string
}): string {
  const { title, author, genre, concept, tone, script } = params

  const genreStyle: Record<string, string> = {
    thriller: 'dark shadows, high contrast noir, intense close-ups, cinematic dread — like a Stieg Larsson or Gillian Flynn novel',
    mystery: 'moody atmospheric lighting, hidden symbols, dramatic shadows — like Da Vinci Code or Angels & Demons',
    horror: 'gothic darkness, eerie glows, unsettling imagery — like Stephen King hardcovers',
    romance: 'warm intimate lighting, emotional depth, soft bokeh — like a Nora Roberts novel',
    'sci-fi': 'vast cosmic scale, neon and darkness, futuristic atmosphere — like The Martian or Dune',
    western: 'golden dust, wide open landscapes, lone silhouette — like Cormac McCarthy covers',
    adventure: 'epic sweeping vistas, bold colors, heroic composition',
    drama: 'cinematic realism, emotionally charged portrait, naturalistic lighting',
    historical: 'period-accurate textures, aged paper tones, dramatic historical atmosphere',
    'true crime': 'dark, gritty, evidence-table aesthetic, dramatic noir lighting',
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

  // Build scene description from concept if available
  const sceneInstruction = concept
    ? `The scene must visually reflect this story: "${concept.slice(0, 300)}". Depict the specific setting, mood, and atmosphere described — not a generic landscape. `
    : ''

  // No text in the prompt — title/author added programmatically via sharp overlay
  return (
    `A dramatic atmospheric background image for an audiobook cover. ` +
    `Genre: ${genre}${toneDesc}. ` +
    `Visual style: ${styleRef}. ` +
    sceneInstruction +
    `Square format, fills entire canvas. ` +
    `Cinematic lighting, professional composition. ` +
    `The main subject and focal point must be centered or in the upper half of the image. ` +
    `Bottom-right corner must be naturally dark or shadowy — no important subjects there. ` +
    `IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image. ` +
    `Pure atmospheric visual scene only.`
  )
}
