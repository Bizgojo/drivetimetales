#!/usr/bin/env node
/**
 * PREMISE-UNIQUENESS-001 — premise_index backfill (DML only; service role).
 *
 * Populates public.premise_index from every story currently in a protected
 * workflow state: published, ready_for_review, repair_queue, approved_ready.
 * Cold storage is exempt by canon — those premises stay reusable and are
 * never indexed.
 *
 * RUN ORDER: Marc applies supabase/migrations/20260718140000_premise_index.sql
 * in the Supabase SQL editor first, then runs this script on his word:
 *   node scripts/backfill-premise-index.js            # dry run (default)
 *   node scripts/backfill-premise-index.js --apply    # upsert rows
 *
 * PREMISE SOURCE RULE: premise = brief_json.premise (V2 briefs), falling back
 * to stories.description for legacy rows without a brief. Stories with
 * neither are reported and skipped.
 *
 * CORE HOOK EXTRACTION RULE (plain-JS twin of lib/premiseGate.ts — a jest
 * parity test in __tests__/premise-uniqueness-001.test.ts keeps them in
 * lockstep):
 *   1. Trim the premise and split into sentences on terminal punctuation.
 *   2. core_hook = first sentence; if it carries fewer than 6 content tokens
 *      (after stopword removal + stemming) and a second sentence exists,
 *      append the second sentence.
 *   3. Cap at 300 characters.
 *
 * Idempotent: upsert on story_id. Safe to re-run any time the index drifts
 * (it is also the recovery path when a live sync write fails).
 *
 * KNOWN-ADJACENT CLUSTERS (amendment, Marc ruling 2026-07-18 09:47 EDT):
 * The retroactive sweep (PREMISE-SWEEP-20260718) found three MEDIUM published
 * near-twin pairs. No story action, but this script seeds them as
 * known-adjacent clusters: one premise_adjacent_clusters row per cluster
 * (slug + label + matchable hook text) and an adjacent_cluster tag on each
 * member story's premise_index row. Future briefs near these hooks get an
 * early ADJACENT warning from the gate (never a bounce — see
 * lib/premiseGate.ts). Re-running the backfill re-seeds tags and clusters
 * (idempotent), which is also the recovery path if a tag is ever lost.
 */

const PROTECTED_STATES = ['published', 'ready_for_review', 'repair_queue', 'approved_ready']

// Known-adjacent clusters — Marc ruling 2026-07-18 09:47 EDT, member story
// ids from the retroactive sweep report (PREMISE-SWEEP-20260718).
// `hook` holds NEWLINE-SEPARATED VARIANTS: one abstract engine phrasing plus
// one concrete phrasing per member pair. They are token-matching surfaces
// for the deterministic gate (score = max variant containment — see
// lib/premiseGate.ts clusterHookScore), not display prose. `label` is the
// display name.
const KNOWN_ADJACENT_CLUSTERS = [
  {
    slug: 'staged-fall-accidental-ruling',
    label: 'Staged-fall ruled accidental; investigator vs resistant local authority',
    hook: [
      'Found dead after a fall, ruled an accidental fall, but the wound evidence is inconsistent and the fall was staged murder; a detective or investigator must reopen the case against the sheriff or department that already ruled it an accident.',
      'Dead of a head wound below the bridge, ruled a probable night fall within hours; the closing ritual interrupted, an amateur sleuth must make the detective see murder where the file says accident — the killer staged the fall, the case reopened as homicide.',
      'A state detective reviews a death at the base of the barn stairs; the medical examiner flags the wound pattern as inconsistent with a fall, but the sheriff already ruled the death accidental and wants the review closed.',
    ].join('\n'),
    ruling: 'PREMISE-UNIQUENESS-001 amendment — Marc ruling 2026-07-18 09:47 EDT; sweep pair #2 (MEDIUM): Murder at Falls Park + The Hardin Falls Inquiry (both published, Mystery).',
    member_story_ids: [
      // Murder at Falls Park (published, Mystery, 3 eps)
      '09457ef0-e32f-48e2-a1bb-3311ddd68a49',
      'f1e7ee5e-f7cb-41c0-b8ea-fb244ea62c41',
      'abbb3cdf-e5aa-4506-90e0-b2b3a2d19cd7',
      // The Hardin Falls Inquiry (published, Mystery, 3 eps)
      '1c54646b-6b13-4f26-b2ba-b633cf017cc6',
      'c6dc30d1-648b-4163-9f5b-a963c0517c5a',
      'ebaf11cb-5b46-4b6f-bf3e-790185299811',
    ],
  },
  {
    slug: 'impossible-desert-highway-location',
    label: 'Officially-nonexistent desert-highway location with fresh physical evidence',
    hook: [
      'On a desert highway a location officially does not exist — county records say it was never built, the road closed years ago — yet there is fresh physical evidence: a wreck, a warm engine, footprints, a stop that vanished.',
      'A long-haul trucker discovers his usual fuel stop has vanished — the building gone, the lot empty, county records show nothing was ever built there — and driving the same stretch of highway twice yields two different conclusions.',
      'A lone patrol officer receives a distress call from a road officially closed for years and finds a wrecked car, a still-warm engine, and footprints that lead into the desert and simply stop.',
    ].join('\n'),
    ruling: 'PREMISE-UNIQUENESS-001 amendment — Marc ruling 2026-07-18 09:47 EDT; sweep pair #3 (MEDIUM): Dry Run + Signal at Mile Forty (both published, Thriller).',
    member_story_ids: [
      '3dac7ff5-735c-428b-8be2-a58799d7f7bd', // Dry Run (published, Thriller, standalone)
      'e7cb370a-6401-4030-9f0f-c7c1c88ebdd2', // Signal at Mile Forty (published, Thriller, standalone)
    ],
  },
  {
    slug: 'staged-proof-impostor-farce',
    label: 'Impostor must physically stage proof of a fabricated skill before live witnesses',
    hook: [
      'A man who faked a skill, history, or lifestyle must stage convincing physical proof of the fake live in front of witnesses, recruiting accomplices and props to manufacture the performance before the lie collapses and he is exposed.',
      'A man rents a boat, fakes his fishing history, and buys the catch to impress his future father-in-law at the lake — staging proof of a skill he never had.',
      'A fake commuter wins a real award and must manufacture one convincing commute with witnesses in 48 hours — recruited accomplices, a staged route, live on a drive-time radio ride-along.',
    ].join('\n'),
    ruling: 'PREMISE-UNIQUENESS-001 amendment — Marc ruling 2026-07-18 09:47 EDT; sweep pair #4 (MEDIUM): Commuter of the Year + Dead in the Water (both published, Comedy).',
    member_story_ids: [
      // Commuter of the Year (published, Comedy, 3 eps)
      'fe23bfd4-d6c9-4ad9-b833-37657287c0f3',
      '1c1e4500-5c10-4ffc-a93e-d9fe8ef7b3b2',
      '87323f38-6068-45bb-b87c-ccd93ab1ac93',
      // Dead in the Water (published, Comedy, standalone)
      '4f2b768f-6911-45b8-bf32-cd361b111b63',
    ],
  },
]

/** Cluster slug for a member story id, or null. */
function adjacentClusterForStory(storyId) {
  for (const cluster of KNOWN_ADJACENT_CLUSTERS) {
    if (cluster.member_story_ids.includes(String(storyId))) return cluster.slug
  }
  return null
}

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
  'get', 'got', 'one', 'two', 'new', 'old',
  'story', 'tale', 'episode', 'series', 'protagonist', 'character', 'listener',
])

function stemToken(token) {
  let t = token
  if (t.length >= 6 && t.endsWith('ing')) t = t.slice(0, -3)
  else if (t.length >= 5 && t.endsWith('ed')) t = t.slice(0, -2)
  if (t.length >= 4 && t.endsWith('es')) t = t.slice(0, -2)
  else if (t.length >= 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
  return t
}

function contentTokens(text) {
  const out = []
  const seen = new Set()
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

function splitSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const MIN_HOOK_CONTENT_TOKENS = 6
const MAX_CORE_HOOK_CHARS = 300

function extractCoreHook(premise) {
  const sentences = splitSentences(premise)
  if (sentences.length === 0) return ''
  let hook = sentences[0]
  if (contentTokens(hook).length < MIN_HOOK_CONTENT_TOKENS && sentences.length > 1) {
    hook = `${hook} ${sentences[1]}`
  }
  return hook.slice(0, MAX_CORE_HOOK_CHARS)
}

function premiseIndexRowForStory(story) {
  const brief = story.brief_json && typeof story.brief_json === 'object' ? story.brief_json : {}
  const premise = String(brief.premise || '').trim() || String(story.description || '').trim()
  if (!premise) return null
  return {
    story_id: story.id,
    series_id: story.series_id || null,
    title: story.title || null,
    status: String(story.workflow_state || '').trim() || 'unknown',
    genre: story.genre || null,
    logline: String(story.description || '').trim() || null,
    core_hook: extractCoreHook(premise),
    premise,
    updated_at: new Date().toISOString(),
  }
}

async function main() {
  require('dotenv').config({ path: '.env.local' })
  const { createClient } = require('@supabase/supabase-js')

  const apply = process.argv.includes('--apply')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  // Page through all protected-state stories (read-only discovery).
  const PAGE = 500
  const stories = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('stories')
      .select('id,series_id,title,workflow_state,genre,description,brief_json')
      .in('workflow_state', PROTECTED_STATES)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('Failed to read stories:', error.message)
      process.exit(1)
    }
    stories.push(...(data || []))
    if (!data || data.length < PAGE) break
  }

  const rows = []
  const skipped = []
  for (const story of stories) {
    const row = premiseIndexRowForStory(story)
    if (row) rows.push(row)
    else skipped.push({ id: story.id, title: story.title, state: story.workflow_state })
  }

  // Known-adjacent cluster tags (Marc ruling 09:47) — the backfill is the
  // authoritative seeder: every row gets an explicit value (slug or null) so
  // re-runs repair lost/stale tags. Live sync never writes this column.
  const taggedByCluster = {}
  for (const row of rows) {
    row.adjacent_cluster = adjacentClusterForStory(row.story_id)
    if (row.adjacent_cluster) {
      taggedByCluster[row.adjacent_cluster] = (taggedByCluster[row.adjacent_cluster] || 0) + 1
    }
  }
  const missingMembers = []
  for (const cluster of KNOWN_ADJACENT_CLUSTERS) {
    for (const id of cluster.member_story_ids) {
      if (!rows.some((r) => r.story_id === id)) missingMembers.push({ cluster: cluster.slug, story_id: id })
    }
  }

  const byState = {}
  for (const row of rows) byState[row.status] = (byState[row.status] || 0) + 1

  console.log(`Protected-state stories found: ${stories.length}`)
  console.log(`Index rows to upsert:          ${rows.length}`, byState)
  console.log(`Known-adjacent clusters:       ${KNOWN_ADJACENT_CLUSTERS.length}`, taggedByCluster)
  if (missingMembers.length) {
    console.log(`⚠️ Cluster member stories NOT in a protected state (tag skipped — verify the sweep ids):`)
    for (const m of missingMembers) console.log(`  - ${m.story_id} [${m.cluster}]`)
  }
  if (skipped.length) {
    console.log(`Skipped (no premise text):     ${skipped.length}`)
    for (const s of skipped) console.log(`  - ${s.id} [${s.state}] ${s.title || '(untitled)'}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — no writes performed. Re-run with --apply on Marc\'s word (after the premise_index migration is applied).')
    return
  }

  // Seed the known-adjacent clusters first (gate reads both tables together).
  const clusterRows = KNOWN_ADJACENT_CLUSTERS.map((c) => ({
    slug: c.slug,
    label: c.label,
    hook: c.hook,
    ruling: c.ruling,
  }))
  {
    const { error } = await supabase
      .from('premise_adjacent_clusters')
      .upsert(clusterRows, { onConflict: 'slug' })
    if (error) {
      console.error('Cluster seed failed:', error.message)
      process.exit(1)
    }
    console.log(`Seeded ${clusterRows.length} known-adjacent clusters.`)
  }

  const CHUNK = 100
  let upserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('premise_index')
      .upsert(chunk, { onConflict: 'story_id' })
    if (error) {
      console.error(`Upsert failed at chunk ${i / CHUNK}:`, error.message)
      process.exit(1)
    }
    upserted += chunk.length
  }
  console.log(`\nUpserted ${upserted} premise_index rows.`)

  // Hygiene: report (do not delete) index rows whose story is no longer in a
  // protected state — cold storage transitions should have removed them.
  const { data: indexRows, error: indexError } = await supabase
    .from('premise_index')
    .select('story_id,status,title')
  if (!indexError && indexRows) {
    const liveIds = new Set(stories.map((s) => s.id))
    const stale = indexRows.filter((r) => !liveIds.has(r.story_id))
    if (stale.length) {
      console.log(`\n⚠️ ${stale.length} index row(s) reference stories no longer in a protected state (review, then delete manually if confirmed):`)
      for (const s of stale) console.log(`  - ${s.story_id} [${s.status}] ${s.title || '(untitled)'}`)
    }
  }
}

module.exports = {
  PROTECTED_STATES,
  KNOWN_ADJACENT_CLUSTERS,
  adjacentClusterForStory,
  stemToken,
  contentTokens,
  splitSentences,
  extractCoreHook,
  premiseIndexRowForStory,
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
