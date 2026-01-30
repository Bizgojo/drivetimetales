// app/api/admin/generate-no-credits-audio/route.ts
// Generates "sorry, you need credits" audio for each category's narrator
// Run this once from the admin panel, or when you change narrators

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = ['state', 'national', 'international', 'business', 'sports', 'science'];

const CATEGORY_LABELS: Record<string, string> = {
  state: 'State News',
  national: 'National News',
  international: 'International News',
  business: 'Business News',
  sports: 'Sports News',
  science: 'Science & Technology News'
};

async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY!
    },
    body: JSON.stringify({
      text: script,
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
    // Get news settings to find narrator names and voice IDs
    const { data: settingsData, error: settingsError } = await supabase
      .from('news_settings')
      .select('settings')
      .eq('id', '1')
      .single();

    if (settingsError || !settingsData) {
      return NextResponse.json({ error: 'Could not load news settings' }, { status: 500 });
    }

    const settings = settingsData.settings || {};
    const categories = settings.categories || {};
    const results: Record<string, { success: boolean; audioUrl?: string; error?: string }> = {};

    for (const category of CATEGORIES) {
      const catSettings = categories[category] || {};
      const narratorName = catSettings.narrator_name || 'Your Host';
      const voiceId = catSettings.voice_id;

      if (!voiceId) {
        results[category] = { success: false, error: 'No voice configured' };
        continue;
      }

      try {
        // Generate the "sorry" script for this narrator
        const label = CATEGORY_LABELS[category] || category;
        const script = `I'm sorry, but while ${label} briefings are free to listen to, you need to have at least one credit in your account to verify you're an active member of Drive Time Tales. You can tap the orange button above to get more credits. I'm ${narratorName}, and I look forward to bringing you the news next time. Take care and drive safe!`;

        console.log(`[No Credits Audio] Generating for ${category} with voice ${voiceId}`);
        const audioBuffer = await generateAudio(script, voiceId);

        // Upload to Supabase storage
        const fileName = `no-credits-${category}.mp3`;
        
        const { error: uploadError } = await supabase.storage
          .from('news-audio')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true // Overwrite if exists
          });

        if (uploadError) {
          console.error(`[No Credits Audio] Upload error for ${category}:`, uploadError);
          results[category] = { success: false, error: uploadError.message };
          continue;
        }

        const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
        const audioUrl = urlData.publicUrl;

        console.log(`[No Credits Audio] Generated for ${category}: ${audioUrl}`);
        results[category] = { success: true, audioUrl };

      } catch (err) {
        console.error(`[No Credits Audio] Error for ${category}:`, err);
        results[category] = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }

    return NextResponse.json({
      success: true,
      message: 'No-credits audio generation complete',
      results
    });

  } catch (error) {
    console.error('[No Credits Audio] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'generate-no-credits-audio',
    description: 'POST to generate "sorry, you need credits" audio for all category narrators',
    usage: 'Call this after changing narrator voices in news settings'
  });
}
