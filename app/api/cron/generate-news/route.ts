import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// This endpoint is called by a cron job (e.g., Vercel Cron or external service)
// It checks if automation is enabled and generates briefings at scheduled times

const CATEGORIES = ['local', 'national', 'international', 'business', 'sports', 'science'];

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Load settings
    const { data: settingsData } = await supabase
      .from('news_settings')
      .select('settings')
      .eq('id', 'main')
      .single();

    const settings = settingsData?.settings;

    // Check if automation is enabled
    if (!settings?.automate) {
      return NextResponse.json({
        success: true,
        message: 'Automation is disabled',
        generated: 0,
      });
    }

    // Check if current time matches any scheduled time
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    const schedule = settings.schedule || [];
    const shouldGenerate = schedule.some((slot: any) => {
      if (!slot.enabled) return false;
      const [scheduleHour, scheduleMinute] = slot.time.split(':').map(Number);
      // Allow 5 minute window for cron timing
      return scheduleHour === currentHour && Math.abs(scheduleMinute - currentMinute) <= 5;
    });

    if (!shouldGenerate) {
      return NextResponse.json({
        success: true,
        message: 'Not a scheduled generation time',
        currentTime: `${currentHour}:${currentMinute}`,
        generated: 0,
      });
    }

    // Generate briefings for all categories
    const results = [];
    const categories = settings.categories || [];

    for (const categoryId of CATEGORIES) {
      const categoryConfig = categories.find((c: any) => c.id === categoryId);
      const voiceId = categoryConfig?.voiceId || 'EXAVITQu4vr4xnSDxMaL';

      try {
        // Call the generate-news endpoint
        const baseUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : 'http://localhost:3000';

        const res = await fetch(`${baseUrl}/api/admin/generate-news`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId,
            voiceId,
            personalizeIntros: settings.personalizeIntros,
          }),
        });

        const data = await res.json();
        results.push({
          category: categoryId,
          success: data.success,
          episodeNumber: data.episodeNumber,
        });

        // Small delay between generations
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        results.push({
          category: categoryId,
          success: false,
          error: String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Scheduled generation complete',
      generated: results.filter(r => r.success).length,
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
