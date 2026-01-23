import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const episodeId = searchParams.get('episodeId');
    if (!episodeId) return NextResponse.json({ error: 'episodeId required' }, { status: 400 });

    const { data: episode, error: episodeError } = await supabase.from('news_episodes').select('*').eq('id', episodeId).single();
    if (episodeError || !episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 });

    const isFree = episode.is_free || episode.category === 'preview';
    if (!isFree) return NextResponse.json({ error: 'This episode requires credits or subscription', requiresPayment: true }, { status: 403 });

    if (userId) {
      await supabase.from('news_access').insert({ user_id: userId, episode_id: episodeId, accessed_at: new Date().toISOString(), acquired_via: 'free' });
    }

    return NextResponse.json({ success: true, audioUrl: episode.audio_url, episode });
  } catch (error) {
    console.error('[No Credits Audio API] Error:', error);
    return NextResponse.json({ error: 'Failed to get audio' }, { status: 500 });
  }
}
