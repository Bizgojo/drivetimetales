import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

// Character voice IDs from ElevenLabs
const VOICE_IDS = {
  narrator: 'KWDD3Wyq30ZF5NEL01EJ', // Belle B
  character1: 'CyHwTRKhXEYuSd7CbMwI',
  character2: 'G9qyqiHvvE6Y1qJqSL3B',
  character3: 'J8rQREqEVVZQB2pTkxKM',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      concept,
      tone,
      wordCount,
      primaryGenre,
      secondaryGenre1,
      secondaryGenre2,
      authorName,
      authorStyle,
      authorTechniques,
      audioAdaptation,
      series,
      episode,
      targetDestination,
    } = body

    // ===== STEP 1: Generate story title and script with Claude =====

    const genreStr = [primaryGenre, secondaryGenre1, secondaryGenre2]
      .filter(Boolean)
      .join(', ')

    const claudePrompt = `
You are an expert storyteller writing in the style of ${authorStyle}.

Create a complete audio story script with the following specifications:

**Story Requirements:**
- Title: Create a compelling, unique title for this story
- Concept: ${concept}
- Tone: ${tone}
- Word Count Target: ${wordCount} words (tolerance: ±10%)
- Genres: ${genreStr}
- Author Style: ${authorStyle}
- Author Techniques: ${authorTechniques}
- Audio Adaptation Notes: ${audioAdaptation}

**Script Format:**
Provide the story in this exact structure:

[TITLE]
<Insert unique, compelling title>

[STORY]
<Complete story text - ${wordCount} words ±10%>

**Requirements:**
1. The story MUST be ${wordCount} words ±10% (${Math.floor(wordCount * 0.9)} to ${Math.ceil(wordCount * 1.1)} words)
2. Write in the ${authorStyle} style with the techniques listed above
3. Incorporate the audio adaptation guidance in pacing and character voices
4. Use simple, clear language suitable for audio narration
5. Include natural dialogue breaks for character interaction
6. End with a satisfying conclusion appropriate to the ${tone} tone

**Word count is critical.** Count carefully and ensure you hit the target range.

Now write the story:
`

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: claudePrompt,
        },
      ],
    })

    const claudeText =
      claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

    // Parse title and script from Claude response
    const titleMatch = claudeText.match(/\[TITLE\]\s*\n\s*(.+?)\n/)
    const storyMatch = claudeText.match(/\[STORY\]\s*\n([\s\S]+)/)

    if (!titleMatch || !storyMatch) {
      return NextResponse.json(
        { success: false, error: 'Failed to parse Claude response' },
        { status: 400 }
      )
    }

    const title = titleMatch[1].trim()
    const storyScript = storyMatch[1].trim()
    const actualWordCount = storyScript.split(/\s+/).length

    // ===== STEP 2: Generate audio with ElevenLabs =====

    async function generateAudio(text: string, voiceId: string): Promise<string | null> {
      try {
        const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        })

        if (!response.ok) {
          console.error('ElevenLabs error:', await response.text())
          return null
        }

        const audioBuffer = await response.arrayBuffer()
        const fileName = `story_${Date.now()}_${voiceId}.mp3`

        // Upload to Supabase storage
        const { data, error } = await supabase.storage
          .from('story-audio')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/mpeg',
          })

        if (error) {
          console.error('Supabase upload error:', error)
          return null
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('story-audio')
          .getPublicUrl(fileName)

        return urlData?.publicUrl || null
      } catch (error) {
        console.error('Audio generation error:', error)
        return null
      }
    }

    // Generate intro (narrator intro)
    const introText = `Welcome to ${title}. A story by ${authorName}.`
    const introAudioUrl = await generateAudio(introText, VOICE_IDS.narrator)

    // Generate story audio (split into segments if needed)
    const storyAudioUrl = await generateAudio(storyScript.substring(0, 3000), VOICE_IDS.narrator)

    // Generate outro (narrator outro)
    const outroText = `Thank you for listening to ${title}. For more stories, visit Endless Tales.`
    const outroAudioUrl = await generateAudio(outroText, VOICE_IDS.narrator)

    // ===== STEP 3: Generate music with Suno =====

    async function generateMusic(storyTone: string, storyGenre: string): Promise<string | null> {
      try {
        const musicPrompt = `Create ${storyTone} background music for a ${storyGenre} audio drama. Instrumental, loop-friendly, 2-3 minutes.`

        const response = await fetch('https://api.suno.ai/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
          },
          body: JSON.stringify({
            prompt: musicPrompt,
            tags: storyGenre.toLowerCase(),
            title: `Background Music for ${title}`,
          }),
        })

        if (!response.ok) {
          console.error('Suno API error:', await response.text())
          return null
        }

        const result = await response.json()
        return result.audio_url || null
      } catch (error) {
        console.error('Music generation error:', error)
        return null
      }
    }

    const backgroundMusicUrl = await generateMusic(tone, primaryGenre)

    // ===== STEP 4: Generate cover image with DALL-E =====

    async function generateCoverImage(storyTitle: string, storyGenre: string, storyConcept: string): Promise<string | null> {
      try {
        const coverPrompt = `Create a professional, compelling book cover image for an audio story. Title: "${storyTitle}", Genre: ${storyGenre}. Concept: ${storyConcept}. Style: modern, evocative, cinematic. High quality.`

        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: coverPrompt,
            n: 1,
            size: '1024x1024',
            model: 'dall-e-3',
          }),
        })

        if (!response.ok) {
          console.error('DALL-E error:', await response.text())
          return null
        }

        const result = await response.json()
        return result.data[0]?.url || null
      } catch (error) {
        console.error('Cover image generation error:', error)
        return null
      }
    }

    const coverImageUrl = await generateCoverImage(title, primaryGenre, concept)

    // ===== STEP 5: Parse SFX from script =====

    const sfxRegex = /\[SFX:([^\]]+)\]/g
    const sfxMatches = Array.from(storyScript.matchAll(sfxRegex))
    const sfxMetadata = sfxMatches.map((match, index) => ({
      id: `sfx_${index}`,
      time: `${index * 10}s`,
      description: match[1],
    }))

    // ===== STEP 6: Save to Supabase =====

    const { data: savedStory, error: saveError } = await supabase
      .from('stories')
      .insert([
        {
          title,
          author: authorName,
          genre: primaryGenre,
          genre_secondary: secondaryGenre1 || null,
          genre_third: secondaryGenre2 || null,
          duration_mins: Math.round(actualWordCount / 150),
          description: concept,
          cover_url: coverImageUrl,
          series_name: series || null,
          series_number: episode ? parseInt(episode) : null,
          generated_script: storyScript,
          intro_audio_url: introAudioUrl,
          story_audio_url: storyAudioUrl,
          outro_audio_url: outroAudioUrl,
          background_music_url: backgroundMusicUrl,
          cover_image_url: coverImageUrl,
          sfx_metadata: sfxMetadata,
          status: 'pending',
        },
      ])
      .select()

    if (saveError) {
      console.error('Database save error:', saveError)
      return NextResponse.json(
        { success: false, error: 'Failed to save story to database' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        title,
        script: storyScript,
        wordCount: actualWordCount,
        introText: introText,
        outroText: outroText,
        introAudioUrl: introAudioUrl,
        storyAudioUrl: storyAudioUrl,
        outroAudioUrl: outroAudioUrl,
        backgroundMusicUrl: backgroundMusicUrl,
        coverImageUrl: coverImageUrl,
        sfxMetadata: sfxMetadata,
        storyId: savedStory?.[0]?.id,
      },
    })
  } catch (error) {
    console.error('Generation error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
