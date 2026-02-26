import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const state = searchParams.get('state');

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    console.log(`[Get Briefing] Fetching ${category}${state ? ` for ${state}` : ''}`);

    let query = supabase
      .from('news_episodes')
      .select('*')
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(1);

    if (category === 'state' && state) {
      query = query.eq('state', state);
    }

    const { data: episodes, error } = await query;

    if (error) {
      console.error('[Get Briefing] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!episodes || episodes.length === 0) {
      console.log(`[Get Briefing] No episode found for ${category}${state ? ` / ${state}` : ''}`);
      return NextResponse.json({ notFound: true, error: `No briefing available for ${category}${state ? ` (${state})` : ''}` }, { status: 404 });
    }

    const episode = episodes[0];
    console.log(`[Get Briefing] Found episode:`, episode.id);

    return NextResponse.json({
      success: true,
      episode: {
        id: episode.id,
        category: episode.category,
        state: episode.state,
        audioUrl: episode.audio_url,
        narratorName: episode.narrator_name,
        createdAt: episode.created_at,
        duration: episode.duration
      }
    });
  } catch (error) {
    console.error('[Get Briefing] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch briefing' }, { status: 500 });
  }
}
