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

  // Use script excerpt or concept for story-specific visual context
  let storyContext = ''
  if (script && script.length > 100) {
    storyContext = script.substring(0, 600).replace(/\n+/g, ' ').trim()
  } else if (concept) {
    storyContext = concept.substring(0, 300)
  }

  return [
    `Professional audiobook cover art for "${title}" by ${author}.`,
    `Genre: ${genre}${tone ? `, tone: ${tone}` : ''}.`,
    storyContext ? `Story context for visual inspiration: ${storyContext}` : '',
    `Visual style: ${styleRef}.`,
    `Design requirements:`,
    `- Square format (1024x1024), fills entire canvas edge to edge`,
    `- The title "${title}" must appear prominently in the upper or lower portion of the cover in bold, elegant typography`,
    `- The author name "${author}" must appear in smaller text near the title`,
    `- Central image: a single powerful illustration or photorealistic scene that captures the mood and setting of this specific story`,
    `- Color palette: rich, dramatic, genre-appropriate (not generic or stock-photo-like)`,
    `- Quality benchmark: comparable to major published thriller/mystery audiobook covers on Audible or Spotify`,
    `- Do NOT use generic stock imagery — the image must feel specific to this story`,
  ]
    .filter(Boolean)
    .join(' ')
}
