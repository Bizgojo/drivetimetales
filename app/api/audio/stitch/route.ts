// app/api/audio/stitch/route.ts
// Combines intro + news body + outro audio clips for playback
// Returns URLs for sequential playback (frontend handles the stitching)
//
// Usage:
//   Welcome page (generic clips): /api/audio/stitch?type=welcome&category=national
//   Home page (personalized):     /api/audio/stitch?type=user&userId=xxx&category=national&state=South%20Carolina

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'welcome'; // 'welcome' or 'user'
  const category = searchParams.get('category');
  const userId = searchParams.get('userId'); // Required if type=user
  const state = searchParams.get('state'); // For state news category

  if (!category) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 });
  }

  if (type === 'user' && !userId) {
    return NextResponse.json({ error: 'userId is required for personalized clips' }, { status: 400 });
  }

  try {
    // =================================================================
    // 1. GET NEWS BODY AUDIO URL
    // =================================================================
    
    let newsBodyUrl: string | null = null;
    
    // For state news, look for the specific state's episode
    if (category === 'state' && state) {
      const { data: stateEpisode } = await supabase
        .from('news_episodes')
        .select('audio_url')
        .eq('category', 'state')
        .eq('state', state)
        .eq('is_live', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      newsBodyUrl = stateEpisode?.audio_url || null;
    }
    
    // If no state-specific episode found, or not a state category, get generic episode
    if (!newsBodyUrl) {
      const { data: episode } = await supabase
        .from('news_episodes')
        .select('audio_url')
        .eq('category', category)
        .eq('is_live', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      newsBodyUrl = episode?.audio_url || null;
    }

    if (!newsBodyUrl) {
      return NextResponse.json({ 
        error: 'No news audio found for this category',
        category 
      }, { status: 404 });
    }

    // =================================================================
    // 2. GET INTRO AND OUTRO CLIPS
    // =================================================================
    
    let introUrl: string | null = null;
    let introText: string | null = null;
    let outroUrl: string | null = null;
    let outroText: string | null = null;

    if (type === 'user' && userId) {
      // PERSONALIZED CLIPS - from user_audio_clips table
      // Pick a random clip (1-15) for variety
      const randomClipNumber = Math.floor(Math.random() * 15) + 1;

      // Get intro
      const { data: introClip } = await supabase
        .from('user_audio_clips')
        .select('audio_url, script_text')
        .eq('user_id', userId)
        .eq('clip_type', 'intro')
        .eq('clip_number', randomClipNumber)
        .single();

      if (introClip) {
        introUrl = introClip.audio_url;
        introText = introClip.script_text;
      }

      // Get outro
      const { data: outroClip } = await supabase
        .from('user_audio_clips')
        .select('audio_url, script_text')
        .eq('user_id', userId)
        .eq('clip_type', 'outro')
        .eq('clip_number', randomClipNumber)
        .single();

      if (outroClip) {
        outroUrl = outroClip.audio_url;
        outroText = outroClip.script_text;
      }

    } else {
      // GENERIC CLIPS - from welcome_audio_clips table
      // Pick a random clip (1-15) for variety
      const randomClipNumber = Math.floor(Math.random() * 15) + 1;

      // Get intro
      const { data: introClip } = await supabase
        .from('welcome_audio_clips')
        .select('audio_url, script_text')
        .eq('clip_type', 'intro')
        .eq('clip_number', randomClipNumber)
        .single();

      if (introClip) {
        introUrl = introClip.audio_url;
        introText = introClip.script_text;
      }

      // Get outro
      const { data: outroClip } = await supabase
        .from('welcome_audio_clips')
        .select('audio_url, script_text')
        .eq('clip_type', 'outro')
        .eq('clip_number', randomClipNumber)
        .single();

      if (outroClip) {
        outroUrl = outroClip.audio_url;
        outroText = outroClip.script_text;
      }
    }

    // =================================================================
    // 3. BUILD PLAYLIST
    // =================================================================
    
    const playlist: Array<{
      type: 'intro' | 'news' | 'outro';
      url: string;
      text?: string;
      category?: string;
      state?: string;
    }> = [];
    
    // Add intro if available
    if (introUrl) {
      playlist.push({
        type: 'intro',
        url: introUrl,
        text: introText || undefined,
      });
    }

    // Add news body (always required)
    playlist.push({
      type: 'news',
      url: newsBodyUrl,
      category,
      state: state || undefined,
    });

    // Add outro if available
    if (outroUrl) {
      playlist.push({
        type: 'outro',
        url: outroUrl,
        text: outroText || undefined,
      });
    }

    // =================================================================
    // 4. RETURN RESPONSE
    // =================================================================
    
    return NextResponse.json({
      success: true,
      category,
      type,
      userId: userId || null,
      isPersonalized: type === 'user',
      playlist,
      // Also return individual URLs for simple access
      urls: {
        intro: introUrl,
        news: newsBodyUrl,
        outro: outroUrl,
      },
    });

  } catch (error) {
    console.error('[Audio Stitch] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get audio' },
      { status: 500 }
    );
  }
}
