'use strict'
/**
 * orphan-detection.js — Shared module for detecting orphaned audio segments.
 *
 * Orphaned segments are audio files in storage that no longer correspond to
 * valid positions in the current script, either because:
 *
 *   Mechanism B (HIGH confidence — definitive):
 *     The segment's position index is >= the total parsed script line count.
 *     These are beyond the script boundary and will never be reached during
 *     playback. Auto-excluded from Phase 4 concat; no human confirmation needed.
 *
 *   Mechanism A (HEURISTIC — low confidence):
 *     The N-1 segment of a recast target position, where:
 *       (a) N-1 is NOT itself a recast target (would be regenerated anyway)
 *       (b) N-1 segment file size > VOICE_SIZE_THRESHOLD (suggests real voice, not silence)
 *       (c) Current script at N-1 has a different speaker than the recast character
 *     These are suspects only; the operator must pass --exclude <segname> explicitly.
 *
 * Exports:
 *   detectOrphans(segFiles, allLines, charLines, recastTargetPositions) → OrphanReport
 *
 * @module orphan-detection
 */

/** Canonical silence sizes — files at or below these are almost certainly generated silences */
const CANONICAL_BEAT_SIZE  = 20_000   // bytes — ~19 KB, 0.75 s silence
const CANONICAL_PAUSE_SIZE = 52_000   // bytes — ~48 KB, typical PAUSE duration
/** Files strictly above this threshold are very likely real voice content */
const VOICE_SIZE_THRESHOLD = 60_000   // bytes

/**
 * Detect orphaned segments in storage.
 *
 * @param {Array<{name: string, metadata: {size?: number}, updated_at?: string, created_at?: string}>} segFiles
 *   Array of storage file objects (already filtered to segment_NNNN.mp3 pattern, or not — function
 *   re-filters internally for safety).
 * @param {Array<{index: number, speaker: string, type?: string, text?: string}>} allLines
 *   Parsed script lines, 0-indexed (full output of parseScriptLines).
 * @param {Array<{index: number, speaker: string}>} charLines
 *   Subset of allLines for the character being recast.
 * @param {Set<number>} recastTargetPositions
 *   Set of position indices that are recast targets (charLines.map(l => l.index)).
 *
 * @returns {{
 *   mechanismB: Array<{name, position, size, mtime, mechanism, confidence, reason}>,
 *   mechanismACandidates: Array<{name, position, size, mtime, mechanism, confidence, recastNeighbor, currentSpeakerAtPos, reason}>,
 *   summary: string,
 *   hasDefinitiveOrphans: boolean,
 *   hasCandidates: boolean
 * }}
 */
function detectOrphans(segFiles, allLines, charLines, recastTargetPositions) {
  const parsedLineCount = allLines.length

  // ── Mechanism B: position >= script boundary (HIGH confidence) ────────────────
  const mechanismB = segFiles.filter(f => {
    const m = f.name.match(/^segment_(\d{4})\.mp3$/)
    if (!m) return false
    const pos = parseInt(m[1], 10)
    return pos >= parsedLineCount
  }).map(f => {
    const pos = parseInt(f.name.match(/\d{4}/)[0], 10)
    return {
      name: f.name,
      position: pos,
      size: f.metadata?.size || 0,
      mtime: f.updated_at || f.created_at || null,
      mechanism: 'B',
      confidence: 'HIGH',
      reason: `position ${pos} >= script length ${parsedLineCount}`,
    }
  }).sort((a, b) => a.position - b.position)

  // ── Mechanism A: N-1 heuristic (LOW confidence — requires operator confirmation) ──
  const mechanismACandidates = []
  const seenA = new Set()  // deduplicate (multiple charLines can share the same N-1)

  for (const charLine of charLines) {
    const n = charLine.index
    if (n === 0) continue  // no N-1 for first position

    const n1 = n - 1

    // If N-1 is also a recast target it will be regenerated — no risk, skip
    if (recastTargetPositions.has(n1)) continue

    const n1SegName = `segment_${String(n1).padStart(4, '0')}.mp3`
    if (seenA.has(n1SegName)) continue   // already evaluated from a prior charLine

    // Find N-1 segment in storage
    const n1File = segFiles.find(f => f.name === n1SegName)
    if (!n1File) continue  // segment missing from storage — no orphan risk here

    // Size heuristic: canonical silence is < 60 KB; real voice is almost always larger
    const size = n1File.metadata?.size || 0
    if (size < VOICE_SIZE_THRESHOLD) continue  // too small — almost certainly silence

    // Current script speaker at N-1 position
    const n1ScriptLine = allLines[n1]
    const n1Speaker = n1ScriptLine?.speaker

    // If current script shows SAME character at N-1 — recast will regenerate it; no concern
    if (n1Speaker === charLine.speaker) continue

    // Suspect: large file at N-1, not a recast target, current script shows different speaker
    seenA.add(n1SegName)
    mechanismACandidates.push({
      name: n1SegName,
      position: n1,
      size,
      mtime: n1File.updated_at || n1File.created_at || null,
      mechanism: 'A',
      confidence: 'LOW',
      recastNeighbor: n,
      currentSpeakerAtPos: n1Speaker || '(unknown)',
      reason: `N-1 of recast pos ${n}; size ${(size / 1024).toFixed(0)}KB suggests voice; current script has ${n1Speaker || 'unknown'} not ${charLine.speaker}`,
    })
  }

  mechanismACandidates.sort((a, b) => a.position - b.position)

  const hasDefinitiveOrphans = mechanismB.length > 0
  const hasCandidates = mechanismACandidates.length > 0

  let summary
  if (!hasDefinitiveOrphans && !hasCandidates) {
    summary = 'Storage is clean — no orphaned segments detected'
  } else {
    const parts = []
    if (hasDefinitiveOrphans) parts.push(`${mechanismB.length} Mechanism B orphan(s) [HIGH confidence — auto-excluded]`)
    if (hasCandidates) parts.push(`${mechanismACandidates.length} Mechanism A candidate(s) [LOW confidence — require --exclude]`)
    summary = parts.join('; ')
  }

  return {
    mechanismB,
    mechanismACandidates,
    summary,
    hasDefinitiveOrphans,
    hasCandidates,
  }
}

module.exports = { detectOrphans, VOICE_SIZE_THRESHOLD, CANONICAL_BEAT_SIZE, CANONICAL_PAUSE_SIZE }
