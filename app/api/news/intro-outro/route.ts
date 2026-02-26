import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getTimePeriod(): 'morning' | 'afternoon' | 'evening' {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const hour = parseInt(formatter.format(new Date()), 10);
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

// GET: Get a random intro and outro for a news category
// Query params: 
//   category (required) - national, world, business, sports, science, state
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'national';
    const timePeriod = getTimePeriod();

    // Get all narrator_audio entries for this category
    const { data: audioRows } = await supabase
      .from('narrator_audio')
      .select('id, audio_url, template_id, narrator_name, voice_id, category')
      .eq('category', category);

    if (!audioRows || audioRows.length === 0) {
      return NextResponse.json({ success: true, intro: null, outro: null, message: 'No audio found for category' });
    }

    // Get template details to filter by type and time_period
    const templateIds = audioRows.map(a => a.template_id);
    const { data: templates } = await supabase
      .from('intro_outro_templates')
      .select('id, type, time_period, variation, is_personalized')
      .in('id', templateIds)
      .eq('is_personalized', false);

    if (!templates) {
      return NextResponse.json({ success: true, intro: null, outro: null, message: 'No templates found' });
    }

    // Build lookup: template_id -> template
    const templateMap = new Map(templates.map(t => [t.id, t]));

    // Split into intros (matching time period) and outros
    const intros = audioRows.filter(a => {
      const t = templateMap.get(a.template_id);
      return t && t.type === 'intro' && t.time_period === timePeriod;
    });

    const outros = audioRows.filter(a => {
      const t = templateMap.get(a.template_id);
      return t && t.type === 'outro';
    });

    // Pick random
    const intro = intros.length > 0 ? intros[Math.floor(Math.random() * intros.length)] : null;
    const outro = outros.length > 0 ? outros[Math.floor(Math.random() * outros.length)] : null;

    return NextResponse.json({
      success: true,
      intro: intro ? { 
        id: intro.id, 
        audioUrl: intro.audio_url, 
        narratorName: intro.narrator_name,
        variation: templateMap.get(intro.template_id)?.variation 
      } : null,
      outro: outro ? { 
        id: outro.id, 
        audioUrl: outro.audio_url, 
        narratorName: outro.narrator_name,
        variation: templateMap.get(outro.template_id)?.variation 
      } : null,
      timePeriod,
      category,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
