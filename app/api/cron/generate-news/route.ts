import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// v4.0 - SIMPLIFIED CRON: Generate generic briefings
// Each category gets 1 body + 3 audio versions (morning/afternoon/evening)
// No personalization, no per-user intros
// ============================================================

const CATEGORIES = ['national', 'world', 'business', 'sports', 'science'];

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Step 1: Get voice/narrator config from news_settings
    const { data: settingsRows } = await supabase.from('news_settings').select('*');
    const voiceMap: Record<string, { voiceId: string; narratorName: string }> = {};

    if (settingsRows) {
      for (const row of settingsRows) {
        if (row.category && row.voice_id) {
          voiceMap[row.category] = { voiceId: row.voice_id, narratorName: row.narrator_name || 'Tammy' };
        }
      }
    }

    // Fallback: get from recent episodes
    if (Object.keys(voiceMap).length === 0) {
      const { data: recentEps } = await supabase
        .from('news_episodes')
        .select('category, voice_id, narrator_name')
        .order('created_at', { ascending: false })
        .limit(50);

      if (recentEps) {
        for (const ep of recentEps) {
          if (!voiceMap[ep.category] && ep.voice_id) {
            voiceMap[ep.category] = { voiceId: ep.voice_id, narratorName: ep.narrator_name || 'Tammy' };
          }
        }
      }
    }

    // Check if auto-generate is enabled
    const { data: globalRow } = await supabase
      .from('news_settings')
      .select('auto_generate')
      .eq('category', 'global')
      .single();
    const isEnabled = globalRow?.auto_generate || false;
    const isManualTest = !request.headers.get('x-vercel-cron');

    console.log(`[Cron v4] Auto-generate: ${isEnabled}, Voices: ${Object.keys(voiceMap).length}`);

    if (!isEnabled && !isManualTest) {
      return NextResponse.json({
        success: true,
        message: 'Auto-generation disabled',
        generated: 0,
      });
    }

    const results: Array<{ category: string; state?: string; success: boolean; versions?: number; error?: string }> = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    // Generate each category
    for (const categoryId of CATEGORIES) {
      const voice = voiceMap[categoryId];
      if (!voice?.voiceId) {
        console.log(`[Cron v4] Skipping ${categoryId} — no voice configured`);
        results.push({ category: categoryId, success: false, error: 'No voice configured' });
        continue;
      }

      try {
        console.log(`[Cron v4] Generating ${categoryId} with ${voice.narratorName}...`);
        const response = await fetch(baseUrl + '/api/admin/generate-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: categoryId,
            voiceId: voice.voiceId,
            narratorName: voice.narratorName,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          results.push({
            category: categoryId,
            success: true,
            versions: data.script?.metadata?.audioVersions || 0,
          });
        } else {
          results.push({ category: categoryId, success: false, error: `HTTP ${response.status}` });
        }
        console.log(`[Cron v4] ${categoryId}: ${response.ok ? 'OK' : 'FAIL'}`);
      } catch (err) {
        results.push({ category: categoryId, success: false, error: String(err) });
      }

      // Delay between categories to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Generate state news
    const stateVoice = voiceMap['state'];
    if (stateVoice?.voiceId) {
      const { data: users } = await supabase
        .from('users')
        .select('state')
        .not('state', 'is', null)
        .gt('credits', 0);

      const subscriberStates = Array.from(new Set((users || []).map((u: any) => u.state).filter(Boolean)));
      if (!subscriberStates.includes('South Carolina')) subscriberStates.push('South Carolina');

      for (const state of subscriberStates) {
        try {
          console.log(`[Cron v4] Generating state news: ${state}...`);
          const response = await fetch(baseUrl + '/api/admin/generate-news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: 'state',
              voiceId: stateVoice.voiceId,
              narratorName: stateVoice.narratorName,
              state,
            }),
          });
          const data = response.ok ? await response.json() : null;
          results.push({
            category: 'state',
            state,
            success: response.ok,
            versions: data?.script?.metadata?.audioVersions || 0,
          });
        } catch (err) {
          results.push({ category: 'state', state, success: false, error: String(err) });
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalVersions = results.reduce((sum, r) => sum + (r.versions || 0), 0);
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    return NextResponse.json({
      success: true,
      message: `Generated ${successCount} categories, ${totalVersions} audio versions`,
      generated: successCount,
      totalVersions,
      total: results.length,
      elapsedSeconds: elapsed,
      voicesFound: Object.keys(voiceMap),
      results,
    });
  } catch (error) {
    console.error('[Cron v4] Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return GET(request); }
