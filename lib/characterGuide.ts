/**
 * Moved verbatim from app/api/admin/generate-voices/route.ts (CAST-GUIDE-001)
 * so the series writer's self-check can run the exact casting rule the voice
 * step enforces. generate-voices re-exports both functions.
 */
export interface CharacterInfo {
  name: string
  gender: 'male' | 'female' | 'unknown'
  description: string
  isProtagonist: boolean
}

// CREEK-CASTING-GAP-001: separator class includes pipe (|) because script-writer
// prompts say only "list each speaking character" and the model sometimes emits
// pipe-delimited guide lines ("KATHERINE | female, 60s | ..."). Without this,
// nameMatch failed, the character was silently skipped, availableGuideCharacters
// came back empty, and casting hard-gated with character_description_missing.
// Exported for unit test (creek-character-guide-pipe.test.ts).
export function parseCharacterGuide(script: string): CharacterInfo[] {
  const chars: CharacterInfo[] = []
  const guideMatch = script.match(/CHARACTER GUIDE\s*\n---\s*\n([\s\S]*?)(?:\n---|\[START AUDIO DRAMA SCRIPT\])/i)
  if (!guideMatch) return chars
  const guideLines = guideMatch[1].split('\n').filter(l => l.trim())
  for (const line of guideLines) {
    const nameMatch = line.match(/^([A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\s'.()/]+?)\s*(?:[\u2014\u2013\-|:])/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    const lower = line.toLowerCase()
    let gender: CharacterInfo['gender'] = 'unknown'
    if (lower.includes(', male') || lower.includes(' male,') || lower.includes('male ')) gender = 'male'
    if (lower.includes(', female') || lower.includes(' female,') || lower.includes('female ')) gender = 'female'
    const isProtagonist = lower.includes('protagonist') || lower.includes('narrator') || chars.length === 0
    chars.push({ name, gender, description: line, isProtagonist })
  }
  return chars
}

// CREEK-CASTING-GAP-001: exported for unit test. Note: characterVoiceKeys already
// registers each name part (first/last) as a lookup key, so a first-name-only
// speaker label ("KATHERINE") resolves against a full-name guide entry
// ("Katherine Whitfield") and vice versa — no parser change needed for that.
export function characterVoiceKeys(name: string): string[] {
  const titleMatch = name.match(/^\s*(Dr|Doctor|Mr|Mrs|Ms|Miss|Director|Deputy|Officer|Agent|Colonel|Captain|Lieutenant|Sergeant|Sheriff)\.?\s+(.+)$/i)
  const cleaned = name
    .replace(/\b(Dr|Doctor|Mr|Mrs|Ms|Miss|Director|Deputy|Officer|Agent|Colonel|Captain|Lieutenant|Sergeant|Sheriff)\.?\b/gi, '')
    .trim()
  const withoutParentheticals = cleaned
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim()
  const descriptorExpanded = cleaned
    .replace(/[()]/g, ' ')
    .trim()

  const keys = new Set<string>()

  const addKeysForName = (rawName: string) => {
    const normalized = rawName.replace(/\s+/g, ' ').trim()
    const parts = normalized
      .split(/\s+/)
      .map(part => part.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'.-]/g, '').trim())
      .filter(part => part.length > 1)

    if (normalized) keys.add(normalized.toUpperCase())
    parts.forEach(part => keys.add(part.toUpperCase()))
    if (parts.length >= 2) keys.add(parts.slice(-2).join(' ').toUpperCase())
  }

  addKeysForName(withoutParentheticals || descriptorExpanded)
  addKeysForName(descriptorExpanded)
  if (titleMatch) {
    const title = titleMatch[1].replace(/^Dr$/i, 'Doctor')
    const titleRest = titleMatch[2]
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/[()]/g, ' ')
      .trim()
    const titleParts = titleRest
      .split(/\s+/)
      .map(part => part.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'.-]/g, '').trim())
      .filter(part => part.length > 1)
    const lastName = titleParts[titleParts.length - 1]
    if (lastName) addKeysForName(`${title} ${lastName}`)
  }
  cleaned.split('/').forEach(alias => {
    addKeysForName(alias.replace(/\s*\([^)]*\)\s*/g, ' '))
    addKeysForName(alias.replace(/[()]/g, ' '))
  })
  return Array.from(keys)
}


/**
 * CAST-GUIDE-001 (job a21df7bd: EP3 gave one line to FRANK, who was not in its
 * CHARACTER GUIDE; voices stopped with character_description_missing).
 * Voiced speakers the voice step could not cast from this script's own guide,
 * using the same name keys as resolveVoiceForSpeaker.
 */
export function speakersMissingFromCharacterGuide(script: string, speakers: Iterable<string>): string[] {
  const keys = new Set<string>()
  for (const c of parseCharacterGuide(script)) {
    keys.add(c.name.replace(/\s+/g, ' ').trim().toUpperCase())
    for (const k of characterVoiceKeys(c.name)) keys.add(k)
  }
  const missing: string[] = []
  for (const speaker of speakers) {
    const raw = speaker.replace(/\s+/g, ' ').trim().toUpperCase()
    if (keys.has(raw) || characterVoiceKeys(speaker).some((k) => keys.has(k))) continue
    missing.push(speaker)
  }
  return missing
}
