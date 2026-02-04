import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('news_episodes')
      .select('id, category, state, audio_url, duration, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[News Episodes] Error:', error);
      return NextResponse.json({ episodes: [] });
    }

    return NextResponse.json({ episodes: data || [] });
  } catch (error) {
    console.error('[News Episodes] Error:', error);
    return NextResponse.json({ episodes: [] });
  }
}
