// app/api/cron/generate-news/route.ts
// Generates news body audio for all categories
// For state news: generates for ALL states that have subscribers

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NON_STATE_CATEGORIES = ['national', 'international', 'business', 'sports', 'science'];

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    const results: { category: string; state?: string; success: boolean; error?: string }[] = [];

    // 1. Generate non-state categories (national, international, business, sports, science)
    const nonStateToGenerate = NON_STATE_CATEGORIES.filter(catId => categories[catId]?.voice_id);
    
    console.log(`[Cron News] Generating ${nonStateToGenerate.length} non-state categories`);
    
    const nonStatePromises = nonStateToGenerate.map(categoryId => {
      const catSettings = categories[categoryId];
      return fetch(baseUrl + '/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: categoryId,
          voiceId: catSettings.voice_id,
          narratorName: catSettings.narrator_name || 'Your Host',
          state: null,
          storiesCount: 5,
          newsBodyOnly: true
        })
      }).then(r => ({ category: categoryId, success: r.ok }))
        .catch(err => ({ category: categoryId, success: false, error: String(err) }));
    });

    const nonStateResults = await Promise.all(nonStatePromises);
    results.push(...nonStateResults);

    // 2. Generate state news for ALL states with subscribers
    const stateSettings = categories['state'];
    if (stateSettings?.voice_id) {
      // Get all unique states from subscribers
      const { data: subscriberStates, error: statesError } = await supabase
        .from('User')
        .select('state')
        .not('state', 'is', null)
        .not('state', 'eq', '');

      if (statesError) {
        console.error('[Cron News] Error fetching subscriber states:', statesError);
      } else {
        // Get unique states
        const uniqueStates = [...new Set(subscriberStates?.map(u => u.state).filter(Boolean))] as string[];
        
        console.log(`[Cron News] Generating state news for ${uniqueStates.length} states:`, uniqueStates);

        // Generate news for each state
        const statePromises = uniqueStates.map(state => {
          return fetch(baseUrl + '/api/admin/generate-news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: 'state',
              voiceId: stateSettings.voice_id,
              narratorName: stateSettings.narrator_name || 'Your Host',
              state: state,
              storiesCount: 5,
              newsBodyOnly: true
            })
          }).then(r => ({ category: 'state', state, success: r.ok }))
            .catch(err => ({ category: 'state', state, success: false, error: String(err) }));
        });

        // Run state generations (could do in batches if too many)
        const stateResults = await Promise.all(statePromises);
        results.push(...stateResults);
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[Cron News] Complete: ${successCount}/${results.length} successful`);

    return NextResponse.json({
      success: true,
      message: 'Scheduled generation complete',
      generated: successCount,
      total: results.length,
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
