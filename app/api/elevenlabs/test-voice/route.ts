import { NextRequest, NextResponse } from 'next/server';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { voiceId, text } = await request.json();

    if (!voiceId || !text) {
      return NextResponse.json({ error: 'voiceId and text are required' }, { status: 400 });
    }

    const url = "https://api.elevenlabs.io/v1/text-to-speech/" + voiceId;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Test Voice] ElevenLabs error:', errorText);
      return NextResponse.json({ error: 'Voice test failed' }, { status: 500 });
    }

    const audioBuffer = await response.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  } catch (error) {
    console.error('[Test Voice] Error:', error);
    return NextResponse.json({ error: 'Voice test failed' }, { status: 500 });
  }
}
