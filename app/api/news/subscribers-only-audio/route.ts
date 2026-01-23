import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const episodeId = searchParams.get('episodeId');
    if (!userId || !episodeId) return NextResponse.json({ error: 'userId and episodeId required' }, { status: 400 });

    const { data: user, error: userError } = await supabase.from('users').select('credits, subscription_status').eq('id', userId).single();
    if (userError || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const isSubscriber = user.subscription_status === 'active';
    if (!isSubscriber) return NextResponse.json({ error: 'Subscription required', requiresSubscription: true }, { status: 403 });

    const { data: episode, error: episodeError } = await supabase.from('news_episodes').select('*').eq('id', episodeId).single();
    if (episodeError || !episode) return NextResponse.json({ error: 'Episode not found' }, { status: 404 });

    await supabase.from('news_access').insert({ user_id: userId, episode_id: episodeId, accessed_at: new Date().toISOString(), acquired_via: 'subscription' });

    return NextResponse.json({ success: true, audioUrl: episode.audio_url, episode });
  } catch (error) {
    console.error('[Subscribers Audio API] Error:', error);
    return NextResponse.json({ error: 'Failed to get audio' }, { status: 500 });
  }
}
