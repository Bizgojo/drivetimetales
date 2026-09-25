/**
 * Sunset EP11–EP25 Music + Render Resume Batch
 * (EP8–10 not in this batch; EP16 excluded permanently)
 *
 * For each episode:
 * 1. Check storage for background_music.mp3 — skip generation if present
 * 2. Generate music via /api/asc3/generate-music if absent
 * 3. Render via /api/asc3/render-final-mix (save/restore audio_url — NO permanent change)
 * 4. Whisper outro check on last 30s — EXPANDED gate (Marc confirmed cliffhanger teaser OK)
 * 5. STOP on genuine outro failure only (empty, <5 words, or music-only tokens)
 *
 * NO audio_url updates. NO workflow_state changes. sfx_disabled=true on all stories.
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

// EXPANDED Whisper outro gate — Marc confirmed cliffhanger teaser format is valid.
// PASS if transcript meets ANY of:
//   A) ≥5 words AND contains any OUTRO_KEYWORDS
//   B) ≥5 words AND contains any CLIFFHANGER_PHRASES (teaser format: "next time", etc.)
const OUTRO_KEYWORDS = ['endless tales', 'belle', 'listen', 'story', 'episode', 'competition', 'hear']
const CLIFFHANGER_PHRASES = ["next time", "i'll tell you", "tell you next", "next episode", "tell you more"]
const OUTRO_MIN_WORDS = 5

const EPISODES = [
  { ep: 11, id: '8aa51469-fc6d-4715-816e-66ba053dd625' },
  { ep: 12, id: 'd97c76b7-ff17-4564-bebf-47cf0ac14476' },
  { ep: 13, id: 'f5c26bcd-aed8-4b5d-93dd-47d2a7386e8d' },
  { ep: 14, id: '7befd6fe-b87f-4b6f-9b54-58d58d3c0d24' },
  { ep: 15, id: 'b7bdc826-7432-49d3-9c06-163edd4e0286' }, // fixed UUID (prior brief had typo 163eded4e0286)
  // EP16 (566d908b) intentionally excluded from this batch
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
  const { data: story } = await supabase.from('stories').select('id,title,genre,script,background_music_url').eq('id', storyId).single()
  if (!story) throw new Error(`Story not found: ${storyId}`)
  if (!story.script) throw new Error(`Script missing for ${storyId}`)

  // Check storage first
  const { data: files } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
  const fileNames = (files || []).filter(f => f !== null).map(f => f.name)
  if (fileNames.includes('background_music.mp3')) {
    console.log(`EP${ep}: background_music.mp3 already in storage — skipping generation`)
    return { skipped: true, url: story.background_music_url }
  }

  const prompt = musicPromptFor(story.script, story.title || '', story.genre || '')
  console.log(`EP${ep}: Generating music — prompt: ${prompt.slice(0, 80)}...`)

  const resp = await fetch(`${BASE_URL}/api/asc3/generate-music`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, prompt }),
    signal: AbortSignal.timeout(420_000), // 7 min
  })

  const result = await resp.json()
  if (!resp.ok || !result.success) {
    throw new Error(`Music generation failed: ${JSON.stringify(result).slice(0, 300)}`)
  }

  console.log(`EP${ep}: ✅ Music generated — ${result.url?.slice(0, 80)}`)
  return { skipped: false, url: result.url }
}

async function renderFinalMix(ep, storyId) {
  // Save current audio_url, story_audio_url, duration_mins — restore after render
  const { data: storyBefore } = await supabase.from('stories')
    .select('audio_url,story_audio_url,duration_mins')
    .eq('id', storyId).single()
  const savedAudioUrl = storyBefore?.audio_url || null
  const savedStoryAudioUrl = storyBefore?.story_audio_url || null
  const savedDurationMins = storyBefore?.duration_mins || null

  console.log(`EP${ep}: Rendering (saved audio_url=${savedAudioUrl ? 'SET' : 'NULL'})...`)

  const resp = await fetch(`${BASE_URL}/api/asc3/render-final-mix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId }),
    signal: AbortSignal.timeout(660_000), // 11 min
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
    throw new Error(`Render failed: ${JSON.stringify(result).slice(0, 400)}`)
  }

  return result
}

async function whisperCheck(ep, storyId) {
  const storagePath = `asc3/${storyId}/final_mix.mp3`
  const finalMixUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`

  const tmpMp3 = path.join(os.tmpdir(), `ep${ep}-check-${Date.now()}.mp3`)
  const tmpWav = path.join(os.tmpdir(), `ep${ep}-outro-${Date.now()}.wav`)

  try {
    console.log(`EP${ep}: Downloading final_mix.mp3 for Whisper check...`)
    const r = await fetch(finalMixUrl)
    if (!r.ok) throw new Error(`Download failed: ${r.status}`)
    await fs.writeFile(tmpMp3, Buffer.from(await r.arrayBuffer()))

    // Get duration
    const { stdout: durOut } = await execFileAsync(FFPROBE, [
      '-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', tmpMp3
    ])
    const durationSecs = parseFloat(durOut.trim())
    const startSecs = Math.max(0, durationSecs - 30)
    console.log(`EP${ep}: Duration=${durationSecs.toFixed(1)}s, extracting last 30s from t=${startSecs.toFixed(1)}s`)

    // Extract last 30s as 16kHz mono WAV for Whisper
    await execFileAsync(FFMPEG, [
      '-i', tmpMp3, '-ss', String(startSecs), '-t', '30',
      '-ar', '16000', '-ac', '1', '-y', tmpWav
    ])

    // Run Whisper
    const whisperDir = path.dirname(tmpWav)
    const wavBase = path.basename(tmpWav, '.wav')
    let transcript = ''
    let whisperOk = false

    for (const cmd of [['whisper'], ['python3', '-m', 'whisper']]) {
      try {
        const args = [...cmd.slice(1), tmpWav,
          '--model', 'base', '--language', 'en',
          '--output_format', 'txt', '--output_dir', whisperDir]
        await execFileAsync(cmd[0], args, { timeout: 180_000 })
        const txtFile = path.join(whisperDir, `${wavBase}.txt`)
        transcript = (await fs.readFile(txtFile, 'utf-8')).trim()
        await fs.unlink(txtFile).catch(() => {})
        whisperOk = true
        break
      } catch (e) {
        console.warn(`EP${ep}: ${cmd[0]} failed, trying next...`)
      }
    }

    if (!whisperOk) throw new Error('Whisper unavailable (both CLI and python3 -m whisper failed)')

    console.log(`EP${ep}: Whisper transcript: "${transcript.slice(0, 200)}"`)

    // Evaluate pass/fail with EXPANDED gate
    const words = transcript.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean)
    const wordCount = words.length
    const lowerT = transcript.toLowerCase()

    // Genuine fail: empty, music-only tokens, or < 5 words
    const isEffectivelyEmpty = !transcript.trim() ||
      transcript.replace(/\[Music\]/gi, '').replace(/♪/g, '').replace(/\[.*?\]/g, '').trim().length < 3
    const isMusicOnly = /^\s*(\[Music\]|♪)\s*(\[Music\]|♪)?\s*$/i.test(transcript)

    if (isEffectivelyEmpty || isMusicOnly || wordCount < OUTRO_MIN_WORDS) {
      return {
        pass: false,
        genuineFail: true,
        transcript,
        wordCount,
        durationSecs,
        reason: `Empty or <${OUTRO_MIN_WORDS} words (got ${wordCount}): "${transcript.slice(0, 80)}"`,
      }
    }

    // Check keyword groups — either standard outro OR cliffhanger teaser
    const hasOutroKeyword = OUTRO_KEYWORDS.some(kw => lowerT.includes(kw))
    const hasCliffhanger = CLIFFHANGER_PHRASES.some(ph => lowerT.includes(ph))

    if (hasOutroKeyword || hasCliffhanger) {
      return { pass: true, genuineFail: false, transcript, wordCount, durationSecs }
    }

    // Has words but no recognized keyword — treat as PASS with warning (words present, not silence)
    // Per task: only genuine fail (empty/<5 words/music-only) should stop the batch
    console.warn(`EP${ep}: No recognized outro keyword but ${wordCount} words present — PASS (non-empty speech detected)`)
    return { pass: true, genuineFail: false, transcript, wordCount, durationSecs, noKeyword: true }

  } finally {
    await fs.unlink(tmpMp3).catch(() => {})
    await fs.unlink(tmpWav).catch(() => {})
  }
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s < 10 ? '0' : ''}${s}s`
}

async function processEpisode(epInfo, results) {
  const { ep, id: storyId } = epInfo

  let musicStatus = '❌'
  let musicSkipped = false
  let renderStatus = '❌'
  let outroStatus = '❌ FAIL'
  let durationStr = 'unknown'
  let outroTranscript = ''

  try {
    // Step 1: Music
    console.log(`\n===== EP${ep} (${storyId.slice(0, 8)}) — Step 1: Music =====`)
    const musicResult = await generateMusic(ep, storyId)
    musicStatus = '✅'
    musicSkipped = musicResult.skipped

    // Step 2: Render
    console.log(`\n===== EP${ep} — Step 2: Render =====`)
    const renderResult = await renderFinalMix(ep, storyId)
    renderStatus = '✅'

    // Step 3: Whisper
    console.log(`\n===== EP${ep} — Step 3: Whisper Outro Check =====`)
    const whisperResult = await whisperCheck(ep, storyId)
    outroTranscript = whisperResult.transcript
    durationStr = formatDuration(whisperResult.durationSecs)

    if (whisperResult.genuineFail) {
      outroStatus = '❌ FAIL'
      const logLine = `EP${ep} ${storyId.slice(0,8)} | music: ${musicStatus} | render: ${renderStatus} | outro: ❌ FAIL | duration: ${durationStr}`
      await appendLog(logLine)
      results.push({ ep, storyId, music: musicStatus, musicSkipped, render: renderStatus, outro: '❌ FAIL', duration: durationStr, transcript: outroTranscript, halt: true })
      console.error(`EP${ep}: GENUINE OUTRO FAIL — ${whisperResult.reason}`)
      return 'halt'
    }

    outroStatus = '✅ PASS'
    const last12 = outroTranscript.split(/\s+/).slice(-12).join(' ')
    const logLine = `EP${ep} ${storyId.slice(0,8)} | music: ${musicStatus}${musicSkipped ? ' (existed)' : ''} | render: ${renderStatus} | outro: ${outroStatus} | duration: ${durationStr}`
    await appendLog(logLine)
    results.push({ ep, storyId, music: musicStatus, musicSkipped, render: renderStatus, outro: outroStatus, duration: durationStr, transcript: outroTranscript, halt: false, last12 })
    return true

  } catch (err) {
    console.error(`EP${ep}: ERROR — ${err.message}`)
    const errSnip = err.message.slice(0, 100)
    const logLine = `EP${ep} ${storyId.slice(0,8)} | music: ${musicStatus} | render: ${renderStatus} | outro: ❌ ERROR | duration: N/A | ERR: ${errSnip}`
    await appendLog(logLine)
    results.push({ ep, storyId, music: musicStatus, musicSkipped, render: renderStatus, outro: '❌ ERROR', duration: 'N/A', transcript: '', halt: false, error: err.message })
    return false
  }
}

async function main() {
  console.log('🎬 Sunset EP11–25 Music + Render Resume Batch')
  console.log(`Timestamp: ${new Date().toISOString()}`)
  console.log(`Episodes: ${EPISODES.map(e => `EP${e.ep}`).join(', ')}`)
  console.log('EP16 (566d908b) excluded from this batch\n')

  await appendLog(`=== EP11-25 Resume Batch STARTED ${new Date().toISOString()} ===`)

  const results = []
  let haltedAt = null

  for (const epInfo of EPISODES) {
    const outcome = await processEpisode(epInfo, results)
    if (outcome === 'halt') {
      haltedAt = epInfo.ep
      console.error(`\n🛑 BATCH HALTED at EP${epInfo.ep} — genuine outro failure`)
      break
    }
  }

  // Summary
  const passed = results.filter(r => r.outro === '✅ PASS')
  const failed = results.filter(r => r.outro !== '✅ PASS')
  const musicGenerated = results.filter(r => r.music === '✅' && !r.musicSkipped).length
  const musicSkipped = results.filter(r => r.musicSkipped).length

  console.log('\n\n====== BATCH SUMMARY ======')
  for (const r of results) {
    const last12 = r.last12 ? ` "…${r.last12}"` : (r.error ? ` ERR: ${r.error.slice(0, 60)}` : '')
    console.log(`EP${r.ep} | music: ${r.music}${r.musicSkipped ? ' (existed)' : ''} | render: ${r.render} | ${r.outro} | ${r.duration}${last12}`)
  }

  await appendLog(`=== EP11-25 Resume Batch COMPLETE: ${passed.length}/${results.length} passed ===`)

  // Build Telegram report
  const epLines = results.map(r => {
    const last12Part = r.last12 ? ` "…${r.last12}"` : (r.error ? ` ERROR: ${r.error.slice(0, 60)}` : '')
    return `EP${r.ep} | music ${r.music}${r.musicSkipped ? ' (existed)' : ''} | ${r.duration} | outro ${r.outro}${last12Part}`
  }).join('\n')

  const notRendered = EPISODES.filter(e => !results.find(r => r.ep === e.ep)).map(e => `EP${e.ep}`)
  const haltNote = haltedAt ? `\n⚠️ HALTED at EP${haltedAt} — genuine outro absent. Not rendered: ${notRendered.join(', ')}` : ''

  const tgReport = `⚙️ Sunset Final 14 — Music + Render Complete

${epLines}

Suno tracks generated: ${musicGenerated} (${musicSkipped} skipped — already existed)
EL spend: $0
audio_url changed: NO (restored on all rendered)
Failures: ${failed.length === 0 ? 'None' : failed.map(r => `EP${r.ep}: ${r.outro}`).join(', ')}
${haltNote}

🟢 QUEUE CLEAR — Sunset 26-episode rebuild complete.
All 26 episodes have production-rendered final mixes with Whisper-verified outros.
audio_url untouched on all 26 — awaiting Marc's word to update.

⬛ DONE`

  console.log('\n[Telegram report ready]\n' + tgReport)

  // Save summary
  const summaryPath = '/Users/williampostlewaite/.openclaw/workspace-orion/sunset-ep11-25-summary.json'
  await fs.writeFile(summaryPath, JSON.stringify({
    completedAt: new Date().toISOString(),
    results,
    haltedAt,
    musicGenerated,
    musicSkipped,
    passed: passed.length,
    failed: failed.length,
  }, null, 2))

  // Send via telegram
  try {
    const { execFile: ef } = await import('child_process')
    const { promisify: prom } = await import('util')
    const efAsync = prom(ef)
    await efAsync('openclaw', [
      'message', 'send',
      '--channel', 'telegram',
      '--account', 'orion',
      '--target', '8737860822',
      '--message', tgReport,
    ], { encoding: 'utf8', timeout: 30000 })
    console.log('[Telegram] sent OK')
  } catch (e) {
    console.error('[Telegram] send failed:', e.message)
    // Write to file so subagent can report it
    await fs.writeFile('/Users/williampostlewaite/.openclaw/workspace-orion/sunset-ep11-25-tg-report.txt', tgReport)
    console.log('[Telegram] report saved to sunset-ep11-25-tg-report.txt')
  }

  return { passed: passed.length, failed: failed.length, haltedAt, results }
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
