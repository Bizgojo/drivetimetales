/*
ASC3 Generate Story API
POST: Generate story script from form data using Claude
*/

import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

interface GenerateStoryRequest {
  title: string;
  concept: string;
  tone: string;
  wordCount: number;
  primaryGenre: string;
  secondaryGenre1?: string;
  secondaryGenre2?: string;
  authorName: string;
  authorStyle: string;
  authorTechniques: string;
  audioAdaptation: string;
  series?: string;
  episode?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateStoryRequest = await request.json();

    // Validate input
    if (!body.title || !body.concept || !body.wordCount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Calculate target word count with tolerance
    const tolerance = Math.ceil(body.wordCount * 0.1);
    const minWords = Math.max(100, body.wordCount - tolerance);
    const maxWords = body.wordCount + tolerance;

    // Build genre string
    let genreString = body.primaryGenre;
    if (body.secondaryGenre1) genreString += `, ${body.secondaryGenre1}`;
    if (body.secondaryGenre2) genreString += `, ${body.secondaryGenre2}`;

    // Build the prompt for Claude
    const prompt = `You are a master storyteller writing in the style of ${body.authorName}.

STYLE GUIDELINES:
${body.authorTechniques}

AUDIO ADAPTATION:
${body.audioAdaptation}

TASK:
Write a ${body.primaryGenre} story for the audio drama platform "Endless Tales".

Title: ${body.title}
Concept: ${body.concept}
Tone: ${body.tone}
Genres: ${genreString}
Target Length: ${body.wordCount} words (acceptable range: ${minWords}-${maxWords} words)
${body.series ? `Series: ${body.series}` : ''}
${body.episode ? `Episode: ${body.episode}` : ''}

REQUIREMENTS:
1. Write the complete story dialogue and narrative in the style of ${body.authorName}
2. Include character names in CAPS when they first speak
3. Format dialogue naturally with clear speaker identification
4. Target word count: ${body.wordCount} words (±10% acceptable)
5. Make it engaging for audio - clear voices, natural pacing
6. The story should feel authentic to the "${body.primaryGenre}" genre
7. Apply the author's signature techniques and style consistently

IMPORTANT:
- This is for audio drama, so write in a way that sounds good when read aloud
- Include natural pauses and emotional beats
- Make character voices distinct through dialogue patterns
- Consider the audio adaptation notes when structuring the story

Write the complete story now:`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to generate story' },
        { status: 500 }
      );
    }

    const result = await response.json();
    
    // Extract the generated text
    const generatedText = result.content?.[0]?.text || '';
    
    if (!generatedText) {
      return NextResponse.json(
        { success: false, error: 'No story generated' },
        { status: 500 }
      );
    }

    // Count words
    const actualWordCount = generatedText.split(/\s+/).length;

    return NextResponse.json({
      success: true,
      data: {
        title: body.title,
        script: generatedText,
        wordCount: actualWordCount,
        authorStyle: body.authorStyle,
        genres: {
          primary: body.primaryGenre,
          secondary1: body.secondaryGenre1,
          secondary2: body.secondaryGenre2,
        },
        concept: body.concept,
        tone: body.tone,
      },
    });
  } catch (error) {
    console.error('Error generating story:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate story' },
      { status: 500 }
    );
  }
}
