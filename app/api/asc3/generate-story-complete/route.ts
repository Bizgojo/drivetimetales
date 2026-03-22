import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

// Belle B is RESERVED for intro/outro ONLY — never used for characters
const BELLE_B_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const ELEVENLABS_CHUNK_SIZE = 4500

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Curated Voice Pool for Character Matching ───────────────────────────────
// These are high-quality ElevenLabs voices suitable for audio drama

const CURATED_VOICES = [
  { voice_id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',   gender: 'male',    age: 'middle_aged', accent: 'british',   description: 'Warm, Captivating Storyteller' },
  { voice_id: 'SAz9YHcvj6GT2YYXdXww', name: 'River',    gender: 'neutral',  age: 'middle_aged', accent: 'american',  description: 'Relaxed, Neutral, Informative' },
  { voice_id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger',    gender: 'male',    age: 'middle_aged', accent: 'american',  description: 'Laid-Back, Casual, Resonant' },
  { voice_id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',   gender: 'male',    age: 'middle_aged', accent: 'american',  description: 'Husky, Trickster' },
  { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie',  gender: 'male',    age: 'young',       accent: 'australian', description: 'Deep, Confident, Energetic' },
  { voice_id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry',    gender: 'male',    age: 'young',       accent: 'american',  description: 'Fierce Warrior' },
  { voice_id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',     gender: 'male',    age: 'young',       accent: 'american',  description: 'Energetic, Social' },
  { voice_id: 'bIHbv24MWmeRgasZH58o', name: 'Will',     gender: 'male',    age: 'young',       accent: 'american',  description: 'Relaxed Optimist' },
  { voice_id: 'cjVigY5qzO86Huf0OWal', name: 'Eric',     gender: 'male',    age: 'middle_aged', accent: 'american',  description: 'Smooth, Trustworthy' },
  { voice_id: 'iP95p4xoKVk53GoZ742B', name: 'Chris',    gender: 'male',    age: 'middle_aged', accent: 'american',  description: 'Charming, Down-to-Earth' },
  { voice_id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',    gender: 'male',    age: 'middle_aged', accent: 'american',  description: 'Deep, Resonant, Comforting' },
  { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',   gender: 'male',    age: 'middle_aged', accent: 'british',   description: 'Steady Broadcaster' },
  { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',     gender: 'male',    age: 'middle_aged', accent: 'american',  description: 'Dominant, Firm' },
  { voice_id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill',     gender: 'male',    age: 'old',         accent: 'american',  description: 'Wise, Mature, Balanced' },
  { voice_id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',    gender: 'female',  age: 'young',       accent: 'american',  description: 'Enthusiast, Quirky' },
  { voice_id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica',  gender: 'female',  age: 'young',       accent: 'american',  description: 'Playful, Bright, Warm' },
  { voice_id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',    gender: 'female',  age: 'middle_aged', accent: 'british',   description: 'Clear, Engaging Educator' },
  { voice_id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda',  gender: 'female',  age: 'middle_aged', accent: 'american',  description: 'Knowledgeable, Professional' },
  { voice_id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella',    gender: 'female',  age: 'middle_aged', accent: 'american',  description: 'Professional, Bright, Warm' },
  { voice_id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',     gender: 'female',  age: 'middle_aged', accent: 'british',   description: 'Velvety Actress' },
]

// NARRATOR uses George (warm, captivating British storyteller) as default
const NARRATOR_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'
const NARRATOR_VOICE_NAME = 'George'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CharacterInfo {
  name: string
  description: string
  gender: 'male' | 'female' | 'neutral' | 'unknown'
  age: 'young' | 'middle' | 'old' | 'unknown'
}

interface VoiceAssignment {
  voice_id: string
  voice_name: string
}

interface AudioSegment {
  speaker: string
  text: string
  voiceId: string
  index: number
}

interface StorySegmentResult {
  speaker: string
  text_preview: string
  audioUrl: string
  index: number
}

// ─── Character Parsing ────────────────────────────────────────────────────────

// Common male first names for fallback gender detection
const MALE_NAMES = new Set(['james','john','robert','michael','william','david','richard','joseph','thomas','charles','christopher','daniel','matthew','anthony','mark','donald','steven','paul','andrew','kenneth','george','joshua','kevin','brian','edward','ronald','timothy','jason','jeffrey','ryan','gary','jacob','nicholas','eric','jonathan','stephen','larry','justin','scott','brandon','benjamin','samuel','frank','raymond','patrick','jack','dennis','jerry','tyler','aaron','jose','adam','henry','douglas','nathan','peter','zachary','kyle','walter','harold','jeremy','ethan','carl','arthur','roger','terry','sean','austin','christian','noah','joe','alan','juan','elijah','phillip','wayne','albert','bobby','billy','dylan','liam','mason','lucas','oliver','aiden','caleb','eli','cameron','luke','alexander','charlie','hunter','jackson','wyatt','gabriel','evan','owen','henry','leo','lincoln','xavier','landon','parker','finn','max','julian','cole','carter','hayden','carlos','miguel','louis','antonio','marcus','travis','alex','richard','sheriff','detective','doctor','captain','father','reverend','deputy','agent','officer'])

// Common female first names for fallback gender detection
const FEMALE_NAMES = new Set(['mary','patricia','linda','barbara','elizabeth','jennifer','maria','susan','dorothy','lisa','nancy','karen','betty','helen','sandra','donna','carol','ruth','sharon','michelle','laura','sarah','kimberly','deborah','jessica','shirley','cynthia','angela','melissa','brenda','amy','anna','rebecca','virginia','kathleen','pamela','martha','debra','amanda','stephanie','carolyn','christine','marie','janet','catherine','frances','ann','joyce','diane','alice','julie','heather','teresa','doris','gloria','evelyn','jean','cheryl','mildred','katherine','joan','ashley','judith','rose','janice','kelly','nicole','judy','christina','kathy','theresa','beverly','denise','tammy','irene','jane','lori','rachel','marilyn','andrea','kathryn','louise','sara','anne','jacqueline','wanda','bonnie','julia','ruby','lois','tina','phyllis','norma','paula','diana','annie','lillian','emily','robin','peggy','crystal','gladys','rita','dawn','connie','florence','tracy','edna','tiffany','emma','grace','ella','olivia','sophia','ava','isabella','mia','luna','chloe','penelope','layla','riley','zoey','nora','lily','eleanor','hannah','lillian','addison','aubrey','ellie','stella','natalie','zoe','leah','hazel','violet','aurora','savannah','audrey','brooklyn','bella','claire','skylar','lucy','paisley','everly','anna','caroline','nova','genesis','emilia','kennedy','samantha','maya','willow','kinsley','naomi','aaliyah','elena','sarah','gabriella','allison','millie','alyssa','alexandra','jade','abigail','scarlett','victoria','ariana','sophia'])

function parseGender(desc: string, charName?: string): 'male' | 'female' | 'neutral' | 'unknown' {
  const lower = desc.toLowerCase()
  // Spelled-out gender (new format): starts with "Female," or "Male,"
  if (/^female[,\s]/i.test(lower) || lower.startsWith('female')) return 'female'
  if (/^male[,\s]/i.test(lower) || lower.startsWith('male')) return 'male'
  // Legacy patterns like "34F", "52M" and keywords
  if (/\b\d+f\b/i.test(lower) || lower.includes('female') || lower.includes('woman') || lower.includes('girl') || lower.includes('she/her') || lower.includes('mrs.') || lower.includes('miss ') || lower.includes('ms.')) return 'female'
  if (/\b\d+m\b/i.test(lower) || lower.includes('male') || lower.includes('man') || lower.includes('boy') || lower.includes('he/him') || lower.includes('guy') || lower.includes('mr.') || lower.includes('father ') || lower.includes('sheriff') || lower.includes('detective') || lower.includes('reverend')) return 'male'
  if (lower.includes('neutral') || lower.includes('androgynous') || lower.includes('they/them')) return 'neutral'

  // Fallback: check character name against known name lists
  if (charName) {
    const parts = charName.toLowerCase().split(/\s+/)
    const firstName = parts[0]
    if (MALE_NAMES.has(firstName)) return 'male'
    if (FEMALE_NAMES.has(firstName)) return 'female'
    // Check all name parts (e.g. "Sheriff Roy" → "roy" is male)
    for (const part of parts) {
      if (MALE_NAMES.has(part)) return 'male'
      if (FEMALE_NAMES.has(part)) return 'female'
    }
  }
  return 'unknown'
}

function parseAge(desc: string): 'young' | 'middle' | 'old' | 'unknown' {
  // Extract age number from patterns like "34F", "52M", "age 45"
  const ageMatch = desc.match(/\b(\d{2})\s*[mf]\b/i) || desc.match(/\bage\s*:?\s*(\d+)/i) || desc.match(/\b(\d{2})\b/)
  if (ageMatch) {
    const age = parseInt(ageMatch[1])
    if (age >= 10 && age < 40) return 'young'
    if (age >= 40 && age < 60) return 'middle'
    if (age >= 60) return 'old'
  }
  const lower = desc.toLowerCase()
  if (lower.includes('young') || lower.includes('teen') || lower.includes('20s') || lower.includes('30s') || lower.includes('child') || lower.includes('kid')) return 'young'
  if (lower.includes('middle') || lower.includes('40s') || lower.includes('50s')) return 'middle'
  if (lower.includes('old') || lower.includes('elder') || lower.includes('senior') || lower.includes('60s') || lower.includes('70s') || lower.includes('ancient') || lower.includes('aged')) return 'old'
  return 'unknown'
}

function parseCharacterGuide(guideText: string): CharacterInfo[] {
  const lines = guideText.split('\n').filter(l => l.trim().startsWith('-'))
  const characters: CharacterInfo[] = []

  for (const line of lines) {
    // Match: - CHARACTER NAME (description)  OR  - CHARACTER NAME
    const match = line.match(/^-\s+([A-Z][A-Z\s\-'\.\d]*?)(?:\s+\((.+)\))?\s*$/)
    if (!match) continue
    const name = match[1].trim()
    const desc = match[2] || ''
    characters.push({
      name,
      description: desc,
      gender: parseGender(desc, name),
      age: parseAge(desc),
    })
  }

  return characters
}

// ─── Voice Matching ───────────────────────────────────────────────────────────

function matchVoices(
  characters: CharacterInfo[],
  availableVoices: typeof CURATED_VOICES
): Map<string, VoiceAssignment> {
  const result = new Map<string, VoiceAssignment>()
  const usedVoiceIds = new Set<string>([BELLE_B_VOICE_ID])

  // NARRATOR always gets George (warm storyteller)
  result.set('NARRATOR', { voice_id: NARRATOR_VOICE_ID, voice_name: NARRATOR_VOICE_NAME })
  usedVoiceIds.add(NARRATOR_VOICE_ID)

  for (const char of characters) {
    if (char.name === 'NARRATOR') continue

    const candidates = availableVoices.filter(v => !usedVoiceIds.has(v.voice_id))

    if (candidates.length === 0) {
      // Fallback: allow reuse (but never Belle B)
      const fallback = availableVoices.find(v => v.voice_id !== BELLE_B_VOICE_ID)
      if (fallback) {
        result.set(char.name, { voice_id: fallback.voice_id, voice_name: fallback.name })
      }
      console.warn(`⚠️ No unique voices left for ${char.name} — reusing`)
      continue
    }

    // Score each candidate
    const scored = candidates.map(v => {
      let score = 0

      // Gender match (highest priority: +100 match, -50 mismatch)
      if (char.gender !== 'unknown') {
        if (v.gender === char.gender) score += 100
        else if (char.gender === 'neutral' || v.gender === 'neutral') score += 40
        else score -= 50
      }

      // Age match (+30 for correct age bracket)
      const voiceAgeBracket = v.age.includes('young') ? 'young' : v.age.includes('old') ? 'old' : 'middle'
      if (char.age !== 'unknown' && voiceAgeBracket === char.age) score += 30

      // Voice direction keywords from description (+10 each match)
      const desc = (char.description || '').toLowerCase()
      const vDesc = v.description.toLowerCase()
      if (desc.includes('deep') && (vDesc.includes('deep') || vDesc.includes('dominant') || vDesc.includes('firm') || vDesc.includes('resonant'))) score += 10
      if (desc.includes('gravelly') || desc.includes('gruff') || desc.includes('raspy')) score += (vDesc.includes('husky') || vDesc.includes('gruff') || vDesc.includes('trickster') ? 10 : 0)
      if (desc.includes('warm') && vDesc.includes('warm')) score += 10
      if (desc.includes('bright') || desc.includes('young') || desc.includes('eager')) score += (v.age === 'young' ? 10 : 0)
      if (desc.includes('british') || desc.includes('english')) score += (v.accent === 'british' ? 15 : 0)
      if (desc.includes('southern') || desc.includes('cajun') || desc.includes('drawl')) score += (v.accent === 'american' && v.age !== 'young' ? 8 : 0)
      if (desc.includes('smooth') || desc.includes('trustworthy') || desc.includes('charming')) score += (vDesc.includes('smooth') || vDesc.includes('trustworthy') || vDesc.includes('charming') ? 10 : 0)
      if (desc.includes('menacing') || desc.includes('cold') || desc.includes('calculating')) score += (vDesc.includes('dominant') || vDesc.includes('firm') || vDesc.includes('fierce') ? 10 : 0)

      return { voice: v, score }
    })

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0].voice
    result.set(char.name, { voice_id: best.voice_id, voice_name: best.name })
    usedVoiceIds.add(best.voice_id)

    console.log(`🎭 Voice match: [${char.name}] (${char.gender}/${char.age}) → ${best.name} [score: ${scored[0].score}]`)
  }

  return result
}

// ─── Story Segment Parser ─────────────────────────────────────────────────────

function parseStoryIntoSegments(
  storyText: string,
  voiceMap: Map<string, VoiceAssignment>,
  fallbackVoiceId: string
): AudioSegment[] {
  const segments: AudioSegment[] = []
  let segmentIndex = 0

  // Split on [SPEAKER]: pattern
  const lines = storyText.split('\n')
  let currentSpeaker: string | null = null
  let currentTextLines: string[] = []

  const flushSegment = () => {
    if (!currentSpeaker || currentTextLines.length === 0) return
    const text = currentTextLines.join(' ').trim()
    if (!text) return

    // Exact match first, then fuzzy match (handles SHERIFF TATE vs SHERIFF EUGENE TATE)
    let voiceInfo = voiceMap.get(currentSpeaker)
    if (!voiceInfo) {
      // Try partial match: find a voiceMap key that contains the speaker or vice versa
      for (const [key, val] of Array.from(voiceMap.entries())) {
        if (key.includes(currentSpeaker) || currentSpeaker.includes(key) ||
            key.split(' ').some(w => w.length > 3 && currentSpeaker.includes(w))) {
          voiceInfo = val
          break
        }
      }
    }
    if (!voiceInfo) voiceInfo = { voice_id: fallbackVoiceId, voice_name: 'Default' }

    // Split long segments to stay under ElevenLabs limit
    if (text.length <= ELEVENLABS_CHUNK_SIZE) {
      segments.push({ speaker: currentSpeaker, text, voiceId: voiceInfo.voice_id, index: segmentIndex++ })
    } else {
      // Split at sentence boundaries
      const subChunks = splitTextIntoChunks(text, ELEVENLABS_CHUNK_SIZE)
      for (const chunk of subChunks) {
        segments.push({ speaker: currentSpeaker, text: chunk, voiceId: voiceInfo.voice_id, index: segmentIndex++ })
      }
    }

    currentTextLines = []
    currentSpeaker = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Match [SPEAKER NAME]: dialogue text
    const tagMatch = trimmed.match(/^\[([A-Z][A-Z\s\-'\.\d]*)\]:\s*(.*)/)
    if (tagMatch) {
      const speaker = tagMatch[1].trim()
      const text = tagMatch[2].trim()

      if (speaker !== currentSpeaker) {
        // Merge consecutive same-speaker lines to reduce API calls;
        // flush when speaker changes
        flushSegment()
        currentSpeaker = speaker
      }
      if (text) currentTextLines.push(text)
    } else if (currentSpeaker && trimmed) {
      // Continuation line for current speaker
      currentTextLines.push(trimmed)
    } else if (!currentSpeaker && trimmed) {
      // Untagged line at start — treat as NARRATOR
      currentSpeaker = 'NARRATOR'
      currentTextLines.push(trimmed)
    }
  }

  flushSegment()

  if (segments.length === 0) {
    console.warn('⚠️ No segments parsed from story — falling back to single-voice NARRATOR')
    segments.push({
      speaker: 'NARRATOR',
      text: storyText.trim(),
      voiceId: fallbackVoiceId,
      index: 0,
    })
  }

  return segments
}

// ─── Text Chunk Helper ────────────────────────────────────────────────────────

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('. ', maxChars)
    if (splitAt === -1 || splitAt < maxChars / 2) {
      splitAt = remaining.lastIndexOf(' ', maxChars)
    }
    if (splitAt === -1) splitAt = maxChars

    chunks.push(remaining.substring(0, splitAt + 1).trim())
    remaining = remaining.substring(splitAt + 1).trim()
  }

  return chunks
}

// ─── ElevenLabs Audio Generation ─────────────────────────────────────────────

// Log EL usage to Supabase for per-story cost tracking
async function logELUsage(historyItemId: string, voiceName: string, chars: number, storyTitle: string | null, text: string) {
  try {
    await supabase.from('el_usage_log').upsert({
      history_item_id: historyItemId,
      voice_name: voiceName,
      chars,
      category: storyTitle ? 'story' : 'intro',
      story_title: storyTitle,
      date_utc: new Date().toISOString().slice(0, 10),
      ts_utc: new Date().toISOString(),
      cost_usd: +(chars / 1000 * 0.30).toFixed(4),
      raw_text: text.slice(0, 200),
      synced_at: new Date().toISOString(),
    }, { onConflict: 'history_item_id' })
  } catch (e) {
    console.warn('EL usage log failed (non-blocking):', e)
  }
}

async function generateElevenLabsAudio(
  text: string,
  voiceId: string = BELLE_B_VOICE_ID,
  voiceName: string = 'Belle B',
  storyTitle: string | null = null
): Promise<Buffer> {
  // Use with-timestamps endpoint to get history_item_id for cost tracking
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  )
  if (!response.ok) {
    // Fallback to standard endpoint
    const fallback = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      }
    )
    if (!fallback.ok) {
      const errText = await fallback.text()
      throw new Error(`ElevenLabs API error (voice ${voiceId}): ${fallback.status} - ${errText}`)
    }
    return Buffer.from(await fallback.arrayBuffer())
  }

  const json = await response.json()
  // Log usage with history_item_id
  if (json.history_item_id) {
    await logELUsage(json.history_item_id, voiceName, text.length, storyTitle, text)
  }
  // audio is base64 in json.audio
  return Buffer.from(json.audio || '', 'base64')
}

async function uploadAudioToStorage(
  buffer: Buffer,
  path: string,
  contentType: string = 'audio/mpeg'
): Promise<string> {
  const { error } = await supabase.storage.from('audio').upload(path, buffer, {
    contentType,
    upsert: true,
  })

  if (error) throw new Error(`Supabase upload error (${path}): ${error.message}`)

  const {
    data: { publicUrl },
  } = supabase.storage.from('audio').getPublicUrl(path)

  return publicUrl
}

// ─── Background Music Selection ──────────────────────────────────────────────

function selectBackgroundMusic(tone: string, genre: string): string {
  const t = (tone || '').toLowerCase()
  const g = (genre || '').toLowerCase()

  if (g.includes('horror') || t.includes('horrify') || t.includes('terrif'))
    return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/hollow-crown-of-cinders.mp3'
  if (g.includes('sci') || g.includes('cosmic') || g.includes('get smarter'))
    return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/cosmic-bloom.mp3'
  if (g.includes('drama') || t.includes('emotional') || t.includes('moving'))
    return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/heartbeats-between-chapters.mp3'
  if (g.includes('comedy') || t.includes('light') || t.includes('warm') || t.includes('heartfelt'))
    return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/flicker-old-porch-light.mp3'
  if (g.includes('adventure') || g.includes('western'))
    return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/dust-trail-omen.mp3'
  // Default: thriller/suspense
  return 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library/midnight-red-5th-avenue.mp3'
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const storyId = crypto.randomUUID()
    const selectedModel = body.model || 'claude-sonnet-4-6'

    console.log('📝 ASC3 multi-voice generation request:', {
      storyId,
      concept: body.concept?.substring(0, 60),
      wordCount: body.wordCount,
      authorStyle: body.authorStyle,
      model: selectedModel,
    })

    // ═══════════════════════════════════════════════════════════════
    // STEP 1 — Generate story script with Claude (multi-voice format)
    // ═══════════════════════════════════════════════════════════════

    const genreStr = [body.primaryGenre, body.secondaryGenre1, body.secondaryGenre2]
      .filter(Boolean)
      .join(', ')

    // Genre-specific writing instructions
    const genreLower = (body.primaryGenre || '').toLowerCase()
    const genreInstructions = (() => {
      if (genreLower.includes('thriller') || genreLower.includes('mystery')) return `
GENRE CRAFT — THRILLER/MYSTERY:
- Open with a hook that creates immediate tension or a disturbing discovery
- Use short, punchy sentences during high-tension scenes; longer sentences during investigation/exposition
- Layer in clues and red herrings naturally through dialogue and narration
- Build dread slowly — withhold key information strategically
- Every scene should raise a question or deepen the mystery
- Climax must recontextualize earlier events; twist should feel inevitable in hindsight
- Characters should have hidden motives and conflicting agendas
- Use silence and what characters DON'T say as much as what they do`

      if (genreLower.includes('horror')) return `
GENRE CRAFT — HORROR:
- Establish normalcy first, then disrupt it with something deeply wrong
- Use sensory details: sounds, smells, textures — audio horror lives in the details listeners can imagine
- Build dread through implication and suggestion, not explicit description
- The unknown is scarier than the known — let the listener's imagination do the work
- Give characters believable reasons to stay in dangerous situations
- Pacing: slow burn with sudden jolts; silence before the scare
- The monster (physical or psychological) should reflect a deeper human fear
- End with consequences — horror has weight`

      if (genreLower.includes('romance') || genreLower.includes('love')) return `
GENRE CRAFT — ROMANCE:
- Establish chemistry through subtext — what characters feel but don't say
- Use internal conflict: characters want connection but fear vulnerability
- Sensory and emotional detail: how the protagonist feels in their body, not just their thoughts
- Build the relationship through small meaningful moments, not grand gestures
- The central obstacle must feel genuinely insurmountable before the resolution
- Dialogue should crackle with tension, humor, and unspoken feeling
- Earn the emotional payoff — don't rush to the resolution`

      if (genreLower.includes('sci-fi') || genreLower.includes('science fiction') || genreLower.includes('cosmic')) return `
GENRE CRAFT — SCI-FI:
- Ground the fantastical in specific, believable sensory detail
- Explore the human implications of the technology or concept — what does it mean for people?
- Avoid info-dumping: reveal world-building through character reactions and dialogue
- The science/technology should create the central conflict, not just be backdrop
- Characters should feel the wonder, terror, or alienation of their world
- Use the genre to explore a real human theme: identity, mortality, connection, power
- Contrast the vast/cosmic with the intimate/personal`

      if (genreLower.includes('western') || genreLower.includes('adventure')) return `
GENRE CRAFT — WESTERN/ADVENTURE:
- Establish the world through vivid environmental detail — landscape as character
- Clear moral stakes: what the protagonist stands to lose or gain
- Conflict should feel physical and immediate, with real consequences
- Dialogue is spare and loaded — characters say exactly what they mean or exactly the opposite
- The journey IS the story — each obstacle reveals character
- Honor, loyalty, survival: the genre's core themes should surface naturally
- Pacing is steady with explosive action beats`

      if (genreLower.includes('drama') || genreLower.includes('literary')) return `
GENRE CRAFT — DRAMA:
- Character is everything — motivation, contradiction, and change drive the story
- Subtext in every scene: characters want something but can't ask for it directly
- Let silences breathe; what's unsaid matters as much as dialogue
- Avoid melodrama — restraint creates more emotional impact than explosion
- Ground conflict in specific, real-world circumstances and relationships
- The ending should feel earned and true, not necessarily happy
- Find the universal in the specific — one family's story illuminates everyone's`

      if (genreLower.includes('comedy') || genreLower.includes('humor')) return `
GENRE CRAFT — COMEDY:
- Timing is everything — set up, delay, punchline; trust the rhythm
- Characters should be earnest about their absurd situations (they're not in on the joke)
- Use escalation: each complication should make things funnier and more chaotic
- Ground the humor in character — the funniest moments reveal who people really are
- Callbacks reward attentive listeners; plant details early that pay off later
- Mix wit with heart — the best comedies make you laugh and feel something
- Avoid obvious jokes; find the unexpected angle`

      if (genreLower.includes('family') || genreLower.includes('children')) return `
GENRE CRAFT — FAMILY/CHILDREN:
- Young protagonists with real agency — they solve their own problems
- Clear, vivid stakes that matter to a child's world
- Humor that works for both kids and adults (different levels of meaning)
- Themes of belonging, courage, friendship, doing the right thing
- Language is accessible but not dumbed down — kids appreciate being respected
- Wonder and imagination: the world should feel magical or surprising
- Resolution should feel earned and emotionally satisfying`

      return `
GENRE CRAFT — ${(body.primaryGenre || 'GENERAL').toUpperCase()}:
- Open with a compelling hook that immediately draws the listener in
- Build character through dialogue and action, not exposition
- Create escalating conflict with meaningful stakes
- Use pacing strategically — vary the rhythm to control tension
- End with a resonant, emotionally satisfying conclusion`
    })()

    const claudePrompt = `You are an expert audio drama writer working in the style of ${body.authorStyle}.

Create a complete audio drama script with the following specifications:
${genreInstructions}

**Story Requirements:**
- Concept: ${body.concept}
- Tone: ${body.tone}
- Word Count Target: ${body.wordCount} words (tolerance: ±10%)
- Genres: ${genreStr}
- Author Style: ${body.authorStyle}
- Author Techniques: ${body.authorTechniques}
- Audio Adaptation Notes: ${body.audioAdaptation}

**REQUIRED Output Format — follow EXACTLY:**

[TITLE]
A unique, compelling title for the story

[CHARACTER GUIDE]
List EVERY character as a bullet point. This controls voice casting — be specific.
Format: - CHARACTER NAME (Gender, Age, Voice Direction, Personality)

Voice Direction describes HOW the character sounds — accent, tone, depth, energy.

Examples (follow this format exactly):
- NARRATOR (Male, middle-aged, warm British storyteller, authoritative and immersive)
- SARAH CHEN (Female, mid-30s, clear American voice, warm but anxious, determined)
- DETECTIVE WADE (Male, early 50s, deep gravelly voice, gruff and world-weary)
- OLD PRIEST (Male, late 60s, soft trembling voice, gentle but hiding secrets)
- SHERIFF ROY TATE (Male, mid-50s, deep Southern drawl, commanding and weary)
- DR. ELENA VASQUEZ (Female, early 40s, sharp clinical tone, professional, hiding guilt)
- YOUNG NURSE (Female, late 20s, bright nervous voice, eager to please)
- ANTAGONIST (Male, 40s, smooth menacing voice, calculating, cold)

Rules:
- Use ALL CAPS for character names
- ALWAYS start with Male or Female — never omit this
- Include age range (20s, mid-30s, late 60s, etc.)
- Describe the voice: deep, soft, raspy, bright, husky, trembling, smooth, sharp, warm, cold
- Include accent if relevant: Southern, British, New York, Cajun, Midwest, etc.
- 4-8 characters maximum (including NARRATOR)
- NARRATOR always listed first
- Character names in [STORY] must EXACTLY match names listed here — no abbreviations, no shortcuts

[STORY]
The complete story where EVERY line is tagged with [CHARACTER NAME]: prefix.

Example format:
[NARRATOR]: The rain hadn't stopped in three days when Sarah Chen finally arrived at St. Augustine's.
[SARAH CHEN]: I need to speak with Father Thomas. It's urgent.
[NARRATOR]: The young priest at the door hesitated, his eyes darting to the shadows behind her.
[YOUNG PRIEST]: Father Thomas isn't seeing visitors today.
[SARAH CHEN]: Tell him it's about the letters. He'll see me.

CRITICAL RULES for [STORY]:
- EVERY single line MUST start with [CHARACTER NAME]: — no exceptions
- NARRATOR lines for description/narration MUST use [NARRATOR]:
- Character names must EXACTLY match the CHARACTER GUIDE
- No untagged prose — everything has a speaker tag
- Word count must be ${body.wordCount} ±10% (${Math.floor(body.wordCount * 0.9)}-${Math.ceil(body.wordCount * 1.1)} words)
- Write in ${body.authorStyle} style with ${body.tone} tone

Now write the complete audio drama:`

    console.log('🤖 Calling Claude for multi-voice script...')

    // Claude call with retry for rate limits (429) and overload (529)
    let claudeHttpResponse: Response | null = null
    let lastClaudeError = ''
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        const waitSec = attempt === 2 ? 15 : 30
        console.log(`⏳ Claude rate limit — waiting ${waitSec}s before retry ${attempt}/3...`)
        await new Promise(r => setTimeout(r, waitSec * 1000))
      }
      claudeHttpResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 12000,
          system: 'You are an expert audio drama writer. You ALWAYS respond using EXACTLY this structure, with no preamble or explanation before [TITLE]:\n\n[TITLE]\n<title here>\n\n[CHARACTER GUIDE]\n<character list>\n\n[STORY]\n<full story with [CHARACTER NAME]: tags on every line>\n\nNever deviate from this format. Never add sections. Never add commentary before or after.',
          messages: [{ role: 'user', content: claudePrompt }],
        }),
      })
      if (claudeHttpResponse.ok) break
      const errBody = await claudeHttpResponse.json()
      lastClaudeError = errBody?.error?.message || errBody?.error?.type || JSON.stringify(errBody)
      const status = claudeHttpResponse.status
      console.error(`Claude attempt ${attempt} failed (${status}):`, lastClaudeError)
      // Only retry on rate limit / overload
      if (status !== 429 && status !== 529) break
    }

    if (!claudeHttpResponse || !claudeHttpResponse.ok) {
      const isRateLimit = claudeHttpResponse?.status === 429 || claudeHttpResponse?.status === 529
      const userMsg = isRateLimit
        ? 'Claude is rate limited (too many requests). Please wait 30 seconds and try again.'
        : `Claude API error: ${lastClaudeError}`
      return NextResponse.json({ success: false, error: userMsg }, { status: 500 })
    }

    const claudeResult = await claudeHttpResponse.json()
    const claudeText = claudeResult.content?.[0]?.text || ''

    // ─── Log Anthropic usage ───────────────────────────────────────
    try {
      const { logAnthropicCall } = await import('../../../../lib/anthropic-logger')
      logAnthropicCall({
        route: '/api/asc3/generate-story-complete',
        purpose: 'story-generation',
        model: selectedModel,
        inputTokens: claudeResult.usage?.input_tokens ?? 0,
        outputTokens: claudeResult.usage?.output_tokens ?? 0,
        storyTitle: body.title || 'untitled',
        metadata: { genre: body.genre, authorStyle: body.authorStyle },
      }).catch(() => {})
    } catch { /* never break on logging failure */ }

    // ─── Parse Claude output ───────────────────────────────────────

    // Log first 500 chars to help debug format issues
    console.log('📄 Claude response preview:', claudeText.slice(0, 500))
    console.log('📄 Claude stop_reason:', claudeResult.stop_reason, '| tokens used:', claudeResult.usage?.output_tokens)

    // Flexible parsing — handle variations in Claude's formatting
    const titleMatch = claudeText.match(/\[TITLE\]\s*\n\s*(.+?)(?:\n|$)/)
      || claudeText.match(/^#\s*(.+?)(?:\n|$)/m)
      || claudeText.match(/Title:\s*(.+?)(?:\n|$)/i)

    const characterGuideMatch = claudeText.match(/\[CHARACTER GUIDE\]\s*\n([\s\S]+?)\[STORY\]/)
      || claudeText.match(/CHARACTER GUIDE:?\s*\n([\s\S]+?)\[STORY\]/i)

    const storyMatch = claudeText.match(/\[STORY\]\s*\n([\s\S]+)/)
      || claudeText.match(/STORY:?\s*\n([\s\S]+)/i)
      // Last resort: if Claude wrote dialogue without the [STORY] header, grab from first [CHARACTER]: line
      || claudeText.match(/((?:\[[A-Z ]+\]:.+\n?)+[\s\S]+)/)

    if (!titleMatch || !storyMatch) {
      console.error('❌ Failed to parse — response:', claudeText.slice(0, 800))
      const hint = claudeResult.stop_reason === 'max_tokens'
        ? 'Claude hit max_tokens limit — story was cut off. Try a shorter duration.'
        : 'Claude did not follow the required format. Try regenerating.'
      return NextResponse.json(
        { success: false, error: hint },
        { status: 400 }
      )
    }

    const title = titleMatch[1].trim()
    const storyScript = storyMatch[1].trim()
    const characterGuideRaw = characterGuideMatch ? characterGuideMatch[1].trim() : ''
    const actualWordCount = storyScript.split(/\s+/).length

    // Extract SUNO_PROMPT from script header
    let sunoPrompt = ''
    const sunoMatch = storyScript.match(/SUNO[_ ]PROMPT[:\s]+(.+?)(?:\n|$)/i)
    if (sunoMatch) sunoPrompt = sunoMatch[1].trim()
    if (!sunoPrompt) sunoPrompt = `Cinematic ${body.primaryGenre || 'thriller'} instrumental, atmospheric, mysterious, no vocals`

    console.log(`✅ Story generated: "${title}" (${actualWordCount} words)`)

    // ─── Parse characters and match voices ────────────────────────

    let characters: CharacterInfo[] = []
    let voiceMap = new Map<string, VoiceAssignment>()
    let parseWarning: string | null = null

    if (!characterGuideRaw) {
      parseWarning = 'CHARACTER GUIDE section missing — falling back to single NARRATOR voice'
      console.warn('⚠️', parseWarning)
      voiceMap.set('NARRATOR', { voice_id: NARRATOR_VOICE_ID, voice_name: NARRATOR_VOICE_NAME })
    } else {
      characters = parseCharacterGuide(characterGuideRaw)

      if (characters.length === 0) {
        parseWarning = 'Could not parse any characters from CHARACTER GUIDE'
        console.warn('⚠️', parseWarning)
        voiceMap.set('NARRATOR', { voice_id: NARRATOR_VOICE_ID, voice_name: NARRATOR_VOICE_NAME })
      } else {
        console.log(`🎭 Parsed ${characters.length} characters:`, characters.map(c => `${c.name} (${c.gender}/${c.age})`).join(', '))
        voiceMap = matchVoices(characters, CURATED_VOICES)
      }
    }

    // Also ensure NARRATOR is in the voice map
    if (!voiceMap.has('NARRATOR')) {
      voiceMap.set('NARRATOR', { voice_id: NARRATOR_VOICE_ID, voice_name: NARRATOR_VOICE_NAME })
    }

    // Build characterGuide array for response
    const characterGuideResult = characters.map(c => {
      const voice = voiceMap.get(c.name) ?? { voice_id: NARRATOR_VOICE_ID, voice_name: NARRATOR_VOICE_NAME }
      return {
        name: c.name,
        description: c.description,
        voiceId: voice.voice_id,
        voiceName: voice.voice_name,
      }
    })

    // Add NARRATOR if not in characters list
    if (!characters.find(c => c.name === 'NARRATOR')) {
      const narratorVoice = voiceMap.get('NARRATOR')!
      characterGuideResult.unshift({
        name: 'NARRATOR',
        description: 'Neutral, warm storytelling voice',
        voiceId: narratorVoice.voice_id,
        voiceName: narratorVoice.voice_name,
      })
    }

    console.log('🗺️ Voice assignments:')
    voiceMap.forEach((v, name) => {
      console.log(`   [${name}] → ${v.voice_name} (${v.voice_id})`)
    })

    // ─── Parse story into audio segments ──────────────────────────

    const audioSegments = parseStoryIntoSegments(storyScript, voiceMap, BELLE_B_VOICE_ID)
    console.log(`📜 Parsed ${audioSegments.length} audio segments`)

    // ═══════════════════════════════════════════════════════════════
    // STEP 2 — Generate intro/outro audio with Belle B
    // ═══════════════════════════════════════════════════════════════

    const conceptHook = (() => {
      const base = (body.concept || '').trim()
      if (base.length <= 300) return base
      // Try to end at a sentence boundary within 300 chars
      const sub = base.substring(0, 300)
      const lastPeriod = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('! '), sub.lastIndexOf('? '))
      if (lastPeriod > 100) return base.substring(0, lastPeriod + 1)
      // Fall back to word boundary
      const cut = sub.lastIndexOf(' ')
      return base.substring(0, cut > 0 ? cut : 300) + '...'
    })()

    const authorName = body.authorName || body.authorStyle || 'the author'

    const introText = `Welcome to Endless Tales.\n\nToday's story: "${title}" by ${authorName}.\n\n${conceptHook}\n\nLet's begin.`
    const outroText = `Thank you for listening to "${title}" on Endless Tales. Visit endless-tales.com to explore more stories.`

    let introAudioUrl = ''
    let storySegmentResults: StorySegmentResult[] = []
    let outroAudioUrl = ''
    let audioError: string | null = null
    let fallbackUsed = false

    try {
      console.log('🎙️ Generating intro audio (Belle B)...')
      const introBuffer = await generateElevenLabsAudio(introText, BELLE_B_VOICE_ID, 'Belle B', null)
      introAudioUrl = await uploadAudioToStorage(introBuffer, `asc3/${storyId}/intro.mp3`)
      console.log(`✅ Intro audio: ${introAudioUrl}`)

      // Generate audio for each story segment with matched voice
      console.log(`🎭 Generating ${audioSegments.length} story segments (multi-voice)...`)
      for (const segment of audioSegments) {
        const paddedIndex = String(segment.index).padStart(3, '0')
        const path = `asc3/${storyId}/segment_${paddedIndex}.mp3`

        console.log(`  [${segment.index + 1}/${audioSegments.length}] [${segment.speaker}] → ${segment.voiceId} | ${segment.text.substring(0, 60)}...`)

        const buffer = await generateElevenLabsAudio(segment.text, segment.voiceId, segment.speaker, title)
        const url = await uploadAudioToStorage(buffer, path)

        storySegmentResults.push({
          speaker: segment.speaker,
          text_preview: segment.text.substring(0, 100),
          audioUrl: url,
          index: segment.index,
        })
      }
      console.log(`✅ All ${storySegmentResults.length} segments generated`)

      console.log('🎙️ Generating outro audio (Belle B)...')
      const outroBuffer = await generateElevenLabsAudio(outroText, BELLE_B_VOICE_ID, 'Belle B', null)
      outroAudioUrl = await uploadAudioToStorage(outroBuffer, `asc3/${storyId}/outro.mp3`)
      console.log(`✅ Outro audio: ${outroAudioUrl}`)

    } catch (err) {
      audioError = err instanceof Error ? err.message : String(err)
      console.error('⚠️ Audio generation failed:', audioError)

      // Fallback: generate single-voice with Belle B
      if (storySegmentResults.length === 0) {
        fallbackUsed = true
        console.log('🔄 Falling back to single-voice Belle B...')
        try {
          const chunks = splitTextIntoChunks(storyScript, ELEVENLABS_CHUNK_SIZE)
          for (let i = 0; i < chunks.length; i++) {
            const path = chunks.length === 1
              ? `asc3/${storyId}/segment_000.mp3`
              : `asc3/${storyId}/segment_${String(i).padStart(3, '0')}.mp3`
            const buffer = await generateElevenLabsAudio(chunks[i], BELLE_B_VOICE_ID)
            const url = await uploadAudioToStorage(buffer, path)
            storySegmentResults.push({
              speaker: 'NARRATOR',
              text_preview: chunks[i].substring(0, 100),
              audioUrl: url,
              index: i,
            })
          }
          audioError = `Multi-voice failed (${audioError}) — fell back to single Belle B voice`
        } catch (fallbackErr) {
          audioError = `Both multi-voice and fallback failed: ${fallbackErr}`
        }
      }
    }

    const storyAudioUrl = storySegmentResults[0]?.audioUrl || ''
    const storyAudioUrls = storySegmentResults.map(s => s.audioUrl)

    // ═══════════════════════════════════════════════════════════════
    // STEP 3 — Generate cover image via DALL-E 3
    // ═══════════════════════════════════════════════════════════════

    let coverImageUrl = ''
    let coverError: string | null = null

    try {
      const { buildCoverPrompt } = await import('../../../../lib/coverPrompt')
      const dallePrompt = buildCoverPrompt({
        title,
        author: authorName,
        genre: body.primaryGenre || 'fiction',
        concept: body.concept,  // short concept summary — safe for DALL-E
        tone: body.tone,
        // do NOT pass raw script — triggers content policy filters
      })

      console.log('🎨 Generating cover image with DALL-E 3...')

      const dalleRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: dallePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'hd',
        }),
      })

      if (!dalleRes.ok) {
        const errText = await dalleRes.text()
        throw new Error(`DALL-E error: ${dalleRes.status} - ${errText}`)
      }

      const dalleData = (await dalleRes.json()) as { data: { url: string }[] }
      const imageUrl = dalleData.data[0]?.url
      if (!imageUrl) throw new Error('No image URL returned from DALL-E')

      console.log('⬇️ Downloading cover image...')
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) throw new Error(`Failed to download cover image: ${imgRes.status}`)

      const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

      const { error: uploadErr } = await supabase.storage
        .from('audio')
        .upload(`asc3/${storyId}/cover.jpg`, imgBuffer, { contentType: 'image/jpeg', upsert: true })

      if (uploadErr) throw new Error(`Cover upload error: ${uploadErr.message}`)

      const { data: { publicUrl } } = supabase.storage.from('audio').getPublicUrl(`asc3/${storyId}/cover.jpg`)
      coverImageUrl = publicUrl
      console.log(`✅ Cover image: ${coverImageUrl}`)
    } catch (err) {
      coverError = err instanceof Error ? err.message : String(err)
      console.error('⚠️ Cover generation failed:', coverError)
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 4 — Save to Supabase
    // ═══════════════════════════════════════════════════════════════

    let dbError: string | null = null

    // Try full schema first (with character_guide if column exists)
    const fullRecord: Record<string, unknown> = {
      title,
      author: authorName,
      genre: body.primaryGenre || 'Drama',
      description: (body.concept || '').substring(0, 500),
      audio_url: storyAudioUrl || null,
      cover_url: coverImageUrl || null,
      duration_mins: Math.ceil(actualWordCount / 150),
      duration_label: `${Math.ceil(actualWordCount / 150)} min`,
      credits: 0,
      source_tool: 'ASC3',
      asc_version: '3',
      is_new: true,
      is_featured: false,
      play_count: 0,
      script: storyScript,
      word_count: actualWordCount,
      author_style: body.authorStyle,
      primary_genre: body.primaryGenre,
      intro_text: introText,
      outro_text: outroText,
      intro_audio_url: introAudioUrl || null,
      story_audio_url: storyAudioUrl || null,
      outro_audio_url: outroAudioUrl || null,
      cover_image_url: coverImageUrl || null,
      status: 'pending',
      is_hidden: true,
      character_guide: characterGuideResult.length > 0 ? JSON.stringify(characterGuideResult) : null,
    }

    let { error: insertErr } = await supabase.from('stories').insert([fullRecord])

    if (insertErr) {
      console.warn('⚠️ Full insert failed, trying without character_guide:', insertErr.message)
      // Remove character_guide column and retry (may not exist in DB yet)
      const { character_guide: _cg, ...recordWithoutGuide } = fullRecord
      let { error: retry1Err } = await supabase.from('stories').insert([recordWithoutGuide])

      if (retry1Err) {
        console.warn('⚠️ Extended insert failed, trying base columns:', retry1Err.message)
        dbError = `Extended insert failed: ${retry1Err.message}`

        const baseRecord = {
          title,
          author: authorName,
          genre: body.primaryGenre || 'Drama',
          description: (body.concept || '').substring(0, 500),
          audio_url: storyAudioUrl || null,
          cover_url: coverImageUrl || null,
          duration_mins: Math.ceil(actualWordCount / 150),
          duration_label: `${Math.ceil(actualWordCount / 150)} min`,
          credits: 0,
          source_tool: 'ASC3',
          asc_version: '3',
          is_new: true,
          is_featured: false,
          play_count: 0,
        }

        const { error: fallbackErr } = await supabase.from('stories').insert([baseRecord])
        if (fallbackErr) {
          dbError = `DB insert completely failed: ${fallbackErr.message}`
          console.error('❌ DB insert failed:', fallbackErr.message)
        } else {
          console.log('✅ Story saved to DB (base columns only)')
        }
      } else {
        console.log('✅ Story saved to DB (without character_guide column)')
        dbError = null
      }
    } else {
      console.log('✅ Story saved to DB (full ASC3 schema)')
      dbError = null
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5 — Return response
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // STEP 5 — Suno music generation (optional, falls back to library)
    // ═══════════════════════════════════════════════════════════════

    let backgroundMusicUrl = selectBackgroundMusic(body.tone, body.primaryGenre) // fallback
    const sunoCookie = (body.sunoCookie || process.env.SUNO_COOKIE || '').trim()
    let sunoStatus = 'library' // track which source was used
    let sunoWarning: string | null = null

    if (sunoCookie) {
      try {
        console.log('🎵 Attempting Suno music generation...')
        const sunoRes = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/asc3/generate-music`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId, sunoPrompt, title, sunoCookie }),
        })
        const sunoData = await sunoRes.json()
        if (sunoData.success && sunoData.musicUrl) {
          backgroundMusicUrl = sunoData.musicUrl
          sunoStatus = 'suno'
          console.log('✅ Suno music generated:', sunoData.musicUrl)
        } else {
          console.warn('⚠️ Suno failed:', sunoData.message || sunoData.error)
          sunoWarning = `Suno: ${sunoData.message || sunoData.error} — using library track instead`
        }
      } catch (e) {
        console.warn('⚠️ Suno unavailable:', e)
        sunoWarning = `Suno unavailable — using library track instead`
      }
    }

    const warnings = [audioError, coverError, dbError, parseWarning, fallbackUsed ? '⚠️ Fell back to single Belle B voice — check story format' : null, sunoWarning].filter(Boolean)

    console.log('🏁 Multi-voice generation complete:', {
      storyId,
      title,
      segments: storySegmentResults.length,
      characters: characterGuideResult.length,
      hasAudio: !!storyAudioUrl,
      hasCover: !!coverImageUrl,
      warnings: warnings.length,
    })

    return NextResponse.json({
      success: true,
      data: {
        storyId,
        title,
        script: storyScript,
        wordCount: actualWordCount,
        characterGuide: characterGuideResult,
        introText,
        outroText,
        introAudioUrl,
        storySegments: storySegmentResults,
        storyAudioUrl,
        storyAudioUrls,
        outroAudioUrl,
        backgroundMusicUrl,
        sunoStatus,
        coverImageUrl,
        sfxMetadata: [],
        _warnings: warnings,
        elStats: {
          estimatedChars: storySegmentResults.reduce((s, seg) => s + seg.text_preview.length, 0),
          estimatedCost: `$${(storySegmentResults.reduce((s, seg) => s + seg.text_preview.length, 0) / 1000 * 0.30).toFixed(2)}`,
          segments: storySegmentResults.length,
          note: 'Exact cost visible in 🎙️ EL Usage admin page within ~1 hour',
        },
      },
    })
  } catch (error) {
    console.error('❌ Fatal error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
