// app/api/news/personalized/route.ts
// Returns personalized news briefing by combining user's intro with main content
// For logged-in users: picks random personalized intro
// For non-logged-in users: picks random generic intro

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getTimeGreeting(): string {
  const estTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const hour = new Date(estTime).getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const category = searchParams.get('category');

    if (!category) {
      return NextResponse.json({ error: 'category parameter required' }, { status: 400 });
    }

    // Get the latest news episode for this category
    const { data: episode, error: episodeError } = await supabase
      .from('news_episodes')
      .select('id, audio_url, category, is_live, created_at')
      .eq('category', category)
      .eq('is_live', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (episodeError || !episode?.audio_url) {
      return NextResponse.json({ error: 'No episode found for this category' }, { status: 404 });
    }

    let introUrl: string | null = null;
    const greeting = getTimeGreeting();

    if (userId) {
      // Logged-in user: get personalized intro
      const { data: intros } = await supabase
        .from('user_news_intros')
        .select('audio_url, variation_number')
        .eq('user_id', userId)
        .eq('category', category);

      if (intros && intros.length > 0) {
        // Pick a random variation
        const randomIndex = Math.floor(Math.random() * intros.length);
        introUrl = intros[randomIndex].audio_url;
      }
    }

    if (!introUrl) {
      // Non-logged-in user or no personalized intros: use generic intro
      // Generic intros are stored as: intros/generic/{category}-{greeting}-{1-5}.mp3
      const variationNumber = Math.floor(Math.random() * 5) + 1;
      const genericFileName = `intros/generic/${category}-${greeting}-${variationNumber}.mp3`;
      
      const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(genericFileName);
      
      if (urlData?.publicUrl) {
        // Check if the file exists by trying to fetch headers
        try {
          const checkResponse = await fetch(urlData.publicUrl, { method: 'HEAD' });
          if (checkResponse.ok) {
            introUrl = urlData.publicUrl;
          }
        } catch {
          // File doesn't exist, continue without intro
        }
      }
    }

    // Return both URLs - frontend will handle sequential playback
    return NextResponse.json({
      success: true,
      category,
      episodeId: episode.id,
      introUrl,  // May be null if no intros generated yet
      contentUrl: episode.audio_url,
      hasPersonalizedIntro: !!userId && !!introUrl,
      greeting
    });

  } catch (error) {
    console.error('[Personalized News] Error:', error);
    return NextResponse.json({ error: 'Failed to get personalized news' }, { status: 500 });
  }
}
