/**
 * Voice Map Gate — Phase 4 Item 2 (ATL-VOICE-MAP-GATE-001)
 *
 * Verifies that every segment being assembled was rendered with the character's
 * CURRENT assigned voice from series_character_roster (is_locked=true).
 *
 * Root motivation: EP10 segment_0089 — Hector line rendered in his OLD voice
 * after a recast, caught only by Marc's ear. This gate catches it structurally,
 * before any mix is written.
 *
 * ── HARD FAIL ─────────────────────────────────────────────────────────────────
 * If ANY voice segment's actual rendered voice_id differs from the character's
 * current series_character_roster assignment, assembly is BLOCKED. No output
 * file is written. Same severity as a garble or orphan failure.
 *
 * ── VOICE RESOLUTION ─────────────────────────────────────────────────────────
 * Expected voice_id (source of truth for current assignment):
 *   1. series_character_roster WHERE is_locked=true — canonical post-recast voice.
 *      Matches on canonical_name_normalized OR any alias.
 *   2. If character is not in series_character_roster → INCONCLUSIVE (not a fail).
 *      Standalone stories, narrators, and uncatalogued characters fall here.
 *
 * Actual rendered voice_id (what was used when the segment was generated):
 *   1. sfxAssetLock manifest voice_segments — exact per-segment record keyed by
 *      character + line_text (searched, not hashed). Most precise source.
 *   2. character_voice_assignments WHERE story_id = storyId — character-level
 *      fallback. Catches recast scenarios even without a manifest entry, because
 *      story-level assignments record the OLD voice while the roster has the NEW.
 *   3. If neither source has an entry → INCONCLUSIVE (not a fail).
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 * Called from lib/assembleAndVerifyFinalMix.ts — NOT as an optional step:
 *
 *   import { runVoiceMapGate } from './voiceMapGate';
 *   const vg = await runVoiceMapGate(storyId, segments);
 *   if (!vg.passed) { ... hard fail ... }
 *
 * CommonJS (correction scripts):
 *   const { runVoiceMapGate } = require('./lib/voiceMapGate');
 *
 * @module voiceMapGate
 */

import { createClient } from '@supabase/supabase-js';

// ATL-PARSER-001 canonical parser — determines which character speaks each segment.
// Both generate-voices and assembleAndVerifyFinalMix delegate all position counting
// to this shared function; voiceMapGate does the same.
import { parseScriptPositions } from './scriptLineIndex';

// sfxAssetLock manifest — authoritative per-segment render record.
// voice_segments entries store character, line_text, and voice_id for every
// locked segment, keyed by content hash.
import { loadManifest } from './sfxAssetLock';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceMapResult {
  /** 0-based segment index — matches the NNNN in segment_NNNN.mp3 */
  segNum: number;

  /** Zero-padded segment name without .mp3 extension, e.g. "segment_0089" */
  segName: string;

  /** Character speaker from the story script. null for silence/sfx/unknown segments. */
  character: string | null;

  /**
   * Voice ID currently assigned to this character in series_character_roster
   * (is_locked=true). null if character is not catalogued in the roster.
   */
  expectedVoiceId: string | null;

  /** Human-readable name for the expected voice (for reporting only). */
  expectedVoiceName: string | null;

  /**
   * Voice ID actually used to render this segment, sourced from sfxAssetLock
   * manifest or character_voice_assignments for this story. null if not found.
   */
  actualVoiceId: string | null;

  /**
   * Gate verdict for this segment:
   *   'pass'         — expected === actual (or segment is silence/sfx, no check needed)
   *   'fail'         — expected !== actual  ← HARD FAIL: blocks entire assembly
   *   'skip'         — silence or sfx segment; voice check not applicable
   *   'inconclusive' — character not in series roster OR actual voice not traceable;
   *                    not a fail — logged for transparency only
   */
  status: 'pass' | 'fail' | 'skip' | 'inconclusive';

  /** Human-readable explanation for any non-pass status. */
  note?: string;
}

export interface VoiceMapGateOutcome {
  /**
   * True only if zero hard-fail segments (status='fail') were detected.
   * Inconclusive segments do NOT set passed=false.
   *
   * ⚠️ If passed === false: HALT. Assembly blocked. No output written.
   */
  passed: boolean;

  /** Segments where actual voice_id ≠ expected voice_id (HARD FAIL). */
  failures: VoiceMapResult[];

  /**
   * Segments where expected or actual voice could not be determined.
   * Logged but not treated as failures. Covers: standalone story characters,
   * narrators (voice tracked on stories.narrator_voice_id, not the roster),
   * and stories rendered before sfxAssetLock was wired.
   */
  inconclusive: VoiceMapResult[];

  /** Full per-segment result list (includes pass, fail, skip, inconclusive). */
  results: VoiceMapResult[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Normalize character name for roster/assignment lookup: trim + uppercase. */
function normalizeName(name: string): string {
  return name.trim().toUpperCase();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the voice map gate for a story.
 *
 * ⚠️ Call this before assembly — if it returns passed=false, halt and write no output.
 *
 * @param storyId   UUID of the story in Supabase `stories` table
 * @param segments  Ordered list of segment filenames to check, e.g. ['segment_0000.mp3', ...]
 * @returns         VoiceMapGateOutcome — inspect .passed before proceeding
 */
export async function runVoiceMapGate(
  storyId: string,
  segments: string[],
): Promise<VoiceMapGateOutcome> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  // Environment guard — can't run without DB access; treat as hard fail
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[voiceMapGate] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot run gate');
    return {
      passed: false,
      failures: [],
      inconclusive: [],
      results: [],
    };
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Fetch story (script + series_id) ──────────────────────────────────────

  const { data: story, error: storyErr } = await sb
    .from('stories')
    .select('script, series_id')
    .eq('id', storyId)
    .single();

  if (storyErr || !story?.script) {
    console.error('[voiceMapGate] Cannot fetch story script:', storyErr?.message ?? 'script column empty');
    return { passed: false, failures: [], inconclusive: [], results: [] };
  }

  // ── ATL-PARSER-001: parse script → segment index → {speaker, text, kind} ──

  const positions = parseScriptPositions(story.script);
  const indexMap = new Map<number, { speaker: string; text: string; kind: string }>();
  for (const pos of positions) {
    indexMap.set(pos.index, {
      speaker: pos.speaker ?? '',
      text:    pos.text    ?? '',
      kind:    pos.kind,
    });
  }

  // ── Load series_character_roster (is_locked=true) — expected voice source ──

  type RosterRow = {
    canonical_name_normalized: string;
    aliases: string[];
    voice_id: string;
    voice_name: string | null;
  };

  let seriesRoster: RosterRow[] = [];
  if (story.series_id) {
    const { data: roster, error: rosterErr } = await sb
      .from('series_character_roster')
      .select('canonical_name_normalized, aliases, voice_id, voice_name')
      .eq('series_id', story.series_id)
      .eq('is_locked', true);

    if (rosterErr) {
      console.warn('[voiceMapGate] series_character_roster fetch error:', rosterErr.message);
    } else {
      seriesRoster = (roster ?? []) as RosterRow[];
    }
  }

  // ── Load character_voice_assignments for this story — actual voice fallback ─

  type AssignmentRow = { character_name_normalized: string; voice_id: string; voice_name: string | null };

  const { data: storyAssignments, error: assignErr } = await sb
    .from('character_voice_assignments')
    .select('character_name_normalized, voice_id, voice_name')
    .eq('story_id', storyId);

  if (assignErr) {
    console.warn('[voiceMapGate] character_voice_assignments fetch error:', assignErr.message);
  }

  const storyAssignmentMap = new Map<string, { voice_id: string; voice_name: string | null }>();
  for (const a of (storyAssignments ?? []) as AssignmentRow[]) {
    storyAssignmentMap.set(a.character_name_normalized, {
      voice_id:   a.voice_id,
      voice_name: a.voice_name,
    });
  }

  // ── Load sfxAssetLock manifest — per-segment actual voice source ───────────
  // Entries keyed by content hash; we search by character+text to find the
  // voice_id used for each segment without needing to recompute the hash.

  const manifest = await loadManifest(storyId);

  // Build lookup: normChar||lineText → voice_id (from manifest voice_segments)
  const manifestVoiceMap = new Map<string, string>();
  if (manifest?.voice_segments) {
    for (const entry of Object.values(manifest.voice_segments)) {
      const key = `${normalizeName(entry.character)}||${entry.line_text.trim()}`;
      manifestVoiceMap.set(key, entry.voice_id);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Find the expected voice_id for a character from series_character_roster (is_locked=true). */
  function findExpected(character: string): { voice_id: string; voice_name: string | null } | null {
    const norm = normalizeName(character);
    for (const r of seriesRoster) {
      // Match on canonical name
      if (r.canonical_name_normalized === norm) {
        return { voice_id: r.voice_id, voice_name: r.voice_name };
      }
      // Match on any alias
      const aliases = (r.aliases ?? []).map((a: string) => normalizeName(a));
      if (aliases.includes(norm)) {
        return { voice_id: r.voice_id, voice_name: r.voice_name };
      }
    }
    return null;
  }

  /**
   * Find the actual rendered voice_id for a segment.
   * Priority: sfxAssetLock manifest (segment-level) → character_voice_assignments (story-level).
   */
  function findActual(character: string, text: string): string | null {
    // 1. sfxAssetLock manifest: most precise — exact segment match via character+text
    const key = `${normalizeName(character)}||${text.trim()}`;
    const fromManifest = manifestVoiceMap.get(key);
    if (fromManifest) return fromManifest;

    // 2. character_voice_assignments for this story: character-level fallback.
    // Reliable for recast detection: story assignments record the OLD voice while
    // series_character_roster has already been updated to the NEW voice post-recast.
    const fromAssignment = storyAssignmentMap.get(normalizeName(character));
    if (fromAssignment) return fromAssignment.voice_id;

    return null;
  }

  // ── Check each segment ────────────────────────────────────────────────────

  const results: VoiceMapResult[] = [];

  for (const seg of segments) {
    const m = seg.match(/^segment_(\d{4})\.mp3$/);
    if (!m) continue; // non-standard filename — skip without adding to results

    const segNum  = parseInt(m[1], 10);
    const segName = `segment_${m[1]}`;
    const pos     = indexMap.get(segNum);

    // ── Silence / sfx segments: skip voice check ──────────────────────────
    if (!pos || pos.kind !== 'voice') {
      results.push({
        segNum, segName,
        character:        pos?.speaker ?? null,
        expectedVoiceId:  null,
        expectedVoiceName: null,
        actualVoiceId:    null,
        status: 'skip',
        note: pos ? `kind=${pos.kind} — no voice check` : 'segment index not found in script',
      });
      continue;
    }

    const character = pos.speaker;

    // ── Resolve expected voice (series roster, is_locked=true) ───────────
    const expectedAssignment = findExpected(character);

    if (!expectedAssignment) {
      // Character not in series roster — inconclusive, not a fail.
      // Covers: standalone story characters, NARRATOR (tracked on stories.narrator_voice_id),
      // ANNOUNCER / BELLE B (never in roster), and any uncatalogued guest character.
      results.push({
        segNum, segName, character,
        expectedVoiceId:   null,
        expectedVoiceName: null,
        actualVoiceId:     findActual(character, pos.text),
        status: 'inconclusive',
        note:   'character not in series_character_roster (is_locked=true) — cannot verify voice assignment',
      });
      continue;
    }

    // ── Resolve actual rendered voice ─────────────────────────────────────
    const actualVoiceId = findActual(character, pos.text);

    if (!actualVoiceId) {
      // No manifest entry, no story assignment — can't verify, but not a definite mismatch.
      results.push({
        segNum, segName, character,
        expectedVoiceId:   expectedAssignment.voice_id,
        expectedVoiceName: expectedAssignment.voice_name,
        actualVoiceId:     null,
        status: 'inconclusive',
        note:   'actual voice_id not traceable (no manifest entry; no story assignment found)',
      });
      continue;
    }

    // ── Compare ───────────────────────────────────────────────────────────
    const voiceMatch = expectedAssignment.voice_id === actualVoiceId;

    results.push({
      segNum, segName, character,
      expectedVoiceId:   expectedAssignment.voice_id,
      expectedVoiceName: expectedAssignment.voice_name,
      actualVoiceId,
      status: voiceMatch ? 'pass' : 'fail',
      note:   voiceMatch
        ? undefined
        : `VOICE MISMATCH — segment rendered with ${actualVoiceId} but character "${character}" ` +
          `is currently assigned to ${expectedAssignment.voice_id} ` +
          `("${expectedAssignment.voice_name ?? 'unknown'}") in series_character_roster. ` +
          `Segment must be re-rendered with the correct voice before assembly.`,
    });
  }

  const failures     = results.filter(r => r.status === 'fail');
  const inconclusive = results.filter(r => r.status === 'inconclusive');

  if (failures.length > 0) {
    console.error(
      `[voiceMapGate] ✗ VOICE MAP GATE FAILED: ${failures.length} segment(s) rendered with wrong voice:\n` +
      failures.map(f => `  ${f.segName} — ${f.character}: actual=${f.actualVoiceId}, expected=${f.expectedVoiceId}`).join('\n')
    );
  } else {
    const passCount = results.filter(r => r.status === 'pass').length;
    const skipCount = results.filter(r => r.status === 'skip').length;
    console.log(
      `[voiceMapGate] ✓ Voice map gate passed` +
      ` (${passCount} checked, ${skipCount} skipped` +
      (inconclusive.length > 0 ? `, ${inconclusive.length} inconclusive` : '') +
      `)`
    );
  }

  if (inconclusive.length > 0) {
    console.warn(
      `[voiceMapGate] ⚠ ${inconclusive.length} segment(s) inconclusive (not in series roster or voice not traceable):\n` +
      inconclusive.slice(0, 5).map(r => `  ${r.segName} — ${r.character}: ${r.note}`).join('\n') +
      (inconclusive.length > 5 ? `\n  ... and ${inconclusive.length - 5} more` : '')
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    inconclusive,
    results,
  };
}

// ── CommonJS shim ─────────────────────────────────────────────────────────────
// Allow: const { runVoiceMapGate } = require('./lib/voiceMapGate');
// Mirrors the pattern in lib/garbleGate.ts and lib/assembleAndVerifyFinalMix.ts.
if (typeof module !== 'undefined') {
  // @ts-ignore
  module.exports = { runVoiceMapGate };
  // @ts-ignore
  module.exports.runVoiceMapGate = runVoiceMapGate;
}
