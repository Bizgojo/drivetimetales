#!/usr/bin/env node
/**
 * C6 Cover Performance Tracking — one-time cover attribute backfill.
 *
 * Passes every published story cover through Claude vision and records:
 *   palette (bright/dark), dominant_subject (face/figure/object/landscape),
 *   face_visible (bool), temperature (warm/cool)
 * into stories.cover_attributes (source: 'vision').
 *
 * Usage:
 *   node scripts/backfill-cover-attributes.mjs           # skip already vision-tagged
 *   node scripts/backfill-cover-attributes.mjs --force   # retag everything
 *   node scripts/backfill-cover-attributes.mjs --dry-run # no DB writes
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── Load .env.local (repo convention: no dotenv dependency in scripts) ──────
function loadEnv(file) {
  try {
    const text = readFileSync(resolve(ROOT, file), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let value = m[2]
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!(m[1] in process.env)) process.env[m[1]] = value
    }
  } catch {
    /* file optional */
  }
}
loadEnv('.env.local')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY')
  process.exit(1)
}

const MODEL = process.env.COVER_ATTRIBUTE_MODEL || 'claude-sonnet-4-6'
const FORCE = process.argv.includes('--force')
const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

const VALID = {
  palette: new Set(['bright', 'dark']),
  dominant_subject: new Set(['face', 'figure', 'object', 'landscape']),
  temperature: new Set(['warm', 'cool']),
}

const PROMPT = `You are tagging an audiobook cover image for A/B performance analysis. Ignore any title/author text overlaid on the image. Answer with ONLY a JSON object, no prose, exactly these keys:
{
  "palette": "bright" or "dark"  (overall exposure/brightness of the image),
  "dominant_subject": "face" (a face is the clear focal point, close-up/portrait scale) | "figure" (a full or partial human/animal figure dominates but not face-scale) | "object" (an object/prop is the focal point) | "landscape" (scenery/environment dominates, no dominant figure or object),
  "face_visible": true or false (is any clearly readable face visible?),
  "temperature": "warm" (golden/orange/red/amber cast) or "cool" (blue/teal/silver/green cast)
}`

// Storage sometimes serves PNGs with a jpeg content-type — sniff magic bytes instead.
function sniffMediaType(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 4 && buf.toString('ascii', 0, 4).startsWith('GIF8')) return 'image/gif'
  return 'image/jpeg'
}

async function fetchImageBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`image fetch ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return { data: buf.toString('base64'), mediaType: sniffMediaType(buf) }
}

async function classifyCover(coverUrl) {
  const { data, mediaType } = await fetchImageBase64(coverUrl)
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  })
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`no JSON in response: ${text.slice(0, 200)}`)
  const parsed = JSON.parse(jsonMatch[0])

  const attrs = {
    palette: String(parsed.palette || '').toLowerCase(),
    dominant_subject: String(parsed.dominant_subject || '').toLowerCase(),
    face_visible: Boolean(parsed.face_visible),
    temperature: String(parsed.temperature || '').toLowerCase(),
  }
  if (!VALID.palette.has(attrs.palette)) throw new Error(`bad palette: ${attrs.palette}`)
  if (!VALID.dominant_subject.has(attrs.dominant_subject)) throw new Error(`bad subject: ${attrs.dominant_subject}`)
  if (!VALID.temperature.has(attrs.temperature)) throw new Error(`bad temperature: ${attrs.temperature}`)
  return { ...attrs, source: 'vision', model: MODEL, tagged_at: new Date().toISOString() }
}

async function withRetry(fn, attempts = 3) {
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts) await new Promise(r => setTimeout(r, 2000 * i))
    }
  }
  throw lastErr
}

async function main() {
  const { data: stories, error } = await supabase
    .from('stories')
    .select('id, title, genre, cover_url, cover_attributes, status')
    .eq('status', 'published')
    .not('cover_url', 'is', null)
    .order('title')

  if (error) {
    console.error('stories query failed:', error.message)
    process.exit(1)
  }

  const targets = stories.filter(
    s => FORCE || !(s.cover_attributes && s.cover_attributes.source === 'vision')
  )
  console.log(`Published stories with covers: ${stories.length} — tagging ${targets.length}${DRY_RUN ? ' (dry run)' : ''}\n`)

  const results = []
  const failures = []

  for (const story of targets) {
    try {
      const attrs = await withRetry(() => classifyCover(story.cover_url))
      if (!DRY_RUN) {
        const { error: updateErr } = await supabase
          .from('stories')
          .update({ cover_attributes: attrs })
          .eq('id', story.id)
        if (updateErr) throw new Error(`update: ${updateErr.message}`)
      }
      results.push({ story, attrs })
      console.log(
        `✅ ${story.title.slice(0, 44).padEnd(44)} ${attrs.palette.padEnd(6)} ${attrs.dominant_subject.padEnd(9)} face:${String(attrs.face_visible).padEnd(5)} ${attrs.temperature}`
      )
    } catch (err) {
      failures.push({ story, error: String(err.message || err) })
      console.error(`❌ ${story.title}: ${err.message || err}`)
    }
  }

  // Distribution summary (over ALL vision-tagged published covers, incl. prior runs)
  const tagged = stories
    .map(s => results.find(r => r.story.id === s.id)?.attrs || s.cover_attributes)
    .filter(a => a && a.source === 'vision')

  const dist = key =>
    tagged.reduce((acc, a) => {
      const v = String(a[key])
      acc[v] = (acc[v] || 0) + 1
      return acc
    }, {})

  console.log('\n── Attribute distribution (vision-tagged published covers) ──')
  console.log(`covers tagged:     ${tagged.length}/${stories.length}`)
  console.log(`palette:           ${JSON.stringify(dist('palette'))}`)
  console.log(`dominant_subject:  ${JSON.stringify(dist('dominant_subject'))}`)
  console.log(`face_visible:      ${JSON.stringify(dist('face_visible'))}`)
  console.log(`temperature:       ${JSON.stringify(dist('temperature'))}`)
  if (failures.length) {
    console.log(`\nFailures (${failures.length}):`)
    failures.forEach(f => console.log(`  - ${f.story.title}: ${f.error}`))
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
