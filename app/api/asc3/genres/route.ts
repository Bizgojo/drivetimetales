/*
ASC3 Genres API
GET: List all genres, or get authors for a specific genre by ?id=
*/
export const dynamic = 'force-dynamic'

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const genreId = searchParams.get('id');

    if (genreId) {
      // Get authors for specific genre
      const { data, error } = await supabase
        .from('v_genre_authors')
        .select('*')
        .eq('genre_id', genreId)
        .order('rank', { ascending: true });

      if (error) throw error;

      return NextResponse.json({
        success: true,
        data: data || [],
        count: (data || []).length
      });
    } else {
      // List all genres
      const { data, error } = await supabase
        .from('genres')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      return NextResponse.json({
        success: true,
        data: data || [],
        count: (data || []).length
      });
    }
  } catch (error) {
    console.error('Error fetching genres:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch genres' },
      { status: 500 }
    );
  }
}
