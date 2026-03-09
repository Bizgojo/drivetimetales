/*
ASC3 Authors API
GET: List all authors
POST: Create new author (admin only)
*/

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
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
