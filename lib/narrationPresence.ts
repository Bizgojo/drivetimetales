/**
 * NARRATION-PRESENCE-001 (Independent Recovery, 2026-10-26)
 *
 * Deterministic, zero-cost script check that runs BEFORE any voice spend.
 *
 * Failure it prevents (Creek series 79ffa422, all 3 episodes):
 *   The script header names a narrator ("NARRATOR: Cecily Greer") but the body
 *   has ZERO "NARRATOR:" lines. Narration prose is attributed to characters,
 *   e.g. "WADE HARLAN: She said it without heat, and he looked at her."
 *   Downstream this caused: HOOK-GATE-001 failures (no narrator lines to scan),
 *   character voices truncating long narration (seg57 on EP3, 4 paid cycles),
 *   and an episode rendered with characters reading narration.
 *
 * Rules (only when NARRATOR_IS_CHARACTER is not true):
 *   A. A non-character narrator is declared but the body has no NARRATOR lines.
 *   B. Too many character lines read as third-person narration
 *      (start with She/He/They + past-tense verb, or with the speaker's own
 *      first name). Threshold keeps ordinary dialogue from tripping it.
 */

// Calibrated 2026-10-26 against prod: 118 published scripts max out at 5
// suspect lines (reported speech, e.g. "REMY: He drowned. In this lake.");
// the three mislabeled Creek scripts start at 21. 12 sits well between.
export const MISLABELED_NARRATION_THRESHOLD = 12

export type NarrationPresenceResult = {
  passed: boolean
  issues: string[]
  narratorBodyLines: number
  suspectCharacterLines: number
  examples: string[]
}

const SPEAKER_LINE = /^([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ .'\-]{1,60}?)\s*:\s*(.+)$/

// Header keys that look like "KEY: value" but are not spoken lines.
const NON_SPEAKER_KEYS = new Set([
  'TITLE', 'DESCRIPTION', 'NARRATIVE_VOICE', 'NARRATOR', 'NARRATOR_IS_CHARACTER',
  'GENRE', 'AUTHOR', 'SERIES', 'EPISODE', 'STORY_TYPE', 'RUNTIME', 'SETTING',
  'LOGLINE', 'TONE', 'CATEGORY',
])

const ANNOUNCER_SPEAKERS = new Set(['BELLE B', 'BELLE'])

const THIRD_PERSON_NARRATION = /^(She|He|They)\s+[a-z]+(ed|ew|ood|ept|ook|aid|ad|ent|ame|ew|ought|old|elt|ose|ave|ook)\b/

function headerValue(script: string, key: string): string {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

export function checkNarrationPresence(rawScript: string | null | undefined): NarrationPresenceResult {
  const script = String(rawScript || '')
  const result: NarrationPresenceResult = {
    passed: true,
    issues: [],
    narratorBodyLines: 0,
    suspectCharacterLines: 0,
    examples: [],
  }

  const narratorName = headerValue(script, 'NARRATOR')
  const narratorIsCharacter = /^true$/i.test(headerValue(script, 'NARRATOR_IS_CHARACTER'))
  if (!narratorName || narratorIsCharacter) return result

  // Some scripts label narration with the narrator's own name ("COLE: ...").
  const narratorSpeaker = narratorName.toUpperCase()

  let headerSeen = false
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim()
    const m = line.match(SPEAKER_LINE)
    if (!m) continue
    const speaker = m[1].trim().toUpperCase()
    const text = m[2].trim()

    if (speaker === narratorSpeaker) {
      result.narratorBodyLines++
      continue
    }

    if (speaker === 'NARRATOR') {
      // The first NARRATOR line that equals the declared narrator name is the header.
      if (!headerSeen && text === narratorName) {
        headerSeen = true
        continue
      }
      result.narratorBodyLines++
      continue
    }
    if (NON_SPEAKER_KEYS.has(speaker) || ANNOUNCER_SPEAKERS.has(speaker)) continue

    const ownFirstName = speaker.split(/\s+/)[0]
    const startsWithOwnName = new RegExp(`^${ownFirstName}\\b`, 'i').test(text) && text.split(/\s+/).length > 3
    if (THIRD_PERSON_NARRATION.test(text) || startsWithOwnName) {
      result.suspectCharacterLines++
      if (result.examples.length < 3) result.examples.push(line.slice(0, 120))
    }
  }

  if (result.narratorBodyLines === 0) {
    result.passed = false
    result.issues.push(
      `NARRATION-PRESENCE-001: script declares narrator "${narratorName}" but has zero NARRATOR lines in the body; narration is likely attributed to characters`,
    )
  }
  if (result.suspectCharacterLines >= MISLABELED_NARRATION_THRESHOLD) {
    result.passed = false
    result.issues.push(
      `NARRATION-PRESENCE-001: ${result.suspectCharacterLines} character lines read as third-person narration (threshold ${MISLABELED_NARRATION_THRESHOLD}). Examples: ${result.examples.join(' | ')}`,
    )
  }
  return result
}
