import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = ['national', 'world', 'business', 'sports', 'science'];

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { data: mainSettings } = await supabase.from('news_settings').select('*').eq('id', 'main').single();
    const settings = mainSettings?.settings || {};
    const isEnabled = settings?.schedule?.enabled || settings?.auto_generate || false;

    if (!isEnabled) {
      const { data: dttSettings } = await supabase.from('dtt_settings').select('*').eq('key', 'news_auto_generate').single();
      if (!dttSettings?.value) {
        return NextResponse.json({ success: true, message: 'Auto-generation disabled', debug: { mainSettings: mainSettings?.settings, hasMain: !!mainSettings }, generated: 0 });
      }
    }

    console.log('[Cron] Auto-generation enabled, starting...');
    const { data: allSettings } = await supabase.from('news_settings').select('*');
    const categoryMap: Record<string, any> = {};
    if (allSettings) { for (const row of allSettings) { categoryMap[row.id] = row; } }

    const results: Array<{ category: string; state?: string; success: boolean; error?: string }> = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    for (const categoryId of CATEGORIES) {
      const catRow = categoryMap[categoryId];
      const catSettings = catRow?.settings || {};
      const mainCatSettings = settings?.categories?.[categoryId] || {};
      const voiceId = catSettings.voice_id || mainCatSettings.voice_id;
      const narratorName = catSettings.narrator_name || mainCatSettings.narrator_name || 'Your Host';
      if (!voiceId) { console.log('[Cron] Skipping ' + categoryId + ' - no voice'); continue; }
      try {
        console.log('[Cron] Generating ' + categoryId + '...');
        const response = await fetch(baseUrl + '/api/admin/generate-news', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: categoryId, voiceId, narratorName, state: null, storiesCount: 5, listenerName: 'listener' })
        });
        results.push({ category: categoryId, success: response.ok, error: response.ok ? undefined : 'HTTP ' + response.status });
      } catch (err) { results.push({ category: categoryId, success: false, error: String(err) }); }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const stateRow = categoryMap['state'];
    const stateSettings = stateRow?.settings || {};
    const mainStateSettings = settings?.categories?.['state'] || {};
    const stateVoiceId = stateSettings.voice_id || mainStateSettings.voice_id;
    const stateNarrator = stateSettings.narrator_name || mainStateSettings.narrator_name || 'Your Host';
    if (stateVoiceId) {
      const { data: users } = await supabase.from('users').select('state').not('state', 'is', null).gt('credits', 0);
      const subscriberStates = Array.from(new Set((users || []).map((u: any) => u.state).filter(Boolean)));
      const selectedState = settings?.selected_state || 'South Carolina';
      if (!subscriberStates.includes(selectedState)) subscriberStates.push(selectedState);
      for (const state of subscriberStates) {
        try {
          const response = await fetch(baseUrl + '/api/admin/generate-news', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'state', voiceId: stateVoiceId, narratorName: stateNarrator, state, storiesCount: 5, listenerName: 'listener' })
          });
          results.push({ category: 'state', state, success: response.ok });
        } catch (err) { results.push({ category: 'state', state, success: false, error: String(err) }); }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    return NextResponse.json({ success: true, message: 'Generated ' + successCount + ' briefings', generated: successCount, total: results.length, elapsedSeconds: elapsed, results });
  } catch (error) {
    console.error('[Cron] Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return GET(request); }
