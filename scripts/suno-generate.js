#!/usr/bin/env node
/**
 * suno-generate.js <prompt> <title> <storyId>
 * Uses Playwright to generate music via Suno's web UI,
 * waits for completion, uploads to Supabase Storage,
 * returns the public URL.
 */

const { chromium } = require('playwright')
const { execSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')
const os = require('os')
const path = require('path')
const fs = require('fs')

require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

const FIREFOX_PROFILE = 'dktuucuj.default-release'
const COOKIES_DB = path.join(os.homedir(), `Library/Application Support/Firefox/Profiles/${FIREFOX_PROFILE}/cookies.sqlite`)
const COOKIES_TMP = '/tmp/suno_generate_cookies.sqlite'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function loadFirefoxCookies(ctx) {
  fs.copyFileSync(COOKIES_DB, COOKIES_TMP)
  const rows = execSync(`sqlite3 "${COOKIES_TMP}" "SELECT name,value,host,path,isSecure,isHttpOnly FROM moz_cookies WHERE host LIKE '%suno%';"`, { encoding: 'utf8' })
  let count = 0
  for (const line of rows.split('\n')) {
    if (!line.trim()) continue
    const [name, value, host, cookiePath, isSecure, isHttpOnly] = line.split('|')
    if (!name || !value) continue
    try {
      await ctx.addCookies([{ name, value, domain: host, path: cookiePath || '/', secure: isSecure === '1', httpOnly: isHttpOnly === '1', sameSite: 'None' }])
      count++
    } catch (e) { /* skip invalid */ }
  }
  return count
}

async function generateSunoTrack(prompt, title, storyId) {
  const cleanPrompt = prompt
    .replace(/\b(vocal|vocals|singing|singer|lyrics|with lyrics|song|voice)\b/gi, '')
    .trim() + ', instrumental only, no vocals, no lyrics'

  console.log(`🎵 Generating Suno track for story ${storyId}`)
  console.log(`📝 Prompt: ${cleanPrompt.slice(0, 80)}...`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process', '--no-sandbox'],
  })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const cookieCount = await loadFirefoxCookies(ctx)
  console.log(`🍪 Loaded ${cookieCount} cookies`)

  const page = await ctx.newPage()
  let capturedAudioUrl = null
  let capturedClipId = null

  // Watch feed responses for completed clips
  page.on('response', async (resp) => {
    if (!resp.url().includes('/api/feed') || resp.status() !== 200) return
    try {
      const data = await resp.json()
      const clips = Array.isArray(data) ? data : (data.clips || [])
      for (const clip of clips) {
        if (clip.audio_url && clip.status === 'complete' && !capturedAudioUrl) {
          // Only capture clips generated in this session (recent)
          const createdAt = new Date(clip.created_at).getTime()
          const twoMinsAgo = Date.now() - 2 * 60 * 1000
          if (createdAt > twoMinsAgo) {
            capturedAudioUrl = clip.audio_url
            capturedClipId = clip.id
            console.log(`✅ Track complete: ${clip.title || clip.id}`)
          }
        }
      }
    } catch (e) { /* not JSON */ }
  })

  // Navigate to suno.com to establish authenticated context
  await page.goto('https://suno.com', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Call Suno API directly from browser JS context — auth cookies are already set
  console.log('🎵 Calling Suno API from browser context...')
  const genResult = await page.evaluate(async (prompt) => {
    try {
      // Get session token from Clerk
      const sessionRes = await fetch('https://studio-api.prod.suno.com/api/session', {
        credentials: 'include',
      })
      const sessionData = await sessionRes.json()
      const userId = sessionData?.user?.id

      // Generate music
      const res = await fetch('https://studio-api.prod.suno.com/api/generate/v2/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          mv: 'chirp-v3-5',
          title: 'Background Music',
          tags: 'instrumental cinematic atmospheric',
          make_instrumental: true,
          wait_audio: false,
        }),
      })
      const text = await res.text()
      return { status: res.status, body: text.slice(0, 500), userId }
    } catch (e) {
      return { error: String(e) }
    }
  }, cleanPrompt)

  console.log('Generate result:', JSON.stringify(genResult))

  if (!genResult || genResult.error || genResult.status >= 400) {
    throw new Error(`Suno browser API failed: ${JSON.stringify(genResult)}`)
  }

  // Parse clip IDs
  const genData = JSON.parse(genResult.body)
  const clipIds = (genData.clips || []).map((c) => c.id)
  if (!clipIds.length) throw new Error('No clip IDs returned from Suno')
  console.log(`⏳ Waiting for ${clipIds.length} clips: ${clipIds.join(', ')}`)

  // Poll via browser fetch (auth cookies still active)
  let audioUrl = null
  const idsParam = clipIds.join('%2C')
  for (let attempt = 0; attempt < 48; attempt++) {
    await page.waitForTimeout(5000)
    process.stdout.write(`\r⏳ Polling... ${(attempt + 1) * 5}s`)

    const pollResult = await page.evaluate(async (ids) => {
      try {
        const res = await fetch(`https://studio-api.prod.suno.com/api/feed/?ids=${ids}`, {
          credentials: 'include',
        })
        return await res.json()
      } catch (e) { return null }
    }, idsParam)

    if (Array.isArray(pollResult)) {
      const ready = pollResult.filter((c) => c.audio_url && c.status === 'complete')
      if (ready.length > 0) {
        audioUrl = ready[0].audio_url
        console.log(`\n✅ Track ready: ${ready[0].title || ready[0].id}`)
        break
      }
    }
  }
  console.log('')

  await browser.close()

  if (!audioUrl) {
    throw new Error('Suno generation timed out after 4 minutes')
  }
  // using audioUrl

  // Download the track
  console.log('⬇️ Downloading track...')
  const dlRes = await fetch(audioUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`)
  const audioBuffer = await dlRes.arrayBuffer()

  // Upload to Supabase
  const storagePath = `asc3/${storyId}/background_music.mp3`
  console.log(`⬆️ Uploading to ${storagePath}...`)
  const { error: uploadErr } = await supabase.storage
    .from('audio')
    .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
  console.log(`✅ Done! URL: ${publicUrl}`)
  return publicUrl
}

// CLI usage
const [,, prompt, title, storyId] = process.argv
if (!prompt || !storyId) {
  console.error('Usage: node suno-generate.js <prompt> <title> <storyId>')
  process.exit(1)
}

generateSunoTrack(prompt, title || 'Background Music', storyId)
  .then(url => { console.log('RESULT_URL:' + url); process.exit(0) })
  .catch(err => { console.error('ERROR:', err.message); process.exit(1) })
