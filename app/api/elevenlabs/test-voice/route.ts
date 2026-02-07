import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    
    // Upload to Supabase storage
    const timestamp = Date.now();
    const fileName = `test-voice/test-${timestamp}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, Buffer.from(audioBuffer), { contentType: 'audio/mpeg', upsert: true });
    
    if (uploadError) {
      console.error('[Test Voice] Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
    
    const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
    
    return NextResponse.json({ audioUrl: urlData.publicUrl });
  } catch (error) {
    console.error('[Test Voice] Error:', error);
    return NextResponse.json({ error: 'Voice test failed' }, { status: 500 });
  }
}
