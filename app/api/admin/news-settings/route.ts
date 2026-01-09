// app/api/admin/news-settings/route.ts
// Admin API to manage news generation settings

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ANCHOR_VOICES } from '@/lib/news-audio-generator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Retrieve current settings
export async function GET(request: NextRequest) {
  try {
    const { data: settings, error } = await supabase
      .from('news_settings')
      .select('*')
      .single();

    if (error) {
      // Return default settings if none exist
      return NextResponse.json({
        settings: {
          morning_time: '06:00:00',
          evening_time: '18:00:00',
          timezone: 'America/New_York',
          auto_generate: false,
          stories_per_section: 5,
          target_duration_mins: 10,
          anchor_voice_id: ANCHOR_VOICES['Rachel'],
          anchor_voice_name: 'Rachel'
        },
        availableVoices: Object.keys(ANCHOR_VOICES)
      });
    }

    // Mask API keys in response
    const safeSettings = {
      ...settings,
      elevenlabs_api_key: settings.elevenlabs_api_key ? '••••••••' : null,
      anthropic_api_key: settings.anthropic_api_key ? '••••••••' : null
    };

    return NextResponse.json({
      settings: safeSettings,
      availableVoices: Object.keys(ANCHOR_VOICES)
    });

  } catch (error) {
    console.error('[News Settings API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PUT - Update settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Build update object (only include provided fields)
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    // Schedule settings
    if (body.morning_time) updates.morning_time = body.morning_time;
    if (body.evening_time) updates.evening_time = body.evening_time;
    if (body.timezone) updates.timezone = body.timezone;
    if (typeof body.auto_generate === 'boolean') updates.auto_generate = body.auto_generate;

    // Content settings
    if (body.stories_per_section) updates.stories_per_section = body.stories_per_section;
    if (body.target_duration_mins) updates.target_duration_mins = body.target_duration_mins;

    // Voice settings
    if (body.anchor_voice_name) {
      updates.anchor_voice_name = body.anchor_voice_name;
      updates.anchor_voice_id = ANCHOR_VOICES[body.anchor_voice_name as keyof typeof ANCHOR_VOICES];
    }

    // API keys (only update if not masked placeholder)
    if (body.elevenlabs_api_key && body.elevenlabs_api_key !== '••••••••') {
      updates.elevenlabs_api_key = body.elevenlabs_api_key;
    }
    if (body.anthropic_api_key && body.anthropic_api_key !== '••••••••') {
      updates.anthropic_api_key = body.anthropic_api_key;
    }

    const { data, error } = await supabase
      .from('news_settings')
      .update(updates)
      .eq('id', 1)
      .select()
      .single();

    if (error) {
      console.error('[News Settings API] Update error:', error);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }

    // Mask API keys in response
    const safeData = {
      ...data,
      elevenlabs_api_key: data.elevenlabs_api_key ? '••••••••' : null,
      anthropic_api_key: data.anthropic_api_key ? '••••••••' : null
    };

    return NextResponse.json({ 
      success: true, 
      settings: safeData 
    });

  } catch (error) {
    console.error('[News Settings API] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
