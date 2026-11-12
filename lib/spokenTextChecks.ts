/**
 * SPOKEN-TEXT-001 (CANON-03, CANON-99 decisions 10 and 11, Marc Nov 9 2026).
 * Three blocking writer checks on the lines the voices will speak:
 *   1. A sentence is never split across two lines with a trailing dash: a spoken line that
 *      ends in a dash and is followed by the SAME speaker's next line. (A dash before a
 *      different speaker is an interruption and is fine.)
 *   2. No line is said twice in a row (the same spoken text on two consecutive lines).
 *   3. Characters never point at the story itself with "episode"/"chapter" ("next episode",
 *      "this chapter", "episode two"); ordinary uses are fine (CANON-99 item 128). Belle is exempt.
 */
import { parseScriptPositions } from './scriptLineIndex'

const ANNOUNCER = /^(ANNOUNCER|BELLE B|BELLE|SANDY)$/i
const TRAILING_DASH = /(?:[—–]|--|-)[\s"'”’*]*$/u
// CANON-99 item 128 (Marc, Nov 10, 2026): "episode"/"chapter" is only banned when it
// points at the story itself ("next episode", "this chapter", "episode two").
// Ordinary uses are fine: "she had an episode", "a chapter of my life", "chapter four" of a book.
const NUM = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)'
const SELF_REFERENCE = new RegExp(
  `\\b(?:this|next|last|previous|the\\s+(?:next|last|previous|final|first)|our|today'?s|tonight'?s)\\s+(?:episode|chapter)s?\\b` +
  `|\\bepisodes?\\s+${NUM}\\b`,
  'i',
)
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export interface SpokenTextIssue { check: 'SPLIT-DASH' | 'REPEATED-LINE' | 'CHAPTER-EPISODE'; line: string }

export function findSpokenTextIssues(script: string): SpokenTextIssue[] {
  const voice = parseScriptPositions(String(script || ''))
    .filter(p => p.kind === 'voice' && p.speaker && p.text && !ANNOUNCER.test(p.speaker))
  const issues: SpokenTextIssue[] = []
  for (let i = 0; i < voice.length; i++) {
    const cur = voice[i], next = voice[i + 1]
    const text = String(cur.text).trim()
    const label = `${cur.speaker}: ${text}`.slice(0, 160)
    if (next && TRAILING_DASH.test(text) && next.speaker === cur.speaker) issues.push({ check: 'SPLIT-DASH', line: label })
    if (next && norm(text) && norm(text) === norm(String(next.text))) issues.push({ check: 'REPEATED-LINE', line: label })
    if (SELF_REFERENCE.test(text)) issues.push({ check: 'CHAPTER-EPISODE', line: label })
  }
  return issues
}

/**
 * SPOKEN-REPEAT-REPAIR-001 (Second Rise EP6, job 23d10ad9, Nov 11): three drafts
 * failed only on "the same line said twice in a row". When the SAME speaker says
 * the identical line twice in a row (a pure duplicate, the Sunset "double lines"
 * defect), the second copy is removed. An echo by a different speaker is left
 * alone and still fails the check (rule 78: only the writer can say if the repeat
 * is the point of the scene).
 */
export function removeSameSpeakerRepeats(script: string): { script: string; removed: number } {
  const raw = String(script || '').split('\n')
  const voice = parseScriptPositions(String(script || ''))
    .filter(p => p.kind === 'voice' && p.speaker && p.text && !ANNOUNCER.test(p.speaker))
  const drop = new Set<number>()
  for (let i = 1; i < voice.length; i++) {
    const prev = voice[i - 1], cur = voice[i]
    if (prev.speaker === cur.speaker && norm(String(cur.text)) && norm(String(cur.text)) === norm(String(prev.text))) drop.add(cur.rawLineNumber - 1)
  }
  if (!drop.size) return { script, removed: 0 }
  return { script: raw.filter((_, i) => !drop.has(i)).join('\n'), removed: drop.size }
}
