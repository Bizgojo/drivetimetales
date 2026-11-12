/**
 * OUTRO-ENDING-001 (job d90fe3da, 2026-10-28): The Saturday Repair Shop EP3
 * failed 3 drafts on "outro appears cut off" for an outro ending "...the
 * shop's story is far from over." The cut-off rule treated every preposition
 * as a dangling last word, but many of them end English sentences naturally
 * as adverbs: far from over, closes in, stays behind, looks around, came
 * through, the dark outside, the night before. Only words that cannot end a
 * finished sentence are kept: conjunctions, articles, and prepositions that
 * always need an object.
 *
 * OUTRO-ENDING-002 (Nov 12, 2026): "her" and "his" removed. They also end finished
 * sentences as pronouns ("...what came before her", "...still mean to her", "the choice
 * is his"). Weekend Wife EP4 and Second Rise EP5 failed 3 drafts each on complete outros.
 */
export const BELLE_OUTRO_DANGLING_END = /\b(and|or|but|nor|with|to|of|for|from|by|into|onto|upon|toward|towards|among|between|against|beneath|under|while|when|where|whose|the|a|an|my|your|our|their|its)$/i

export function belleOutroLooksCutOff(withoutFinalPunctuation: string): boolean {
  return BELLE_OUTRO_DANGLING_END.test(String(withoutFinalPunctuation || '').trim())
}
