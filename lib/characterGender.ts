/**
 * CAST-GENDER-002 (2026-11-01, The Lake House Summer): the caster missed
 * gender written in plain words. "Alma Cooper, late sixties, ... grandmother"
 * and "Holden Cooper, sixteen ... his vowels" carried no "male"/"female", so
 * gender came back empty and a woman's voice was cast for the boy, a deep male
 * voice for the grandmother. Substring matching also misread words that merely
 * contain "man" (Romance, manager, woman's).
 *
 * Whole words only. Signals, strongest first:
 *   explicit (male/female, man/woman, boy/girl, lady, gentleman) ×5
 *   kinship and roles (grandmother, father, widow, bride, groom, ...) ×2
 *   pronouns (he/his/him vs she/her/hers) ×1
 * The side with more weight wins; a tie or nothing = '' (unknown).
 */
const EXPLICIT_F = ['female', 'woman', 'girl', 'lady', 'gal']
const EXPLICIT_M = ['male', 'man', 'boy', 'gentleman', 'guy']
const ROLE_F = ['grandmother', 'grandma', 'granny', 'mother', 'mom', 'mama', 'aunt', 'wife', 'widow', 'daughter', 'sister', 'niece', 'bride', 'queen', 'princess', 'actress', 'waitress', 'matriarch', 'stepmother', 'girlfriend', 'nun', 'heroine']
const ROLE_M = ['grandfather', 'grandpa', 'father', 'dad', 'papa', 'uncle', 'husband', 'widower', 'son', 'brother', 'nephew', 'groom', 'king', 'prince', 'patriarch', 'stepfather', 'boyfriend', 'priest', 'monk']
const PRON_F = ['she', 'her', 'hers', 'herself']
const PRON_M = ['he', 'his', 'him', 'himself']

function count(words: string[], list: string[]): number {
  const set = new Set(list)
  return words.filter((w) => set.has(w)).length
}

/**
 * Gender from a character description. Possessive kinship ("Holden's father")
 * still describes the character itself, so it counts; a relative named with a
 * pronoun ("her husband") is a weaker signal than the pronoun it follows.
 */
export function inferGender(description: string): 'male' | 'female' | '' {
  const words = String(description || '').toLowerCase().replace(/[’']s\b/g, '').split(/[^a-z]+/).filter(Boolean)
  // "her husband", "his late wife": the relative's word says nothing about this
  // character (the pronoun before it still counts).
  const POSSESSIVE = ['his', 'her', 'their', 'your', 'my']
  const filtered: string[] = []
  for (let i = 0; i < words.length; i += 1) {
    const isRole = ROLE_F.includes(words[i]) || ROLE_M.includes(words[i])
    if (isRole && [words[i - 1], words[i - 2]].some((w) => w && POSSESSIVE.includes(w))) continue
    filtered.push(words[i])
  }
  const f = count(filtered, EXPLICIT_F) * 5 + count(filtered, ROLE_F) * 2 + count(filtered, PRON_F)
  const m = count(filtered, EXPLICIT_M) * 5 + count(filtered, ROLE_M) * 2 + count(filtered, PRON_M)
  if (f > m) return 'female'
  if (m > f) return 'male'
  return ''
}

/**
 * Gender per character name across a whole series: every episode's CHARACTER
 * GUIDE line for that name votes, so "SIDNEY — seventeen, cheerful" in episode
 * 1 is settled by "SIDNEY — Sidney Wren, male" in episode 3.
 */
export function seriesGenderHints(guides: Array<Array<{ name: string; description: string }>>): Record<string, 'male' | 'female'> {
  const votes: Record<string, { male: number; female: number }> = {}
  for (const guide of guides) {
    for (const c of guide) {
      const g = inferGender(c.description)
      if (!g) continue
      const key = c.name.toUpperCase()
      votes[key] = votes[key] || { male: 0, female: 0 }
      votes[key][g] += 1
    }
  }
  const out: Record<string, 'male' | 'female'> = {}
  for (const [k, v] of Object.entries(votes)) {
    if (v.male > v.female) out[k] = 'male'
    else if (v.female > v.male) out[k] = 'female'
  }
  return out
}
