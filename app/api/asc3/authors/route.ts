/*
ASC3 Authors API
GET: List all authors, or get specific author by ?id=
POST: Create new author (admin only)
*/

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const authorId = searchParams.get('id');

    if (authorId) {
      // Get specific author with genres
      const { data: author, error: authorError } = await supabase
        .from('authors')
        .select('*')
        .eq('id', authorId)
        .single();

      if (authorError) throw authorError;

      const { data: genres, error: genresError } = await supabase
        .from('genre_authors')
        .select('genre_id, genres!inner(id, name), rank')
        .eq('author_id', authorId)
        .order('rank', { ascending: true });

      if (genresError) throw genresError;

      return NextResponse.json({
        success: true,
        data: { ...author, genres: genres || [] }
      });
    } else {
      // List all authors
      const { data, error } = await supabase
        .from('authors')
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
    console.error('Error fetching authors:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch authors' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { data, error } = await supabase
      .from('authors')
      .insert([{
        name: body.name,
        description: body.description,
        birth_year: body.birth_year,
        death_year: body.death_year,
        living: body.living,
        techniques: body.techniques,
        audio_adaptation: body.audio_adaptation
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error creating author:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create author' },
      { status: 500 }
    );
  }
}
