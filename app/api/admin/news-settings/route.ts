import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase.from('news_settings').select('*').eq('id', '1').single();
    if (error && error.code !== 'PGRST116') throw error;
    return NextResponse.json({ success: true, settings: data?.settings || {}, test_state: data?.test_state || 'South Carolina', timezone: data?.timezone || 'America/New_York' });
  } catch (error) {
    console.error('[News Settings] GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { settings, test_state, timezone } = body;
    const { error } = await supabase.from('news_settings').upsert({ id: '1', settings: settings, test_state: test_state || 'South Carolina', timezone: timezone || 'America/New_York', updated_at: new Date().toISOString() });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[News Settings] POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save settings' }, { status: 500 });
  }
}
