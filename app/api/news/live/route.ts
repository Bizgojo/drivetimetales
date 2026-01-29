import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const state = searchParams.get('state');

    let query = supabase
      .from('news_episodes')
      .select('*')
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    if (state) {
      query = query.eq('state', state);
    }

    const { data, error } = await query.limit(20);

    if (error) {
      console.error('[News Live] Query error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (category) {
      const response = NextResponse.json({
        success: true,
        briefings: data,
      });
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      return response;
    }

    const briefingsByCategory: Record<string, any> = {};
    for (const briefing of data || []) {
      if (!briefingsByCategory[briefing.category]) {
        briefingsByCategory[briefing.category] = briefing;
      }
    }
    
    const response = NextResponse.json({
      success: true,
      briefings: briefingsByCategory,
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (error) {
    console.error('[News Live] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
