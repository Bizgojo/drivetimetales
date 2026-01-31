// app/api/audio/stitch/route.ts
// Combines intro + news body + outro audio clips for playback
// Returns URLs for sequential playback (frontend handles the stitching)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const userId = searchParams.get('userId'); // Optional - if provided, use personalized clips
  const state = searchParams.get('state'); // For state news category

  if (!category) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 });
  }

  try {
    // 1. Get the news body audio URL from news_episodes or news_settings
    let newsBodyUrl: string | null = null;
    
    // Try news_episodes first (latest episode for this category)
    const { data: episode } = await supabase
      .from('news_episodes')
      .select('audio_url')
      .eq('category', category)
      .eq('is_live', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (episode?.audio_url) {
      newsBodyUrl = episode.audio_url;
    } else {
      // Fallback to news_settings
      const { data: settings } = await supabase
        .from('news_settings')
        .select('settings')
        .eq('id', '1')
        .single();

      newsBodyUrl = settings?.settings?.categories?.[category]?.audio_url || null;
    }

    if (!newsBodyUrl) {
      return NextResponse.json({ 
        error: 'No news audio found for this category',
        category 
      }, { status: 404 });
    }

    // 2. Get intro and outro clips
    let introUrl: string | null = null;
    let outroUrl: string | null = null;
    let introText: string | null = null;
    let outroText: string | null = null;

    if (userId) {
      // Personalized clips for logged-in user (Home page)
      const { data: userClips } = await supabase
        .from('user_audio_clips')
        .select('*')
        .eq('user_id', userId);

      if (userClips && userClips.length > 0) {
        const intros = userClips.filter(c => c.clip_type === 'intro');
        const outros = userClips.filter(c => c.clip_type === 'outro');

        if (intros.length > 0) {
          const randomIntro = intros[Math.floor(Math.random() * intros.length)];
          introUrl = randomIntro.audio_url;
          introText = randomIntro.script_text;
        }

        if (outros.length > 0) {
          const randomOutro = outros[Math.floor(Math.random() * outros.length)];
          outroUrl = randomOutro.audio_url;
          outroText = randomOutro.script_text;
        }
      }
    }

    // If no user clips (Welcome page or user has no clips), use generic welcome clips
    if (!introUrl || !outroUrl) {
      const { data: welcomeClips } = await supabase
        .from('welcome_audio_clips')
        .select('*');

      if (welcomeClips && welcomeClips.length > 0) {
        if (!introUrl) {
          const intros = welcomeClips.filter(c => c.clip_type === 'intro');
          if (intros.length > 0) {
            const randomIntro = intros[Math.floor(Math.random() * intros.length)];
            introUrl = randomIntro.audio_url;
            introText = randomIntro.script_text;
          }
        }

        if (!outroUrl) {
          const outros = welcomeClips.filter(c => c.clip_type === 'outro');
          if (outros.length > 0) {
            const randomOutro = outros[Math.floor(Math.random() * outros.length)];
            outroUrl = randomOutro.audio_url;
            outroText = randomOutro.script_text;
          }
        }
      }
    }

    // 3. Return the playlist for sequential playback
    const playlist = [];
    
    if (introUrl) {
      playlist.push({
        type: 'intro',
        url: introUrl,
        text: introText
      });
    }

    playlist.push({
      type: 'news',
      url: newsBodyUrl,
      category,
      state: state || null
    });

    if (outroUrl) {
      playlist.push({
        type: 'outro',
        url: outroUrl,
        text: outroText
      });
    }

    return NextResponse.json({
      success: true,
      category,
      userId: userId || null,
      isPersonalized: !!userId,
      playlist,
      // Also return individual URLs for simple access
      urls: {
        intro: introUrl,
        news: newsBodyUrl,
        outro: outroUrl
      }
    });

  } catch (error) {
    console.error('[Audio Stitch] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get audio' },
      { status: 500 }
    );
  }
}
