/**
 * WRITER-TRIM-001 (Second Rise EP7, job ad16a70e, Nov 12, 2026): all three drafts of a
 * 14-minute episode came out a few words over the series ceiling (3,034 spoken words vs a
 * 3,024 max) and the episode failed with nothing else wrong. Asking for a whole new draft
 * did not converge, because each new draft adds scenes back.
 *
 * When the ONLY hard writer blocker left is RUNTIME-SERIES-MAX, one cut-only call trims the
 * last draft back toward the brief target, mostly from description, and the same self-check
 * runs again. The 1.35x ceiling itself is unchanged.
 */

/** True when every hard blocker line is the series length ceiling. */
export function onlyRuntimeMaxBlockers(hardBlockerLines: string[]): boolean {
  return hardBlockerLines.length > 0 && hardBlockerLines.every((b) => /^RUNTIME-SERIES-MAX: /.test(String(b)))
}

export function buildTrimPrompt(input: { script: string; spokenWords: number; targetWords: number; minWords: number; maxWords: number; isFinale: boolean }): string {
  const cut = Math.max(0, input.spokenWords - input.targetWords)
  return `This audio drama episode script is too long: about ${input.spokenWords} spoken words. It must have about ${input.targetWords} spoken words: never fewer than ${input.minWords} and never more than ${input.maxWords}. Cut about ${cut} spoken words.

How to cut:
- Cut first from NARRATOR description, repeated reactions, small talk and lines that restate what the listener already knows.
- Then shorten or merge scenes. Do not add anything new: no new lines, characters, events or SFX cues.
- Keep every clue, every reveal, every name, date, time and number exactly as written.
- Keep the ${input.isFinale ? 'ending and its payoff' : 'final cliffhanger'} exactly as written.
- Keep every header line (TITLE, DESCRIPTION and the rest), the CHARACTER GUIDE, and the BELLE B intro and outro lines word for word.
- Keep the format: one SPEAKER: line per spoken line, the same speaker labels, [SFX: ...] cues on their own lines. Write numbers as words.

Return the WHOLE trimmed script between <script> and </script> tags, and nothing else.

<script>
${input.script}
</script>`
}

/** The trimmed script from the reply, or null when the reply is not a usable script. */
export function parseTrimReply(raw: string, original: string): string | null {
  const text = String(raw || '')
  const open = text.indexOf('<script>')
  const close = text.lastIndexOf('</script>')
  if (open < 0 || close <= open) return null
  const body = text.slice(open + '<script>'.length, close).trim()
  if (!body) return null
  // A cut never removes the Belle lines or the title; if they are gone, the reply is not a trim.
  const belle = (s: string) => (s.match(/^BELLE B[^:\n]*:/gm) || []).length
  if (belle(body) < belle(original)) return null
  if (/^TITLE:/m.test(original) && !/^TITLE:/m.test(body)) return null
  return body
}
