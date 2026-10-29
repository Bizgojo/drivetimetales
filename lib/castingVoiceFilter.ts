/**
 * CAST-VOICE-FIT-001 (job a21df7bd, 2026-10-27): auto-cast gave FRANK WAVERLY,
 * a quiet island handyman, "Dr. Quibble - Nerdy Cartoon Scientist", and an
 * English-speaking character in EP2 a Vietnamese-labelled voice ("Khánh Tư -
 * Giọng kể chuyện và nhân vật"). Both came from the character_voices pool.
 * These voices are never chosen by AUTO-cast for drama characters. An existing
 * story/series assignment is not affected.
 */
const NOVELTY_VOICE_RE = /\b(cartoon|cartoonish|nerdy|goofy|silly|squeaky|wacky|zany|dragon|villain|goblin|gremlin|ogre|troll|monster|wizard|witch|elf|alien|robot|robotic|android|anime|muppet|mascot|toon|chipmunk|demon|creature|pirate)\b/i

/** True when the voice name is labelled in a language other than English (letters outside Latin-1). */
export function hasNonEnglishLabel(name: string | null | undefined): boolean {
  const text = String(name || '')
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    // A letter beyond Latin-1 (e.g. Vietnamese ư, ạ). Punctuation such as an en dash is not a letter.
    if (text.charCodeAt(i) > 0xff && ch.toLowerCase() !== ch.toUpperCase()) return true
  }
  return false
}

/**
 * CAST-BLOCK-001 (Marc 2026-10-28): voices built for a job other than drama —
 * influencer/social clips, ASMR/sleep/meditation, customer service, phone
 * systems, assistants, tutorials. They read flat, sleepy or "on hold" in a
 * story (Hastings "too slow and sleepy", Felix, phone-system voices).
 * Matched on the voice NAME only, because ElevenLabs' use_case labels are too
 * broad (Marc's own pick "B. Oxley - Promovoice" is labelled advertisement).
 */
const NON_DRAMA_PURPOSE_RE = /\b(influencers?|social media|social|tiktok|youtube|youtuber|vlogs?|vlogger|asmr|sleep|sleepy|bedtime|lullaby|meditation|meditative|mindful|hypnosis|hypnotic|relaxing|relaxation|customer service|customer care|customer voice|customer support|healthcare support|call cent(?:er|re)|receptionist|ivr|on-hold|phone|telephone|voicemail|assistant|chatbot|tutorial|walkthrough|how to's|explainers?|e-?learning|corporate|whisper)\b/i

/** ElevenLabs descriptive labels that never suit a drama character. */
const NON_DRAMA_DESCRIPTIVE = new Set(['meditative', 'whispery'])

export function isNonDramaPurposeVoice(voice: { name?: string | null; descriptive?: string | null }): boolean {
  if (NON_DRAMA_PURPOSE_RE.test(String(voice.name || ''))) return true
  return NON_DRAMA_DESCRIPTIVE.has(String(voice.descriptive || '').trim().toLowerCase())
}

export function isUnsuitableAutoCastVoice(voice: { name?: string | null; descriptive?: string | null }): boolean {
  const name = String(voice.name || '')
  if (NOVELTY_VOICE_RE.test(name) || NOVELTY_VOICE_RE.test(String(voice.descriptive || ''))) return true
  if (isNonDramaPurposeVoice(voice)) return true
  return hasNonEnglishLabel(name)
}

export type AgeBand = 'young' | 'middle_aged' | 'old'

const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
const TEENS: Record<string, number> = { thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }

/** AGE-WORDS-001: first spelled-out age in a description ("forty-eight", "sixty", "seventeen"). */
export function spelledOutAge(text: string): number | null {
  const m = text.match(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\b(?!\s*(?:minutes?|miles?|feet|dollars?|percent|times|seconds?|hours?|days?|steps?|yards?))/)
  if (m) return TENS[m[1]] + (m[2] ? UNITS[m[2]] : 0)
  const t = text.match(/\b(thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b(?!\s*(?:minutes?|miles?|feet|dollars?|percent|times|seconds?|hours?|days?|steps?|yards?))/)
  return t ? TEENS[t[1]] : null
}

/**
 * CAST-BLOCK-001: age band from a character description. A bare number is
 * read only when it looks like an age ("62", "in his 60s", "sixties"), and
 * age words win over the default. Default stays middle_aged (35).
 */
export function ageBandFromDescription(description: string | null | undefined): AgeBand {
  // AGE-WORDS-001 (The Nanny Cam, Oct 29): "old-money" made a 48-year-old
  // "old" and got him a mountain-man voice. Drop compounds where "old" is not
  // an age, and read spelled-out ages ("forty-eight") before anything else.
  const d = String(description || '')
    .toLowerCase()
    .replace(/\bold[- ](money|fashioned|school|friends?|town|house|habits?|world|guard|flame|ways?|family|south|southern|charleston|line)\b/g, ' ')
  const spelled = spelledOutAge(d)
  if (spelled !== null) return spelled < 30 ? 'young' : spelled < 55 ? 'middle_aged' : 'old'
  const decade = d.match(/\b(?:in (?:his|her|their) )?(\d)0s\b/)
  if (decade) {
    const n = Number(decade[1]) * 10
    return n < 30 ? 'young' : n < 55 ? 'middle_aged' : 'old'
  }
  const word = d.match(/\b(teens?|twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b/)
  if (word) {
    const w = word[1]
    if (/^teen|twenties/.test(w)) return 'young'
    if (/thirties|forties/.test(w)) return 'middle_aged'
    if (w === 'fifties') return /\blate fifties\b/.test(d) ? 'old' : 'middle_aged'
    return 'old'
  }
  const num = d.match(/\b(1[3-9]|[2-9]\d)(?:[- ]?(?:years?[- ]old|yo|y\/o))?\b/)
  if (num) {
    const n = Number(num[1])
    return n < 30 ? 'young' : n < 55 ? 'middle_aged' : 'old'
  }
  if (/\b(elderly|old|older|aging|ageing|aged|grizzled|weathered|veteran|retired|grandfather|grandmother|grandpa|grandma|gray-haired|grey-haired|white-haired|silver-haired|old-timer|senior|patriarch|matriarch|ancient)\b/.test(d)) return 'old'
  if (/\b(young|teen|teenage|teenager|kid|boy|girl|student|rookie|youthful|college|cadet|intern)\b/.test(d)) return 'young'
  return 'middle_aged'
}

/** CAST-BLOCK-001: age fit score — a two-band miss (old man → young voice) is disqualifying. */
export function ageFitScore(voiceAge: string | null | undefined, characterAge: string | null | undefined): number {
  const ages = ['young', 'middle_aged', 'old']
  const v = ages.indexOf(String(voiceAge || ''))
  const c = ages.indexOf(String(characterAge || ''))
  if (v < 0 || c < 0) return 0
  const diff = Math.abs(v - c)
  return diff === 0 ? 30 : diff === 1 ? -10 : -999
}

const HIGH_ENERGY_TONES = new Set(['intense', 'serious', 'confident', 'rough', 'raspy', 'upbeat'])
const LOW_ENERGY_VOICE_LABELS = /\b(calm|soft|gentle|chill|relaxed|soothing|meditative|whispery)\b/i

/**
 * CAST-BLOCK-001: an intense/menacing/commanding character must not get a
 * soft, calm or chill voice ("Hastings too slow and sleepy").
 */
export function energyFitPenalty(characterTones: string[], voiceDescriptive: string | null | undefined): number {
  const wantsEnergy = characterTones.some((t) => HIGH_ENERGY_TONES.has(t))
  const wantsCalm = characterTones.some((t) => t === 'calm' || t === 'gentle' || t === 'meditative')
  if (!wantsEnergy || wantsCalm) return 0
  return LOW_ENERGY_VOICE_LABELS.test(String(voiceDescriptive || '')) ? -30 : 0
}

/**
 * Use-case bonus for drama casting. The old check `useCase.includes('character')`
 * also matched ElevenLabs' "characters_animation" category and so favoured
 * cartoon voices; animation voices now get no bonus.
 */
export function dramaUseCaseBonus(useCase: string | null | undefined): number {
  const u = String(useCase || '').toLowerCase()
  if (u.includes('animation')) return 0
  if (u.includes('character')) return 8
  if (u.includes('conversational')) return 5
  if (u.includes('entertainment')) return 4
  return 0
}
