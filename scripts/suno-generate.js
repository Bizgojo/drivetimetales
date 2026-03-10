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

  const browser = await chromium.launch({ headless: true })
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

  await page.goto('https://suno.com/create', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Click Instrumental button to switch to instrumental mode
  await page.getByRole('button', { name: 'Instrumental' }).click().catch(() => {
    console.log('⚠️ Instrumental button not found, trying alternative...')
  })
  await page.waitForTimeout(500)

  // Fill in the description field
  const descInput = page.getByPlaceholder('Describe the sound you want')
  await descInput.fill(cleanPrompt)
  await page.waitForTimeout(500)

  // Click Create
  await page.getByRole('button', { name: 'Create' }).first().click()
  console.log('🎵 Generation started, waiting up to 4 minutes...')

  // Poll for completion (max 4 min)
  const startTime = Date.now()
  while (!capturedAudioUrl && Date.now() - startTime < 240000) {
    await page.waitForTimeout(5000)
    const elapsed = Math.round((Date.now() - startTime) / 1000)
    process.stdout.write(`\r⏳ Waiting... ${elapsed}s`)
  }
  console.log('')

  await browser.close()

  if (!capturedAudioUrl) {
    throw new Error('Suno generation timed out or no audio URL captured')
  }

  // Download the track
  console.log('⬇️ Downloading track...')
  const dlRes = await fetch(capturedAudioUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
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
