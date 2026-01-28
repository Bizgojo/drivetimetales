import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { knowledge } = await request.json();

    const { error } = await supabaseAdmin
      .from('dtt_settings')
      .upsert({
        key: 'support_knowledge_base',
        value: knowledge,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      });

    if (error) {
      console.error('[Knowledge] Save error:', error);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Knowledge] Error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('dtt_settings')
      .select('value, updated_at')
      .eq('key', 'support_knowledge_base')
      .single();

    if (error) {
      return NextResponse.json({ knowledge: '', updated_at: null });
    }

    return NextResponse.json({ 
      knowledge: data?.value || '', 
      updated_at: data?.updated_at 
    });
  } catch (error) {
    return NextResponse.json({ knowledge: '', updated_at: null });
  }
}
