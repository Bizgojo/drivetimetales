// app/api/admin/news-settings/route.ts
// DTT News Briefings - Settings API
// Version 2.0 - February 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Load settings (optionally filtered by category)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = supabase.from('news_settings').select('*');
    
    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Settings API] Load error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settings: data || [] });
  } catch (error) {
    console.error('[Settings API] Error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// POST - Save settings for a category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, narrator_name, voice_id, auto_generate, schedule_times, prompt_data } = body;

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    console.log(`[Settings API] Saving ${category}`);

    // Build update object - only include fields that were provided
    const updateData: Record<string, unknown> = { category };
    
    if (narrator_name !== undefined) updateData.narrator_name = narrator_name;
    if (voice_id !== undefined) updateData.voice_id = voice_id;
    if (auto_generate !== undefined) updateData.auto_generate = auto_generate;
    if (schedule_times !== undefined) updateData.schedule_times = schedule_times;
    if (prompt_data !== undefined) updateData.prompt_data = prompt_data;

    const { error } = await supabase
      .from('news_settings')
      .upsert(updateData, { onConflict: 'category' });

    if (error) {
      console.error('[Settings API] Save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Settings API] Saved ${category} successfully`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Settings API] Error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
