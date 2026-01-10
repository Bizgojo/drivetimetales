// app/api/news/archive/route.ts
// Get user's news archive (episodes they've listened to and own forever)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user } } = await supabase.auth.getUser(token);
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get all episodes this user has accessed
    const { data: accessRecords, error } = await supabase
      .from('news_access')
      .select(`
        id,
        accessed_at,
        acquired_via,
        episode:news_episodes (
          id,
          title,
          edition,
          edition_date,
          audio_url,
          cover_url,
          duration_mins,
          published_at
        )
      `)
      .eq('user_id', user.id)
      .order('accessed_at', { ascending: false });

    if (error) {
      console.error('[News Archive API] Error:', error);
      return NextResponse.json({ error: 'Failed to fetch archive' }, { status: 500 });
    }

    // Transform the data
    const episodes = accessRecords
      .filter(r => r.episode)
      .map(r => ({
        ...r.episode,
        accessedAt: r.accessed_at,
        acquiredVia: r.acquired_via
      }));

    return NextResponse.json({
      count: episodes.length,
      episodes
    });

  } catch (error) {
    console.error('[News Archive API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archive' },
      { status: 500 }
    );
  }
}
