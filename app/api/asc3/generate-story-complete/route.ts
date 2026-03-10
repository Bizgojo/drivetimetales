import { NextRequest, NextResponse } from 'next/server'

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

    const claudePrompt = `
You are an expert storyteller writing in the style of ${body.authorStyle}.

Create a complete audio story script with the following specifications:

**Story Requirements:**
- Concept: ${body.concept}
- Tone: ${body.tone}
- Word Count Target: ${body.wordCount} words (tolerance: ±10%)
- Genres: ${genreStr}
- Author Style: ${body.authorStyle}
- Author Techniques: ${body.authorTechniques}
- Audio Adaptation Notes: ${body.audioAdaptation}

**Script Format:**
Provide the story in this exact structure:

[TITLE]
<Insert unique, compelling title>

[STORY]
<Complete story text - ${body.wordCount} words ±10%>

**Requirements:**
1. The story MUST be ${body.wordCount} words ±10% (${Math.floor(body.wordCount * 0.9)} to ${Math.ceil(body.wordCount * 1.1)} words)
2. Write in the ${body.authorStyle} style with the techniques listed above
3. Incorporate the audio adaptation guidance in pacing and character voices
4. Use simple, clear language suitable for audio narration
5. Include natural dialogue breaks for character interaction
6. End with a satisfying conclusion appropriate to the ${body.tone} tone

**Word count is critical.** Count carefully and ensure you hit the target range.

Now write the story:
`

    const Anthropic = require('@anthropic-ai/sdk').default
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

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

    console.log('✅ Claude generated:', { title, wordCount: actualWordCount })

    // Return success with generated story
    return NextResponse.json({
      success: true,
      data: {
        title,
        script: storyScript,
        wordCount: actualWordCount,
        introText: `Welcome to ${title}. A story by ${body.authorName}.`,
        outroText: `Thank you for listening to ${title}. For more stories, visit Endless Tales.`,
        introAudioUrl: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400',
        storyAudioUrl: 'https://images.unsplash.com/photo-1516714899617-cb61d6c88aa9?w=400',
        outroAudioUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400',
        backgroundMusicUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400',
        coverImageUrl: 'https://images.unsplash.com/photo-1543002588-d83fcc82edad?w=1024&h=1024',
        sfxMetadata: [],
      },
    })
  } catch (error) {
    console.error('❌ Generation error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
