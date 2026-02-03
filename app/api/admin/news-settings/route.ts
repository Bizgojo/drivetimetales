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
    let query = supabase.from('news_settings').select('*');
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) {
      console.error('[Settings] Load error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ settings: data || [] });
  } catch (error) {
    console.error('[Settings] Error:', error);
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, narratorName, narrator_name, voiceId, voice_id, auto_generate, schedule_times, prompt_data, upsellScript, upsell_script, upsellAudioUrl, upsell_audio_url } = body;

    if (!category) return NextResponse.json({ error: 'Category required' }, { status: 400 });

    console.log(`[Settings] Saving ${category}`);

    const updateData: Record<string, unknown> = { category };
    if (narratorName !== undefined || narrator_name !== undefined) updateData.narrator_name = narratorName || narrator_name;
    if (voiceId !== undefined || voice_id !== undefined) updateData.voice_id = voiceId || voice_id;
    if (auto_generate !== undefined) updateData.auto_generate = auto_generate;
    if (schedule_times !== undefined) updateData.schedule_times = schedule_times;
    if (prompt_data !== undefined) updateData.prompt_data = prompt_data;
    if (upsellScript !== undefined || upsell_script !== undefined) updateData.upsell_script = upsellScript || upsell_script;
    if (upsellAudioUrl !== undefined || upsell_audio_url !== undefined) updateData.upsell_audio_url = upsellAudioUrl || upsell_audio_url;

    const { error } = await supabase.from('news_settings').upsert(updateData, { onConflict: 'category' });

    if (error) {
      console.error('[Settings] Save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Settings] Saved ${category}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Settings] Error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
