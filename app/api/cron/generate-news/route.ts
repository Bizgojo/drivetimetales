import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = ['national', 'world', 'business', 'sports', 'science', 'state'];

function getCurrentET(): { hours: number; minutes: number; formatted: string } {
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
  const timePart = etString.split(', ')[1];
  const [hours, minutes] = timePart.split(':').map(Number);
  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { hours, minutes, formatted };
}

function isScheduledTime(scheduledTimes: string[], currentET: { hours: number; minutes: number }): { match: boolean; matchedTime: string | null } {
  const currentTotalMinutes = currentET.hours * 60 + currentET.minutes;
  for (const timeStr of scheduledTimes) {
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) continue;
    const scheduledTotalMinutes = h * 60 + m;
    const diff = currentTotalMinutes - scheduledTotalMinutes;
    if (diff >= 0 && diff < 15) {
      return { match: true, matchedTime: timeStr };
    }
  }
  return { match: false, matchedTime: null };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const currentET = getCurrentET();

  try {
    const { data: settingsData, error: settingsError } = await supabase
      .from('news_settings').select('*').eq('id', 'main').single();

    if (settingsError || !settingsData) {
      console.log('[Cron] No settings found');
      return NextResponse.json({ success: true, message: 'No settings found', generated: 0 });
    }

    const settings = settingsData.settings || {};

    if (!settings.schedule?.enabled && !settings.auto_generate) {
      console.log('[Cron] Auto-generation disabled');
      return NextResponse.json({ success: true, message: 'Auto-generation disabled', generated: 0 });
    }

    const scheduledTimes: string[] = settings.schedule?.times || ['06:00', '12:00', '18:00'];
    const timeCheck = isScheduledTime(scheduledTimes, currentET);

    if (!timeCheck.match) {
      console.log(`[Cron] Not a scheduled time. Current ET: ${currentET.formatted}, Scheduled: ${scheduledTimes.join(', ')}`);
      return NextResponse.json({ success: true, message: `Not a scheduled time. Current ET: ${currentET.formatted}`, scheduledTimes, generated: 0 });
    }

    console.log(`[Cron] Time match! Current ET: ${currentET.formatted}, Matched: ${timeCheck.matchedTime}`);

    const categories = settings.categories || {};
    const selectedState = settings.selected_state || 'South Carolina';
    const results: Array<{ category: string; state?: string; success: boolean; error?: string }> = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    for (const categoryId of CATEGORIES) {
      if (categoryId === 'state') continue;
      const catSettings = categories[categoryId];
      if (!catSettings?.voice_id) { console.log(`[Cron] Skipping ${categoryId} - no voice`); continue; }

      try {
        console.log(`[Cron] Generating ${categoryId}...`);
        const response = await fetch(baseUrl + '/api/admin/generate-news', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: categoryId, voiceId: catSettings.voice_id, narratorName: catSettings.narrator_name || 'Your Host', state: null, storiesCount: 5, listenerName: 'listener' })
        });
        results.push({ category: categoryId, success: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` });
        console.log(`[Cron] ${categoryId}: ${response.ok ? 'OK' : 'FAIL'}`);
      } catch (err) {
        results.push({ category: categoryId, success: false, error: String(err) });
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const stateSettings = categories['state'];
    if (stateSettings?.voice_id) {
      const { data: users } = await supabase.from('users').select('state').not('state', 'is', null).gt('credits', 0);
      const subscriberStates = Array.from(new Set((users || []).map((u: any) => u.state).filter(Boolean)));
      if (!subscriberStates.includes(selectedState)) subscriberStates.push(selectedState);

      for (const state of subscriberStates) {
        try {
          console.log(`[Cron] Generating state news for ${state}...`);
          const response = await fetch(baseUrl + '/api/admin/generate-news', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'state', voiceId: stateSettings.voice_id, narratorName: stateSettings.narrator_name || 'Your Host', state, storiesCount: 5, listenerName: 'listener' })
          });
          results.push({ category: 'state', state, success: response.ok });
        } catch (err) {
          results.push({ category: 'state', state, success: false, error: String(err) });
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Cron] Complete in ${elapsed}s. Success: ${successCount}/${results.length}`);

    return NextResponse.json({ success: true, message: `Generated ${successCount} briefings (matched: ${timeCheck.matchedTime} ET)`, currentTimeET: currentET.formatted, matchedSchedule: timeCheck.matchedTime, generated: successCount, total: results.length, elapsedSeconds: elapsed, results });
  } catch (error) {
    console.error('[Cron] Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { data: settingsData } = await supabase.from('news_settings').select('*').eq('id', 'main').single();
    const settings = settingsData?.settings || {};
    const categories = settings.categories || {};
    const selectedState = settings.selected_state || 'South Carolina';
    const results: Array<{ category: string; state?: string; success: boolean; error?: string }> = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drivetimetales.vercel.app';

    for (const categoryId of CATEGORIES) {
      if (categoryId === 'state') continue;
      const catSettings = categories[categoryId];
      if (!catSettings?.voice_id) continue;
      try {
        const response = await fetch(baseUrl + '/api/admin/generate-news', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: categoryId, voiceId: catSettings.voice_id, narratorName: catSettings.narrator_name || 'Your Host', state: null, storiesCount: 5, listenerName: 'listener' })
        });
        results.push({ category: categoryId, success: response.ok });
      } catch (err) {
        results.push({ category: categoryId, success: false, error: String(err) });
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const stateSettings = categories['state'];
    if (stateSettings?.voice_id) {
      const { data: users } = await supabase.from('users').select('state').not('state', 'is', null).gt('credits', 0);
      const subscriberStates = Array.from(new Set((users || []).map((u: any) => u.state).filter(Boolean)));
      if (!subscriberStates.includes(selectedState)) subscriberStates.push(selectedState);
      for (const state of subscriberStates) {
        try {
          const response = await fetch(baseUrl + '/api/admin/generate-news', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'state', voiceId: stateSettings.voice_id, narratorName: stateSettings.narrator_name || 'Your Host', state, storiesCount: 5, listenerName: 'listener' })
          });
          results.push({ category: 'state', state, success: response.ok });
        } catch (err) {
          results.push({ category: 'state', state, success: false, error: String(err) });
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    return NextResponse.json({ success: true, message: `Manually generated ${successCount} briefings`, generated: successCount, elapsedSeconds: elapsed, results });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
