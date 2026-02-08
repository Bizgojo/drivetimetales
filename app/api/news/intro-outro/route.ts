import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getTimePeriod(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

// GET: Get a random intro and outro for a category
// Query params: category (required), personalized (optional, default false), firstName (optional)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'national';
    const isPersonalized = searchParams.get('personalized') === 'true';
    const firstName = searchParams.get('firstName') || '';
    const narratorName = searchParams.get('narratorName') || '';
    const timePeriod = getTimePeriod();

    // Get a random intro for this time period
    const templateCategory = isPersonalized ? 'personalized' : 'generic';
    
    const { data: intros } = await supabase
      .from('intro_outro_templates')
      .select('*')
      .eq('type', 'intro')
      .eq('category', templateCategory)
      .eq('time_period', timePeriod)
      .not('audio_url', 'is', null);

    const { data: outros } = await supabase
      .from('intro_outro_templates')
      .select('*')
      .eq('type', 'outro')
      .eq('category', templateCategory)
      .not('audio_url', 'is', null);

    // Pick random
    const intro = intros && intros.length > 0 ? intros[Math.floor(Math.random() * intros.length)] : null;
    const outro = outros && outros.length > 0 ? outros[Math.floor(Math.random() * outros.length)] : null;

    return NextResponse.json({
      success: true,
      intro: intro ? { id: intro.id, audioUrl: intro.audio_url, variation: intro.variation } : null,
      outro: outro ? { id: outro.id, audioUrl: outro.audio_url, variation: outro.variation } : null,
      timePeriod,
      category,
      personalized: isPersonalized,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
