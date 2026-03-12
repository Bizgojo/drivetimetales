#!/usr/bin/env node
/**
 * ET Episode Generator
 * Takes a pre-written script file in ET format and generates:
 *   - TTS audio for each segment (ElevenLabs)
 *   - Intro + outro audio (Belle B)
 *   - Cover art (Stability AI + text overlay)
 *   - DB record in stories table
 *
 * Usage: node scripts/generate-episode.js <script-file>
 */

const fs   = require('fs')
const path = require('path')
const os   = require('os')

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODk2MTIsImV4cCI6MjA4MTY2NTYxMn0.7asAd8ctLKJLdv2AojbF8WEo-N6dVheVA3mWxjkFwkk'
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'
const EL_KEY        = 'sk_3ece8b438673d1267470bd2bc111d2ec460051ecd61cb6fb'
const STABILITY_KEY = 'sk-NNoJ0C3aPKea6KOWXQc2KRPFkm0dqfCHKH2JfwNsy1bOLFJK'
const BASE_STORAGE  = `${SUPABASE_URL}/storage/v1/object/public/audio`

const BELLE_B     = 'EXAVITQu4vr4xnSDxMaL'
const GEORGE      = 'JBFqnCBsd6RMkjVDRZzb'   // narrator default

// Character voice assignments for The Third Key series
const CHAR_VOICES = {
  'NARRATOR':             GEORGE,
  'DANIEL CROSS':         'cjVigY5qzO86Huf0OWal',  // Eric — smooth, trustworthy male
  'DETECTIVE SARAH VOSS': 'XrExE9yKIg1WjnnlVkGX',  // Matilda — clipped, professional female
  'MARGARET ELLROY':      'pFZP5JQG7iQjIQuC4Bku',  // Lily — velvety actress
  'ELEANOR VAEL':         'Xb7hH8MSUJpSbSDYk0k2',  // Alice — British, clear, frail precision
  'ANNOUNCER':            BELLE_B,
}

const SCRIPT_FILE = process.argv[2]
if (!SCRIPT_FILE) { console.error('Usage: node generate-episode.js <script-file>'); process.exit(1) }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function callEL(text, voiceId, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
      }),
    })
    if (r.ok) return Buffer.from(await r.arrayBuffer())
    const err = await r.text()
    if (i < retries - 1 && (r.status === 429 || r.status >= 500)) {
      console.log(`    EL retry ${i+1} (${r.status})...`)
      await sleep((i + 1) * 8000)
    } else {
      throw new Error(`ElevenLabs ${r.status}: ${err.slice(0, 200)}`)
    }
  }
}

async function uploadToStorage(sb, buf, storagePath) {
  const { error } = await sb.storage.from('audio').upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Upload ${storagePath}: ${error.message}`)
  const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath)
  return publicUrl
}

async function generateCover(title, author, episodeNum, seriesTitle, folder, sb) {
  const epLabel = seriesTitle ? `${seriesTitle} · Episode ${episodeNum}` : title
  const imgPrompt = `A dark, moody close-up of a Victorian iron key resting on aged courthouse document files, dramatic single-point lighting from above, deep shadows, photorealistic, cinematic noir photography, warm amber and dark brown tones, dust particles in light beam. Main subject centered or in the upper half. Bottom corners naturally dark and shadowy — no important details there. No text, no words, no letters anywhere in the image.`

  console.log('   🎨 Stability AI image...')
  const form = new FormData()
  form.append('prompt', imgPrompt)
  form.append('model', 'core')
  form.append('output_format', 'jpeg')
  form.append('aspect_ratio', '1:1')

  const stab = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STABILITY_KEY}`, Accept: 'image/*' },
    body: form,
  })
  if (!stab.ok) {
    const err = await stab.text()
    throw new Error(`Stability AI ${stab.status}: ${err.slice(0, 200)}`)
  }
  const imgBuf = Buffer.from(await stab.arrayBuffer())

  // Add text overlay using sharp (via CLI since sharp is available)
  const tmpBase  = path.join(os.tmpdir(), `cover_base_${Date.now()}.jpg`)
  const tmpFinal = path.join(os.tmpdir(), `cover_final_${Date.now()}.jpg`)
  fs.writeFileSync(tmpBase, imgBuf)

  // Build SVG text overlay
  const episodeLine = seriesTitle ? `Episode ${episodeNum}` : ''
  const seriesLine  = seriesTitle || ''
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0"/>
        <stop offset="55%" stop-color="black" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="black" stop-opacity="0.95"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#g)"/>
    ${seriesLine ? `<text x="512" y="760" font-family="Georgia, serif" font-size="28" fill="#c8a96e" text-anchor="middle" letter-spacing="4">${seriesLine.toUpperCase()}</text>` : ''}
    ${episodeLine ? `<text x="512" y="800" font-family="Georgia, serif" font-size="22" fill="#a08050" text-anchor="middle" letter-spacing="3">${episodeLine.toUpperCase()}</text>` : ''}
    <text x="512" y="${seriesLine ? '860' : '830'}" font-family="Georgia, serif" font-size="${title.length > 20 ? '46' : '54'}" font-weight="bold" fill="white" text-anchor="middle">${escSvg(title)}</text>
    <text x="512" y="${seriesLine ? '910' : '890'}" font-family="Georgia, serif" font-size="26" fill="#aaaaaa" text-anchor="middle">by ${escSvg(author)}</text>
  </svg>`

  const svgFile = path.join(os.tmpdir(), `overlay_${Date.now()}.svg`)
  fs.writeFileSync(svgFile, svg)

  // Use sharp CLI via node
  const sharp = require('sharp')
  const svgBuf = fs.readFileSync(svgFile)
  const finalBuf = await sharp(tmpBase)
    .composite([{ input: svgBuf, blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer()

  fs.unlinkSync(tmpBase); fs.unlinkSync(svgFile)

  const coverUrl = await uploadToStorage(sb, finalBuf, `asc3/${folder}/cover.jpg`)
  return coverUrl
}

function escSvg(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Script Parser ─────────────────────────────────────────────────────────────

function parseScript(raw) {
  const lines = raw.split('\n')
  const meta = {}
  const segments = []   // { speaker, text }
  let inScript = false
  let inLandingOutro = false

  for (const line of lines) {
    const trim = line.trim()
    if (!trim) continue

    // Stop at landing page section (app version doesn't use this)
    if (trim.startsWith('LANDING PAGE ANNOUNCER OUTRO') || trim.startsWith('---\nLANDING')) {
      inLandingOutro = true; continue
    }
    if (inLandingOutro) continue

    if (!inScript) {
      // Parse meta header
      const metaM = trim.match(/^([A-Z_]+):\s*(.+)$/)
      if (metaM) meta[metaM[1]] = metaM[2].trim()
      if (trim === '[START AUDIO DRAMA SCRIPT]') { inScript = true; continue }
      if (trim === '---') continue
      // Character guide lines starting with '-' are part of the header
      continue
    }

    // In script body
    if (trim.startsWith('[SFX:') || trim.startsWith('[PAUSE:') || trim === '---') continue
    if (trim === '[START AUDIO DRAMA SCRIPT]') continue

    // Character line: NAME: text
    const charM = trim.match(/^([A-Z][A-Z\s'.-]+?):\s+(.+)$/)
    if (charM) {
      const speaker = charM[1].trim()
      const text    = charM[2].trim()
      if (!text) continue
      segments.push({ speaker, text })
    }
  }

  return { meta, segments }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { createClient } = require('@supabase/supabase-js')
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  const raw = fs.readFileSync(SCRIPT_FILE, 'utf8')
  const { meta, segments } = parseScript(raw)

  const title       = meta.EPISODE_TITLE || 'Untitled'
  const author      = meta.AUTHOR || 'Unknown'
  const genre       = meta.GENRE || 'Mystery'
  const seriesName  = meta.SERIES || null
  const episodeNum  = meta.EPISODE ? parseInt(meta.EPISODE) : null
  const sunoPrompt  = meta.SUNO_PROMPT || `Cinematic mystery thriller. Dark atmospheric strings, no vocals.`
  const fullTitle   = seriesName ? `${seriesName}: ${title}` : title

  console.log(`\n📖  "${fullTitle}" by ${author}`)
  console.log(`    Series: ${seriesName || 'standalone'}  |  Episode: ${episodeNum || '—'}`)
  console.log(`    ${segments.length} dialogue segments parsed`)

  // Separate intro, outro, story segments
  const announcerSegs = segments.filter(s => s.speaker === 'ANNOUNCER')
  const storySegs     = segments.filter(s => s.speaker !== 'ANNOUNCER')

  const introText = announcerSegs[0]?.text || `Welcome to Endless Tales. Today's story: "${title}" by ${author}. Let's begin.`
  const outroText = announcerSegs[announcerSegs.length - 1]?.text || `Thank you for listening to "${title}" on Endless Tales. Visit endless-tales.com for more stories.`

  console.log(`    Intro: "${introText.slice(0, 60)}..."`)
  console.log(`    Story segments: ${storySegs.length}`)
  console.log(`    Outro: "${outroText.slice(0, 60)}..."`)

  const folder = crypto.randomUUID()
  console.log(`\n📁  Storage folder: ${folder}`)

  // ── INTRO ──────────────────────────────────────────────────────────────────
  console.log('\n🎙️  Intro (Belle B)...')
  const introAudio = await callEL(introText, BELLE_B)
  const introUrl = await uploadToStorage(sb, introAudio, `asc3/${folder}/intro.mp3`)
  console.log(`    ✅ ${introUrl.split('/').pop()}`)

  // ── STORY SEGMENTS ─────────────────────────────────────────────────────────
  console.log(`\n🎭  Story segments (${storySegs.length})...`)
  const storyResults = []
  for (let i = 0; i < storySegs.length; i++) {
    const { speaker, text } = storySegs[i]
    const voiceId = CHAR_VOICES[speaker] || GEORGE
    const padded  = String(i).padStart(3, '0')
    process.stdout.write(`    [${i+1}/${storySegs.length}] ${speaker.slice(0,20).padEnd(20)} → ${text.slice(0,50)}...\r`)
    const audio = await callEL(text, voiceId)
    const url   = await uploadToStorage(sb, audio, `asc3/${folder}/segment_${padded}.mp3`)
    storyResults.push({ speaker, url })
    await sleep(400)  // brief pause to avoid EL rate limits
  }
  console.log(`    ✅ All ${storyResults.length} segments done                              `)

  // ── OUTRO ──────────────────────────────────────────────────────────────────
  console.log('\n🎙️  Outro (Belle B)...')
  const outroAudio = await callEL(outroText, BELLE_B)
  const outroUrl   = await uploadToStorage(sb, outroAudio, `asc3/${folder}/outro.mp3`)
  console.log(`    ✅ ${outroUrl.split('/').pop()}`)

  // ── COVER ART ──────────────────────────────────────────────────────────────
  console.log('\n🎨  Cover art...')
  let coverUrl = ''
  try {
    coverUrl = await generateCover(title, author, episodeNum, seriesName, folder, sb)
    console.log(`    ✅ cover.jpg`)
  } catch (e) {
    console.warn(`    ⚠️  Cover failed: ${e.message}`)
  }

  // ── DB RECORD ──────────────────────────────────────────────────────────────
  console.log('\n💾  Creating DB record...')
  const wordCount = storySegs.map(s => s.text.split(' ').length).reduce((a, b) => a + b, 0)
  const durationMins = Math.ceil(wordCount / 150)

  const record = {
    title: fullTitle,
    author,
    genre:          genre.split('/')[0].trim(),
    description:    meta.DESCRIPTION || '',
    audio_url:      storyResults[0]?.url || null,
    cover_url:      coverUrl || null,
    duration_mins:  durationMins,
    duration_label: `${durationMins} min`,
    credits:        0,
    source_tool:    'ASC3',
    asc_version:    '3',
    is_new:         true,
    is_featured:    false,
    play_count:     0,
    word_count:     wordCount,
    author_style:   'Julian Mercer',
    primary_genre:  genre.split('/')[0].trim(),
    intro_text:     introText,
    outro_text:     outroText,
    intro_audio_url:  introUrl,
    story_audio_url:  storyResults[0]?.url || null,
    outro_audio_url:  outroUrl,
    cover_image_url:  coverUrl || null,
    status:           'pending',
    is_hidden:        true,
    suno_prompt:      sunoPrompt,
    series_name:      seriesName || null,
    episode_number:   episodeNum || null,
  }

  const { data: inserted, error: dbErr } = await sb.from('stories').insert(record).select('id').single()
  if (dbErr) {
    // Column might not exist — try without optional columns
    const { series_name, episode_number, suno_prompt, ...coreRecord } = record
    const { data: ins2, error: e2 } = await sb.from('stories').insert(coreRecord).select('id').single()
    if (e2) throw new Error(`DB insert: ${e2.message}`)
    console.log(`\n✅  Created story: ${ins2.id}`)
    console.log(`    Folder: ${folder}`)
    console.log(`    Audio URL (first segment): ${storyResults[0]?.url}`)
    console.log(`    Cover: ${coverUrl || '(none)'}`)
    console.log(`    Duration: ~${durationMins} min  |  Segments: ${storyResults.length}\n`)
    return
  }

  console.log(`\n✅  Created story: ${inserted.id}`)
  console.log(`    Folder: ${folder}`)
  console.log(`    Audio URL (first segment): ${storyResults[0]?.url}`)
  console.log(`    Cover: ${coverUrl || '(none)'}`)
  console.log(`    Duration: ~${durationMins} min  |  Segments: ${storyResults.length}\n`)
}

main().catch(e => { console.error('\n❌  FATAL:', e.message); process.exit(1) })
