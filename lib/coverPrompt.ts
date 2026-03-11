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

  // Use ONLY concept (sanitized) — never raw script (triggers content filters)
  // Keep concept short and visual-description-safe
  const conceptSnippet = concept
    ? concept.replace(/\b(kill|murder|dead|blood|weapon|war|battle|shoot|fight|attack|Confederate|rebel|soldier)\b/gi, '').substring(0, 200).trim()
    : ''

  return [
    `Professional audiobook cover art for "${title}" by ${author}.`,
    `Genre: ${genre}${tone ? `, tone: ${tone}` : ''}.`,
    `Visual style: ${styleRef}.`,
    conceptSnippet ? `Thematic inspiration: ${conceptSnippet}.` : '',
    `Square format 1024x1024, fills the entire canvas edge to edge with no borders.`,
    `The title text "${title}" displayed prominently on the cover in bold dramatic typography.`,
    `The author name "${author}" in smaller elegant text near the title.`,
    `Central artwork: a single powerful, atmospheric scene capturing the mood and setting — rich dramatic colors, cinematic composition.`,
    `Quality comparable to major audiobook covers on Audible. No generic stock imagery.`,
  ]
    .filter(Boolean)
    .join(' ')
}
