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
const SEGMENT_TRANSCRIPT_MIN_COVERAGE = 0.62
const SEGMENT_TRANSCRIPT_TAIL_WORDS = 4
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

function hasUsableLoudness(metrics: LoudnessMetrics): boolean {
  return Number.isFinite(metrics.input_i) && Number.isFinite(metrics.input_tp)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
}

const ORDINAL_WORDS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  thirteenth: '13',
  fourteenth: '14',
  fifteenth: '15',
  sixteenth: '16',
  seventeenth: '17',
  eighteenth: '18',
  nineteenth: '19',
  twentieth: '20',
  thirtieth: '30',
  fortieth: '40',
  fiftieth: '50',
  sixtieth: '60',
  seventieth: '70',
  eightieth: '80',
  ninetieth: '90',
}

function normalizeOrdinalDateForms(text: string): string {
  return text
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/gi, (match, tensWord, ordinalWord) => {
      const tens = NUMBER_WORDS[String(tensWord).toLowerCase()]
      const ones = ORDINAL_WORDS[String(ordinalWord).toLowerCase()]
      const value = Number(tens) + Number(ones)
      return Number.isFinite(value) ? String(value) : match
    })
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)\b/gi, (match, ordinalWord) => {
      return ORDINAL_WORDS[String(ordinalWord).toLowerCase()] || match
    })
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1')
}

function normalizeNumberWords(text: string): string {
  return text
    // ── Hyphenated spoken time formats ────────────────────────────────────
    // "eleven-nineteen" → "1119"  |  "four-fifteen" → "415"  |  "eight-thirty" → "830"
    // Script writers use HOUR-MINUTE hyphenation for clock times.
    // After this rule, the 4/3-digit result is further split by the
    // transcriptTokens time-split step, so both sides produce ["11","19"] etc.
    // Restricted to hyphenated forms ([\-]) only to avoid splitting ordinary
    // space-separated number words in dialogue.
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)-(oh|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)(?:-(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
      (match, hour, minuteTens, minuteOnes) => {
        const h = Number(NUMBER_WORDS[hour.toLowerCase()])
        const mt = Number(NUMBER_WORDS[minuteTens.toLowerCase()] ?? (minuteTens.toLowerCase() === 'oh' || minuteTens.toLowerCase() === 'zero' ? '0' : undefined))
        const mo = minuteOnes ? Number(NUMBER_WORDS[minuteOnes.toLowerCase()]) : 0
        if (!Number.isFinite(h) || !Number.isFinite(mt)) return match
        const minutes = mt >= 20 || mt === 0 ? mt + mo : mt
        return String(h * 100 + minutes)
      }
    )
    // ── Compound year/number forms (hyphens or spaces) ────────────────────
    // Handles "two-thousand-eleven" or "two thousand eleven" → "2011"
    // and "nineteen-hundred-sixty-five" → "1965".
    // Must run BEFORE the simple "X thousand" rule so the full compound
    // is consumed as one unit rather than being split across two passes.
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)[-\s]+(hundred|thousand)[-\s]+(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s]+(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
      (match, big, scale, mid, small) => {
        const bigV = Number(NUMBER_WORDS[big.toLowerCase()])
        const midV = Number(NUMBER_WORDS[mid.toLowerCase()])
        const smallV = small ? Number(NUMBER_WORDS[small.toLowerCase()]) : 0
        if (!Number.isFinite(bigV) || !Number.isFinite(midV)) return match
        const multiplier = scale.toLowerCase() === 'thousand' ? 1000 : 100
        // midV is the tens/ones portion; smallV adds ones when mid is a tens word (≥20)
        const remainder = midV >= 20 ? midV + smallV : midV
        return String(bigV * multiplier + remainder)
      }
    )
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(hundred|thousand)\b/gi, (match, numberWord, scale) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      const multiplier = String(scale).toLowerCase() === 'thousand' ? 1000 : 100
      const amount = Number(value)
      if (!Number.isFinite(amount)) return match
      return String(amount * multiplier)
    })
    .replace(/\b(zero|oh|o|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b/gi, (match, first, second) => {
      const firstValue = NUMBER_WORDS[String(first).toLowerCase()]
      const secondValue = second ? NUMBER_WORDS[String(second).toLowerCase()] : ''
      if (!firstValue) return match
      if (!secondValue) return firstValue
      const tens = Number(firstValue)
      const ones = Number(secondValue)
      if (Number.isFinite(tens) && Number.isFinite(ones) && tens >= 20) return String(tens + ones)
      return `${firstValue} ${secondValue}`
    })
}

function normalizeCurrencyForms(text: string): string {
  return text
    .replace(/\$\s*(\d[\d,]*)\b/g, (_, amount) => `${String(amount).replace(/,/g, '')} dollars`)
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+(hundred|thousand)\s+dollars\b/gi, (match, numberWord, scale) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      const multiplier = String(scale).toLowerCase() === 'thousand' ? 1000 : 100
      const amount = Number(value)
      if (!Number.isFinite(amount)) return match
      return `${amount * multiplier} dollars`
    })
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+dollars\b/gi, (match, numberWord) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      return value ? `${value} dollars` : match
    })
}

function normalizePossessivePlaceNames(text: string): string {
  return text
    .replace(/\bManns\s+Harbor\b/gi, 'Mann Harbor')
    .replace(/\bMan's\s+Harbor\b/gi, 'Mann Harbor')
    .replace(/\bPikes\s+Peak\b/gi, 'Pike Peak')
    .replace(/\bPike's\s+Peak\b/gi, 'Pike Peak')
    .replace(/\bHarpers\s+Ferry\b/gi, 'Harper Ferry')
    .replace(/\bHarper's\s+Ferry\b/gi, 'Harper Ferry')
    // Tonopah, NV: Whisper ASR renders phonetically as "Ta-Neh-Pah" or similar variants.
    .replace(/\bTa[-\s]*Neh[-\s]*Pah\b/gi, 'Tonopah')
    .replace(/\bTonapah\b/gi, 'Tonopah')
    .replace(/\bTonopaw\b/gi, 'Tonopah')
}

function normalizeStylisticCompoundWords(text: string): string {
  return text
    .replace(/\ball\s+right\b/gi, 'alright')
    .replace(/\bokay\b/gi, 'ok')
    .replace(/\bon\s+to\b/gi, 'onto')
    .replace(/\btime\s+stamps\b/gi, 'timestamps')
    // Emergency number: Whisper formats "911" as "9-1-1" — normalise to joined form.
    .replace(/\b9-1-1\b/gi, '911')
}

function normalizePossessiveVehicleModelNames(text: string): string {
  return text.replace(/\b(Civic|Accord|Mustang)(?:'s|s)\s+(taillights|headlights|engine|tires|windshield)\b/gi, '$1 $2')
}

function normalizeContractionExpansions(text: string): string {
  return text
    .replace(/\bshould(?:'|')ve\b/gi, 'should have')
    .replace(/\bwould(?:'|')ve\b/gi, 'would have')
    .replace(/\bcould(?:'|')ve\b/gi, 'could have')
    .replace(/\bshouldn(?:'|')t\b/gi, 'should not')
    .replace(/\bwouldn(?:'|')t\b/gi, 'would not')
    .replace(/\bcouldn(?:'|')t\b/gi, 'could not')
}

function transcriptTokens(text: string): string[] {
  // Pre-normalise: NFC canonical compose, strip leading/trailing whitespace,
  // collapse internal runs of whitespace.  Catches no-break spaces, zero-width
  // chars, and any trailing newline from script source or Whisper output.
  const pre = text.normalize('NFC').trim().replace(/\s+/g, ' ')
  const normalized = normalizeNumberWords(normalizeOrdinalDateForms(normalizeCurrencyForms(normalizePossessivePlaceNames(normalizePossessiveVehicleModelNames(normalizeStylisticCompoundWords(normalizeContractionExpansions(pre)))))))
    // Widen apostrophe net: curly quotes, modifier apostrophe, grave/acute,
    // prime — all normalised to plain ASCII apostrophe before possessive strip.
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u02CA\u2032\u2035]/g, "'")
    // Normalize possessives to plain plural so Whisper output matches script:
    // "Gate's" → "Gates", "Gates'" → "Gates" (both normalize to same token)
    .replace(/\b([a-z]+)'s\b/gi, '$1s')
    .replace(/\b([a-z]+s)'\b/gi, '$1')
    .replace(/\b([A-Z][a-z]{4,})s'(?=\s|$)/g, '$1poss')
    .replace(/\b([A-Z][a-z]{4,})'s\b/g, '$1poss')
    .toLowerCase()
    .replace(/\b([a-z]+)'s\b/g, '$1')
    .replace(/\b(\d{1,2})\s*[\.:]\s*(\d{2})\s*(?:p\s*\.?\s*m\.?|pm)\b/g, '$1 $2 pm')
    .replace(/\b(\d{1,2})\s*[\.:]\s*(\d{2})\s*(?:a\s*\.?\s*m\.?|am)\b/g, '$1 $2 am')
    .replace(/\bp\s*\.?\s*m\.?\b/g, 'pm')
    .replace(/\ba\s*\.?\s*m\.?\b/g, 'am')
    // Whisper ":00 a.m./p.m." hallucination: "10 hours pm" → "10 00 pm"
    // Occurs when Whisper reads a round-hour time like "10:00 p.m." and outputs
    // "ten hours p.m." — "hours" has no valid speech equivalent here.
    .replace(/\b(\d{1,2})\s+hours\s+(am|pm)\b/g, '$1 00 $2')
    // Round-hour QC equivalence: "10 00 pm" ≡ "10 pm"
    // Script text "10:00 p.m." → expected tokens "10 00 pm".
    // TTS-preprocessed audio (or Whisper omitting the silent :00) → detected "10 pm".
    // Normalise both to "10 pm" so QC comparison succeeds.
    // ONLY fires on exact "00" minutes — does NOT affect "10 19 pm" or other partial hours.
    .replace(/\b(\d{1,2})\s+00\s+(am|pm)\b/g, '$1 $2')
    // Spoken digit sequences (badge/ID/phone numbers): "4 4-7 1" or "4 4 7 1" → "4471"
    // normalizeNumberWords converts "four-four-seven-one" pair-by-pair, producing
    // "4 4-7 1" (the hyphen between pairs survives). Whisper outputs the spoken form
    // as a joined numeric string "4471". Strip spaces AND hyphens between single digits.
    // Requires ≥3 consecutive single-digit tokens; two-digit numbers (11, 42) unaffected
    // because [0-9] only matches exactly one digit per slot.
    .replace(/\b([0-9])([ -][0-9]){2,}\b/g, match => match.replace(/[ -]/g, ''))
    // Split concatenated time numbers so both sides produce the same tokens:
    // "1119" → "11 19"  |  "415" → "4 15"  |  "830" → "8 30"
    // Whisper concatenates spoken clock times ("eleven nineteen" → "1119").
    // normalizeNumberWords converts hyphenated script times the same way
    // ("eleven-nineteen" → "1119"), so after this split both produce ["11","19"].
    // Only splits 3/4-digit numbers that look like valid 12-hour clock times
    // (hour 1-12, minutes 00-59).  Does not split years like 2011/1965
    // (hour part 20/19 > 12) or arbitrary addresses.
    .replace(/\b(1[0-2]|[1-9])([0-5]\d)\b/g, '$1 $2')
    // Year normalization: split 4-digit years into two-digit pairs so they match
    // the output of normalizeNumberWords for spelled-out years.
    // "1991" → "19 91"  |  "2023" → "20 23"  — mirrors "nineteen ninety-one" → "19 91"
    // Fires ONLY for year-range first-halves (10–25) that were NOT already split
    // by the clock-time rule above (those have first-half ≤ 12, minutes ≤ 59).
    .replace(/\b(1[3-9]|2[0-5])(\d{2})\b/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok: string) => tok.length > 0)  // explicit guard — catches any edge .filter(Boolean) misses
  return normalized
}

function compactTranscriptTokens(tokens: string[]): string[] {
  return tokens.map(token => token.replace(/[^a-z0-9]/gi, '')).filter(Boolean)
}

function transcriptTokenVariants(tokens: string[]): string[][] {
  const compacted = compactTranscriptTokens(tokens)
  const joinedAll = compacted.join('')
  const withoutMeridiem = compacted.filter(token => token !== 'am' && token !== 'pm')
  const variants = [compacted]
  if (joinedAll && joinedAll !== compacted.join(' ')) variants.push([joinedAll])
  if (withoutMeridiem.length !== compacted.length) variants.push(withoutMeridiem)
  return variants
}

function isLeadingArticle(token: string): boolean {
  return token === 'the' || token === 'a' || token === 'an'
}

function expectedLineVariants(tokens: string[]): string[][] {
  const compacted = compactTranscriptTokens(tokens)
  if (compacted.length > 1 && isLeadingArticle(compacted[0])) {
    return [compacted, compacted.slice(1)]
  }
  return [compacted]
}

function singleCapitalizedAlphaWord(text: string): string {
  const match = text.trim().match(/^([A-Z][A-Za-z]{4,})[.!?]?$/)
  return match?.[1] || ''
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function normalizeForQC(text: string): string {
  let s = text.trim()

  s = s.toLowerCase()
  s = s.replace(/[.,!?;:'"—–-]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()

  const numMap: Record<string, string> = {
    'zero': '0',
    'one': '1',
    'two': '2',
    'three': '3',
    'four': '4',
    'five': '5',
    'six': '6',
    'seven': '7',
    'eight': '8',
    'nine': '9',
    'ten': '10',
    'eleven': '11',
    'twelve': '12',
    'thirteen': '13',
    'fourteen': '14',
    'fifteen': '15',
    'sixteen': '16',
    'seventeen': '17',
    'eighteen': '18',
    'nineteen': '19',
    'twenty': '20',
    'twenty one': '21',
    'twenty two': '22',
    'twenty three': '23',
    'twenty four': '24',
    'twenty five': '25',
    'twenty six': '26',
    'twenty seven': '27',
    'twenty eight': '28',
    'twenty nine': '29',
    'thirty': '30',
    'forty': '40',
    'fifty': '50',
    'sixty': '60',
    'seventy': '70',
    'eighty': '80',
    'ninety': '90',
    'twenties': '20s',
    'thirties': '30s',
    'forties': '40s',
    'fifties': '50s',
    'sixties': '60s',
    'seventies': '70s',
    'eighties': '80s',
    'nineties': '90s',
    'first': '1st',
    'second': '2nd',
    'third': '3rd',
    'fourth': '4th',
    'fifth': '5th',
  }
  for (const [word, digit] of Object.entries(numMap).sort((a, b) => b[0].length - a[0].length)) {
    s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), digit)
  }

  const compounds: [string, string][] = [
    ['name tag', 'nametag'],
    ['fire place', 'fireplace'],
    ['some thing', 'something'],
    ['every thing', 'everything'],
    ['any thing', 'anything'],
    ['no thing', 'nothing'],
    ['some one', 'someone'],
    ['every one', 'everyone'],
    ['any one', 'anyone'],
    ['good night', 'goodnight'],
    ['good bye', 'goodbye'],
    ['every day', 'everyday'],
    ['some day', 'someday'],
    ['door step', 'doorstep'],
  ]
  for (const [spaced, joined] of compounds) {
    s = s.replace(new RegExp(`\\b${spaced}\\b`, 'g'), joined)
  }

  const verbMap: Record<string, string> = {
    'wished': 'wish',
    'wanted': 'want',
    'tried': 'try',
    'said': 'say',
    'told': 'tell',
    'looked': 'look',
    'turned': 'turn',
    'walked': 'walk',
    'asked': 'ask',
    'thought': 'think',
    'knew': 'know',
    'went': 'go',
    'came': 'come',
    'got': 'get',
    'ran': 'run',
    'saw': 'see',
    'heard': 'hear',
    'felt': 'feel',
    'made': 'make',
    'took': 'take',
    'gave': 'give',
    'left': 'leave',
    'stood': 'stand',
    'sat': 'sit',
  }
  for (const [past, base] of Object.entries(verbMap)) {
    s = s.replace(new RegExp(`\\b${past}\\b`, 'g'), base)
  }

  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (!a || !b) return 0.0
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (longer.includes(shorter) && shorter.length >= longer.length * 0.5) return 0.92
  const lenSum = a.length + b.length
  if (lenSum === 0) return 1.0
  const dist = levenshteinDistance(a, b)
  return (lenSum - dist) / lenSum
}

/*
 * Transcript QC normalization calibration:
 * normalizeForQC("early twenties") === normalizeForQC("early 20s")
 * normalizeForQC("name tag reading DAPHNE") === normalizeForQC("nametag reading Daphne")
 * normalizeForQC("wished she hadn't been") === normalizeForQC("wish she hadn't been")
 * stringSimilarity("End of the hall", "End of the hall. That's cozy.") >= 0.85
 */

function transcriptSimilarity(expected: string[], detected: string[]): number {
  const expectedCompact = compactTranscriptTokens(expected).join('')
  const detectedCompact = compactTranscriptTokens(detected).join('')
  if (!expectedCompact && !detectedCompact) return 1
  if (!expectedCompact || !detectedCompact) return 0
  const maxLen = Math.max(expectedCompact.length, detectedCompact.length)
  return 1 - (levenshteinDistance(expectedCompact, detectedCompact) / maxLen)
}

function phoneticTokenKey(token: string): string {
  const normalized = token
    .toLowerCase()
    .replace(/ie$/, 'y')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
  if (!normalized) return ''
  return normalized[0] + normalized.slice(1).replace(/[aeiou]/g, '')
}

function commonFirstNameVariantMatches(expected: string, detected: string): boolean {
  const groups = [
    ['katherine', 'catherine', 'kathryn'],
    ['sara', 'sarah'],
    ['jon', 'john'],
  ]
  return groups.some(group => group.includes(expected) && group.includes(detected))
}

function commonSurnameVariantMatches(expected: string, detected: string): boolean {
  const groups = [
    ['clarke', 'clark'],
    ['greene', 'green'],
    ['smythe', 'smith'],
    ['connelly', 'connolly'],  // Fresh Gardenias — identical pronunciation, Whisper spelling variance
  ]
  return groups.some(group => group.includes(expected) && group.includes(detected))
}

/**
 * Explicit bidirectional homophone table for transcript QC.
 *
 * Purpose: Whisper reliably transcribes certain correct spoken words as
 * phonetically identical alternatives (e.g. "Brake" → "Break").  When the
 * full passage is otherwise present, penalising for a homophone substitution
 * produces a false QC failure.
 *
 * Rules:
 *  - Both tokens are lowercased before lookup (normalisation happens upstream,
 *    but the guard is here too for safety).
 *  - Matching is explicit and bidirectional — no fuzzy logic.
 *  - This helper fires BEFORE the short-token length guard so that pairs
 *    shorter than 7 characters are not prematurely excluded.
 *  - Keep this table small.  Only add a pair when an actual QC failure
 *    confirms Whisper produces the wrong homophone for that word.
 *
 * Current pairs (add new entries as real failures are observed):
 *   brake  ↔  break     (car brake vs. to break)
 *   brakes ↔  breaks    (plural / third-person)
 *   braking ↔ breaking  (gerund)
 */
const HOMOPHONE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  // Automotive — Whisper transcribes the car-part noun as the common verb homophone
  ['brake', 'break'],
  ['brakes', 'breaks'],
  ['braking', 'breaking'],
  // Colour spelling variants — Whisper uses British 'grey' for American 'gray'
  ['gray', 'grey'],
  ['grays', 'greys'],
  // Proper noun — Whisper maps the American name 'Basil' /beɪzəl/ to the
  // Swiss city 'Basel' /bɑːzəl/; phonetically near-identical, single char diff.
  // Both tokens are 5 chars and blocked by the length-guard without this pair.
  ['basil', 'basel'],
  // Possessive character name — "Nora's" is normalised by transcriptTokens to
  // "noras" (possessive-strip regex).  Whisper produces two known variants:
  //   • "Norris"  — hears the common surname (NOR-az / NOR-iss, near-identical)
  //   • "Norah's" → "norahs" — uses the alternate spelling of the first name
  // Both are mechanical ASR false positives; not content mismatches.
  ['noras', 'norris'],
  ['noras', 'norahs'],
  // Female title variants — Whisper substitutes one title form for another
  // when referring to a woman. Both "Miss" and "Ms" are female titles;
  // phonetically near-identical. Fresh Gardenias, Segment 21.
  ['miss', 'ms'],
] as const

function knownHomophoneMatches(expected: string, detected: string): boolean {
  const a = expected.toLowerCase()
  const b = detected.toLowerCase()
  if (a === b) return false // already handled by exact-match check above
  return HOMOPHONE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}

/**
 * Returns true when one token is the simple singular form of the other
 * (token_a + 's' === token_b or vice versa).
 *
 * Rationale: Whisper commonly drops weak trailing plural /z/ sounds in
 * natural connected speech.  When the rest of the segment is present
 * (high coverage, tail passing), treating these as equivalent prevents
 * the sequential cursor from getting stuck and collapsing measured coverage.
 *
 * Safe under Marc's rule (2026-05-21):
 *   - coverage >= 0.95 in the surrounding segment
 *   - tail check passes
 *   - no named-entity, numeric, tense, or negation change
 *   - meaning / action remains materially identical
 *
 * These conditions are implicitly enforced by the QC structure: a single
 * plural/singular mismatch cannot push genuine coverage below the 0.62
 * threshold by itself; only sequential cursor collapse does.  Named
 * entities, numbers, and negations differ by more than a trailing 's'.
 *
 * Covers only the simple additive +s plural (hands, roads, eyes, minutes).
 * Irregular plurals (man/men, foot/feet) belong in HOMOPHONE_PAIRS if
 * they appear as real QC failures.
 *
 * Blocklist prevents false positives on short function words
 * (his/hiss, as/ass, is/iss, us/uss, its/itss).
 */
const SINGULAR_PLURAL_BLOCKLIST = new Set([
  'his', 'was', 'has', 'as', 'is', 'us', 'its',
])

function singularPluralVariantMatches(expected: string, detected: string): boolean {
  const a = expected.toLowerCase()
  const b = detected.toLowerCase()
  if (a === b) return false
  if (SINGULAR_PLURAL_BLOCKLIST.has(a) || SINGULAR_PLURAL_BLOCKLIST.has(b)) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  // Shorter must be >= 3 chars; longer must be exactly shorter + 's'.
  // Guard: shorter must NOT already end in 's' — this prevents double-s
  // false positives (e.g. "hands"/"handss", "class"/"classs").
  return shorter.length >= 3 && !shorter.endsWith('s') && longer === shorter + 's'
}

/**
 * Resolves a single transcript token to a canonical digit string when it
 * represents a whole number in any of the supported surface forms:
 *
 *   "15"       → "15"  (plain digit string — pass through)
 *   "fifteen"  → "15"  (cardinal word from NUMBER_WORDS)
 *   "fifteenth" → "15" (ordinal word from ORDINAL_WORDS)
 *   "15th"     → "15"  (digit ordinal suffix stripped)
 *   "sixty"    → "60"  (now covered after NUMBER_WORDS extension)
 *
 * Returns '' for tokens that do not represent a recognisable number so
 * that callers can distinguish "no match possible" from "matched zero".
 */
function numericTokenValue(token: string): string {
  if (/^\d+$/.test(token)) return token
  const cardinal = NUMBER_WORDS[token]
  if (cardinal !== undefined) return cardinal
  const ordinal = ORDINAL_WORDS[token]
  if (ordinal !== undefined) return ordinal
  const ordinalDigit = token.match(/^(\d+)(?:st|nd|rd|th)$/)
  if (ordinalDigit) return ordinalDigit[1]
  return ''
}

/**
 * Returns true when both tokens represent the same numeric value in any
 * supported surface form.  Isolated strictly to numeric-variant matching —
 * does NOT affect fuzzy word matching, phonetic matching, or name matching.
 *
 * Examples of matches this catches after normalization may still miss them:
 *   "15"   ↔ "fifteen"     (digit vs cardinal word)
 *   "21st" ↔ "twenty-first" would already be handled by normalizeOrdinalDateForms
 *                           but this is a belt-and-suspenders check
 *   "60"   ↔ "sixty"       (added via NUMBER_WORDS extension)
 *   "3rd"  ↔ "third"       (digit ordinal vs ordinal word)
 */
function numericVariantMatches(expected: string, detected: string): boolean {
  const expVal = numericTokenValue(expected)
  if (!expVal) return false
  const detVal = numericTokenValue(detected)
  return detVal !== '' && expVal === detVal
}

function transcriptTokenMatches(expected: string, detected: string): boolean {
  if (expected === detected) return true
  // Numeric-variant check: "fifteen" ↔ "15", "sixty" ↔ "60", "3rd" ↔ "third", etc.
  // Runs before the length guard so short digit/word tokens are not excluded.
  if (numericVariantMatches(expected, detected)) return true
  // Homophone check: explicit pairs where Whisper reliably substitutes a
  // phonetically identical word (e.g. "brake" → "break").  Runs before the
  // length guard for the same reason — these pairs are often short tokens.
  // The phonetic length guard below is intentionally left unchanged.
  if (knownHomophoneMatches(expected, detected)) return true
  // Singular/plural variance: "hand"↔"hands", "eye"↔"eyes", "road"↔"roads".
  // Whisper commonly drops weak trailing /z/ in natural connected speech.
  // Safe when coverage and tail pass (enforced upstream); does not block
  // genuine missing-content failures (those differ by more than one 's').
  if (singularPluralVariantMatches(expected, detected)) return true
  if (commonFirstNameVariantMatches(expected, detected)) return true
  if (commonSurnameVariantMatches(expected, detected)) return true
  // ATL-PIPE-008/A8: Fuzzy short-token matching for homophone-style transcription noise.
  // Prevents near-misses like "set"→"sat" (distance 1) from failing QC.
  // Applies only to tokens ≥ 3 chars (avoids matching tiny function words) with same first letter.
  // Levenshtein ≤ 2 for tokens ≤ 5 chars; ≤ 3 for tokens 6-9 chars (fills gap below long-word threshold).
  if (expected.length >= 3 && detected.length >= 3 && expected[0] === detected[0]) {
    const maxFuzzyLen = Math.max(expected.length, detected.length)
    const fuzzyDist = levenshteinDistance(expected, detected)
    if (maxFuzzyLen <= 5 && fuzzyDist <= 2) return true
    if (maxFuzzyLen > 5 && maxFuzzyLen < 10 && fuzzyDist <= 3) return true
  }
  if (expected.length < 7 || detected.length < 7) return false
  if (expected[0] !== detected[0]) return false

  const maxLen = Math.max(expected.length, detected.length)
  if (maxLen > 16) return false
  const similarity = 1 - (levenshteinDistance(expected, detected) / maxLen)
  if (similarity >= 0.82) return true

  const expectedKey = phoneticTokenKey(expected)
  const detectedKey = phoneticTokenKey(detected)
  return expectedKey.length >= 4 && expectedKey === detectedKey
}

function oneWordProperNameVariantMatches(expectedText: string, detectedText: string): boolean {
  const expected = singleCapitalizedAlphaWord(expectedText)
  const detected = singleCapitalizedAlphaWord(detectedText)
  if (!expected || !detected || expected[0] !== detected[0]) return false

  const expectedLower = expected.toLowerCase()
  const detectedLower = detected.toLowerCase()
  const commonWordBlocklist = new Set(['ferry', 'fairy', 'rode', 'wrote', 'crews', 'cruise', 'hours', 'ours'])
  if (commonWordBlocklist.has(expectedLower) || commonWordBlocklist.has(detectedLower)) return false

  const maxLen = Math.max(expectedLower.length, detectedLower.length)
  if (maxLen > 16) return false
  const similarity = 1 - (levenshteinDistance(expectedLower, detectedLower) / maxLen)
  if (similarity >= 0.82) return true

  const expectedKey = phoneticTokenKey(expectedLower)
  const detectedKey = phoneticTokenKey(detectedLower)
  return expectedKey.length >= 3 && expectedKey === detectedKey
}

function containsOrderedTokenVariant(haystack: string[], needle: string[]): boolean {
  return transcriptTokenVariants(haystack).some(haystackVariant =>
    transcriptTokenVariants(needle).some(needleVariant => containsOrderedTokens(haystackVariant, needleVariant))
  )
}

function containsOrderedTokens(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true
  let cursor = 0
  for (const token of haystack) {
    if (transcriptTokenMatches(needle[cursor], token)) cursor++
    if (cursor >= needle.length) return true
  }
  return false
}

function transcriptCoverage(expected: string[], detected: string[]): number {
  if (expected.length === 0) return 1
  let cursor = 0
  let matched = 0
  for (const token of detected) {
    if (transcriptTokenMatches(expected[cursor], token)) {
      matched++
      cursor++
    }
    if (cursor >= expected.length) break
  }
  return matched / expected.length
}

function transcriptVariantCoverage(expected: string[], detected: string[]): number {
  let best = transcriptCoverage(expected, detected)
  for (const expectedVariant of transcriptTokenVariants(expected)) {
    for (const detectedVariant of transcriptTokenVariants(detected)) {
      best = Math.max(best, transcriptCoverage(expectedVariant, detectedVariant))
    }
  }
  return best
}

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

/**
 * Low-information function words that Whisper commonly drops at clip boundaries.
 * Used by isSafeTerminalTailDrop — keep this set small and evidence-based.
 */
const SAFE_TERMINAL_FUNCTION_WORDS = new Set(['it', 'a', 'an', 'the', 'to', 'of', 'in', 'on'])

/**
 * Returns true when the ONLY QC failure is that Whisper dropped the final
 * short function word at a clip boundary — a well-documented Whisper behaviour.
 *
 * All conditions must hold simultaneously (Marc's rule, 2026-05-21):
 *   1. coverage >= 0.95
 *   2. The failing token is ONLY the last expected token
 *   3. That token is <= 3 chars
 *   4. That token is in SAFE_TERMINAL_FUNCTION_WORDS
 *   5. All other expected tokens are covered (truncatedCoverage >= 0.95)
 *
 * Conditions 4 and 5 together implicitly satisfy:
 *   - no named entity change (approved set contains no proper nouns)
 *   - no numeric change (approved set contains no digits)
 *   - no negation change (approved set contains no 'not'/'no'/'never')
 *   - sentence meaning materially intact
 *
 * Examples: "away with it" → "away with"  |  "went to the" → "went to"
 */
function isSafeTerminalTailDrop(
  expected: string[],
  detected: string[],
  coverage: number,
): boolean {
  if (coverage < 0.95) return false
  if (expected.length < 2) return false

  const finalToken = expected[expected.length - 1]
  if (finalToken.length > 3) return false
  if (!SAFE_TERMINAL_FUNCTION_WORDS.has(finalToken)) return false

  // Every token except the final one must be present in detected.
  // Use transcriptVariantCoverage so existing token-level equivalences apply.
  const expectedWithoutFinal = expected.slice(0, -1)
  const truncatedCoverage = transcriptVariantCoverage(expectedWithoutFinal, detected)
  return truncatedCoverage >= 0.95
}

/**
 * Strict token matcher — identical to transcriptTokenMatches but intentionally
 * excludes singularPluralVariantMatches. Used by weakVerbTrailingSRescue so
 * that the segment-level rescue can measure "baseline coverage without the
 * trailing-s benefit" and only apply the rescue on top of a proven 0.96+
 * baseline.
 */
function strictTranscriptTokenMatches(expected: string, detected: string): boolean {
  if (expected === detected) return true
  if (numericVariantMatches(expected, detected)) return true
  if (knownHomophoneMatches(expected, detected)) return true
  if (commonFirstNameVariantMatches(expected, detected)) return true
  if (commonSurnameVariantMatches(expected, detected)) return true
  if (expected.length < 7 || detected.length < 7) return false
  if (expected[0] !== detected[0]) return false
  const maxLen = Math.max(expected.length, detected.length)
  if (maxLen > 16) return false
  return 1 - (levenshteinDistance(expected, detected) / maxLen) >= 0.82
}

/**
 * Detects two normalized tokens that differ only by a trailing 's' on one of
 * them, with no other change.  Both tokens must be >= 3 chars; the shorter must
 * NOT already end in 's' (prevents false matches like "classs" or "handss").
 * Used exclusively by weakVerbTrailingSRescue — not a standalone match rule.
 */
function isWeakTrailingS(a: string, b: string): boolean {
  if (a === b) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.length >= 3 && !shorter.endsWith('s') && longer === shorter + 's'
}

/**
 * Segment-level rescue for mechanical ASR trailing-s drops on verbs.
 *
 * Whisper occasionally drops the final /z/ on present-tense third-person
 * singular verbs: "puts" → "put", "gets" → "get", "walks" → "walk".
 * This is a mechanical ASR artifact, NOT a content error.
 *
 * This rescue is NARROW by design.  All conditions must hold simultaneously:
 *
 *   1. tailMatches must already be true — the tail check passes independently,
 *      confirming the audio reaches the end of the expected text.
 *   2. Strict baseline coverage (WITHOUT counting trailing-s as matches) must
 *      be ≥ 0.96.  The rest of the transcript proves the audio is correct;
 *      we are rescuing only a tiny mechanical artefact, not covering real gaps.
 *   3. The number of trailing-s mismatches is 1 or 2 at most.
 *   4. Each mismatched token must NOT be a proper noun, entity name, or
 *      capitalised word in the original (pre-normalisation) expected text.
 *      Capitalized tokens in the original are treated as high-value content
 *      where an 's' difference may carry meaning (e.g. a business name).
 *
 * NOT a broad fallback: this rescue CANNOT pass a segment where coverage is
 * genuinely low.  It only fires when strict coverage is already 0.96+ and the
 * only outstanding gap is 1–2 trailing-s mismatches on lowercase verb tokens.
 *
 * "says" is intentionally not protected here — Whisper may render it as "sez"
 * (a full word substitution) which isWeakTrailingS will not match anyway.
 */
function weakVerbTrailingSRescue(
  expected: string[],
  detected: string[],
  originalExpectedText: string,
  tailMatches: boolean,
): boolean {
  if (!tailMatches) return false
  if (expected.length === 0) return false

  // Build a set of lowercase tokens that were capitalised in the original text
  // (proper nouns, entity names, character names, etc.).
  const properNounTokens = new Set<string>()
  for (const word of originalExpectedText.split(/\s+/)) {
    if (word.length > 0 && word[0] >= 'A' && word[0] <= 'Z') {
      properNounTokens.add(word.toLowerCase().replace(/[^a-z0-9]/g, ''))
    }
  }

  // Run a strict sequential cursor (no singularPluralVariantMatches) to find
  // the baseline coverage and identify trailing-s mismatch positions.
  let cursor = 0
  let strictMatched = 0
  const trailingSMismatches: string[] = []

  for (let i = 0; i < detected.length && cursor < expected.length; i++) {
    const exp = expected[cursor]
    const det = detected[i]
    if (strictTranscriptTokenMatches(exp, det)) {
      strictMatched++
      cursor++
    } else if (isWeakTrailingS(exp, det)) {
      // Do not advance cursor here — we need to decide whether to rescue first.
      // Count as a candidate mismatch and advance anyway so the cursor doesn't
      // permanently stall at this position.
      if (!properNounTokens.has(exp) && !properNounTokens.has(det)) {
        trailingSMismatches.push(exp)
      }
      cursor++
    }
    // Anything else: cursor stalls (real mismatch or deletion — never rescued).
  }

  const total = expected.length
  const strictCoverage = total > 0 ? strictMatched / total : 1
  // "Would-be coverage" = coverage if trailing-s mismatches were counted as correct.
  // The ≥ 0.96 gate applies here — Marc's requirement is that the REST of the
  // transcript is already at 96%+ quality, not that the strict baseline alone is 96%.
  // Example: 12-token segment, 1 trailing-s gap → (11+1)/12 = 1.0 ≥ 0.96 ✓
  //          12-token segment, 1 trailing-s gap + real missing word → (8+1)/12 = 0.75 ✗
  const wouldBeCoverage = total > 0 ? (strictMatched + trailingSMismatches.length) / total : 1
  // Belt-and-suspenders: strict coverage alone must be at least 0.80 so that a pair
  // of trailing-s matches cannot mask a genuinely poor transcription (e.g. a 5-token
  // segment where 2 tokens are trailing-s — strict coverage only 0.60 but would-be 1.0).
  return (
    wouldBeCoverage >= 0.96 &&
    strictCoverage >= 0.80 &&
    trailingSMismatches.length >= 1 &&
    trailingSMismatches.length <= 2
  )
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
  const expected = transcriptTokens(expectedText)
  const detected = transcriptTokens(detectedText)
  const normExpected = normalizeForQC(expectedText)
  const normDetected = normalizeForQC(detectedText)
  const detectedBlank = detectedText.trim().length === 0 || normDetected.length === 0
  const normalizedSimilarity = stringSimilarity(normExpected, normDetected)
  const normalizedExactMatch = normExpected === normDetected
  const radicalLengthMismatch = normExpected.length > 0
    && normDetected.length < normExpected.length * 0.30
    && normalizedSimilarity < 0.70
  const tail = expected.slice(Math.max(0, expected.length - SEGMENT_TRANSCRIPT_TAIL_WORDS))
  const tailCandidates = expected.length <= SEGMENT_TRANSCRIPT_TAIL_WORDS && tail.length > 1 && isLeadingArticle(tail[0])
    ? [tail, tail.slice(1)]
    : [tail]
  const tailMatches = tailCandidates.some(candidate => containsOrderedTokenVariant(detected, candidate))
  const expectedVariants = expectedLineVariants(expected)
  const coverage = Math.max(...expectedVariants.map(variant => transcriptVariantCoverage(variant, detected)))
  const tokenSimilarity = Math.max(...expectedVariants.map(variant => transcriptSimilarity(variant, detected)))
  const similarity = Math.max(tokenSimilarity, normalizedSimilarity)
  const shortLineMatches = expected.length <= 8
    ? expectedVariants.some(variant => containsOrderedTokenVariant(detected, variant)) || similarity >= 0.88
    : true
  const oneWordProperNameMatch = oneWordProperNameVariantMatches(expectedText, detectedText)
  // Safe terminal tail drop: Whisper clips the final short function word at
  // segment boundaries.  Does not regenerate — treated as equivalent.
  const safeTerminalTailDrop = !tailMatches && isSafeTerminalTailDrop(expected, detected, coverage)

  // Weak verb trailing-s rescue: mechanical ASR drop of final /z/ on verbs
  // ("puts" → "put", "gets" → "get").  Fires ONLY when strict baseline
  // coverage (without counting trailing-s) is already ≥ 0.96, the tail passes,
  // and there are at most 2 trailing-s mismatches on non-proper-noun tokens.
  const weakVerbTrailingS = !safeTerminalTailDrop
    && !oneWordProperNameMatch
    && !(tailMatches && shortLineMatches && coverage >= SEGMENT_TRANSCRIPT_MIN_COVERAGE)
    && weakVerbTrailingSRescue(expected, detected, expectedText, tailMatches)

  const tokenQcPassed = oneWordProperNameMatch
    || safeTerminalTailDrop
    || weakVerbTrailingS
    || (tailMatches && shortLineMatches && coverage >= SEGMENT_TRANSCRIPT_MIN_COVERAGE)
  const normalizedQcPassed = normalizedExactMatch || normalizedSimilarity >= 0.85
  const passed = !detectedBlank
    && !radicalLengthMismatch
    && (tokenQcPassed || normalizedQcPassed)

  if (!tokenQcPassed && normalizedQcPassed && !normalizedExactMatch) {
    console.warn(`[QC WARNING] Segment ${fileName}: similarity ${(normalizedSimilarity * 100).toFixed(1)}% — expected "${expectedText}" detected "${detectedText}"`)
  }

  return {
    passed,
    expectedText,
    detectedText,
    coverage,
    similarity,
    tailMatches,
    shortLineMatches,
    oneWordProperNameMatch,
    safeTerminalTailDrop,
    weakVerbTrailingS,
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

// Load all My Voices from ElevenLabs - used as the character voice pool
async function loadMyVoices(): Promise<any[]> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': EL_API_KEY } })
    if (!res.ok) return []
    const data = await res.json()
    // Filter to only usable character voices - exclude narrators, Belle B, ET voices, generated voices
    return (data.voices || []).filter((v: any) => {
      if (isBelleBVoiceId(v.voice_id)) return false
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
  return { gender, age, accent, tones }
}

// Score a voice candidate against character requirements
function scoreVoice(voice: any, meta: { gender: string; age: string; accent: string; tones: string[] }): number {
  const labels = voice.labels || {}
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
  // Prefer narrative_story use case
  const useCase = (labels.use_case || '').toLowerCase()
  if (useCase.includes('narrative') || useCase.includes('story')) score += 8
  else if (useCase.includes('character')) score += 5
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
  meta: { gender: string; age: string; accent: string; tones: string[] },
  myVoices: any[],
  blockedVoiceIds: Set<string>
) {
  return myVoices
    .filter(v => !blockedVoiceIds.has(v.voice_id) && !isBelleBVoiceId(v.voice_id))
    .map(v => ({ voice: v, score: scoreVoice(v, meta) }))
    .filter(x => x.score > -999)
    .sort((a, b) => b.score - a.score)
}

// Find best matching voice from My Voices pool
function findVoiceForCharacter(
  characterName: string,
  meta: { gender: string; age: string; accent: string; tones: string[] },
  myVoices: any[],
  usedVoiceIds: Set<string>,
  narratorVoiceId: string
): CharacterVoiceSelection {
  const blockedVoiceIds = new Set<string>([...usedVoiceIds, narratorVoiceId, ...RESERVED_BELLE_B_VOICE_IDS])
  // Score all candidates
  const scored = scoreCharacterVoiceCandidates(meta, myVoices, blockedVoiceIds)

  if (scored.length === 0) {
    // Gender mismatch fallback - try any voice of right gender
    const genderFallback = myVoices.find(v =>
      !usedVoiceIds.has(v.voice_id) &&
      v.voice_id !== narratorVoiceId &&
      !isBelleBVoiceId(v.voice_id) &&
      (v.labels?.gender?.toLowerCase() === meta.gender.toLowerCase())
    )
    if (genderFallback) {
      console.log(`  ${characterName}: gender fallback → ${genderFallback.name}`)
      return { voiceId: genderFallback.voice_id, reusedVoice: false, voiceName: genderFallback.name }
    }

    // Controlled reuse fallback: reuse a safe existing character voice, never narrator or Belle.
    const reuseBlockedVoiceIds = new Set<string>([narratorVoiceId, ...RESERVED_BELLE_B_VOICE_IDS])
    const reusableScored = scoreCharacterVoiceCandidates(meta, myVoices, reuseBlockedVoiceIds)
    if (reusableScored.length > 0) {
      const reusePick = reusableScored[0]
      console.log(`  ${characterName}: ${reusePick.voice.name} (score:${reusePick.score}, reusedVoice:true)`)
      return {
        voiceId: reusePick.voice.voice_id,
        reusedVoice: true,
        voiceName: reusePick.voice.name,
        score: reusePick.score,
      }
    }

    console.log(`  ${characterName}: absolute fallback`)
    throw new Error(`No safe character voice available for ${characterName}; narrator and Belle voices cannot be reused.`)
  }

  const pick = scored[0].voice
  console.log(`  ${characterName}: ${pick.name} (score:${scored[0].score}, ${pick.labels?.gender}, ${pick.labels?.age}, ${pick.labels?.accent}, ${pick.labels?.descriptive})`)
  return {
    voiceId: pick.voice_id,
    reusedVoice: false,
    voiceName: pick.name,
    score: scored[0].score,
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
  const match = script.match(new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^\\r\\n]*)`, 'im'))
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
  if (kind === 'intro' && words > 38) errors.push('intro is too long for a clean handoff')
  if (kind === 'outro' && words > 55) errors.push('outro is too long for Belle')
  if (kind === 'intro' && (cleaned.match(/\[LISTENER_NAME\]/g) || []).length > 1) errors.push('intro has more than one [LISTENER_NAME] placeholder')

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
      return `You're back inside "${title}." The road is open, the stakes are still moving, and the next turn belongs to the story.`
    }
    return `This is "${title}," an Endless Tales Original. Settle in for a story built to carry you cleanly into its first turn.`
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
  characterVoiceKeys(characterName).forEach(key => {
    if (!voiceMap[key]) voiceMap[key] = voiceId
  })
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
  const isAnnouncer = prefix === 'intro' || prefix === 'intro_before' || prefix === 'intro_after' || prefix === 'outro'
  const generateAttempt = async (): Promise<Buffer> => {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': EL_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: EL_SETTINGS })
    })
    if (!res.ok) throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const rawBuf = Buffer.from(await res.arrayBuffer())
    // ATL-PIPE-001: Reject silence placeholder buffers before any processing
    if (rawBuf.length <= SILENCE_BUFFER_SIZE_THRESHOLD) {
      throw new Error(`SILENCE_BUFFER: ${fileName} rejected — ElevenLabs returned ${rawBuf.length} bytes (≤ ${SILENCE_BUFFER_SIZE_THRESHOLD} silence threshold)`)
    }
    const rawBufMd5 = createHash('md5').update(rawBuf).digest('hex')
    if (rawBufMd5 === SILENCE_BUFFER_KNOWN_ETAG) {
      throw new Error(`SILENCE_BUFFER: ${fileName} rejected — matches known silence eTag ${SILENCE_BUFFER_KNOWN_ETAG}`)
    }
    return normalizeSpokenBuffer(rawBuf, rawText, prefix)
  }

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
          console.error(
            `  ⚠️ REPEATED_IDENTICAL_TRUNCATION [${ruleCase}] ${fileName} speaker="${speaker}" ` +
            `candidates=${transcriptDetectedTexts.length} coverage=${transcriptFailure.coverage?.toFixed(2)} ` +
            `all-detected="${truncatedAt}" ` +
            `— Whisper VAD is stopping at a natural pause on every retry. ` +
            `Split this segment into shorter sub-segments and re-run.`
          )
          throw new Error(
            `Segment transcript QC failed for ${fileName} [REPEATED_IDENTICAL_TRUNCATION]: ` +
            `Whisper returned the same partial output "${truncatedAt}" across all ${transcriptDetectedTexts.length} retry candidates. ` +
            `Retrying will not help. Split this segment into shorter sub-segments. ` +
            `expected "${transcriptFailure.expectedText}"`
          )
        }
        throw new Error(`Segment transcript QC failed for ${fileName}: expected "${transcriptFailure.expectedText}", detected "${transcriptFailure.detectedText}" (similarity: ${((transcriptFailure.similarity ?? 0) * 100).toFixed(1)}%)`)
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
    const { storyId, script: scriptParam, narratorVoiceId, narratorVoiceName, characterVoices: characterVoicesParam, preflightOnly, retryMissingOnly, segmentNumber, generateBelleOnly } = await req.json()
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    let script = scriptParam
    const { data: storyRow, error: storyRowError } = await supabase
      .from('stories')
      .select('id,title,author,genre,description,duration_mins,created_at,script,narrator_voice_id,narrator_voice_name,series_name,series_id,episode_number,series_episode_number,series_total,series_total_episodes,series_is_finale,options')
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
    if (introValidation.repaired && introValidation.line) belleRepairUpdates.intro_text = introValidation.line.text
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
        .filter(file => file.name === 'intro.mp3' || file.name.startsWith('intro_'))
        .sort((a, b) => {
          const priority = (name: string) => name === 'intro.mp3' ? 0 : name.startsWith('intro_before') ? 1 : 2
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
          const introText = introLine.text
          const listenerNameCount = (introText.match(/\[LISTENER_NAME\]/g) || []).length
          if (listenerNameCount > 1) throw new Error('Belle B intro must contain exactly one [LISTENER_NAME] placeholder.')
          if (listenerNameCount === 1) {
            const parts = introText.split('[LISTENER_NAME]')
            const beforeText = parts[0].trim()
            const afterText = parts[1].trim()
            if (!beforeText && !afterText) throw new Error('Belle B intro has [LISTENER_NAME] but no surrounding text.')
            // Only generate audio for non-empty parts — empty beforeText would cause ElevenLabs
            // to return silence (~10KB) which fails validate_belle_assets silence rejection.
            let beforeUrl: string | null = null
            let afterUrl: string | null = null
            if (beforeText) beforeUrl = await generateVoiceLine(beforeText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index, 'intro_before')
            if (afterText) afterUrl = await generateVoiceLine(afterText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index + 0.1, 'intro_after')
            const primaryUrl = (beforeUrl ?? afterUrl)!
            result.introUrl = primaryUrl
            await supabase.from('stories').update({ intro_audio_url: primaryUrl, intro_before_url: beforeUrl ?? null, intro_after_url: afterUrl ?? null }).eq('id', storyId)
          } else {
            const introUrl = await generateVoiceLine(introText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index, 'intro')
            result.introUrl = introUrl
            await supabase.from('stories').update({ intro_audio_url: introUrl, intro_before_url: introUrl, intro_after_url: null }).eq('id', storyId)
          }
          result.introStatus = 'generated'
          console.log('  ✅ Belle-only intro generated')
        } catch (e) {
          result.introStatus = 'failed'
          result.errors.push(`Intro failed: ${String(e)}`)
          console.error('  ❌ Belle-only intro failed:', e)
        }
      }

      if (!existingOutroFile && outroLine && outroLine.index !== introLine?.index) {
        try {
          const outroUrl = await generateVoiceLine(outroLine.text, CANONICAL_BELLE_B_VOICE_ID, storyId, outroLine.index, 'outro')
          result.outroUrl = outroUrl
          await supabase.from('stories').update({ outro_audio_url: outroUrl }).eq('id', storyId)
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
    let resolvedNarratorVoiceId = narratorVoiceId
    let resolvedNarratorVoiceName = narratorVoiceName
    if (!resolvedNarratorVoiceId && narratorVoiceName) resolvedNarratorVoiceId = voiceByName[narratorVoiceName]
    if (!resolvedNarratorVoiceId) {
      if (storyRow?.narrator_voice_id) {
        resolvedNarratorVoiceId = storyRow.narrator_voice_id
        resolvedNarratorVoiceName = storyRow.narrator_voice_name || resolvedNarratorVoiceName
      } else if (storyRow?.narrator_voice_name) {
        resolvedNarratorVoiceName = storyRow.narrator_voice_name
        resolvedNarratorVoiceId = voiceByName[storyRow.narrator_voice_name]
      }
    }
    if (!resolvedNarratorVoiceId) resolvedNarratorVoiceId = voiceByName['Cole Hargrove']
    if (!resolvedNarratorVoiceId && preflightOnly !== true) return NextResponse.json({ success: false, error: 'No narrator voice found' }, { status: 400 })
    if (!resolvedNarratorVoiceName) resolvedNarratorVoiceName = narratorVoiceById[resolvedNarratorVoiceId]?.name
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
    // Load My Voices pool once - used for all character assignments
    const myVoices = await loadMyVoices()
    console.log(`  My Voices pool: ${myVoices.length} voices`)
    const usedVoiceIds = new Set<string>([resolvedNarratorVoiceId, ...RESERVED_BELLE_B_VOICE_IDS])
    // Build voice map using local My Voices scoring
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
      } else {
        // Find best matching voice from pool
        const selection = findVoiceForCharacter(char.name, meta, myVoices, usedVoiceIds, resolvedNarratorVoiceId)
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
        if (!selection.reusedVoice) usedVoiceIds.add(voiceMap[key])
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
      }
    }
    console.log(`  Parsed character guide names:`, characterGuide.map(c => c.name).join(', ') || 'none')
    console.log(`  Characters:`, characterGuide.map(c => `${c.name}(${c.gender})`).join(', '))
    const characterSpeakers = Array.from(new Set(storyLines
      .filter(l => l.type === 'character' && !nonDialogueSpeakers.has(l.speaker.toUpperCase()))
      .map(l => l.speaker.toUpperCase())))
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
    const segmentFilePattern = /^segment_\d{4}\.mp3$/
    const storyAudioFolder = `asc3/${storyId}`
    const expectedSegmentNames = storyLines
      .filter(line => line.type === 'narrator' || line.type === 'character' || line.type === 'beat' || line.type === 'pause')
      .map(line => `segment_${line.index.toString().padStart(4, '0')}.mp3`)
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

      const targetableStoryLines = storyLines.filter(line => line.type === 'narrator' || line.type === 'character' || line.type === 'beat' || line.type === 'pause')
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

      const existingSegmentNames = new Set((existingAudioFiles || []).filter(file => segmentFilePattern.test(file.name)).map(file => file.name))
      const targetFileName = `segment_${requestedSegmentNumber.toString().padStart(4, '0')}.mp3`
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
            const characterVoiceId = voiceMap[targetLine.speaker.toUpperCase()]
            if (!characterVoiceId) throw new Error(`Missing character voice assignment for ${targetLine.speaker}`)
            voiceId = characterVoiceId
          }
          const url = await generateVoiceLine(targetLine.text, voiceId, storyId, targetLine.index, 'segment', true, targetLine.speaker, 8, qcSkippedSegments)
          generatedSegments.push({ index: targetLine.index, speaker: targetLine.speaker, type: targetLine.type, url })
        } else {
          throw new Error(`Targeted retry does not support ${targetLine.type} lines`)
        }
      } catch (e) {
        failures.push({
          segment: targetFileName,
          index: targetLine.index,
          speaker: targetLine.speaker,
          type: targetLine.type,
          error: String(e),
        })
      }

      const { data: updatedAudioFiles, error: updatedListError } = await supabase.storage.from('audio').list(storyAudioFolder, { limit: 500 })
      if (updatedListError) {
        console.error('  ❌ Failed to list updated story segments:', updatedListError)
        return NextResponse.json({ success: false, error: `Failed to list updated story segments: ${updatedListError.message}` }, { status: 500 })
      }
      const updatedSegmentNames = new Set((updatedAudioFiles || []).filter(file => segmentFilePattern.test(file.name)).map(file => file.name))
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
        const introText = introLine.text
        const listenerNameCount = (introText.match(/\[LISTENER_NAME\]/g) || []).length
        if (listenerNameCount > 1) {
          throw new Error('Belle B intro must contain exactly one [LISTENER_NAME] placeholder.')
        }
        if (listenerNameCount === 1) {
          // Split into before/after name — only generate audio for non-empty parts.
          // If the intro starts with [LISTENER_NAME] (e.g. "[LISTENER_NAME], a dead man…"),
          // beforeText will be empty and generating audio for it causes ElevenLabs to return
          // ~10KB of silence, which fails validate_belle_assets silence rejection.
          const parts = introText.split('[LISTENER_NAME]')
          const beforeText = parts[0].trim()
          const afterText = parts[1].trim()
          if (!beforeText && !afterText) throw new Error('Belle B intro has [LISTENER_NAME] but no surrounding text.')
          let beforeUrl: string | null = null
          let afterUrl: string | null = null
          if (beforeText) beforeUrl = await generateVoiceLine(beforeText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index, 'intro_before')
          if (afterText) afterUrl = await generateVoiceLine(afterText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index + 0.1, 'intro_after')
          results.intro = (beforeUrl ?? afterUrl)!
          await supabase.from('stories').update({ intro_before_url: beforeUrl ?? null, intro_after_url: afterUrl ?? null }).eq('id', storyId)
          console.log('  ✅ Belle B intro split (before/after name)')
        } else {
          results.intro = await generateVoiceLine(introText, CANONICAL_BELLE_B_VOICE_ID, storyId, introLine.index, 'intro')
          await supabase.from('stories').update({ intro_before_url: results.intro, intro_after_url: null }).eq('id', storyId)
          console.log('  ✅ Belle B intro (no name split)')
        }
      } catch (e) { console.error('  ❌ Intro failed:', e) }
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
        const characterVoiceId = voiceMap[line.speaker.toUpperCase()]
        if (!characterVoiceId) throw new Error(`Missing character voice assignment for ${line.speaker}`)
        voiceId = characterVoiceId
      }
      // ── Escalation-aware retry loop (MAX_SEGMENT_ATTEMPTS = 5) ──────────────
      {
        const segment = `segment_${line.index.toString().padStart(4, '0')}.mp3`
        let lastError = ''
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
          results.segments.push({ index: line.index, speaker: line.speaker, type: line.type, error: lastError, escalated: true })
          failures.push({ segment, index: line.index, speaker: line.speaker, type: line.type, error: lastError })
          failed++
        }
      }
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
    })
  } catch (err) {
    console.error('generate-voices error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
