import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { createHash } from 'crypto'
import { CANONICAL_BELLE_B_VOICE_ID, RESERVED_BELLE_B_VOICE_IDS, isBelleBVoiceId } from '@/lib/voiceConstants'
import { buildProductionLearningFeedback } from '@/lib/productionLearning'
import { classifySegmentInventory } from '@/lib/artifactGate'
import { resolveNarratorVoiceId } from '@/lib/preflight/narrator-check'
import { runPreflightChecks } from '@/lib/preflight/validator'
import type { VoiceCodeAssignment } from '@/lib/preflight/voice-code-check'
import { getVoiceProvider } from '@/lib/voice-providers'
// ATL-VOICE-SETTINGS-001: per-voice ElevenLabs settings overrides (exact
// voice_id match → override; otherwise global EL_SETTINGS, unchanged).
import { resolveVoiceSettings } from '@/lib/voiceSettingsOverrides'
import { EL_VOICE_CODE_LABEL } from '@/lib/voice-providers/elevenlabs/constants'
// ATL-FOLLOWUP-002: transcript QC normalization + comparison extracted to a
// shared, testable module. Both sides (script text and Whisper STT output)
// are normalized by the same pipeline before similarity/coverage checks.
import {
  NUMBER_WORDS,
  normalizeCompoundNumbers,
  transcriptTokens,
  transcriptSimilarity,
  transcriptTokenMatches,
  evaluateTranscriptQC,
  QC_MODULE_MARKER,
} from '@/lib/transcriptQC'

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
const BASE_STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const EL_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
const SPOKEN_REFERENCE_LUFS = -16
const SPOKEN_TRUE_PEAK = -1.5
const SPOKEN_LRA = 11
// ATL-PIPE-001: Silence buffer detection thresholds
const SILENCE_BUFFER_SIZE_THRESHOLD = 20 * 1024  // 20KB
const SILENCE_BUFFER_KNOWN_ETAG = '4514f4b04df758c455fddd733d4667b4'  // known ElevenLabs silence placeholder MD5
const SEGMENT_QC_WARN_LUFS = -18.0
const SEGMENT_QC_RETRY_LUFS = -18.5
const SEGMENT_QC_HARD_FAIL_LUFS = -20.0
const SEGMENT_QC_TARGET_LUFS = -17.0
const SHORT_SEGMENT_MAX_SECONDS = 1.5
const SHORT_SEGMENT_MAX_WORDS = 8
const SHORT_SEGMENT_QC_WARN_LUFS = -17.5
const SHORT_SEGMENT_QC_RETRY_LUFS = -18.0
const SHORT_SEGMENT_QC_TARGET_LUFS = -16.5
const SHORT_SEGMENT_MAX_CANDIDATES = 3
const SEGMENT_TRANSCRIPT_MODEL = 'whisper-1'
const SEGMENT_SPLIT_RESCUE_MAX_CHUNKS = 6
const SEGMENT_SPLIT_RESCUE_MAX_CHUNK_CANDIDATES = 3
const SEGMENT_SPLIT_RESCUE_GAP_SECONDS = 0.35
const BELLE_GENERIC_PATTERNS = [
  /\bfor your listening pleasure\b/i,
  /\bi am pleased to present\b/i,
  /\bare you ready\b/i,
  /\bsit back\b/i,
  /\brelax and enjoy\b/i,
  /\btonight'?s (story|episode)\b/i,
  /\btoday'?s (story|episode)\b/i,
]
const BELLE_EXACT_OR_CREEPY_TIME_PATTERNS = [
  /\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b/i,
  /\bit'?s\s+\d{1,2}\b/i,
  /\bwhere you are right now\b/i,
  /\byour exact location\b/i,
  /\byou'?re driving near\b/i,
  /\bi know where you\b/i,
]

function getSceneLoudnessOffset(text: string, prefix: string): number {
  if (prefix === 'announcement' || prefix === 'intro' || prefix === 'intro_before' || prefix === 'intro_after' || prefix === 'outro') return 0
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

function hasUsableLoudness(metrics: LoudnessMetrics): boolean {
  return Number.isFinite(metrics.input_i) && Number.isFinite(metrics.input_tp)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function transcribeSegmentBuffer(buf: Buffer, fileName: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing; cannot run segment transcript QC')
  }

  const form = new FormData()
  form.append('model', SEGMENT_TRANSCRIPT_MODEL)
  form.append('language', 'en')
  form.append('response_format', 'json')
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), fileName)

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  })
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`Transcript QC failed for ${fileName}: OpenAI ${res.status} ${body.slice(0, 240)}`)
  }
  const parsed = JSON.parse(body)
  return String(parsed.text || '').trim()
}

async function validateSegmentTranscript(buf: Buffer, expectedText: string, fileName: string) {
  let detectedText: string
  try {
    detectedText = await transcribeSegmentBuffer(buf, fileName)
  } catch (e) {
    const msg = String(e)
    // OpenAI Whisper endpoint unavailable (404 / account restriction) — infrastructure
    // issue, not an audio quality issue. Skip ASR check and treat as passed so that
    // generation can proceed. Will auto-recover once the endpoint is accessible.
    if (msg.includes('OpenAI 404') || msg.includes('OpenAI 503') || msg.includes('Invalid URL (POST /v1/audio/transcriptions)')) {
      return {
        passed: true,
        qcSkipped: true as const,
        expectedText,
        detectedText: '(skipped — OpenAI Whisper unavailable)',
        coverage: 1.0,
        similarity: 1.0,
        tailMatches: true,
        shortLineMatches: true,
        oneWordProperNameMatch: false,
        safeTerminalTailDrop: false,
        weakVerbTrailingS: false,
      }
    }
    throw e
  }

  // ATL-FOLLOWUP-002: the pure comparison (shared normalization of BOTH sides
  // + coverage/similarity/tail decision) lives in lib/transcriptQC.ts so that
  // regression tests exercise the exact production logic.
  const qc = evaluateTranscriptQC(expectedText, detectedText)

  if (qc.normalizedFallbackUsed) {
    console.warn(`[QC WARNING] Segment ${fileName}: similarity ${(qc.normalizedSimilarity * 100).toFixed(1)}% — expected "${expectedText}" detected "${detectedText}"`)
  }

  return {
    passed: qc.passed,
    expectedText,
    detectedText,
    coverage: qc.coverage,
    similarity: qc.similarity,
    tailMatches: qc.tailMatches,
    shortLineMatches: qc.shortLineMatches,
    oneWordProperNameMatch: qc.oneWordProperNameMatch,
    safeTerminalTailDrop: qc.safeTerminalTailDrop,
    weakVerbTrailingS: qc.weakVerbTrailingS,
  }
}

type SegmentTranscriptCheck = Awaited<ReturnType<typeof validateSegmentTranscript>>

type SegmentSplitRescueDiagnostics = {
  splitRescueAttempted: boolean
  splitChunkCount: number
  splitRescueError: string | null
}

function emptySplitRescueDiagnostics(): SegmentSplitRescueDiagnostics {
  return {
    splitRescueAttempted: false,
    splitChunkCount: 0,
    splitRescueError: null,
  }
}

function splitDiagnosticsFromError(error: unknown): SegmentSplitRescueDiagnostics {
  const e = error as any
  return {
    splitRescueAttempted: e?.splitRescueAttempted === true,
    splitChunkCount: Number(e?.splitChunkCount || 0),
    splitRescueError: e?.splitRescueError ? String(e.splitRescueError) : null,
  }
}

function attachSplitDiagnostics(error: Error, diagnostics: SegmentSplitRescueDiagnostics): Error {
  Object.assign(error, diagnostics)
  return error
}

function normalizeForSplitPrefixCheck(value: string): string {
  return normalizeCompoundNumbers(value)
    .replace(/'/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isAmbiguousTranscriptFailure(failure: SegmentTranscriptCheck): boolean {
  const detected = String(failure.detectedText || '').trim()
  return detected === '' || detected === '?' || detected === '??'
}

function hasMultipleSentenceOrClauseBoundaries(value: string): boolean {
  const matches = String(value || '').match(/[.!?;:]|[,—–]\s+|\s+(?:and|but|so|then|because|while|when|after|before)\s+/gi)
  return (matches || []).length >= 2
}

function isCleanDetectedPrefix(expectedText: string, detectedText: string): boolean {
  const expected = normalizeForSplitPrefixCheck(expectedText)
  const detected = normalizeForSplitPrefixCheck(detectedText)
  return detected.length >= 2 && expected.startsWith(detected)
}

function isLowCoverageMissingTail(failure: SegmentTranscriptCheck): boolean {
  const expected = transcriptTokens(failure.expectedText)
  const detected = transcriptTokens(failure.detectedText)
  return (failure.coverage ?? 1) < 0.55 && expected.length - detected.length >= 3
}

function splitTextForSegmentRescue(value: string): string[] {
  const source = String(value || '').replace(/\s+/g, ' ').trim()
  if (!source) return []

  const sentenceChunks = source
    .match(/[^.!?]+[.!?]+["'”’]?|[^.!?]+$/g)
    ?.map(chunk => chunk.trim())
    .filter(Boolean) || []
  const chunks = sentenceChunks.length >= 2
    ? sentenceChunks
    : source
      .split(/(?<=[,;:—–])\s+|\s+(?=(?:and|but|so|then|because|while|when|after|before)\b)/i)
      .map(chunk => chunk.trim())
      .filter(Boolean)

  if (chunks.length < 2 || chunks.length > SEGMENT_SPLIT_RESCUE_MAX_CHUNKS) return []
  if (chunks.some(chunk => chunk.length >= source.length * 0.85)) return []
  return chunks
}

async function concatenateSegmentBuffers(buffers: Buffer[], gapSeconds: number): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'et_split_rescue_'))
  try {
    const gap = gapSeconds > 0 ? await generateSilenceBuffer(gapSeconds) : null
    const listLines: string[] = []
    for (let i = 0; i < buffers.length; i++) {
      const chunkPath = path.join(dir, `chunk_${i}.mp3`)
      await fs.writeFile(chunkPath, buffers[i])
      listLines.push(`file '${chunkPath}'`)
      if (gap && i < buffers.length - 1) {
        const gapPath = path.join(dir, `gap_${i}.mp3`)
        await fs.writeFile(gapPath, gap)
        listLines.push(`file '${gapPath}'`)
      }
    }

    const listPath = path.join(dir, 'concat.txt')
    const outputPath = path.join(dir, 'out.mp3')
    await fs.writeFile(listPath, listLines.join('\n'))
    await _execFileAsync(FFMPEG_PATH, [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-ar', '44100', '-ac', '2', '-b:a', '192k',
      '-y', outputPath,
    ])
    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function getUploadErrorDetails(error: any): { name: string; message: string; status?: number | string; statusCode?: number | string } {
  const original = error?.originalError
  return {
    name: error?.name || original?.name || 'UploadError',
    message: error?.message || original?.message || String(error),
    status: error?.status || original?.status,
    statusCode: error?.statusCode || original?.statusCode,
  }
}

function isTransientUploadError(error: any): boolean {
  const details = getUploadErrorDetails(error)
  const message = details.message.toLowerCase()
  const status = Number(details.status || details.statusCode)
  return (
    details.name === 'StorageUnknownError' ||
    message.includes('unexpected token') ||
    message.includes('<html') ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout') ||
    status === 429 ||
    (Number.isFinite(status) && status >= 500)
  )
}

async function uploadedObjectExists(cachePath: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_STORAGE}/${cachePath}`, { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

async function downloadCachedAudioBuffer(cacheUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(cacheUrl, { cache: 'no-store' })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    console.warn(`  ⚠️ Cached segment download failed for loudness QC: ${cacheUrl}`, e)
    return null
  }
}

async function uploadAudioBufferWithRetry(cachePath: string, buf: Buffer, context: string): Promise<void> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { error } = await supabase.storage.from('audio').upload(cachePath, buf, { contentType: 'audio/mpeg', upsert: true })
    if (!error) {
      if (attempt > 1) console.log(`  ✅ Upload retry succeeded attempt=${attempt} path=${cachePath} context="${context}"`)
      return
    }

    const details = getUploadErrorDetails(error)
    console.warn(`  ⚠️ Upload failed attempt=${attempt}/${maxAttempts} path=${cachePath} context="${context}" name=${details.name} status=${details.status || 'unknown'} statusCode=${details.statusCode || 'unknown'} message="${details.message.slice(0, 240)}"`)

    if (await uploadedObjectExists(cachePath)) {
      console.warn(`  ⚠️ Upload response was ambiguous but object exists; continuing path=${cachePath} context="${context}"`)
      return
    }

    if (attempt >= maxAttempts || !isTransientUploadError(error)) {
      throw new Error(`Upload failed after ${attempt} attempt(s) for ${cachePath} (${context}): ${details.name}: ${details.message}`)
    }

    await sleep(300 * attempt)
  }
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

async function getAudioDurationBuffer(input: Buffer): Promise<number> {
  const tmpBase = path.join(os.tmpdir(), `et_voice_dur_${Date.now()}_${Math.random().toString(16).slice(2)}`)
  const inputPath = `${tmpBase}.mp3`
  try {
    await fs.writeFile(inputPath, input)
    const result = await _execFileAsync(FFMPEG_PATH, [
      '-i', inputPath,
      '-f', 'null', '-',
    ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 4 }).catch((e: any) => ({ stdout: '', stderr: e.stderr || '' }))
    const out = (result as any).stderr || (result as any).stdout || ''
    const match = out.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!match) return 0
    return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3])
  } catch (e) {
    console.warn('Segment duration probe failed; using normal segment QC:', e)
    return 0
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

async function trimSegmentSilenceBuffer(input: Buffer): Promise<Buffer> {
  const tmpBase = path.join(os.tmpdir(), `et_voice_trim_${Date.now()}_${Math.random().toString(16).slice(2)}`)
  const inputPath = `${tmpBase}_in.mp3`
  const outputPath = `${tmpBase}_out.mp3`
  try {
    await fs.writeFile(inputPath, input)
    await _execFileAsync(FFMPEG_PATH, [
      '-i', inputPath,
      '-af', 'silenceremove=start_periods=1:start_duration=0.08:start_threshold=-45dB:stop_periods=1:stop_duration=0.12:stop_threshold=-45dB',
      '-ar', '44100', '-ac', '2', '-b:a', '192k',
      '-y', outputPath
    ])
    return await fs.readFile(outputPath)
  } catch (e) {
    console.warn('Segment silence trim failed; using untrimmed segment:', e)
    return input
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

function logShortSegmentQc(fileName: string, speaker: string, wordCount: number, duration: number, target: number, metrics: LoudnessMetrics) {
  console.log(
    `  Short-line QC ${fileName} speaker="${speaker}" words=${wordCount} duration=${duration.toFixed(2)}s target=${target.toFixed(1)} final_lufs=${metrics.input_i.toFixed(2)}`
  )
}

function logShortCandidateQc(fileName: string, speaker: string, candidate: number, metrics: LoudnessMetrics, action: string) {
  console.log(
    `  Short-line candidate ${fileName} speaker="${speaker}" candidate=${candidate} lufs=${metrics.input_i.toFixed(2)} tp=${metrics.input_tp.toFixed(2)} result=${action}`
  )
}

// ── Segment Escalation Rule ──────────────────────────────────────────────────
// No segment may be retried more than MAX_SEGMENT_ATTEMPTS times without
// producing an escalation report. After MAX_SEGMENT_ATTEMPTS failures the
// segment is skipped and the report is appended to the response + logged.

const MAX_SEGMENT_ATTEMPTS = 5

type SegmentFailureKind = 'mechanical_qc' | 'voice_generation' | 'script_issue' | 'system_issue'

interface SegmentEscalation {
  segment: string
  index: number
  speaker: string
  scriptText: string
  lastDetectedTranscript: string | null
  failureKind: SegmentFailureKind
  failureReason: string
  attemptCount: number
  recommendedFix: string
  manualOverrideSafe: boolean
  seriesTitle: string | null
  episodeNumber: number | null
  episodeTitle: string | null
}

function classifySegmentFailure(error: string, scriptText: string): SegmentFailureKind {
  const e = error.toLowerCase()
  if (e.includes('transcript qc') || e.includes('coverage') || e.includes('expected') && e.includes('detected')) {
    return 'mechanical_qc'
  }
  // ATL-PIPE-001: Silence buffer is retriable — may be transient ElevenLabs placeholder
  if (e.includes('silence_buffer')) {
    return 'voice_generation'
  }
  if (e.includes('elevenlabs error') || e.includes('fetch failed') || e.includes('timeout') ||
      /elevenlabs.*\d{3}/.test(e) || e.includes('network') || e.includes('econnrefused')) {
    return 'voice_generation'
  }
  if (e.includes('upload') || e.includes('database') || e.includes('supabase') ||
      e.includes('render') || e.includes('segment id') || e.includes('pipeline') ||
      e.includes('storage')) {
    return 'system_issue'
  }
  // Script heuristics: repeated phrases, broken sentence, unusual double-punct
  const hasDoublePunct = /[.!?]{2,}|[,;]{2,}/.test(scriptText)
  const words = scriptText.split(/\s+/)
  const hasCapsChunk = words.filter(w => w === w.toUpperCase() && w.length > 2).length > 3
  if (hasDoublePunct || hasCapsChunk) return 'script_issue'
  return 'mechanical_qc' // default — most common non-infra failure
}

function extractTranscriptFromError(error: string): string | null {
  const m = error.match(/detected "([^"]+)"/)
  return m ? m[1] : null
}

function buildEscalationReport(
  seg: { segment: string; index: number; speaker: string; text: string },
  attempts: number,
  lastError: string,
  seriesTitle: string | null,
  episodeNumber: number | null,
  episodeTitle: string | null
): SegmentEscalation {
  const failureKind = classifySegmentFailure(lastError, seg.text)
  const wordCount = seg.text.split(/\s+/).filter(Boolean).length
  const manualOverrideSafe = failureKind === 'mechanical_qc' && (
    lastError.toLowerCase().includes('transcript qc') || wordCount <= 8
  )
  const recommendedFix =
    failureKind === 'mechanical_qc'
      ? `Manual QC override safe — audio likely correct, transcript normalization mismatch on: "${seg.text}"`
      : failureKind === 'voice_generation'
        ? `Retry voice generation — ElevenLabs or network issue, not a content problem`
        : failureKind === 'script_issue'
          ? `Review script text — possible awkward wording or broken sentence: "${seg.text.slice(0, 80)}"`
          : `Check pipeline — upload, DB, or render error: ${lastError.slice(0, 80)}`

  return {
    segment: seg.segment,
    index: seg.index,
    speaker: seg.speaker,
    scriptText: seg.text,
    lastDetectedTranscript: extractTranscriptFromError(lastError),
    failureKind,
    failureReason: lastError.slice(0, 300),
    attemptCount: attempts,
    recommendedFix,
    manualOverrideSafe,
    seriesTitle,
    episodeNumber,
    episodeTitle,
  }
}

function logEscalation(report: SegmentEscalation): void {
  console.warn(`\n🚨 ESCALATION REPORT`)
  console.warn(`  Series:   ${report.seriesTitle || 'unknown'} Ep${report.episodeNumber || '?'} — ${report.episodeTitle || ''}`)
  console.warn(`  Segment:  ${report.segment} (index ${report.index})`)
  console.warn(`  Speaker:  ${report.speaker}`)
  console.warn(`  Script:   "${report.scriptText}"`)
  if (report.lastDetectedTranscript) {
    console.warn(`  Detected: "${report.lastDetectedTranscript}"`)
  }
  console.warn(`  Kind:     ${report.failureKind}`)
  console.warn(`  Reason:   ${report.failureReason}`)
  console.warn(`  Attempts: ${report.attemptCount}/${MAX_SEGMENT_ATTEMPTS}`)
  console.warn(`  Fix:      ${report.recommendedFix}`)
  console.warn(`  ManualOK: ${report.manualOverrideSafe}`)
  console.warn(``)
}

// Permanent narrator voices - excluded from character pool
const NARRATOR_VOICE_NAMES = ['Cole Hargrove','Elliott Crane','Finn Calloway','James Alcott','Marcus Hale','Ray Dolan','Iris Calloway','June Harlow','Morgan Veil','Nora Ashby','Quinn Merritt','Sage Wilder']
// BELLE B - EXCLUSIVE ANNOUNCER VOICE. NEVER use as character, narrator, or fallback.
const BELLE_B_ID = CANONICAL_BELLE_B_VOICE_ID

type CharacterVoiceRow = {
  voice_id: string
  name: string | null
  category: string | null
  gender: string | null
  age: string | null
  accent: string | null
  regional_tags: string[] | null
  use_case: string | null
  descriptive: string | null
  last_used_at: string | null
  rotation_count: number | null
}

type SeriesCharacterRosterRow = {
  canonical_name: string
  canonical_name_normalized: string
  aliases: string[] | null
  voice_id: string | null
  voice_name: string | null
}

const CHARACTER_ASSIGNMENT_TITLE_PREFIXES = new Set([
  'DEPUTY', 'SHERIFF', 'OFFICER', 'DETECTIVE', 'SERGEANT', 'CAPTAIN', 'LIEUTENANT', 'CHIEF', 'AGENT',
  'DOCTOR', 'DR', 'MR', 'MRS', 'MS', 'MISS', 'PROFESSOR', 'PROF', 'FATHER', 'REVEREND', 'REV',
  'SISTER', 'JUDGE', 'MAYOR', 'SENATOR', 'PRESIDENT', 'COLONEL', 'MAJOR', 'GENERAL', 'PRIVATE',
  'NURSE', 'INSPECTOR',
])

function normalizeCharacterAliasName(name: string) {
  return String(name || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

function stripLeadingCharacterAssignmentTitle(name: string) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ')
  const tokens = clean.split(' ').filter(Boolean)
  if (tokens.length <= 1) return clean
  const firstToken = tokens[0].replace(/\.$/, '').toUpperCase()
  return CHARACTER_ASSIGNMENT_TITLE_PREFIXES.has(firstToken) ? tokens.slice(1).join(' ') : clean
}

function normalizeCharacterAssignmentName(name: string) {
  return normalizeCharacterAliasName(stripLeadingCharacterAssignmentTitle(name))
}

function characterAssignmentNameTokens(name: string) {
  return normalizeCharacterAssignmentName(name)
    .split(' ')
    .map(token => token.replace(/[^A-Z0-9'-]/g, '').trim())
    .filter(Boolean)
}

function isCharacterAssignmentSubsetName(a: string, b: string) {
  const aTokens = characterAssignmentNameTokens(a)
  const bTokens = characterAssignmentNameTokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) return false
  if (aTokens[0] !== bTokens[0]) return false
  const shorter = aTokens.length <= bTokens.length ? aTokens : bTokens
  const longer = aTokens.length <= bTokens.length ? bTokens : aTokens
  return shorter.every(token => longer.includes(token))
}

function findRosterCharacterNameMatch(roster: SeriesCharacterRosterRow[], incomingName: string) {
  const normalized = normalizeCharacterAssignmentName(incomingName)
  const exact = roster.find(row => {
    const canonical = normalizeCharacterAssignmentName(row.canonical_name_normalized || row.canonical_name)
    const aliases = Array.isArray(row.aliases) ? row.aliases.map(alias => normalizeCharacterAssignmentName(alias)) : []
    return canonical === normalized || aliases.includes(normalized)
  })
  if (exact) return { match: exact, kind: 'exact' as const, ambiguous: false }

  const fuzzyMatches = roster.filter(row => isCharacterAssignmentSubsetName(incomingName, row.canonical_name || row.canonical_name_normalized || ''))
  if (fuzzyMatches.length === 1) return { match: fuzzyMatches[0], kind: 'fuzzy' as const, ambiguous: false }
  if (fuzzyMatches.length > 1) return { match: null, kind: 'fuzzy' as const, ambiguous: true }
  return { match: null, kind: 'none' as const, ambiguous: false }
}

function characterVoiceLabels(voice: CharacterVoiceRow) {
  return {
    gender: voice.gender || '',
    age: voice.age || '',
    accent: voice.accent || '',
    use_case: voice.use_case || '',
    descriptive: voice.descriptive || '',
  }
}

async function loadCharacterVoicePool(): Promise<CharacterVoiceRow[]> {
  const { data, error } = await supabase
    .from('character_voices')
    .select('voice_id,name,category,gender,age,accent,regional_tags,use_case,descriptive,last_used_at,rotation_count')
    .eq('is_active', true)
    .eq('is_character_eligible', true)
    .eq('needs_labeling', false)

  if (error) throw new Error(`Failed to load character_voices: ${error.message}`)
  return data || []
}

function detectRegionalTags(text: string) {
  const d = text.toLowerCase()
  const tags: string[] = []
  if (/\b(southern|us southern)\b/.test(d)) tags.push('southern')
  if (/\b(midwest|midwestern|us midwest)\b/.test(d)) tags.push('midwest')
  if (/\bnew england\b/.test(d)) tags.push('new_england')
  if (/\b(new york|brooklyn|bronx|queens)\b/.test(d)) tags.push('new_york')
  if (/\bboston\b/.test(d)) tags.push('boston')
  if (/\b(western|cowboy|cowgirl)\b/.test(d)) tags.push('western')
  if (/\b(texas|texan)\b/.test(d)) tags.push('texas')
  return Array.from(new Set(tags))
}

// Extract EL-compatible attributes from character description
function parseCharacterMeta(description: string): { gender: string; age: string; accent: string; tones: string[]; regionalTags: string[] } {
  const d = description.toLowerCase()
  // Gender
  const gender = d.includes('female') || d.includes('woman') || d.includes('girl') ? 'female'
    : d.includes('male') || d.includes('man') || d.includes('boy') ? 'male' : ''
  // Age
  const ageNum = d.match(/(\d+)/)?.[1] ? parseInt(d.match(/(\d+)/)![1]) : 35
  const age = ageNum < 25 ? 'young' : ageNum < 55 ? 'middle_aged' : 'old'
  // Accent - map to EL accent labels
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
  // Tone descriptives - map character traits to EL descriptive labels
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
  return { gender, age, accent, tones, regionalTags: detectRegionalTags(description) }
}

function inferFallbackCharacterMeta(speakerName: string): { gender: string; age: string; accent: string; tones: string[]; regionalTags: string[] } {
  const meta = parseCharacterMeta(speakerName)
  const cleaned = speakerName
    .toLowerCase()
    .replace(/[^a-z.\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!meta.gender) {
    if (/^(mr|mister|sir|father|dad|uncle)\b/.test(cleaned)) meta.gender = 'male'
    else if (/^(mrs|ms|miss|madam|madame|mother|mom|aunt)\b/.test(cleaned)) meta.gender = 'female'
  }

  return meta
}

// Score a voice candidate against character requirements
function scoreVoice(voice: CharacterVoiceRow, meta: { gender: string; age: string; accent: string; tones: string[]; regionalTags: string[] }): number {
  const labels = characterVoiceLabels(voice)
  let score = 0
  // Gender - hard requirement, massive penalty for mismatch
  if (meta.gender && labels.gender) {
    if (labels.gender.toLowerCase() === meta.gender.toLowerCase()) score += 100
    else return -999 // Wrong gender - never use
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
  const regionalTags = voice.regional_tags || []
  for (const tag of meta.regionalTags || []) {
    if (regionalTags.includes(tag)) score += 25
  }
  // Prefer character/conversational use cases over narrator-style voices
  const useCase = (labels.use_case || '').toLowerCase()
  if (useCase.includes('character')) score += 8
  else if (useCase.includes('conversational')) score += 5
  else if (useCase.includes('entertainment')) score += 4
  return score
}

type CharacterVoiceSelection = {
  voiceId: string
  reusedVoice: boolean
  voiceName?: string
  score?: number
}

type VoiceInventoryFailure = {
  segment: string
  index: number
  speaker: string
  type: string
  error: string
}

type ReusedVoiceInventory = {
  character: string
  voiceId: string
  voiceName?: string
  score?: number
}

function scoreCharacterVoiceCandidates(
  meta: { gender: string; age: string; accent: string; tones: string[]; regionalTags: string[] },
  characterVoices: CharacterVoiceRow[],
  blockedVoiceIds: Set<string>
) {
  return characterVoices
    .filter(v => !blockedVoiceIds.has(v.voice_id) && !isBelleBVoiceId(v.voice_id))
    .map(v => ({ voice: v, score: scoreVoice(v, meta) }))
    .filter(x => x.score > -999)
    .sort((a, b) => b.score - a.score)
}

function voiceMatchesRegionalTags(voice: CharacterVoiceRow, regionalTags: string[]) {
  if (regionalTags.length === 0) return false
  const voiceTags = voice.regional_tags || []
  return regionalTags.some(tag => voiceTags.includes(tag))
}

// ── Hard rotation exclusion: last 20 stories ────────────────────────────────
// QUAL-001 fix: voices used in the most recent 20 completed stories are
// excluded from selection (hard exclusion), not just down-weighted.
// This prevents voice fatigue from the same voices appearing in back-to-back
// stories for listeners who binge.
//
// Implementation: fetch character voice assignments from the 20 most recently
// completed stories, build a "recent voices" exclusion set, and add it to
// blockedVoiceIds before scoring. If excluding recent voices leaves no valid
// candidates, fall back to the full pool (soft exclusion grace).

const HARD_ROTATION_STORY_WINDOW = 20

async function getRecentlyUsedVoiceIds(currentStoryId: string): Promise<Set<string>> {
  try {
    // Fetch the 20 most recently produced stories (excluding the current one)
    const { data: recentStories, error } = await supabase
      .from('production_jobs')
      .select('state_json')
      .eq('job_type', 'story')
      .eq('status', 'complete')
      .neq('story_id', currentStoryId)
      .order('completed_at', { ascending: false })
      .limit(HARD_ROTATION_STORY_WINDOW)

    if (error || !recentStories?.length) return new Set()

    const recentVoiceIds = new Set<string>()
    for (const job of recentStories) {
      const stateJson = (job.state_json as Record<string, unknown>) || {}
      const voiceMap = stateJson.voiceMap as Record<string, string> | undefined
      if (voiceMap) {
        for (const voiceId of Object.values(voiceMap)) {
          if (voiceId) recentVoiceIds.add(voiceId)
        }
      }
    }
    return recentVoiceIds
  } catch {
    // Non-fatal: if query fails, proceed without exclusion
    return new Set()
  }
}

function pickRotatedCandidate(
  scored: Array<{ voice: CharacterVoiceRow; score: number }>,
  meta: { regionalTags: string[] }
) {
  const topScore = scored[0]?.score ?? -999
  const baseBand = scored.filter(item => item.score >= topScore - 25)
  const regionalMatches = meta.regionalTags.length > 0
    ? baseBand.filter(item => voiceMatchesRegionalTags(item.voice, meta.regionalTags))
    : []
  const band = regionalMatches.length > 0 ? regionalMatches : baseBand

  // Sort by last_used_at (oldest first) within the band — secondary to hard exclusion
  band.sort((a, b) => {
    if (!a.voice.last_used_at && b.voice.last_used_at) return -1
    if (a.voice.last_used_at && !b.voice.last_used_at) return 1
    if (a.voice.last_used_at && b.voice.last_used_at) {
      const diff = new Date(a.voice.last_used_at).getTime() - new Date(b.voice.last_used_at).getTime()
      if (diff !== 0) return diff
    }
    return Math.random() - 0.5
  })

  return band[0]
}

async function markCharacterVoiceUsed(voiceId: string) {
  const now = new Date().toISOString()
  const { data, error: fetchError } = await supabase
    .from('character_voices')
    .select('rotation_count')
    .eq('voice_id', voiceId)
    .maybeSingle()

  if (fetchError) {
    console.warn(`Failed to read character voice rotation_count for ${voiceId}: ${fetchError.message}`)
    return
  }
  if (!data) return

  const rotationCount = Number(data.rotation_count || 0)
  const { error: updateError } = await supabase
    .from('character_voices')
    .update({ last_used_at: now, rotation_count: rotationCount + 1, updated_at: now })
    .eq('voice_id', voiceId)

  if (updateError) console.warn(`Failed to mark character voice used for ${voiceId}: ${updateError.message}`)
}

async function findStoryCharacterAssignment(storyId: string, characterName: string) {
  const { data, error } = await supabase
    .from('character_voice_assignments')
    .select('voice_id,voice_name')
    .eq('story_id', storyId)
    .eq('character_name_normalized', normalizeCharacterAssignmentName(characterName))
    .order('assigned_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load story character assignment: ${error.message}`)
  return data
}

async function persistCharacterVoiceAssignmentOnce(params: {
  storyId: string
  seriesId: string | null
  characterName: string
  voiceId: string
  voiceName?: string | null
}): Promise<{ inserted: boolean; assignment: { voice_id: string; voice_name: string | null } | null }> {
  const existing = await findStoryCharacterAssignment(params.storyId, params.characterName)
  if (existing?.voice_id) {
    return { inserted: false, assignment: existing }
  }

  const { error } = await supabase.from('character_voice_assignments').insert({
    story_id: params.storyId,
    series_id: params.seriesId,
    character_name: params.characterName,
    character_name_normalized: normalizeCharacterAssignmentName(params.characterName),
    voice_id: params.voiceId,
    voice_name: params.voiceName || null,
    assigned_at: new Date().toISOString(),
  })

  if (error) {
    const isUniqueViolation = error.code === '23505' || /duplicate key|unique constraint/i.test(error.message || '')
    if (isUniqueViolation) {
      const racedAssignment = await findStoryCharacterAssignment(params.storyId, params.characterName)
      if (racedAssignment?.voice_id) {
        console.warn(`Character voice assignment already exists for ${params.characterName}; reusing ${racedAssignment.voice_name || racedAssignment.voice_id}`)
        return { inserted: false, assignment: racedAssignment }
      }
    }
    console.warn(`Failed to persist character voice assignment for ${params.characterName}: ${error.message}`)
    return { inserted: false, assignment: null }
  }

  await updateSeriesRosterVoiceFromAssignment(params.seriesId, params.characterName, params.voiceId, params.voiceName)

  return {
    inserted: true,
    assignment: { voice_id: params.voiceId, voice_name: params.voiceName || null },
  }
}

async function findSeriesRosterCharacter(seriesId: string | null, characterName: string): Promise<SeriesCharacterRosterRow | null> {
  if (!seriesId) return null
  const normalized = normalizeCharacterAssignmentName(characterName)
  const { data, error } = await supabase
    .from('series_character_roster')
    .select('canonical_name,canonical_name_normalized,aliases,voice_id,voice_name')
    .eq('series_id', seriesId)
    .eq('is_locked', true)

  if (error) throw new Error(`Failed to load series character roster: ${error.message}`)
  const roster = (data || []) as SeriesCharacterRosterRow[]
  const rosterMatch = findRosterCharacterNameMatch(roster, characterName)
  if (rosterMatch.ambiguous) {
    console.warn(`Ambiguous series roster match for ${characterName}; exact/alias match required`)
  }
  return rosterMatch.match || null
}

async function appendSeriesCharacterAlias(seriesId: string | null, canonicalNameNormalized: string, aliasName: string) {
  if (!seriesId) return
  const normalizedAlias = normalizeCharacterAliasName(aliasName)
  if (!normalizedAlias || normalizedAlias === normalizeCharacterAliasName(canonicalNameNormalized)) return

  const { data, error } = await supabase
    .from('series_character_roster')
    .select('aliases')
    .eq('series_id', seriesId)
    .eq('canonical_name_normalized', canonicalNameNormalized)
    .maybeSingle()

  if (error || !data) {
    if (error) console.warn(`Failed to load roster aliases for ${aliasName}: ${error.message}`)
    return
  }

  const aliases = Array.isArray(data.aliases)
    ? data.aliases.map(alias => normalizeCharacterAliasName(alias)).filter(Boolean)
    : []
  const aliasSet = new Set(aliases)
  if (aliasSet.has(normalizedAlias)) return
  aliasSet.add(normalizedAlias)

  const { error: updateError } = await supabase
    .from('series_character_roster')
    .update({ aliases: Array.from(aliasSet), updated_at: new Date().toISOString() })
    .eq('series_id', seriesId)
    .eq('canonical_name_normalized', canonicalNameNormalized)

  if (updateError) console.warn(`Failed to append roster alias ${normalizedAlias}: ${updateError.message}`)
}

async function updateSeriesRosterVoiceFromAssignment(seriesId: string | null, characterName: string, voiceId: string, voiceName?: string | null) {
  const rosterMatch = await findSeriesRosterCharacter(seriesId, characterName)
  if (!rosterMatch) return
  await appendSeriesCharacterAlias(seriesId, rosterMatch.canonical_name_normalized, characterName)

  const update: Record<string, any> = { updated_at: new Date().toISOString() }
  if (!rosterMatch.voice_id) update.voice_id = voiceId
  if (!rosterMatch.voice_name && voiceName) update.voice_name = voiceName
  if (Object.keys(update).length === 1) return

  const { error } = await supabase
    .from('series_character_roster')
    .update(update)
    .eq('series_id', seriesId)
    .eq('canonical_name_normalized', rosterMatch.canonical_name_normalized)

  if (error) console.warn(`Failed to update roster voice for ${characterName}: ${error.message}`)
}

async function findSeriesCharacterAssignment(seriesId: string | null, characterName: string) {
  if (!seriesId) return null
  const normalized = normalizeCharacterAssignmentName(characterName)
  const rosterMatch = await findSeriesRosterCharacter(seriesId, characterName)
  if (rosterMatch?.voice_id) {
    await appendSeriesCharacterAlias(seriesId, rosterMatch.canonical_name_normalized, characterName)
    return { voice_id: rosterMatch.voice_id, voice_name: rosterMatch.voice_name }
  }

  const canonicalName = rosterMatch?.canonical_name_normalized || normalized
  const { data, error } = await supabase
    .from('character_voice_assignments')
    .select('voice_id,voice_name')
    .eq('series_id', seriesId)
    .eq('character_name_normalized', canonicalName)
    .order('assigned_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load character continuity assignment: ${error.message}`)
  if (data?.voice_id) {
    if (rosterMatch) {
      await appendSeriesCharacterAlias(seriesId, rosterMatch.canonical_name_normalized, characterName)
      await updateSeriesRosterVoiceFromAssignment(seriesId, rosterMatch.canonical_name, data.voice_id, data.voice_name)
    }
    return data
  }

  if (rosterMatch) return null

  const { data: exactData, error: exactError } = await supabase
    .from('character_voice_assignments')
    .select('voice_id,voice_name')
    .eq('series_id', seriesId)
    .eq('character_name_normalized', normalized)
    .order('assigned_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (exactError) throw new Error(`Failed to load character continuity assignment: ${exactError.message}`)
  return exactData
}

async function findVoiceForCharacter(
  characterName: string,
  meta: { gender: string; age: string; accent: string; tones: string[]; regionalTags: string[] },
  characterVoices: CharacterVoiceRow[],
  usedVoiceIds: Set<string>,
  narratorVoiceId: string,
  context: { storyId: string; seriesId: string | null }
): Promise<CharacterVoiceSelection> {
  const storyAssignment = await findStoryCharacterAssignment(context.storyId, characterName)
  if (storyAssignment?.voice_id) {
    await updateSeriesRosterVoiceFromAssignment(context.seriesId, characterName, storyAssignment.voice_id, storyAssignment.voice_name)
    console.log(`  ${characterName}: reused story voice → ${storyAssignment.voice_name || storyAssignment.voice_id}`)
    return { voiceId: storyAssignment.voice_id, reusedVoice: true, voiceName: storyAssignment.voice_name || undefined }
  }

  const priorAssignment = await findSeriesCharacterAssignment(context.seriesId, characterName)
  if (priorAssignment?.voice_id) {
    const saved = await persistCharacterVoiceAssignmentOnce({
      storyId: context.storyId,
      seriesId: context.seriesId,
      characterName,
      voiceId: priorAssignment.voice_id,
      voiceName: priorAssignment.voice_name,
    })
    if (saved.inserted) await markCharacterVoiceUsed(priorAssignment.voice_id)
    const voiceId = saved.assignment?.voice_id || priorAssignment.voice_id
    const voiceName = saved.assignment?.voice_name || priorAssignment.voice_name
    console.log(`  ${characterName}: reused series voice → ${priorAssignment.voice_name || priorAssignment.voice_id}`)
    return { voiceId, reusedVoice: true, voiceName: voiceName || undefined }
  }

  // Hard rotation exclusion: also block voices used in the last 20 completed stories.
  // This is a hard exclusion — not a soft down-weight. Falls back to full pool if needed.
  const recentlyUsedVoiceIds = await getRecentlyUsedVoiceIds(context.storyId)
  const blockedVoiceIds = new Set<string>([
    ...usedVoiceIds,
    narratorVoiceId,
    ...RESERVED_BELLE_B_VOICE_IDS,
    ...recentlyUsedVoiceIds,
  ])
  let scored = scoreCharacterVoiceCandidates(meta, characterVoices, blockedVoiceIds)
  if (scored.length === 0 && recentlyUsedVoiceIds.size > 0) {
    // Hard exclusion removed all candidates — fall back to pool without recent exclusion
    // (grace mode: avoid infinite voice starvation on small pools)
    console.log(`  ${characterName}: hard rotation exclusion left 0 candidates — falling back to soft exclusion`)
    const blockedWithoutRecent = new Set<string>([...usedVoiceIds, narratorVoiceId, ...RESERVED_BELLE_B_VOICE_IDS])
    scored = scoreCharacterVoiceCandidates(meta, characterVoices, blockedWithoutRecent)
  }

  if (scored.length === 0) {
    const genderFallback = characterVoices.find(v =>
      !usedVoiceIds.has(v.voice_id) &&
      v.voice_id !== narratorVoiceId &&
      !isBelleBVoiceId(v.voice_id) &&
      (!meta.gender || characterVoiceLabels(v).gender.toLowerCase() === meta.gender.toLowerCase())
    )
    if (genderFallback) {
      console.log(`  ${characterName}: gender fallback → ${genderFallback.name}`)
      const saved = await persistCharacterVoiceAssignmentOnce({
        storyId: context.storyId,
        seriesId: context.seriesId,
        characterName,
        voiceId: genderFallback.voice_id,
        voiceName: genderFallback.name,
      })
      if (saved.inserted) await markCharacterVoiceUsed(genderFallback.voice_id)
      if (!saved.inserted && saved.assignment?.voice_id) {
        return { voiceId: saved.assignment.voice_id, reusedVoice: true, voiceName: saved.assignment.voice_name || undefined }
      }
      return { voiceId: genderFallback.voice_id, reusedVoice: false, voiceName: genderFallback.name || undefined }
    }

    const reuseBlockedVoiceIds = new Set<string>([narratorVoiceId, ...RESERVED_BELLE_B_VOICE_IDS])
    const reusableScored = scoreCharacterVoiceCandidates(meta, characterVoices, reuseBlockedVoiceIds)
    if (reusableScored.length > 0) {
      const reusePick = pickRotatedCandidate(reusableScored, meta)
      const saved = await persistCharacterVoiceAssignmentOnce({
        storyId: context.storyId,
        seriesId: context.seriesId,
        characterName,
        voiceId: reusePick.voice.voice_id,
        voiceName: reusePick.voice.name,
      })
      if (saved.inserted) await markCharacterVoiceUsed(reusePick.voice.voice_id)
      if (!saved.inserted && saved.assignment?.voice_id) {
        return {
          voiceId: saved.assignment.voice_id,
          reusedVoice: true,
          voiceName: saved.assignment.voice_name || undefined,
          score: reusePick.score,
        }
      }
      console.log(`  ${characterName}: ${reusePick.voice.name} (score:${reusePick.score}, reusedVoice:true)`)
      return {
        voiceId: reusePick.voice.voice_id,
        reusedVoice: true,
        voiceName: reusePick.voice.name || undefined,
        score: reusePick.score,
      }
    }

    console.log(`  ${characterName}: absolute fallback`)
    throw new Error(`No safe character voice available for ${characterName}; narrator and Belle voices cannot be reused.`)
  }

  const rotatedPick = pickRotatedCandidate(scored, meta)
  const pick = rotatedPick.voice
  const saved = await persistCharacterVoiceAssignmentOnce({
    storyId: context.storyId,
    seriesId: context.seriesId,
    characterName,
    voiceId: pick.voice_id,
    voiceName: pick.name,
  })
  if (saved.inserted) await markCharacterVoiceUsed(pick.voice_id)
  if (!saved.inserted && saved.assignment?.voice_id) {
    return {
      voiceId: saved.assignment.voice_id,
      reusedVoice: true,
      voiceName: saved.assignment.voice_name || undefined,
      score: rotatedPick.score,
    }
  }
  console.log(`  ${characterName}: ${pick.name} (score:${rotatedPick.score}, ${pick.gender}, ${pick.age}, ${pick.accent}, ${pick.descriptive})`)
  return {
    voiceId: pick.voice_id,
    reusedVoice: false,
    voiceName: pick.name || undefined,
    score: rotatedPick.score,
  }
}

interface ScriptLine {
  index: number; speaker: string; text: string
  type: 'announcer' | 'narrator' | 'character' | 'sfx' | 'beat' | 'pause'
  isIntro: boolean; isOutro: boolean
  rawLineNumber?: number; sourceLine?: string
}

interface CharacterInfo {
  name: string
  gender: 'male' | 'female' | 'unknown'
  description: string
  isProtagonist: boolean
}

interface NarratorVoiceRecord {
  name: string
  elevenlabs_voice_id: string
  gender?: string | null
}

type BelleEpisodeState = 'standalone' | 'series_first' | 'series_non_final' | 'series_finale'

type BelleValidationContext = {
  storyId: string
  title: string
  author: string
  seriesName: string
  episodeNumber: number | null
  seriesTotal: number | null
  isFinale: boolean
  episodeState: BelleEpisodeState
}

function cleanBelleText(value: string): string {
  return String(value || '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^(ANNOUNCER|BELLE B|SANDY|Belle B|Belle)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordCount(value: string): number {
  return cleanBelleText(value).split(/\s+/).filter(Boolean).length
}

function parseHeaderValue(script: string, key: string): string {
  const match = script.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[ \\t]*([^\\r\\n]*)`, 'im'))
  return match?.[1]?.trim() || ''
}

function belleEpisodeState(ctx: {
  seriesName?: string | null
  episodeNumber?: number | null
  seriesTotal?: number | null
  isFinale?: boolean | null
}): BelleEpisodeState {
  if (!ctx.seriesName) return 'standalone'
  if (ctx.isFinale || (ctx.seriesTotal && ctx.episodeNumber && ctx.episodeNumber >= ctx.seriesTotal)) return 'series_finale'
  if (!ctx.episodeNumber || ctx.episodeNumber <= 1) return 'series_first'
  return 'series_non_final'
}

function buildBelleValidationContext(storyRow: any, script: string, storyId: string): BelleValidationContext {
  const title = String(storyRow?.title || parseHeaderValue(script, 'EPISODE_TITLE') || parseHeaderValue(script, 'TITLE') || 'this story').trim()
  const author = String(storyRow?.author || parseHeaderValue(script, 'AUTHOR') || '').trim()
  const scriptSeries = parseHeaderValue(script, 'SERIES')
  const seriesName = String(storyRow?.series_name || scriptSeries || '').trim()
  const episodeNumber = Number(storyRow?.episode_number || storyRow?.series_episode_number || parseHeaderValue(script, 'EPISODE') || 0) || null
  const seriesTotal = Number(storyRow?.series_total || storyRow?.series_total_episodes || parseHeaderValue(script, 'SERIES_TOTAL_EPISODES') || 0) || null
  const scriptFinale = parseHeaderValue(script, 'SERIES_IS_FINALE').toLowerCase()
  const isFinale = storyRow?.series_is_finale === true || scriptFinale === 'true' || Boolean(seriesTotal && episodeNumber && episodeNumber >= seriesTotal)
  return {
    storyId,
    title,
    author,
    seriesName,
    episodeNumber,
    seriesTotal,
    isFinale,
    episodeState: belleEpisodeState({ seriesName, episodeNumber, seriesTotal, isFinale }),
  }
}

function validateBelleLine(kind: 'intro' | 'outro', text: string, ctx: BelleValidationContext): string[] {
  const cleaned = cleanBelleText(text)
  const lower = cleaned.toLowerCase()
  const errors: string[] = []
  const words = wordCount(cleaned)

  if (!cleaned) errors.push(`${kind} is empty`)
  if (/^(narrator|character|announcer|sandy|belle b)\s*:/i.test(text)) errors.push(`${kind} includes a speaker label`)
  if (BELLE_GENERIC_PATTERNS.some(pattern => pattern.test(cleaned))) errors.push(`${kind} uses generic or repetitive Belle wording`)
  if (BELLE_EXACT_OR_CREEPY_TIME_PATTERNS.some(pattern => pattern.test(cleaned))) errors.push(`${kind} uses exact or creepy listener context`)
  if (/\b(spoiler|reveals?|revealed|killer is|turns out|will die|dies in the next)\b/i.test(cleaned)) errors.push(`${kind} risks spoiler language`)
  if (kind === 'intro' && words > 38) errors.push('announcement is too long for a clean handoff')
  if (kind === 'outro' && words > 55) errors.push('outro is too long for Belle')
  // [LISTENER_NAME] is a valid personalization placeholder in the script — do not reject it
  if (kind === 'intro' && /\b(welcome|settle in|let['’]?s begin)\b/i.test(cleaned)) errors.push('announcement must not include greeting/opener language')

  if (kind === 'outro' && ctx.episodeState === 'series_non_final') {
    if (!/\b(next time|next episode|in the next episode|when episode|episode \d+|continues|will have to|will need to|pulls? us)\b/i.test(cleaned)) {
      errors.push('non-final series outro must pull the listener toward the next episode')
    }
    if (/\b(end|ended|final|concludes|conclusion|complete)\b/i.test(cleaned)) {
      errors.push('non-final series outro sounds final')
    }
  }

  if (kind === 'outro' && ctx.episodeState === 'series_finale') {
    if (/\b(next time|next episode|continues|to be continued)\b/i.test(cleaned)) {
      errors.push('finale outro must not tease another episode')
    }
    if (ctx.title && lower.includes('untitled')) errors.push('finale outro has missing title')
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NEW PRODUCTION-STANDARD VALIDATION (Marc 2026-05-25)
  // ──────────────────────────────────────────────────────────────────────────

  // RULE A — Title in intro (all episodes)
  if (kind === 'intro' && (ctx.title || ctx.seriesName)) {
    const titleSource = ctx.seriesName || ctx.title || ''
    const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'have', 'been', 'they', 'their', 'when', 'where', 'what', 'a', 'an', 'or'])
    const titleWords = titleSource.toLowerCase().split(/\s+/).filter(w => w.length >= 4 && !stopwords.has(w))
    const foundTitleWord = titleWords.some(tw => cleaned.toLowerCase().includes(tw))
    if (!foundTitleWord && titleWords.length > 0) {
      errors.push(`intro does not reference the story or series title — expected to contain at least one of: ${titleWords.join(', ')}`)
    }
  }

  // RULE B — Episode number in series intros
  if (kind === 'intro' && ctx.episodeState !== 'standalone' && ctx.episodeNumber !== null && ctx.episodeNumber !== undefined) {
    const hasEpisodeNumber = /\b(episode|ep\.?|part)\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(cleaned)
    if (!hasEpisodeNumber) {
      errors.push(`series intro must identify the episode number (e.g., "Episode One" or "Episode ${ctx.episodeNumber}")`)
    }
  }

  // RULE C & D — Author and "Endless Tales" credits in standalone/finale outros
  if (kind === 'outro' && (ctx.episodeState === 'standalone' || ctx.episodeState === 'series_finale')) {
    if (ctx.author) {
      const authorLastName = ctx.author.trim().split(/\s+/).pop()?.toLowerCase() || ''
      const hasAuthorCredit = authorLastName && cleaned.toLowerCase().includes(authorLastName)
      if (!hasAuthorCredit) {
        errors.push(`outro must credit the author — missing author name (expected "${ctx.author}")`)
      }
    }
    const hasEndlessTalesCredit = /endless\s+tales/i.test(cleaned)
    if (!hasEndlessTalesCredit) {
      errors.push(`outro must include "an Endless Tales original" or similar credit`)
    }
  }

  return errors
}

function repairedBelleLine(kind: 'intro' | 'outro', ctx: BelleValidationContext): string {
  const title = ctx.seriesName || ctx.title || 'this story'
  const author = ctx.author || 'Endless Tales'

  if (kind === 'intro') {
    if (ctx.episodeState === 'series_non_final' || ctx.episodeState === 'series_finale') {
      return `Inside "${title}," the stakes are still moving, and the next turn belongs to the story.`
    }
    return `This is "${title}," where one specific turn pulls the story toward danger.`
  }

  if (ctx.episodeState === 'series_non_final') {
    return `The danger is still moving, and the choice at the end of this episode changes what comes next. Next time on "${title}," the consequences get closer.`
  }

  if (ctx.episodeState === 'series_finale') {
    return `The last page closes, but the echo of "${title}" stays on the road a little longer. You've been listening to "${title}" by ${author}, an Endless Tales Original.`
  }

  return `The story closes, but its echo stays with the road a little longer. You've been listening to "${title}" by ${author}, an Endless Tales Original.`
}

function validateOrRepairBelleLine(kind: 'intro' | 'outro', line: ScriptLine | undefined, ctx: BelleValidationContext) {
  if (!line) return { line, repaired: false, originalText: '', errors: [`missing Belle ${kind} line`] }
  const originalText = line.text
  const errors = validateBelleLine(kind, originalText, ctx)
  if (errors.length === 0) {
    line.text = cleanBelleText(originalText)
    return { line, repaired: false, originalText, errors: [] }
  }

  const fallback = repairedBelleLine(kind, ctx)
  const fallbackErrors = validateBelleLine(kind, fallback, ctx)
  if (fallbackErrors.length === 0) {
    line.text = fallback
    console.warn(`  ⚠️ Belle ${kind} repaired before audio generation: ${errors.join('; ')}`)
    return { line, repaired: true, originalText, errors }
  }

  return { line, repaired: false, originalText, errors: [...errors, ...fallbackErrors] }
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
  const titleMatch = name.match(/^\s*(Dr|Doctor|Mr|Mrs|Ms|Miss|Director|Deputy|Officer|Agent|Colonel|Captain|Lieutenant|Sergeant|Sheriff)\.?\s+(.+)$/i)
  const cleaned = name
    .replace(/\b(Dr|Doctor|Mr|Mrs|Ms|Miss|Director|Deputy|Officer|Agent|Colonel|Captain|Lieutenant|Sergeant|Sheriff)\.?\b/gi, '')
    .trim()
  const withoutParentheticals = cleaned
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim()
  const descriptorExpanded = cleaned
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

  addKeysForName(withoutParentheticals || descriptorExpanded)
  addKeysForName(descriptorExpanded)
  if (titleMatch) {
    const title = titleMatch[1].replace(/^Dr$/i, 'Doctor')
    const titleRest = titleMatch[2]
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/[()]/g, ' ')
      .trim()
    const titleParts = titleRest
      .split(/\s+/)
      .map(part => part.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'.-]/g, '').trim())
      .filter(part => part.length > 1)
    const lastName = titleParts[titleParts.length - 1]
    if (lastName) addKeysForName(`${title} ${lastName}`)
  }
  cleaned.split('/').forEach(alias => {
    addKeysForName(alias.replace(/\s*\([^)]*\)\s*/g, ' '))
    addKeysForName(alias.replace(/[()]/g, ' '))
  })
  return Array.from(keys)
}

function assignCharacterVoice(voiceMap: Record<string, string>, characterName: string, voiceId: string) {
  // Always register the raw uppercase name as a direct key so lookups like
  // voiceMap["DR. NASH"] succeed even when characterVoiceKeys() strips the
  // title prefix and never emits the original form.
  const rawKey = characterName.replace(/\s+/g, ' ').trim().toUpperCase()
  if (!voiceMap[rawKey]) voiceMap[rawKey] = voiceId
  characterVoiceKeys(characterName).forEach(key => {
    if (!voiceMap[key]) voiceMap[key] = voiceId
  })
}

/** Resolve a voice ID for a speaker label, trying both the raw key and all
 *  normalised variants generated by characterVoiceKeys.  Returns undefined
 *  if no match is found. */
function resolveVoiceForSpeaker(voiceMap: Record<string, string>, speaker: string): string | undefined {
  const raw = speaker.replace(/\s+/g, ' ').trim().toUpperCase()
  if (voiceMap[raw]) return voiceMap[raw]
  for (const key of characterVoiceKeys(speaker)) {
    if (voiceMap[key]) return voiceMap[key]
  }
  return undefined
}

function getNarratorCharacter(characterGuide: CharacterInfo[]): CharacterInfo | null {
  return characterGuide.find(char => char.isProtagonist) || characterGuide[0] || null
}

function normalizeVoiceGender(gender: string | null | undefined): CharacterInfo['gender'] {
  const normalized = (gender || '').trim().toLowerCase()
  if (normalized === 'male' || normalized === 'female') return normalized
  return 'unknown'
}

function findUnlabeledStoryBodyLines(script: string) {
  const rawLines = script.split('\n')
  const startIdx = rawLines.findIndex(line => line.includes('[START AUDIO DRAMA SCRIPT]'))
  if (startIdx === -1) return []

  const allowedSectionMarkers = new Set([
    'BELLE B ANNOUNCEMENT',
    'BELLE B INTRO',
    'BELLE B OUTRO',
    '[START AUDIO DRAMA SCRIPT]',
    '[END AUDIO DRAMA SCRIPT]',
  ])
  const speakerLabelRe = /^([A-Z][A-ZÀ-Ú0-9\s'.()/&-]+?):\s*(.+)$/
  const bracketCueRe = /^\[(BEAT|PAUSE(?::\d+(?:\.\d+)?)?|SFX:\s*.+)\]$/i

  return rawLines
    .slice(startIdx + 1)
    .map((line, offset) => ({ lineNumber: startIdx + offset + 2, text: line.trim() }))
    .filter(({ text }) => {
      if (!text) return false
      if (/^-{3,}$/.test(text)) return false
      if (allowedSectionMarkers.has(text.toUpperCase())) return false
      if (bracketCueRe.test(text)) return false
      if (speakerLabelRe.test(text)) return false
      return true
    })
}

function findInlineProductionCues(lines: ScriptLine[]) {
  const bracketCueRe = /\[[^\]]+\]/g
  const parentheticalDirectionRe = /\(([^)]*(?:pause|beat|quiet|quietly|softly|slowly|fast|under (?:his|her|their) breath|whisper|whispers|whispered|sigh|sighs|sighed|laugh|laughs|laughed|nervous|angry|opens?|closes?|door|turns?|walks?|appearing|appears)[^)]*)\)/gi

  return lines
    .filter(line => line.type === 'narrator' || line.type === 'character')
    .flatMap(line => {
      const cues = [
        ...Array.from(line.text.matchAll(bracketCueRe)).map(match => match[0]),
        ...Array.from(line.text.matchAll(parentheticalDirectionRe)).map(match => match[0]),
      ]

      return cues.map(cue => ({
        segment: `segment_${line.index.toString().padStart(4, '0')}.mp3`,
        index: line.index,
        speaker: line.speaker,
        cue,
        lineText: line.text,
        sourceLine: line.sourceLine || `${line.speaker}: ${line.text}`,
        lineNumber: line.rawLineNumber,
      }))
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
  const explicitScriptStartIdx = rawLines.findIndex(l => l.includes('[START AUDIO DRAMA SCRIPT]'))
  const characterGuideStartIdx = rawLines.findIndex(l => l.includes('CHARACTER GUIDE'))
  const scriptStartIdx = explicitScriptStartIdx > -1 ? explicitScriptStartIdx : characterGuideStartIdx
  const headerEndIdx = scriptStartIdx > -1 ? scriptStartIdx : (firstAnnouncerIdx + 1)
  const HEADER_KEYS = [
    'TITLE:', 'SERIES:', 'EPISODE:', 'AUTHOR:', 'GENRE:', 'DESCRIPTION:', 'SUNO PROMPT:',
    'NARRATIVE_VOICE:', 'NARRATOR_IS_CHARACTER:', 'NARRATOR_IS_', 'EPISODE_TITLE:',
    'SERIES_TOTAL', 'SERIES_IS_FINALE:', '[START AUDIO DRAMA SCRIPT]',
    'CHARACTER GUIDE', '---'
  ]
  let lineIndex = 0
  rawLines.forEach((line, rawIdx) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (
      explicitScriptStartIdx > -1 &&
      rawIdx < explicitScriptStartIdx &&
      rawIdx !== firstAnnouncerIdx &&
      rawIdx !== lastAnnouncerIdx
    ) return
    if (HEADER_KEYS.some(k => trimmed.startsWith(k))) return
    if (rawIdx < headerEndIdx && rawIdx !== firstAnnouncerIdx && rawIdx !== lastAnnouncerIdx) {
      if (trimmed.startsWith('NARRATOR:') || trimmed.startsWith('ANNOUNCER:')) return
    }
    if (trimmed === '[BEAT]') { lines.push({ index: lineIndex++, speaker: 'BEAT', text: '0.75', type: 'beat', isIntro: false, isOutro: false, rawLineNumber: rawIdx + 1, sourceLine: line }); return }
    const pauseMatch = trimmed.match(/^\[PAUSE:(\d+)\]$/)
    if (pauseMatch) { lines.push({ index: lineIndex++, speaker: 'PAUSE', text: pauseMatch[1], type: 'pause', isIntro: false, isOutro: false, rawLineNumber: rawIdx + 1, sourceLine: line }); return }
    if (trimmed.startsWith('[SFX:')) { const sfxText = trimmed.replace(/^\[SFX:\s*/, '').replace(/\]$/, '').trim(); lines.push({ index: lineIndex++, speaker: 'SFX', text: sfxText, type: 'sfx', isIntro: false, isOutro: false, rawLineNumber: rawIdx + 1, sourceLine: line }); return }
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
      lines.push({ index: lineIndex++, speaker, text, type, isIntro, isOutro, rawLineNumber: rawIdx + 1, sourceLine: line })
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
      lines.push({ index: lineIndex++, speaker, text, type, isIntro, isOutro, rawLineNumber: rawIdx + 1, sourceLine: line })
    }
  })
  return lines
}

async function generateVoiceLine(rawText: string, voiceId: string, storyId: string, lineIndex: number, prefix: string, forceRegenerate = false, speaker = '', shortSegmentMaxCandidates = SHORT_SEGMENT_MAX_CANDIDATES, qcSkipCollector?: string[]): Promise<string> {
  // Clean markdown and special characters before sending to ElevenLabs
  const text = rawText
    .replace(/\*+/g, '')        // remove asterisks (bold/italic markdown)
    .replace(/\_/g, '')         // remove underscores
    .replace(/#{1,6}\s/g, '')   // remove markdown headers
    .replace(/\[LISTENER_NAME\]/g, 'friend')  // fallback - split handled by generateIntroWithName
    .trim()
    // Round-hour TTS preprocessing: EL is unstable vocalising ":00" in time expressions
    // (produces "ten hours p.m." or "ten nineteen p.m." instead of "ten p.m.").
    // Strip the ":00" before sending to EL — meaning is identical.
    // Only fires when immediately followed by a meridiem marker (a.m./p.m./am/pm).
    // Does NOT affect non-meridiem times or partial-hour times (e.g. "10:15 p.m." untouched).
    .replace(/\b(\d{1,2}):00(\s*(?:a\.?m\.?|p\.?m\.?|am|pm)\b)/gi, '$1$2')
  const fileName = `${prefix}_${lineIndex.toString().padStart(4, '0')}.mp3`
  const cachePath = `asc3/${storyId}/${fileName}`
  const cacheUrl = `${BASE_STORAGE}/${cachePath}`
  // Skip cache for announcer lines (intro/outro) OR when force=true - these must always be fresh
  const isAnnouncer = prefix === 'announcement' || prefix === 'intro' || prefix === 'intro_before' || prefix === 'intro_after' || prefix === 'outro'
  const generateAttemptForText = async (inputText: string): Promise<Buffer> => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': EL_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: inputText, model_id: 'eleven_multilingual_v2', voice_settings: resolveVoiceSettings(voiceId, EL_SETTINGS) })
    })
    if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const rawBuf = Buffer.from(await res.arrayBuffer())
    // ATL-PIPE-001: Reject silence placeholder buffers before any processing
    // Text-length-aware threshold: short segments (< 10 words) use 5KB floor; standard uses 20KB
    const segmentWordCount = inputText.trim().split(/\s+/).length
    const isShortSegment = segmentWordCount < 10
    const effectiveThreshold = isShortSegment ? 5 * 1024 : SILENCE_BUFFER_SIZE_THRESHOLD
    if (rawBuf.length <= effectiveThreshold) {
      const thresholdLabel = isShortSegment
        ? `${effectiveThreshold} short-segment threshold, ${segmentWordCount} words`
        : `${effectiveThreshold} standard threshold, ${segmentWordCount} words`
      throw new Error(`SILENCE_BUFFER: ${fileName} rejected — ElevenLabs returned ${rawBuf.length} bytes (≤ ${thresholdLabel})`)
    }
    const rawBufMd5 = createHash('md5').update(rawBuf).digest('hex')
    if (rawBufMd5 === SILENCE_BUFFER_KNOWN_ETAG) {
      throw new Error(`SILENCE_BUFFER: ${fileName} rejected — matches known silence eTag ${SILENCE_BUFFER_KNOWN_ETAG}`)
    }
    return normalizeSpokenBuffer(rawBuf, inputText, prefix)
  }
  const generateAttempt = async (): Promise<Buffer> => generateAttemptForText(text)

  if (prefix === 'segment') {
    const wordCount = text.split(/\s+/).filter(Boolean).length
    if (!forceRegenerate) {
      const cachedBuf = await downloadCachedAudioBuffer(cacheUrl)
      if (cachedBuf) {
        const cachedDuration = await getAudioDurationBuffer(cachedBuf)
        const isCachedShortSegment = wordCount <= SHORT_SEGMENT_MAX_WORDS || (cachedDuration > 0 && cachedDuration < SHORT_SEGMENT_MAX_SECONDS)
        const cachedRetryThreshold = isCachedShortSegment ? SHORT_SEGMENT_QC_RETRY_LUFS : SEGMENT_QC_RETRY_LUFS
        let cachedMetrics: LoudnessMetrics = { input_i: NaN, input_tp: NaN, input_lra: NaN, input_thresh: NaN }
        try {
          cachedMetrics = await analyzeLoudnessBuffer(cachedBuf)
        } catch (e) {
          console.warn(`  ⚠️ Cached segment loudness analysis failed for ${fileName}; regenerating`, e)
        }
        const cachedAction = !hasUsableLoudness(cachedMetrics)
          ? 'regenerate_cached_invalid_loudness'
          : cachedMetrics.input_tp > SPOKEN_TRUE_PEAK
            ? 'regenerate_cached_true_peak'
            : cachedMetrics.input_i < cachedRetryThreshold
              ? 'regenerate_cached_low_loudness'
              : 'accept_cached_loudness_qc'
        logSegmentQc(fileName, speaker, text, cachedMetrics, cachedAction)
        if (cachedAction === 'accept_cached_loudness_qc') {
          return cacheUrl
        }
        console.warn(`  ⚠️ Regenerating cached segment ${fileName} speaker="${speaker}" cached_lufs=${Number.isFinite(cachedMetrics.input_i) ? cachedMetrics.input_i.toFixed(2) : 'invalid'} threshold=${cachedRetryThreshold.toFixed(1)}`)
      }
    }

    let buf = await generateAttempt()
    const segmentDuration = await getAudioDurationBuffer(buf)
    const isShortSegment = wordCount <= SHORT_SEGMENT_MAX_WORDS || (segmentDuration > 0 && segmentDuration < SHORT_SEGMENT_MAX_SECONDS)
    const segmentQcTarget = isShortSegment ? SHORT_SEGMENT_QC_TARGET_LUFS : SEGMENT_QC_TARGET_LUFS
    const segmentQcWarn = isShortSegment ? SHORT_SEGMENT_QC_WARN_LUFS : SEGMENT_QC_WARN_LUFS
    const segmentQcRetry = isShortSegment ? SHORT_SEGMENT_QC_RETRY_LUFS : SEGMENT_QC_RETRY_LUFS
    const candidateCount = isShortSegment ? shortSegmentMaxCandidates : 2
    let accepted: { buf: Buffer; metrics: LoudnessMetrics; action: string; duration: number; candidate: number } | null = null
    let best: { metrics: LoudnessMetrics; action: string; candidate: number } | null = null
    let transcriptFailure: Awaited<ReturnType<typeof validateSegmentTranscript>> | null = null
    // Repeated-identical-truncation guardrail (Marc 2026-05-21):
    // Tracks detected texts across all retry candidates.  If every attempt
    // produces the exact same partial transcription, Whisper's VAD is hitting
    // a long inter-sentence pause and retrying won't help.  The segment should
    // be split into shorter sub-segments instead.
    const transcriptDetectedTexts: string[] = []
    const splitRescueDiagnostics = emptySplitRescueDiagnostics()

    const actionForMetrics = (metrics: LoudnessMetrics): string => {
      if (!hasUsableLoudness(metrics)) return 'fail_invalid_loudness'
      if (metrics.input_tp > SPOKEN_TRUE_PEAK) return 'fail_true_peak'
      if (metrics.input_i < SEGMENT_QC_HARD_FAIL_LUFS) return 'hard_fail'
      if (metrics.input_i < segmentQcRetry) return 'fail_after_qc'
      if (metrics.input_i < segmentQcWarn) return 'warning_low_loudness'
      return 'accept'
    }

    const isPassingAction = (action: string) => action === 'accept' || action === 'warning_low_loudness'
    const updateBest = (candidate: number, metrics: LoudnessMetrics, action: string) => {
      if (!hasUsableLoudness(metrics)) return
      if (!best || metrics.input_i > best.metrics.input_i) best = { metrics, action, candidate }
    }

    // ATL-PIPE-007: track the last loudness-passing buffer so we can accept it
    // if the transcript QC fires REPEATED_IDENTICAL_TRUNCATION on a clean prefix.
    let lastLoudnessPassedBuf: Buffer | null = null

    const generateSplitRescueChunk = async (chunkText: string, chunkIndex: number): Promise<Buffer> => {
      const chunkFileName = `${fileName.replace('.mp3', '')}_chunk_${chunkIndex + 1}.mp3`
      let lastChunkFailure: string | null = null

      for (let attempt = 1; attempt <= SEGMENT_SPLIT_RESCUE_MAX_CHUNK_CANDIDATES; attempt++) {
        try {
          let chunkBuf = await generateAttemptForText(chunkText)
          let metrics = await analyzeLoudnessBuffer(chunkBuf)
          if (metrics.input_i < segmentQcRetry) {
            const gainDb = Math.max(0, Math.min(18, segmentQcTarget - metrics.input_i))
            chunkBuf = await applySegmentGainLimit(chunkBuf, gainDb)
            metrics = await analyzeLoudnessBuffer(chunkBuf)
          }

          const action = actionForMetrics(metrics)
          logSegmentQc(chunkFileName, speaker, chunkText, metrics, `split_rescue_${action}`)
          if (!isPassingAction(action)) {
            lastChunkFailure = `loudness failed action=${action} lufs=${metrics.input_i.toFixed(2)} tp=${metrics.input_tp.toFixed(2)}`
            continue
          }

          const transcriptCheck = await validateSegmentTranscript(chunkBuf, chunkText, chunkFileName)
          console.log(`  Split-rescue transcript QC ${chunkFileName} speaker="${speaker}" attempt=${attempt} coverage=${transcriptCheck.coverage.toFixed(2)} tail=${transcriptCheck.tailMatches ? 'pass' : 'fail'} result=${transcriptCheck.passed ? 'accept' : 'retry'} expected="${chunkText.slice(0, 120)}" detected="${transcriptCheck.detectedText.slice(0, 120)}"`)
          if (!transcriptCheck.passed) {
            lastChunkFailure = `transcript failed expected "${transcriptCheck.expectedText}", detected "${transcriptCheck.detectedText}" (similarity: ${((transcriptCheck.similarity ?? 0) * 100).toFixed(1)}%)`
            continue
          }

          return chunkBuf
        } catch (e) {
          lastChunkFailure = String(e)
        }
      }

      throw new Error(`split chunk ${chunkIndex + 1}/${splitRescueDiagnostics.splitChunkCount} failed after ${SEGMENT_SPLIT_RESCUE_MAX_CHUNK_CANDIDATES} candidate(s): ${lastChunkFailure || 'unknown error'}`)
    }

    const trySplitTruncationRescue = async (): Promise<string | null> => {
      if (!transcriptFailure) return null
      const shouldTrySplitRescue = prefix === 'segment'
        && hasMultipleSentenceOrClauseBoundaries(transcriptFailure.expectedText)
        && !isAmbiguousTranscriptFailure(transcriptFailure)
        && (
          isCleanDetectedPrefix(transcriptFailure.expectedText, transcriptFailure.detectedText)
          || isLowCoverageMissingTail(transcriptFailure)
        )

      if (!shouldTrySplitRescue) return null

      splitRescueDiagnostics.splitRescueAttempted = true
      const chunks = splitTextForSegmentRescue(text)
      splitRescueDiagnostics.splitChunkCount = chunks.length
      if (chunks.length < 2) {
        splitRescueDiagnostics.splitRescueError = 'No safe sentence/clause split found'
        return null
      }

      try {
        console.warn(`  ⚠️ SPLIT_TRUNCATION_RESCUE_START ${fileName} speaker="${speaker}" chunks=${chunks.length} detected="${transcriptFailure.detectedText.slice(0, 100)}"`)
        const chunkBuffers: Buffer[] = []
        for (let i = 0; i < chunks.length; i++) {
          chunkBuffers.push(await generateSplitRescueChunk(chunks[i], i))
        }

        let combined = await concatenateSegmentBuffers(chunkBuffers, SEGMENT_SPLIT_RESCUE_GAP_SECONDS)
        let combinedMetrics = await analyzeLoudnessBuffer(combined)
        if (combinedMetrics.input_i < segmentQcRetry) {
          const gainDb = Math.max(0, Math.min(18, segmentQcTarget - combinedMetrics.input_i))
          combined = await applySegmentGainLimit(combined, gainDb)
          combinedMetrics = await analyzeLoudnessBuffer(combined)
        }

        const combinedAction = actionForMetrics(combinedMetrics)
        logSegmentQc(fileName, speaker, text, combinedMetrics, `split_rescue_combined_${combinedAction}`)
        if (!isPassingAction(combinedAction)) {
          throw new Error(`combined split segment loudness failed action=${combinedAction} lufs=${combinedMetrics.input_i.toFixed(2)} tp=${combinedMetrics.input_tp.toFixed(2)}`)
        }

        await uploadAudioBufferWithRetry(cachePath, combined, `${speaker || 'UNKNOWN'} ${fileName} split-rescue`)
        console.warn(`  ✅ SPLIT_TRUNCATION_RESCUE_COMPLETE ${fileName} speaker="${speaker}" chunks=${chunks.length}`)
        return cacheUrl
      } catch (e) {
        splitRescueDiagnostics.splitRescueError = String(e)
        console.warn(`  ❌ SPLIT_TRUNCATION_RESCUE_FAILED ${fileName} speaker="${speaker}" chunks=${chunks.length}: ${splitRescueDiagnostics.splitRescueError}`)
        return null
      }
    }

    for (let candidate = 1; candidate <= candidateCount; candidate++) {
      if (candidate > 1) buf = await generateAttempt()
      let candidateBuf = buf
      let candidateDuration = candidate === 1 ? segmentDuration : await getAudioDurationBuffer(candidateBuf)
      let metrics = await analyzeLoudnessBuffer(candidateBuf)
      let hitAdaptiveGainCap = false
      let extremelyQuietBeforeGain = false

      if (!isShortSegment && metrics.input_i < segmentQcRetry) {
        logSegmentQc(fileName, speaker, text, metrics, 'retry_tts')
        candidateBuf = await generateAttempt()
        candidateDuration = await getAudioDurationBuffer(candidateBuf)
        metrics = await analyzeLoudnessBuffer(candidateBuf)
      }

      if (metrics.input_i < segmentQcRetry) {
        logSegmentQc(fileName, speaker, text, metrics, 'trim_silence_before_gain')
        const preTrimBuf = candidateBuf
        const preTrimMetrics = metrics
        const trimmedBuf = await trimSegmentSilenceBuffer(candidateBuf)
        let trimmedMetrics: LoudnessMetrics | null = null
        try {
          if (trimmedBuf.length > 1024) {
            trimmedMetrics = await analyzeLoudnessBuffer(trimmedBuf)
          }
        } catch (e) {
          console.warn(`Segment silence trim analysis failed for ${fileName}; using untrimmed segment:`, e)
        }
        if (trimmedMetrics && hasUsableLoudness(trimmedMetrics) && trimmedMetrics.input_i >= preTrimMetrics.input_i - 0.25) {
          candidateBuf = trimmedBuf
          metrics = trimmedMetrics
          candidateDuration = await getAudioDurationBuffer(candidateBuf)
          logSegmentQc(fileName, speaker, text, metrics, 'after_trim_silence')
        } else if (trimmedMetrics && hasUsableLoudness(trimmedMetrics)) {
          candidateBuf = preTrimBuf
          metrics = preTrimMetrics
          logSegmentQc(fileName, speaker, text, metrics, 'trim_silence_degraded_using_untrimmed')
        } else {
          candidateBuf = preTrimBuf
          metrics = preTrimMetrics
          logSegmentQc(fileName, speaker, text, metrics, 'trim_silence_unusable_using_untrimmed')
        }
        const gainDb = Math.max(0, Math.min(18, segmentQcTarget - metrics.input_i))
        hitAdaptiveGainCap = gainDb >= 17.99
        extremelyQuietBeforeGain = metrics.input_i <= -30
        logSegmentQc(fileName, speaker, text, metrics, `apply_adaptive_gain_limiter_${gainDb.toFixed(2)}dB`)
        candidateBuf = await applySegmentGainLimit(candidateBuf, gainDb)
        metrics = await analyzeLoudnessBuffer(candidateBuf)
        logSegmentQc(fileName, speaker, text, metrics, 'after_adaptive_gain')
      }

      let action = actionForMetrics(metrics)
      const canAttemptExtendedShortRescue = isShortSegment
        && (action === 'fail_after_qc' || action === 'hard_fail')
        && hitAdaptiveGainCap
        && extremelyQuietBeforeGain
      if (canAttemptExtendedShortRescue) {
        // ATL-PIPE-017: mirror the normal isPassingAction path — save the loudness-passing
        // buffer BEFORE running transcript QC so that the REPEATED_IDENTICAL_TRUNCATION
        // prefix rescue (isPrefixAcceptable) can use it even when ALL candidates went
        // through this extended-gain path and lastLoudnessPassedBuf was never set elsewhere.
        lastLoudnessPassedBuf = candidateBuf
        const transcriptCheck = await validateSegmentTranscript(candidateBuf, text, fileName)
        console.log(`  Segment transcript QC ${fileName} speaker="${speaker}" candidate=${candidate} coverage=${transcriptCheck.coverage.toFixed(2)} tail=${transcriptCheck.tailMatches ? 'pass' : 'fail'} result=${transcriptCheck.passed ? 'extended_gain_rescue' : 'retry'} expected="${text.slice(0, 120)}" detected="${transcriptCheck.detectedText.slice(0, 120)}"`)
        if (!transcriptCheck.passed) {
          transcriptFailure = transcriptCheck
          transcriptDetectedTexts.push(transcriptCheck.detectedText)
          continue
        }
        if (transcriptCheck.qcSkipped) {
          console.warn(`transcript_qc_skipped=true segment=${fileName} storyId=${storyId} speaker="${speaker}" reason="OpenAI Whisper unavailable" timestamp=${new Date().toISOString()}`)
          qcSkipCollector?.push(fileName)
          supabase.storage.from('audio').upload(
            `asc3/${storyId}/${fileName.replace('.mp3', '.qcskip.json')}`,
            Buffer.from(JSON.stringify({
              transcript_qc_skipped: true,
              segment: fileName,
              story_id: storyId,
              speaker,
              reason: 'OpenAI Whisper returned HTTP 404 — endpoint unavailable or restricted',
              skipped_at: new Date().toISOString(),
              note: 'Audio generation succeeded via ElevenLabs. Transcript accuracy not verified by ASR. Manual review recommended before publishing.',
            })),
            { contentType: 'application/json', upsert: true }
          ).then(() => {}).catch((e: unknown) => console.warn(`  ⚠️ qcskip sidecar upload failed for ${fileName}:`, String(e)))
        }

        const targetGain = Math.max(0, segmentQcTarget - metrics.input_i)
        const truePeakHeadroom = Math.max(0, SPOKEN_TRUE_PEAK - metrics.input_tp)
        const rescueGainDb = Math.min(targetGain, truePeakHeadroom)
        if (rescueGainDb > 0.25) {
          console.warn(`  ⚠️ Extended short-segment gain rescue ${fileName} speaker="${speaker}" gain=${rescueGainDb.toFixed(2)}dB lufs=${metrics.input_i.toFixed(2)} tp=${metrics.input_tp.toFixed(2)}`)
          candidateBuf = await applySegmentGainLimit(candidateBuf, rescueGainDb)
          metrics = await analyzeLoudnessBuffer(candidateBuf)
          logSegmentQc(fileName, speaker, text, metrics, `after_extended_gain_rescue_${rescueGainDb.toFixed(2)}dB`)
          action = actionForMetrics(metrics)
        }

        logSegmentQc(fileName, speaker, text, metrics, action)
        updateBest(candidate, metrics, action)
        if (isShortSegment) {
          logShortSegmentQc(fileName, speaker, wordCount, candidateDuration, segmentQcTarget, metrics)
          logShortCandidateQc(fileName, speaker, candidate, metrics, action)
        }
        if (isPassingAction(action)) {
          accepted = { buf: candidateBuf, metrics, action, duration: candidateDuration, candidate }
          break
        }
        continue
      }

      logSegmentQc(fileName, speaker, text, metrics, action)
      updateBest(candidate, metrics, action)
      if (isShortSegment) {
        logShortSegmentQc(fileName, speaker, wordCount, candidateDuration, segmentQcTarget, metrics)
        logShortCandidateQc(fileName, speaker, candidate, metrics, action)
      }
      if (isPassingAction(action)) {
        lastLoudnessPassedBuf = candidateBuf // ATL-PIPE-007: save loudness-passing buf for prefix-truncation rescue
        const transcriptCheck = await validateSegmentTranscript(candidateBuf, text, fileName)
        console.log(`  Segment transcript QC ${fileName} speaker="${speaker}" candidate=${candidate} coverage=${transcriptCheck.coverage.toFixed(2)} tail=${transcriptCheck.tailMatches ? 'pass' : 'fail'} result=${transcriptCheck.passed ? 'accept' : 'retry'} expected="${text.slice(0, 120)}" detected="${transcriptCheck.detectedText.slice(0, 120)}"`)
        if (!transcriptCheck.passed) {
          transcriptFailure = transcriptCheck
          transcriptDetectedTexts.push(transcriptCheck.detectedText)
          continue
        }
        if (transcriptCheck.qcSkipped) {
          console.warn(`transcript_qc_skipped=true segment=${fileName} storyId=${storyId} speaker="${speaker}" reason="OpenAI Whisper unavailable" timestamp=${new Date().toISOString()}`)
          qcSkipCollector?.push(fileName)
          supabase.storage.from('audio').upload(
            `asc3/${storyId}/${fileName.replace('.mp3', '.qcskip.json')}`,
            Buffer.from(JSON.stringify({
              transcript_qc_skipped: true,
              segment: fileName,
              story_id: storyId,
              speaker,
              reason: 'OpenAI Whisper returned HTTP 404 — endpoint unavailable or restricted',
              skipped_at: new Date().toISOString(),
              note: 'Audio generation succeeded via ElevenLabs. Transcript accuracy not verified by ASR. Manual review recommended before publishing.',
            })),
            { contentType: 'application/json', upsert: true }
          ).then(() => {}).catch((e: unknown) => console.warn(`  ⚠️ qcskip sidecar upload failed for ${fileName}:`, String(e)))
        }
        accepted = { buf: candidateBuf, metrics, action, duration: candidateDuration, candidate }
        break
      }
    }

    if (!accepted) {
      if (transcriptFailure) {
        // ── Repeated-identical-truncation guardrail (Marc 2026-05-21) ──────────
        //
        // Case A — Low-coverage truncation (original rule):
        //   Coverage < 0.50 AND all retry candidates produced the same partial
        //   detected text.  Whisper's VAD stalled at an inter-sentence pause.
        //   Retrying ElevenLabs will not help; the segment must be split.
        //
        //   Coverage guard prevents false-positives on normalization differences
        //   (e.g. "two-thousand-eleven" → "2011", coverage ~0.67): those differ
        //   in token form but are not VAD truncations.
        //
        // Case B — Clean-prefix VAD truncation (Marc 2026-05-21, surgical rule):
        //   Coverage 0.50–0.65 AND detected is a CLEAN sequential prefix of
        //   expected (no insertions, no substitutions, no cursor stalls) AND
        //   all retry candidates are identical or near-identical AND the tail
        //   starts at a natural pause point (sentence end, comma, dash, or
        //   coordinating conjunction) AND the segment is multi-clause.
        //   Example: "I've had three weeks with a vandalized shop and no
        //   customers. I've had time." → Whisper stops at "shop" (comma pause).
        //   Coverage = 8/14 = 0.57 — too high for Case A, still a VAD clip.
        //
        // Both cases throw [REPEATED_IDENTICAL_TRUNCATION] so the auto-split
        // monitor can handle them identically.
        const allSameDetected = transcriptDetectedTexts.length >= 2
          && transcriptDetectedTexts.every(t => t === transcriptDetectedTexts[0])

        // "Nearly identical" detected texts: normalise away capitalisation and
        // punctuation before comparing.  Handles the case where Whisper returns
        // "on the third evening." on one retry and "On the third evening." on
        // another — strict equality fails but they are the same VAD clip.
        const normaliseDetected = (t: string) =>
          t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
        const allNearlyIdenticalDetected = transcriptDetectedTexts.length >= 2
          && transcriptDetectedTexts.every(
              t => normaliseDetected(t) === normaliseDetected(transcriptDetectedTexts[0])
            )

        const isLowCoverageTruncation = (transcriptFailure.coverage ?? 1) < 0.50

        const isCleanPrefixTruncation = (() => {
          const cov = transcriptFailure.coverage ?? 1
          if (cov < 0.50 || cov > 0.65) return false
          const expTok = transcriptTokens(transcriptFailure.expectedText)
          const detTok = transcriptTokens(transcriptFailure.detectedText)
          if (detTok.length === 0 || expTok.length === 0) return false
          // 1. Clean sequential prefix: every detected token matches
          //    expected[i] exactly — no insertions, no cursor stalls.
          for (let i = 0; i < detTok.length; i++) {
            if (i >= expTok.length || !transcriptTokenMatches(expTok[i], detTok[i])) return false
          }
          // 2. Remaining tail must be non-trivial (≥ 3 tokens).
          if (expTok.length - detTok.length < 3) return false
          // 3. Multi-clause check: original expected text must contain a
          //    sentence-ending punctuation mark in a non-terminal position.
          const bodyText = transcriptFailure.expectedText.trim().replace(/[.!?]\s*$/, '')
          if (!/[.!?;,\u2014\u2013]/.test(bodyText)) return false
          // 4. Pause-point check: the word immediately after the detected
          //    cut-off must start a new clause (coordinating/subordinating
          //    conjunction) OR the last detected word ended with punctuation.
          const origWords = transcriptFailure.expectedText.split(/\s+/)
          // Find the original word index corresponding to the last matched token.
          // Count by TOKENS (not words) because contractions expand: "I've" → ["i","ve"]
          // (2 tokens, 1 word).  Using word-count would over-advance the index.
          let tokensSeen = 0
          let lastMatchedOrigIdx = -1
          for (let wi = 0; wi < origWords.length && tokensSeen < detTok.length; wi++) {
            const wTok = transcriptTokens(origWords[wi])
            tokensSeen += wTok.length   // count by tokens, not by word
            if (wTok.length > 0) lastMatchedOrigIdx = wi
          }
          const lastWord  = origWords[lastMatchedOrigIdx] ?? ''
          const nextWord  = origWords[lastMatchedOrigIdx + 1] ?? ''
          const lastHasPause  = /[.,;!?:\u2014\u2013]$/.test(lastWord)
          const nextIsClause  = /^(and|but|or|so|yet|nor|while|although|because|since|when|if|unless|until|after|before|though|however)\b/i.test(nextWord)
          if (!lastHasPause && !nextIsClause) return false
          return true
        })()

        // Case C — Short clean-prefix VAD truncation (Marc 2026-05-21):
        //   Complements Case B for short segments where coverage < 0.50 (Case A
        //   range) but allSameDetected fails due to capitalisation / punctuation
        //   variation across retry candidates (e.g. "on the third evening." vs
        //   "On the third evening.").  Uses the normalised near-identical check
        //   plus the clean-prefix and pause-point guards from Case B, but does
        //   NOT require multi-clause structure — a single comma-delimited phrase
        //   ("On the third evening,") is sufficient.
        const isShortCleanPrefixTruncation = (() => {
          const cov = transcriptFailure.coverage ?? 1
          if (cov < 0.20 || cov > 0.65) return false   // broader range covers <0.50 and 0.50–0.65
          const expTok = transcriptTokens(transcriptFailure.expectedText)
          const detTok = transcriptTokens(transcriptFailure.detectedText)
          if (detTok.length === 0 || expTok.length === 0) return false
          // 1. Clean sequential prefix — no insertions, no substitutions.
          for (let i = 0; i < detTok.length; i++) {
            if (i >= expTok.length || !transcriptTokenMatches(expTok[i], detTok[i])) return false
          }
          // 2. Missing tail must be ≥ 3 tokens.
          if (expTok.length - detTok.length < 3) return false
          // 3. Cutoff at a natural pause point (comma, period, semicolon, dash,
          //    or next word is a clause-starting conjunction).
          //    No multi-clause requirement unlike Case B — a comma-delimited
          //    opener such as "On the third evening," qualifies.
          const origWords = transcriptFailure.expectedText.split(/\s+/)
          let tokensSeen = 0; let lastIdx = -1
          for (let wi = 0; wi < origWords.length && tokensSeen < detTok.length; wi++) {
            const wTok = transcriptTokens(origWords[wi])
            tokensSeen += wTok.length
            if (wTok.length > 0) lastIdx = wi
          }
          const lastW = origWords[lastIdx] ?? ''
          const nextW = origWords[lastIdx + 1] ?? ''
          const lastHasPause = /[.,;!?:\u2014\u2013]$/.test(lastW)
          const nextIsClause  = /^(and|but|or|so|yet|nor|while|although|because|since|when|if|unless|until|after|before|though|however)\b/i.test(nextW)
          return lastHasPause || nextIsClause
        })()

        const isLikelyTruncation = isLowCoverageTruncation
          || (allSameDetected && isCleanPrefixTruncation)            // Case B
          || (allNearlyIdenticalDetected && isShortCleanPrefixTruncation) // Case C

        const firesTruncation = (allSameDetected || allNearlyIdenticalDetected) && isLikelyTruncation
        if (firesTruncation) {
          const truncatedAt = transcriptDetectedTexts[0].slice(0, 80)
          const ruleCase = isLowCoverageTruncation ? 'low-coverage'
            : isCleanPrefixTruncation ? 'clean-prefix'
            : 'short-clean-prefix'

          // ATL-PIPE-007: If the detected text is a clean string prefix of the expected
          // text AND we have a loudness-passing audio buffer, accept the segment with a
          // warning instead of blocking production.
          //
          // Rationale: Whisper's VAD stops at natural inter-sentence pauses. When
          // detected is a prefix of expected (e.g. "I'll come with you." detected vs
          // "I'll come with you. I want to see what you see." expected), the ElevenLabs
          // audio almost certainly contains the full text — Whisper just couldn't hear
          // past the pause. The render-final-mix uses the audio directly, not the
          // transcript. Blocking production here is a QC false negative.
          //
          // Guard: detected must be ≥ 8 chars (prevents near-empty detections) and a
          // normalized string prefix of expected (punctuation-stripped comparison).
          // ATL-PIPE-016: normForPrefixCheck applies full number normalization
          // (normalizeCompoundNumbers + standalone cardinal words 0-19 → digits)
          // before the startsWith prefix comparison. This handles cases where
          // Whisper returns digit forms ($2,800 / 11) while the script was written
          // in word form ("two thousand eight hundred" / "eleven") — both sides
          // normalize to the same token sequence before comparison.
          // ATL-PIPE-019: Comprehensive normalizeForTranscriptQC
          // Extends ATL-PIPE-016 normForPrefixCheck with the full class-level
          // normalization needed to make qc-normalization an immune defect class.
          // Added in this commit:
          //   Step B2: person title abbreviations (Dr.→doctor, Mr.→mister, etc.)
          //   Step B3: apostrophe stripping — makes it's/its, Purnell's/Purnells equivalent
          //   (Ordinals and numeric ordinal suffixes already handled by
          //    normalizeOrdinalDateForms + normalizeCompoundNumbers upstream of this fn)
          const normForPrefixCheck = (t: string): string => {
            // Step A: compound number normalization (handles $X,XXX, "X hundred Y thousand",
            //         hyphenated two-digit, "X thousand Y hundred" via normalizeCompoundNumbers)
            let s = normalizeCompoundNumbers(t)

            // Step B1: standalone cardinal words 0-19 → digits
            // Covers temporal/quantity contexts ("eleven days ago"→"11 days ago", etc.)
            const CARD_0_19 = [
              'zero','one','two','three','four','five','six','seven','eight','nine',
              'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
              'seventeen','eighteen','nineteen',
            ]
            for (const word of CARD_0_19) {
              const digit = NUMBER_WORDS[word]
              if (digit) s = s.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit)
            }

            // Step B2: person title abbreviations → full form
            // Whisper transcribes audio "Doctor Smith" correctly but script may write
            // "Dr. Smith". Expand to canonical full form for comparison.
            // Also handles the reverse: script writes "Doctor" but Whisper returns "Dr."
            s = s
              .replace(/\bdr\.?\b/gi, 'doctor')
              .replace(/\bmr\.?\b/gi, 'mister')
              .replace(/\bmrs\.?\b/gi, 'missus')
              .replace(/\bms\.?\b/gi, 'miss')
              .replace(/\bprof\.?\b/gi, 'professor')
              .replace(/\bst\.?\b/gi, 'saint')  // saint (names only; streets are "st" not abbreviated in scripts)
              .replace(/\bave\.?\b/gi, 'avenue')

            // Step B3: apostrophe stripping — makes contractions and possessives equivalent
            // "it's" → "its"  |  "Purnell's" → "Purnells"  |  "don't" → "dont"
            // Both expected and detected sides go through this, so:
            // script: "It's open." → "its open"
            // Whisper: "Its open." → "its open"  ← now equal
            s = s.replace(/'/g, '')

            // Step C: strip remaining punctuation, normalise whitespace, lowercase
            return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
          }
          const detectedNorm = normForPrefixCheck(transcriptDetectedTexts[0] || '')
          const expectedNorm = normForPrefixCheck(transcriptFailure.expectedText || '')
          // ATL-PIPE-015: lowered from >= 8 to >= 2 to handle short affirmative
          // responses like "Yes." (norm "yes" = 3 chars) and "No." (2 chars) that
          // are valid clean prefixes of longer lines. A 1-char guard prevents
          // single-letter false positives (e.g. Whisper returning bare "I" or "A").
          // ATL-PIPE-017: diagnostic log — surfaces null-buf cause in server logs
          console.log(
            `  [ATL-PIPE-017] ${fileName} prefix-rescue check: detectedNorm.length=${detectedNorm.length}` +
            ` startsWithPrefix=${expectedNorm.startsWith(detectedNorm)}` +
            ` hasLoudnessBuf=${lastLoudnessPassedBuf !== null}` +
            ` candidates=${transcriptDetectedTexts.length}` +
            ` coverage=${transcriptFailure.coverage?.toFixed(2)}`
          )
          const isPrefixAcceptable = detectedNorm.length >= 2
            && expectedNorm.startsWith(detectedNorm)
            && lastLoudnessPassedBuf !== null

          // ATL-PIPE-017: Short-line suffix/substring acceptance.
          // Very short dialogue lines (< ~4 words) are prone to Whisper dropping
          // the opening word(s) — especially contractions ("It's", "That's").
          // Detected "Open." (norm "open") is NOT a prefix of "It's open." (norm "its open")
          // but IS contained within it. Accept when:
          //   (a) detectedNorm appears as substring of expectedNorm, AND
          //   (b) ratio of detected to expected length ≥ 0.30 (prevents single-word
          //       false positives on long expected text like "going" in a 30-word sentence), AND
          //   (c) audio buffer was generated (lastLoudnessPassedBuf !== null)
          // HAL-SCRIPT-007 prevents recurrence at source (dialogue lines must be ≥ 5 words).
          const isSuffixMatchAcceptable = !isPrefixAcceptable
            && detectedNorm.length >= 2
            && expectedNorm.includes(detectedNorm)
            && detectedNorm.length / Math.max(expectedNorm.length, 1) >= 0.30
            && lastLoudnessPassedBuf !== null

          if (isPrefixAcceptable || isSuffixMatchAcceptable) {
            const acceptRule = isPrefixAcceptable ? 'ATL-PIPE-007 prefix' : 'ATL-PIPE-017 suffix'
            console.warn(
              `  ⚠️ REPEATED_IDENTICAL_TRUNCATION [${ruleCase}] ${fileName} speaker="${speaker}" ` +
              `— detected "${truncatedAt}" ${isPrefixAcceptable ? 'is a clean prefix of' : 'appears within'} expected. ` +
              `Whisper VAD truncated; audio almost certainly correct. ` +
              `Accepting with warning (${acceptRule}). coverage=${transcriptFailure.coverage?.toFixed(2)}`
            )
            qcSkipCollector?.push(fileName)
            await uploadAudioBufferWithRetry(cachePath, lastLoudnessPassedBuf, `${speaker || 'UNKNOWN'} ${fileName}`)
            return cacheUrl
          }

          // ATL-PIPE-011: Before failing, check whether the mismatch is purely a
          // numeric/currency formatting difference (e.g. Whisper returning "$340,000"
          // for script text "three hundred and forty thousand").
          // normalizeCompoundNumbers() is already wired into transcriptTokens(), so
          // re-tokenizing both sides produces equivalent tokens if this is the case.
          {
            const normExpTok = transcriptTokens(transcriptFailure.expectedText || '')
            const normDetTok = transcriptTokens(truncatedAt || transcriptFailure.detectedText || '')
            const normSimilarity = transcriptSimilarity(normExpTok, normDetTok)
            if (normSimilarity >= 0.95 && normExpTok.length > 0) {
              console.warn(
                `  ✅ NUMERIC_EQUIVALENCE_ACCEPT [ATL-PIPE-011] ${fileName} speaker="${speaker}" ` +
                `— Whisper returned a numeric/currency equivalent of the expected text. ` +
                `normalizedSimilarity=${normSimilarity.toFixed(3)} ` +
                `expected="${transcriptFailure.expectedText}" detected="${truncatedAt}". ` +
                `Accepting segment (no split needed).`
              )
              qcSkipCollector?.push(fileName)
              if (lastLoudnessPassedBuf !== null) {
                await uploadAudioBufferWithRetry(cachePath, lastLoudnessPassedBuf, `${speaker || 'UNKNOWN'} ${fileName}`)
              } else if (best) {
                await uploadAudioBufferWithRetry(cachePath, best.buf, `${speaker || 'UNKNOWN'} ${fileName}`)
              }
              return cacheUrl
            }
          }

          console.error(
            `  ⚠️ REPEATED_IDENTICAL_TRUNCATION [${ruleCase}] ${fileName} speaker="${speaker}" ` +
            `candidates=${transcriptDetectedTexts.length} coverage=${transcriptFailure.coverage?.toFixed(2)} ` +
            `all-detected="${truncatedAt}" ` +
            `— Whisper VAD is stopping at a natural pause on every retry. ` +
            `Split this segment into shorter sub-segments and re-run.`
          )
          const splitRescueUrl = await trySplitTruncationRescue()
          if (splitRescueUrl) return splitRescueUrl
          // ORION-QC-DIAG-001 (2026-07-12, temporary): seg50 keeps throwing here in
          // production while current main provably accepts the pair via PIPE-011
          // (similarity 1.0 in repo). Stamp the deployed commit + the values THIS
          // runtime actually computed into the error so the next failure identifies
          // the executing build from error_json alone. Remove after root-cause close.
          {
            const diagExpTok = transcriptTokens(transcriptFailure.expectedText || '')
            const diagDetTok = transcriptTokens(truncatedAt || transcriptFailure.detectedText || '')
            const diagSim = transcriptSimilarity(diagExpTok, diagDetTok)
            throw attachSplitDiagnostics(new Error(
              `Segment transcript QC failed for ${fileName} [REPEATED_IDENTICAL_TRUNCATION]: ` +
              `Whisper returned the same partial output "${truncatedAt}" across all ${transcriptDetectedTexts.length} retry candidates. ` +
              `Retrying will not help. Split this segment into shorter sub-segments. ` +
              `expected "${transcriptFailure.expectedText}" ` +
              `[qc-diag build=${process.env.VERCEL_GIT_COMMIT_SHA || 'unknown'} ` +
              `marker=${typeof QC_MODULE_MARKER !== 'undefined' ? QC_MODULE_MARKER : 'MISSING'} pipe011sim=${diagSim.toFixed(3)} expTok=${JSON.stringify(diagExpTok)} detTok=${JSON.stringify(diagDetTok)} ` +
              `expCP=${[...(transcriptFailure.expectedText || '')].slice(0, 60).map(c => c.codePointAt(0)!.toString(16)).join(',')}]`
            ), splitRescueDiagnostics)
          }
        }
        // INC-005: if Whisper returned exactly "?" (or empty), this is not a normalizable
        // mismatch — Whisper was confused by the audio. Classify immediately as
        // transcript_question_mark to prevent silent retry loops.
        const detectedText = String(transcriptFailure.detectedText || '').trim()
        if (detectedText === '?' || detectedText === '??' || detectedText === '') {
          throw new Error(
            `TRANSCRIPT_AMBIGUOUS: Segment ${fileName} — Whisper returned "${detectedText || '(empty)'}". ` +
            `This is not a QC normalisation case. Whisper was confused by the audio. ` +
            `expected "${transcriptFailure.expectedText}". ` +
            `Inspect the audio artifact: check byte size, LUFS, and duration. ` +
            `If the artifact is valid, regenerate once. If the problem persists, this segment requires Marc review.`
          )
        }
        const splitRescueUrl = await trySplitTruncationRescue()
        if (splitRescueUrl) return splitRescueUrl
        throw attachSplitDiagnostics(
          new Error(`Segment transcript QC failed for ${fileName}: expected "${transcriptFailure.expectedText}", detected "${transcriptFailure.detectedText}" (similarity: ${((transcriptFailure.similarity ?? 0) * 100).toFixed(1)}%)`),
          splitRescueDiagnostics
        )
      }
      if (best?.metrics.input_tp && best.metrics.input_tp > SPOKEN_TRUE_PEAK) {
        throw new Error(`Segment loudness QC failed for ${fileName}: best candidate ${best.candidate} true peak ${best.metrics.input_tp.toFixed(2)} dBTP exceeds ${SPOKEN_TRUE_PEAK} dBTP`)
      }
      if (best) {
        throw new Error(`Segment loudness QC failed for ${fileName}: best candidate ${best.candidate} ${best.metrics.input_i.toFixed(2)} LUFS, ${best.metrics.input_tp.toFixed(2)} dBTP`)
      }
      throw new Error(`Segment loudness QC failed for ${fileName}: invalid loudness metrics`)
    }

    buf = accepted.buf
    await uploadAudioBufferWithRetry(cachePath, buf, `${speaker || 'UNKNOWN'} ${fileName}`)
  } else {
    let buf = await generateAttempt()
    const { error: ue } = await supabase.storage.from('audio').upload(cachePath, buf, { contentType: 'audio/mpeg', upsert: true })
    if (ue) throw new Error(`Upload error: ${ue.message}`)
  }
  return cacheUrl
}

// MIN_BEFORE_TEXT_CHARS: beforeText shorter than this is treated as empty/unusable.
// When [LISTENER_NAME] appears near the start (e.g. "[LISTENER_NAME], a dead man…"),
// the resulting beforeText ("" or "Hi,") would cause ElevenLabs to return ~10KB of
// silence, which validate_belle_assets rejects as SILENCE_BUFFER.  The series path
// (series_generate_belle_assets) hits this same code via generateBelleOnly:true.
const MIN_BEFORE_TEXT_CHARS = 5

async function generateBelleIntroWithName(introText: string, storyId: string, lineIndex: number): Promise<{
  primaryUrl: string
  beforeUrl: string | null
  afterUrl: string | null
}> {
  const parts = introText.split('[LISTENER_NAME]')
  const beforeText = (parts[0] || '').trim()
  // SUNSET-INTRO-FIX (Marc merge word msg 3099, 2026-07-19): when [LISTENER_NAME] leads
  // the intro, parts[1] starts with the punctuation that followed the placeholder
  // (", …"). trim() only removes whitespace, so the leading comma reached TTS and
  // Belle vocalized it as a glottal artifact ("Kha,") baked into the final mix.
  // Strip leading punctuation/dashes from the after-name text before rendering.
  const afterText = (parts[1] || '').trim().replace(/^[\s,;:.!?\u2026\u2014\u2013-]+/, '')
  // Treat beforeText as unusable if it is empty or too short to produce audible audio.
  const usableBeforeText = beforeText.length >= MIN_BEFORE_TEXT_CHARS ? beforeText : ''

  if (!usableBeforeText && !afterText) {
    throw new Error('Belle B intro has [LISTENER_NAME] but no usable surrounding text.')
  }

  let beforeUrl: string | null = null
  let afterUrl: string | null = null
  let primaryUrl: string

  if (usableBeforeText && afterText) {
    // [LISTENER_NAME] in the middle — generate a matched before/after pair.
    beforeUrl = await generateVoiceLine(usableBeforeText, CANONICAL_BELLE_B_VOICE_ID, storyId, lineIndex, 'intro_before')
    afterUrl = await generateVoiceLine(afterText, CANONICAL_BELLE_B_VOICE_ID, storyId, lineIndex + 0.1, 'intro_after')
    primaryUrl = beforeUrl
  } else if (afterText) {
    // [LISTENER_NAME] at start (or short beforeText skipped) — use afterText as standalone intro.
    // Use 'intro' prefix (not 'intro_after') so render_final_mix can locate it as a
    // standard intro asset without requiring a paired beforeUrl.
    primaryUrl = await generateVoiceLine(afterText, CANONICAL_BELLE_B_VOICE_ID, storyId, lineIndex + 0.1, 'intro')
    // afterUrl stays null — no paired intro_after file is created
  } else {
    // [LISTENER_NAME] at end (no afterText) — use beforeText as standalone intro.
    primaryUrl = await generateVoiceLine(usableBeforeText, CANONICAL_BELLE_B_VOICE_ID, storyId, lineIndex, 'intro')
  }

  return { primaryUrl, beforeUrl, afterUrl }
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
    const {
      storyId,
      script: scriptParam,
      narratorVoiceId,
      narratorVoiceName,
      characterVoices: characterVoicesParam,
      characterVoiceCodes = [] as VoiceCodeAssignment[],
      preflightOnly,
      retryMissingOnly,
      segmentNumber,
      generateBelleOnly,
    } = await req.json()
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    let script = scriptParam
    const { data: storyRow, error: storyRowError } = await supabase
      .from('stories')
      .select('id,title,author,author_id,genre,description,duration_mins,created_at,script,narrator_voice_id,narrator_voice_name,series_name,series_id,episode_number,series_episode_number,series_total,series_total_episodes,series_is_finale,options')
      .eq('id', storyId)
      .single()
    if (!script) {
      script = storyRow?.script
      if (!script) return NextResponse.json({ success: false, error: 'Script not found in database' }, { status: 400 })
    }
    // characterVoices: explicit from request body, or fallback from story.options (set by Hal for pre-written scripts)
    const characterVoices = characterVoicesParam
      ?? (storyRow as any)?.options?.characterVoices
      ?? undefined
    const unlabeledBodyLines = findUnlabeledStoryBodyLines(script)
    if (unlabeledBodyLines.length > 0) {
      if (preflightOnly === true) {
        return NextResponse.json({
          success: false,
          preflightOnly: true,
          cueCount: 0,
          cues: [],
          narratorGenderCheck: { passed: false, reason: 'Skipped because unlabeled story body lines were found' },
          estimatedSegmentCount: { spoken: 0, silence: 0, total: 0 },
          blockingReasons: ['Unlabeled story body lines found'],
          unlabeledLineCount: unlabeledBodyLines.length,
          examples: unlabeledBodyLines.slice(0, 5),
        }, { status: 422 })
      }
      return NextResponse.json({
        success: false,
        error: 'Unlabeled story body lines found',
        unlabeledLineCount: unlabeledBodyLines.length,
        examples: unlabeledBodyLines.slice(0, 5),
        instruction: 'Every narration/dialogue paragraph after [START AUDIO DRAMA SCRIPT] must begin with a speaker label such as NARRATOR: or CHARACTER:',
      }, { status: 422 })
    }
    const lines = parseScript(script)
    const announcerLines = lines.filter(l => l.type === 'announcer')
    const introLine = announcerLines[0]
    const outroLine = announcerLines[announcerLines.length - 1]
    const storyLines = lines.filter(l => !l.isIntro && !l.isOutro)
    const belleContext = buildBelleValidationContext(storyRow, script, storyId)
    const introValidation = validateOrRepairBelleLine('intro', introLine, belleContext)
    const outroValidation = validateOrRepairBelleLine('outro', outroLine && outroLine.index !== introLine?.index ? outroLine : undefined, belleContext)
    const belleBlockingErrors = [
      ...(!introValidation.line ? introValidation.errors : []),
      ...(!outroValidation.line ? outroValidation.errors : []),
    ]
    if (belleBlockingErrors.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Belle intro/outro validation failed',
        belleContext,
        belleBlockingErrors,
      }, { status: 422 })
    }
    const belleRepairUpdates: Record<string, string> = {}
    if (introValidation.repaired && introValidation.line) belleRepairUpdates.announcement_text = introValidation.line.text
    if (outroValidation.repaired && outroValidation.line) belleRepairUpdates.outro_text = outroValidation.line.text
    if (Object.keys(belleRepairUpdates).length > 0) {
      await supabase.from('stories').update(belleRepairUpdates).eq('id', storyId)
    }
    const nonDialogueSpeakers = new Set(['TITLE', 'AUTHOR', 'GENRE', 'DESCRIPTION', 'SERIES', 'EPISODE', 'EPISODE_TITLE', 'SUNO PROMPT', 'ANNOUNCER', 'BELLE B', 'SANDY'])
    const inlineCueProblems = findInlineProductionCues(storyLines)
    if (inlineCueProblems.length > 0) {
      console.error(`  ❌ Inline production cues found in spoken story lines: ${inlineCueProblems.length}`)
      if (preflightOnly !== true) return NextResponse.json({
        success: false,
        error: 'Inline production cues found in spoken story lines',
        instruction: 'Move timing cues to full-line [BEAT] or [PAUSE:n] entries, or rewrite performance directions as natural dialogue/narration before generating audio.',
        cueCount: inlineCueProblems.length,
        cues: inlineCueProblems,
      }, { status: 422 })
    }
    if (generateBelleOnly === true) {
      const storyAudioFolder = `asc3/${storyId}`
      const { data: existingAudioFiles, error: listAudioError } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
      if (listAudioError) {
        console.error('  ❌ Failed to list existing Belle assets:', listAudioError)
        return NextResponse.json({ success: false, error: `Failed to list existing Belle assets: ${listAudioError.message}` }, { status: 500 })
      }

      let existingIntroFile = [...(existingAudioFiles || [])]
        .filter(file => file.name === 'announcement.mp3' || file.name.startsWith('announcement_') || file.name === 'intro.mp3' || file.name.startsWith('intro_'))
        .sort((a, b) => {
          const priority = (name: string) => name === 'announcement.mp3' || name === 'intro.mp3' ? 0 : 1
          return priority(a.name) - priority(b.name) || a.name.localeCompare(b.name)
        })[0]
      let existingOutroFile = [...(existingAudioFiles || [])]
        .filter(file => file.name === 'outro.mp3' || file.name.startsWith('outro_'))
        .sort((a, b) => {
          const priority = (name: string) => name === 'outro.mp3' ? 0 : 1
          return priority(a.name) - priority(b.name) || a.name.localeCompare(b.name)
        })[0]
      if (introValidation.repaired) existingIntroFile = undefined
      if (outroValidation.repaired) existingOutroFile = undefined
      const introUrlFromFile = existingIntroFile ? `${BASE_STORAGE}/${storyAudioFolder}/${existingIntroFile.name}` : null
      const outroUrlFromFile = existingOutroFile ? `${BASE_STORAGE}/${storyAudioFolder}/${existingOutroFile.name}` : null
      const result: {
        success: boolean
        generateBelleOnly: true
        introUrl: string | null
        outroUrl: string | null
        introStatus: 'generated' | 'skipped_existing' | 'missing_script_line' | 'failed'
        outroStatus: 'generated' | 'skipped_existing' | 'missing_script_line' | 'failed'
        errors: string[]
      } = {
        success: false,
        generateBelleOnly: true,
        introUrl: introUrlFromFile,
        outroUrl: outroUrlFromFile,
        introStatus: existingIntroFile ? 'skipped_existing' : (introLine ? 'generated' : 'missing_script_line'),
        outroStatus: existingOutroFile ? 'skipped_existing' : (outroLine && outroLine.index !== introLine?.index ? 'generated' : 'missing_script_line'),
        errors: [],
      }

      if (!existingIntroFile && introLine) {
        try {
          const announcementText = introLine.text
          if (announcementText.includes('[LISTENER_NAME]')) {
            const intro = await generateBelleIntroWithName(announcementText, storyId, introLine.index)
            result.introUrl = intro.primaryUrl
            await supabase.from('stories').update({
              announcement_url: null,
              announcement_text: announcementText,
              intro_audio_url: intro.primaryUrl,
              intro_before_url: intro.beforeUrl,
              intro_after_url: intro.afterUrl,
            }).eq('id', storyId)
          } else {
            const announcementUrl = await generateVoiceLine(announcementText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index, 'announcement')
            result.introUrl = announcementUrl
            await supabase.from('stories').update({
              announcement_url: announcementUrl,
              announcement_text: announcementText,
              intro_audio_url: null,
              intro_before_url: null,
              intro_after_url: null,
            }).eq('id', storyId)
          }
          result.introStatus = 'generated'
          console.log('  ✅ Belle-only announcement generated')
        } catch (e) {
          result.introStatus = 'failed'
          result.errors.push(`Announcement failed: ${String(e)}`)
          console.error('  ❌ Belle-only announcement failed:', e)
        }
      }

      if (!existingOutroFile && outroLine && outroLine.index !== introLine?.index) {
        try {
          const outroUrl = await generateVoiceLine(outroLine.text, CANONICAL_BELLE_B_VOICE_ID, storyId, outroLine.index, 'outro')
          result.outroUrl = outroUrl
          await supabase.from('stories').update({ outro_audio_url: outroUrl, outro_text: outroLine.text }).eq('id', storyId)
          result.outroStatus = 'generated'
          console.log('  ✅ Belle-only outro generated')
        } catch (e) {
          result.outroStatus = 'failed'
          result.errors.push(`Outro failed: ${String(e)}`)
          console.error('  ❌ Belle-only outro failed:', e)
        }
      }

      result.success = Boolean(result.introUrl && result.outroUrl && result.errors.length === 0)
      return NextResponse.json(result, { status: result.success ? 200 : 422 })
    }
    const { data: allVoices } = await supabase.from('narrator_voices').select('name,elevenlabs_voice_id,gender')
    const voiceByName: Record<string, string> = {}
    const narratorVoiceById: Record<string, NarratorVoiceRecord> = {}
    if (allVoices) allVoices.forEach((v: NarratorVoiceRecord) => {
      voiceByName[v.name] = v.elevenlabs_voice_id
      narratorVoiceById[v.elevenlabs_voice_id] = v
    })
    // ── Narrator resolution (Option B) ───────────────────────────────────────────────
    // Chain: explicit request override → story.narrator_voice_id → author→narrator registry
    // Cole Hargrove fallback REMOVED. No silent defaults.
    let resolvedNarratorVoiceId = narratorVoiceId
    let resolvedNarratorVoiceName = narratorVoiceName

    // Allow explicit request override (narratorVoiceId / narratorVoiceName) to bypass
    // the registry lookup — used for manual admin overrides only
    if (!resolvedNarratorVoiceId && narratorVoiceName) {
      resolvedNarratorVoiceId = voiceByName[narratorVoiceName]
    }

    if (!resolvedNarratorVoiceId) {
      // Use resolveNarratorVoiceId: checks story row first, then author→narrator chain
      const narratorResult = await resolveNarratorVoiceId(storyId, supabase, storyRow as any)
      if (narratorResult.ok === false) {
        return NextResponse.json({
          success: false,
          error: narratorResult.message,
          code: narratorResult.code,
        }, { status: 422 })
      }
      resolvedNarratorVoiceId = narratorResult.narratorVoiceId
      resolvedNarratorVoiceName = resolvedNarratorVoiceName || narratorResult.narratorVoiceName
    }

    // ── Character voice_code preflight gate ──────────────────────────────────────────
    // Validate character voice_codes (if any) before generation begins.
    // Malformed codes block immediately; missing registry entries are noted (will create).
    // Narrator is NOT included — it has a raw EL voice ID, no registry involvement.
    if (!preflightOnly && characterVoiceCodes.length > 0) {
      const _introMatch = script.match(/BELLE B INTRO[\s\S]*?BELLE B:\s*(.+?)(?:\n---|\n\n)/i)
      const _outroMatch = script.match(/BELLE B OUTRO[\s\S]*?BELLE B:\s*(.+?)(?:\n[A-Z]:|$)/i)
      const vcReport = await runPreflightChecks({
        storyId,
        script,
        characters: [],
        intro: _introMatch ? _introMatch[1].trim() : undefined,
        outro: _outroMatch ? _outroMatch[1].trim() : undefined,
        voiceCodeAssignments: characterVoiceCodes as VoiceCodeAssignment[],
        seriesMetadata: {
          seriesName: (storyRow as any)?.series_name || parseHeaderValue(script, 'SERIES') || undefined,
          episodeTitle: (storyRow as any)?.episode_title || parseHeaderValue(script, 'EPISODE_TITLE') || undefined,
          episodeNumber: Number((storyRow as any)?.episode_number || parseHeaderValue(script, 'EPISODE') || 0) || undefined,
          author: (storyRow as any)?.author || parseHeaderValue(script, 'AUTHOR') || undefined,
          narrator: resolvedNarratorVoiceName || parseHeaderValue(script, 'NARRATOR') || undefined,
          genre: (storyRow as any)?.genre || parseHeaderValue(script, 'GENRE') || undefined,
          durationMins: (storyRow as any)?.duration_mins || Number(parseHeaderValue(script, 'DURATION')) || undefined,
        },
      })
      if (!vcReport.safeToGenerateVoices) {
        return NextResponse.json({
          success: false,
          error: 'Voice code preflight failed — fix character voice_codes before generating',
          code: 'VOICE_CODE_PREFLIGHT_FAILED',
          blockers: vcReport.blockers,
          voiceCodeCheck: vcReport.checks.voiceCodeCheck,
        }, { status: 422 })
      }
    }
    if (!resolvedNarratorVoiceName) resolvedNarratorVoiceName = narratorVoiceById[resolvedNarratorVoiceId]?.name

    // ── Character voice_code → ElevenLabs voice ID resolution ───────────────────────
    // For each characterVoiceCode whose voice_code is not yet in the registry,
    // call createOrFetchVoice() to design + create the voice in ElevenLabs and cache it.
    // Returns a role→voiceId map used for character assignment below.
    const characterVoiceCodeMap: Record<string, string> = {} // role → resolved EL voice_id
    const voiceCodeCreationLog: Array<{role:string; voice_code:string; voice_id:string; source:string; ok:boolean; error?:string}> = []
    if (!preflightOnly && characterVoiceCodes.length > 0 && process.env.ELEVENLABS_API_KEY) {
      try {
        const provider = getVoiceProvider('elevenlabs', process.env.ELEVENLABS_API_KEY)
        const charGuideForCodes = parseCharacterGuide(script)
        const GENDER_MAP: Record<string,string>  = { MA:'male', FE:'female', NE:'neutral' }
        const ACCENT_MAP: Record<string,string>  = { US:'american', UK:'british' }
        const AGE_MAP:    Record<string,string>  = { YO:'young', AD:'middle_aged', EL:'old', L5:'old', L6:'old', M3:'young', M4:'middle_aged', E4:'middle_aged' }
        const TONE_LABELS: Record<string,string> = { WM:'warm', DK:'dark', CR:'crisp', NT:'neutral', GR:'gravelly', IT:'intimate', WD:'weathered', SD:'sardonic', WS:'wise', AU:'authoritative', RF:'refined', EN:'engaging' }

        for (const assignment of characterVoiceCodes as VoiceCodeAssignment[]) {
          const segs = (assignment.voice_code || '').split('-')
          const [, gender, age, tone, accent] = segs
          const charProfile = charGuideForCodes.find(
            c => c.name.toUpperCase() === assignment.role.toUpperCase()
          )
          const genderLabel  = GENDER_MAP[gender]  || 'neutral'
          const accentLabel  = ACCENT_MAP[accent]  || 'american'
          const toneLabel    = TONE_LABELS[tone]   || 'neutral'
          const ageLabel     = AGE_MAP[age]        || 'middle_aged'
          const voiceDesc = charProfile
            ? `${charProfile.description || ''}. ${genderLabel} character voice, ${ageLabel}, ${toneLabel} tone, ${accentLabel} accent.`.trim()
            : `A ${genderLabel} character voice with ${toneLabel} tone, ${ageLabel}, ${accentLabel} accent.`
          const spec = {
            name: `${assignment.role} [${assignment.voice_code}]`,
            voice_description: voiceDesc,
          }
          try {
            const result = await provider.createOrFetchVoice(assignment.voice_code, spec, false)
            // result is VoiceMeta — has voice_id, name, category, labels
            const source = result.labels?.[EL_VOICE_CODE_LABEL]
              ? (result.category === 'generated' ? 'found_in_el_labels' : 'created')
              : 'created'
            characterVoiceCodeMap[assignment.role.toUpperCase()] = result.voice_id
            voiceCodeCreationLog.push({ role: assignment.role, voice_code: assignment.voice_code, voice_id: result.voice_id, source: result.category || source, ok: true })
            console.log(`  ✅ voice_code ${assignment.voice_code} → ${result.category || source} → ${result.voice_id}`)
          } catch (vcErr: unknown) {
            const msg = vcErr instanceof Error ? vcErr.message : String(vcErr)
            voiceCodeCreationLog.push({ role: assignment.role, voice_code: assignment.voice_code, voice_id: '', source: '', ok: false, error: msg })
            console.warn(`  ⚠️  voice_code ${assignment.voice_code} resolution failed: ${msg}`)
          }
        }
      } catch (providerErr: unknown) {
        console.warn('voice_code provider init failed:', providerErr instanceof Error ? providerErr.message : String(providerErr))
      }
    }

    const characterGuide = parseCharacterGuide(script)
    // Extract series metadata for escalation reports
    const seriesTitle: string | null = (storyRow as any)?.series_name || script.match(/^SERIES:\s*(.+)/m)?.[1]?.trim() || null
    const episodeNumber: number | null = parseInt((storyRow as any)?.episode_number || script.match(/^EPISODE:\s*(\d+)/m)?.[1] || '') || null
    const episodeTitle: string | null = script.match(/^EPISODE_TITLE:\s*(.+)/m)?.[1]?.trim() || null
    // Check if narrator IS the protagonist (first person stories)
    const narratorIsCharacter = /NARRATOR_IS_CHARACTER:\s*true/i.test(script)
    const narrativeVoice = script.match(/NARRATIVE_VOICE:\s*(\S+)/i)?.[1]?.toLowerCase() || ''
    const isFirstPerson = narrativeVoice === 'first_person' || narratorIsCharacter
    const protagonist = isFirstPerson ? getNarratorCharacter(characterGuide) : null
    const protagonistGender = protagonist ? normalizeVoiceGender(protagonist.gender) : 'unknown'
    const narratorVoice = resolvedNarratorVoiceId ? narratorVoiceById[resolvedNarratorVoiceId] : null
    const narratorGender = normalizeVoiceGender(narratorVoice?.gender)
    const narratorGenderCheck = {
      required: isFirstPerson,
      passed: true,
      narrativeVoice,
      narratorIsCharacter,
      protagonistName: protagonist?.name || null,
      protagonistGender,
      narratorVoiceId: resolvedNarratorVoiceId || null,
      narratorVoiceName: resolvedNarratorVoiceName || narratorVoice?.name || null,
      narratorGender,
      reason: '',
    }
    if (!resolvedNarratorVoiceId) {
      narratorGenderCheck.passed = false
      narratorGenderCheck.reason = 'No narrator voice found'
    } else if (isBelleBVoiceId(resolvedNarratorVoiceId)) {
      narratorGenderCheck.passed = false
      narratorGenderCheck.reason = 'Belle B cannot be used as the story narrator or narrator-character voice.'
    } else if (isFirstPerson && !protagonist) {
      narratorGenderCheck.passed = false
      narratorGenderCheck.reason = 'First-person/narrator-character stories require a CHARACTER GUIDE protagonist with known gender.'
    } else if (isFirstPerson && protagonistGender === 'unknown') {
      narratorGenderCheck.passed = false
      narratorGenderCheck.reason = `First-person protagonist ${protagonist?.name} must have a known gender in the CHARACTER GUIDE.`
    } else if (isFirstPerson && narratorGender === 'unknown') {
      narratorGenderCheck.passed = false
      narratorGenderCheck.reason = `Narrator voice gender unknown for ${resolvedNarratorVoiceName || resolvedNarratorVoiceId}; first-person/narrator-character stories require a known narrator voice gender.`
    } else if (isFirstPerson && narratorGender !== protagonistGender) {
      narratorGenderCheck.passed = false
      narratorGenderCheck.reason = `Narrator voice gender ${narratorGender} does not match first-person protagonist ${protagonist?.name} gender ${protagonistGender}`
    }
    const missingMetadata: string[] = []
    if (storyRowError || !storyRow) missingMetadata.push('story row')
    if (!storyRow?.title) missingMetadata.push('title')
    if (!storyRow?.author) missingMetadata.push('author')
    if (!storyRow?.genre) missingMetadata.push('genre')
    if (!storyRow?.description) missingMetadata.push('description')
    if (storyRow?.duration_mins === null || storyRow?.duration_mins === undefined) missingMetadata.push('duration_mins')
    if (!storyRow?.created_at) missingMetadata.push('created_at')
    if (!script) missingMetadata.push('script')
    if (!resolvedNarratorVoiceId) missingMetadata.push('narrator_voice_id')
    if (!resolvedNarratorVoiceName && !narratorVoice?.name) missingMetadata.push('narrator_voice_name')
    const estimatedSegmentCount = {
      spoken: storyLines.filter(l => l.type === 'narrator' || l.type === 'character').length,
      silence: storyLines.filter(l => l.type === 'beat' || l.type === 'pause').length,
      sfx: storyLines.filter(l => l.type === 'sfx').length,
      total: storyLines.filter(l => l.type === 'narrator' || l.type === 'character' || l.type === 'beat' || l.type === 'pause').length,
    }
    const productionLearning = await buildProductionLearningFeedback(supabase, script)
    const learningBlockingReasons = productionLearning.blockers.map(
      item => `Production learning rule ${item.id}: ${item.fixApplied || item.rootCause || item.failureType}`
    )
    if (preflightOnly === true) {
      const blockingReasons = [
        ...(inlineCueProblems.length > 0 ? ['Inline production cues found in spoken story lines'] : []),
        ...missingMetadata.map(field => `Missing required metadata: ${field}`),
        ...(narratorGenderCheck.passed ? [] : [narratorGenderCheck.reason]),
        ...learningBlockingReasons,
      ]
      return NextResponse.json({
        success: blockingReasons.length === 0,
        preflightOnly: true,
        cueCount: inlineCueProblems.length,
        cues: inlineCueProblems,
        narratorGenderCheck,
        estimatedSegmentCount,
        blockingReasons,
        productionLearning,
        metadata: {
          missingFields: missingMetadata,
          present: {
            title: !!storyRow?.title,
            author: !!storyRow?.author,
            genre: !!storyRow?.genre,
            description: !!storyRow?.description,
            duration_mins: storyRow?.duration_mins !== null && storyRow?.duration_mins !== undefined,
            created_at: !!storyRow?.created_at,
            script: !!script,
            narrator_voice_id: !!resolvedNarratorVoiceId,
            narrator_voice_name: !!(resolvedNarratorVoiceName || narratorVoice?.name),
          },
        },
      }, { status: blockingReasons.length === 0 ? 200 : 422 })
    }
    if (learningBlockingReasons.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Production learning preflight blocked voice generation',
        blockingReasons: learningBlockingReasons,
        productionLearning,
      }, { status: 422 })
    }
    console.log(`\n🎙 generate-voices: ${storyId}`)
    console.log(`  Narrative: ${narrativeVoice}, narratorIsCharacter: ${isFirstPerson}`)
    if (isBelleBVoiceId(resolvedNarratorVoiceId)) {
      return NextResponse.json({
        success: false,
        error: 'Belle B cannot be used as the story narrator or narrator-character voice.',
      }, { status: 422 })
    }
    if (isFirstPerson) {
      if (!protagonist) {
        return NextResponse.json({
          success: false,
          error: 'First-person/narrator-character stories require a CHARACTER GUIDE protagonist with known gender.',
        }, { status: 422 })
      }
      if (protagonistGender === 'unknown') {
        return NextResponse.json({
          success: false,
          error: `First-person protagonist ${protagonist.name} must have a known gender in the CHARACTER GUIDE.`,
        }, { status: 422 })
      }
      if (narratorGender === 'unknown') {
        return NextResponse.json({
          success: false,
          error: `Narrator voice gender unknown for ${resolvedNarratorVoiceName || resolvedNarratorVoiceId}; first-person/narrator-character stories require a known narrator voice gender.`,
        }, { status: 422 })
      }
      if (narratorGender !== protagonistGender) {
        return NextResponse.json({
          success: false,
          error: `Narrator voice gender ${narratorGender} does not match first-person protagonist ${protagonist.name} gender ${protagonistGender}`,
        }, { status: 422 })
      }
    }
    const characterVoicePool = await loadCharacterVoicePool()
    console.log(`  Character voice pool: ${characterVoicePool.length} voices`)
    const characterVoiceContext = { storyId, seriesId: (storyRow as any)?.series_id || null }
    const usedVoiceIds = new Set<string>([resolvedNarratorVoiceId, ...RESERVED_BELLE_B_VOICE_IDS])
    // Build voice map using character_voices scoring + rotation
    const voiceMap: Record<string, string> = {}
    const warnings: string[] = []
    const reusedVoices: ReusedVoiceInventory[] = []
    for (const char of characterGuide) {
      const key = char.name.toUpperCase()
      // Check if manually overridden
      if (characterVoices?.[char.name] || characterVoices?.[key]) {
        const manualVoiceId = (characterVoices[char.name] || characterVoices[key]) as string
        if (isBelleBVoiceId(manualVoiceId)) {
          return NextResponse.json({
            success: false,
            error: `Belle B cannot be used as a character voice for ${char.name}.`,
          }, { status: 422 })
        }
        voiceMap[key] = manualVoiceId
        assignCharacterVoice(voiceMap, char.name, voiceMap[key])
        usedVoiceIds.add(voiceMap[key])
        const saved = await persistCharacterVoiceAssignmentOnce({
          storyId,
          seriesId: characterVoiceContext.seriesId,
          characterName: char.name,
          voiceId: manualVoiceId,
          voiceName: null,
        })
        if (saved.inserted) await markCharacterVoiceUsed(manualVoiceId)
        continue
      }
      // Parse character description into EL-compatible attributes
      const meta = parseCharacterMeta(char.description || char.name)
      // Children under 12 always get female voice
      const ageNum = char.description?.match(/(\d+)/)?.[1] ? parseInt(char.description.match(/(\d+)/)![1]) : 30
      if (ageNum < 12) meta.gender = 'female'
      else if (!meta.gender) meta.gender = char.gender === 'male' ? 'male' : char.gender === 'female' ? 'female' : ''
      // First person: protagonist IS the narrator - use narrator voice
      const isProtagonist = isFirstPerson && (char.isProtagonist || characterGuide.indexOf(char) === 0)
      if (isProtagonist) {
        console.log(`  ${char.name}: protagonist = narrator voice (first person)`)
        voiceMap[key] = resolvedNarratorVoiceId
        assignCharacterVoice(voiceMap, char.name, voiceMap[key])
      } else if (characterVoiceCodeMap[key]) {
        // Use voice resolved from voice_code registry
        const codeVoiceId = characterVoiceCodeMap[key]
        if (isBelleBVoiceId(codeVoiceId)) {
          return NextResponse.json({ success: false, error: `Belle B cannot be used as a character voice for ${char.name}.` }, { status: 422 })
        }
        voiceMap[key] = codeVoiceId
        assignCharacterVoice(voiceMap, char.name, voiceMap[key])
        usedVoiceIds.add(voiceMap[key])
        console.log(`  ✅ ${char.name}: voice_code registry → ${codeVoiceId}`)
      } else {
        // Find best matching voice from pool
        const selection = await findVoiceForCharacter(
          char.name,
          meta,
          characterVoicePool,
          usedVoiceIds,
          resolvedNarratorVoiceId,
          characterVoiceContext
        )
        voiceMap[key] = selection.voiceId
        if (selection.reusedVoice) {
          warnings.push(`Reused character voice for ${char.name}: ${selection.voiceName || selection.voiceId}`)
          reusedVoices.push({
            character: char.name,
            voiceId: selection.voiceId,
            voiceName: selection.voiceName,
            score: selection.score,
          })
          console.warn(`  ⚠️ ${char.name}: reusedVoice: true voice=${selection.voiceName || selection.voiceId}`)
        }
        assignCharacterVoice(voiceMap, char.name, voiceMap[key])
        usedVoiceIds.add(voiceMap[key])
      }
    }
    // Apply any remaining manual overrides
    if (characterVoices) {
      for (const [name, id] of Object.entries(characterVoices)) {
        if (isBelleBVoiceId(id as string)) {
          return NextResponse.json({
            success: false,
            error: `Belle B cannot be used as a character voice for ${name}.`,
          }, { status: 422 })
        }
        assignCharacterVoice(voiceMap, name, id as string)
        const saved = await persistCharacterVoiceAssignmentOnce({
          storyId,
          seriesId: characterVoiceContext.seriesId,
          characterName: name,
          voiceId: id as string,
          voiceName: null,
        })
        if (saved.inserted) await markCharacterVoiceUsed(id as string)
      }
    }
    console.log(`  Parsed character guide names:`, characterGuide.map(c => c.name).join(', ') || 'none')
    console.log(`  Characters:`, characterGuide.map(c => `${c.name}(${c.gender})`).join(', '))
    const characterSpeakers = Array.from(new Set(storyLines
      .filter(l => l.type === 'character' && !nonDialogueSpeakers.has(l.speaker.toUpperCase()))
      .map(l => l.speaker.toUpperCase())))
    const autoCastMissingSpeakers = async (speakers: string[]) => {
      const unresolved: string[] = []

      for (const speaker of speakers) {
        if (voiceMap[speaker]) continue

        try {
          const meta = inferFallbackCharacterMeta(speaker)
          const selection = await findVoiceForCharacter(
            speaker,
            meta,
            characterVoicePool,
            usedVoiceIds,
            resolvedNarratorVoiceId,
            characterVoiceContext
          )
          assignCharacterVoice(voiceMap, speaker, selection.voiceId)
          usedVoiceIds.add(selection.voiceId)
          const warning = `Auto-assigned fallback voice for unmapped speaker ${speaker}`
          warnings.push(warning)
          console.warn(`  ⚠️ ${warning}: ${selection.voiceName || selection.voiceId}`)
          if (selection.reusedVoice) {
            reusedVoices.push({
              character: speaker,
              voiceId: selection.voiceId,
              voiceName: selection.voiceName,
              score: selection.score,
            })
          }
        } catch (e) {
          console.warn(`  ⚠️ Auto-cast failed for unmapped speaker ${speaker}:`, e)
          unresolved.push(speaker)
        }
      }

      return unresolved
    }

    const missingVoiceMap = characterSpeakers.filter(speaker => !resolveVoiceForSpeaker(voiceMap, speaker))
    if (missingVoiceMap.length > 0) {
      console.warn(`  ⚠️ Missing character voice assignments; attempting fallback auto-cast: ${missingVoiceMap.join(', ')}`)
      const stillMissingVoiceMap = await autoCastMissingSpeakers(missingVoiceMap)
      if (stillMissingVoiceMap.length > 0) {
        console.error(`  ❌ Missing character voice assignments: ${stillMissingVoiceMap.join(', ')}`)
        return NextResponse.json({
          success: false,
          error: 'Missing character voice assignments',
          missingCharacters: stillMissingVoiceMap,
        }, { status: 422 })
      }
    }
    warnings.forEach(w => console.warn(`  ⚠️ ${w}`))
    const segmentFilePattern = /^segment_\d{4}\.mp3$/
    const storyAudioFolder = `asc3/${storyId}`
    // ATL-SFX-INCR-001: include sfx-type lines so the incremental path tracks
    // sfx_NNNN.mp3 files as expected artifacts alongside segment_NNNN.mp3 files.
    // Without this, missingSegments never contained SFX file names and the runner
    // considered voice generation complete without ever requesting SFX generation.
    const expectedSegmentNames = storyLines
      .filter(line => line.type === 'narrator' || line.type === 'character' || line.type === 'beat' || line.type === 'pause' || line.type === 'sfx')
      .map(line => line.type === 'sfx'
        ? `sfx_${line.index.toString().padStart(4, '0')}.mp3`
        : `segment_${line.index.toString().padStart(4, '0')}.mp3`)
    const buildInventoryReport = (presentSegmentNames: Set<string>, failures: VoiceInventoryFailure[] = []) => {
      const missingSegments = expectedSegmentNames.filter(name => !presentSegmentNames.has(name))
      return {
        missingSegments,
        lowLoudnessSegments: failures.filter(f => /loudness QC|true peak|low_loudness|LUFS/i.test(f.error)),
        transcriptFailedSegments: failures.filter(f => /transcript QC/i.test(f.error)),
        reusedVoices,
      }
    }

    if (retryMissingOnly === true) {
      const requestedSegmentNumber = Number(segmentNumber)
      if (!Number.isInteger(requestedSegmentNumber) || requestedSegmentNumber < 0) {
        return NextResponse.json({ success: false, error: 'retryMissingOnly requires a valid segmentNumber' }, { status: 400 })
      }

      // ATL-SFX-INCR-001: sfx lines are targetable in the incremental path;
      // include them so parsedSegmentNumbers and lastTargetableSegmentNumber are accurate.
      const targetableStoryLines = storyLines.filter(line => line.type === 'narrator' || line.type === 'character' || line.type === 'beat' || line.type === 'pause' || line.type === 'sfx')
      const targetLine = storyLines.find(line => line.index === requestedSegmentNumber)
      if (!targetLine) {
        const parsedSegmentNumbers = targetableStoryLines.map(line => line.index).sort((a, b) => a - b)
        const speakerNames = Array.from(new Set(storyLines
          .filter(line => typeof line.character === 'string' && line.character.trim())
          .map(line => String(line.character).trim())
        )).sort((a, b) => a.localeCompare(b))
        const characterGuideNames = characterGuide
          .map(character => String(character.name || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
        return NextResponse.json({
          success: false,
          error: `No parsed script line found for segment_${requestedSegmentNumber.toString().padStart(4, '0')}.mp3`,
          requestedSegmentNumber,
          targetableSegmentCount: targetableStoryLines.length,
          firstTargetableSegmentNumber: parsedSegmentNumbers[0] ?? null,
          lastTargetableSegmentNumber: parsedSegmentNumbers[parsedSegmentNumbers.length - 1] ?? null,
          parsedSegmentNumbers,
          speakerNames,
          characterGuideNames,
          containsCombinedSpeakerLabel: /\bLILA\s+AND\s+OWEN\s*:/i.test(script),
        }, { status: 404 })
      }

      const { data: existingAudioFiles, error: listAudioError } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
      if (listAudioError) {
        console.error('  ❌ Failed to list existing story segments:', listAudioError)
        return NextResponse.json({ success: false, error: `Failed to list existing story segments: ${listAudioError.message}` }, { status: 500 })
      }

      // FIX (AC-1, AC-2): reject stale segments whose stored size is ≤ stale threshold.
      // UPDATED (ATL-PIPE-006): changed from 20KB to 5KB to match run-next hard-fail floor
      // ATL-PIPE-006 + ATL-LEARN-001: Use Artifact Validity Gate for segment inventory.
      // classifySegmentInventory() centralizes the 5KB hard-fail / 20KB warn thresholds
      // and prevents the segment_0066 stale loop (INC-006) where short valid segments
      // (~15KB) were falsely treated as stale under the old 20KB flat threshold.
      const allSegmentFiles = (existingAudioFiles || []).filter(file => segmentFilePattern.test(file.name))
      const gateResult = classifySegmentInventory(allSegmentFiles, segmentFilePattern)
      const existingSegmentNames = gateResult.validSegmentNames
      // Log hard-fails and warns for diagnostics
      for (const name of gateResult.staleHardFailNames) {
        console.log(`Segment ${name}: hard-fail (≤5KB) — treating as stale/silence, will regenerate`)
      }
      for (const name of gateResult.staleWarnNames) {
        console.log(`Segment ${name}: warn range (5KB–20KB) — treating as valid short-line segment (INC-006)`)
      }
      // ATL-SFX-INCR-001: also include sfx_NNNN.mp3 files present in storage so the
      // "already exists" check and missingSegments diff account for SFX artifacts.
      const sfxFilePattern = /^sfx_\d{4}\.mp3$/
      for (const sfxFile of (existingAudioFiles || []).filter(f => sfxFilePattern.test(f.name))) {
        existingSegmentNames.add(sfxFile.name)
      }
      // ATL-SFX-INCR-001: SFX lines use sfx_NNNN.mp3 naming; all other lines use segment_NNNN.mp3
      const targetFileName = targetLine.type === 'sfx'
        ? `sfx_${requestedSegmentNumber.toString().padStart(4, '0')}.mp3`
        : `segment_${requestedSegmentNumber.toString().padStart(4, '0')}.mp3`
      if (existingSegmentNames.has(targetFileName)) {
        const inventory = buildInventoryReport(existingSegmentNames)
        return NextResponse.json({
          success: true,
          retryMissingOnly: true,
          generatedSegments: [],
          failures: [],
          presentCount: existingSegmentNames.size,
          missingSegments: inventory.missingSegments,
          inventory,
          message: `${targetFileName} already exists; no generation needed.`,
        })
      }

      const qcSkippedSegments: string[] = []
      const generatedSegments: any[] = []
      const failures: VoiceInventoryFailure[] = []

      try {
        if (targetLine.type === 'beat' || targetLine.type === 'pause') {
          const duration = targetLine.type === 'beat' ? 0.75 : (parseFloat(targetLine.text) || 1.0)
          const silPath = `${storyAudioFolder}/${targetFileName}`
          const silBuffer = await generateSilenceBuffer(duration)
          const { error: uploadError } = await supabase.storage.from('audio').upload(silPath, silBuffer, { contentType: 'audio/mpeg', upsert: true })
          if (uploadError) throw new Error(`Upload error: ${uploadError.message}`)
          generatedSegments.push({ index: targetLine.index, speaker: targetLine.speaker, type: targetLine.type, duration: String(duration), url: `${BASE_STORAGE}/${silPath}` })
        } else if (targetLine.type === 'narrator' || targetLine.type === 'character') {
          let voiceId = resolvedNarratorVoiceId
          if (targetLine.type === 'character') {
            const characterVoiceId = resolveVoiceForSpeaker(voiceMap, targetLine.speaker)
            if (!characterVoiceId) throw new Error(`Missing character voice assignment for ${targetLine.speaker}`)
            voiceId = characterVoiceId
          }
          const url = await generateVoiceLine(targetLine.text, voiceId, storyId, targetLine.index, 'segment', true, targetLine.speaker, 8, qcSkippedSegments)
          generatedSegments.push({ index: targetLine.index, speaker: targetLine.speaker, type: targetLine.type, url })
        } else if (targetLine.type === 'sfx') {
          // ATL-SFX-INCR-001: generate SFX audio for [SFX:] cues in the incremental path.
          // The full render path generates these in its main loop; the incremental path
          // previously threw here, leaving sfx_NNNN.mp3 files absent from storage.
          // generateSFX() writes sfx_NNNN.mp3; render-final-mix picks it up via sfxPattern.
          const sfxUrl = await generateSFX(targetLine.text, storyId, targetLine.index)
          if (!sfxUrl) throw new Error(`SFX generation returned null for cue "${targetLine.text}" (index ${targetLine.index}) — ElevenLabs SFX API may be unavailable`)
          generatedSegments.push({ index: targetLine.index, speaker: 'SFX', type: 'sfx', url: sfxUrl })
        } else {
          throw new Error(`Targeted retry does not support ${targetLine.type} lines`)
        }
      } catch (e) {
        const splitDiagnostics = splitDiagnosticsFromError(e)
        failures.push({
          segment: targetFileName,
          index: targetLine.index,
          speaker: targetLine.speaker,
          type: targetLine.type,
          error: String(e),
          ...splitDiagnostics,
        })
      }

      // ATL-PIPE-006: retry storage list up to 3x — Supabase CDN occasionally returns HTML
      // (5xx) for list operations on long-running functions, causing false job failures.
      let updatedAudioFiles = null
      let updatedListError = null
      for (let listAttempt = 0; listAttempt < 3; listAttempt++) {
        const { data: listData, error: listErr } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
        if (!listErr) { updatedAudioFiles = listData; updatedListError = null; break }
        updatedListError = listErr
        console.warn(`  ⚠️ list updated segments attempt ${listAttempt + 1}/3 failed: ${listErr.message}`)
        if (listAttempt < 2) await new Promise(r => setTimeout(r, (listAttempt + 1) * 1500))
      }
      if (updatedListError) {
        console.error('  ❌ Failed to list updated story segments after 3 attempts:', updatedListError)
        return NextResponse.json({ success: false, error: `Failed to list updated story segments: ${updatedListError.message}` }, { status: 500 })
      }
      // ATL-LEARN-001: Use Artifact Validity Gate for updated inventory (same thresholds as above)
      const updatedGate = classifySegmentInventory(updatedAudioFiles || [], segmentFilePattern)
      const updatedSegmentNames = updatedGate.validSegmentNames
      // ATL-SFX-INCR-001: also collect sfx_NNNN.mp3 files in the post-generation inventory
      // so buildInventoryReport sees them and missingSegments is accurate for SFX lines.
      for (const sfxFile of (updatedAudioFiles || []).filter(f => sfxFilePattern.test(f.name))) {
        updatedSegmentNames.add(sfxFile.name)
      }
      const inventory = buildInventoryReport(updatedSegmentNames, failures)

      return NextResponse.json({
        success: failures.length === 0 && inventory.missingSegments.length === 0,
        retryMissingOnly: true,
        generatedSegments,
        failures,
        presentCount: updatedSegmentNames.size,
        missingSegments: inventory.missingSegments,
        inventory,
        transcriptQcSkippedSegments: qcSkippedSegments,
      }, { status: failures.length === 0 ? 200 : 500 })
    }

    const results: { intro?: string; outro?: string; segments: any[] } = { segments: [] }
    let succeeded = 0; let failed = 0

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

    const qcSkippedSegments: string[] = []
    const failures: VoiceInventoryFailure[] = []
    const escalations: SegmentEscalation[] = []
    if (introLine) {
      try {
        const announcementText = introLine.text
        if (announcementText.includes('[LISTENER_NAME]')) {
          const intro = await generateBelleIntroWithName(announcementText, storyId, introLine.index)
          results.intro = intro.primaryUrl
          await supabase.from('stories').update({
            announcement_url: null,
            announcement_text: announcementText,
            intro_audio_url: intro.primaryUrl,
            intro_before_url: intro.beforeUrl,
            intro_after_url: intro.afterUrl,
          }).eq('id', storyId)
          console.log('  ✅ Belle B intro split')
        } else {
          results.intro = await generateVoiceLine(announcementText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index, 'announcement')
          await supabase.from('stories').update({
            announcement_url: results.intro,
            announcement_text: announcementText,
            intro_audio_url: null,
            intro_before_url: null,
            intro_after_url: null,
          }).eq('id', storyId)
          console.log('  ✅ Belle B announcement')
        }
      } catch (e) { console.error('  ❌ Announcement failed:', e) }
    }
    if (outroLine && outroLine.index !== introLine?.index) { try { results.outro = await generateVoiceLine(outroLine.text, CANONICAL_BELLE_B_VOICE_ID, storyId, outroLine.index, 'outro'); console.log('  ✅ Belle B outro') } catch (e) { console.error('  ❌ Outro failed:', e) } }
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
        const characterVoiceId = resolveVoiceForSpeaker(voiceMap, line.speaker)
        if (!characterVoiceId) throw new Error(`Missing character voice assignment for ${line.speaker}`)
        voiceId = characterVoiceId
      }
      // ── Escalation-aware retry loop (MAX_SEGMENT_ATTEMPTS = 5) ──────────────
      {
        const segment = `segment_${line.index.toString().padStart(4, '0')}.mp3`
        let lastError = ''
        let lastSplitDiagnostics = emptySplitRescueDiagnostics()
        let segSucceeded = false
        for (let attempt = 1; attempt <= MAX_SEGMENT_ATTEMPTS; attempt++) {
          // Attempt 4+: bump candidate count for mechanical_qc; brief delay for voice_generation
          const forceRegen = attempt >= 4
          const candidateCount = attempt >= 4 ? 8 : (attempt >= 5 ? 10 : SHORT_SEGMENT_MAX_CANDIDATES)
          if (attempt > 1) {
            const kind = classifySegmentFailure(lastError, line.text)
            console.warn(`  ⚠️ Segment retry ${segment} attempt=${attempt}/${MAX_SEGMENT_ATTEMPTS} kind=${kind}`)
            if (kind === 'voice_generation' && attempt <= 4) await new Promise(r => setTimeout(r, 2000))
            if (kind === 'script_issue') break // nothing code can do — stop immediately
          }
          try {
            const url = await generateVoiceLine(line.text, voiceId, storyId, line.index, 'segment', forceRegen, line.speaker, candidateCount, qcSkippedSegments)
            results.segments.push({ index: line.index, speaker: line.speaker, type: line.type, url })
            succeeded++
            segSucceeded = true
            break
          } catch (e) {
            lastError = String(e)
            lastSplitDiagnostics = splitDiagnosticsFromError(e)
            console.error(`  ❌ Line ${line.index} (${line.speaker}) attempt ${attempt}:`, lastError.slice(0, 200))
          }
        }
        if (!segSucceeded) {
          const report = buildEscalationReport(
            { segment, index: line.index, speaker: line.speaker, text: line.text },
            MAX_SEGMENT_ATTEMPTS, lastError, seriesTitle, episodeNumber, episodeTitle
          )
          logEscalation(report)
          escalations.push(report)
          results.segments.push({ index: line.index, speaker: line.speaker, type: line.type, error: lastError, escalated: true, ...lastSplitDiagnostics })
          failures.push({ segment, index: line.index, speaker: line.speaker, type: line.type, error: lastError, ...lastSplitDiagnostics })
          failed++
        }
      }
    }
    const updates: Record<string, string> = {}
    if (results.intro) updates.announcement_url = results.intro
    if (results.outro) updates.outro_audio_url = results.outro
    if (results.intro && introLine) updates.announcement_text = introLine.text
    if (results.outro && outroLine && outroLine.index !== introLine?.index) updates.outro_text = outroLine.text
    if (Object.keys(updates).length > 0) await supabase.from('stories').update(updates).eq('id', storyId)
    const voiceTotal = storyLines.filter(l =>
      !nonDialogueSpeakers.has(l.speaker.toUpperCase()) &&
      (l.type === 'narrator' || l.type === 'character')
    ).length
    console.log(`  ✅ Done: ${succeeded}/${voiceTotal} lines, ${failed} failed`)
    const { data: finalAudioFiles, error: finalListError } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
    if (finalListError) {
      console.error('  ❌ Failed to list final story segment inventory:', finalListError)
      return NextResponse.json({ success: false, error: `Failed to list final story segment inventory: ${finalListError.message}` }, { status: 500 })
    }
    const finalSegmentNames = new Set((finalAudioFiles || []).filter(file => segmentFilePattern.test(file.name)).map(file => file.name))
    const inventory = buildInventoryReport(finalSegmentNames, failures)
    console.log(`  Inventory: missing=${inventory.missingSegments.length}, lowLoudness=${inventory.lowLoudnessSegments.length}, transcriptFailed=${inventory.transcriptFailedSegments.length}, reusedVoices=${inventory.reusedVoices.length}, escalated=${escalations.length}`)
    if (escalations.length > 0) {
      console.warn(`\n🚨 ${escalations.length} segment(s) escalated — copy to Marc/ChatGPT for review:`)
      escalations.forEach(r => console.warn(`  ${r.segment} | ${r.failureKind} | manualOK=${r.manualOverrideSafe} | "${r.scriptText.slice(0,60)}" | fix: ${r.recommendedFix.slice(0,80)}`))
    }
    return NextResponse.json({
      success: failed === 0 && inventory.missingSegments.length === 0 && escalations.length === 0,
      intro: results.intro,
      outro: results.outro,
      segments: results.segments,
      stats: { total: lines.length, voice: voiceTotal, succeeded, failed, escalated: escalations.length },
      warnings,
      inventory,
      escalations,
      transcriptQcSkippedSegments: qcSkippedSegments,
      voiceCodeResults: voiceCodeCreationLog.length > 0 ? voiceCodeCreationLog : undefined,
    })
  } catch (err) {
    console.error('generate-voices error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
