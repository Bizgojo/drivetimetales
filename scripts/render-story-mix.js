#!/usr/bin/env node
/**
 * ET Story Mix Renderer — Clean Sequential Timeline
 *
 * No music plays while any voice is speaking. Pure sequence:
 *
 *   [IO 6s] [Belle B intro] [IO 8s] [Story narration] [IO 6s] [Belle B outro] [IO 6s fade-out]
 *
 * All sections are simple concatenation — no amix, no competition.
 */

const { spawnSync } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')

const FF           = '/opt/homebrew/bin/ffmpeg'
const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODk2MTIsImV4cCI6MjA4MTY2NTYxMn0.7asAd8ctLKJLdv2AojbF8WEo-N6dVheVA3mWxjkFwkk'
const BASE         = `${SUPABASE_URL}/storage/v1/object/public/audio`

const STORY_ID = process.argv[2] || process.env.STORY_ID
if (!STORY_ID) { console.error('Usage: node render-story-mix.js <storyId>'); process.exit(1) }

// ── IO music sting durations (seconds) ───────────────────────────────────────
const IO_OPEN   = 6   // before Belle B intro
const IO_BRIDGE = 8   // between intro and story
const IO_MID    = 6   // between story and outro
const IO_CLOSE  = 6   // after Belle B outro (fades out)
const IO_VOL    = 0.9 // music volume (full volume — no voice competing)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function dl(url, dest) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Download failed (${r.status}): ${url}`)
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
}

function getDur(f) {
  const r = spawnSync(FF, ['-i', f, '-f', 'null', '-'])
  const out = (r.stderr || Buffer.alloc(0)).toString()
  const m = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0
}

function ff(args, label) {
  if (label) process.stdout.write(`   ${label}... `)
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString()
    throw new Error(`ffmpeg [${label || '?'}]:\n${err.slice(-600)}`)
  }
  if (label) console.log('done')
}

function concatFiles(files, out, label) {
  const lst = out + '.lst'
  fs.writeFileSync(lst, files.map(f => `file '${f}'`).join('\n'))
  ff(['-f', 'concat', '-safe', '0', '-i', lst,
    '-map', '0:a', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out], label)
  fs.unlinkSync(lst)
}

/**
 * Trim IO music to exactly `dur` seconds.
 * fadeIn: short fade-in to avoid hard pop at start
 * fadeOut: fade to silence at end
 */
function mkSting(src, out, dur, { fadeIn = 0.3, fadeOut = 0.5, vol = IO_VOL } = {}) {
  const fadeOutSt = dur - fadeOut
  ff([
    '-stream_loop', '-1', '-i', src,
    '-t', String(dur),
    '-af', `volume=${vol},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutSt}:d=${fadeOut}`,
    '-map', '0:a', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out,
  ])
}

function normalize(inP, outP, label) {
  ff(['-i', inP, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outP], label)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { createClient } = require('@supabase/supabase-js')
  const sb = createClient(SUPABASE_URL, ANON_KEY)

  const { data: story, error } = await sb.from('stories')
    .select('id, title, intro_audio_url, story_audio_url, outro_audio_url')
    .eq('id', STORY_ID).single()
  if (error || !story) throw new Error('Story not found: ' + (error?.message || STORY_ID))
  console.log(`\n📖  "${story.title}"`)

  const m = (story.story_audio_url || '').match(/asc3\/([^/]+)\//)
  if (!m) throw new Error('Cannot extract storage folder from story_audio_url')
  const FOLDER = m[1]

  // Download segments list
  const { data: files } = await sb.storage.from('audio').list(`asc3/${FOLDER}`, { limit: 300, sortBy: { column: 'name', order: 'asc' } })
  const segs = (files || []).filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3')).sort((a, b) => a.name.localeCompare(b.name))
  if (!segs.length) throw new Error('No segments found in storage folder')
  console.log(`    ${segs.length} segments`)

  const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), 'et-render-'))
  const ioP    = path.join(tmp, 'io.mp3')
  const introP = path.join(tmp, 'intro.mp3')
  const outroP = path.join(tmp, 'outro.mp3')

  // ── Download ──────────────────────────────────────────────────────────────
  console.log('\n⬇️   Downloading...')
  await dl(`${BASE}/intro_outro_music.mp3`, ioP)
  await dl(story.intro_audio_url, introP)
  await dl(story.outro_audio_url, outroP)

  const segPaths = []
  for (let i = 0; i < segs.length; i++) {
    const p = path.join(tmp, `s${String(i).padStart(3, '0')}.mp3`)
    await dl(`${BASE}/asc3/${FOLDER}/${segs[i].name}`, p)
    segPaths.push(p)
    if ((i + 1) % 25 === 0 || i + 1 === segs.length) console.log(`    ${i + 1}/${segs.length}`)
  }

  // ── Normalize all voice tracks ────────────────────────────────────────────
  console.log('\n🔊  Normalizing voice...')
  const introNorm = path.join(tmp, 'intro_norm.mp3')
  const outroNorm = path.join(tmp, 'outro_norm.mp3')
  const storyRaw  = path.join(tmp, 'story_raw.mp3')
  const storyNorm = path.join(tmp, 'story_norm.mp3')

  normalize(introP, introNorm, 'normalize intro')
  normalize(outroP, outroNorm, 'normalize outro')
  concatFiles(segPaths, storyRaw, 'concat segments')
  normalize(storyRaw, storyNorm, 'normalize story')

  const introDur = getDur(introNorm)
  const outroDur = getDur(outroNorm)
  const storyDur = getDur(storyNorm)
  console.log(`    intro: ${introDur.toFixed(1)}s  |  story: ${(storyDur / 60).toFixed(2)} min  |  outro: ${outroDur.toFixed(1)}s`)

  // ── Build IO music stings ─────────────────────────────────────────────────
  console.log('\n🎵  Building music stings...')
  const sting1 = path.join(tmp, 'sting1.mp3')  // 6s open
  const sting2 = path.join(tmp, 'sting2.mp3')  // 8s bridge
  const sting3 = path.join(tmp, 'sting3.mp3')  // 6s mid
  const sting4 = path.join(tmp, 'sting4.mp3')  // 6s close (longer fade-out)

  process.stdout.write(`   sting 1 (${IO_OPEN}s open)... `)
  mkSting(ioP, sting1, IO_OPEN)
  console.log('done')

  process.stdout.write(`   sting 2 (${IO_BRIDGE}s bridge)... `)
  mkSting(ioP, sting2, IO_BRIDGE)
  console.log('done')

  process.stdout.write(`   sting 3 (${IO_MID}s mid)... `)
  mkSting(ioP, sting3, IO_MID)
  console.log('done')

  process.stdout.write(`   sting 4 (${IO_CLOSE}s close, fade-out)... `)
  mkSting(ioP, sting4, IO_CLOSE, { fadeIn: 0.3, fadeOut: 3.0 })  // 3s fade-out to silence
  console.log('done')

  // ── Print timeline ────────────────────────────────────────────────────────
  let t = 0
  const tl = [
    ['IO open',       IO_OPEN],
    ['Belle B intro', introDur],
    ['IO bridge',     IO_BRIDGE],
    ['Story',         storyDur],
    ['IO mid',        IO_MID],
    ['Belle B outro', outroDur],
    ['IO close',      IO_CLOSE],
  ]
  console.log('\n⏱   Timeline:')
  for (const [label, dur] of tl) {
    console.log(`    ${t.toFixed(1)}s → ${(t + dur).toFixed(1)}s  [${label}]`)
    t += dur
  }
  const totalDur = t
  console.log(`    Total: ${(totalDur / 60).toFixed(2)} min`)

  // ── Concatenate final mix ─────────────────────────────────────────────────
  const finalP = path.join(tmp, 'final_mix.mp3')
  console.log('\n🎬  Building final mix...')
  concatFiles(
    [sting1, introNorm, sting2, storyNorm, sting3, outroNorm, sting4],
    finalP,
    'concat all sections'
  )

  // Apply limiter for safety
  const limitedP = path.join(tmp, 'final_limited.mp3')
  ff(['-i', finalP,
    '-af', 'alimiter=level_in=1:level_out=0.99:limit=0.99:attack=5:release=50',
    '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', limitedP], 'apply limiter')

  const sz  = (fs.statSync(limitedP).size / 1024 / 1024).toFixed(1)
  const dur = getDur(limitedP)
  console.log(`\n✅  ${sz} MB  |  ${(dur / 60).toFixed(2)} min`)

  // ── Upload ────────────────────────────────────────────────────────────────
  console.log('\n☁️   Uploading...')
  const version     = Date.now()
  const storagePath = `asc3/${FOLDER}/final_mix_${version}.mp3`
  const buf         = fs.readFileSync(limitedP)
  const { error: upErr } = await sb.storage.from('audio').upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: false })
  if (upErr) throw new Error('Upload: ' + upErr.message)
  const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath)
  const { error: dbErr } = await sb.from('stories').update({ audio_url: publicUrl }).eq('id', STORY_ID)
  if (dbErr) throw new Error('DB update: ' + dbErr.message)

  console.log(`✅  Live: ${publicUrl}\n`)
  fs.rmSync(tmp, { recursive: true })
}

main().catch(e => { console.error('\n❌  FATAL:', e.message); process.exit(1) })
