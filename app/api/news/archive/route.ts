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
    const category = searchParams.get('category');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    let query = supabase.from('news_access').select('*, episode:news_episodes(*)').eq('user_id', userId).order('accessed_at', { ascending: false });
    if (category) query = query.eq('episode.category', category);
    const { data: accessRecords, error } = await query.limit(50);
    if (error) throw error;

    const episodes = (accessRecords || []).filter(r => r.episode).map(r => ({ ...r.episode, accessedAt: r.accessed_at, acquiredVia: r.acquired_via }));
    return NextResponse.json({ success: true, count: episodes.length, episodes });
  } catch (error) {
    console.error('[News Archive API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch archive' }, { status: 500 });
  }
}
