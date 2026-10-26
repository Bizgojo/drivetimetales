/**
 * SCRIPT-LABELS-001 — speaker-label and SFX-cue format, shared by the voice
 * preflight (generate-voices) and the series writer's self-check, so the
 * writer cannot save a script the voice step will refuse.
 *
 * Job f5b565be (2026-10-26): all 3 writer-proof scripts passed the writer
 * self-check and package validation, then series_voice_preflight refused EP1:
 * 51 "unlabeled" lines — mixed-case labels ("Nell Faraday:") — and SFX cues
 * written as "SFX-001: [...]" / "SFX: [SFX-zero-zero-one — ...]".
 */

/** Moved verbatim from app/api/admin/generate-voices/route.ts (behaviour unchanged). */
export function findUnlabeledStoryBodyLines(script: string) {
  const rawLines = script.split('\n')
  const startIdx = rawLines.findIndex(line => line.includes('[START AUDIO DRAMA SCRIPT]'))
  if (startIdx === -1) return []

  const allowedSectionMarkers = new Set([
    'BELLE B ANNOUNCEMENT',
    'BELLE B INTRO',
    'BELLE B OUTRO',
    '[START AUDIO DRAMA SCRIPT]',
    '[END AUDIO DRAMA SCRIPT]',
  ])
  // END-EPISODE-MARKER-001 (Type A, proof-run 2 Oct 3): Hal series scripts close
  // with [END EPISODE N], a structural marker that is never a spoken line.
  // Accept it (and the canonical end marker) via regex — mirrors
  // lib/scriptLineIndex.ts, which already skips all bare bracket lines.
  const structuralEndMarkerRe = /^\[END (AUDIO DRAMA SCRIPT|EPISODE \d+(?:\s*[\u2014\u2013-]\s*.+)?)\]$/i
  const speakerLabelRe = /^([A-Z][A-ZÀ-Ú0-9\s'.()/&-]+?):\s*(.+)$/
  const bracketCueRe = /^\[(BEAT|PAUSE(?::\d+(?:\.\d+)?)?|SFX:\s*.+)\]$/i

  return rawLines
    .slice(startIdx + 1)
    .map((line, offset) => ({ lineNumber: startIdx + offset + 2, text: line.trim() }))
    .filter(({ text }) => {
      if (!text) return false
      if (/^-{3,}$/.test(text)) return false
      if (allowedSectionMarkers.has(text.toUpperCase())) return false
      if (structuralEndMarkerRe.test(text)) return false
      if (bracketCueRe.test(text)) return false
      if (speakerLabelRe.test(text)) return false
      return true
    })
}

const BODY_START = '[START AUDIO DRAMA SCRIPT]'

/** Speaker labels that are really sound-effect cues ("SFX:", "SFX-001:"). */
export function findSfxLabelLines(script: string): Array<{ lineNumber: number; text: string }> {
  const rawLines = script.split('\n')
  const startIdx = rawLines.findIndex((line) => line.includes(BODY_START))
  if (startIdx === -1) return []
  return rawLines
    .slice(startIdx + 1)
    .map((line, offset) => ({ lineNumber: startIdx + offset + 2, text: line.trim() }))
    .filter(({ text }) => /^SFX\b[^:\n]{0,20}:/i.test(text))
}

function guideNames(script: string): Set<string> {
  const names = new Set<string>()
  const m = script.match(/CHARACTER GUIDE([\s\S]*?)(?:\[START AUDIO DRAMA SCRIPT\]|$)/)
  for (const line of (m?.[1] || '').split('\n')) {
    const name = line.replace(/^[-*•\s]+/, '').split(/\s+[—–-]\s+|,|\(|:/)[0].trim()
    if (/^[A-Za-z][A-Za-z.' -]{1,40}$/.test(name)) names.add(name.toUpperCase())
  }
  return names
}

/**
 * Deterministic, format-only repair applied to every writer draft before the
 * self-check (no words change):
 *  - a Title-Case speaker label ("Nell Faraday:") becomes upper case when that
 *    name is a CHARACTER GUIDE entry or is already used upper case as a label;
 *  - "SFX-001: [desc]" / "SFX: [SFX-A — desc]" / "SFX: desc" becomes "[SFX: desc]".
 */
export function normalizeScriptFormat(script: string): { script: string; changes: number } {
  const lines = script.split('\n')
  const startIdx = lines.findIndex((line) => line.includes(BODY_START))
  if (startIdx === -1) return { script, changes: 0 }
  const known = guideNames(script)
  for (const line of lines.slice(startIdx + 1)) {
    const m = line.trim().match(/^([A-Z][A-Z .'-]{1,40}):/)
    if (m) known.add(m[1].trim())
  }
  let changes = 0
  for (let i = startIdx + 1; i < lines.length; i++) {
    const raw = lines[i]
    const text = raw.trim()
    const sfx = text.match(/^SFX\b[^:\n]{0,20}:\s*(.+)$/i)
    if (sfx) {
      let desc = sfx[1].trim().replace(/^\[(.*)\]$/, '$1').trim()
      desc = desc.replace(/^SFX[^\s\]—–]*\s*[—–:-]+\s*/i, '').trim()
      if (desc) {
        lines[i] = `[SFX: ${desc}]`
        changes++
      }
      continue
    }
    const label = text.match(/^([A-Z][a-z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*){0,3}):(\s*\S[\s\S]*)$/)
    if (label && known.has(label[1].toUpperCase())) {
      lines[i] = `${label[1].toUpperCase()}:${label[2]}`
      changes++
    }
  }
  return { script: lines.join('\n'), changes }
}
