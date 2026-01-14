// app/api/news/subscribers-only-audio/route.ts
// Generates audio message for non-subscribers trying to access State News

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const voiceId = body.voiceId || 'EXAVITQu4vr4xnSDxMaL';
    
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    
    if (!elevenLabsKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    const message = "State news is only available for subscribers. You can subscribe by clicking the button on the bottom of this page.";

    // Generate audio with ElevenLabs
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsKey
      },
      body: JSON.stringify({
        text: message,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Subscribers Only Audio] ElevenLabs error:', error);
      return NextResponse.json({ error: 'Failed to generate audio' }, { status: 500 });
    }

    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString()
      }
    });

  } catch (error) {
    console.error('[Subscribers Only Audio] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
