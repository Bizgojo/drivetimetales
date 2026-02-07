import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Hardcoded voice/narrator config from admin panel
// Update these here if you change voices in the admin panel
const VOICE_CONFIG: Record<string, { narratorName: string; voiceId: string }> = {
  state: { narratorName: 'Sarah Mitchell', voiceId: '' },
  national: { narratorName: 'Bill Stevens', voiceId: '' },
  world: { narratorName: 'Edward Williams', voiceId: '' },
  business: { narratorName: 'Roger Clemons', voiceId: '' },
  sports: { narratorName: '', voiceId: '' },
  science: { narratorName: '', voiceId: '' },
};

const CATEGORIES = ['national', 'world', 'business', 'sports', 'science'];

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Step 1: Try to get voice IDs from the most recent news_episodes
    // This way we always use whatever voice was last used for each category
    const { data: recentEpisodes } = await supabase
      .from('news_episodes')
      .select('category, voice_id, narrator_name, state')
      .order('created_at', { ascending: false })
      .limit(50);

    // Build voice map from recent episodes (most recent wins)
    const voiceMap: Record<string, { voiceId: string; narratorName: string }> = {};
    if (recentEpisodes) {
      for (const ep of recentEpisodes) {
        const key = ep.state ? `state-${ep.state}` : ep.category;
        if (!voiceMap[key] && ep.voice_id) {
          voiceMap[key] = { voiceId: ep.voice_id, narratorName: ep.narrator_name || 'Your Host' };
        }
        // Also store by just category for fallback
        if (!voiceMap[ep.category] && ep.voice_id) {
          voiceMap[ep.category] = { voiceId: ep.voice_id, narratorName: ep.narrator_name || 'Your Host' };
        }
      }
    }

    // Also try settings table as fallback
    const { data: settingsRows } = await supabase.from('news_settings').select('*');
    let mainSettings: any = {};
    if (settingsRows) {
      for (const row of settingsRows) {
        if (row.id === '1' || row.id === 'main') {
          if (row.settings && Object.keys(row.settings).length > 0) {
            mainSettings = row.settings;
          }
        }
      }
    }

    // Check if auto-generate is enabled
    const isEnabled = mainSettings?.schedule?.enabled || mainSettings?.auto_generate || false;

    console.log(`[Cron] Auto-generate enabled: ${isEnabled}, Voice map entries: ${Object.keys(voiceMap).length}`);

    // For manual GET requests (testing), always run regardless of enabled flag
    const isManualTest = !request.headers.get('x-vercel-cron');
    
    if (!isEnabled && !isManualTest) {
      return NextResponse.json({ 
        success: true, 
        message: 'Auto-generation disabled (enable in admin panel)',
        voiceMapCategories: Object.keys(voiceMap),
        generated: 0 
      });
    }

    const results: Array<{ category: string; state?: string; success: boolean; error?: string }> = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    // Generate each category using voice from recent episodes
    for (const categoryId of CATEGORIES) {
      const voice = voiceMap[categoryId];
      const settingsVoice = mainSettings?.categories?.[categoryId];
      
      const voiceId = voice?.voiceId || settingsVoice?.voice_id;
      const narratorName = voice?.narratorName || settingsVoice?.narrator_name || 'Your Host';

      if (!voiceId) {
        console.log(`[Cron] Skipping ${categoryId} - no voice found in episodes or settings`);
        results.push({ category: categoryId, success: false, error: 'No voice configured' });
        continue;
      }

      try {
        console.log(`[Cron] Generating ${categoryId} with ${narratorName}...`);
        const response = await fetch(baseUrl + '/api/admin/generate-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: categoryId, voiceId, narratorName, state: null, storiesCount: 5, listenerName: 'listener' })
        });
        results.push({ category: categoryId, success: response.ok, error: response.ok ? undefined : 'HTTP ' + response.status });
        console.log(`[Cron] ${categoryId}: ${response.ok ? 'OK' : 'FAIL'}`);
      } catch (err) {
        results.push({ category: categoryId, success: false, error: String(err) });
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Generate state news
    const stateVoice = voiceMap['state'];
    const stateSettingsVoice = mainSettings?.categories?.['state'];
    const stateVoiceId = stateVoice?.voiceId || stateSettingsVoice?.voice_id;
    const stateNarrator = stateVoice?.narratorName || stateSettingsVoice?.narrator_name || 'Your Host';

    if (stateVoiceId) {
      const { data: users } = await supabase.from('users').select('state').not('state', 'is', null).gt('credits', 0);
      const subscriberStates = Array.from(new Set((users || []).map((u: any) => u.state).filter(Boolean)));
      if (!subscriberStates.includes('South Carolina')) subscriberStates.push('South Carolina');

      for (const state of subscriberStates) {
        try {
          console.log(`[Cron] Generating state news for ${state}...`);
          const response = await fetch(baseUrl + '/api/admin/generate-news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'state', voiceId: stateVoiceId, narratorName: stateNarrator, state, storiesCount: 5, listenerName: 'listener' })
          });
          results.push({ category: 'state', state, success: response.ok });
        } catch (err) {
          results.push({ category: 'state', state, success: false, error: String(err) });
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } else {
      console.log('[Cron] Skipping state news - no voice found');
    }

    const successCount = results.filter(r => r.success).length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    return NextResponse.json({ 
      success: true, 
      message: `Generated ${successCount} briefings`, 
      generated: successCount, 
      total: results.length, 
      elapsedSeconds: elapsed, 
      voicesFound: Object.keys(voiceMap),
      results 
    });
  } catch (error) {
    console.error('[Cron] Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return GET(request); }
