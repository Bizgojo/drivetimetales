/**
 * ATL-PARSER-001 — Single shared script line-indexing contract.
 *
 * RULE: generate-voices and render-final-mix MUST both call this function.
 * Neither may keep its own counting logic.
 *
 * A "position" is any line that needs an audio file:
 *   - [BEAT]          → silence segment (counted, expected)
 *   - [PAUSE]         → silence segment (counted, expected) — was previously SKIPPED by GV,
 *                       counted by render. This was the root cause of index drift in EP2.
 *   - [PAUSE:N]       → silence segment (counted, expected)
 *   - [SFX: ...]      → sfx segment (counted, NOT in expected set — gets sfx_NNNN.mp3, not segment_)
 *   - Speaker line    → voice segment (counted; expected if non-announcer non-skipped)
 *   - BELLE B / ANNOUNCER → counted, isExpected=false (gets announcement_/outro_ files)
 *
 * Lines that do NOT increment the counter:
 *   - Blank lines
 *   - Header keys (TITLE:, SERIES:, etc.)
 *   - Lines before [START AUDIO DRAMA SCRIPT] that are not the designated intro/outro announcer
 *   - Other bare bracket lines (e.g. [END AUDIO DRAMA SCRIPT])
 *   - Comment or markdown lines
 *
 * The `rawLineNumber` field (1-based) on every position allows generate-voices/parseScript
 * to build a rawLine→index lookup and delegate its counter entirely to this function,
 * eliminating independent counting that can drift.
 */

export interface ScriptPosition {
  /** 0-based line index — used directly as the segment/sfx file number (segment_NNNN.mp3) */
  index: number
  kind: 'voice' | 'sfx' | 'silence'
  speaker?: string       // for kind=voice/silence: e.g. 'NARRATOR', 'BEAT', 'PAUSE', 'SFX'
  text?: string          // spoken text for voice; duration for silence; cue text for sfx
  /** true → render-final-mix expects a segment_NNNN.mp3 for this position.
   *  false → either an sfx_NNNN.mp3 (kind='sfx') or an announcement_/outro_ file (announcer),
   *          or the line contributes to index counting but has no own segment file. */
  isExpected: boolean
  /** 1-based raw line number in the original script string. Used for index delegation. */
  rawLineNumber: number
}

// Header keys that are never spoken/counted — same set used in generate-voices and render-final-mix
const HEADER_KEYS = [
  'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
  'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
  'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
  'CHARACTER GUIDE', '---',
]

function isAnnouncerSpeaker(speaker: string): boolean {
  const s = speaker.trim().toUpperCase()
  return s === 'ANNOUNCER' || s === 'BELLE B' || s === 'SANDY'
}

/**
 * Parse every counted position in `script` and return them in order with
 * canonical 0-based indices.
 *
 * The returned array is the single source of truth for which lines are counted
 * and what index each gets.  Both callers (generate-voices and render-final-mix)
 * derive their file-naming/existence-checks from this output.
 */
export function parseScriptPositions(script: string): ScriptPosition[] {
  const rawLines = script.split('\n')

  // ── Step 1: locate announcer lines (first = intro, last = outro) ──────────
  // "ANNOUNCER: Belle B" (standalone casting note) is explicitly excluded.
  const announcerLineIndices: number[] = []
  rawLines.forEach((line, i) => {
    const trimmed = line.trim()
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(trimmed)) return
    if (/^(ANNOUNCER|BELLE B|SANDY):/i.test(trimmed)) announcerLineIndices.push(i)
  })
  const firstAnnouncerIdx = announcerLineIndices[0] ?? -1
  const lastAnnouncerIdx  = announcerLineIndices[announcerLineIndices.length - 1] ?? -1

  // ── Step 2: find the drama body boundary ─────────────────────────────────
  const explicitScriptStartIdx = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'))
  const characterGuideStartIdx = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'))
  const scriptStartIdx  = explicitScriptStartIdx > -1 ? explicitScriptStartIdx : characterGuideStartIdx
  const headerEndIdx    = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1)

  // ── Step 3: walk every raw line and assign indices ────────────────────────
  const positions: ScriptPosition[] = []
  let lineIndex = 0

  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return   // blank line — never counted

    // Skip pre-script lines unless they ARE the designated intro or outro announcer
    if (
      explicitScriptStartIdx > -1 &&
      rawIdx < explicitScriptStartIdx &&
      rawIdx !== firstAnnouncerIdx &&
      rawIdx !== lastAnnouncerIdx
    ) return

    // Skip structural header keys
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return

    // Skip header-zone NARRATOR/ANNOUNCER lines that slipped through above
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }

    // ── Silence cues ─────────────────────────────────────────────────────────

    // [BEAT] — standard beat pause (~0.75s silence)
    if (trimmed === '[BEAT]') {
      positions.push({
        index: lineIndex++,
        kind: 'silence',
        speaker: 'BEAT',
        text: '0.75',
        isExpected: true,
        rawLineNumber: rawIdx + 1,
      })
      return
    }

    // [PAUSE] — bare pause (1s silence).
    // ATL-PARSER-001 FIX: generate-voices previously fell through to the
    // `trimmed.startsWith('[')` guard and returned WITHOUT incrementing lineIndex.
    // render-final-mix correctly counted it. This caused every line AFTER a bare
    // [PAUSE] to be indexed N-1 in GV vs N in render → mismatched segment filenames.
    if (trimmed === '[PAUSE]') {
      positions.push({
        index: lineIndex++,
        kind: 'silence',
        speaker: 'PAUSE',
        text: '1',        // default 1s — matches generate-voices pause generation
        isExpected: true,
        rawLineNumber: rawIdx + 1,
      })
      return
    }

    // [PAUSE:N] or [PAUSE:N.N] — explicit duration pause
    const pauseMatch = trimmed.match(/^\[PAUSE:(\d+(?:\.\d+)?)\]$/)
    if (pauseMatch) {
      positions.push({
        index: lineIndex++,
        kind: 'silence',
        speaker: 'PAUSE',
        text: pauseMatch[1],
        isExpected: true,
        rawLineNumber: rawIdx + 1,
      })
      return
    }

    // [SFX: ...] — sound effect cue
    // Counted (index incremented) but isExpected=false because it gets sfx_NNNN.mp3,
    // not segment_NNNN.mp3.  render-final-mix's getExpectedStorySegmentNumbers matches.
    if (trimmed.startsWith('[SFX:')) {
      const sfxText = trimmed.replace(/^\[SFX:\s*/, '').replace(/\]$/, '').trim()
      positions.push({
        index: lineIndex++,
        kind: 'sfx',
        speaker: 'SFX',
        text: sfxText,
        isExpected: false,
        rawLineNumber: rawIdx + 1,
      })
      return
    }

    // ── Voice lines ──────────────────────────────────────────────────────────

    // Bracketed dialogue format: [NARRATOR]: text  or  [COLE DRISCOLL]: text
    const bracketDm = trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/)
    if (bracketDm) {
      const speaker = bracketDm[1].trim()
      const text    = bracketDm[2].trim()
      const isAnnouncer = isAnnouncerSpeaker(speaker)
      positions.push({
        index: lineIndex++,
        kind: 'voice',
        speaker,
        text,
        isExpected: !isAnnouncer,
        rawLineNumber: rawIdx + 1,
      })
      return
    }

    // Skip other bare bracket lines — e.g. [END AUDIO DRAMA SCRIPT], [BEAT] variants not
    // matched above.  These do NOT increment lineIndex.
    if (trimmed.startsWith('[')) return

    // Skip legacy "ANNOUNCER: Endless Tales presents..." lines that sometimes appear
    // in the body (inherited from older scripts — not a spoken line in the drama).
    if (trimmed.startsWith('ANNOUNCER:') && /endless tales presents/i.test(trimmed)) return

    // Standard dialogue: SPEAKER: text
    const dm = trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)
    if (dm) {
      const speaker = dm[1].trim()
      const text    = dm[2].trim()
      const isAnnouncer = isAnnouncerSpeaker(speaker)
      positions.push({
        index: lineIndex++,
        kind: 'voice',
        speaker,
        text,
        isExpected: !isAnnouncer,
        rawLineNumber: rawIdx + 1,
      })
    }
  })

  return positions
}
