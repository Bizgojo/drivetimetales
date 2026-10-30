/**
 * SERIES-STYLE-ACTION-001 (Marc 2026-10-29, Chicago rewrite): action stories
 * should move faster, describe less, and be easier to follow by ear, with a
 * sound effect at every moment the listener could actually hear something.
 *
 * Opt-in per series: queueItem.style = "action" → brief_json.style_profile.
 * Marc wants to hear it on Chicago before it becomes the default.
 */

export type StyleProfile = 'action'

export function styleProfileFrom(value: unknown): StyleProfile | null {
  const v = String(value ?? '').trim().toLowerCase()
  return v === 'action' ? 'action' : null
}

export function styleProfileOfBrief(brief: unknown): StyleProfile | null {
  return brief && typeof brief === 'object' ? styleProfileFrom((brief as Record<string, unknown>).style_profile) : null
}

/** Max main speaking characters for the series under this style. */
export function maxMainCharacters(style: StyleProfile | null): number {
  return style === 'action' ? 5 : 7
}

export function buildStylePromptBlock(style: StyleProfile | null, opts: { episodeNumber: number }): string {
  if (style !== 'action') return ''
  return `
🎯 ACTION STYLE — EASY TO FOLLOW WHILE DRIVING (NON-NEGOTIABLE)
- Move the story forward. At most two sentences of setting when a scene starts, then something happens. No paragraphs describing rooms, buildings, weather or skylines.
- Plain, short narration: about a grade seven to eight reading level. Adult words, but most narration sentences under fifteen words. No long winding sentences.
- At most five main speaking characters in the whole series, plus at most two one-scene small parts per episode. Introduce each person by full name and role the first time. Every character keeps exactly ONE name and ONE speaker label for the whole series — never switch between a first name, a last name and a nickname.
- Characters say each other's names often, so the listener always knows who is talking.
- One clear goal for this episode. At most one side plot across the whole series.
- One scene, one place. Do not cut between places in the middle of a scene.
${opts.episodeNumber > 1 ? '- Open with a two-or-three-sentence NARRATOR recap of where things stand ("Last time, …"), then go straight into action.\n' : ''}- Put sounds into the action. Write the moments the listener can HEAR — doors, engines, tires, footsteps, gunfire, punches, glass, phones, sirens, crowds, rain — as concrete events in the narration and dialogue. Let sound carry the setting instead of description. (Extra sound effects are layered in later at those moments; you still write at most three [SFX: …] cues yourself.)
`
}

/** Overlay effect budget and minimum spacing (in lines) for a style. */
export function overlaySettingsForStyle(style: StyleProfile | null, genreBudget: number): { budget: number; minGap: number } {
  if (style === 'action') return { budget: Math.max(genreBudget, 18), minGap: 2 }
  return { budget: genreBudget, minGap: 3 }
}
