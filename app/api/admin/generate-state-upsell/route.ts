// app/api/admin/generate-state-upsell/route.ts
// One-time generation of the state news upsell audio clip for Welcome page

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STATE_UPSELL_TEXT = "State news is available exclusively for Drive Time Tales subscribers. Sign up for a free trial and get personalized news for your state, delivered fresh every day. We'd love to have you!";

async function generateAudioClip(text: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY!
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { voiceId, forceRegenerate = false } = body;

    // Default voice - Rachel
    const voice = voiceId || '21m00Tcm4TlvDq8ikWAM';

    console.log('[Generate State Upsell] Starting...');

    // Check if upsell clip already exists
    const { data: existingFiles } = await supabase.storage
      .from('news-audio')
      .list('welcome-clips', { search: 'state-upsell' });

    if (existingFiles && existingFiles.length > 0 && !forceRegenerate) {
      const { data: urlData } = supabase.storage
        .from('news-audio')
        .getPublicUrl(`welcome-clips/${existingFiles[0].name}`);
      
      return NextResponse.json({ 
        success: false, 
        message: 'State upsell clip already exists. Set forceRegenerate=true to regenerate.',
        audioUrl: urlData.publicUrl
      });
    }

    // Generate the audio clip
    console.log('[Generate State Upsell] Generating audio...');
    const audioBuffer = await generateAudioClip(STATE_UPSELL_TEXT, voice);
    
    const fileName = `welcome-clips/state-upsell-${Date.now()}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
    
    console.log('[Generate State Upsell] Complete!', urlData.publicUrl);

    return NextResponse.json({
      success: true,
      audioUrl: urlData.publicUrl,
      scriptText: STATE_UPSELL_TEXT
    });

  } catch (error) {
    console.error('[Generate State Upsell] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

// GET handler to retrieve the upsell clip URL
export async function GET(request: NextRequest) {
  try {
    const { data: files } = await supabase.storage
      .from('news-audio')
      .list('welcome-clips', { search: 'state-upsell' });

    if (!files || files.length === 0) {
      return NextResponse.json({ 
        exists: false,
        message: 'State upsell clip not found. Call POST to generate it.'
      });
    }

    const { data: urlData } = supabase.storage
      .from('news-audio')
      .getPublicUrl(`welcome-clips/${files[0].name}`);

    return NextResponse.json({
      exists: true,
      audioUrl: urlData.publicUrl,
      fileName: files[0].name
    });

  } catch (error) {
    console.error('[Get State Upsell] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch' },
      { status: 500 }
    );
  }
}
