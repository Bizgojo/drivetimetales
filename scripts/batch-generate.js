#!/usr/bin/env node
/**
 * Standalone batch story generator — calls APIs directly, no HTTP server needed
 * Usage: node scripts/batch-generate.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { execSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')
const crypto = require('crypto')

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const BELLE_B_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const NARRATOR_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'
const ELEVENLABS_CHUNK_SIZE = 4500

const CURATED_VOICES = [
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',  gender: 'male',   age: 'middle_aged', accent: 'british',   desc: 'Warm, Captivating Storyteller' },
  { voice_id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger',   gender: 'male',   age: 'middle_aged', accent: 'american',  desc: 'Laid-Back, Casual, Resonant' },
  { voice_id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',  gender: 'male',   age: 'middle_aged', accent: 'american',  desc: 'Husky, Trickster' },
  { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male',   age: 'young',       accent: 'australian',desc: 'Deep, Confident, Energetic' },
  { voice_id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry',   gender: 'male',   age: 'young',       accent: 'american',  desc: 'Fierce Warrior' },
  { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',    gender: 'male',   age: 'young',       accent: 'american',  desc: 'Energetic, Social' },
  { voice_id: 'cjVigY5qzO86Huf0OWal', name: 'Eric',    gender: 'male',   age: 'middle_aged', accent: 'american',  desc: 'Smooth, Trustworthy' },
  { voice_id: 'iP95p4xoKVk53GoZ742B', name: 'Chris',   gender: 'male',   age: 'middle_aged', accent: 'american',  desc: 'Charming, Down-to-Earth' },
  { voice_id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',   gender: 'male',   age: 'middle_aged', accent: 'american',  desc: 'Deep, Resonant, Comforting' },
  { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  gender: 'male',   age: 'middle_aged', accent: 'british',   desc: 'Steady Broadcaster' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',    gender: 'male',   age: 'middle_aged', accent: 'american',  desc: 'Dominant, Firm' },
  { voice_id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill',    gender: 'male',   age: 'old',         accent: 'american',  desc: 'Wise, Mature, Balanced' },
  { voice_id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',   gender: 'female', age: 'young',       accent: 'american',  desc: 'Enthusiast, Quirky' },
  { voice_id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', age: 'young',       accent: 'american',  desc: 'Playful, Bright, Warm' },
  { voice_id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',   gender: 'female', age: 'middle_aged', accent: 'british',   desc: 'Clear, Engaging Educator' },
  { voice_id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', age: 'middle_aged', accent: 'american',  desc: 'Knowledgeable, Professional' },
  { voice_id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella',   gender: 'female', age: 'middle_aged', accent: 'american',  desc: 'Professional, Bright, Warm' },
  { voice_id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    gender: 'female', age: 'middle_aged', accent: 'british',   desc: 'Velvety Actress' },
]

const STORIES = [
  // Stories 1 & 2 already published — skipped
  {
    authorName: 'Nina Vasquez',
    authorStyle: 'Isaac Asimov',
    primaryGenre: 'Science Fiction',
    secondaryGenre1: 'Drama', secondaryGenre2: 'Suspense',
    tone: 'Dramatic',
    wordCount: 4500,
    concept: "In 2047, a deep-space relay station operator discovers that the distress signal she's been forwarding for six months isn't coming from a stranded ship — it's coming from a planet that was declared lifeless after a failed colonization attempt. Someone survived. And whoever it is has been listening to every transmission she's ever sent.",
  },
  {
    authorName: 'Cole Marlowe',
    authorStyle: 'Raymond Chandler',
    primaryGenre: 'Mystery',
    secondaryGenre1: 'Crime', secondaryGenre2: 'Drama',
    tone: 'Suspenseful',
    wordCount: 4500,
    concept: "A disgraced insurance investigator takes a routine fraud case — a widow claiming her husband drowned on a fishing trip with no body recovered. Three interviews in, he realizes every witness is using the same word to describe the husband: careful. Nobody who knew him believes he drowned. And the investigator is starting to wonder if the husband staged his own death — or if someone staged it for him.",
  },
]

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${msg}`)
}

// ─── Genre instructions ───────────────────────────────────────────────────────
function genreInstructions(genre) {
  const g = genre.toLowerCase()
  if (g.includes('thriller') || g.includes('mystery')) return `GENRE CRAFT — THRILLER/MYSTERY: Open with immediate tension. Layer clues naturally. Build dread slowly. Every scene raises a question. Twist should feel inevitable in hindsight.`
  if (g.includes('western')) return `GENRE CRAFT — WESTERN: Landscape as character. Sparse loaded dialogue. Clear moral stakes. Honor and survival as themes. Explosive action beats.`
  if (g.includes('sci')) return `GENRE CRAFT — SCI-FI: Ground the fantastical in sensory detail. Explore human implications of the technology. Avoid info-dumping. Contrast the vast with the intimate.`
  return `GENRE CRAFT: Open with a compelling hook. Build character through action and dialogue. Create escalating conflict with meaningful stakes.`
}

// ─── Claude script generation ─────────────────────────────────────────────────
async function generateScript(story) {
  log(`  🤖 Calling Claude for "${story.primaryGenre}" story (${story.wordCount} words)...`)
  const genreStr = [story.primaryGenre, story.secondaryGenre1, story.secondaryGenre2].filter(Boolean).join(', ')
  const prompt = `You are an expert audio drama writer working in the style of ${story.authorStyle}.

${genreInstructions(story.primaryGenre)}

**Story Requirements:**
- Concept: ${story.concept}
- Tone: ${story.tone}
- Word Count Target: ${story.wordCount} words (tolerance: ±10%)
- Genres: ${genreStr}
- Author Style: ${story.authorStyle}

**REQUIRED Output Format — follow EXACTLY:**

[TITLE]
A unique, compelling title for the story

[CHARACTER GUIDE]
- NARRATOR (Male, middle-aged, warm British storyteller, authoritative and immersive)
[list every character: - NAME (Gender, Age, voice direction, personality)]

[STORY]
Every line tagged: [CHARACTER NAME]: dialogue or narration

CRITICAL: Every single line MUST start with [CHARACTER NAME]: — no exceptions.
Word count: ${story.wordCount} ±10% words. Write in ${story.authorStyle} style with ${story.tone} tone.
4-8 characters max (including NARRATOR). No untagged prose.

Now write the complete audio drama:`

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      log(`  ⏳ Claude rate limit — waiting ${attempt === 2 ? 20 : 40}s...`)
      await sleep((attempt === 2 ? 20 : 40) * 1000)
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 12000,
        system: 'You are an expert audio drama writer. Always respond with exactly: [TITLE], [CHARACTER GUIDE], [STORY] sections. No preamble.',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      log(`  ✅ Claude done (${data.usage?.output_tokens} tokens, stop: ${data.stop_reason})`)
      return text
    }
    const err = await res.json().catch(() => ({}))
    log(`  ⚠️ Claude attempt ${attempt} failed (${res.status}): ${err?.error?.message || 'unknown'}`)
    if (res.status !== 429 && res.status !== 529) break
  }
  throw new Error('Claude API failed after 3 attempts')
}

// ─── Parse script ─────────────────────────────────────────────────────────────
function parseScript(claudeText) {
  const titleMatch = claudeText.match(/\[TITLE\]\s*\n\s*(.+?)(?:\n|$)/) || claudeText.match(/^#\s*(.+?)(?:\n|$)/m)
  const charMatch = claudeText.match(/\[CHARACTER GUIDE\]\s*\n([\s\S]+?)\[STORY\]/)
  const storyMatch = claudeText.match(/\[STORY\]\s*\n([\s\S]+)/)
  if (!titleMatch || !storyMatch) throw new Error('Claude did not follow required format — missing [TITLE] or [STORY]')
  return {
    title: titleMatch[1].trim(),
    characterGuideRaw: charMatch ? charMatch[1].trim() : '',
    storyScript: storyMatch[1].trim(),
  }
}

// ─── Voice matching ───────────────────────────────────────────────────────────
function parseGender(desc, name = '') {
  const l = desc.toLowerCase()
  if (/^female[,\s]/i.test(l) || l.startsWith('female')) return 'female'
  if (/^male[,\s]/i.test(l) || l.startsWith('male')) return 'male'
  if (/\b\d+f\b/i.test(l) || l.includes('woman') || l.includes('girl')) return 'female'
  if (/\b\d+m\b/i.test(l) || l.includes('man') || l.includes('boy') || l.includes('sheriff') || l.includes('detective')) return 'male'
  if (l.includes('neutral')) return 'neutral'
  const males = new Set(['james','john','robert','michael','william','david','thomas','george','sheriff','deputy','detective','captain','father','james','cole','dale','jack','adam','bill','eric','chris','brian','roger','callum','charlie','harry','liam'])
  const females = new Set(['sarah','sara','maria','lisa','emma','anna','jessica','laura','emily','rachel','alice','lily','nina','bella','matilda','helen','carol','diana','julia','eleanor'])
  const first = name.toLowerCase().split(/\s+/)[0]
  if (males.has(first)) return 'male'
  if (females.has(first)) return 'female'
  return 'unknown'
}

function parseAge(desc) {
  const m = desc.match(/\b(\d{2})\s*[mf]\b/i) || desc.match(/\bage\s*:?\s*(\d+)/i)
  if (m) { const a = parseInt(m[1]); return a < 40 ? 'young' : a < 60 ? 'middle' : 'old' }
  const l = desc.toLowerCase()
  if (l.includes('young') || l.includes('20s') || l.includes('30s')) return 'young'
  if (l.includes('middle') || l.includes('40s') || l.includes('50s')) return 'middle'
  if (l.includes('old') || l.includes('60s') || l.includes('70s') || l.includes('elder')) return 'old'
  return 'unknown'
}

function buildVoiceMap(charGuideRaw) {
  const voiceMap = new Map()
  const used = new Set([BELLE_B_VOICE_ID])
  voiceMap.set('NARRATOR', { voice_id: NARRATOR_VOICE_ID, voice_name: 'George' })
  used.add(NARRATOR_VOICE_ID)

  const lines = charGuideRaw.split('\n').filter(l => l.trim().startsWith('-'))
  for (const line of lines) {
    const m = line.match(/^-\s+([A-Z][A-Z\s\-'\.0-9]*?)(?:\s+\((.+)\))?\s*$/)
    if (!m) continue
    const name = m[1].trim()
    const desc = m[2] || ''
    if (name === 'NARRATOR') continue

    const gender = parseGender(desc, name)
    const age = parseAge(desc)
    const candidates = CURATED_VOICES.filter(v => !used.has(v.voice_id))
    if (!candidates.length) continue

    const scored = candidates.map(v => {
      let s = 0
      if (gender !== 'unknown') s += v.gender === gender ? 100 : (gender === 'neutral' ? 40 : -50)
      const va = v.age.includes('young') ? 'young' : v.age.includes('old') ? 'old' : 'middle'
      if (age !== 'unknown' && va === age) s += 30
      const dl = desc.toLowerCase(), vd = v.desc.toLowerCase()
      if (dl.includes('deep') && (vd.includes('deep') || vd.includes('dominant') || vd.includes('resonant'))) s += 10
      if ((dl.includes('warm') || dl.includes('gentle')) && vd.includes('warm')) s += 10
      if (dl.includes('british') || dl.includes('english')) s += v.accent === 'british' ? 15 : 0
      if (dl.includes('smooth') || dl.includes('trustworthy')) s += (vd.includes('smooth') || vd.includes('trustworthy') ? 10 : 0)
      if (dl.includes('menacing') || dl.includes('cold')) s += (vd.includes('dominant') || vd.includes('firm') ? 10 : 0)
      return { v, s }
    }).sort((a, b) => b.s - a.s)

    const best = scored[0].v
    voiceMap.set(name, { voice_id: best.voice_id, voice_name: best.name })
    used.add(best.voice_id)
    log(`  🎭 Voice: [${name}] (${gender}/${age}) → ${best.name}`)
  }
  return voiceMap
}

// ─── Segment parsing ──────────────────────────────────────────────────────────
function parseSegments(storyText, voiceMap) {
  const segments = []
  let idx = 0, speaker = null, lines = []

  const flush = () => {
    if (!speaker || !lines.length) return
    const text = lines.join(' ').trim()
    if (!text) return
    let vi = voiceMap.get(speaker)
    if (!vi) {
      for (const [k, v] of voiceMap) {
        if (k.includes(speaker) || speaker.includes(k) || k.split(' ').some(w => w.length > 3 && speaker.includes(w))) { vi = v; break }
      }
    }
    if (!vi) vi = { voice_id: NARRATOR_VOICE_ID, voice_name: 'George' }
    const chunks = text.length <= ELEVENLABS_CHUNK_SIZE ? [text] : splitChunks(text, ELEVENLABS_CHUNK_SIZE)
    for (const chunk of chunks) segments.push({ speaker, text: chunk, voiceId: vi.voice_id, index: idx++ })
    lines = []; speaker = null
  }

  for (const line of storyText.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const m = t.match(/^\[([A-Z][A-Z\s\-'\.\d]*)\]:\s*(.*)/)
    if (m) {
      if (m[1] !== speaker) flush()
      speaker = m[1].trim()
      if (m[2].trim()) lines.push(m[2].trim())
    } else if (speaker) {
      lines.push(t)
    } else {
      speaker = 'NARRATOR'; lines.push(t)
    }
  }
  flush()
  return segments.length ? segments : [{ speaker: 'NARRATOR', text: storyText.trim(), voiceId: NARRATOR_VOICE_ID, index: 0 }]
}

function splitChunks(text, max) {
  const chunks = []
  let rem = text
  while (rem.length > 0) {
    if (rem.length <= max) { chunks.push(rem); break }
    let at = rem.lastIndexOf('. ', max)
    if (at === -1 || at < max / 2) at = rem.lastIndexOf(' ', max)
    if (at === -1) at = max
    chunks.push(rem.slice(0, at + 1).trim())
    rem = rem.slice(at + 1).trim()
  }
  return chunks
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────────
async function genAudio(text, voiceId) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    const err = await res.text()
    if (attempt < 3 && (res.status === 429 || res.status === 503)) { await sleep(5000); continue }
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 200)}`)
  }
}

// ─── Supabase upload ──────────────────────────────────────────────────────────
async function uploadAudio(buf, storagePath) {
  const { error } = await supabase.storage.from('audio').upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Supabase upload (${storagePath}): ${error.message}`)
  return `${SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
}

// ─── DALL-E cover ─────────────────────────────────────────────────────────────
async function generateCover(title, genre, tone, concept) {
  const toneDesc = tone ? ` with a ${tone.toLowerCase()} atmosphere` : ''
  // For action/crime/western genres, skip concept to avoid DALL-E safety rejections
  const safeGenres = ['romance', 'drama', 'sci-fi', 'science fiction', 'family', 'comedy', 'adventure']
  const genreLower = genre.toLowerCase()
  const useConcept = safeGenres.some(g => genreLower.includes(g))
  const sceneHint = useConcept && concept
    ? `Setting and atmosphere inspired by: ${concept.slice(0, 150)}. `
    : ''
  const prompt = `A dramatic atmospheric background image for an audiobook cover. Genre: ${genre}${toneDesc}. ${sceneHint}Square format, fills entire canvas. Cinematic lighting, professional composition. Main subject centered or in upper half. Bottom-right corner must be naturally dark or shadowy. IMPORTANT: absolutely no text, words, letters, or numbers anywhere in the image. Pure atmospheric visual scene only.`

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt: prompt.slice(0, 4000), n: 1, size: '1024x1024', quality: 'hd', response_format: 'url' }),
  })
  if (!res.ok) { const e = await res.text(); throw new Error(`DALL-E: ${res.status} ${e.slice(0,200)}`) }
  const data = await res.json()
  const url = data.data?.[0]?.url
  if (!url) throw new Error('DALL-E returned no URL')
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error(`Download DALL-E image: ${imgRes.status}`)
  return Buffer.from(await imgRes.arrayBuffer())
}

// ─── Cover overlay (title + author) ──────────────────────────────────────────
async function overlayTextOnCover(rawBuf, title, authorName) {
  const sharp = require('sharp')
  const size = 1024

  // Pill badge constants (same as route.ts)
  const pillW = 220, pillH = 64, pillR = 32, pillMargin = 20
  const pillX = size - pillW - pillMargin
  const pillY = size - pillH - pillMargin

  const words = title.toUpperCase().split(' ')
  const lines = []
  let current = ''
  for (const w of words) {
    const test = current ? `${current} ${w}` : w
    if (test.length <= 18) { current = test } else { if (current) lines.push(current); current = w }
  }
  if (current) lines.push(current)

  const titleFontSize = lines.length > 2 ? 72 : 86
  const lineHeight = titleFontSize + 10
  const safeBottomY = pillY - 30
  const titleY = safeBottomY - (lines.length - 1) * lineHeight

  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const titleSvg = lines.map((l, i) =>
    `<text x="512" y="${titleY + i * lineHeight}" font-family="Georgia, serif" font-size="${titleFontSize}" font-weight="bold" fill="white" text-anchor="middle" filter="url(#shadow)">${esc(l)}</text>`
  ).join('\n')

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow"><feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.8"/></filter>
      <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="black" stop-opacity="0"/><stop offset="100%" stop-color="black" stop-opacity="0.75"/></linearGradient>
      <radialGradient id="pillGrad" cx="100%" cy="100%" r="30%"><stop offset="0%" stop-color="black" stop-opacity="0.7"/><stop offset="100%" stop-color="black" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${size}" height="300" y="${size - 300}" fill="url(#grad)"/>
    <rect x="${size - 300}" y="${size - 200}" width="300" height="200" fill="url(#pillGrad)"/>
    <rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillR}" ry="${pillR}" fill="black" fill-opacity="0.45"/>
    ${titleSvg}
    <text x="512" y="${titleY + lines.length * lineHeight + 28}" font-family="Georgia, serif" font-size="28" fill="#d4a843" text-anchor="middle" filter="url(#shadow)">${esc(authorName.toUpperCase())}</text>
  </svg>`

  return sharp(rawBuf).resize(size, size, { fit: 'cover' }).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 85 }).toBuffer()
}

// ─── Music library fallback ───────────────────────────────────────────────────
function libraryMusic(genre, tone) {
  const g = genre.toLowerCase()
  if (g.includes('horror')) return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/hollow-crown-of-cinders.mp3'
  if (g.includes('sci')) return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/cosmic-bloom.mp3'
  if (g.includes('western')) return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/dust-trail-omen.mp3'
  if (g.includes('drama')) return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/heartbeats-between-chapters.mp3'
  return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/midnight-red-5th-avenue.mp3'
}

// ─── Belle B intro/outro ──────────────────────────────────────────────────────
function buildIntroText(title, authorName, concept) {
  const base = (concept || '').trim()
  const hook = base ? base.split('.')[0].trim() + '.' : ''
  return `Welcome to Endless Tales.\n\nToday's story: "${title}" by ${authorName}.\n\n${hook}\n\nLet's begin.`
}

function buildOutroText(title, authorName) {
  return `You've been listening to "${title}" by ${authorName}.\n\nAll subscriptions are unlimited. Endless Tales does not use credits.\n\nWe'll see you next time on Endless Tales.`
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Main story pipeline ──────────────────────────────────────────────────────
async function processStory(story, idx) {
  log(`\n${'═'.repeat(60)}`)
  log(`📖 Story ${idx + 1}/4 — ${story.primaryGenre} by ${story.authorName}`)
  log(`${'═'.repeat(60)}`)

  const storyId = crypto.randomUUID()
  const storageFolderId = crypto.randomUUID()

  // Step 1: Claude script
  const claudeText = await generateScript(story)
  const { title, characterGuideRaw, storyScript } = parseScript(claudeText)
  const wordCount = storyScript.split(/\s+/).length
  log(`  📝 Title: "${title}" (${wordCount} words)`)

  // Step 2: Voice matching
  const voiceMap = buildVoiceMap(characterGuideRaw)

  // Step 3: Parse segments
  const segments = parseSegments(storyScript, voiceMap)
  log(`  🎭 ${segments.length} audio segments to generate`)

  // Step 4: Generate audio segments with ElevenLabs
  log(`  🎙️ Generating ${segments.length} voice segments...`)
  const segmentUrls = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (i % 5 === 0) log(`     Segment ${i + 1}/${segments.length} [${seg.speaker}]...`)
    const audioBuf = await genAudio(seg.text, seg.voiceId)
    const segPath = `asc3/${storageFolderId}/segment_${String(i).padStart(3, '0')}.mp3`
    const url = await uploadAudio(audioBuf, segPath)
    segmentUrls.push({ speaker: seg.speaker, text_preview: seg.text.slice(0, 80), audioUrl: url, index: i })
    await sleep(200) // gentle rate limiting
  }
  log(`  ✅ All ${segments.length} segments generated`)

  // Step 5: Concatenate story audio URL (for render script, use first segment as story_audio_url)
  const storyAudioUrl = segmentUrls[0]?.audioUrl || null

  // Step 6: Belle B intro/outro
  log(`  🎤 Generating Belle B intro...`)
  const introText = buildIntroText(title, story.authorName, story.concept)
  const outroText = buildOutroText(title, story.authorName)
  const introBuf = await genAudio(introText, BELLE_B_VOICE_ID)
  const outroBuf = await genAudio(outroText, BELLE_B_VOICE_ID)
  const introUrl = await uploadAudio(introBuf, `asc3/${storageFolderId}/intro.mp3`)
  const outroUrl = await uploadAudio(outroBuf, `asc3/${storageFolderId}/outro.mp3`)
  log(`  ✅ Intro + outro audio ready`)

  // Step 7: DALL-E cover
  log(`  🎨 Generating DALL-E 3 cover...`)
  let coverUrl = null
  try {
    const rawCover = await generateCover(title, story.primaryGenre, story.tone, story.concept)
    const overlaidCover = await overlayTextOnCover(rawCover, title, story.authorName)
    coverUrl = await uploadAudio(overlaidCover, `asc3/${storageFolderId}/cover.jpg`)
    log(`  ✅ Cover generated`)
  } catch (e) {
    log(`  ⚠️ Cover failed: ${e.message} — continuing without cover`)
  }

  // Step 8: Background music (library)
  const backgroundMusicUrl = libraryMusic(story.primaryGenre, story.tone)
  log(`  🎵 Background music: library track (${story.primaryGenre})`)

  // Step 9: Save to DB
  log(`  💾 Saving to Supabase...`)
  const durationMins = Math.round(wordCount / 150)
  const durationLabel = durationMins >= 60
    ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
    : `${durationMins} min`

  const { error: dbErr } = await supabase.from('stories').insert([{
    id: storyId,
    title,
    author: story.authorName,
    genre: story.primaryGenre,
    primary_genre: story.primaryGenre,
    description: story.concept.slice(0, 500),
    word_count: wordCount,
    duration_mins: durationMins,
    duration_label: durationLabel,
    status: 'pending',
    is_hidden: false,
    is_new: true,
    is_featured: false,
    play_count: 0,
    credits: 0,
    source_tool: 'ASC3',
    asc_version: '3',
    intro_text: introText,
    outro_text: outroText,
    intro_audio_url: introUrl,
    outro_audio_url: outroUrl,
    story_audio_url: storyAudioUrl,
    background_music_url: backgroundMusicUrl,
    cover_image_url: coverUrl,
    cover_url: coverUrl,   // library page filters on cover_url specifically
  }])
  if (dbErr) throw new Error(`DB insert: ${dbErr.message}`)
  log(`  ✅ Saved to DB (ID: ${storyId})`)

  // Step 10: Render final mix
  log(`  🎛️  Rendering final mix...`)
  try {
    execSync(`node ${path.join(__dirname, 'voice-only-render.js')} ${storyId}`, {
      stdio: 'pipe', timeout: 300000, cwd: path.join(__dirname, '..'), env: { ...process.env },
    })
    log(`  ✅ Render complete`)
  } catch (e) {
    const msg = (e.stderr?.toString() || e.message).slice(0, 300)
    log(`  ⚠️ Render warning: ${msg}`)
    log(`  Continuing to publish (can re-render later)...`)
  }

  // Step 11: Publish
  log(`  🚀 Publishing "${title}"...`)
  const { error: pubErr } = await supabase.from('stories').update({
    status: 'published', is_hidden: false, published_on: new Date().toISOString(),
  }).eq('id', storyId)
  if (pubErr) throw new Error(`Publish: ${pubErr.message}`)
  log(`  ✅ PUBLISHED: "${title}"`)

  return { storyId, title }
}

// ─── Batch runner ─────────────────────────────────────────────────────────────
async function main() {
  log('🚀 Batch generation — 4 stories — direct API mode')
  log(`   No HTTP timeouts. Calling Claude, ElevenLabs, DALL-E, Supabase directly.\n`)

  const results = []
  for (let i = 0; i < STORIES.length; i++) {
    try {
      const { storyId, title } = await processStory(STORIES[i], i)
      results.push({ ok: true, title, storyId })
    } catch (e) {
      log(`\n❌ Story ${i + 1} FAILED: ${e.message}`)
      results.push({ ok: false, label: STORIES[i].concept.slice(0, 50), error: e.message })
    }
  }

  log(`\n${'═'.repeat(60)}`)
  log('📊 FINAL RESULTS:')
  log('═'.repeat(60))
  results.forEach((r, i) => {
    if (r.ok) log(`  Story ${i + 1}: ✅ PUBLISHED — "${r.title}" (${r.storyId})`)
    else       log(`  Story ${i + 1}: ❌ FAILED  — ${r.label} :: ${r.error}`)
  })
  const n = results.filter(r => r.ok).length
  log(`\n🎉 ${n}/${STORIES.length} stories published to the app.`)
  log('═'.repeat(60))
}

main().catch(e => { log(`\n💥 Fatal: ${e.message}`); process.exit(1) })
