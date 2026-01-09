// app/api/cron/generate-news/route.ts
// Cron endpoint for automatic news generation
// Configure in Vercel: cron: "0 6,18 * * *" (6 AM and 6 PM daily)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300; // 5 minute timeout

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow if no secret set (development) or if secret matches
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if auto_generate is enabled
    const { data: settings } = await supabase
      .from('news_settings')
      .select('auto_generate, morning_time, evening_time, timezone')
      .single();

    if (!settings?.auto_generate) {
      return NextResponse.json({
        success: false,
        message: 'Auto-generation is disabled in settings'
      });
    }

    // Determine which edition to generate based on current time
    const now = new Date();
    const timezone = settings.timezone || 'America/New_York';
    
    // Get current hour in the configured timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    });
    const currentHour = parseInt(formatter.format(now));

    // Parse configured times
    const morningHour = parseInt(settings.morning_time?.split(':')[0] || '6');
    const eveningHour = parseInt(settings.evening_time?.split(':')[0] || '18');

    // Determine edition (within 1 hour window of scheduled time)
    let edition: 'morning' | 'evening' | null = null;
    if (Math.abs(currentHour - morningHour) <= 1) {
      edition = 'morning';
    } else if (Math.abs(currentHour - eveningHour) <= 1) {
      edition = 'evening';
    }

    if (!edition) {
      return NextResponse.json({
        success: false,
        message: `Not a scheduled time. Current: ${currentHour}h, Morning: ${morningHour}h, Evening: ${eveningHour}h`
      });
    }

    // Call the main generate endpoint
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://drivetimetales.vercel.app';
    const response = await fetch(`${baseUrl}/api/admin/generate-news`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_PASSWORD || ''}`
      },
      body: JSON.stringify({ edition })
    });

    const result = await response.json();

    // Log the result
    console.log(`[Cron News] ${edition} edition generation result:`, result);

    return NextResponse.json({
      success: result.success,
      edition,
      result
    });

  } catch (error) {
    console.error('[Cron News] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron job failed' },
      { status: 500 }
    );
  }
}

// Also support POST for manual testing
export async function POST(request: NextRequest) {
  return GET(request);
}
