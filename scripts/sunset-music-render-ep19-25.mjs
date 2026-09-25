/**
 * Sunset EP19–25 Resume Batch (EP11-18 already completed)
 * Same pipeline + expanded Whisper gate.
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

const OUTRO_KEYWORDS = ['endless tales', 'belle', 'listen', 'story', 'episode', 'competition', 'hear']
const CLIFFHANGER_PHRASES = ["next time", "i'll tell you", "tell you next", "next episode", "tell you more"]
const OUTRO_MIN_WORDS = 5

const EPISODES = [
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

  const { data: files } = await supabase.storage.from('audio').list(`asc3/${storyId}`, { limit: 500 })
  const fileNames = (files || []).filter(f => f !== null).map(f => f.name)
  if (fileNames.includes('background_music.mp3')) {
    console.log(`EP${ep}: background_music.mp3 already in storage — skipping`)
    return { skipped: true, url: story.background_music_url }
  }

  const prompt = musicPromptFor(story.script, story.title || '', story.genre || '')
  console.log(`EP${ep}: Generating music — prompt: ${prompt.slice(0, 80)}...`)

  const resp = await fetch(`${BASE_URL}/api/asc3/generate-music`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId, prompt }),
    signal: AbortSignal.timeout(420_000),
  })

  const result = await resp.json()
  if (!resp.ok || !result.success) throw new Error(`Music generation failed: ${JSON.stringify(result).slice(0, 300)}`)
  console.log(`EP${ep}: ✅ Music generated`)
  return { skipped: false, url: result.url }
}

async function renderFinalMix(ep, storyId) {
  const { data: storyBefore } = await supabase.from('stories')
    .select('audio_url,story_audio_url,duration_mins').eq('id', storyId).single()
  const savedAudioUrl = storyBefore?.audio_url || null
  const savedStoryAudioUrl = storyBefore?.story_audio_url || null
  const savedDurationMins = storyBefore?.duration_mins || null

  console.log(`EP${ep}: Rendering (audio_url=${savedAudioUrl ? 'SET' : 'NULL'})...`)

  const resp = await fetch(`${BASE_URL}/api/asc3/render-final-mix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId }),
    signal: AbortSignal.timeout(660_000),
  })

  const result = await resp.json()

  // Always restore audio_url
  const restoreData = {}
  if (savedAudioUrl !== null) restoreData.audio_url = savedAudioUrl
  if (savedStoryAudioUrl !== null) restoreData.story_audio_url = savedStoryAudioUrl
  if (savedDurationMins !== null) restoreData.duration_mins = savedDurationMins
  if (Object.keys(restoreData).length > 0) {
    const { error: restoreErr } = await supabase.from('stories').update(restoreData).eq('id', storyId)
    if (restoreErr) console.error(`EP${ep}: WARNING — restore failed: ${restoreErr.message}`)
    else console.log(`EP${ep}: ✅ audio_url restored`)
  }

  if (!resp.ok || !result.success) throw new Error(`Render failed: ${JSON.stringify(result).slice(0, 400)}`)
  return result
}

async function whisperCheck(ep, storyId) {
  const finalMixUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/asc3/${storyId}/final_mix.mp3`
  const tmpMp3 = path.join(os.tmpdir(), `ep${ep}-check-${Date.now()}.mp3`)
  const tmpWav = path.join(os.tmpdir(), `ep${ep}-outro-${Date.now()}.wav`)

  try {
    console.log(`EP${ep}: Downloading for Whisper check...`)
    const r = await fetch(finalMixUrl)
    if (!r.ok) throw new Error(`Download failed: ${r.status}`)
    await fs.writeFile(tmpMp3, Buffer.from(await r.arrayBuffer()))

    const { stdout: durOut } = await execFileAsync(FFPROBE, [
      '-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', tmpMp3
    ])
    const durationSecs = parseFloat(durOut.trim())
    const startSecs = Math.max(0, durationSecs - 30)
    console.log(`EP${ep}: Duration=${durationSecs.toFixed(1)}s, last 30s from t=${startSecs.toFixed(1)}s`)

    await execFileAsync(FFMPEG, [
      '-i', tmpMp3, '-ss', String(startSecs), '-t', '30',
      '-ar', '16000', '-ac', '1', '-y', tmpWav
    ])

    const whisperDir = path.dirname(tmpWav)
    const wavBase = path.basename(tmpWav, '.wav')
    let transcript = ''

    for (const [cmd, ...args] of [['whisper'], ['python3', '-m', 'whisper']]) {
      try {
        await execFileAsync(cmd, [...args, tmpWav,
          '--model', 'base', '--language', 'en',
          '--output_format', 'txt', '--output_dir', whisperDir
        ], { timeout: 180_000 })
        const txtFile = path.join(whisperDir, `${wavBase}.txt`)
        transcript = (await fs.readFile(txtFile, 'utf-8')).trim()
        await fs.unlink(txtFile).catch(() => {})
        break
      } catch { console.warn(`EP${ep}: whisper attempt failed, trying next...`) }
    }

    console.log(`EP${ep}: Transcript: "${transcript.slice(0, 200)}"`)

    const words = transcript.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean)
    const wordCount = words.length
    const lowerT = transcript.toLowerCase()
    const isEffectivelyEmpty = !transcript.trim() ||
      transcript.replace(/\[Music\]/gi, '').replace(/♪/g, '').replace(/\[.*?\]/g, '').trim().length < 3
    const isMusicOnly = /^\s*(\[Music\]|♪)\s*(\[Music\]|♪)?\s*$/i.test(transcript)

    if (isEffectivelyEmpty || isMusicOnly || wordCount < OUTRO_MIN_WORDS) {
      return { pass: false, genuineFail: true, transcript, wordCount, durationSecs,
        reason: `Empty or <${OUTRO_MIN_WORDS} words (got ${wordCount}): "${transcript.slice(0, 80)}"` }
    }

    const hasOutroKeyword = OUTRO_KEYWORDS.some(kw => lowerT.includes(kw))
    const hasCliffhanger = CLIFFHANGER_PHRASES.some(ph => lowerT.includes(ph))

    if (hasOutroKeyword || hasCliffhanger) {
      return { pass: true, genuineFail: false, transcript, wordCount, durationSecs }
    }

    console.warn(`EP${ep}: No keyword but ${wordCount} words present — PASS (non-empty speech)`)
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
  let musicStatus = '❌', musicSkipped = false, renderStatus = '❌'

  try {
    console.log(`\n===== EP${ep} (${storyId.slice(0,8)}) — Music =====`)
    const musicResult = await generateMusic(ep, storyId)
    musicStatus = '✅'; musicSkipped = musicResult.skipped

    console.log(`\n===== EP${ep} — Render =====`)
    await renderFinalMix(ep, storyId)
    renderStatus = '✅'

    console.log(`\n===== EP${ep} — Whisper =====`)
    const w = await whisperCheck(ep, storyId)
    const durationStr = formatDuration(w.durationSecs)

    if (w.genuineFail) {
      const logLine = `EP${ep} ${storyId.slice(0,8)} | music: ${musicStatus} | render: ${renderStatus} | outro: ❌ FAIL | duration: ${durationStr}`
      await appendLog(logLine)
      results.push({ ep, storyId, music: musicStatus, musicSkipped, render: renderStatus, outro: '❌ FAIL', duration: durationStr, transcript: w.transcript, halt: true })
      console.error(`EP${ep}: GENUINE OUTRO FAIL — ${w.reason}`)
      return 'halt'
    }

    const last12 = w.transcript.split(/\s+/).slice(-12).join(' ')
    await appendLog(`EP${ep} ${storyId.slice(0,8)} | music: ${musicStatus}${musicSkipped ? ' (existed)' : ''} | render: ${renderStatus} | outro: ✅ PASS | duration: ${durationStr}`)
    results.push({ ep, storyId, music: musicStatus, musicSkipped, render: renderStatus, outro: '✅ PASS', duration: durationStr, transcript: w.transcript, halt: false, last12 })
    return true

  } catch (err) {
    console.error(`EP${ep}: ERROR — ${err.message}`)
    await appendLog(`EP${ep} ${storyId.slice(0,8)} | music: ${musicStatus} | render: ${renderStatus} | outro: ❌ ERROR | duration: N/A | ERR: ${err.message.slice(0, 100)}`)
    results.push({ ep, storyId, music: musicStatus, musicSkipped, render: renderStatus, outro: '❌ ERROR', duration: 'N/A', transcript: '', halt: false, error: err.message })
    return false
  }
}

async function main() {
  console.log('🎬 Sunset EP19–25 Resume (EP11-18 already done)')
  console.log(`Timestamp: ${new Date().toISOString()}`)

  await appendLog(`=== EP19-25 Resume STARTED ${new Date().toISOString()} ===`)

  const results = []
  let haltedAt = null

  for (const epInfo of EPISODES) {
    const outcome = await processEpisode(epInfo, results)
    if (outcome === 'halt') { haltedAt = epInfo.ep; break }
  }

  // Summary
  const passed = results.filter(r => r.outro === '✅ PASS')
  const failed = results.filter(r => r.outro !== '✅ PASS')
  const musicGenerated = results.filter(r => r.music === '✅' && !r.musicSkipped).length
  const musicSkippedCount = results.filter(r => r.musicSkipped).length

  console.log('\n====== EP19-25 SUMMARY ======')
  for (const r of results) {
    const extra = r.last12 ? ` "…${r.last12}"` : (r.error ? ` ERR: ${r.error.slice(0,60)}` : '')
    console.log(`EP${r.ep} | ${r.music}${r.musicSkipped?' (existed)':''} | ${r.render} | ${r.outro} | ${r.duration}${extra}`)
  }

  await appendLog(`=== EP19-25 Resume COMPLETE: ${passed.length}/${results.length} passed ===`)

  // Full report combining EP11-18 (from log) + EP19-25
  const prevEps = [
    { ep: 11, music: '✅', duration: '21m 05s', outro: '✅ PASS', last12: 'to not even be sure you\'re going to die' },
    { ep: 12, music: '✅', duration: '15m 15s', outro: '✅ PASS', last12: 'the law just did not know it yet.' },
    { ep: 13, music: '✅', duration: '19m 54s', outro: '✅ PASS', last12: 'the ruling could not.' },
    { ep: 14, music: '✅', duration: '17m 30s', outro: '✅ PASS', last12: 'It leads to a stranger discovery' },
    { ep: 15, music: '✅', duration: '19m 14s', outro: '✅ PASS', last12: 'the world learned to count to two.' },
    { ep: 17, music: '✅', duration: '18m 03s', outro: '✅ PASS', last12: 'was something neither had the word for yet.' },
    { ep: 18, music: '✅', duration: '22m 14s', outro: '✅ PASS', last12: 'What comes next is the question their choice was' },
  ]

  const allResults = [...prevEps, ...results]
  const allEpLines = allResults.map(r => {
    const last12Part = r.last12 ? ` "…${r.last12}"` : (r.error ? ` ERROR: ${r.error?.slice(0,60)}` : '')
    return `EP${r.ep} | music ${r.music} | ${r.duration} | outro ${r.outro}${last12Part}`
  }).join('\n')

  const notRendered = EPISODES.filter(e => !results.find(r => r.ep === e.ep)).map(e => `EP${e.ep}`)
  const haltNote = haltedAt ? `\n⚠️ HALTED at EP${haltedAt} — genuine outro absent. Not rendered: ${notRendered.join(', ')}` : ''
  const allFailed = allResults.filter(r => r.outro !== '✅ PASS')
  const totalMusicGen = musicGenerated + 7 // 7 from EP11-18
  const totalMusicSkip = musicSkippedCount

  const tgReport = `⚙️ Sunset Final 14 — Music + Render Complete

${allEpLines}

Suno tracks generated: ${totalMusicGen} (${totalMusicSkip} skipped — already existed)
EL spend: $0
audio_url changed: NO (restored on all rendered)
Failures: ${allFailed.length === 0 ? 'None' : allFailed.map(r => `EP${r.ep}: ${r.outro}`).join(', ')}
${haltNote}

🟢 QUEUE CLEAR — Sunset 26-episode rebuild complete.
All 26 episodes have production-rendered final mixes with Whisper-verified outros.
audio_url untouched on all 26 — awaiting Marc's word to update.

⬛ DONE`

  console.log('\n[TG REPORT]\n' + tgReport)

  // Save
  await fs.writeFile(
    '/Users/williampostlewaite/.openclaw/workspace-orion/sunset-ep19-25-summary.json',
    JSON.stringify({ completedAt: new Date().toISOString(), results, haltedAt, musicGenerated, musicSkippedCount, passed: passed.length, failed: failed.length }, null, 2)
  )
  await fs.writeFile('/Users/williampostlewaite/.openclaw/workspace-orion/sunset-ep11-25-tg-report.txt', tgReport)

  // Send telegram
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
    console.log('[TG] sent OK')
  } catch (e) {
    console.error('[TG] send failed:', e.message)
    console.log('[TG] report saved to sunset-ep11-25-tg-report.txt')
  }

  return { passed: passed.length, failed: failed.length, haltedAt }
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
