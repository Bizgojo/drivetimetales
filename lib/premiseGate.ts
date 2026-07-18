/**
 * PREMISE-UNIQUENESS-001 — Premise uniqueness gate (canon rule, Marc ruling 2026-07-18).
 *
 * CANON: No new brief proceeds to Stage 2 with a premise substantially similar
 * to any story that is published or sitting in ready_for_review, repair_queue,
 * or approved_ready. Cold storage is exempt — those premises are reusable.
 *
 * "Substantially similar" = same core hook + same central situation.
 * Shared genre/setting alone does NOT collide.
 *
 * Implementation is deterministic (token overlap), matching the house pattern
 * of pure, unit-testable gate logic (see lib/dispatchDedup.ts, lib/story-gates.ts).
 * No LLM calls — verdicts must be reproducible in tests and audits.
 *
 * CORE HOOK EXTRACTION RULE (documented for the backfill script too — the
 * plain-JS twin lives in scripts/backfill-premise-index.js and a jest parity
 * test keeps the two implementations in lockstep):
 *   1. Trim the premise and split into sentences on terminal punctuation.
 *   2. core_hook = the first sentence. If the first sentence carries fewer
 *      than 6 content tokens (after stopword removal + stemming) and a second
 *      sentence exists, append the second sentence.
 *   3. Cap at 300 characters.
 * Rationale: the house brief template (Bible/STORY_BRIEF_TEMPLATE) leads the
 * 2–5 sentence premise with the inciting situation — the hook.
 *
 * COLLISION MATH:
 *   - hookScore      = |Hc ∩ He| / min(|Hc|, |He|)   (containment of core-hook content tokens)
 *   - situationScore = |Pc ∩ Pe| / min(|Pc|, |Pe|)   (containment of full-premise content tokens)
 *   - COLLISION iff hookScore >= 0.6 AND situationScore >= 0.5.
 * Containment (not Jaccard) so a terse premise still collides with a wordier
 * restatement of the same story. Genre/setting-only overlap stays far below
 * both thresholds because setting nouns are a small fraction of content tokens.
 *
 * KNOWN-ADJACENT CLUSTERS (amendment, Marc ruling 2026-07-18 09:47 EDT):
 * The retroactive sweep found three MEDIUM published near-twin pairs. Marc
 * ruled no story action, but the pairs are recorded as known-adjacent
 * clusters (premise_adjacent_clusters + premise_index.adjacent_cluster tags)
 * so future briefs near those hooks are flagged EARLIER:
 *   - ADJACENT (warning) iff either trigger fires, at thresholds strictly
 *     below the COLLISION bar:
 *       A. cluster-hook trigger: the cluster's hook text holds one or more
 *          newline-separated VARIANTS (one abstract engine phrasing + one
 *          concrete phrasing per member pair — matchable surfaces, not
 *          display prose). Score = max over variants of the containment of
 *          the variant's content tokens vs the candidate premise tokens;
 *          ADJACENT at >= 0.5 (ADJACENT_CLUSTER_HOOK_THRESHOLD).
 *       B. member-proximity trigger: vs any cluster-tagged index entry,
 *          hookScore >= 0.4 AND situationScore >= 0.35
 *          (ADJACENT_MEMBER_HOOK_THRESHOLD / ADJACENT_MEMBER_SITUATION_THRESHOLD)
 *          — the “sub-collision band”: closer to one member than the pair are
 *          to each other, but below the 0.6/0.5 collision bar.
 *   - ADJACENT NEVER bounces the brief — the pairs are published precedent,
 *     not blockers. It surfaces a saturation warning (cluster label + member
 *     story citations) in gate output/logs so Orion/Marc see it early.
 *   - COLLISION still wins: anything at or above 0.6/0.5 vs a member entry
 *     collides exactly as before.
 *
 * OVERRIDE: only by Marc's explicit word. The override must be a recorded
 * object at brief_json.premise_gate_override with non-empty approved_by and
 * reason. There is no boolean shortcut and no silent path — an override
 * verdict always carries the collision citations it overrode.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Protected states ────────────────────────────────────────────────────────

export const PREMISE_PROTECTED_STATES = [
  'published',
  'ready_for_review',
  'repair_queue',
  'approved_ready',
] as const

export type PremiseProtectedState = (typeof PREMISE_PROTECTED_STATES)[number]

/** Does this workflow_state reserve the story's premise in premise_index? */
export function premiseIndexEligible(workflowState: string | null | undefined): boolean {
  return (PREMISE_PROTECTED_STATES as readonly string[]).includes(String(workflowState ?? '').trim())
}

// ── Tokenization ────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'without', 'about', 'into',
  'onto', 'upon', 'over', 'under', 'between', 'among', 'through', 'during', 'before',
  'after', 'above', 'below', 'off', 'out', 'up', 'down', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
  'not', 'no', 'never', 'ever', 'also', 'as', 'if', 'because', 'until', 'while', 'that',
  'this', 'these', 'those', 'it', 'its', 'he', 'him', 'his', 'she', 'her', 'hers', 'they',
  'them', 'their', 'theirs', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'i', 'me',
  'my', 'mine', 'who', 'whom', 'whose', 'which', 'what', 'is', 'am', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'gets',
  'get', 'got', 'one', 'two', 'new', 'old', 'own',
  // Story-generic words that appear in nearly every brief and carry no
  // premise-distinguishing signal.
  'story', 'tale', 'episode', 'series', 'protagonist', 'character', 'listener',
])

/** Crude deterministic stemmer: plural/participle suffix trim. */
export function stemToken(token: string): string {
  let t = token
  if (t.length >= 6 && t.endsWith('ing')) t = t.slice(0, -3)
  else if (t.length >= 5 && t.endsWith('ed')) t = t.slice(0, -2)
  if (t.length >= 4 && t.endsWith('es')) t = t.slice(0, -2)
  else if (t.length >= 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
  return t
}

/** Lowercase, strip punctuation, drop stopwords/short tokens, stem. */
export function contentTokens(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const words = String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
  for (const word of words) {
    if (word.length < 3) continue
    if (STOPWORDS.has(word)) continue
    const stem = stemToken(word)
    if (stem.length < 3 || STOPWORDS.has(stem)) continue
    if (seen.has(stem)) continue
    seen.add(stem)
    out.push(stem)
  }
  return out
}

// ── Core hook extraction ────────────────────────────────────────────────────

const MIN_HOOK_CONTENT_TOKENS = 6
const MAX_CORE_HOOK_CHARS = 300

export function splitSentences(text: string): string[] {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** See CORE HOOK EXTRACTION RULE in the file header. */
export function extractCoreHook(premise: string): string {
  const sentences = splitSentences(premise)
  if (sentences.length === 0) return ''
  let hook = sentences[0]
  if (contentTokens(hook).length < MIN_HOOK_CONTENT_TOKENS && sentences.length > 1) {
    hook = `${hook} ${sentences[1]}`
  }
  return hook.slice(0, MAX_CORE_HOOK_CHARS)
}

// ── Similarity ──────────────────────────────────────────────────────────────

export const HOOK_COLLISION_THRESHOLD = 0.6
export const SITUATION_COLLISION_THRESHOLD = 0.5

// Known-adjacent cluster (saturation warning) thresholds — strictly below
// the COLLISION bar. Marc ruling 2026-07-18 09:47 EDT.
export const ADJACENT_CLUSTER_HOOK_THRESHOLD = 0.5
export const ADJACENT_MEMBER_HOOK_THRESHOLD = 0.4
export const ADJACENT_MEMBER_SITUATION_THRESHOLD = 0.35

export function containmentScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  let overlap = 0
  for (const token of a) if (setB.has(token)) overlap += 1
  return overlap / Math.min(a.length, b.length)
}

/** Newline-separated matchable variants of a known-adjacent cluster hook. */
export function clusterHookVariants(hook: string): string[] {
  return String(hook || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Max containment of any hook variant's tokens vs the candidate premise tokens. */
export function clusterHookScore(hook: string, premiseTokens: string[]): number {
  let best = 0
  for (const variant of clusterHookVariants(hook)) {
    const score = containmentScore(contentTokens(variant), premiseTokens)
    if (score > best) best = score
  }
  return best
}

export type PremiseIndexEntry = {
  story_id: string
  series_id?: string | null
  title: string | null
  status?: string | null
  genre?: string | null
  logline?: string | null
  core_hook: string | null
  premise: string | null
  /** Known-adjacent cluster slug when this row is a member of one (amendment 09:47). */
  adjacent_cluster?: string | null
}

/** A known-adjacent cluster row (premise_adjacent_clusters). */
export type AdjacentCluster = {
  slug: string
  label: string
  /** Matchable hook text — the shared premise engine in concrete vocabulary. */
  hook: string
  ruling?: string | null
}

export type PremiseAdjacency = {
  cluster_slug: string
  cluster_label: string
  /** Which trigger fired (highest-scoring one is reported). */
  trigger: 'cluster_hook' | 'member_proximity'
  score: number
  /** Cluster member stories (deduped by series) for the citation. */
  members: Array<{ story_id: string; title: string; status: string | null }>
  /** Human-readable citation of what matched. */
  matched: string
}

export type PremiseCollision = {
  story_id: string
  title: string
  status: string | null
  hookScore: number
  situationScore: number
  /** Human-readable citation of what matched. */
  matched: string
}

export type PremiseOverrideRecord = {
  approved_by: string
  reason: string
  approved_at?: string | null
}

export type PremiseGateVerdict = 'CLEAR' | 'ADJACENT' | 'COLLISION'

export type PremiseGateResult = {
  verdict: PremiseGateVerdict
  /** Core hook extracted from the candidate premise (for logging + index). */
  coreHook: string
  collisions: PremiseCollision[]
  /**
   * Known-adjacent cluster warnings (amendment 09:47) — informational, never
   * a bounce. Populated regardless of verdict; verdict is ADJACENT only when
   * there is no standing COLLISION.
   */
  adjacencies: PremiseAdjacency[]
  /** Set when a COLLISION was overridden by Marc's recorded word. Never silent. */
  overrideApplied: PremiseOverrideRecord | null
  checkedCount: number
}

export function comparePremiseToEntry(
  candidate: { coreHook: string; premise: string },
  entry: PremiseIndexEntry,
): { hookScore: number; situationScore: number; collides: boolean } {
  const entryPremise = String(entry.premise || entry.logline || '')
  const entryHook = String(entry.core_hook || '') || extractCoreHook(entryPremise)
  const hookScore = containmentScore(contentTokens(candidate.coreHook), contentTokens(entryHook))
  const situationScore = containmentScore(contentTokens(candidate.premise), contentTokens(entryPremise))
  return {
    hookScore,
    situationScore,
    collides: hookScore >= HOOK_COLLISION_THRESHOLD && situationScore >= SITUATION_COLLISION_THRESHOLD,
  }
}

/**
 * Parse a brief_json override record. Returns null unless BOTH approved_by
 * and reason are non-empty strings — a bare boolean or empty record is not an
 * override. Only Marc's explicit word authorizes creating this record.
 */
export function parsePremiseOverride(briefJson: unknown): PremiseOverrideRecord | null {
  if (!briefJson || typeof briefJson !== 'object') return null
  const raw = (briefJson as Record<string, unknown>).premise_gate_override
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const approvedBy = String(record.approved_by ?? '').trim()
  const reason = String(record.reason ?? '').trim()
  if (!approvedBy || !reason) return null
  return {
    approved_by: approvedBy,
    reason,
    approved_at: typeof record.approved_at === 'string' ? record.approved_at : null,
  }
}

export type PremiseGateCandidate = {
  /** Story row id of the brief being gated — excluded from comparison. */
  storyId?: string | null
  /** Series id of the brief — sibling episodes are excluded from comparison. */
  seriesId?: string | null
  premise: string
  /** brief_json (or equivalent) — read for premise_gate_override. */
  briefJson?: unknown
}

/**
 * Pure gate evaluation against a set of premise_index entries plus the
 * known-adjacent clusters (amendment 09:47). Entries for the candidate's own
 * story/series are skipped (a series must not collide with its own sibling
 * episodes).
 *
 * Verdict precedence: COLLISION (bounce) > ADJACENT (warning, proceeds) >
 * CLEAR. An override clears a COLLISION but never suppresses an ADJACENT
 * warning — saturation stays visible.
 */
export function evaluatePremiseGate(
  candidate: PremiseGateCandidate,
  entries: PremiseIndexEntry[],
  clusters: AdjacentCluster[] = [],
): PremiseGateResult {
  const premise = String(candidate.premise || '').trim()
  const coreHook = extractCoreHook(premise)
  const premiseTokens = contentTokens(premise)
  const collisions: PremiseCollision[] = []
  // slug → best adjacency evidence seen so far
  const adjacencyBySlug = new Map<string, { trigger: PremiseAdjacency['trigger']; score: number }>()
  let checkedCount = 0

  for (const entry of entries) {
    if (!entry || !entry.story_id) continue
    if (candidate.storyId && String(entry.story_id) === String(candidate.storyId)) continue
    if (candidate.seriesId && entry.series_id && String(entry.series_id) === String(candidate.seriesId)) continue
    checkedCount += 1
    const score = comparePremiseToEntry({ coreHook, premise }, entry)
    if (score.collides) {
      collisions.push({
        story_id: entry.story_id,
        title: entry.title || '(untitled)',
        status: entry.status ?? null,
        hookScore: Number(score.hookScore.toFixed(3)),
        situationScore: Number(score.situationScore.toFixed(3)),
        matched: `core hook ${(score.hookScore * 100).toFixed(0)}% + central situation ${(score.situationScore * 100).toFixed(0)}% overlap with "${entry.title || entry.story_id}" (${entry.status || 'unknown state'})`,
      })
    }
    // Member-proximity adjacency trigger (below the collision bar).
    const slug = String(entry.adjacent_cluster || '').trim()
    if (
      slug &&
      score.hookScore >= ADJACENT_MEMBER_HOOK_THRESHOLD &&
      score.situationScore >= ADJACENT_MEMBER_SITUATION_THRESHOLD
    ) {
      const memberScore = Number(Math.min(score.hookScore, 1).toFixed(3))
      const prev = adjacencyBySlug.get(slug)
      if (!prev || memberScore > prev.score) {
        adjacencyBySlug.set(slug, { trigger: 'member_proximity', score: memberScore })
      }
    }
  }

  // Cluster-hook adjacency trigger: does the candidate premise contain the
  // cluster's engine vocabulary? Hook text holds newline-separated variants;
  // the best-matching variant decides.
  for (const cluster of clusters) {
    if (!cluster || !cluster.slug || !cluster.hook) continue
    const clusterScore = clusterHookScore(cluster.hook, premiseTokens)
    if (clusterScore >= ADJACENT_CLUSTER_HOOK_THRESHOLD) {
      const rounded = Number(clusterScore.toFixed(3))
      const prev = adjacencyBySlug.get(cluster.slug)
      if (!prev || rounded > prev.score) {
        adjacencyBySlug.set(cluster.slug, { trigger: 'cluster_hook', score: rounded })
      }
    }
  }

  // Build adjacency citations (cluster label + member stories, deduped by series).
  const adjacencies: PremiseAdjacency[] = []
  for (const [slug, hit] of Array.from(adjacencyBySlug.entries())) {
    const cluster = clusters.find((c) => c && c.slug === slug)
    const members: PremiseAdjacency['members'] = []
    const seenSeries = new Set<string>()
    for (const entry of entries) {
      if (!entry || String(entry.adjacent_cluster || '').trim() !== slug) continue
      const seriesKey = String(entry.series_id || entry.story_id)
      if (seenSeries.has(seriesKey)) continue
      seenSeries.add(seriesKey)
      members.push({ story_id: entry.story_id, title: entry.title || '(untitled)', status: entry.status ?? null })
    }
    const label = cluster?.label || slug
    const memberCite = members.map((m) => `"${m.title}" (${m.story_id}, ${m.status || 'unknown state'})`).join(', ')
    adjacencies.push({
      cluster_slug: slug,
      cluster_label: label,
      trigger: hit.trigger,
      score: hit.score,
      members,
      matched: `known-adjacent cluster "${label}" [${slug}] via ${hit.trigger === 'cluster_hook' ? `cluster-hook overlap ${(hit.score * 100).toFixed(0)}%` : `member proximity ${(hit.score * 100).toFixed(0)}% hook overlap`}${memberCite ? `; members: ${memberCite}` : ''}`,
    })
  }
  adjacencies.sort((a, b) => b.score - a.score)

  collisions.sort((a, b) => (b.hookScore + b.situationScore) - (a.hookScore + a.situationScore))

  if (collisions.length === 0) {
    return {
      verdict: adjacencies.length > 0 ? 'ADJACENT' : 'CLEAR',
      coreHook,
      collisions,
      adjacencies,
      overrideApplied: null,
      checkedCount,
    }
  }

  const override = parsePremiseOverride(candidate.briefJson)
  if (override) {
    // Marc's recorded word — proceed, but the result still carries the
    // collision citations so every caller logs what was overridden. An
    // adjacency warning (if any) stays visible.
    return {
      verdict: adjacencies.length > 0 ? 'ADJACENT' : 'CLEAR',
      coreHook,
      collisions,
      adjacencies,
      overrideApplied: override,
      checkedCount,
    }
  }

  return { verdict: 'COLLISION', coreHook, collisions, adjacencies, overrideApplied: null, checkedCount }
}

/**
 * Format the ADJACENT warning (never a bounce — published precedent, not a
 * blocker). Cited so Orion/Marc see hook saturation early.
 */
export function formatPremiseAdjacentWarning(result: PremiseGateResult): string {
  const top = result.adjacencies[0]
  const cite = top ? top.matched : 'unknown adjacency'
  return `PREMISE ADJACENT (PREMISE-UNIQUENESS-001, known-adjacent clusters — Marc ruling 2026-07-18 09:47 EDT): brief premise is near a saturated published hook — ${cite}. Not a bounce; brief proceeds. Consider a materially different hook before adding more stories to this cluster.`
}

/** Format the bounce message with citation (colliding story_id + title + match). */
export function formatPremiseCollisionMessage(result: PremiseGateResult): string {
  const top = result.collisions[0]
  const cite = top
    ? `${top.title} (${top.story_id}): ${top.matched}`
    : 'unknown collision'
  return `PREMISE COLLISION (PREMISE-UNIQUENESS-001): brief premise is substantially similar to ${cite}. Brief bounced for rework. Override requires Marc's explicit word recorded at brief_json.premise_gate_override { approved_by, reason } — never silent.`
}

// ── Async gate runner (fetches premise_index) ───────────────────────────────

export class PremiseGateUnavailableError extends Error {
  constructor(detail: string) {
    super(`PREMISE-UNIQUENESS-001 gate cannot run: premise_index unavailable (${detail}). The premise check is mandatory before Stage 2 — apply the premise_index migration and backfill, then retry.`)
    this.name = 'PremiseGateUnavailableError'
  }
}

/**
 * Mandatory premise check at the brief gate before Stage 2.
 * Fails CLOSED: if premise_index cannot be read, this throws rather than
 * silently letting the brief through.
 */
export async function runPremiseGate(
  supabase: SupabaseClient,
  candidate: PremiseGateCandidate,
): Promise<PremiseGateResult> {
  const { data, error } = await supabase
    .from('premise_index')
    .select('story_id,series_id,title,status,genre,logline,core_hook,premise,adjacent_cluster')

  if (error) throw new PremiseGateUnavailableError(error.message)

  // Known-adjacent clusters (amendment 09:47) — same migration file creates
  // both tables, so this read fails closed alongside premise_index.
  const { data: clusters, error: clustersError } = await supabase
    .from('premise_adjacent_clusters')
    .select('slug,label,hook,ruling')

  if (clustersError) throw new PremiseGateUnavailableError(clustersError.message)

  return evaluatePremiseGate(
    candidate,
    (data || []) as PremiseIndexEntry[],
    (clusters || []) as AdjacentCluster[],
  )
}
