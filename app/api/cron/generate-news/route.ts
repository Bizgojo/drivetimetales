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
    // Try both possible IDs - admin page saves as '1', table may have 'main'
    const { data: row1 } = await supabase.from('news_settings').select('*').eq('id', '1').single();
    const { data: rowMain } = await supabase.from('news_settings').select('*').eq('id', 'main').single();
    
    // Use whichever has settings
    const settingsRow = (row1?.settings && Object.keys(row1.settings).length > 0) ? row1 : rowMain;
    const settings = settingsRow?.settings || {};

    const isEnabled = settings?.schedule?.enabled || settings?.auto_generate || false;

    if (!isEnabled) {
      return NextResponse.json({ 
        success: true, 
        message: 'Auto-generation disabled', 
        debug: { 
          row1Settings: row1?.settings,
          mainSettings: rowMain?.settings,
          hasRow1: !!row1,
          hasMain: !!rowMain,
          settingsUsed: settingsRow?.id || 'none'
        },
        generated: 0 
      });
    }

    console.log('[Cron] Auto-generation enabled, starting...');
    const categories = settings.categories || {};
    const results: Array<{ category: string; state?: string; success: boolean; error?: string }> = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    for (const categoryId of CATEGORIES) {
      const catSettings = categories[categoryId] || {};
      const voiceId = catSettings.voice_id;
      const narratorName = catSettings.narrator_name || 'Your Host';
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

    // State news
    const stateSettings = categories['state'] || settings?.state_news || {};
    const stateVoiceId = stateSettings.voice_id;
    const stateNarrator = stateSettings.narrator_name || 'Your Host';
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
