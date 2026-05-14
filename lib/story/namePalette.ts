import namePools from '@/data/character-name-pools.json'

type NameEntry = {
  name: string
  regions?: string[]
  styles?: string[]
  eras?: string[]
  avoid_recent?: boolean
  notes?: string
}

type CharacterNamePools = {
  version: number
  firstNames: {
    male: NameEntry[]
    female: NameEntry[]
    neutral: NameEntry[]
  }
  lastNames: NameEntry[]
}

export type NamePaletteOptions = {
  genre?: string
  setting?: string
  era?: string
  seriesContinuityText?: string
  recentStoryTexts?: string[]
  maleCount?: number
  femaleCount?: number
  neutralCount?: number
  lastNameCount?: number
}

const pools = namePools as CharacterNamePools

function compact(value: string) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function hash(input: string) {
  let value = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function includesWholeName(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

function collectUsedPoolNames(texts: string[]) {
  const text = texts.filter(Boolean).join('\n')
  const allEntries = [
    ...pools.firstNames.male,
    ...pools.firstNames.female,
    ...pools.firstNames.neutral,
    ...pools.lastNames,
  ]

  return new Set(
    allEntries
      .filter((entry) => includesWholeName(text, entry.name))
      .map((entry) => compact(entry.name))
  )
}

function scoreEntry(entry: NameEntry, context: string, seed: string) {
  const tags = [...(entry.styles || []), ...(entry.regions || []), ...(entry.eras || [])]
  const tagScore = tags.reduce((score, tag) => {
    const cleanTag = compact(tag)
    return score + (cleanTag && context.includes(cleanTag) ? 20 : 0)
  }, 0)

  return tagScore + (hash(`${seed}:${entry.name}`) % 1000) / 1000
}

function sampleEntries(entries: NameEntry[], count: number, options: NamePaletteOptions, usedNames: Set<string>) {
  const context = compact(`${options.genre || ''} ${options.setting || ''} ${options.era || ''}`)
  const seed = `${context}:${options.seriesContinuityText || ''}`

  return entries
    .filter((entry) => !usedNames.has(compact(entry.name)))
    .sort((a, b) => scoreEntry(b, context, seed) - scoreEntry(a, context, seed))
    .slice(0, count)
    .map((entry) => entry.name)
}

function formatList(names: string[]) {
  return names.length ? names.join(', ') : 'No preferred names available'
}

export function buildNamePalette(options: NamePaletteOptions = {}) {
  const recentUsedNames = collectUsedPoolNames(options.recentStoryTexts || [])
  const continuityNames = collectUsedPoolNames([options.seriesContinuityText || ''])
  const usedForNewNames = new Set(Array.from(recentUsedNames))

  const palette = {
    lockedRecurringNames: Array.from(continuityNames).map((name) => {
      const allEntries = [
        ...pools.firstNames.male,
        ...pools.firstNames.female,
        ...pools.firstNames.neutral,
        ...pools.lastNames,
      ]
      return allEntries.find((entry) => compact(entry.name) === name)?.name || name
    }),
    maleFirstNames: sampleEntries(pools.firstNames.male, options.maleCount || 7, options, usedForNewNames),
    femaleFirstNames: sampleEntries(pools.firstNames.female, options.femaleCount || 7, options, usedForNewNames),
    neutralFirstNames: sampleEntries(pools.firstNames.neutral, options.neutralCount || 4, options, usedForNewNames),
    lastNames: sampleEntries(pools.lastNames, options.lastNameCount || 9, options, usedForNewNames),
  }

  return palette
}

export function buildNamePalettePromptBlock(options: NamePaletteOptions = {}) {
  const palette = buildNamePalette(options)
  const lockedLine = palette.lockedRecurringNames.length
    ? `Locked recurring names already established in this series: ${formatList(palette.lockedRecurringNames)}`
    : 'Locked recurring names already established in this series: none'

  return `NAME PALETTE:
${lockedLine}
Male first names: ${formatList(palette.maleFirstNames)}
Female first names: ${formatList(palette.femaleFirstNames)}
Gender-neutral first names: ${formatList(palette.neutralFirstNames)}
Last names: ${formatList(palette.lastNames)}

Name rules:
- Use this palette when naming new characters, but do not use every name.
- Preserve locked recurring character names exactly. Do not rename recurring characters.
- Avoid recently used names and avoid names that sound too similar in the same story.
- Match character gender in the CHARACTER GUIDE to the selected first name.
- If a story-specific reason requires a name outside the palette, keep it plausible for the setting and era.`
}
