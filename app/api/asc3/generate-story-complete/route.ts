import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

const BELLE_B_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'
const ELEVENLABS_CHUNK_SIZE = 4500 // chars per chunk, safely under 5000 limit

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function splitTextIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining)
      break
    }

    // Prefer sentence boundary, fall back to word boundary
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

async function generateElevenLabsAudio(text: string): Promise<Buffer> {
  const chunks = splitTextIntoChunks(text, ELEVENLABS_CHUNK_SIZE)
  const audioBuffers: Buffer[] = []

  console.log(`🎙️ ElevenLabs: generating audio in ${chunks.length} chunk(s)...`)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    console.log(`  Chunk ${i + 1}/${chunks.length}: ${chunk.length} chars`)

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${BELLE_B_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: chunk,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`ElevenLabs API error: ${response.status} - ${errText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    audioBuffers.push(Buffer.from(arrayBuffer))
  }

  return Buffer.concat(audioBuffers)
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

    console.log('📝 ASC3 generation request:', {
      storyId,
      concept: body.concept?.substring(0, 60),
      wordCount: body.wordCount,
      authorStyle: body.authorStyle,
    })

    // ═══════════════════════════════════════════════════════════════
    // STEP 1 — Generate story script with Claude
    // ═══════════════════════════════════════════════════════════════

    const genreStr = [body.primaryGenre, body.secondaryGenre1, body.secondaryGenre2]
      .filter(Boolean)
      .join(', ')

    const claudePrompt = `You are an expert storyteller writing in the style of ${body.authorStyle}.

Create a complete audio story script with the following specifications:

**Story Requirements:**
- Concept: ${body.concept}
- Tone: ${body.tone}
- Word Count Target: ${body.wordCount} words (tolerance: ±10%)
- Genres: ${genreStr}
- Author Style: ${body.authorStyle}
- Author Techniques: ${body.authorTechniques}
- Audio Adaptation Notes: ${body.audioAdaptation}

**Output Format:**
[TITLE]
A unique, compelling title for the story

[STORY]
The complete story text (${body.wordCount} words ±10%)

**Requirements:**
1. Word count MUST be ${body.wordCount} ±10% (${Math.floor(body.wordCount * 0.9)}-${Math.ceil(body.wordCount * 1.1)} words)
2. Write exclusively in ${body.authorStyle} style using the specified techniques
3. Use ${body.tone} tone throughout
4. Make it suitable for audio narration
5. Include natural dialogue and pacing
6. End satisfyingly

Now write the story:`

    console.log('🤖 Calling Claude...')

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 4000,
      messages: [{ role: 'user', content: claudePrompt }],
    })

    const claudeText =
      claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

    const titleMatch = claudeText.match(/\[TITLE\]\s*\n\s*(.+?)\n/)
    const storyMatch = claudeText.match(/\[STORY\]\s*\n([\s\S]+)/)

    if (!titleMatch || !storyMatch) {
      console.error('❌ Failed to parse Claude response')
      return NextResponse.json(
        { success: false, error: 'Failed to parse Claude response' },
        { status: 400 }
      )
    }

    const title = titleMatch[1].trim()
    const storyScript = storyMatch[1].trim()
    const actualWordCount = storyScript.split(/\s+/).length

    console.log(`✅ Story generated: "${title}" (${actualWordCount} words)`)

    // ═══════════════════════════════════════════════════════════════
    // STEP 2-4 — Generate audio via ElevenLabs (Belle B)
    // ═══════════════════════════════════════════════════════════════

    // Build a one-sentence hook from concept (first ~120 chars ending at word boundary)
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
    let storyAudioUrl = ''
    let outroAudioUrl = ''
    let audioError: string | null = null

    try {
      console.log('🎙️ Generating intro audio...')
      const introBuffer = await generateElevenLabsAudio(introText)
      introAudioUrl = await uploadAudioToStorage(introBuffer, `asc3/${storyId}/intro.mp3`)
      console.log(`✅ Intro audio uploaded: ${introAudioUrl}`)

      console.log('🎙️ Generating story audio...')
      const storyBuffer = await generateElevenLabsAudio(storyScript)
      storyAudioUrl = await uploadAudioToStorage(storyBuffer, `asc3/${storyId}/story.mp3`)
      console.log(`✅ Story audio uploaded: ${storyAudioUrl}`)

      console.log('🎙️ Generating outro audio...')
      const outroBuffer = await generateElevenLabsAudio(outroText)
      outroAudioUrl = await uploadAudioToStorage(outroBuffer, `asc3/${storyId}/outro.mp3`)
      console.log(`✅ Outro audio uploaded: ${outroAudioUrl}`)
    } catch (err) {
      audioError = err instanceof Error ? err.message : String(err)
      console.error('⚠️ Audio generation failed (continuing):', audioError)
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5 — Generate cover image via DALL-E 3
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

      // Download the generated image
      console.log('⬇️ Downloading cover image...')
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) throw new Error(`Failed to download cover image: ${imgRes.status}`)

      const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('audio')
        .upload(`asc3/${storyId}/cover.jpg`, imgBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (uploadErr) throw new Error(`Cover upload error: ${uploadErr.message}`)

      const {
        data: { publicUrl },
      } = supabase.storage.from('audio').getPublicUrl(`asc3/${storyId}/cover.jpg`)

      coverImageUrl = publicUrl
      console.log(`✅ Cover image uploaded: ${coverImageUrl}`)
    } catch (err) {
      coverError = err instanceof Error ? err.message : String(err)
      console.error('⚠️ Cover generation failed (continuing):', coverError)
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 6 — Save to Supabase stories table
    // ═══════════════════════════════════════════════════════════════

    let dbError: string | null = null

    // First attempt: full ASC3 schema (works if columns have been added)
    const fullRecord = {
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
      // Extended ASC3 columns (require SQL migration — see below)
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
    }

    let { error: insertErr } = await supabase.from('stories').insert([fullRecord])

    if (insertErr) {
      console.warn('⚠️ Full insert failed, trying base columns only:', insertErr.message)
      dbError = `Full insert failed (run SQL migration for extended columns): ${insertErr.message}`

      // Fallback: only existing/known columns
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
      console.log('✅ Story saved to DB (full ASC3 schema)')
      dbError = null
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 7 — Return response
    // ═══════════════════════════════════════════════════════════════

    console.log('🏁 Generation complete:', {
      storyId,
      title,
      hasAudio: !!storyAudioUrl,
      hasCover: !!coverImageUrl,
      audioError,
      coverError,
      dbError,
    })

    return NextResponse.json({
      success: true,
      data: {
        storyId,
        title,
        script: storyScript,
        wordCount: actualWordCount,
        introText,
        outroText,
        introAudioUrl,
        storyAudioUrl,
        outroAudioUrl,
        backgroundMusicUrl: '',
        coverImageUrl,
        sfxMetadata: [],
        // Surface any non-fatal errors to the frontend
        _warnings: [audioError, coverError, dbError].filter(Boolean),
      },
    })
  } catch (error) {
    console.error('❌ Fatal error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
