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
  }

  const g = genre.toLowerCase()
  const styleRef =
    Object.entries(genreStyle).find(([k]) => g.includes(k))?.[1] ||
    'cinematic, sophisticated, dramatic lighting, professional audiobook cover quality'

  const toneDesc = tone ? `, ${tone}` : ''

  // No text in the prompt — title/author added programmatically via sharp overlay
  // Corner note: bottom corners are overlaid with UI pill badges — keep them naturally
  // textured/atmospheric but avoid placing key subjects, faces, or focal points there.
  return (
    `A dramatic atmospheric background image for an audiobook cover. ` +
    `Genre: ${genre}${toneDesc}. ` +
    `Visual style: ${styleRef}. ` +
    `Square format, fills entire canvas. ` +
    `Cinematic lighting, rich moody colors, professional composition. ` +
    `The main subject and focal point must be centered or in the upper half of the image. ` +
    `Bottom corners should be naturally dark, shadowy, or softly textured — ` +
    `atmospheric but free of important subjects, faces, or details (they will be covered by UI elements). ` +
    `IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image. ` +
    `Pure atmospheric visual scene only.`
  )
}
