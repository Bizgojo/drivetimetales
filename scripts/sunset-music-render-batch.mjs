/**
 * Sunset 22-Episode Music Generation + Render Batch
 * 
 * For each episode:
 * 1. Generate background_music.mp3 via /api/asc3/generate-music
 * 2. Save existing audio_url (must not change)
 * 3. Render via /api/asc3/render-final-mix
 * 4. Restore audio_url to original value
 * 5. Whisper check on last 30s
 * 
 * EP15 UUID is invalid — will be skipped and flagged.
 */

import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const execFileAsync = promisify(execFile)

const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'
const BASE_URL = 'http://localhost:3000'
const FFMPEG = '/opt/homebrew/bin/ffmpeg'
const FFPROBE = '/opt/homebrew/bin/ffprobe'
const PROGRESS_LOG = '/Users/williampostlewaite/.openclaw/workspace-orion/sunset-music-render-22-progress.log'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Whisper pass keywords (case-insensitive)
const OUTRO_KEYWORDS = ['endless tales', 'belle', 'listen', 'story', 'episode', 'competition', 'hear']
const OUTRO_MIN_WORDS = 5

const EPISODES = [
  { ep: 1,  id: '000babe9-8466-4170-89ca-4391757f56c7' },
  { ep: 2,  id: '60fce080-ae81-4b13-91f2-41899a8dc025' },
  { ep: 3,  id: '54136991-4353-41cd-a9db-16b405ab7fdd' },
  { ep: 4,  id: '1582a8bd-78ee-47da-8c13-2aff64cc6c45' },
  { ep: 5,  id: '21715177-36e3-4987-86c3-99f07d2f4109' },
  { ep: 6,  id: 'f5d2ffbb-f64e-4060-ab72-acc67024df42' },
  { ep: 7,  id: 'efbd0bcf-4ac0-4d3b-b13a-330692867b52' },
  { ep: 11, id: '8aa51469-fc6d-4715-816e-66ba053dd625' },
  { ep: 12, id: 'd97c76b7-ff17-4564-bebf-47cf0ac14476' },
  { ep: 13, id: 'f5c26bcd-aed8-4b5d-93dd-47d2a7386e8d' },
  { ep: 14, id: '7befd6fe-b87f-4b6f-9b54-58d58d3c0d24' },
  // EP15: INVALID UUID b7bdc826-7432-49d3-9c06-163eded4e0286 — SKIPPED
  { ep: 16, id: '566d908b-d43d-437a-8fd8-2da9e1b1c895' },
  { ep: 17, id: 'e93268f4-8bc8-4bbf-8785-48a032414ccc' },
  { ep: 18, id: '5b0a9e43-e1bf-4fec-bbcf-56ae82573f4f' },
  { ep: 19, id: 'f3cad7bf-9ff1-4a0b-b010-4299185c08cf' },
  { ep: 20, id: 'ad827249-9c40-41c8-b2e5-d73b9f6f5096' },
  { ep: 21, id: 'cc65ed63-34f8-4fa1-87ec-2511342b2cfc' },
  { ep: 22, id: '0fcce7d0-29b2-4d15-b761-1cdbe6994d24' },
  { ep: 23, id: '1adc1ff4-73d6-4bd3-a378-c8aa22529b86' },
  { ep: 24, id: '60fd3fb0-5653-4986-b979-b57fb65bfc15' },
  { ep: 25, id: 'bb9160c8-86e6-4e4f-8918-c1f7f8271af7' },
]

function extractHeader(script, key) {
  const m = script.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m?.[1]?.trim() || ''
}

function musicPromptFor(script, title, genre) {
  const prompt = extractHeader(script, 'SUNO PROMPT') || extractHeader(script, 'SUNO_PROMPT')
  if (prompt) return prompt
  const genrePart = genre || 'cinematic audio drama'
  return `Cinematic ${genrePart} instrumental score for ${title || 'this story'}. Atmospheric, emotionally specific, no vocals.`
}

async function appendLog(line) {
  const ts = new Date().toISOString()
  const logLine = `${line} | ${ts}\n`
  await fs.appendFile(PROGRESS_LOG, logLine).catch(() => {})
  console.log(logLine.trim())
}

async function generateMusic(ep, storyId) {
  // Get story data for prompt
  const { data: story } = await supabase.from('stories').select('id,title,genre,script,background_music_url').eq('id', storyId).single()
  if (!story) throw new Error(`Story not found: ${storyId}`)
  if (!story.script) throw new Error(`Script missing for ${storyId}`)

  // Check if music already exists in storage
  const { data: files } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
  const fileNames = (files || []).map(f => f.name)
  if (fileNames.includes('background_music.mp3')) {
    console.log(`EP${ep}: background_music.mp3 already in storage — skipping generation`)
    return { skipped: true, url: story.background_music_url }
  }

  const prompt = musicPromptFor(story.script, story.title || '', story.genre || '')
  console.log(`EP${ep}: Generating music with prompt: ${prompt.slice(0, 80)}...`)

  // Call generate-music API (polls for up to 5 min internally)
  const resp = await fetch(`${BASE_URL}/api/asc3/generate-music`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, prompt }),
    signal: AbortSignal.timeout(360_000), // 6 min timeout
  })

  const result = await resp.json()
  if (!resp.ok || !result.success) {
    throw new Error(`Music generation failed: ${JSON.stringify(result)}`)
  }

  return { skipped: false, url: result.url }
}

async function renderFinalMix(ep, storyId) {
  // Save current audio_url BEFORE render (we'll restore after)
  const { data: storyBefore } = await supabase.from('stories').select('audio_url,story_audio_url,duration_mins').eq('id', storyId).single()
  const savedAudioUrl = storyBefore?.audio_url || null
  const savedStoryAudioUrl = storyBefore?.story_audio_url || null
  const savedDurationMins = storyBefore?.duration_mins || null

  console.log(`EP${ep}: Rendering final mix (saved audio_url=${savedAudioUrl ? 'SET' : 'NULL'})`)

  const resp = await fetch(`${BASE_URL}/api/asc3/render-final-mix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId }),
    signal: AbortSignal.timeout(600_000), // 10 min timeout
  })

  const result = await resp.json()
  
  // Restore audio_url regardless of outcome
  const restoreData = {}
  if (savedAudioUrl !== null) restoreData.audio_url = savedAudioUrl
  if (savedStoryAudioUrl !== null) restoreData.story_audio_url = savedStoryAudioUrl
  if (savedDurationMins !== null) restoreData.duration_mins = savedDurationMins
  
  if (Object.keys(restoreData).length > 0) {
    const { error: restoreErr } = await supabase.from('stories').update(restoreData).eq('id', storyId)
    if (restoreErr) {
      console.error(`EP${ep}: WARNING — failed to restore audio_url: ${restoreErr.message}`)
    } else {
      console.log(`EP${ep}: ✅ audio_url restored to original value`)
    }
  }

  if (!resp.ok || !result.success) {
    throw new Error(`Render failed: ${JSON.stringify(result).slice(0, 300)}`)
  }

  return result
}

async function getDuration(url) {
  // Download file temporarily
  const tmpFile = path.join(os.tmpdir(), `ep-duration-${Date.now()}.mp3`)
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`Download failed: ${r.status}`)
    await fs.writeFile(tmpFile, Buffer.from(await r.arrayBuffer()))
    
    const { stdout } = await execFileAsync(FFPROBE, [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      tmpFile
    ])
    return { durationSecs: parseFloat(stdout.trim()), tmpFile }
  } catch (err) {
    await fs.unlink(tmpFile).catch(() => {})
    throw err
  }
}

async function whisperCheck(ep, storyId, finalMixUrl) {
  const tmpMp3 = path.join(os.tmpdir(), `ep${ep}-final-mix-${Date.now()}.mp3`)
  const tmpWav = path.join(os.tmpdir(), `outro_ep${ep}_${Date.now()}.wav`)
  
  try {
    // Download final_mix.mp3
    console.log(`EP${ep}: Downloading final_mix.mp3 for whisper check...`)
    const r = await fetch(finalMixUrl)
    if (!r.ok) throw new Error(`Download failed: ${r.status}`)
    await fs.writeFile(tmpMp3, Buffer.from(await r.arrayBuffer()))

    // Get duration
    const { stdout: durOut } = await execFileAsync(FFPROBE, [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      tmpMp3
    ])
    const durationSecs = parseFloat(durOut.trim())
    const startSecs = Math.max(0, durationSecs - 30)
    
    console.log(`EP${ep}: Duration=${durationSecs.toFixed(1)}s, extracting last 30s from ${startSecs.toFixed(1)}s`)
    
    // Extract last 30s as WAV for whisper
    await execFileAsync(FFMPEG, [
      '-i', tmpMp3,
      '-ss', String(startSecs),
      '-t', '30',
      '-ar', '16000',
      '-ac', '1',
      '-y', tmpWav
    ])

    // Run whisper
    const whisperDir = path.dirname(tmpWav)
    let transcript = ''
    try {
      const { stdout: wOut, stderr: wErr } = await execFileAsync('whisper', [
        tmpWav,
        '--model', 'base',
        '--language', 'en',
        '--output_format', 'txt',
        '--output_dir', whisperDir
      ], { timeout: 120_000 })
      
      // Read the output file
      const wavBase = path.basename(tmpWav, '.wav')
      const txtFile = path.join(whisperDir, `${wavBase}.txt`)
      try {
        transcript = (await fs.readFile(txtFile, 'utf-8')).trim()
        await fs.unlink(txtFile).catch(() => {})
      } catch {
        transcript = (wOut || '').trim()
      }
    } catch (whisperErr) {
      // Try python3 -m whisper as fallback
      console.log(`EP${ep}: whisper CLI failed, trying python3 -m whisper`)
      const { stdout: wOut2 } = await execFileAsync('python3', [
        '-m', 'whisper',
        tmpWav,
        '--model', 'base',
        '--language', 'en',
        '--output_format', 'txt',
        '--output_dir', whisperDir
      ], { timeout: 120_000 })
      
      const wavBase = path.basename(tmpWav, '.wav')
      const txtFile = path.join(whisperDir, `${wavBase}.txt`)
      try {
        transcript = (await fs.readFile(txtFile, 'utf-8')).trim()
        await fs.unlink(txtFile).catch(() => {})
      } catch {
        transcript = (wOut2 || '').trim()
      }
    }

    console.log(`EP${ep}: Whisper transcript: "${transcript.slice(0, 200)}"`)

    // Evaluate pass/fail
    const words = transcript.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean)
    const wordCount = words.length
    const lowerTranscript = transcript.toLowerCase()
    
    // Fail if empty or only music tokens
    const onlyMusicTokens = /^[\[\]♪\s]*$/.test(transcript) || 
                             transcript.replace(/\[Music\]/gi, '').replace(/♪/g, '').trim() === ''
    
    const hasKeyword = OUTRO_KEYWORDS.some(kw => lowerTranscript.includes(kw))
    
    const pass = !onlyMusicTokens && wordCount >= OUTRO_MIN_WORDS && hasKeyword
    
    return { pass, transcript, wordCount, durationSecs }
  } finally {
    await fs.unlink(tmpMp3).catch(() => {})
    await fs.unlink(tmpWav).catch(() => {})
  }
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}m ${s}s`
}

async function processEpisode(epInfo, results) {
  const { ep, id: storyId } = epInfo
  const startTime = Date.now()
  
  let musicStatus = '❌'
  let renderStatus = '❌'
  let outroStatus = '❌ FAIL'
  let durationStr = 'unknown'
  let outroTranscript = ''
  let haltBatch = false
  
  try {
    // Step 1: Generate music
    console.log(`\n===== EP${ep} (${storyId.slice(0,8)}) — Step 1: Generate Music =====`)
    const musicResult = await generateMusic(ep, storyId)
    musicStatus = '✅'
    const skippedMusic = musicResult.skipped ? ' (existed)' : ' (generated)'
    
    // Step 2: Render
    console.log(`\n===== EP${ep} — Step 2: Render Final Mix =====`)
    const renderResult = await renderFinalMix(ep, storyId)
    renderStatus = '✅'
    
    // Get final mix URL from storage
    const storagePath = `asc3/${storyId}/final_mix.mp3`
    const finalMixUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
    
    // Step 3: Whisper check
    console.log(`\n===== EP${ep} — Step 3: Whisper Outro Check =====`)
    const whisperResult = await whisperCheck(ep, storyId, finalMixUrl)
    outroTranscript = whisperResult.transcript
    
    if (whisperResult.durationSecs) {
      durationStr = formatDuration(whisperResult.durationSecs)
    }
    
    if (whisperResult.pass) {
      outroStatus = `✅ PASS`
    } else {
      outroStatus = `❌ FAIL`
      haltBatch = true
      console.error(`EP${ep}: OUTRO FAIL — words=${whisperResult.wordCount}, transcript="${whisperResult.transcript}"`)
    }
    
  } catch (err) {
    console.error(`EP${ep}: ERROR — ${err.message}`)
    // Determine which step failed
    if (musicStatus !== '✅') {
      await appendLog(`EP${ep} ${storyId.slice(0,8)} | music: ❌ ERROR: ${err.message.slice(0,100)} | render: ❌ | outro: ❌ FAIL | duration: N/A`)
    } else if (renderStatus !== '✅') {
      await appendLog(`EP${ep} ${storyId.slice(0,8)} | music: ✅ | render: ❌ ERROR: ${err.message.slice(0,100)} | outro: ❌ FAIL | duration: N/A`)
    } else {
      await appendLog(`EP${ep} ${storyId.slice(0,8)} | music: ✅ | render: ✅ | outro: ❌ ERROR: ${err.message.slice(0,100)} | duration: N/A`)
    }
    results.push({ ep, storyId, music: musicStatus, render: renderStatus, outro: outroStatus, duration: 'N/A', transcript: '', error: err.message, halt: false })
    return false
  }
  
  const logLine = `EP${ep} ${storyId.slice(0,8)} | music: ${musicStatus} | render: ${renderStatus} | outro: ${outroStatus} | duration: ${durationStr}`
  await appendLog(logLine)
  results.push({ ep, storyId, music: musicStatus, render: renderStatus, outro: outroStatus, duration: durationStr, transcript: outroTranscript, halt: haltBatch })
  
  return haltBatch ? 'halt' : true
}

async function main() {
  console.log('🎬 Starting Sunset 22-Episode Music + Render Batch')
  console.log(`Timestamp: ${new Date().toISOString()}`)
  console.log(`Episodes: ${EPISODES.map(e => `EP${e.ep}`).join(', ')}`)
  console.log(`EP15 SKIPPED — invalid UUID in task brief\n`)
  
  await fs.mkdir(path.dirname(PROGRESS_LOG), { recursive: true }).catch(() => {})
  await appendLog(`=== Sunset Music+Render Batch STARTED ${new Date().toISOString()} ===`)
  await appendLog(`EP15 SKIPPED — invalid UUID b7bdc826-7432-49d3-9c06-163eded4e0286`)
  
  const results = []
  let haltedAt = null
  
  for (const epInfo of EPISODES) {
    const outcome = await processEpisode(epInfo, results)
    if (outcome === 'halt') {
      haltedAt = epInfo.ep
      console.error(`\n🛑 BATCH HALTED at EP${epInfo.ep} — outro check failed`)
      break
    }
  }
  
  // Final report
  console.log('\n\n====== FINAL REPORT ======')
  let generatedCount = 0
  let skippedCount = 0
  let failCount = 0
  
  const reportLines = []
  for (const r of results) {
    const line = `EP${r.ep} | music: ${r.music} | render: ${r.render} | outro: ${r.outro} | duration: ${r.duration} | "${r.transcript.slice(0,60)}"`
    console.log(line)
    reportLines.push(line)
  }
  
  const completedEps = results.filter(r => r.render === '✅' && r.outro.includes('✅'))
  const failedEps = results.filter(r => r.render === '❌' || r.outro.includes('❌'))
  const remaining = EPISODES.filter(e => !results.find(r => r.ep === e.ep))
  
  console.log(`\nCompleted: ${completedEps.length}/21`)
  console.log(`Failed: ${failedEps.length}`)
  console.log(`EP15: SKIPPED (invalid UUID)`)
  if (haltedAt) {
    console.log(`HALTED at EP${haltedAt} — outro absent`)
    console.log(`Not rendered: EP${remaining.map(e => e.ep).join(', EP')}`)
  }
  
  await appendLog(`=== Batch COMPLETE: ${completedEps.length}/21 passed, ${failedEps.length} failed, EP15 skipped ===`)
  
  // Write summary to file for main agent
  const summaryPath = '/Users/williampostlewaite/.openclaw/workspace-orion/sunset-batch-summary.json'
  await fs.writeFile(summaryPath, JSON.stringify({
    completedAt: new Date().toISOString(),
    results,
    haltedAt,
    ep15: 'SKIPPED — invalid UUID b7bdc826-7432-49d3-9c06-163eded4e0286',
    notRendered: remaining.map(e => e.ep)
  }, null, 2))
  
  console.log(`\nSummary written to ${summaryPath}`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
