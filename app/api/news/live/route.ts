import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Get live news briefings for all categories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = supabase
      .from('news_episodes')
      .select('*')
      .eq('is_live', true)
      .order('created_at', { ascending: false });

    // If specific category requested
    if (category) {
      query = query.eq('category', category).limit(1);
    }

    const { data, error } = await query;

    if (error) throw error;

    // If requesting single category, return single object
    if (category) {
      return NextResponse.json({
        success: true,
        briefing: data?.[0] || null,
      });
    }

    // Otherwise, return all live briefings grouped by category
    const briefingsByCategory: Record<string, any> = {};
    for (const briefing of data || []) {
      if (!briefingsByCategory[briefing.category]) {
        briefingsByCategory[briefing.category] = briefing;
      }
    }

    return NextResponse.json({
      success: true,
      briefings: briefingsByCategory,
    });
  } catch (error) {
    console.error('[News Live] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
