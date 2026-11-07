/**
 * SERIES-FACTS-001 (Rerouted EP1-3, Marc 2026-11-07): the continuity check
 * passed a series where Daniel calls his sister-in-law "my sister" and where
 * Rae and Eddie BOTH have "a cousin at the county sheriff's office".
 *
 * Root cause: relationship facts lived only in each script's CHARACTER GUIDE.
 * The AI continuity check reads the spoken story only (the guide is stripped),
 * and nothing compares the dialogue with the guide. This module turns the
 * guides into a fact sheet and checks the dialogue against it with plain text
 * rules (no AI), so these errors are caught every time.
 *
 * Pure functions; no I/O.
 */

export type SeriesFactEpisode = { episodeNumber: number; script: string }

/** "Rae Okoro is Daniel's sister-in-law" */
export type RelationshipFact = { holder: string; relation: string; of: string; episodeNumber: number; source: string }

export type FactIssue = { episode: number; problem: string; fix: string; line: string }

const KIN = [
  'sister', 'brother', 'cousin', 'wife', 'husband', 'mother', 'father', 'mom', 'dad', 'son', 'daughter',
  'aunt', 'uncle', 'niece', 'nephew', 'grandmother', 'grandfather', 'grandma', 'grandpa', 'grandson',
  'granddaughter', 'fiancee', 'fiancé', 'fiancée', 'fiance', 'boyfriend', 'girlfriend', 'stepmother',
  'stepfather', 'stepsister', 'stepbrother', 'stepson', 'stepdaughter',
]
const KIN_ALT = KIN.map((k) => k.replace(/é/g, 'e')).sort((a, b) => b.length - a.length).join('|')
// "sister-in-law", "half-sister", "ex-wife", "step-brother", plain "sister"
const RELATION = `(?:(?:ex|half|step)-)?(?:${KIN_ALT})(?:-in-law)?`

const STOPWORDS = new Set([
  'about', 'after', 'again', 'there', 'their', 'these', 'those', 'which', 'would', 'could', 'should', 'where',
  'while', 'whatever', 'thing', 'things', 'still', 'really', 'night', 'tonight', 'involved', 'different',
  'wanting', 'tell', 'know', 'going', 'something', 'never', 'always', 'being', 'other', 'every',
  'years', 'months', 'weeks', 'hours', 'minutes', 'since', 'later', 'before', 'today', 'morning', 'evening',
  'three', 'seven', 'eight', 'eleven', 'twelve', 'fifteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty',
  'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'first', 'second', 'third', 'little', 'enough',
  'gonna', 'wanna', 'because', 'maybe', 'nothing', 'anything', 'everything', 'someone', 'anyone', 'people',
])

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string) => stripAccents(String(s || '')).toLowerCase().trim()
const firstName = (name: string) => norm(name).replace(/^(the|dr|mr|mrs|ms|miss)\.?\s+/, '').split(/\s+/)[0] || ''

/** sister-in-law → sister; ex-wife → wife; stepsister → sister */
export function baseRelation(relation: string): string {
  return norm(relation).replace(/-in-law$/, '').replace(/^(ex|half|step)-/, '').replace(/^step(?=[a-z])/, '')
}

function characterGuideLines(script: string): string[] {
  const m = String(script || '').match(/CHARACTER GUIDE\s*\n---\s*\n([\s\S]*?)\n---/i)
  return m ? m[1].split('\n').map((l) => l.trim()).filter(Boolean) : []
}

function guideName(line: string): string {
  const m = line.match(/^(.+?)\s*[\u2014\u2013|:]|^(.+?)\s+-\s+/)
  return (m?.[1] || m?.[2] || '').trim()
}

/** Relationship facts stated in every episode's CHARACTER GUIDE. */
export function extractRelationshipFacts(episodes: SeriesFactEpisode[]): RelationshipFact[] {
  const facts: RelationshipFact[] = []
  // "Daniel's sister-in-law", "Miss Ottie's brother", "Emmett Vane's nephew"
  const re = new RegExp(`((?:[A-Z][A-Za-z'\\-]+\\s+){0,2}[A-Z][A-Za-z'\\-]+)(?:'s|\u2019s)\\s+(${RELATION})\\b`, 'g')
  for (const ep of episodes) {
    for (const line of characterGuideLines(ep.script)) {
      const holder = guideName(line)
      if (!holder) continue
      const rest = line.slice(line.indexOf(holder) + holder.length)
      for (const m of rest.matchAll(re)) {
        // Only a description of this character: the phrase starts a clause
        // ("— Daniel's sister-in-law," / ". Annie's nephew,"). "Was close to
        // Nell's father" describes someone else and is not a fact about them.
        const before = rest.slice(0, m.index || 0)
        const clause = before.slice(Math.max(before.lastIndexOf(','), before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf('\u2014'), before.lastIndexOf('\u2013'), before.lastIndexOf('(')) + 1)
        if (!/^\s*(?:(?:a|an|the|and|is)\s+)?$/i.test(clause)) continue
        const fact = { holder, relation: norm(m[2]), of: m[1], episodeNumber: ep.episodeNumber, source: line }
        if (!facts.some((f) => norm(f.holder) === norm(fact.holder) && f.relation === fact.relation && norm(f.of) === norm(fact.of))) facts.push(fact)
      }
    }
  }
  return facts
}

/** Spoken lines only: "SPEAKER: text" after [START AUDIO DRAMA SCRIPT], before the Belle outro. */
function dialogueLines(script: string): Array<{ speaker: string; text: string; raw: string }> {
  const s = String(script || '')
  const start = s.indexOf('[START AUDIO DRAMA SCRIPT]')
  let body = start >= 0 ? s.slice(start) : s
  const outro = body.search(/\n\s*BELLE B OUTRO\b/i)
  if (outro >= 0) body = body.slice(0, outro)
  const out: Array<{ speaker: string; text: string; raw: string }> = []
  for (const raw of body.split('\n')) {
    const m = raw.match(/^\s*([A-Z][A-Z0-9 .'\-]{1,60}?)\s*:\s*(.+)$/)
    if (!m) continue
    const speaker = m[1].trim()
    if (/^(NARRATOR|BELLE B|ANNOUNCER)$/i.test(speaker)) continue
    out.push({ speaker, text: m[2].trim(), raw: raw.trim() })
  }
  return out
}

function contextWords(text: string): Set<string> {
  return new Set(norm(text).replace(/[^a-z\s']/g, ' ').split(/\s+/)
    .map((w) => w.replace(/'s$/, ''))
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w)))
}

/**
 * Plain-text fact check. Two rules, both caught on Rerouted:
 *  1. A speaker names a relative with the wrong relationship word compared with
 *     the cast list ("my sister" when the cast list says sister-in-law).
 *  2. Two different characters each claim the same kind of relative in the same
 *     place ("my cousin ... county sheriff" said by Rae AND Eddie).
 */
export function checkSeriesFacts(episodes: SeriesFactEpisode[]): { facts: RelationshipFact[]; issues: FactIssue[] } {
  const sorted = [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
  const facts = extractRelationshipFacts(sorted)
  const issues: FactIssue[] = []
  const claimRe = new RegExp(`\\b(?:my|i have an?|i got an?)\\s+(${RELATION})\\b`, 'gi')
  const owned: Array<{ owner: string; relation: string; words: Set<string>; episode: number; line: string }> = []

  for (const ep of sorted) {
    for (const d of dialogueLines(ep.script)) {
      const speaker = firstName(d.speaker)
      for (const m of d.text.matchAll(claimRe)) {
        const said = norm(m[1])
        // Rule 1: relationship word drift against the cast list.
        const mine = facts.filter((f) => firstName(f.of) === speaker)
        const exact = mine.some((f) => f.relation === said)
        const near = mine.find((f) => f.relation !== said && baseRelation(f.relation) === baseRelation(said))
        if (!exact && near) {
          issues.push({
            episode: ep.episodeNumber,
            problem: `${d.speaker} says "my ${said}", but the cast list says ${near.holder} is ${near.of}'s ${near.relation}.`,
            fix: `Change "my ${said}" to "my ${near.relation}" (or name ${near.holder}).`,
            line: d.raw,
          })
        }
        // Rule 2 bookkeeping: relatives a speaker owns, with where they are.
        const after = d.text.slice((m.index || 0) + m[0].length)
        const nextLine = after.split(/(?<=[.!?])\s/)[0]
        owned.push({ owner: speaker, relation: baseRelation(said), words: contextWords(nextLine), episode: ep.episodeNumber, line: d.raw })
      }
    }
  }

  const reported = new Set<string>()
  for (let i = 0; i < owned.length; i += 1) {
    for (let j = i + 1; j < owned.length; j += 1) {
      const a = owned[i], b = owned[j]
      if (a.owner === b.owner || a.relation !== b.relation) continue
      const shared = [...a.words].filter((w) => b.words.has(w))
      if (!shared.length) continue
      const key = [a.relation, ...[a.owner, b.owner].sort()].join('|')
      if (reported.has(key)) continue
      reported.add(key)
      issues.push({
        episode: b.episode,
        problem: `Two characters each have a ${a.relation} (${shared.join(', ')}): "${a.line}" (Episode ${a.episode}) and "${b.line}" (Episode ${b.episode}).`,
        fix: `Give the ${a.relation} to one character only and change the other line to match.`,
        line: b.line,
      })
    }
  }
  return { facts, issues }
}

/** Fact sheet for the writer and the AI continuity check. */
export function formatFactSheet(facts: RelationshipFact[]): string {
  if (!facts.length) return ''
  return facts.map((f) => `- ${f.holder} is ${f.of}'s ${f.relation}.`).join('\n')
}

/** The cast lists of every episode, for the AI continuity check. */
export function castListsText(episodes: SeriesFactEpisode[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const ep of [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)) {
    for (const line of characterGuideLines(ep.script)) {
      const key = norm(line)
      if (seen.has(key) || /^BELLE B\b/i.test(line)) continue
      seen.add(key)
      lines.push(`- (Episode ${ep.episodeNumber}) ${line}`)
    }
  }
  return lines.join('\n')
}
