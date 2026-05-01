import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

export const runtime = 'nodejs'
export const maxDuration = 800

let FFMPEG_PATH = 'ffmpeg'
try { FFMPEG_PATH = eval('require')('@ffmpeg-installer/ffmpeg').path } catch {}

const _execFileAsync = promisify(execFile)

async function generateSilenceBuffer(seconds: number): Promise<Buffer> {
  const tmpFile = path.join(os.tmpdir(), 'silence_' + Date.now() + '.mp3')
  await _execFileAsync(FFMPEG_PATH, [
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', String(seconds), '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', tmpFile
  ])
  const buf = await fs.readFile(tmpFile)
  await fs.unlink(tmpFile).catch(() => {})
  return buf
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EL_API_KEY = process.env.ELEVENLABS_API_KEY!
const BELLE_B_VOICE_ID = 'wewocdDkjSLm9ZwjO7TD'
const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const EL_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
const SPOKEN_REFERENCE_LUFS = -16
const SPOKEN_TRUE_PEAK = -1.5
const SPOKEN_LRA = 11
const SEGMENT_QC_WARN_LUFS = -18.0
const SEGMENT_QC_RETRY_LUFS = -18.5
const SEGMENT_QC_HARD_FAIL_LUFS = -20.0
const SEGMENT_QC_TARGET_LUFS = -17.0

function getSceneLoudnessOffset(text: string, prefix: string): number {
  if (prefix === 'intro' || prefix === 'intro_before' || prefix === 'intro_after' || prefix === 'outro') return 0
  const t = text.toLowerCase()
  if (/\b(whisper|whispers|whispered|murmur|murmurs|murmured|under his breath|under her breath|hushed)\b/.test(t)) return -5
  if (/\b(distant|far away|from outside|over the radio|through the radio|radio crackle|phone line|intercom)\b/.test(t)) return -3
  if (/\b(shout|shouts|shouted|yell|yells|yelled|scream|screams|screamed)\b/.test(t)) return 2
  return 0
}

async function normalizeSpokenBuffer(input: Buffer, rawText: string, prefix: string): Promise<Buffer> {
  const tmpBase = path.join(os.tmpdir(), `et_voice_norm_${Date.now()}_${Math.random().toString(16).slice(2)}`)
  const inputPath = `${tmpBase}_in.mp3`
  const outputPath = `${tmpBase}_out.mp3`
  const target = SPOKEN_REFERENCE_LUFS + getSceneLoudnessOffset(rawText, prefix)
  try {
    await fs.writeFile(inputPath, input)
    await _execFileAsync(FFMPEG_PATH, [
      '-i', inputPath,
      '-af', `loudnorm=I=${target}:TP=${SPOKEN_TRUE_PEAK}:LRA=${SPOKEN_LRA}`,
      '-ar', '44100', '-ac', '2', '-b:a', '192k',
      '-y', outputPath
    ])
    return await fs.readFile(outputPath)
  } catch (e) {
    console.warn(`Spoken loudness normalization failed for ${prefix}; using raw ElevenLabs audio:`, e)
    return input
  } finally {
    await fs.unlink(inputPath).catch(() => {})
    await fs.unlink(outputPath).catch(() => {})
  }
}

interface LoudnessMetrics {
  input_i: number
  input_tp: number
  input_lra: number
  input_thresh: number
}

function parseLoudnessNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : NaN
}

async function analyzeLoudnessBuffer(input: Buffer): Promise<LoudnessMetrics> {
  const tmpBase = path.join(os.tmpdir(), `et_voice_qc_${Date.now()}_${Math.random().toString(16).slice(2)}`)
  const inputPath = `${tmpBase}.mp3`
  try {
    await fs.writeFile(inputPath, input)
    const result = await _execFileAsync(FFMPEG_PATH, [
      '-i', inputPath,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
      '-f', 'null', '-'
    ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 }).catch((e: any) => ({ stdout: '', stderr: e.stderr || '' }))
    const out = (result as any).stderr || (result as any).stdout || ''
    const match = out.match(/\{[\s\S]*?\}/)
    if (!match) throw new Error('No loudnorm JSON found')
    const parsed = JSON.parse(match[0])
    return {
      input_i: parseLoudnessNumber(parsed.input_i),
      input_tp: parseLoudnessNumber(parsed.input_tp),
      input_lra: parseLoudnessNumber(parsed.input_lra),
      input_thresh: parseLoudnessNumber(parsed.input_thresh),
    }
  } finally {
    await fs.unlink(inputPath).catch(() => {})
  }
}

async function applySegmentGainLimit(input: Buffer, gainDb: number): Promise<Buffer> {
  const tmpBase = path.join(os.tmpdir(), `et_voice_gain_${Date.now()}_${Math.random().toString(16).slice(2)}`)
  const inputPath = `${tmpBase}_in.mp3`
  const outputPath = `${tmpBase}_out.mp3`
  try {
    await fs.writeFile(inputPath, input)
    await _execFileAsync(FFMPEG_PATH, [
      '-i', inputPath,
      '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=0.84:level=false`,
      '-ar', '44100', '-ac', '2', '-b:a', '192k',
      '-y', outputPath
    ])
    return await fs.readFile(outputPath)
  } finally {
    await fs.unlink(inputPath).catch(() => {})
    await fs.unlink(outputPath).catch(() => {})
  }
}

function logSegmentQc(fileName: string, speaker: string, text: string, metrics: LoudnessMetrics, action: string) {
  console.log(
    `  Segment QC ${fileName} speaker="${speaker}" lufs=${metrics.input_i.toFixed(2)} tp=${metrics.input_tp.toFixed(2)} action=${action} text="${text.slice(0, 120)}"`
  )
}

// Permanent narrator voices — excluded from character pool
const NARRATOR_VOICE_NAMES = ['Cole Hargrove','Elliott Crane','Finn Calloway','James Alcott','Marcus Hale','Ray Dolan','Iris Calloway','June Harlow','Morgan Veil','Nora Ashby','Quinn Merritt','Sage Wilder']
// BELLE B — EXCLUSIVE ANNOUNCER VOICE. NEVER use as character or narrator.
const BELLE_B_ID = 'wewocdDkjSLm9ZwjO7TD' // Belle B – Warm Healthcare Support. Locked permanently.

// Load all My Voices from ElevenLabs — used as the character voice pool
async function loadMyVoices(): Promise<any[]> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': EL_API_KEY } })
    if (!res.ok) return []
    const data = await res.json()
    // Filter to only usable character voices — exclude narrators, Belle B, ET voices, generated voices
    return (data.voices || []).filter((v: any) => {
      if (v.voice_id === BELLE_B_ID) return false
      if (v.labels?.language && v.labels.language !== 'en') return false
      if (v.category === 'generated') return false
      if (NARRATOR_VOICE_NAMES.includes(v.name)) return false
      return true
    })
  } catch(e) {
    console.warn('Failed to load My Voices:', e)
    return []
  }
}

// Extract EL-compatible attributes from character description
function parseCharacterMeta(description: string): { gender: string; age: string; accent: string; tones: string[] } {
  const d = description.toLowerCase()
  // Gender
  const gender = d.includes('female') || d.includes('woman') || d.includes('girl') ? 'female'
    : d.includes('male') || d.includes('man') || d.includes('boy') ? 'male' : ''
  // Age
  const ageNum = d.match(/(\d+)/)?.[1] ? parseInt(d.match(/(\d+)/)![1]) : 35
  const age = ageNum < 25 ? 'young' : ageNum < 55 ? 'middle_aged' : 'old'
  // Accent — map to EL accent labels
  const accent = d.includes('british') || d.includes('english') || d.includes('london') ? 'british'
    : d.includes('irish') ? 'irish'
    : d.includes('scottish') ? 'scottish'
    : d.includes('australian') ? 'australian'
    : d.includes('southern') || d.includes('southern us') ? 'us southern'
    : d.includes('new england') || d.includes('boston') ? 'american'
    : d.includes('midwest') ? 'american'
    : d.includes('west coast') || d.includes('california') ? 'american'
    : d.includes('canadian') ? 'canadian'
    : 'american'
  // Tone descriptives — map character traits to EL descriptive labels
  const toneMap: Record<string,string> = {
    'calm': 'calm', 'quiet': 'calm', 'measured': 'calm', 'soft': 'calm', 'gentle': 'gentle',
    'intense': 'intense', 'fierce': 'intense', 'aggressive': 'intense', 'passionate': 'intense',
    'deep': 'deep', 'resonant': 'deep', 'low': 'deep', 'baritone': 'deep',
    'warm': 'warm', 'friendly': 'pleasant', 'approachable': 'pleasant', 'kind': 'gentle',
    'raspy': 'raspy', 'gravelly': 'raspy', 'rough': 'rough', 'hoarse': 'raspy',
    'husky': 'husky', 'smoky': 'husky',
    'confident': 'confident', 'authoritative': 'confident', 'commanding': 'serious',
    'wise': 'wise', 'mature': 'mature', 'experienced': 'mature',
    'nervous': 'calm', 'anxious': 'calm', 'timid': 'gentle',
    'sarcastic': 'sassy', 'dry': 'casual', 'sardonic': 'casual',
    'upbeat': 'upbeat', 'cheerful': 'upbeat', 'bright': 'upbeat',
    'serious': 'serious', 'stern': 'serious', 'formal': 'professional',
    'professional': 'professional', 'crisp': 'crisp', 'precise': 'professional',
    'casual': 'casual', 'relaxed': 'relaxed', 'laid-back': 'chill',
    'whispery': 'whispery', 'breathy': 'soft', 'intimate': 'soft',
    'gruff': 'rough', 'tough': 'intense', 'dark': 'serious',
    'meditative': 'meditative', 'soothing': 'calm', 'peaceful': 'meditative',
  }
  const tones: string[] = []
  for (const [trait, label] of Object.entries(toneMap)) {
    if (d.includes(trait) && !tones.includes(label)) tones.push(label)
  }
  return { gender, age, accent, tones }
}

// Score a voice candidate against character requirements
function scoreVoice(voice: any, meta: { gender: string; age: string; accent: string; tones: string[] }): number {
  const labels = voice.labels || {}
  let score = 0
  // Gender — hard requirement, massive penalty for mismatch
  if (meta.gender && labels.gender) {
    if (labels.gender.toLowerCase() === meta.gender.toLowerCase()) score += 100
    else return -999 // Wrong gender — never use
  }
  // Age match
  if (labels.age === meta.age) score += 20
  else if (labels.age && meta.age) {
    const ages = ['young','middle_aged','old']
    const diff = Math.abs(ages.indexOf(labels.age) - ages.indexOf(meta.age))
    score += Math.max(0, 10 - diff * 10)
  }
  // Accent match
  if (meta.accent && labels.accent) {
    if (labels.accent.toLowerCase() === meta.accent.toLowerCase()) score += 15
    else if (meta.accent === 'american' && labels.accent === 'american') score += 15
  }
  // Default: prefer American accent when no accent specified
  if (!meta.accent && labels.accent) {
    if (labels.accent.toLowerCase() === 'american') score += 10
    else if (labels.accent.toLowerCase() === 'british') score -= 5
  }
  // Tone/descriptive match
  const desc = (labels.descriptive || '').toLowerCase()
  for (const tone of meta.tones) {
    if (desc.includes(tone.toLowerCase())) score += 10
  }
  // Prefer narrative_story use case
  const useCase = (labels.use_case || '').toLowerCase()
  if (useCase.includes('narrative') || useCase.includes('story')) score += 8
  else if (useCase.includes('character')) score += 5
  return score
}

// Find best matching voice from My Voices pool
function findVoiceForCharacter(
  characterName: string,
  meta: { gender: string; age: string; accent: string; tones: string[] },
  myVoices: any[],
  usedVoiceIds: Set<string>,
  narratorVoiceId: string
): string {
  // Score all candidates
  const scored = myVoices
    .filter(v => !usedVoiceIds.has(v.voice_id) && v.voice_id !== narratorVoiceId && v.voice_id !== BELLE_B_ID)
    .map(v => ({ voice: v, score: scoreVoice(v, meta) }))
    .filter(x => x.score > -999) // Remove wrong gender
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    // Gender mismatch fallback — try any voice of right gender
    const genderFallback = myVoices.find(v =>
      !usedVoiceIds.has(v.voice_id) &&
      v.voice_id !== narratorVoiceId &&
      (v.labels?.gender?.toLowerCase() === meta.gender.toLowerCase())
    )
    if (genderFallback) {
      console.log(`  ${characterName}: gender fallback → ${genderFallback.name}`)
      return genderFallback.voice_id
    }
    console.log(`  ${characterName}: absolute fallback`)
    return narratorVoiceId
  }

  const pick = scored[0].voice
  console.log(`  ${characterName}: ${pick.name} (score:${scored[0].score}, ${pick.labels?.gender}, ${pick.labels?.age}, ${pick.labels?.accent}, ${pick.labels?.descriptive})`)
  return pick.voice_id
}

interface ScriptLine {
  index: number; speaker: string; text: string
  type: 'announcer' | 'narrator' | 'character' | 'sfx' | 'beat' | 'pause'
  isIntro: boolean; isOutro: boolean
}

interface CharacterInfo {
  name: string
  gender: 'male' | 'female' | 'unknown'
  description: string
  isProtagonist: boolean
}

function parseCharacterGuide(script: string): CharacterInfo[] {
  const chars: CharacterInfo[] = []
  const guideMatch = script.match(/CHARACTER GUIDE\s*\n---\s*\n([\s\S]*?)(?:\n---|\[START AUDIO DRAMA SCRIPT\])/i)
  if (!guideMatch) return chars
  const guideLines = guideMatch[1].split('\n').filter(l => l.trim())
  for (const line of guideLines) {
    const nameMatch = line.match(/^([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'.()/]+?)\s*(?:[—–-]|:)/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    const lower = line.toLowerCase()
    let gender: CharacterInfo['gender'] = 'unknown'
    if (lower.includes(', male') || lower.includes(' male,') || lower.includes('male ')) gender = 'male'
    if (lower.includes(', female') || lower.includes(' female,') || lower.includes('female ')) gender = 'female'
    const isProtagonist = lower.includes('protagonist') || lower.includes('narrator') || chars.length === 0
    chars.push({ name, gender, description: line, isProtagonist })
  }
  return chars
}

function characterVoiceKeys(name: string): string[] {
  const cleaned = name
    .replace(/\b(Dr|Mr|Mrs|Ms|Miss|Director|Deputy|Officer|Agent|Colonel|Captain|Lieutenant|Sergeant)\.?\b/gi, '')
    .replace(/[()]/g, ' ')
    .trim()

  const keys = new Set<string>()

  const addKeysForName = (rawName: string) => {
    const normalized = rawName.replace(/\s+/g, ' ').trim()
    const parts = normalized
      .split(/\s+/)
      .map(part => part.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'.-]/g, '').trim())
      .filter(part => part.length > 1)

    if (normalized) keys.add(normalized.toUpperCase())
    parts.forEach(part => keys.add(part.toUpperCase()))
    if (parts.length >= 2) keys.add(parts.slice(-2).join(' ').toUpperCase())
  }

  addKeysForName(cleaned)
  cleaned.split('/').forEach(alias => addKeysForName(alias))
  return Array.from(keys)
}

function assignCharacterVoice(voiceMap: Record<string, string>, characterName: string, voiceId: string) {
  characterVoiceKeys(characterName).forEach(key => {
    if (!voiceMap[key]) voiceMap[key] = voiceId
  })
}

function parseScript(script: string): ScriptLine[] {
  const lines: ScriptLine[] = []
  const rawLines = script.split('\n')
  const announcerIndices: number[] = []
  rawLines.forEach((line, i) => {
    const trimmed = line.trim()
    if (/^ANNOUNCER:\s*Belle B\s*$/i.test(trimmed)) return
    if (trimmed.match(/^(ANNOUNCER|BELLE B|SANDY):/i)) announcerIndices.push(i)
  })
  const firstAnnouncerIdx = announcerIndices[0] ?? -1
  const lastAnnouncerIdx = announcerIndices[announcerIndices.length - 1] ?? -1
  const scriptStartIdx = rawLines.findIndex(l =>
    l.includes('[START AUDIO DRAMA SCRIPT]') || l.includes('CHARACTER GUIDE')
  )
  const headerEndIdx = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1)
  const HEADER_KEYS = [
    'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
    'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
    'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
    'CHARACTER GUIDE', '---'
  ]
  let lineIndex = 0
  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }
    if (trimmed === '[BEAT]') { lines.push({ index: lineIndex++, speaker: 'BEAT', text: '0.75', type: 'beat', isIntro: false, isOutro: false }); return }
    const pauseMatch = trimmed.match(/^\[PAUSE:(\d+)\]$/)
    if (pauseMatch) { lines.push({ index: lineIndex++, speaker: 'PAUSE', text: pauseMatch[1], type: 'pause', isIntro: false, isOutro: false }); return }
    if (trimmed.startsWith('[SFX:')) { const sfxText = trimmed.replace(/^\[SFX:\s*/, '').replace(/\]$/, '').trim(); lines.push({ index: lineIndex++, speaker: 'SFX', text: sfxText, type: 'sfx', isIntro: false, isOutro: false }); return }
    // Support bracketed dialogue like [NARRATOR]: text or [COLE DRISCOLL]: text
    const bracketDm = trimmed.match(/^\[([A-Z][A-ZÀ-Ú\s'.()]+?)\]:\s*(.+)$/)
    if (bracketDm) {
      const speaker = bracketDm[1].trim(); const text = bracketDm[2].trim()
      const isAnnouncer = speaker === 'ANNOUNCER' || speaker === 'BELLE B' || speaker === 'SANDY'
      const isIntro = isAnnouncer && rawIdx === firstAnnouncerIdx
      const isOutro = isAnnouncer && rawIdx === lastAnnouncerIdx
      let type: ScriptLine['type'] = 'character'
      if (isAnnouncer) type = 'announcer'
      else if (speaker === 'NARRATOR') type = 'narrator'
      lines.push({ index: lineIndex++, speaker, text, type, isIntro, isOutro })
      return
    }
    if (trimmed.startsWith('[')) return
    // Skip ANNOUNCER intro lines that slipped through
    if (trimmed.startsWith('ANNOUNCER:') && trimmed.toLowerCase().includes('endless tales presents')) return
    const dm = trimmed.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/)
    if (dm) {
      const speaker = dm[1].trim(); const text = dm[2].trim()
      const isAnnouncer = speaker === 'ANNOUNCER' || speaker === 'BELLE B' || speaker === 'SANDY'
      const isIntro = isAnnouncer && rawIdx === firstAnnouncerIdx
      const isOutro = isAnnouncer && rawIdx === lastAnnouncerIdx
      let type: ScriptLine['type'] = 'character'
      if (isAnnouncer) type = 'announcer'
      else if (speaker === 'NARRATOR') type = 'narrator'
      lines.push({ index: lineIndex++, speaker, text, type, isIntro, isOutro })
    }
  })
  return lines
}

async function generateVoiceLine(rawText: string, voiceId: string, storyId: string, lineIndex: number, prefix: string, forceRegenerate = false, speaker = ''): Promise<string> {
  // Clean markdown and special characters before sending to ElevenLabs
  const text = rawText
    .replace(/\*+/g, '')        // remove asterisks (bold/italic markdown)
    .replace(/\_/g, '')         // remove underscores
    .replace(/#{1,6}\s/g, '')   // remove markdown headers
    .replace(/\[LISTENER_NAME\]/g, 'friend')  // fallback — split handled by generateIntroWithName
    .trim()
  const fileName = `${prefix}_${lineIndex.toString().padStart(4, '0')}.mp3`
  const cachePath = `asc3/${storyId}/${fileName}`
  const cacheUrl = `${BASE_STORAGE}/${cachePath}`
  // Skip cache for announcer lines (intro/outro) OR when force=true — these must always be fresh
  const isAnnouncer = prefix === 'intro' || prefix === 'intro_before' || prefix === 'intro_after' || prefix === 'outro'
  if (!forceRegenerate && !isAnnouncer) {
    try { const r = await fetch(cacheUrl, { method: 'HEAD' }); if (r.ok) return cacheUrl } catch {}
  }
  const generateAttempt = async (): Promise<Buffer> => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': EL_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: EL_SETTINGS })
    })
    if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const rawBuf = Buffer.from(await res.arrayBuffer())
    return normalizeSpokenBuffer(rawBuf, rawText, prefix)
  }

  let buf = await generateAttempt()
  if (prefix === 'segment') {
    let metrics = await analyzeLoudnessBuffer(buf)
    if (metrics.input_i < SEGMENT_QC_RETRY_LUFS) {
      logSegmentQc(fileName, speaker, text, metrics, 'retry_tts')
      buf = await generateAttempt()
      metrics = await analyzeLoudnessBuffer(buf)
    }
    if (metrics.input_i < SEGMENT_QC_RETRY_LUFS) {
      const gainDb = Math.max(0, Math.min(10, SEGMENT_QC_TARGET_LUFS - metrics.input_i))
      logSegmentQc(fileName, speaker, text, metrics, `apply_gain_limiter_${gainDb.toFixed(2)}dB`)
      buf = await applySegmentGainLimit(buf, gainDb)
      metrics = await analyzeLoudnessBuffer(buf)
    }
    let action = 'accept'
    if (metrics.input_i < SEGMENT_QC_HARD_FAIL_LUFS) action = 'hard_fail'
    else if (metrics.input_i < SEGMENT_QC_RETRY_LUFS) action = 'fail_after_qc'
    else if (metrics.input_i < SEGMENT_QC_WARN_LUFS) action = 'warning_low_loudness'
    logSegmentQc(fileName, speaker, text, metrics, action)
    if (metrics.input_i < SEGMENT_QC_RETRY_LUFS) {
      throw new Error(`Segment loudness QC failed for ${fileName}: ${metrics.input_i.toFixed(2)} LUFS`)
    }
  }
  const { error: ue } = await supabase.storage.from('audio').upload(cachePath, buf, { contentType: 'audio/mpeg', upsert: true })
  if (ue) throw new Error(`Upload error: ${ue.message}`)
  return cacheUrl
}

async function generateSFX(description: string, storyId: string, lineIndex: number): Promise<string | null> {
  const fileName = `sfx_${lineIndex.toString().padStart(4, '0')}.mp3`
  const cachePath = `asc3/${storyId}/${fileName}`
  const cacheUrl = `${BASE_STORAGE}/${cachePath}`
  try { const r = await fetch(cacheUrl, { method: 'HEAD' }); if (r.ok) return cacheUrl } catch {}
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': EL_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: description, duration_seconds: 3.0, prompt_influence: 0.3 })
    })
    if (!res.ok) { console.warn(`SFX failed: ${res.status}`); return null }
    const buf = Buffer.from(await res.arrayBuffer())
    await supabase.storage.from('audio').upload(cachePath, buf, { contentType: 'audio/mpeg', upsert: true })
    return cacheUrl
  } catch (e) { console.warn('SFX error:', e); return null }
}

export async function POST(req: NextRequest) {
  try {
    const { storyId, script: scriptParam, narratorVoiceId, narratorVoiceName, characterVoices } = await req.json()
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    let script = scriptParam
    if (!script) {
      const { data: row } = await supabase.from('stories').select('script').eq('id', storyId).single()
      script = row?.script
      if (!script) return NextResponse.json({ success: false, error: 'Script not found in database' }, { status: 400 })
    }
    console.log(`\n🎙 generate-voices: ${storyId}`)
    const { data: allVoices } = await supabase.from('narrator_voices').select('name,elevenlabs_voice_id')
    const voiceByName: Record<string, string> = {}
    if (allVoices) allVoices.forEach((v: any) => { voiceByName[v.name] = v.elevenlabs_voice_id })
    let resolvedNarratorVoiceId = narratorVoiceId
    if (!resolvedNarratorVoiceId && narratorVoiceName) resolvedNarratorVoiceId = voiceByName[narratorVoiceName]
    if (!resolvedNarratorVoiceId) {
      const { data: row } = await supabase.from('stories').select('narrator_voice_id,narrator_voice_name').eq('id', storyId).single()
      if (row?.narrator_voice_id) resolvedNarratorVoiceId = row.narrator_voice_id
      else if (row?.narrator_voice_name) resolvedNarratorVoiceId = voiceByName[row.narrator_voice_name]
    }
    if (!resolvedNarratorVoiceId) resolvedNarratorVoiceId = voiceByName['Cole Hargrove']
    if (!resolvedNarratorVoiceId) return NextResponse.json({ success: false, error: 'No narrator voice found' }, { status: 400 })
    const characterGuide = parseCharacterGuide(script)
    // Check if narrator IS the protagonist (first person stories)
    const narratorIsCharacter = /NARRATOR_IS_CHARACTER:\s*true/i.test(script)
    const narrativeVoice = script.match(/NARRATIVE_VOICE:\s*(\S+)/i)?.[1]?.toLowerCase() || ''
    const isFirstPerson = narrativeVoice === 'first_person' || narratorIsCharacter
    console.log(`  Narrative: ${narrativeVoice}, narratorIsCharacter: ${isFirstPerson}`)
    // Load My Voices pool once — used for all character assignments
    const myVoices = await loadMyVoices()
    console.log(`  My Voices pool: ${myVoices.length} voices`)
    const usedVoiceIds = new Set<string>([resolvedNarratorVoiceId, BELLE_B_ID])
    // Build voice map using local My Voices scoring
    const voiceMap: Record<string, string> = {}
    for (const char of characterGuide) {
      const key = char.name.toUpperCase()
      // Check if manually overridden
      if (characterVoices?.[char.name] || characterVoices?.[key]) {
        voiceMap[key] = (characterVoices[char.name] || characterVoices[key]) as string
        assignCharacterVoice(voiceMap, char.name, voiceMap[key])
        usedVoiceIds.add(voiceMap[key])
        continue
      }
      // Parse character description into EL-compatible attributes
      const meta = parseCharacterMeta(char.description || char.name)
      // Children under 12 always get female voice
      const ageNum = char.description?.match(/(\d+)/)?.[1] ? parseInt(char.description.match(/(\d+)/)![1]) : 30
      if (ageNum < 12) meta.gender = 'female'
      else if (!meta.gender) meta.gender = char.gender === 'male' ? 'male' : char.gender === 'female' ? 'female' : ''
      // First person: protagonist IS the narrator — use narrator voice
      const isProtagonist = isFirstPerson && (char.isProtagonist || characterGuide.indexOf(char) === 0)
      if (isProtagonist) {
        console.log(`  ${char.name}: protagonist = narrator voice (first person)`)
        voiceMap[key] = resolvedNarratorVoiceId
        assignCharacterVoice(voiceMap, char.name, voiceMap[key])
      } else {
        // Find best matching voice from pool
        voiceMap[key] = findVoiceForCharacter(char.name, meta, myVoices, usedVoiceIds, resolvedNarratorVoiceId)
        assignCharacterVoice(voiceMap, char.name, voiceMap[key])
        usedVoiceIds.add(voiceMap[key])
      }
    }
    // Apply any remaining manual overrides
    if (characterVoices) Object.entries(characterVoices).forEach(([name, id]) => { assignCharacterVoice(voiceMap, name, id as string) })
    console.log(`  Parsed character guide names:`, characterGuide.map(c => c.name).join(', ') || 'none')
    console.log(`  Characters:`, characterGuide.map(c => `${c.name}(${c.gender})`).join(', '))
    const lines = parseScript(script)
    const announcerLines = lines.filter(l => l.type === 'announcer')
    const introLine = announcerLines[0]
    const outroLine = announcerLines[announcerLines.length - 1]
    const storyLines = lines.filter(l => !l.isIntro && !l.isOutro)
    const nonDialogueSpeakers = new Set(['TITLE', 'AUTHOR', 'GENRE', 'DESCRIPTION', 'SERIES', 'EPISODE', 'EPISODE_TITLE', 'SUNO PROMPT', 'ANNOUNCER', 'BELLE B', 'SANDY'])
    const characterSpeakers = Array.from(new Set(storyLines
      .filter(l => l.type === 'character' && !nonDialogueSpeakers.has(l.speaker.toUpperCase()))
      .map(l => l.speaker.toUpperCase())))
    const warnings: string[] = []
    if (characterSpeakers.length > 0 && characterGuide.length === 0) {
      console.error(`  ❌ Missing character voice assignments: ${characterSpeakers.join(', ')}; no CHARACTER GUIDE entries parsed`)
      return NextResponse.json({
        success: false,
        error: 'Missing character voice assignments',
        missingCharacters: characterSpeakers,
      }, { status: 422 })
    } else {
      const missingVoiceMap = characterSpeakers.filter(speaker => !voiceMap[speaker])
      if (missingVoiceMap.length > 0) {
        console.error(`  ❌ Missing character voice assignments: ${missingVoiceMap.join(', ')}`)
        return NextResponse.json({
          success: false,
          error: 'Missing character voice assignments',
          missingCharacters: missingVoiceMap,
        }, { status: 422 })
      }
    }
    warnings.forEach(w => console.warn(`  ⚠️ ${w}`))
    const results: { intro?: string; outro?: string; segments: any[] } = { segments: [] }
    let succeeded = 0; let failed = 0

    const segmentFilePattern = /^segment_\d{4}\.mp3$/
    const storyAudioFolder = `asc3/${storyId}`
    const { data: existingAudioFiles, error: listAudioError } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
    if (listAudioError) {
      console.error('  ❌ Failed to list existing story segments:', listAudioError)
      return NextResponse.json({ success: false, error: `Failed to list existing story segments: ${listAudioError.message}` }, { status: 500 })
    }

    const staleSegmentPaths = (existingAudioFiles || [])
      .filter(file => segmentFilePattern.test(file.name))
      .map(file => `${storyAudioFolder}/${file.name}`)

    if (staleSegmentPaths.length > 0) {
      const { error: deleteAudioError } = await supabase.storage.from('audio').remove(staleSegmentPaths)
      if (deleteAudioError) {
        console.error('  ❌ Failed to delete stale story segments:', deleteAudioError)
        return NextResponse.json({ success: false, error: `Failed to delete stale story segments: ${deleteAudioError.message}` }, { status: 500 })
      }
    }
    console.log(`  Deleted stale story segments: ${staleSegmentPaths.length > 0 ? staleSegmentPaths.map(file => file.split('/').pop()).join(', ') : 'none'}`)

    if (introLine) {
      try {
        const introText = introLine.text
        if (introText.includes('[LISTENER_NAME]')) {
          // Split into before/after name
          const parts = introText.split('[LISTENER_NAME]')
          const beforeText = parts[0].trim()
          const afterText = parts[1].trim()
          const [beforeUrl, afterUrl] = await Promise.all([
            generateVoiceLine(beforeText, BELLE_B_VOICE_ID, storyId, introLine.index, 'intro_before'),
            generateVoiceLine(afterText, BELLE_B_VOICE_ID, storyId, introLine.index + 0.1, 'intro_after'),
          ])
          results.intro = beforeUrl
          await supabase.from('stories').update({ intro_before_url: beforeUrl, intro_after_url: afterUrl }).eq('id', storyId)
          console.log('  ✅ Belle B intro split (before/after name)')
        } else {
          results.intro = await generateVoiceLine(introText, BELLE_B_VOICE_ID, storyId, introLine.index, 'intro')
          await supabase.from('stories').update({ intro_before_url: results.intro, intro_after_url: null }).eq('id', storyId)
          console.log('  ✅ Belle B intro (no name split)')
        }
      } catch (e) { console.error('  ❌ Intro failed:', e) }
    }
    if (outroLine && outroLine.index !== introLine?.index) { try { results.outro = await generateVoiceLine(outroLine.text, BELLE_B_VOICE_ID, storyId, outroLine.index, 'outro'); console.log('  ✅ Belle B outro') } catch (e) { console.error('  ❌ Outro failed:', e) } }
    for (const line of storyLines) {
      if (nonDialogueSpeakers.has(line.speaker.toUpperCase())) continue
      if (line.type === 'beat' || line.type === 'pause') {
        const duration = line.type === 'beat' ? 0.75 : (parseFloat(line.text) || 1.0)
        const silFileName = 'segment_' + line.index.toString().padStart(4, '0') + '.mp3'
        const silPath = 'asc3/' + storyId + '/' + silFileName
        const silBuffer = await generateSilenceBuffer(duration)
        await supabase.storage.from('audio').upload(silPath, silBuffer, { contentType: 'audio/mpeg', upsert: true })
        const silUrl = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/audio/' + silPath
        results.segments.push({ index: line.index, speaker: line.speaker, type: line.type, duration: String(duration), url: silUrl })
        continue
      }
      if (line.type === 'sfx') { const sfxUrl = await generateSFX(line.text, storyId, line.index); results.segments.push({ index: line.index, speaker: 'SFX', type: 'sfx', url: sfxUrl || undefined }); continue }
      let voiceId = resolvedNarratorVoiceId
      if (line.type === 'character') {
        const characterVoiceId = voiceMap[line.speaker.toUpperCase()]
        if (!characterVoiceId) throw new Error(`Missing character voice assignment for ${line.speaker}`)
        voiceId = characterVoiceId
      }
      try { const url = await generateVoiceLine(line.text, voiceId, storyId, line.index, 'segment', false, line.speaker); results.segments.push({ index: line.index, speaker: line.speaker, type: line.type, url }); succeeded++ }
      catch (e) { console.error(`  ❌ Line ${line.index} (${line.speaker}):`, e); results.segments.push({ index: line.index, speaker: line.speaker, type: line.type }); failed++ }
    }
    const updates: Record<string, string> = {}
    if (results.intro) updates.intro_audio_url = results.intro
    if (results.outro) updates.outro_audio_url = results.outro
    if (Object.keys(updates).length > 0) await supabase.from('stories').update(updates).eq('id', storyId)
    // Note: intro_before_url and intro_after_url set above during intro generation
    const voiceTotal = storyLines.filter(l =>
      !nonDialogueSpeakers.has(l.speaker.toUpperCase()) &&
      (l.type === 'narrator' || l.type === 'character')
    ).length
    console.log(`  ✅ Done: ${succeeded}/${voiceTotal} lines, ${failed} failed`)
    return NextResponse.json({ success: failed === 0, intro: results.intro, outro: results.outro, segments: results.segments, stats: { total: lines.length, voice: voiceTotal, succeeded, failed }, warnings })
  } catch (err) {
    console.error('generate-voices error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
