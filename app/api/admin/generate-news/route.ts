// app/api/admin/generate-news/route.ts
// API endpoint to generate news episodes by category
// Uses Claude with web search to get REAL current news from CNN, ABC, CBS, Fox, NBC

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300; // 5 minute timeout for long generation

const CATEGORY_NAMES: Record<string, string> = {
  national: 'National News',
  international: 'International News',
  business: 'Business & Finance',
  sports: 'Sports',
  science: 'Science & Technology',
};

const CATEGORY_SEARCH_QUERIES: Record<string, string> = {
  national: 'breaking news today US America CNN ABC CBS Fox NBC',
  international: 'world news today international global CNN ABC CBS Fox NBC',
  business: 'business news today stock market economy finance CNBC Bloomberg Fox Business',
  sports: 'sports news today NFL NBA MLB ESPN CBS Sports Fox Sports',
  science: 'science technology news today CNN NBC CBS Wired',
};

async function generateScriptWithRealNews(
  category: string,
  apiKey: string,
  storiesCount: number = 5
): Promise<{ script: string; title: string }> {
  const categoryName = CATEGORY_NAMES[category] || category;
  const searchQuery = CATEGORY_SEARCH_QUERIES[category];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  const edition = now.getHours() < 12 ? 'Morning' : 'Evening';

  const prompt = `You are a news researcher and radio script writer for Drive Time Tales, an audio platform for drivers.

YOUR TASK:
1. Search the web for: "${searchQuery}"
2. Find the ${storiesCount} biggest REAL news stories being covered RIGHT NOW by major news outlets
3. Write a radio news briefing script reporting these REAL stories

CRITICAL REQUIREMENTS:
- Search for and report ONLY real, actual news stories happening today
- Include real names, real places, real numbers from actual news coverage
- Do NOT make up or fabricate any news - only report what you find in your search
- Each story should be 2-3 sentences with specific factual details

SCRIPT FORMAT:
Start: "Good ${edition.toLowerCase()}, drivers. This is your ${categoryName} briefing for ${dateStr}..."

Then report the ${storiesCount} real news stories with transitions like:
- "Our top story..."
- "In other news..."
- "Meanwhile..."
- "Also making headlines today..."
- "And finally..."

End: "That's your ${categoryName} update. Stay safe out there, and we'll see you next time on Drive Time Tales."

Search for real news and write the script now:`;

  console.log(`[News Generator] Calling Claude API with web search for real ${category} news...`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search'
        }
      ],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[News Generator] Claude API error:', errorText);
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Extract text from response (may have multiple content blocks due to tool use)
  let script = '';
  for (const block of data.content) {
    if (block.type === 'text') {
      script += block.text;
    }
  }
  
  if (!script) {
    throw new Error('No script generated from Claude');
  }

  // Clean up the script - remove any markdown or extra formatting
  script = script
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\*\*/g, '') // Remove bold markers
    .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
    .trim();

  console.log(`[News Generator] Script generated with real news: ${script.length} chars`);
  
  return {
    script,
    title: `${categoryName} - ${dateStr} ${edition}`
  };
}

async function generateAudioWithElevenLabs(
  script: string,
  voiceId: string,
  apiKey: string
): Promise<{ audioBuffer: Buffer; durationSeconds: number }> {
  console.log(`[News Generator] Calling ElevenLabs API with voice ${voiceId}...`);
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[News Generator] ElevenLabs error:', error);
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  
  // Estimate duration: ~150 words per minute, ~5 characters per word
  const estimatedWords = script.length / 5;
  const durationSeconds = (estimatedWords / 150) * 60;
  
  console.log(`[News Generator] Audio generated: ${audioBuffer.length} bytes, ~${durationSeconds.toFixed(0)}s`);
  
  return { audioBuffer, durationSeconds };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const category = body.category || 'national';
    
    if (!CATEGORY_NAMES[category]) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    console.log(`[News Generator] ========================================`);
    console.log(`[News Generator] Starting ${category} briefing generation...`);

    // Get settings
    const { data: settings } = await supabase
      .from('news_settings')
      .select('*')
      .eq('id', 1)
      .single();

    const storiesPerCategory = settings?.stories_per_category || 5;
    const voiceId = settings?.narrator_voice_id || 'EXAVITQu4vr4xnSDxMaL';
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

    if (!anthropicKey) {
      console.error('[News Generator] Missing ANTHROPIC_API_KEY');
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }
    if (!elevenLabsKey) {
      console.error('[News Generator] Missing ELEVENLABS_API_KEY');
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    // Step 1: Generate script with real news from web search
    console.log(`[News Generator] Step 1: Searching for real ${category} news...`);
    const { script, title } = await generateScriptWithRealNews(category, anthropicKey, storiesPerCategory);

    // Step 2: Generate audio
    console.log('[News Generator] Step 2: Generating audio...');
    const { audioBuffer, durationSeconds } = await generateAudioWithElevenLabs(script, voiceId, elevenLabsKey);

    // Step 3: Upload to Supabase Storage
    console.log('[News Generator] Step 3: Uploading audio to storage...');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const edition = now.getHours() < 12 ? 'AM' : 'PM';
    const audioFileName = `news/${category}-${dateStr}-${edition}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(audioFileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('[News Generator] Upload error:', uploadError);
    }

    const { data: publicUrl } = supabase.storage
      .from('audio')
      .getPublicUrl(audioFileName);

    // Step 4: Create episode record
    console.log('[News Generator] Step 4: Saving episode to database...');
    const { data: episode, error: insertError } = await supabase
      .from('news_episodes')
      .insert({
        title,
        category,
        edition,
        script_text: script,
        audio_url: uploadError ? null : publicUrl.publicUrl,
        duration_mins: Math.ceil(durationSeconds / 60),
        is_live: true,
        published_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('[News Generator] Database insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save episode' }, { status: 500 });
    }

    // Step 5: Set this as the live episode for this category (unset others)
    await supabase
      .from('news_episodes')
      .update({ is_live: false })
      .eq('category', category)
      .neq('id', episode.id);

    console.log(`[News Generator] ✅ SUCCESS: ${category} briefing published!`);
    console.log(`[News Generator] Episode ID: ${episode.id}`);
    console.log(`[News Generator] Audio URL: ${publicUrl.publicUrl}`);
    console.log(`[News Generator] ========================================`);

    return NextResponse.json({
      success: true,
      episode: {
        id: episode.id,
        title,
        category,
        audioUrl: publicUrl.publicUrl,
        durationMins: Math.ceil(durationSeconds / 60),
        storiesCount: storiesPerCategory
      }
    });

  } catch (error) {
    console.error('[News Generator] ❌ ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check status or get live episodes
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  if (category) {
    const { data: episode } = await supabase
      .from('news_episodes')
      .select('*')
      .eq('category', category)
      .eq('is_live', true)
      .single();

    return NextResponse.json({ episode });
  }

  const { data: episodes } = await supabase
    .from('news_episodes')
    .select('*')
    .eq('is_live', true)
    .order('category');

  return NextResponse.json({ episodes });
}
