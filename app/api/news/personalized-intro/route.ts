// app/api/news/personalized-intro/route.ts
// Returns cached personalized intro + outro for logged-in users
// First call: generates via ElevenLabs, caches to user_intro_cache
// Subsequent calls: returns cached audio URLs instantly

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getTimePeriod(): 'morning' | 'afternoon' | 'evening' {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const hour = parseInt(formatter.format(new Date()), 10);
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

const TIME_GREETINGS: Record<string, string> = {
  'morning': 'Good morning',
  'afternoon': 'Good afternoon',
  'evening': 'Good evening',
};

const CATEGORY_DISPLAY: Record<string, string> = {
  'state': 'state news', 'national': 'national news', 'world': 'world news',
  'business': 'business news', 'sports': 'sports news', 'science': 'science and tech news',
};

export async function POST(request: NextRequest) {
  try {
    const { userId, category, userName, stateName } = await request.json();

    if (!category || !userName) {
      return NextResponse.json({ error: 'category and userName required' }, { status: 400 });
    }

    const categoryDisplay = category === 'state' && stateName 
      ? `${stateName} news` 
      : (CATEGORY_DISPLAY[category] || 'news');

    // Get the narrator voice for this category from news_settings
    const { data: settings } = await supabase
      .from('news_settings')
      .select('voice_id, narrator_name')
      .eq('category', category)
      .single();

    const voiceId = settings?.voice_id;
    const narratorName = settings?.narrator_name || 'Your Host';

    if (!voiceId) {
      return NextResponse.json({ introUrl: null, outroUrl: null, message: 'No voice configured' });
    }

    // Check cache for existing intro + outro (not stale)
    if (userId) {
      const { data: cached } = await supabase
        .from('user_intro_cache')
        .select('type, audio_url')
        .eq('user_id', userId)
        .eq('category', category)
        .eq('voice_id', voiceId)
        .eq('is_stale', false);

      if (cached && cached.length >= 2) {
        const introCache = cached.find(c => c.type === 'intro');
        const outroCache = cached.find(c => c.type === 'outro');
        if (introCache && outroCache) {
          return NextResponse.json({
            success: true,
            introUrl: introCache.audio_url,
            outroUrl: outroCache.audio_url,
            cached: true,
            narratorName,
          });
        }
      }
    }

    // Not cached — generate personalized intro + outro
    const timePeriod = getTimePeriod();
    const timeGreeting = TIME_GREETINGS[timePeriod];

    // Pick a random personalized template for intro
    const { data: introTemplates } = await supabase
      .from('intro_outro_templates')
      .select('id, script_template, variation')
      .eq('type', 'intro')
      .eq('category', 'personalized')
      .eq('time_period', timePeriod);

    const { data: outroTemplates } = await supabase
      .from('intro_outro_templates')
      .select('id, script_template, variation')
      .eq('type', 'outro')
      .eq('category', 'personalized');

    if (!introTemplates?.length || !outroTemplates?.length) {
      return NextResponse.json({ introUrl: null, outroUrl: null, message: 'No personalized templates found' });
    }

    const introTemplate = introTemplates[Math.floor(Math.random() * introTemplates.length)];
    const outroTemplate = outroTemplates[Math.floor(Math.random() * outroTemplates.length)];

    // Fill in placeholders
    const introScript = introTemplate.script_template
      .replace(/\[time_greeting\]/g, timeGreeting)
      .replace(/\[first_name\]/g, userName)
      .replace(/\[narrator_name\]/g, narratorName)
      .replace(/\[category\]/g, categoryDisplay);

    const outroScript = outroTemplate.script_template
      .replace(/\[first_name\]/g, userName)
      .replace(/\[narrator_name\]/g, narratorName)
      .replace(/\[category\]/g, categoryDisplay);

    // Generate TTS for both
    let introUrl: string | null = null;
    let outroUrl: string | null = null;

    // Generate intro audio
    try {
      const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        },
        body: JSON.stringify({
          text: introScript,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.arrayBuffer();
        const safeUserName = userName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `intros/personalized/${category}_intro_${safeUserName}_${voiceId.slice(0, 8)}.mp3`;

        const { error: uploadError } = await supabase.storage
          .from('audio')
          .upload(fileName, Buffer.from(audioBuffer), { contentType: 'audio/mpeg', upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName);
          introUrl = urlData.publicUrl;
        }
      }
    } catch (err) {
      console.error('[Personalized] Intro TTS error:', err);
    }

    // Generate outro audio
    try {
      const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        },
        body: JSON.stringify({
          text: outroScript,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });

      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.arrayBuffer();
        const safeUserName = userName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `intros/personalized/${category}_outro_${safeUserName}_${voiceId.slice(0, 8)}.mp3`;

        const { error: uploadError } = await supabase.storage
          .from('audio')
          .upload(fileName, Buffer.from(audioBuffer), { contentType: 'audio/mpeg', upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName);
          outroUrl = urlData.publicUrl;
        }
      }
    } catch (err) {
      console.error('[Personalized] Outro TTS error:', err);
    }

    // Cache both if userId provided
    if (userId && introUrl) {
      await supabase.from('user_intro_cache').upsert({
        user_id: userId,
        category,
        type: 'intro',
        voice_id: voiceId,
        narrator_name: narratorName,
        audio_url: introUrl,
        is_stale: false,
      }, { onConflict: 'user_id,category,type,voice_id' });
    }

    if (userId && outroUrl) {
      await supabase.from('user_intro_cache').upsert({
        user_id: userId,
        category,
        type: 'outro',
        voice_id: voiceId,
        narrator_name: narratorName,
        audio_url: outroUrl,
        is_stale: false,
      }, { onConflict: 'user_id,category,type,voice_id' });
    }

    return NextResponse.json({
      success: true,
      introUrl,
      outroUrl,
      cached: false,
      narratorName,
    });

  } catch (error) {
    console.error('[Personalized] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
