// app/api/admin/generate-generic-intros/route.ts
// Generates generic intro variations for non-logged-in users (Welcome page)
// Pass ?category=state to generate one category at a time to avoid timeout

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
  science: 'Science & Technology'
};

// 5 varied generic intro templates (no name) - {narrator}, {label}, {greeting} are replaced
const GENERIC_INTRO_TEMPLATES = [
  `Good {greeting}! I'm {narrator}, bringing you your {label} briefing.`,
  `Good {greeting}! {narrator} here with your {label} update.`,
  `Welcome! I'm {narrator}, and this is your {label} for today.`,
  `Good {greeting}! I'm {narrator} with your {label}.`,
  `Hello and good {greeting}! {narrator} here with today's {label}.`
];

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
    const { searchParams } = new URL(request.url);
    const singleCategory = searchParams.get('category');

    // Get news settings for narrator names and voice IDs
    const { data: settingsData } = await supabase
      .from('news_settings')
      .select('settings')
      .eq('id', '1')
      .single();

    if (!settingsData?.settings) {
      return NextResponse.json({ error: 'News settings not configured' }, { status: 500 });
    }

    const newsSettings = settingsData.settings;
    const categorySettings = newsSettings.categories || {};
    const results: Record<string, { success: boolean; variations?: number; error?: string }> = {};

    // Generate for morning, afternoon, and evening
    const greetings = ['morning', 'afternoon', 'evening'];
    
    // If single category specified, only do that one
    const categoriesToGenerate = singleCategory ? [singleCategory] : CATEGORIES;

    for (const category of categoriesToGenerate) {
      if (!CATEGORIES.includes(category)) {
        results[category] = { success: false, error: 'Invalid category' };
        continue;
      }

      const catSettings = categorySettings[category];
      
      if (!catSettings?.voice_id) {
        results[category] = { success: false, error: 'No voice configured' };
        continue;
      }

      const narratorName = catSettings.narrator_name || 'Your Host';
      const voiceId = catSettings.voice_id;
      const label = CATEGORY_LABELS[category] || category;
      let successCount = 0;

      // Generate variations for each greeting time
      for (const greeting of greetings) {
        for (let i = 0; i < GENERIC_INTRO_TEMPLATES.length; i++) {
          try {
            const template = GENERIC_INTRO_TEMPLATES[i];
            const script = template
              .replace(/{narrator}/g, narratorName)
              .replace(/{label}/g, label)
              .replace(/{greeting}/g, greeting);

            console.log(`[Generic Intros] ${category}, ${greeting}, variation ${i + 1}: "${script}"`);

            const audioBuffer = await generateAudio(script, voiceId);

            // Upload to Supabase storage
            const fileName = `intros/generic/${category}-${greeting}-${i + 1}.mp3`;
            
            const { error: uploadError } = await supabase.storage
              .from('news-audio')
              .upload(fileName, audioBuffer, {
                contentType: 'audio/mpeg',
                upsert: true
              });

            if (uploadError) {
              console.error(`[Generic Intros] Upload error:`, uploadError);
              continue;
            }

            successCount++;

          } catch (err) {
            console.error(`[Generic Intros] Error for ${category} ${greeting} variation ${i + 1}:`, err);
          }
        }
      }

      results[category] = { 
        success: successCount > 0, 
        variations: successCount 
      };
    }

    const totalVariations = Object.values(results).reduce((sum, r) => sum + (r.variations || 0), 0);

    return NextResponse.json({
      success: true,
      message: `Generated ${totalVariations} generic intro variations`,
      results,
      next: singleCategory ? getNextCategory(singleCategory) : null
    });

  } catch (error) {
    console.error('[Generic Intros] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

function getNextCategory(current: string): string | null {
  const idx = CATEGORIES.indexOf(current);
  if (idx === -1 || idx >= CATEGORIES.length - 1) return null;
  return CATEGORIES[idx + 1];
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'generate-generic-intros',
    description: 'POST to generate generic news intro variations. Add ?category=state to do one at a time.',
    categories: CATEGORIES,
    templates: GENERIC_INTRO_TEMPLATES.length,
    greetings: ['morning', 'afternoon', 'evening'],
    totalPerCategory: GENERIC_INTRO_TEMPLATES.length * 3,
    usage: 'curl -X POST "URL?category=state" then ?category=national, etc.'
  });
}
