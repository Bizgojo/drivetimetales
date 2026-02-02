// app/api/news/state-upsell/route.ts
// Generate state news upsell message for non-subscribers
// February 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

const UPSELL_SCRIPT = `State news is available exclusively for Drive Time Tales subscribers. 
With a subscription, you'll get personalized news briefings for your state, 
covering local government, community events, weather, and more. 
Subscribe today to stay informed about what's happening in your area. 
Visit our website or tap the subscribe button to get started.`;

// POST - Generate upsell audio
export async function POST(request: NextRequest) {
  try {
    const { narratorName, voiceId } = await request.json();

    if (!narratorName || !voiceId) {
      return NextResponse.json({ 
        error: 'Narrator name and voice ID are required' 
      }, { status: 400 });
    }

    console.log('[State Upsell] Generating with voice:', voiceId);

    // Generate audio with ElevenLabs
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: UPSELL_SCRIPT,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!response.ok) {
      console.error('[State Upsell] ElevenLabs error:', response.status);
      return NextResponse.json({ error: 'Audio generation failed' }, { status: 500 });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Upload to storage - CORRECT BUCKET: audio/news/
    const fileName = `state-upsell-${Date.now()}.mp3`;
    const filePath = `news/${fileName}`;

    console.log('[State Upsell] Uploading to:', filePath);

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(filePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

    if (uploadError) {
      console.error('[State Upsell] Upload error:', uploadError);
      return NextResponse.json({ 
        error: 'Failed to upload: ' + uploadError.message 
      }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(filePath);
    const audioUrl = urlData.publicUrl;

    // Mark previous upsells as not live
    await supabase
      .from('news_episodes')
      .update({ is_live: false })
      .eq('category', 'state-upsell');

    // Save episode
    const { error: insertError } = await supabase
      .from('news_episodes')
      .insert({
        category: 'state-upsell',
        audio_url: audioUrl,
        script_text: UPSELL_SCRIPT,
        narrator_name: narratorName,
        voice_id: voiceId,
        is_live: true,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('[State Upsell] Insert error:', insertError);
    }

    console.log('[State Upsell] Generated successfully');

    return NextResponse.json({ 
      success: true, 
      audioUrl 
    });

  } catch (error) {
    console.error('[State Upsell] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Generation failed' 
    }, { status: 500 });
  }
}

// GET - Retrieve existing upsell
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('news_episodes')
      .select('*')
      .eq('category', 'state-upsell')
      .eq('is_live', true)
      .single();

    if (error || !data) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({ 
      exists: true, 
      audioUrl: data.audio_url,
      createdAt: data.created_at
    });
  } catch (error) {
    console.error('[State Upsell] GET error:', error);
    return NextResponse.json({ exists: false });
  }
}
