/**
 * ATLAS PUBLISH-MODE SWITCH — direct-mode auto-promotion (Canon Rule 4).
 *
 * Reuses the SAME promotion logic the manual path performs; nothing here is
 * a divergent copy:
 *   - Guards: lib/personalization/publishGuard.ts (personalizationPublishBlockers)
 *     and lib/story-gates.ts (evaluateSeriesPublishOrder / isEpisodePublishable /
 *     sortEpisodesForPublish / assertSeriesContiguity) — imported, not copied.
 *   - Terminal payload: buildDirectPublishUpdate() produces the exact column
 *     set app/api/admin/publish-story/route.ts writes for both the single and
 *     series paths (status/workflow_state/is_hidden/published_on + ORION-GOV-006
 *     audit fields). Payload parity is asserted by
 *     __tests__/atlas-publish-mode-oct11.test.ts. The one deliberate difference:
 *     the manual route accepts operator-supplied field overrides
 *     (title/author/audio/...); the autonomous path has no operator, so it
 *     publishes DB values as-is after the guards pass.
 *   - Transition legality: every state move is validated with
 *     transitionAllowed() from lib/workflowTransitions.ts. The canonical
 *     matrix has NO ready_for_review → published edge — the manual flow goes
 *     ready_for_review → approved_ready (Marc's approval click) →
 *     published (publish-story). Direct mode performs those same two steps
 *     back-to-back (changed_by 'autonomous-runner'), writing one audit row
 *     per step. If either edge is ever removed from the matrix the auto path
 *     aborts and holds at RFR instead of inventing a transition.
 *   - Side effects: syncPremiseIndexForTransition(..., 'published') exactly
 *     as the manual writers do; one story_workflow_audit row per transition
 *     (ORION-GOV-006).
 *
 * The manual admin paths (content-approval set_workflow_state, publish-story
 * POST) are NOT modified by this file.
 */

import { personalizationPublishBlockers } from '@/lib/personalization/publishGuard'
import {
  evaluateSeriesPublishOrder,
  isEpisodePublishable,
  sortEpisodesForPublish,
  assertSeriesContiguity,
} from '@/lib/story-gates'
import { transitionAllowed } from '@/lib/workflowTransitions'
import { syncPremiseIndexForTransition } from '@/lib/premiseIndex'
import {
  PUBLISH_MODE_KEY,
  DIRECT_PUBLISH_REASON_PREFIX,
  FIRST_PUBLISH_MARKER,
  getPublishMode,
  type PublishMode,
} from '@/lib/publishMode'
import { assertPublishAllowed, isPublicationHeld } from '@/lib/publicationHold'
import { evaluateBelleUnitForPublish } from '@/lib/publicationBelleGate'
import { evaluateBelleFreshnessForPublish } from '@/lib/belleFreshness'

export const DIRECT_PUBLISH_CHANGED_BY = 'autonomous-runner'

/** Columns the manual publish-story route selects to run its guards. */
export const DIRECT_PUBLISH_GUARD_COLUMNS =
  'id,title,author,genre,audio_url,cover_url,description,duration_mins,' +
  'status,is_hidden,review_status,workflow_state,published_on,' +
  'series_id,series_name,episode_number,series_number,series_is_finale,announcement_url,announcement_text,script,script_json'

export type DirectPublishUpdate = {
  status: 'published'
  workflow_state: 'published'
  is_hidden: false
  published_on: string
  workflow_state_changed_by: string
  workflow_state_changed_at: string
  workflow_state_change_reason: string
}

/**
 * Terminal publish payload — identical column set to the manual
 * publish-story route (single + series paths). Any future column added to
 * the manual writer must be added here too (parity test enforces the set).
 */
export function buildDirectPublishUpdate(args: {
  changedBy?: string
  reason: string
  publishedOn?: string
}): DirectPublishUpdate {
  const at = args.publishedOn ?? new Date().toISOString()
  return {
    status: 'published',
    workflow_state: 'published',
    is_hidden: false,
    published_on: at,
    workflow_state_changed_by: args.changedBy ?? DIRECT_PUBLISH_CHANGED_BY,
    workflow_state_changed_at: at,
    workflow_state_change_reason: args.reason,
  }
}

/** Payload keys must match the manual publish-story writer — see parity test. */
export const DIRECT_PUBLISH_UPDATE_KEYS = [
  'status',
  'workflow_state',
  'is_hidden',
  'published_on',
  'workflow_state_changed_by',
  'workflow_state_changed_at',
  'workflow_state_change_reason',
] as const

export type DirectReadiness = { ok: true } | { ok: false; blockers: string[] }

function requiredFieldBlockers(story: Record<string, unknown>): string[] {
  const missing: string[] = []
  const clean = (v: unknown) => String(v ?? '').trim()
  if (!clean(story.title)) missing.push('title')
  if (!clean(story.author)) missing.push('author')
  if (!clean(story.genre)) missing.push('genre')
  if (!clean(story.audio_url)) missing.push('audio_url')
  if (!clean(story.cover_url)) missing.push('cover_url')
  if (!clean(story.description)) missing.push('description')
  if (!(Number(story.duration_mins) > 0)) missing.push('duration_mins')
  return missing.map((f) => `missing required publish field: ${f}`)
}

/**
 * The autonomous move grants approval itself (step 1 of the two-step
 * promotion mirrors Marc's approval click with zero human judgment
 * involved), so publishability is evaluated AS-IF approved: the shared
 * predicates' workflow_state expectation is satisfied by the merged view,
 * and every OTHER check (fields, personalization, ordering, contiguity)
 * runs for real against DB values. Anything those flag still holds at RFR.
 */
function asApproved(story: Record<string, unknown>): Record<string, unknown> {
  return { ...story, workflow_state: 'approved_ready', review_status: 'approved' }
}

/**
 * Single-story readiness: required fields + personalization guard +
 * (for series members) the same in-order/contiguity predicate the manual
 * single-story path evaluates against siblings.
 */
export function evaluateSingleDirectReadiness(
  story: Record<string, unknown>,
  siblings: Array<Record<string, unknown>> = []
): DirectReadiness {
  const blockers: string[] = [
    ...requiredFieldBlockers(story),
    ...personalizationPublishBlockers(story as never),
  ]
  // PUBLICATION-HOLD-001: Belle copy gate — no waiver path.
  const belleVerdict = evaluateBelleUnitForPublish([story])
  if (!belleVerdict.ok) blockers.push(...(belleVerdict as { blockers: string[] }).blockers)
  // BELLE-FRESHNESS-001: render-freshness gate — no waiver path.
  // A stale mix holds at ready_for_review with zero writes.
  const freshnessVerdict = evaluateBelleFreshnessForPublish([story as Record<string, unknown>])
  if (!freshnessVerdict.ok) blockers.push(...(freshnessVerdict as { blockers: string[] }).blockers)
  if (String((story as { series_id?: unknown }).series_id ?? '').trim()) {
    const family = (siblings.length ? siblings : [story]).map((row) =>
      asApproved(row.id === story.id ? story : row)
    )
    const ordered = sortEpisodesForPublish(family as never[])
    const contiguity = assertSeriesContiguity(ordered)
    if (!contiguity.ok) {
      blockers.push(`series_episode_number_gap: ${contiguity.error ?? 'episode number gap'}`)
    } else {
      const rank = ordered.findIndex((e) => (e as { id?: unknown }).id === story.id)
      if (rank >= 0) {
        const res = isEpisodePublishable(
          ordered[rank] as never,
          ordered.slice(0, rank) as never[]
        )
        if (!res.publishable) blockers.push(...res.reasons)
      }
    }
  }
  return blockers.length ? { ok: false, blockers } : { ok: true }
}

/** Series-unit readiness: the manual series path's orderEval gate, shared. */
export function evaluateSeriesDirectReadiness(
  episodes: Array<Record<string, unknown>>
): DirectReadiness {
  const evalResult = evaluateSeriesPublishOrder(episodes.map(asApproved) as never[])
  if (evalResult.code === 'ok') {
    // PUBLICATION-HOLD-001: Belle copy gate on every episode — no waiver.
    const belleVerdict = evaluateBelleUnitForPublish(episodes)
    if (!belleVerdict.ok) return { ok: false, blockers: (belleVerdict as { blockers: string[] }).blockers }
    // BELLE-FRESHNESS-001: render-freshness gate on every episode —
    // no waiver. A stale mix holds the whole series at ready_for_review.
    const freshnessVerdict = evaluateBelleFreshnessForPublish(episodes)
    if (!freshnessVerdict.ok) return { ok: false, blockers: (freshnessVerdict as { blockers: string[] }).blockers }
    return { ok: true }
  }
  const reasons = (evalResult.blocked ?? []).flatMap((b) =>
    (b.reasons ?? []).map((r: string) => `${b.title || b.storyId}: ${r}`)
  )
  return {
    ok: false,
    blockers: reasons.length ? reasons : [`series not publishable: ${evalResult.code}`],
  }
}

/** Pure decision: what happens after a successful RFR promotion. */
export function decidePostRfrAction(
  mode: PublishMode,
  readiness: DirectReadiness
): 'hold' | 'publish' {
  if (mode !== 'direct') return 'hold'
  return readiness.ok ? 'publish' : 'hold'
}

export type DirectAutoPublishReport = {
  mode: PublishMode
  action: 'held' | 'published' | 'held_blocked'
  storyId?: string
  seriesId?: string
  publishedOn?: string | null
  firstAutoPublish?: boolean
  blockers?: string[]
  transitions?: string[]
  error?: string
}

// Supabase-js surface used by the executors (subset; keeps tests mockable).
type DbClient = {
  from: (table: string) => any
}

async function hasPriorDirectPublish(db: DbClient): Promise<boolean> {
  try {
    const { data, error } = await db
      .from('story_workflow_audit')
      .select('id')
      .like('reason', `${DIRECT_PUBLISH_REASON_PREFIX}%`)
      .limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

async function insertAuditRow(
  db: DbClient,
  row: Record<string, unknown>
): Promise<void> {
  try {
    const res = await db.from('story_workflow_audit').insert(row)
    const err = res && typeof res.then === 'function' ? (await res)?.error : res?.error
    if (err) console.warn(`[direct-publish] audit row insert failed (non-fatal): ${err.message}`)
  } catch (e) {
    console.warn('[direct-publish] audit row insert threw (non-fatal):', e instanceof Error ? e.message : String(e))
  }
}

async function syncPremiseBestEffort(db: DbClient, storyIds: string[]): Promise<void> {
  try {
    await syncPremiseIndexForTransition(db as never, { storyIds, toState: 'published' })
  } catch (e) {
    console.warn('[direct-publish] premise sync failed (non-fatal):', e instanceof Error ? e.message : String(e))
  }
}

function emitFirstPublishMarker(args: { storyId?: string; seriesId?: string; jobId: string; publishedOn: string }): void {
  const label = args.seriesId ? `series ${args.seriesId}` : `story ${args.storyId}`
  // Unmissable by design: console.error surfaces in every log aggregator and
  // will page/flag where console.log would be filtered. This fires ONCE —
  // only for the first auto-publish under the direct path.
  console.error(
    `[${FIRST_PUBLISH_MARKER}] DIRECT-MODE AUTO-PUBLISH — ${label} went LIVE with zero human check ` +
      `(job ${args.jobId}, published_on ${args.publishedOn}). Marc: verify end-to-end before trusting further direct publishes. ` +
      `Instant rollback: update atlas_settings set value='rfr' where key='${PUBLISH_MODE_KEY}'.`
  )
}

/**
 * Promote one story ready_for_review → approved_ready → published, each edge
 * validated against the canonical matrix. Aborts (holding at RFR) if either
 * edge is illegal at call time.
 */
async function promoteStoryToPublished(
  db: DbClient,
  storyId: string,
  opts: { reason: string; firstAutoPublish: boolean; sessionContext: string }
): Promise<{ publishedOn: string; transitions: string[] }> {
  const at = new Date().toISOString()
  const edges: Array<[string, string]> = [
    ['ready_for_review', 'approved_ready'],
    ['approved_ready', 'published'],
  ]
  // PUBLICATION-HOLD-001: per-episode entry check (the series hook calls
  // this per episode, so a mid-series hold blocks every remaining episode
  // before its first write; the terminal re-read below is the final guard).
  try {
    await assertPublishAllowed(db)
  } catch (e) {
    throw new Error(`global publication hold is ACTIVE; refusing promotion for story ${storyId} (${e instanceof Error ? e.message : String(e)})`)
  }
  for (const [from, to] of edges) {
    if (!transitionAllowed(from, to)) {
      throw new Error(`transition ${from} → ${to} not allowed; holding at ready_for_review`)
    }
  }
  const transitions: string[] = []
  // Step 1: mirror Marc's approval click (autonomous).
  {
    const { error } = await db
      .from('stories')
      .update({
        workflow_state: 'approved_ready',
        review_status: 'approved',
        review_notes: `${DIRECT_PUBLISH_REASON_PREFIX}: autonomous approval under direct mode`,
        workflow_state_changed_by: DIRECT_PUBLISH_CHANGED_BY,
        workflow_state_changed_at: at,
        workflow_state_change_reason: opts.reason,
      })
      .eq('id', storyId)
    if (error) throw new Error(`ready_for_review → approved_ready failed: ${error.message}`)
    transitions.push('ready_for_review→approved_ready')
    await insertAuditRow(db, {
      story_id: storyId,
      from_state: 'ready_for_review',
      to_state: 'approved_ready',
      changed_by: DIRECT_PUBLISH_CHANGED_BY,
      changed_at: at,
      reason: opts.reason,
      session_context: opts.sessionContext,
    })
  }
  // Step 2: terminal publish — same columns the manual writer sets.
  // PUBLICATION-HOLD-001: hold RE-READ immediately before the terminal
  // update — the atomicity point. A hold set after hook entry (or after
  // step 1 above) blocks going LIVE here with no published row.
  try {
    await assertPublishAllowed(db)
  } catch (e) {
    throw new Error(`global publication hold is ACTIVE; refusing terminal publish for story ${storyId} (${e instanceof Error ? e.message : String(e)})`)
  }
  {
    const payload = buildDirectPublishUpdate({
      reason: opts.firstAutoPublish
        ? `${FIRST_PUBLISH_MARKER}: ${opts.reason}`
        : opts.reason,
      publishedOn: at,
    })
    const { error } = await db.from('stories').update(payload).eq('id', storyId)
    if (error) throw new Error(`approved_ready → published failed: ${error.message}`)
    transitions.push('approved_ready→published')
    await insertAuditRow(db, {
      story_id: storyId,
      from_state: 'approved_ready',
      to_state: 'published',
      changed_by: DIRECT_PUBLISH_CHANGED_BY,
      changed_at: at,
      reason: opts.firstAutoPublish
        ? `${FIRST_PUBLISH_MARKER}: ${opts.reason}`
        : opts.reason,
      session_context: opts.sessionContext,
    })
  }
  await syncPremiseBestEffort(db, [storyId])
  return { publishedOn: at, transitions }
}

async function fetchStory(db: DbClient, storyId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db
    .from('stories')
    .select(DIRECT_PUBLISH_GUARD_COLUMNS)
    .eq('id', storyId)
    .maybeSingle()
  if (error) throw new Error(`story fetch failed: ${error.message}`)
  return (data as Record<string, unknown> | null) ?? null
}

async function fetchSiblings(db: DbClient, seriesId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await db
    .from('stories')
    .select(DIRECT_PUBLISH_GUARD_COLUMNS)
    .eq('series_id', seriesId)
  if (error) throw new Error(`sibling fetch failed: ${error.message}`)
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({ ...r }))
}

/**
 * Standalone RFR hook: call AFTER the RFR promotion succeeded. In rfr mode
 * (or when guards fail) the story holds exactly as today — zero writes.
 */
export async function maybeDirectPublishStandalone(
  db: DbClient,
  args: { storyId: string; jobId: string }
): Promise<DirectAutoPublishReport> {
  const mode = await getPublishMode(db as never, (m) => console.log(m))
  if (mode !== 'direct') {
    return { mode, action: 'held', storyId: args.storyId }
  }
  // PUBLICATION-HOLD-001: durable global hold — checked here (before any
  // read/gate work that could lead to a write) and re-read inside
  // promoteStoryToPublished immediately before the terminal publish.
  if (await isPublicationHeld(db)) {
    return { mode, action: 'held_blocked', storyId: args.storyId, blockers: ['global publication hold is ACTIVE — holding at ready_for_review with zero writes'] }
  }
  let story: Record<string, unknown> | null
  try {
    story = await fetchStory(db, args.storyId)
  } catch (e) {
    return { mode, action: 'held_blocked', storyId: args.storyId, blockers: [e instanceof Error ? e.message : String(e)] }
  }
  if (!story) {
    return { mode, action: 'held_blocked', storyId: args.storyId, blockers: ['story row not found after RFR promotion'] }
  }
  // 3-fix N3 (defense-in-depth): the standalone hook must never publish a
  // series member, even if upstream routing misdispatches one here. Series
  // episodes publish only as a unit via maybeDirectPublishSeries. Refuse and
  // hold at RFR — do not rely solely on the caller's routing.
  const standaloneSeriesId = String((story.series_id as string | null) ?? '').trim()
  if (standaloneSeriesId) {
    const blocker = `series member (series_id ${standaloneSeriesId}) routed to standalone hook; holding at ready_for_review — series episodes publish only as a unit via the series hook`
    console.warn(`[direct-publish] story ${args.storyId} ${blocker}`)
    return { mode, action: 'held_blocked', storyId: args.storyId, seriesId: standaloneSeriesId, blockers: [blocker] }
  }
  let siblings: Array<Record<string, unknown>> = []
  const seriesId = String((story.series_id as string | null) ?? '').trim()
  if (seriesId) {
    try {
      siblings = await fetchSiblings(db, seriesId)
    } catch (e) {
      return { mode, action: 'held_blocked', storyId: args.storyId, seriesId, blockers: [e instanceof Error ? e.message : String(e)] }
    }
  }
  const readiness = evaluateSingleDirectReadiness(story, siblings)
  if (decidePostRfrAction(mode, readiness) !== 'publish') {
    console.warn(
      `[direct-publish] story ${args.storyId} passed all gates but direct-publish guards failed — holding at ready_for_review: ${(readiness as { blockers: string[] }).blockers.join('; ')}`
    )
    return { mode, action: 'held_blocked', storyId: args.storyId, seriesId: seriesId || undefined, blockers: (readiness as { blockers: string[] }).blockers }
  }
  const firstAutoPublish = !(await hasPriorDirectPublish(db))
  const reason =
    `${DIRECT_PUBLISH_REASON_PREFIX}: story auto-published under direct mode after passing all gates (job ${args.jobId}).`
  try {
    const { publishedOn, transitions } = await promoteStoryToPublished(db, args.storyId, {
      reason,
      firstAutoPublish,
      sessionContext: args.jobId,
    })
    if (firstAutoPublish) {
      emitFirstPublishMarker({ storyId: args.storyId, jobId: args.jobId, publishedOn })
    } else {
      console.log(`[${DIRECT_PUBLISH_REASON_PREFIX}] story ${args.storyId} auto-published (job ${args.jobId}, ${publishedOn})`)
    }
    return { mode, action: 'published', storyId: args.storyId, seriesId: seriesId || undefined, publishedOn, firstAutoPublish, transitions }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[direct-publish] auto-publish failed for story ${args.storyId} (holding at RFR): ${msg}`)
    return { mode, action: 'held_blocked', storyId: args.storyId, seriesId: seriesId || undefined, blockers: [msg] }
  }
}

/**
 * Series RFR hook: call AFTER all episodes were promoted to ready_for_review.
 * Per canon Rule 3 + Rule 4 the series flips as ONE unit, never split across
 * modes: every episode must be direct-publish-ready or the whole series holds.
 */
export async function maybeDirectPublishSeries(
  db: DbClient,
  args: { seriesId: string; episodeIds: string[]; jobId: string }
): Promise<DirectAutoPublishReport> {
  const mode = await getPublishMode(db as never, (m) => console.log(m))
  if (mode !== 'direct') {
    return { mode, action: 'held', seriesId: args.seriesId }
  }
  // PUBLICATION-HOLD-001: durable global hold — checked here and re-read
  // per episode inside promoteStoryToPublished before the terminal publish.
  if (await isPublicationHeld(db)) {
    return { mode, action: 'held_blocked', seriesId: args.seriesId, blockers: ['global publication hold is ACTIVE — holding series at ready_for_review with zero writes'] }
  }
  let episodes: Array<Record<string, unknown>>
  try {
    episodes = await fetchSiblings(db, args.seriesId)
  } catch (e) {
    return { mode, action: 'held_blocked', seriesId: args.seriesId, blockers: [e instanceof Error ? e.message : String(e)] }
  }
  // Only consider episodes the RFR step just promoted (plus any already
  // published — a re-run must not unpublish or double-handle them).
  const relevant = episodes.filter((ep) => args.episodeIds.includes(String(ep.id)))
  if (relevant.length !== args.episodeIds.length) {
    return {
      mode,
      action: 'held_blocked',
      seriesId: args.seriesId,
      blockers: [`expected ${args.episodeIds.length} promoted episode(s), found ${relevant.length}; holding series at ready_for_review`],
    }
  }
  const readiness = evaluateSeriesDirectReadiness(relevant)
  if (decidePostRfrAction(mode, readiness) !== 'publish') {
    console.warn(
      `[direct-publish] series ${args.seriesId} passed packaging but direct-publish guards failed — holding at ready_for_review: ${(readiness as { blockers: string[] }).blockers.join('; ')}`
    )
    return { mode, action: 'held_blocked', seriesId: args.seriesId, blockers: (readiness as { blockers: string[] }).blockers }
  }
  const firstAutoPublish = !(await hasPriorDirectPublish(db))
  const reason =
    `${DIRECT_PUBLISH_REASON_PREFIX}: series auto-published as a unit under direct mode after all episodes passed (job ${args.jobId}).`
  const transitions: string[] = []
  let publishedOn = ''
  try {
    // hasPriorDirectPublish is checked once for the series so only the first
    // episode row carries the FIRST marker; the marker log fires once below.
    let firstRemaining = firstAutoPublish
    for (const ep of relevant) {
      const epId = String(ep.id)
      // 3-fix N2 (Rule 3): re-verify each episode's CURRENT workflow_state
      // immediately before promoting it. On a partial write failure (or a
      // concurrent manual publish) an episode may already be live — re-
      // promoting it would double-write audit rows and split the series.
      // Already-published episodes are skipped, never re-promoted.
      let current: Record<string, unknown> | null = null
      try {
        current = await fetchStory(db, epId)
      } catch (e) {
        throw new Error(`pre-promote re-read failed for episode ${epId}: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (current && String(current.workflow_state) === 'published') {
        console.log(`[direct-publish] series ${args.seriesId}: episode ${epId} already published — skipping re-promotion`)
        transitions.push(`${epId}:skipped_already_published`)
        continue
      }
      const { publishedOn: epAt, transitions: epTransitions } = await promoteStoryToPublished(db, epId, {
        reason,
        firstAutoPublish: firstRemaining,
        sessionContext: args.jobId,
      })
      firstRemaining = false
      publishedOn = publishedOn || epAt
      transitions.push(`${epId}:${epTransitions.join(',')}`)
    }
    if (firstAutoPublish) {
      emitFirstPublishMarker({ seriesId: args.seriesId, jobId: args.jobId, publishedOn })
    } else {
      console.log(`[${DIRECT_PUBLISH_REASON_PREFIX}] series ${args.seriesId} auto-published as a unit (job ${args.jobId}, ${publishedOn})`)
    }
    return { mode, action: 'published', seriesId: args.seriesId, publishedOn, firstAutoPublish, transitions }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[direct-publish] series auto-publish failed for ${args.seriesId}: ${msg}`)
    return { mode, action: 'held_blocked', seriesId: args.seriesId, blockers: [msg], transitions }
  }
}
