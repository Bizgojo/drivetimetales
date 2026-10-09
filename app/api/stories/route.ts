import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// NOTE (servability-chase 2026-10-09): on Next 14, `force-dynamic` alone does
// NOT disable the fetch Data Cache used internally by supabase-js. Without
// this, the first response per query URL is cached for the life of the
// deployment (e.g. `?search=gnome` cached `[]` pre-publish and stayed stale
// after publish). `revalidate = 0` forces no-store fetches on this route.
export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const featured = searchParams.get('featured');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');

    let query = supabase
      .from('stories')
      .select('*')
      .eq('status', 'published')   // only show published stories
      .eq('is_hidden', false)      // only show visible stories
      .order('created_at', { ascending: false });

    if (category) {
      query = query.eq('genre', category);
    }

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,author.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    if (limit) {
      query = query.limit(parseInt(limit, 10));
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching stories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stories' },
      { status: 500 }
    );
  }
}
