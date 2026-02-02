// app/api/news/state-upsell/route.ts
// DTT News Briefings - State Upsell Message API
// FRESH BUILD - February 2026
//
// Generates or retrieves the state news upsell message for non-subscribers

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

export async function GET() {
  try {
    // Check for existing upsell message
    const { data: existing } = await supabase
      .from('news_episodes')
      .select('audio_url')
      .eq('category', 'state-upsell')
      .eq('is_live', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing?.audio_url) {
      return NextResponse.json({ audioUrl: existing.audio_url });
    }

    // Get state news settings for narrator name and voice
    const { data: settings } = await supabase
      .from('news_settings')
      .select('narrator_name, voice_id')
      .eq('category', 'state')
      .single();

    if (!settings?.narrator_name || !settings?.voice_id) {
      return NextResponse.json(
        { error: 'State news not configured' },
        { status: 404 }
      );
    }

    // Generate upsell message
    const script = `Hello, I'm ${settings.narrator_name}, your State News broadcaster. I'd like to welcome you to the Drive Time Tales news division! State news is not available for non-subscribers, but when you subscribe, you'll get your own personalized state news delivered fresh every day. In the meantime, enjoy the other news briefings, and I look forward to seeing you soon!`;

    console.log('[State Upsell] Generating audio...');

    // Generate audio with ElevenLabs
    const audioResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${settings.voice_id}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!audioResponse.ok) {
      console.error('[State Upsell] ElevenLabs error:', audioResponse.status);
      return NextResponse.json(
        { error: 'Failed to generate audio' },
        { status: 500 }
      );
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // Upload to Supabase storage
    const fileName = `state-upsell-${Date.now()}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('[State Upsell] Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload audio' },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('news-audio')
      .getPublicUrl(fileName);

    const audioUrl = urlData.publicUrl;

    // Save to database
    await supabase
      .from('news_episodes')
      .update({ is_live: false })
      .eq('category', 'state-upsell');

    await supabase
      .from('news_episodes')
      .insert({
        category: 'state-upsell',
        state: null,
        audio_url: audioUrl,
        script_text: script,
        narrator_name: settings.narrator_name,
        voice_id: settings.voice_id,
        is_live: true,
        created_at: new Date().toISOString()
      });

    console.log('[State Upsell] Generated successfully');

    return NextResponse.json({ audioUrl });
  } catch (error) {
    console.error('[State Upsell] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate upsell message' },
      { status: 500 }
    );
  }
}
