// app/api/cron/generate-news/route.ts
// Generates news body audio only (no intro/outro)
// Intros/outros come from user_audio_clips or welcome_audio_clips tables

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    // Build list of categories to generate
    const toGenerate = CATEGORIES.filter(catId => categories[catId]?.voice_id);

    // Generate all in parallel
    const promises = toGenerate.map(categoryId => {
      const catSettings = categories[categoryId];
      return fetch(baseUrl + '/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryId,
          voiceId: catSettings.voice_id,
          narratorName: catSettings.narrator_name || 'Your Host',
          state: categoryId === 'state' ? selectedState : null,
          storiesCount: 5,
          newsBodyOnly: true  // NEW: Generate news body only, no intro/outro
        })
      }).then(r => ({ category: categoryId, success: r.ok }))
        .catch(err => ({ category: categoryId, success: false, error: String(err) }));
    });

    // Wait for all
    const results = await Promise.all(promises);

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
