/**
 * BELLE Structure Gate — Phase 4 Item 8 (ATL-BELLE-STRUCTURE-GATE-001)
 *
 * Validates BELLE B intro/outro structure against the canonical BELLE rules
 * (Marc-confirmed 2026-08-31). This module is the authoritative implementation
 * of BELLE-001 through BELLE-006 and is the single source of truth for all
 * callers — do NOT duplicate rule logic in assembleAndVerifyFinalMix or the
 * preflight validator.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *  BELLE-001: Standard/interior episode intro = exactly ONE BELLE B line/segment.
 *             If a listener name is known, it appears once at a natural pause.
 *             Must also read correctly with no name present. BELLE-002 is the
 *             only permitted exception.
 *
 *  BELLE-002: A listener's very first episode reached via the signup funnel
 *             (PV → gate → EP2) uses a multi-sentence personalized welcome.
 *             This is a permanent exception to BELLE-001. Never flag as a
 *             violation. INCONCLUSIVE if no funnel flag available.
 *
 *  BELLE-003: The listener's name NEVER appears in the outro — any episode
 *             type, no exceptions.
 *
 *  BELLE-004: First episode of a series — intro must name the title and author.
 *
 *  BELLE-005: Final episode of a series — outro must recap the story to a
 *             satisfying close, then restate the title and author.
 *
 *  BELLE-006: Interior (non-first, non-final) episodes — intro AND outro must
 *             NOT name the title or the author. Exception: if the series is
 *             broken into seasons, the first episode of each new season DOES
 *             name title/author (same as a series-first episode). Season-break
 *             episodes are INCONCLUSIVE — no hard fail — because there is no
 *             explicit season-break flag to confirm the exception.
 *
 * ── NOT IN SPEC ───────────────────────────────────────────────────────────────
 *  This gate does NOT enforce:
 *   - "4 variations" requirements
 *   - Rhetorical-question bans
 *   - Forbidden-phrase lists
 *   - Quote-marked title enforcement
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 *  ESM:
 *    import { runBelleStructureGate } from './belleStructureGate';
 *    const outcome = await runBelleStructureGate(storyId);
 *    if (!outcome.passed) { ... hard fails present ... }
 *
 *  CommonJS (correction scripts):
 *    const { runBelleStructureGate } = require('./lib/belleStructureGate');
 *
 * @module belleStructureGate
 */

import { createClient } from '@supabase/supabase-js';
import { parseScriptPositions, type ScriptPosition } from './scriptLineIndex';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BelleRuleId =
  | 'BELLE-001'
  | 'BELLE-002'
  | 'BELLE-003'
  | 'BELLE-004'
  | 'BELLE-005'
  | 'BELLE-006';

/**
 * Gate verdict for a single BELLE rule check.
 *  pass         — rule satisfied
 *  fail         — rule violated; HARD FAIL, blocks assembly
 *  inconclusive — cannot determine pass/fail (e.g. missing flag); NOT a hard fail
 *  skip         — rule does not apply to this episode type
 */
export type BelleVerdict = 'pass' | 'fail' | 'inconclusive' | 'skip';

export interface BelleCheckResult {
  /** Rule identifier */
  rule: BelleRuleId;

  /**
   * True for 'pass' and 'skip' (and 'inconclusive' — inconclusive is NOT a hard fail).
   * False only for 'fail'.
   */
  passed: boolean;

  /** Gate verdict for this rule. */
  verdict: BelleVerdict;

  /** Human-readable explanation of the verdict. */
  details: string;

  /** Relevant text excerpt from the intro or outro (for context). */
  evidence?: string;
}

export interface BelleGateOutcome {
  /**
   * True only if NO hard-fail (verdict='fail') checks were triggered.
   * Inconclusive and skipped checks do NOT set passed=false.
   *
   * ⚠️ If passed === false: HALT. Assembly/generation blocked.
   */
  passed: boolean;

  /** Full per-rule result list (all six rules). */
  checks: BelleCheckResult[];

  /**
   * Non-fatal messages: skipped-status notices, warn-not-block published-story
   * null-field notices, and other contextual information.
   */
  warnings: string[];
}

// ── Internal constants ────────────────────────────────────────────────────────

/**
 * Active-pipeline story statuses where null series fields trigger a HARD FAIL.
 * Any status not in SKIP_STATUSES and not 'published' is treated as active-pipeline.
 */
const SKIP_STATUSES = ['cold_storage', 'archived'] as const;

/**
 * Dynamic name substitution markers to look for in outro text (BELLE-003).
 * Any of these patterns constitute a "listener name in outro" violation.
 */
const LISTENER_NAME_PATTERNS: RegExp[] = [
  /\[LISTENER_NAME\]/i,
  /\[NAME\]/i,
  /\{\{name\}\}/i,
  /\{\{listener_name\}\}/i,
  /\{\{\s*listener_name\s*\}\}/i,
  /\{\{\s*name\s*\}\}/i,
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function isSkippableStatus(status: string): boolean {
  return SKIP_STATUSES.some(s => status.toLowerCase().includes(s));
}

function isBelleB(speaker: string | undefined): boolean {
  if (!speaker) return false;
  return speaker.trim().toUpperCase() === 'BELLE B';
}

/**
 * Case-insensitive substring check. Returns false if needle is empty/whitespace.
 */
function containsText(haystack: string, needle: string): boolean {
  const n = needle.trim();
  if (!n) return false;
  return haystack.toLowerCase().includes(n.toLowerCase());
}

/**
 * Returns true if the text contains any listener-name substitution marker.
 */
function containsListenerName(text: string): boolean {
  return LISTENER_NAME_PATTERNS.some(p => p.test(text));
}

/**
 * Join the spoken text of multiple BELLE B segments into a single string.
 */
function joinBelleBText(segments: ScriptPosition[]): string {
  return segments.map(s => (s.text ?? '').trim()).join(' ').trim();
}

/**
 * Extract the intro and outro BELLE B segment clusters from parsed positions.
 *
 *   Intro = all BELLE B voice segments that appear before the first
 *           non-BELLE-B voice segment.
 *
 *   Outro = all BELLE B voice segments that appear after the last
 *           non-BELLE-B voice segment.
 *
 * Both may be empty arrays if the script has no BELLE B lines in that position.
 */
function extractIntroOutro(positions: ScriptPosition[]): {
  intro: ScriptPosition[];
  outro: ScriptPosition[];
} {
  const voicePositions = positions.filter(p => p.kind === 'voice');
  const belleBPositions = voicePositions.filter(p => isBelleB(p.speaker));

  // First non-BELLE-B voice segment — intro boundary
  const firstNonBelleB = voicePositions.find(p => !isBelleB(p.speaker));
  // Last non-BELLE-B voice segment — outro boundary
  const lastNonBelleB = [...voicePositions].reverse().find(p => !isBelleB(p.speaker));

  const intro = firstNonBelleB
    ? belleBPositions.filter(p => p.index < firstNonBelleB.index)
    : belleBPositions; // all BELLE B, no drama content — treat all as intro

  const outro = lastNonBelleB
    ? belleBPositions.filter(p => p.index > lastNonBelleB.index)
    : []; // no drama content → no outro

  return { intro, outro };
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface BelleGateOptions {
  /**
   * Bypass DB fetch — provide pre-fetched story data directly.
   * Useful for testing and for callers that already have the story row.
   * All fields are optional but null series fields trigger normal null-handling.
   */
  storyOverride?: {
    script: string;
    title: string;
    author?: string | null;
    series_episode_number?: number | null;
    series_is_finale?: boolean | null;
    series_total_episodes?: number | null;
    is_funnel_entry?: boolean | null;
    status?: string | null;
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the BELLE structure gate for a story.
 *
 * Checks BELLE-001 through BELLE-006. Hard-fail checks block assembly;
 * inconclusive checks are noted but do not block.
 *
 * @param storyId UUID of the story in Supabase `stories` table
 * @param options Optional: storyOverride for testing or pre-fetched data
 * @returns       BelleGateOutcome — inspect .passed before proceeding
 */
export async function runBelleStructureGate(
  storyId: string,
  options?: BelleGateOptions,
): Promise<BelleGateOutcome> {
  const checks: BelleCheckResult[] = [];
  const warnings: string[] = [];

  // ── Fetch story data ──────────────────────────────────────────────────────

  let story: {
    script: string;
    title: string;
    author?: string | null;
    series_episode_number?: number | null;
    series_is_finale?: boolean | null;
    series_total_episodes?: number | null;
    is_funnel_entry?: boolean | null;
    status?: string | null;
  };

  if (options?.storyOverride) {
    story = options.storyOverride;
  } else {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return {
        passed: false,
        checks: [{
          rule: 'BELLE-001',
          passed: false,
          verdict: 'fail',
          details: '[belleStructureGate] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot fetch story for BELLE gate.',
        }],
        warnings: [],
      };
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rawData, error } = await sb
      .from('stories')
      .select(
        'script, title, author, series_episode_number, series_is_finale, ' +
        'series_total_episodes, is_funnel_entry, status'
      )
      .eq('id', storyId)
      .single();

    // Cast through unknown to avoid Supabase generic-type conflicts.
    // The error guard above already ensures rawData is the actual row.
    const fetchedStory = rawData as unknown as typeof story | null;

    if (error || !fetchedStory?.script) {
      return {
        passed: false,
        checks: [{
          rule: 'BELLE-001',
          passed: false,
          verdict: 'fail',
          details: `[belleStructureGate] Cannot fetch story (${storyId}): ${error?.message ?? 'script column empty'}.`,
        }],
        warnings: [],
      };
    }

    story = fetchedStory;
  }

  // ── Null handling for series position fields ──────────────────────────────

  const status = (story.status ?? '').toLowerCase();

  const hasNullSeriesFields =
    story.series_episode_number == null ||
    story.series_is_finale == null ||
    story.series_total_episodes == null;

  if (hasNullSeriesFields) {
    if (isSkippableStatus(status)) {
      warnings.push(
        `Story status "${story.status ?? 'unknown'}" (cold_storage/archived) — ` +
        `series position fields null; BELLE position checks skipped.`
      );
      return { passed: true, checks: [], warnings };
    }

    if (status === 'published') {
      // Already-published with null series fields — warn-not-block per spec.
      // Structural checks (BELLE-001, BELLE-003) that don't need series position still run.
      warnings.push(
        `Already-published story has null series position fields ` +
        `(series_episode_number=${story.series_episode_number}, ` +
        `series_is_finale=${story.series_is_finale}, ` +
        `series_total_episodes=${story.series_total_episodes}). ` +
        `BELLE position checks (BELLE-004, BELLE-005, BELLE-006) skipped — ` +
        `separate data cleanup ticket required. BELLE-001 and BELLE-003 still run.`
      );
      // Fall through — hasNullSeriesFields=true, position checks below will emit 'skip' verdicts.
    } else {
      // Active-pipeline story with null series fields — HARD FAIL per spec.
      const msg =
        `series position fields null — cannot determine episode position for BELLE check ` +
        `(series_episode_number=${story.series_episode_number}, ` +
        `series_is_finale=${story.series_is_finale}, ` +
        `series_total_episodes=${story.series_total_episodes}).`;
      console.error(`[belleStructureGate] ✗ HARD FAIL: ${msg}`);
      return {
        passed: false,
        checks: [{
          rule: 'BELLE-001',
          passed: false,
          verdict: 'fail',
          details: msg,
        }],
        warnings: [],
      };
    }
  }

  // ── Parse script → BELLE B intro/outro ───────────────────────────────────

  const positions = parseScriptPositions(story.script);
  const { intro, outro } = extractIntroOutro(positions);

  const introText = joinBelleBText(intro);
  const outroText = joinBelleBText(outro);

  const title  = story.title ?? '';
  const author = story.author ?? '';

  // ── Episode position ──────────────────────────────────────────────────────

  const episodeNum = story.series_episode_number ?? null;
  const isFinale   = story.series_is_finale ?? false;
  const isFirstEp  = episodeNum === 1;
  const isInterior = episodeNum !== null && episodeNum > 1 && !isFinale;

  // Funnel flag — for BELLE-002 detection.
  // If the field is absent from the DB row, hasFunnelField will be false.
  const hasFunnelField = 'is_funnel_entry' in story;
  // isFunnelEntry: true | false | null (null = field absent, treated as inconclusive)
  const isFunnelEntry: boolean | null = hasFunnelField
    ? (story.is_funnel_entry ?? null)
    : null;

  // ── BELLE-001 ─────────────────────────────────────────────────────────────
  // Standard/interior episode intro = exactly ONE BELLE B line/segment.
  // BELLE-002 exception: EP2 via funnel may have a multi-sentence intro.
  {
    // Check if BELLE-002 exception applies or might apply
    const isEp2         = episodeNum === 2;
    const belle002Applies      = isEp2 && isFunnelEntry === true;
    const belle002Inconclusive = isEp2 && isFunnelEntry === null;

    if (intro.length === 0) {
      checks.push({
        rule: 'BELLE-001',
        passed: false,
        verdict: 'fail',
        details: 'No BELLE B intro segment found in the script. Every episode must have a BELLE B intro line.',
      });
    } else if (intro.length === 1) {
      checks.push({
        rule: 'BELLE-001',
        passed: true,
        verdict: 'pass',
        details: 'Intro has exactly 1 BELLE B segment. BELLE-001 satisfied.',
        evidence: introText.slice(0, 200),
      });
    } else {
      // Multiple intro segments — check BELLE-002 exception
      if (belle002Applies) {
        // BELLE-002 funnel exception applies — explicitly permitted, not a BELLE-001 violation.
        checks.push({
          rule: 'BELLE-001',
          passed: true,
          verdict: 'pass',
          details:
            `Intro has ${intro.length} BELLE B segments — BELLE-002 funnel exception applies ` +
            `(EP2 via funnel, is_funnel_entry=true). Multi-sentence personalized welcome is ` +
            `expected and permanently permitted. Not a BELLE-001 violation.`,
          evidence: introText.slice(0, 200),
        });
      } else if (belle002Inconclusive) {
        // EP2 but funnel status unknown — cannot confirm or rule out BELLE-002 exception.
        checks.push({
          rule: 'BELLE-001',
          passed: true, // inconclusive is not a hard fail
          verdict: 'inconclusive',
          details:
            `Intro has ${intro.length} BELLE B segments. EP2 detected but ` +
            `is_funnel_entry is null/absent — cannot confirm or rule out BELLE-002 funnel ` +
            `exception. Treating as INCONCLUSIVE rather than a BELLE-001 violation. ` +
            `If this episode IS a funnel entry, the multi-line intro is correct. ` +
            `If NOT, it should be reduced to one line.`,
          evidence: introText.slice(0, 200),
        });
      } else {
        // Multiple intro segments with no BELLE-002 exception — HARD FAIL.
        checks.push({
          rule: 'BELLE-001',
          passed: false,
          verdict: 'fail',
          details:
            `Intro has ${intro.length} BELLE B segments — expected exactly 1. ` +
            `Multi-line intro violates BELLE-001. Reduce to a single intro line.`,
          evidence: introText.slice(0, 200),
        });
      }
    }
  }

  // ── BELLE-002 ─────────────────────────────────────────────────────────────
  // First funnel episode (EP2 via signup funnel) — multi-sentence welcome expected.
  // This check records the rule's status for transparency; never blocks.
  {
    if (episodeNum === 2) {
      if (isFunnelEntry === null) {
        checks.push({
          rule: 'BELLE-002',
          passed: true, // inconclusive = not a hard fail
          verdict: 'inconclusive',
          details:
            'EP2 detected. Funnel status unknown — is_funnel_entry field absent or null. ' +
            'Cannot confirm BELLE-002 applicability. ' +
            'If this is a funnel entry, a multi-sentence intro is expected and correct. ' +
            'If not, standard BELLE-001 (one intro line) applies.',
        });
      } else if (isFunnelEntry === true) {
        checks.push({
          rule: 'BELLE-002',
          passed: true,
          verdict: 'pass',
          details:
            'EP2 via funnel (is_funnel_entry=true). Multi-sentence personalized welcome is ' +
            'expected as a permanent, deliberate exception to BELLE-001. BELLE-002 satisfied.',
          evidence: introText.slice(0, 200),
        });
      } else {
        // EP2 but not a funnel entry — BELLE-002 does not apply.
        checks.push({
          rule: 'BELLE-002',
          passed: true,
          verdict: 'skip',
          details:
            'EP2 but is_funnel_entry=false — not a funnel episode. ' +
            'BELLE-002 exception does not apply; standard BELLE-001 governs the intro.',
        });
      }
    } else {
      checks.push({
        rule: 'BELLE-002',
        passed: true,
        verdict: 'skip',
        details: `Not EP2 (series_episode_number=${episodeNum ?? 'null'}). BELLE-002 does not apply.`,
      });
    }
  }

  // ── BELLE-003 ─────────────────────────────────────────────────────────────
  // Listener's name NEVER appears in the outro — any episode type, no exceptions.
  {
    if (outro.length === 0) {
      checks.push({
        rule: 'BELLE-003',
        passed: true,
        verdict: 'pass',
        details: 'No BELLE B outro segment found — listener name absent from outro. BELLE-003 satisfied.',
      });
    } else if (containsListenerName(outroText)) {
      checks.push({
        rule: 'BELLE-003',
        passed: false,
        verdict: 'fail',
        details:
          'Outro contains a listener name placeholder ([LISTENER_NAME] or equivalent). ' +
          'The listener\'s name must NEVER appear in the outro under any circumstance, ' +
          'on any episode type. Remove the name marker from the outro.',
        evidence: outroText.slice(0, 300),
      });
    } else {
      checks.push({
        rule: 'BELLE-003',
        passed: true,
        verdict: 'pass',
        details: 'Outro contains no listener name placeholder. BELLE-003 satisfied.',
        evidence: outroText.slice(0, 200),
      });
    }
  }

  // ── BELLE-004 ─────────────────────────────────────────────────────────────
  // First episode of a series — intro must name the title and the author.
  {
    if (hasNullSeriesFields) {
      checks.push({
        rule: 'BELLE-004',
        passed: true,
        verdict: 'skip',
        details:
          'Series position fields null — BELLE-004 first-episode check skipped ' +
          '(warn-not-block for already-published stories; see warnings).',
      });
    } else if (isFirstEp) {
      const titleInIntro  = containsText(introText, title);
      const authorInIntro = containsText(introText, author);
      const passed = titleInIntro && authorInIntro;

      const missing: string[] = [];
      if (!titleInIntro)  missing.push(`title "${title}"`);
      if (!authorInIntro && author) missing.push(`author "${author}"`);
      if (!author) missing.push('author (stories.author is empty — cannot verify)');

      checks.push({
        rule: 'BELLE-004',
        passed,
        verdict: passed ? 'pass' : 'fail',
        details: passed
          ? `First episode intro names title ("${title}") and author ("${author}"). BELLE-004 satisfied.`
          : `First episode intro is missing: ${missing.join(', ')}. ` +
            `The first episode intro MUST name both the title and the author.`,
        evidence: introText.slice(0, 300),
      });
    } else {
      checks.push({
        rule: 'BELLE-004',
        passed: true,
        verdict: 'skip',
        details: `Not the first episode (series_episode_number=${episodeNum}). BELLE-004 does not apply.`,
      });
    }
  }

  // ── BELLE-005 ─────────────────────────────────────────────────────────────
  // Final episode — outro must recap the story to a satisfying close,
  // then restate the title and author.
  {
    if (hasNullSeriesFields) {
      checks.push({
        rule: 'BELLE-005',
        passed: true,
        verdict: 'skip',
        details:
          'Series position fields null — BELLE-005 finale check skipped ' +
          '(warn-not-block for already-published stories; see warnings).',
      });
    } else if (isFinale) {
      const titleInOutro  = containsText(outroText, title);
      const authorInOutro = containsText(outroText, author);
      const passed = titleInOutro && authorInOutro;

      const missing: string[] = [];
      if (!titleInOutro)  missing.push(`title "${title}"`);
      if (!authorInOutro && author) missing.push(`author "${author}"`);
      if (!author) missing.push('author (stories.author is empty — cannot verify)');

      checks.push({
        rule: 'BELLE-005',
        passed,
        verdict: passed ? 'pass' : 'fail',
        details: passed
          ? `Finale outro restates title ("${title}") and author ("${author}"). BELLE-005 satisfied.`
          : `Finale outro is missing: ${missing.join(', ')}. ` +
            `The finale outro MUST recap the story and restate both the title and the author.`,
        evidence: outroText.slice(0, 300),
      });
    } else {
      checks.push({
        rule: 'BELLE-005',
        passed: true,
        verdict: 'skip',
        details: `Not the final episode (series_is_finale=${isFinale}). BELLE-005 does not apply.`,
      });
    }
  }

  // ── BELLE-006 ─────────────────────────────────────────────────────────────
  // Interior (non-first, non-final) episodes — intro AND outro must NOT name
  // title or author. Exception: first episode of a new season (INCONCLUSIVE —
  // no season-break flag available to confirm the exception).
  {
    if (hasNullSeriesFields) {
      checks.push({
        rule: 'BELLE-006',
        passed: true,
        verdict: 'skip',
        details:
          'Series position fields null — BELLE-006 interior check skipped ' +
          '(warn-not-block for already-published stories; see warnings).',
      });
    } else if (isInterior) {
      const titleInIntro  = title  && containsText(introText, title);
      const authorInIntro = author && containsText(introText, author);
      const titleInOutro  = title  && containsText(outroText, title);
      const authorInOutro = author && containsText(outroText, author);

      const namesTitleOrAuthor = titleInIntro || authorInIntro || titleInOutro || authorInOutro;

      if (!namesTitleOrAuthor) {
        checks.push({
          rule: 'BELLE-006',
          passed: true,
          verdict: 'pass',
          details:
            `Interior episode (EP${episodeNum}) intro and outro do not name ` +
            `title or author. BELLE-006 satisfied.`,
        });
      } else {
        // Title or author found in interior episode intro/outro.
        // This violates BELLE-006 UNLESS this is a season-break opener.
        // No explicit season-break flag exists — mark INCONCLUSIVE, not a hard fail.
        const found: string[] = [];
        if (titleInIntro)  found.push('title in intro');
        if (authorInIntro) found.push('author in intro');
        if (titleInOutro)  found.push('title in outro');
        if (authorInOutro) found.push('author in outro');

        checks.push({
          rule: 'BELLE-006',
          passed: true, // INCONCLUSIVE is not a hard fail
          verdict: 'inconclusive',
          details:
            `Interior episode (EP${episodeNum}) names: ${found.join(', ')}. ` +
            `This violates BELLE-006 unless this episode is the first episode of a new season. ` +
            `No season-break metadata is available to confirm or deny the exception — ` +
            `flagged INCONCLUSIVE rather than hard-failing. ` +
            `Action required: verify whether EP${episodeNum} is a season opener. ` +
            `If yes, the naming is correct. If no, remove title/author from intro/outro.`,
          evidence: [
            (titleInIntro || authorInIntro) ? `Intro: ${introText.slice(0, 150)}` : '',
            (titleInOutro || authorInOutro) ? `Outro: ${outroText.slice(0, 150)}` : '',
          ].filter(Boolean).join(' | '),
        });
      }
    } else if (isFirstEp) {
      checks.push({
        rule: 'BELLE-006',
        passed: true,
        verdict: 'skip',
        details: 'First episode — BELLE-006 does not apply (BELLE-004 governs title/author in intro).',
      });
    } else if (isFinale) {
      checks.push({
        rule: 'BELLE-006',
        passed: true,
        verdict: 'skip',
        details: 'Final episode — BELLE-006 does not apply (BELLE-005 governs title/author in outro).',
      });
    } else {
      checks.push({
        rule: 'BELLE-006',
        passed: true,
        verdict: 'skip',
        details:
          `Episode position indeterminate ` +
          `(series_episode_number=${episodeNum}, series_is_finale=${isFinale}). ` +
          `BELLE-006 skipped.`,
      });
    }
  }

  // ── Summarise and return ──────────────────────────────────────────────────

  const hardFails      = checks.filter(c => c.verdict === 'fail');
  const inconclusives  = checks.filter(c => c.verdict === 'inconclusive');
  const passed = hardFails.length === 0;

  if (!passed) {
    console.error(
      `[belleStructureGate] ✗ BELLE gate FAILED — ${hardFails.length} rule(s) violated:\n` +
      hardFails.map(f => `  ${f.rule}: ${f.details}`).join('\n')
    );
  } else {
    console.log(
      `[belleStructureGate] ✓ BELLE gate passed` +
      (inconclusives.length > 0 ? ` (${inconclusives.length} inconclusive)` : '')
    );
  }

  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`[belleStructureGate] ⚠ ${w}`);
  }

  return { passed, checks, warnings };
}

// ── CommonJS shim ─────────────────────────────────────────────────────────────
// Allow: const { runBelleStructureGate } = require('./lib/belleStructureGate');
// Mirrors the pattern in lib/garbleGate.ts and lib/voiceMapGate.ts.
if (typeof module !== 'undefined') {
  // @ts-ignore
  module.exports = { runBelleStructureGate };
  // @ts-ignore
  module.exports.runBelleStructureGate = runBelleStructureGate;
}
