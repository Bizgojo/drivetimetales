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

  return (
    `Create a professional audiobook cover image in square format (1024x1024). ` +
    `The cover is for an audio story called "${title}" written by ${author}. ` +
    `Genre: ${genre}${toneDesc}. ` +
    `Visual style: ${styleRef}. ` +
    `The cover must include the title "${title}" in bold prominent typography and the author name "${author}" in smaller text. ` +
    `Central image: a dramatic, atmospheric scene that fits the genre — cinematic lighting, rich colors, professional composition. ` +
    `Style similar to top audiobook covers on Audible or Apple Books. No borders, fills entire canvas.`
  )
}
