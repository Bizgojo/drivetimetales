// app/api/news/no-credits-message/route.ts
// DTT News Briefings - No Credits Message API
// FRESH BUILD - February 2026
//
// Generates a personalized message when user has no credits

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

const CATEGORY_LABELS: Record<string, string> = {
  state: 'State',
  national: 'National',
  world: 'World',
  business: 'Business',
  sports: 'Sports',
  science: 'Science and Technology'
};

export async function POST(request: NextRequest) {
  try {
    const { category, userName } = await request.json();

    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    // Get settings for this category
    const { data: settings } = await supabase
      .from('news_settings')
      .select('narrator_name, voice_id')
      .eq('category', category)
      .single();

    if (!settings?.narrator_name || !settings?.voice_id) {
      return NextResponse.json(
        { error: 'Category not configured' },
        { status: 404 }
      );
    }

    const categoryLabel = CATEGORY_LABELS[category] || category;
    const name = userName || 'there';

    // Generate no-credits message
    const script = `Hi ${name}, this is ${settings.narrator_name}. I'm sorry, but I can't provide the ${categoryLabel} news because you have no credits in your account. Please get more credits so we can visit again!`;

    console.log(`[No Credits] Generating message for ${name}, category: ${category}`);

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
      console.error('[No Credits] ElevenLabs error:', audioResponse.status);
      return NextResponse.json(
        { error: 'Failed to generate audio' },
        { status: 500 }
      );
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // Upload to Supabase storage (temporary file, can be overwritten)
    const fileName = `no-credits-${category}-${Date.now()}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('[No Credits] Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload audio' },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('news-audio')
      .getPublicUrl(fileName);

    console.log('[No Credits] Generated successfully');

    return NextResponse.json({ audioUrl: urlData.publicUrl });
  } catch (error) {
    console.error('[No Credits] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate message' },
      { status: 500 }
    );
  }
}
