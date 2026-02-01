// app/api/cron/news-generation/route.ts
// DTT News Briefings - Auto-Generation Cron Job
// FRESH BUILD - February 2026
//
// This route is called by Vercel Cron at scheduled times
// It generates briefings for all categories and subscriber states
//
// Vercel cron config (add to vercel.json):
// {
//   "crons": [
//     {
//       "path": "/api/cron/news-generation",
//       "schedule": "0 6,12,18 * * *"
//     }
//   ]
// }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify cron secret (optional but recommended)
const CRON_SECRET = process.env.CRON_SECRET;

// Categories to generate (excluding state - handled separately)
const NON_STATE_CATEGORIES = ['national', 'world', 'business', 'sports', 'science'];

interface GenerationResult {
  category: string;
  state?: string;
  success: boolean;
  error?: string;
  duration?: string;
}

// Generate a single briefing
async function generateBriefing(
  category: string,
  state: string | null,
  narratorName: string,
  voiceId: string,
  targetDuration: string
): Promise<GenerationResult> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';

    const response = await fetch(`${baseUrl}/api/admin/generate-news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        state,
        narratorName,
        voiceId,
        targetDuration,
        isPersonalized: false // Cron generates generic versions
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      return {
        category,
        state: state || undefined,
        success: true,
        duration: data.episode?.duration
      };
    } else {
      return {
        category,
        state: state || undefined,
        success: false,
        error: data.error || 'Unknown error'
      };
    }
  } catch (error) {
    return {
      category,
      state: state || undefined,
      success: false,
      error: error instanceof Error ? error.message : 'Request failed'
    };
  }
}

// Get states that have active subscribers
async function getSubscriberStates(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('state')
      .not('state', 'is', null)
      .not('state', 'eq', '')
      .gt('credits', 0); // Only users with credits

    if (error) {
      console.error('[Cron] Failed to fetch subscriber states:', error);
      return [];
    }

    // Get unique states
    const states = [...new Set(data?.map(u => u.state).filter(Boolean))] as string[];
    console.log(`[Cron] Found ${states.length} states with subscribers:`, states);
    
    return states;
  } catch (error) {
    console.error('[Cron] Error fetching subscriber states:', error);
    return [];
  }
}

// Get settings for a category
async function getCategorySettings(category: string): Promise<{
  narratorName: string;
  voiceId: string;
  targetDuration: string;
} | null> {
  try {
    const { data, error } = await supabase
      .from('news_settings')
      .select('narrator_name, voice_id, target_duration')
      .eq('category', category)
      .single();

    if (error || !data) {
      console.error(`[Cron] No settings found for ${category}`);
      return null;
    }

    if (!data.narrator_name || !data.voice_id) {
      console.error(`[Cron] Incomplete settings for ${category}`);
      return null;
    }

    return {
      narratorName: data.narrator_name,
      voiceId: data.voice_id,
      targetDuration: data.target_duration || '3-5'
    };
  } catch (error) {
    console.error(`[Cron] Error fetching settings for ${category}:`, error);
    return null;
  }
}

// Check if auto-generation is enabled
async function isAutoGenerateEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('news_settings')
      .select('auto_generate')
      .limit(1)
      .single();

    if (error) {
      console.error('[Cron] Failed to check auto_generate setting:', error);
      return false;
    }

    return data?.auto_generate === true;
  } catch (error) {
    console.error('[Cron] Error checking auto_generate:', error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Cron] News generation triggered at', new Date().toISOString());

  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      console.error('[Cron] Invalid authorization');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Check if auto-generation is enabled
  const autoEnabled = await isAutoGenerateEnabled();
  if (!autoEnabled) {
    console.log('[Cron] Auto-generation is disabled, skipping');
    return NextResponse.json({
      success: true,
      message: 'Auto-generation is disabled',
      skipped: true
    });
  }

  const results: GenerationResult[] = [];
  let successCount = 0;
  let failCount = 0;

  // Generate non-state categories
  console.log('[Cron] Generating non-state categories...');
  for (const category of NON_STATE_CATEGORIES) {
    const settings = await getCategorySettings(category);
    
    if (!settings) {
      results.push({
        category,
        success: false,
        error: 'Missing settings'
      });
      failCount++;
      continue;
    }

    console.log(`[Cron] Generating ${category}...`);
    const result = await generateBriefing(
      category,
      null,
      settings.narratorName,
      settings.voiceId,
      settings.targetDuration
    );
    
    results.push(result);
    if (result.success) {
      successCount++;
      console.log(`[Cron] ✓ ${category} generated (${result.duration} min)`);
    } else {
      failCount++;
      console.error(`[Cron] ✗ ${category} failed: ${result.error}`);
    }

    // Small delay between generations to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Generate state news for subscriber states
  console.log('[Cron] Generating state news...');
  const stateSettings = await getCategorySettings('state');
  
  if (stateSettings) {
    const subscriberStates = await getSubscriberStates();
    
    for (const state of subscriberStates) {
      console.log(`[Cron] Generating state news for ${state}...`);
      const result = await generateBriefing(
        'state',
        state,
        stateSettings.narratorName,
        stateSettings.voiceId,
        stateSettings.targetDuration
      );
      
      results.push(result);
      if (result.success) {
        successCount++;
        console.log(`[Cron] ✓ ${state} state news generated (${result.duration} min)`);
      } else {
        failCount++;
        console.error(`[Cron] ✗ ${state} state news failed: ${result.error}`);
      }

      // Small delay between generations
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } else {
    console.log('[Cron] Skipping state news - no settings configured');
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[Cron] Complete in ${elapsed}s. Success: ${successCount}, Failed: ${failCount}`);

  return NextResponse.json({
    success: true,
    summary: {
      total: results.length,
      successful: successCount,
      failed: failCount,
      elapsedSeconds: elapsed
    },
    results
  });
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
