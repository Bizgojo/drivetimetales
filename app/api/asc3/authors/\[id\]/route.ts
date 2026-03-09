/*
ASC3 Authors API
GET: Get specific author details with genre associations
*/

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authorId = params.id;

    // Get author details
    const { data: author, error: authorError } = await supabase
      .from('authors')
      .select('*')
      .eq('id', authorId)
      .single();

    if (authorError) throw authorError;

    // Get genres this author is associated with
    const { data: genres, error: genresError } = await supabase
      .from('genre_authors')
      .select('genre_id, genres:genre_id(id, name), rank')
      .eq('author_id', authorId)
      .order('rank', { ascending: true });

    if (genresError) throw genresError;

    return NextResponse.json({
      success: true,
      data: {
        ...author,
        genres: genres || []
      }
    });
  } catch (error) {
    console.error('Error fetching author:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch author' },
      { status: 500 }
    );
  }
}
