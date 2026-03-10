import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('📝 Generation request received:', {
      concept: body.concept?.substring(0, 50),
      wordCount: body.wordCount,
      authorStyle: body.authorStyle,
    })

    // ===== STEP 1: Generate story title and script with Claude =====

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

    console.log('🤖 Calling Claude API...')

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

    const claudeText = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

    console.log('✅ Claude response received, parsing...')

    // Parse title and script
    const titleMatch = claudeText.match(/\[TITLE\]\s*\n\s*(.+?)\n/)
    const storyMatch = claudeText.match(/\[STORY\]\s*\n([\s\S]+)/)

    if (!titleMatch || !storyMatch) {
      console.error('❌ Parse error:', { titleMatch: !!titleMatch, storyMatch: !!storyMatch })
      return NextResponse.json(
        { success: false, error: 'Failed to parse Claude response' },
        { status: 400 }
      )
    }

    const title = titleMatch[1].trim()
    const storyScript = storyMatch[1].trim()
    const actualWordCount = storyScript.split(/\s+/).length

    console.log('✅ Story generated:', { title, wordCount: actualWordCount })

    // Return generated story
    return NextResponse.json({
      success: true,
      data: {
        title,
        script: storyScript,
        wordCount: actualWordCount,
        introText: `Welcome to ${title}. A story by ${body.authorName}.`,
        outroText: `Thank you for listening to ${title}. For more stories, visit Endless Tales.`,
        introAudioUrl: 'https://example.com/audio/intro.mp3',
        storyAudioUrl: 'https://example.com/audio/story.mp3',
        outroAudioUrl: 'https://example.com/audio/outro.mp3',
        backgroundMusicUrl: 'https://example.com/music/bg.mp3',
        coverImageUrl: 'https://images.unsplash.com/photo-1543002588-d83fcc82edad?w=1024&h=1024',
        sfxMetadata: [],
      },
    })
  } catch (error) {
    console.error('❌ Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
