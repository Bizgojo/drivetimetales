/**
 * Validation Gate — Check 1: Duplicate/Triplicate Line Detection
 *
 * Scans a story's parsed segment texts and flags any voice line that appears
 * 2+ times (DUPLICATE) or 3+ times (TRIPLICATE) across the assembly.
 *
 * Catches what happened in EP8 v4 before fix:
 *   TRIPLICATE: "He was right on both counts, of course." (segs 0133, 0135, 0136)
 *   DUPLICATE:  "That's where they gave the made ones their name." (segs 0142, 0144)
 *
 * Usage:
 *   const { checkDuplicateSegments } = require('./lib/validation-gate/check1-duplicate-segments')
 *   const result = checkDuplicateSegments(scriptText)
 *
 * Can also be run as a standalone script:
 *   node scripts/validation-gate-check1.js --story-id <uuid>
 *   node scripts/validation-gate-check1.js --story-id <uuid> --fixture pre-v5
 */

'use strict'

// ── Minimum line length to consider for duplicate detection ─────────────────
// Short lines (e.g. "No.", "Yes.") can legitimately repeat in dialogue.
// We skip any normalized text shorter than this threshold.
const MIN_DUPLICATE_LENGTH = 15

// ── Script parser (mirrors lib/scriptLineIndex.ts logic) ────────────────────
// Must stay in sync with the canonical parser.  Kept as plain JS here so
// this check can run as a standalone script without a TS build step.

const HEADER_KEYS = [
  'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:',
  'SUNO PROMPT:', 'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_',
  'EPISODE_TITLE:', 'SERIES_TOTAL', 'SERIES_IS_FINALE:',
  '[START AUDIO DRAMA SCRIPT]', 'CHARACTER GUIDE', '---',
]

function isAnnouncerSpeaker(speaker) {
  const s = speaker.trim().toUpperCase()
  return s === 'ANNOUNCER' || s === 'BELLE B' || s === 'SANDY'
}

/**
 * Parse a script string into an array of ScriptPosition objects.
 * Each position carries: { index, kind, speaker, text, isExpected, rawLineNumber }
 *
 * This is a plain-JS mirror of lib/scriptLineIndex.ts::parseScriptPositions.
 * Any updates to the canonical parser MUST be reflected here.
 */
function parseScriptPositions(script) {
  const rawLines = script.split('\n')

  // Locate announcer lines (first = intro, last = outro)
  const announcerLineIndices = []
  rawLines.forEach((line, i) => {
    const trimmed = line.trim()
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(trimmed)) return
    if (/^(ANNOUNCER|BELLE B|SANDY):/i.test(trimmed)) announcerLineIndices.push(i)
  })
  const firstAnnouncerIdx = announcerLineIndices[0] ?? -1
  const lastAnnouncerIdx  = announcerLineIndices[announcerLineIndices.length - 1] ?? -1

  // Find drama body boundary
  const explicitScriptStartIdx = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'))
  const characterGuideStartIdx = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'))
  const scriptStartIdx  = explicitScriptStartIdx > -1 ? explicitScriptStartIdx : characterGuideStartIdx
  const headerEndIdx    = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1)

  const positions = []
  let lineIndex   = 0

  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return  // blank line — never counted

    // Skip pre-script lines unless they are the designated intro/outro announcer
    if (
      explicitScriptStartIdx > -1 &&
      rawIdx < explicitScriptStartIdx &&
      rawIdx !== firstAnnouncerIdx &&
      rawIdx !== lastAnnouncerIdx
    ) return

    // Skip structural header keys
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return

    // Skip header-zone NARRATOR/ANNOUNCER lines
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }

    // [BEAT]
    if (trimmed === '[BEAT]') {
      positions.push({ index: lineIndex++, kind: 'silence', speaker: 'BEAT', text: '0.75', isExpected: true, rawLineNumber: rawIdx + 1 })
      return
    }

    // [PAUSE]
    if (trimmed === '[PAUSE]') {
      positions.push({ index: lineIndex++, kind: 'silence', speaker: 'PAUSE', text: '1', isExpected: true, rawLineNumber: rawIdx + 1 })
      return
    }

    // [PAUSE:N] or [PAUSE:N.N]
    const pauseMatch = trimmed.match(/^\[PAUSE:(\d+(?:\.\d+)?)\]$/)
    if (pauseMatch) {
      positions.push({ index: lineIndex++, kind: 'silence', speaker: 'PAUSE', text: pauseMatch[1], isExpected: true, rawLineNumber: rawIdx + 1 })
      return
    }

    // [SFX: ...]
    if (trimmed.startsWith('[SFX:')) {
      const sfxText = trimmed.replace(/^\[SFX:\s*/, '').replace(/\]$/, '').trim()
      positions.push({ index: lineIndex++, kind: 'sfx', speaker: 'SFX', text: sfxText, isExpected: false, rawLineNumber: rawIdx + 1 })
      return
    }

    // [SPEAKER]: text — bracketed format
    const bracketDm = trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/)
    if (bracketDm) {
      const speaker    = bracketDm[1].trim()
      const text       = bracketDm[2].trim()
      const isAnnouncer = isAnnouncerSpeaker(speaker)
      positions.push({ index: lineIndex++, kind: 'voice', speaker, text, isExpected: !isAnnouncer, rawLineNumber: rawIdx + 1 })
      return
    }

    // Skip other bare bracket lines
    if (trimmed.startsWith('[')) return

    // Skip legacy ANNOUNCER: Endless Tales presents... lines
    if (trimmed.startsWith('ANNOUNCER:') && /endless tales presents/i.test(trimmed)) return

    // SPEAKER: text — standard format
    const dm = trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)
    if (dm) {
      const speaker    = dm[1].trim()
      const text       = dm[2].trim()
      const isAnnouncer = isAnnouncerSpeaker(speaker)
      positions.push({ index: lineIndex++, kind: 'voice', speaker, text, isExpected: !isAnnouncer, rawLineNumber: rawIdx + 1 })
      return
    }
  })

  return positions
}

// ── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Normalize a text fragment for comparison purposes.
 * Preserves original text for output; only the normalized form is used for matching.
 */
function normalizeLine(text) {
  return text
    .toLowerCase()
    .replace(/["""'']/g, '"')   // normalize smart quotes
    .replace(/[—–-]+/g, '-')    // normalize dashes
    .replace(/\s+/g, ' ')       // collapse whitespace
    .trim()
}

// ── Core check ───────────────────────────────────────────────────────────────

/**
 * CheckResult type:
 * {
 *   passed: boolean,
 *   findings: Array<{
 *     severity: 'DUPLICATE' | 'TRIPLICATE',
 *     originalText: string,
 *     normalizedText: string,
 *     occurrences: Array<{ segmentIndex: number, segmentLabel: string, speaker: string, rawLineNumber: number }>,
 *     count: number,
 *   }>,
 *   summary: {
 *     totalVoiceSegments: number,
 *     duplicateCount: number,
 *     triplicateCount: number,
 *   }
 * }
 */
function checkDuplicateSegments(scriptText) {
  const positions = parseScriptPositions(scriptText)

  // Only examine voice segments that expect an mp3 file (not announcer/sfx)
  const voiceSegments = positions.filter(p => p.kind === 'voice' && p.isExpected)

  // Build frequency map: normalizedText → [occurrence records]
  const textMap = new Map()

  for (const pos of voiceSegments) {
    const norm = normalizeLine(pos.text || '')
    if (norm.length < MIN_DUPLICATE_LENGTH) continue

    if (!textMap.has(norm)) textMap.set(norm, [])
    textMap.get(norm).push({
      segmentIndex: pos.index,
      segmentLabel: `segment_${String(pos.index).padStart(4, '0')}`,
      speaker: pos.speaker || 'UNKNOWN',
      rawLineNumber: pos.rawLineNumber,
      originalText: pos.text,
    })
  }

  const findings = []

  for (const [norm, occurrences] of textMap) {
    if (occurrences.length < 2) continue

    const severity = occurrences.length >= 3 ? 'TRIPLICATE' : 'DUPLICATE'
    findings.push({
      severity,
      originalText: occurrences[0].originalText,
      normalizedText: norm,
      occurrences,
      count: occurrences.length,
    })
  }

  // Sort by severity (TRIPLICATE first), then by first occurrence segment index
  findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'TRIPLICATE' ? -1 : 1
    return a.occurrences[0].segmentIndex - b.occurrences[0].segmentIndex
  })

  const duplicateCount   = findings.filter(f => f.severity === 'DUPLICATE').length
  const triplicateCount  = findings.filter(f => f.severity === 'TRIPLICATE').length

  return {
    passed: findings.length === 0,
    findings,
    summary: {
      totalVoiceSegments: voiceSegments.length,
      duplicateCount,
      triplicateCount,
    },
  }
}

// ── Report formatter ─────────────────────────────────────────────────────────

function formatCheck1Report(result, storyId) {
  const lines = []
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)

  lines.push(`\n╔═══════════════════════════════════════════════════════════╗`)
  lines.push(`║  VALIDATION GATE — CHECK 1: Duplicate/Triplicate Detection  ║`)
  lines.push(`╚═══════════════════════════════════════════════════════════╝`)
  lines.push(`  Timestamp : ${ts}`)
  if (storyId) lines.push(`  Story ID  : ${storyId}`)
  lines.push(`  Segments  : ${result.summary.totalVoiceSegments} voice segments scanned`)
  lines.push('')

  if (result.passed) {
    lines.push(`  ✅  PASSED — No duplicate or triplicate segment text found.`)
  } else {
    lines.push(`  ❌  FAILED — ${result.summary.triplicateCount} TRIPLICATE(s), ${result.summary.duplicateCount} DUPLICATE(s) found.`)
    lines.push('')

    for (const finding of result.findings) {
      const icon = finding.severity === 'TRIPLICATE' ? '🔴' : '🟡'
      lines.push(`  ${icon} ${finding.severity} (${finding.count}×)`)
      lines.push(`     Text     : "${finding.originalText}"`)
      lines.push(`     Segments :`)
      for (const occ of finding.occurrences) {
        lines.push(`       • ${occ.segmentLabel}  [${occ.speaker}]  (script line ${occ.rawLineNumber})`)
      }
      lines.push('')
    }
  }

  lines.push(`───────────────────────────────────────────────────────────`)
  lines.push(result.passed
    ? `  ✅ CHECK 1 VERDICT: CLEAN — safe to proceed with assembly.`
    : `  ❌ CHECK 1 VERDICT: BLOCKED — fix duplicate segments before final mix.`)
  lines.push('')

  return lines.join('\n')
}

// ── Layer 2: Script-level repeat detection ─────────────────────────────────

/**
 * Number of position-index steps that separates two similar segments.
 * gap <= ADJACENT_THRESHOLD → INTENTIONAL_CANDIDATE (deliberate echo/emphasis)
 * gap >  ADJACENT_THRESHOLD → ACCIDENTAL_CANDIDATE  (probably a script mistake)
 */
const ADJACENT_THRESHOLD = 3  // exported named constant

/**
 * Jaro-Winkler similarity between two strings.
 * Returns 0.0–1.0.  Handles empty strings.
 */
function jaroWinkler(s1, s2) {
  if (!s1 && !s2) return 1
  if (!s1 || !s2) return 0
  if (s1 === s2)  return 1

  const len1 = s1.length
  const len2 = s2.length
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0)

  const s1Matches = new Uint8Array(len1)
  const s2Matches = new Uint8Array(len2)
  let matches = 0

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist)
    const end   = Math.min(i + matchDist + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = s2Matches[j] = 1
      matches++
      break
    }
  }

  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  const jaro = (
    matches / len1 +
    matches / len2 +
    (matches - transpositions / 2) / matches
  ) / 3

  let prefixLen = 0
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] !== s2[i]) break
    prefixLen++
  }

  return jaro + prefixLen * 0.1 * (1 - jaro)
}

/**
 * Normalize a segment text for Layer 2 similarity comparison.
 * More aggressive than normalizeLine: also strips punctuation and collapses.
 */
function normalizeForL2(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, '')   // smart quotes
    .replace(/[^a-z0-9 ]/g, ' ')                  // strip all non-alphanum
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * detectScriptLevelRepeats
 *
 * Scans the segment list for pairs of voice lines that are ≥85% similar
 * by Jaro-Winkler distance.  Classifies each pair by gap:
 *
 *   gap = B.index - A.index  (position index from parseScriptPositions)
 *   gap <= threshold  → SCRIPT_INTENTIONAL_CANDIDATE
 *   gap >  threshold  → SCRIPT_ACCIDENTAL_CANDIDATE
 *
 * @param {Array<{index: number, speaker: string, text: string}>} segments
 *   Array of voice-segment records.  index = pos.index from parseScriptPositions.
 * @param {number} [threshold=ADJACENT_THRESHOLD]  Adjacency threshold.
 * @returns {Array<ScriptRepeatFinding>}
 */
function detectScriptLevelRepeats(segments, threshold = ADJACENT_THRESHOLD) {
  const MIN_LENGTH = 15   // skip very short lines ("No.", "Yes.", etc.)
  const SIM_THRESHOLD = 0.85

  const eligible = segments.filter(s => (s.text || '').trim().length >= MIN_LENGTH)
  const findings = []

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i]
      const b = eligible[j]

      const normA = normalizeForL2(a.text)
      const normB = normalizeForL2(b.text)

      const sim = jaroWinkler(normA, normB)
      if (sim < SIM_THRESHOLD) continue

      const gap = b.index - a.index
      const type = gap <= threshold
        ? 'SCRIPT_INTENTIONAL_CANDIDATE'
        : 'SCRIPT_ACCIDENTAL_CANDIDATE'

      const prefix = type === 'SCRIPT_INTENTIONAL_CANDIDATE'
        ? '[SCRIPT-INTENTIONAL]'
        : '[SCRIPT-ACCIDENTAL]'

      const excerpt = a.text.length > 40
        ? '"' + a.text.slice(0, 40) + '…"'
        : '"' + a.text + '"'

      const segLabelA = 'seg_' + String(a.index).padStart(4, '0')
      const segLabelB = 'seg_' + String(b.index).padStart(4, '0')
      const speakerNote = a.speaker === b.speaker ? 'same speaker' : 'different speakers'

      findings.push({
        type,
        textA: a.text,
        textB: b.text,
        segmentA: { index: a.index, speaker: a.speaker },
        segmentB: { index: b.index, speaker: b.speaker },
        gap,
        similarity: parseFloat(sim.toFixed(4)),
        message: `${prefix} ${excerpt} — ${segLabelA} & ${segLabelB}, gap=${gap}, ${speakerNote} → route to Hal`,
      })
    }
  }

  // Sort: ACCIDENTAL first, then by segment index
  findings.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'SCRIPT_ACCIDENTAL_CANDIDATE' ? -1 : 1
    return a.segmentA.index - b.segmentA.index
  })

  return findings
}

// ── Layer 2 report formatter ─────────────────────────────────────────────────

function formatCheck1L2Report(findings) {
  const lines = []
  lines.push(`\n  ── Layer 2: Script-Level Repeat Scan ──────────────────────────────────`)

  if (findings.length === 0) {
    lines.push(`  ✅  No script-level near-duplicates found (threshold: similarity≥0.85).`)
    lines.push(``)
    return lines.join('\n')
  }

  const accidental   = findings.filter(f => f.type === 'SCRIPT_ACCIDENTAL_CANDIDATE')
  const intentional  = findings.filter(f => f.type === 'SCRIPT_INTENTIONAL_CANDIDATE')

  lines.push(`  Found ${findings.length} near-duplicate pair(s): ${accidental.length} ACCIDENTAL, ${intentional.length} INTENTIONAL.`)
  lines.push(``)

  if (accidental.length > 0) {
    lines.push(`  🔴 ACCIDENTAL CANDIDATES (gap > ${ADJACENT_THRESHOLD} — likely a script error):`)
    for (const f of accidental) {
      lines.push(`     ${f.message}`)
      lines.push(`       similarity: ${(f.similarity * 100).toFixed(1)}%`)
      lines.push(`       segA: [${f.segmentA.speaker}] "${f.textA.slice(0, 60)}${f.textA.length > 60 ? '…' : ''}"` )
      lines.push(`       segB: [${f.segmentB.speaker}] "${(f.textB || '').slice(0, 60)}${(f.textB || '').length > 60 ? '\u2026' : ''}" (idx ${f.segmentB.index})`)
      lines.push(``)
    }
  }

  if (intentional.length > 0) {
    lines.push(`  🟡 INTENTIONAL CANDIDATES (gap ≤ ${ADJACENT_THRESHOLD} — possible deliberate emphasis):`)
    for (const f of intentional) {
      lines.push(`     ${f.message}`)
      lines.push(`       similarity: ${(f.similarity * 100).toFixed(1)}%`)
      lines.push(`       segA: [${f.segmentA.speaker}] "${f.textA.slice(0, 60)}${f.textA.length > 60 ? '…' : ''}"` )
      lines.push(`       segB: [${f.segmentB.speaker}] "${(f.textB || '').slice(0, 60)}${(f.textB || '').length > 60 ? '\u2026' : ''}" (idx ${f.segmentB.index})`)
      lines.push(``)
    }
  }

  return lines.join('\n')
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  parseScriptPositions,
  normalizeLine,
  normalizeForL2,
  jaroWinkler,
  checkDuplicateSegments,
  formatCheck1Report,
  detectScriptLevelRepeats,
  formatCheck1L2Report,
  MIN_DUPLICATE_LENGTH,
  ADJACENT_THRESHOLD,
}
