#!/usr/bin/env node
// Autonomous story pipeline — runs both stories end-to-end and publishes them
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const BASE = 'http://localhost:3000'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

const stories = [
  {
    label: 'Story 1 — Horror/Mystery',
    payload: {
      primaryGenre: 'Horror',
      secondaryGenre1: 'Mystery',
      secondaryGenre2: 'Supernatural',
      duration: '20',
      wordCount: 3000,
      concept: 'A documentary crew travels to a forgotten mining town in West Virginia where an entire population vanished overnight in 1931. While filming underground tunnels, they begin hearing voices calling their names from deep inside the abandoned mine.',
      tone: 'Dark',
      authorName: 'Elias Thorn',
      authorStyle: 'H.P. Lovecraft',
      authorTechniques: 'Cosmic dread and atmospheric horror; slow revelation of unknowable evil; unreliable narrators whose sanity erodes; archaic, dense prose that builds mounting unease; horror implied through suggestion rather than explicit description; the insignificance of humanity against vast ancient forces; documents, journals, and found footage as narrative devices',
      audioAdaptation: 'Use long pauses and silences for dread; let characters speak in hushed terrified tones; ambient sound descriptions should evoke the underground space; voices from the mine should be described with eerie calm that makes them more disturbing',
      model: 'claude-sonnet-4-6',
    }
  },
  {
    label: 'Story 2 — Uplifting/Drama',
    payload: {
      primaryGenre: 'Uplifting',
      secondaryGenre1: 'Drama',
      secondaryGenre2: 'Mystery',
      duration: '15',
      wordCount: 2250,
      concept: 'After a widowed bus driver finds a lost backpack filled with handwritten letters addressed to strangers, he begins delivering them one by one. Each letter changes a life, but the final message reveals the identity of the person who needed saving the most.',
      tone: 'Warm',
      authorName: 'Clara Bennett',
      authorStyle: 'Mitch Albom',
      authorTechniques: 'Emotional resonance through small meaningful moments; simple accessible language that carries profound weight; multiple perspectives revealing interconnected lives; themes of love, loss, redemption, and second chances; sentimentality balanced with honest human truth; lessons revealed gently through story not lecture; the extraordinary hidden in the ordinary',
      audioAdaptation: 'Warm conversational narration; characters should feel like real everyday people; emotional moments given space to breathe; gentle pacing that allows listeners to feel each revelation; the bus driver\'s internal monologue should be quietly philosophical',
      model: 'claude-sonnet-4-6',
    }
  }
]

async function generateAndPublish(story) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🎬 Starting: ${story.label}`)
  console.log(`${'='.repeat(60)}`)

  // Generate
  console.log('📝 Calling generate-story-complete...')
  const genStart = Date.now()
  let genData
  try {
    const res = await fetch(`${BASE}/api/asc3/generate-story-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(story.payload),
      signal: AbortSignal.timeout(600000) // 10 min timeout
    })
    genData = await res.json()
  } catch (e) {
    console.error(`❌ Generation failed: ${e.message}`)
    return false
  }

  if (!genData.success) {
    console.error(`❌ Generation error: ${genData.error}`)
    return false
  }

  const storyId = genData.data?.storyId
  const title = genData.data?.title
  console.log(`✅ Generated: "${title}" (${genData.data?.wordCount} words) in ${Math.round((Date.now()-genStart)/1000)}s`)
  console.log(`   ID: ${storyId}`)

  // Generate Suno music
  console.log('🎵 Generating Suno background music...')
  try {
    const sunoRes = await fetch(`${BASE}/api/asc3/generate-music`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, sunoPrompt: genData.data?.sunoPrompt, title }),
      signal: AbortSignal.timeout(300000) // 5 min timeout
    })
    const sunoData = await sunoRes.json()
    if (sunoData.success) console.log(`✅ Music: ${sunoData.musicUrl?.split('/').pop()}`)
    else console.log(`⚠️ Music failed (will use library track): ${sunoData.error}`)
  } catch (e) {
    console.log(`⚠️ Music timeout — using library track`)
  }

  // Publish
  console.log('📤 Publishing...')
  try {
    const pubRes = await fetch(`${BASE}/api/asc3/publish-story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, destinations: ['app'] })
    })
    const pubData = await pubRes.json()
    if (pubData.success) console.log(`🚀 PUBLISHED: "${title}"`)
    else console.error(`❌ Publish failed: ${pubData.error}`)
  } catch (e) {
    console.error(`❌ Publish error: ${e.message}`)
  }

  return true
}

;(async () => {
  console.log('🎙️ Endless Tales — Autonomous Story Pipeline')
  console.log(`Running ${stories.length} stories...\n`)

  for (const story of stories) {
    await generateAndPublish(story)
    if (stories.indexOf(story) < stories.length - 1) {
      console.log('\n⏳ Waiting 30s before next story (rate limit buffer)...')
      await sleep(30000)
    }
  }

  console.log('\n✅ All stories complete. Check the app!')
})()
