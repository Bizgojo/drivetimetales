// app/api/user/generate-intros/route.ts
// Generates personalized intro variations for a user across all news categories
// Called after user signup/subscription

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
  science: 'Science & Technology'
};

// 10 varied intro templates - {name}, {narrator}, {label}, {greeting} are replaced
const INTRO_TEMPLATES = [
  `Good {greeting}, {name}! I'm {narrator}, bringing you your {label} briefing.`,
  `Hey {name}, good {greeting}! {narrator} here with your {label} update.`,
  `Welcome, {name}! I'm {narrator}, and this is your {label} for today.`,
  `{name}, good {greeting} to you! I'm {narrator} with your {label}.`,
  `Rise and shine, {name}! {narrator} here with today's {label}.`,
  `Good {greeting}, {name}! {narrator} bringing you the latest {label}.`,
  `Hello {name}! I'm {narrator}, ready with your {label} briefing.`,
  `{name}, great to have you! I'm {narrator} with your {label} update.`,
  `Good {greeting}! I'm {narrator}, and {name}, here's your {label}.`,
  `Hey there, {name}! {narrator} here, let's get into your {label}.`
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

function getTimeGreeting(): string {
  const estTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const hour = new Date(estTime).getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, categories: requestedCategories } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Get user's first name
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('first_name, display_name')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userName = userData.first_name || userData.display_name || 'friend';

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

    // Determine which categories to generate
    const categoriesToGenerate = requestedCategories || CATEGORIES;
    const greeting = getTimeGreeting();
    const results: Record<string, { success: boolean; variations?: number; error?: string }> = {};

    for (const category of categoriesToGenerate) {
      const catSettings = categorySettings[category];
      
      if (!catSettings?.voice_id) {
        results[category] = { success: false, error: 'No voice configured' };
        continue;
      }

      const narratorName = catSettings.narrator_name || 'Your Host';
      const voiceId = catSettings.voice_id;
      const label = CATEGORY_LABELS[category] || category;

      // Check if intros already exist for this user/category
      const { data: existingIntros } = await supabase
        .from('user_news_intros')
        .select('id')
        .eq('user_id', userId)
        .eq('category', category);

      if (existingIntros && existingIntros.length >= INTRO_TEMPLATES.length) {
        results[category] = { success: true, variations: existingIntros.length };
        continue; // Already generated
      }

      // Delete any existing intros for this category (in case of partial generation)
      await supabase
        .from('user_news_intros')
        .delete()
        .eq('user_id', userId)
        .eq('category', category);

      let successCount = 0;

      // Generate all variations
      for (let i = 0; i < INTRO_TEMPLATES.length; i++) {
        try {
          const template = INTRO_TEMPLATES[i];
          const script = template
            .replace(/{name}/g, userName)
            .replace(/{narrator}/g, narratorName)
            .replace(/{label}/g, label)
            .replace(/{greeting}/g, greeting);

          console.log(`[Generate Intros] User ${userId}, ${category}, variation ${i + 1}: "${script}"`);

          const audioBuffer = await generateAudio(script, voiceId);

          // Upload to Supabase storage
          const fileName = `intros/${userId}/${category}-${i + 1}.mp3`;
          
          const { error: uploadError } = await supabase.storage
            .from('news-audio')
            .upload(fileName, audioBuffer, {
              contentType: 'audio/mpeg',
              upsert: true
            });

          if (uploadError) {
            console.error(`[Generate Intros] Upload error for ${category} variation ${i + 1}:`, uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);

          // Save to database
          await supabase.from('user_news_intros').insert({
            user_id: userId,
            category,
            variation_number: i + 1,
            audio_url: urlData.publicUrl,
            narrator_name: narratorName,
            voice_id: voiceId
          });

          successCount++;

        } catch (err) {
          console.error(`[Generate Intros] Error for ${category} variation ${i + 1}:`, err);
        }
      }

      results[category] = { 
        success: successCount > 0, 
        variations: successCount,
        error: successCount === 0 ? 'All variations failed' : undefined
      };
    }

    const totalVariations = Object.values(results).reduce((sum, r) => sum + (r.variations || 0), 0);

    return NextResponse.json({
      success: true,
      message: `Generated ${totalVariations} intro variations for ${userName}`,
      userId,
      userName,
      results
    });

  } catch (error) {
    console.error('[Generate Intros] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'generate-intros',
    description: 'POST with { userId } to generate personalized news intro variations',
    templates: INTRO_TEMPLATES.length
  });
}
