/**
 * BLOCKERS-POLISH-001 (canon item 149, Marc Nov 13, 2026: "approve 149").
 * Only what a listener would notice stops a series (blockers). Everything else is polish:
 * fixed in place once, then accepted and listed, never a reason to stop or rewrite.
 */
export type IssueClass = 'blocker' | 'polish'

/** Tags the AI script checker puts in front of each FAIL bullet. */
export const BLOCKER_TAGS = ['CONTINUITY', 'PLOT', 'SPOILER', 'ENDING', 'PROTAGONIST', 'FOLLOW', 'LIMIT'] as const
export const POLISH_TAGS = ['SFX', 'TENSE', 'OPENING', 'OTHER'] as const

/** Story-clarity checks: only "can't tell who is speaking or where" blocks. */
export const CLARITY_BLOCKER_IDS = new Set(['FOLLOW-BY-EAR'])

/** Gemini series-read questions that block; easy_listening is polish. */
export const GEMINI_POLISH_QUESTIONS = new Set(['easy_listening'])

const POLISH_WORDS = /\b(sfx|sound cue|sound effect|decorat|past[- ]tense|tense|speaking characters|voices per scene|speakers? in (this|one|a) scene|reading level|grade \d|twists?|open questions?|insider|acronym|recap|scene[- ]purpose|goal[- ]early|three[- ]sentence|emotion|announced|stock phrase|orientation|five[- ]question|first-time listener)\b/i
const BLOCKER_WORDS = /\b(contradict|continuity|inconsisten|spoil|reveals? the (culprit|killer|survivor|ending)|cliffhanger|finale|ending|protagonist|cannot tell who|can't tell who|who is speaking|plot hole|logic|impossible|characters? (count|limit)|limit \d|characters \(max|max \d+ characters|over the (series )?ceiling|required|missing)\b/i

/** Class of one checker bullet: its [TAG] first, else its words; unknown stays a blocker (safe side). */
export function classifyIssueText(text: string): IssueClass {
  const t = String(text || '').replace(/\*\*/g, '').trim()
  const tag = t.match(/^\[([A-Z_]+)\]/)
  if (tag) {
    const id = tag[1].toUpperCase()
    if ((BLOCKER_TAGS as readonly string[]).includes(id)) return 'blocker'
    if ((POLISH_TAGS as readonly string[]).includes(id)) return 'polish'
    if (GEMINI_POLISH_QUESTIONS.has(id.toLowerCase())) return 'polish'
    if (['CONTINUITY', 'LOGIC', 'CREDIBILITY', 'PROMISE', 'AUDIO'].includes(id)) return 'blocker'
  }
  const low = t.match(/^\[([a-z_]+)\]/)
  if (low) return GEMINI_POLISH_QUESTIONS.has(low[1]) ? 'polish' : 'blocker'
  if (/^CLARITY ([A-Z-]+):/.test(t)) return CLARITY_BLOCKER_IDS.has(t.match(/^CLARITY ([A-Z-]+):/)![1]) ? 'blocker' : 'polish'
  // Strong polish signals first: a sound cue or a tense complaint is polish even when it mentions the story.
  if (/^\[SFX:|\b(sfx|sound cue|sound effect)\b|past[- ]tense/i.test(t) && !/\b(contradict|spoil|protagonist|cliffhanger)\b/i.test(t)) return 'polish'
  if (BLOCKER_WORDS.test(t)) return 'blocker'
  if (POLISH_WORDS.test(t)) return 'polish'
  return 'blocker'
}

export const POLISH_ONLY_MARK = 'BLOCKERS-POLISH-001: POLISH ONLY'
export const POLISH_ACCEPTED_MARK = 'BLOCKERS-POLISH-001: no blockers; polish accepted'

export function isPolishOnlyReport(report: unknown): boolean {
  return String(report || '').includes(POLISH_ONLY_MARK)
}

/** SERIES-HARD-STOP-001: after this many series reads that still find blockers, Marc decides. */
export const MAX_SERIES_BLOCKER_READS = 3

/** Card-copy issues from code: the past-tense word check is polish (DESC-TENSE-001); lengths and missing blocks are blockers. */
export function isPolishCardCopyIssue(issue: string): boolean {
  return /past-tense/i.test(String(issue || ''))
}
