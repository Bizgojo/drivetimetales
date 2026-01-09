// app/api/cron/news-scheduler/route.ts
// Cron job that runs hourly to generate news for timezones that hit scheduled times

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Timezones we support for news delivery
const SUPPORTED_TIMEZONES = [
  'America/New_York',
  'America/Chicago', 
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Australia/Perth',
];

// Get current hour in a timezone
function getCurrentHourInTimezone(timezone: string): number {
  const now = new Date();
  const timeString = now.toLocaleString('en-US', { 
    timeZone: timezone, 
    hour: 'numeric', 
    hour12: false 
  });
  return parseInt(timeString);
}

// Determine which edition based on hour
function getEditionForHour(hour: number, scheduledTimes: string[]): string | null {
  // Parse scheduled times (e.g., ['06:00', '12:00', '18:00'])
  const morningHour = parseInt(scheduledTimes[0]?.split(':')[0] || '6');
  const middayHour = parseInt(scheduledTimes[1]?.split(':')[0] || '12');
  const eveningHour = parseInt(scheduledTimes[2]?.split(':')[0] || '18');
  
  if (hour === morningHour) return 'morning';
  if (hour === middayHour) return 'midday';
  if (hour === eveningHour) return 'evening';
  
  return null;
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel cron jobs send this header)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[News Scheduler] Starting timezone-aware news check...');

    // Get news settings
    const { data: settings } = await supabase
      .from('news_settings')
      .select('*')
      .single();

    if (!settings?.auto_generate) {
      console.log('[News Scheduler] Auto-generate is disabled');
      return NextResponse.json({ 
        success: true, 
        message: 'Auto-generate disabled',
        generated: [] 
      });
    }

    const scheduledTimes = settings.generation_times || ['06:00', '12:00', '18:00'];
    const generated: string[] = [];

    // Check each timezone to see if it's time to generate
    for (const timezone of SUPPORTED_TIMEZONES) {
      const currentHour = getCurrentHourInTimezone(timezone);
      const edition = getEditionForHour(currentHour, scheduledTimes);
      
      if (edition) {
        console.log(`[News Scheduler] ${timezone} is at hour ${currentHour}, triggering ${edition} edition`);
        
        // Check if we already generated for this timezone/edition today
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase
          .from('news_delivery_queue')
          .select('id')
          .eq('timezone', timezone)
          .eq('edition', edition)
          .gte('created_at', today)
          .single();

        if (existing) {
          console.log(`[News Scheduler] Already generated ${edition} for ${timezone} today`);
          continue;
        }

        // Queue the generation
        const { data: queued, error: queueError } = await supabase
          .from('news_delivery_queue')
          .insert({
            category: 'all', // Generate all categories
            edition,
            timezone,
            scheduled_for: new Date().toISOString(),
            status: 'pending'
          })
          .select()
          .single();

        if (queueError) {
          console.error(`[News Scheduler] Queue error for ${timezone}:`, queueError);
          continue;
        }

        generated.push(`${timezone} - ${edition}`);
        
        // Trigger actual generation (call the generate API)
        try {
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://drivetimetales.vercel.app';
          const response = await fetch(`${baseUrl}/api/admin/generate-news`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              edition,
              timezone,
              forceRegenerate: false 
            })
          });

          const result = await response.json();
          
          // Update queue status
          await supabase
            .from('news_delivery_queue')
            .update({ 
              status: result.success ? 'completed' : 'failed',
              episode_id: result.episode?.id,
              processed_at: new Date().toISOString()
            })
            .eq('id', queued.id);

        } catch (genError) {
          console.error(`[News Scheduler] Generation error for ${timezone}:`, genError);
          await supabase
            .from('news_delivery_queue')
            .update({ status: 'failed', processed_at: new Date().toISOString() })
            .eq('id', queued.id);
        }
      }
    }

    console.log(`[News Scheduler] Completed. Generated: ${generated.length} briefings`);

    return NextResponse.json({
      success: true,
      checked: SUPPORTED_TIMEZONES.length,
      generated,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[News Scheduler] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scheduler failed' },
      { status: 500 }
    );
  }
}

// Also allow POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
