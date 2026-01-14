// ============================================================================
// PROTECTED FILE - DO NOT MODIFY WITHOUT CAREFUL CONSIDERATION
// File: app/api/news/personalized/route.ts
// Purpose: Generate personalized news briefings for logged-in users
// Last updated: January 14, 2026
// Status: SAVED - Not yet integrated with home page
// ============================================================================
// 
// TO DEPLOY THIS FILE:
// 1. Copy to: ~/Projects/drivetimetales/app/api/news/personalized/route.ts
// 2. git add -A && git commit -m "Add personalized news endpoint" && git push
//
// TO USE FROM HOME PAGE:
// Call POST /api/news/personalized with { category, userId }
// Returns { audioUrl, personalized: true, userName }
//
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, userId } = body;

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    // Get user info if userId provided
    let userName: string | null = null;
    let userState: string | null = null;

    if (userId) {
      const { data: user } = await supabase
        .from('users')
        .select('display_name, first_name, state')
        .eq('id', userId)
        .single();

      if (user) {
        // Use first_name if available, otherwise extract from display_name
        userName = user.first_name || (user.display_name ? user.display_name.split(' ')[0] : null);
        userState = user.state;
        console.log(`[Personalized News] User: ${userName}, State: ${userState}`);
      }
    }

    // Get narrator settings for this category from news_episodes or news_settings
    let narratorName = '';
    let voiceId = 'EXAVITQu4vr4xnSDxMaL'; // Default voice
    let state = null;

    // Try to get settings from the live episode for this category
    const { data: liveEpisode } = await supabase
      .from('news_episodes')
      .select('narrator_name, voice_id, state')
      .eq('category', category)
      .eq('is_live', true)
      .single();

    if (liveEpisode) {
      narratorName = liveEpisode.narrator_name || '';
      voiceId = liveEpisode.voice_id || voiceId;
      state = category === 'state' ? (userState || liveEpisode.state || 'South Carolina') : null;
    }

    console.log(`[Personalized News] Generating ${category} briefing for ${userName || 'anonymous'}`);
    console.log(`[Personalized News] Narrator: ${narratorName || 'none'}, State: ${state || 'n/a'}`);

    // Build the request URL for the generate-news endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                    'https://drivetimetales.vercel.app';

    // Call the main generate-news endpoint with personalization
    const generateResponse = await fetch(`${baseUrl}/api/admin/generate-news`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        category,
        voiceId,
        narratorName,
        state,
        storiesCount: 5,
        userName // This triggers personalization in the script
      })
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error('[Personalized News] Generation failed:', errorText);
      return NextResponse.json({ error: 'Failed to generate briefing' }, { status: 500 });
    }

    const result = await generateResponse.json();
    
    console.log(`[Personalized News] Success! Audio URL: ${result.episode?.audioUrl}`);

    return NextResponse.json({
      success: true,
      audioUrl: result.episode.audioUrl,
      title: result.episode.title,
      personalized: true,
      userName,
      category
    });

  } catch (error) {
    console.error('[Personalized News] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check if personalized audio exists for a user/category
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const userId = searchParams.get('userId');

  if (!category) {
    return NextResponse.json({ error: 'Category required' }, { status: 400 });
  }

  // For now, just return the live episode info
  // In the future, could cache personalized episodes per user
  const { data: episode } = await supabase
    .from('news_episodes')
    .select('id, title, audio_url, narrator_name, duration_mins')
    .eq('category', category)
    .eq('is_live', true)
    .single();

  return NextResponse.json({ 
    episode,
    personalized: false,
    message: 'Use POST to generate personalized briefing'
  });
}
