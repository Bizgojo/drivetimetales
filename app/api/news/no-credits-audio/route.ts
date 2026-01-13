// app/api/news/no-credits-audio/route.ts
// Generates audio message for users with no credits trying to play briefings

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const voiceId = body.voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const userName = body.userName || '';
    
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    
    if (!elevenLabsKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    // Build the message
    const nameGreeting = userName ? `Sorry ${userName}, but` : 'Sorry, but';
    const nameClosing = userName ? `Hope to see you later ${userName}.` : 'Hope to see you later.';
    
    const message = `${nameGreeting} you need at least one credit in your account to play this news briefing. You can buy more credits or upgrade your subscription by clicking the subscribe button at the bottom of this page. ${nameClosing}`;

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
      console.error('[No Credits Audio] ElevenLabs error:', error);
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
    console.error('[No Credits Audio] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
