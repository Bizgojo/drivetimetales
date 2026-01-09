// app/api/admin/generate-news/route.ts
// API endpoint to generate a new news episode

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchTopStories } from '@/lib/news-fetcher';
import { generateNewsScript, NewsScript } from '@/lib/news-script-generator';
import { generateNewsAudioChunked, ANCHOR_VOICES } from '@/lib/news-audio-generator';

// Initialize Supabase with service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300; // 5 minute timeout for long generation

interface GenerateNewsRequest {
  edition?: 'morning' | 'evening';
  forceRegenerate?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin access (simple check - enhance with proper auth)
    const authHeader = request.headers.get('authorization');
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (adminPassword && authHeader !== `Bearer ${adminPassword}`) {
      // For now, allow if no password set (development)
      if (adminPassword) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body: GenerateNewsRequest = await request.json().catch(() => ({}));
    
    // Determine edition based on time if not specified
    const now = new Date();
    const hour = now.getHours();
    const edition = body.edition || (hour < 12 ? 'morning' : 'evening');
    const today = now.toISOString().split('T')[0];

    console.log(`[News Generator] Starting ${edition} edition for ${today}`);

    // Check if episode already exists for today's edition
    if (!body.forceRegenerate) {
      const { data: existing } = await supabase
        .from('news_episodes')
        .select('id, status')
        .eq('edition_date', today)
        .eq('edition', edition)
        .single();

      if (existing && existing.status === 'published') {
        return NextResponse.json({
          success: false,
          message: `${edition} edition already published for ${today}. Use forceRegenerate to override.`,
          episodeId: existing.id
        });
      }
    }

    // Get settings
    const { data: settings } = await supabase
      .from('news_settings')
      .select('*')
      .single();

    const storiesPerSection = settings?.stories_per_section || 5;
    const anchorVoiceId = settings?.anchor_voice_id || ANCHOR_VOICES['Rachel'];
    const anthropicApiKey = settings?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    const elevenLabsApiKey = settings?.elevenlabs_api_key || process.env.ELEVENLABS_API_KEY;

    if (!anthropicApiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }
    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    // Create pending episode record
    const { data: episode, error: insertError } = await supabase
      .from('news_episodes')
      .upsert({
        edition_date: today,
        edition,
        title: `Daily Briefing - ${new Date().toLocaleDateString('en-US', { 
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
        })} ${edition === 'morning' ? 'AM' : 'PM'}`,
        status: 'generating',
        cover_url: '/images/news-cover.jpg' // Default cover
      }, {
        onConflict: 'edition_date,edition'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[News Generator] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create episode record' }, { status: 500 });
    }

    console.log(`[News Generator] Episode record created: ${episode.id}`);

    // Step 1: Fetch news stories
    console.log('[News Generator] Fetching stories from RSS feeds...');
    const stories = await fetchTopStories(storiesPerSection);
    
    console.log(`[News Generator] Fetched: ${stories.news.length} news, ${stories.science.length} science, ${stories.sports.length} sports`);

    // Step 2: Generate script using Claude
    console.log('[News Generator] Generating script with Claude API...');
    const script = await generateNewsScript(stories, edition, anthropicApiKey);
    
    console.log(`[News Generator] Script generated: ${script.estimatedDuration} mins estimated`);

    // Step 3: Generate audio using ElevenLabs
    console.log('[News Generator] Generating audio with ElevenLabs...');
    const audioResult = await generateNewsAudioChunked(
      script,
      elevenLabsApiKey,
      anchorVoiceId,
      (section, progress) => {
        console.log(`[News Generator] Audio progress: ${section} (${progress.toFixed(0)}%)`);
      }
    );

    console.log(`[News Generator] Audio generated: ${audioResult.durationSeconds}s, ${audioResult.charactersUsed} chars`);

    // Step 4: Upload audio to Supabase Storage
    const audioFileName = `news/${today}-${edition}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(audioFileName, audioResult.audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('[News Generator] Upload error:', uploadError);
      await supabase
        .from('news_episodes')
        .update({ status: 'failed', error_message: 'Audio upload failed' })
        .eq('id', episode.id);
      return NextResponse.json({ error: 'Failed to upload audio' }, { status: 500 });
    }

    // Get public URL for audio
    const { data: publicUrl } = supabase.storage
      .from('audio')
      .getPublicUrl(audioFileName);

    // Step 5: Update episode with all data and set as live
    const { error: updateError } = await supabase
      .from('news_episodes')
      .update({
        script_json: script,
        audio_url: publicUrl.publicUrl,
        duration_mins: Math.ceil(audioResult.durationSeconds / 60),
        news_sources: stories,
        status: 'published',
        error_message: null
      })
      .eq('id', episode.id);

    if (updateError) {
      console.error('[News Generator] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update episode' }, { status: 500 });
    }

    // Step 6: Set this episode as the live one (archive previous)
    await supabase.rpc('set_news_episode_live', { episode_uuid: episode.id });

    console.log(`[News Generator] ✅ Episode ${episode.id} published and set as LIVE`);

    return NextResponse.json({
      success: true,
      episode: {
        id: episode.id,
        title: script.title,
        edition,
        date: today,
        audioUrl: publicUrl.publicUrl,
        durationMins: Math.ceil(audioResult.durationSeconds / 60),
        storiesCount: {
          news: stories.news.length,
          science: stories.science.length,
          sports: stories.sports.length
        }
      }
    });

  } catch (error) {
    console.error('[News Generator] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const episodeId = searchParams.get('id');

  if (episodeId) {
    const { data: episode } = await supabase
      .from('news_episodes')
      .select('*')
      .eq('id', episodeId)
      .single();

    return NextResponse.json({ episode });
  }

  // Return current live episode
  const { data: liveEpisode } = await supabase
    .from('news_episodes')
    .select('*')
    .eq('is_live', true)
    .single();

  return NextResponse.json({ liveEpisode });
}
