/*
ASC3 Genre Authors API
GET: List top 5 authors for a specific genre
*/

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const genreId = params.id;

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
  } catch (error) {
    console.error('Error fetching genre authors:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch genre authors' },
      { status: 500 }
    );
  }
}
