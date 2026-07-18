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
 */

const PROTECTED_STATES = ['published', 'ready_for_review', 'repair_queue', 'approved_ready']

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

  const byState = {}
  for (const row of rows) byState[row.status] = (byState[row.status] || 0) + 1

  console.log(`Protected-state stories found: ${stories.length}`)
  console.log(`Index rows to upsert:          ${rows.length}`, byState)
  if (skipped.length) {
    console.log(`Skipped (no premise text):     ${skipped.length}`)
    for (const s of skipped) console.log(`  - ${s.id} [${s.state}] ${s.title || '(untitled)'}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — no writes performed. Re-run with --apply on Marc\'s word (after the premise_index migration is applied).')
    return
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
