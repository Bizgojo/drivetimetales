// app/api/news/briefing/route.ts
// DTT News Briefings - Get Briefing API
// FRESH BUILD - February 2026
//
// This route handles:
// 1. Fetching the latest live episode for a category
// 2. Returning audio URL for playback

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET handler - fetch latest briefing for a category
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const state = searchParams.get('state');

    // Validate category
    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    const validCategories = ['state', 'national', 'world', 'business', 'sports', 'science'];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // State is required for state category
    if (category === 'state' && !state) {
      return NextResponse.json(
        { error: 'State is required for state news' },
        { status: 400 }
      );
    }

    console.log(`[Get Briefing] Fetching: ${category}${state ? ` (${state})` : ''}`);

    // Build query
    let query = supabase
      .from('news_episodes')
      .select('*')
      .eq('category', category)
      .eq('is_live', true)
      .order('created_at', { ascending: false })
      .limit(1);

    // Add state filter if applicable
    if (category === 'state' && state) {
      query = query.eq('state', state);
    } else {
      query = query.is('state', null);
    }

    const { data: episodes, error } = await query;

    if (error) {
      console.error('[Get Briefing] Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch briefing' },
        { status: 500 }
      );
    }

    if (!episodes || episodes.length === 0) {
      console.log('[Get Briefing] No live episode found');
      return NextResponse.json(
        { error: 'No briefing available for this category', notFound: true },
        { status: 404 }
      );
    }

    const episode = episodes[0];
    console.log(`[Get Briefing] Found episode: ${episode.id}`);

    return NextResponse.json({
      success: true,
      episode: {
        id: episode.id,
        category: episode.category,
        state: episode.state,
        audioUrl: episode.audio_url,
        narratorName: episode.narrator_name,
        createdAt: episode.created_at
      }
    });

  } catch (error) {
    console.error('[Get Briefing] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch briefing' },
      { status: 500 }
    );
  }
}
