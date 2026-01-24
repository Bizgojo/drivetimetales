import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = ['national', 'international', 'business', 'sports', 'science', 'state'];

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settingsData } = await supabase.from('news_settings').select('*').eq('id', '1').single();
    const settings = settingsData?.settings || {};
    
    if (!settings.schedule?.enabled && !settings.auto_generate) {
      return NextResponse.json({ success: true, message: 'Auto-generation disabled', generated: 0 });
    }

    const categories = settings.categories || {};
    const selectedState = settings.selected_state || 'South Carolina';
    const results: Array<{ category: string; success: boolean; error?: string }> = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    for (const categoryId of CATEGORIES) {
      const catSettings = categories[categoryId];
      if (!catSettings?.voice_id) continue;

      try {
        const response = await fetch(baseUrl + '/api/admin/generate-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: categoryId,
            voiceId: catSettings.voice_id,
            narratorName: catSettings.narrator_name || 'Your Host',
            state: categoryId === 'state' ? selectedState : null,
            storiesCount: 5,
            listenerName: 'listener'
          })
        });
        results.push({ category: categoryId, success: response.ok });
      } catch (err) {
        results.push({ category: categoryId, success: false, error: String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Scheduled generation complete',
      generated: results.filter(r => r.success).length,
      results,
    });
  } catch (error) {
    console.error('[Cron News] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
