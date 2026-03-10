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

function parseGender(desc: string): 'male' | 'female' | 'neutral' | 'unknown' {
  const lower = desc.toLowerCase()
  // Match patterns like "34F", "52M", "F,", etc.
  if (/\b\d+f\b/i.test(lower) || lower.includes('female') || lower.includes('woman') || lower.includes('girl') || lower.includes('she/her')) return 'female'
  if (/\b\d+m\b/i.test(lower) || lower.includes('male') || lower.includes('man') || lower.includes('boy') || lower.includes('he/him') || lower.includes('guy')) return 'male'
  if (lower.includes('neutral') || lower.includes('androgynous') || lower.includes('they/them')) return 'neutral'
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
      gender: parseGender(desc + ' ' + name.toLowerCase()),
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

    const voiceInfo = voiceMap.get(currentSpeaker) ?? { voice_id: fallbackVoiceId, voice_name: 'Default' }

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

async function generateElevenLabsAudio(text: string, voiceId: string = BELLE_B_VOICE_ID): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
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
    const errText = await response.text()
    throw new Error(`ElevenLabs API error (voice ${voiceId}): ${response.status} - ${errText}`)
  }
  return Buffer.from(await response.arrayBuffer())
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

    const claudePrompt = `You are an expert audio drama writer working in the style of ${body.authorStyle}.

Create a complete audio drama script with the following specifications:

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
List EVERY character as a bullet point:
- NARRATOR (neutral, warm storytelling voice)
- CHARACTER NAME (age/gender, personality description)

Examples:
- NARRATOR (neutral, warm storytelling voice)
- SARAH CHEN (34F, warm but anxious, determined)
- DETECTIVE WADE (52M, gruff, authoritative, world-weary)
- OLD PRIEST (68M, gentle, fearful, hiding secrets)

Rules for CHARACTER GUIDE:
- Use ALL CAPS for character names
- Include age and gender in format like 34F or 52M when known
- 4-8 characters maximum (including NARRATOR)
- NARRATOR must always be listed first

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

    const claudeHttpResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 12000,
        messages: [{ role: 'user', content: claudePrompt }],
      }),
    })

    if (!claudeHttpResponse.ok) {
      const errBody = await claudeHttpResponse.json()
      console.error('Claude API error:', errBody)
      return NextResponse.json({ success: false, error: `Claude API error: ${JSON.stringify(errBody.error)}` }, { status: 500 })
    }

    const claudeResult = await claudeHttpResponse.json()
    const claudeText = claudeResult.content?.[0]?.text || ''

    // ─── Parse Claude output ───────────────────────────────────────

    const titleMatch = claudeText.match(/\[TITLE\]\s*\n\s*(.+?)(?:\n|$)/)
    const characterGuideMatch = claudeText.match(/\[CHARACTER GUIDE\]\s*\n([\s\S]+?)\[STORY\]/)
    const storyMatch = claudeText.match(/\[STORY\]\s*\n([\s\S]+)/)

    if (!titleMatch || !storyMatch) {
      console.error('❌ Failed to parse Claude response — missing TITLE or STORY sections')
      return NextResponse.json(
        { success: false, error: 'Failed to parse Claude response — missing required sections' },
        { status: 400 }
      )
    }

    const title = titleMatch[1].trim()
    const storyScript = storyMatch[1].trim()
    const characterGuideRaw = characterGuideMatch ? characterGuideMatch[1].trim() : ''
    const actualWordCount = storyScript.split(/\s+/).length

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
      if (base.length <= 130) return base
      const cut = base.lastIndexOf(' ', 130)
      return base.substring(0, cut > 0 ? cut : 130) + '...'
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
      const introBuffer = await generateElevenLabsAudio(introText, BELLE_B_VOICE_ID)
      introAudioUrl = await uploadAudioToStorage(introBuffer, `asc3/${storyId}/intro.mp3`)
      console.log(`✅ Intro audio: ${introAudioUrl}`)

      // Generate audio for each story segment with matched voice
      console.log(`🎭 Generating ${audioSegments.length} story segments (multi-voice)...`)
      for (const segment of audioSegments) {
        const paddedIndex = String(segment.index).padStart(3, '0')
        const path = `asc3/${storyId}/segment_${paddedIndex}.mp3`

        console.log(`  [${segment.index + 1}/${audioSegments.length}] [${segment.speaker}] → ${segment.voiceId} | ${segment.text.substring(0, 60)}...`)

        const buffer = await generateElevenLabsAudio(segment.text, segment.voiceId)
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
      const outroBuffer = await generateElevenLabsAudio(outroText, BELLE_B_VOICE_ID)
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
      const genre = body.primaryGenre || 'fiction'
      const dallePrompt = `Professional audiobook cover art for "${title}", a ${genre} story. Dark, cinematic, sophisticated. No text on image.`

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

    const warnings = [audioError, coverError, dbError, parseWarning, fallbackUsed ? '⚠️ Fell back to single Belle B voice — check story format' : null].filter(Boolean)

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
        backgroundMusicUrl: '',
        coverImageUrl,
        sfxMetadata: [],
        _warnings: warnings,
      },
    })
  } catch (error) {
    console.error('❌ Fatal error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
