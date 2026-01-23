import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settingsData } = await supabase.from('news_settings').select('*').eq('id', '1').single();
    const settings = settingsData?.settings || {};
    if (!settings.auto_generate) {
      return NextResponse.json({ success: true, message: 'Auto-generation is disabled', generated: 0 });
    }

    const categories = settings.categories || {};
    const enabledCategories = Object.entries(categories).filter(([_, cat]: [string, any]) => cat.enabled).map(([id]) => id);

    const { data: users } = await supabase.from('users').select('state').not('state', 'is', null);
    const states = Array.from(new Set(users?.map(u => u.state).filter(Boolean) || []));

    let generatedCount = 0;
    const errors: string[] = [];

    for (const categoryId of enabledCategories) {
      try {
        const catSettings = categories[categoryId] || {};
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/generate-news`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: categoryId, voiceId: catSettings.voice_id || '', narratorName: catSettings.narrator_name || 'Your Host', storiesCount: settings.stories_per_category || 5 })
        });
        generatedCount++;
      } catch (err) {
        errors.push(`Category ${categoryId}: ${err}`);
      }
    }

    const stateNews = settings.state_news || {};
    if (stateNews.enabled) {
      for (const state of states) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/generate-news`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'state', voiceId: stateNews.voice_id || '', narratorName: stateNews.narrator_name || 'Your Host', state, storiesCount: settings.stories_per_category || 5 })
          });
          generatedCount++;
        } catch (err) {
          errors.push(`State ${state}: ${err}`);
        }
      }
    }

    return NextResponse.json({ success: true, generated: generatedCount, categories: enabledCategories.length, states: states.length, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('[News Scheduler] Error:', error);
    return NextResponse.json({ error: 'Scheduler failed' }, { status: 500 });
  }
}
