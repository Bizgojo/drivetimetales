/**
 * SPOKEN-TEXT-001 (CANON-03, CANON-99 decisions 10 and 11, Marc Nov 9 2026).
 * Three blocking writer checks on the lines the voices will speak:
 *   1. A sentence is never split across two lines with a trailing dash: a spoken line that
 *      ends in a dash and is followed by the SAME speaker's next line. (A dash before a
 *      different speaker is an interruption and is fine.)
 *   2. No line is said twice in a row (the same spoken text on two consecutive lines).
 *   3. Characters never say "chapter" or "episode" in the story (Belle's lines are exempt).
 */
import { parseScriptPositions } from './scriptLineIndex'

const ANNOUNCER = /^(ANNOUNCER|BELLE B|BELLE|SANDY)$/i
const TRAILING_DASH = /(?:[—–]|--|-)[\s"'”’*]*$/u
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
    if (/\b(chapters?|episodes?)\b/i.test(text)) issues.push({ check: 'CHAPTER-EPISODE', line: label })
  }
  return issues
}
