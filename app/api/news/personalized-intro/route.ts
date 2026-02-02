// app/api/news/personalized-intro/route.ts
// DTT News Briefings - Personalized Intro Generator
// February 2026
//
// Generates a short (~5 second) personalized intro for Home page
// "Good afternoon, Marc! Here's your National News briefing."

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

// Category display names
const CATEGORY_LABELS: Record<string, string> = {
  state: 'State',
  national: 'National',
  world: 'World',
  business: 'Business',
  sports: 'Sports',
  science: 'Science and Tech'
};

// Intro variations - short and personal
const INTRO_VARIATIONS = [
  "Good {timeOfDay}, {userName}! Here's your {category} briefing.",
  "Hey {userName}! {narratorName} here with your {category} update.",
  "{userName}, good {timeOfDay}! Ready for your {category} news?",
  "Hi {userName}! Let's get into your {category} briefing.",
  "Good {timeOfDay}, {userName}! I'm {narratorName} with your {category} news."
];

function getTimeOfDay(): string {
  const hour = parseInt(new Date().toLocaleString('en-US', { 
    timeZone: 'America/New_York', 
    hour: 'numeric', 
    hour12: false 
  }));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST(request: NextRequest) {
  try {
    const { category, userName, stateName } = await request.json();

    if (!category || !userName) {
      return NextResponse.json(
        { error: 'Missing category or userName' },
        { status: 400 }
      );
    }

    // Get narrator name and voice from settings
    const { data: settings, error: settingsError } = await supabase
      .from('news_settings')
      .select('narrator_name, voice_id')
      .eq('category', category)
      .single();

    if (settingsError || !settings?.narrator_name || !settings?.voice_id) {
      return NextResponse.json(
        { error: 'Category not configured' },
        { status: 404 }
      );
    }

    // Build the intro script
    const timeOfDay = getTimeOfDay();
    const categoryLabel = category === 'state' && stateName 
      ? `${stateName}` 
      : CATEGORY_LABELS[category] || category;
    
    const template = pickRandom(INTRO_VARIATIONS);
    const script = template
      .replace(/{timeOfDay}/g, timeOfDay)
      .replace(/{userName}/g, userName)
      .replace(/{narratorName}/g, settings.narrator_name)
      .replace(/{category}/g, categoryLabel);

    console.log(`[Personalized Intro] Generating for ${userName}: "${script}"`);

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
      console.error('[Personalized Intro] ElevenLabs error:', audioResponse.status);
      return NextResponse.json(
        { error: 'Failed to generate audio' },
        { status: 500 }
      );
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

    // Upload to Supabase storage (temporary file)
    const fileName = `intro-${category}-${userName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('[Personalized Intro] Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload audio' },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('news-audio')
      .getPublicUrl(fileName);

    console.log('[Personalized Intro] Generated successfully');

    return NextResponse.json({
      audioUrl: urlData.publicUrl,
      script,
      duration: '5' // Approximate seconds
    });

  } catch (error) {
    console.error('[Personalized Intro] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate intro' },
      { status: 500 }
    );
  }
}
