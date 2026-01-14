// app/api/admin/generate-news/route.ts
// API endpoint to generate news episodes by category
// Uses Claude with web search to get REAL current news
// Updated: Added State News support
// Fixed: Removes Claude's thinking process from script

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300; // 5 minute timeout for long generation

const CATEGORY_NAMES: Record<string, string> = {
  state: 'State News',
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
  science: 'science technology news today CNN NBC CBS Wired TechCrunch',
};

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function getGreeting(): string {
  const timeOfDay = getTimeOfDay();
  return `Good ${timeOfDay}`;
}

// Clean script to remove Claude's thinking process
function cleanScript(rawScript: string): string {
  let script = rawScript;
  
  // Remove markdown code blocks
  script = script.replace(/```[\s\S]*?```/g, '');
  
  // Remove bold markers
  script = script.replace(/\*\*/g, '');
  
  // Remove excessive newlines
  script = script.replace(/\n{3,}/g, '\n\n');
  
  // Find where the actual script starts - look for greeting patterns
  const greetingPatterns = [
    /Good morning/i,
    /Good afternoon/i,
    /Good evening/i,
  ];
  
  let scriptStart = -1;
  for (const pattern of greetingPatterns) {
    const match = script.search(pattern);
    if (match !== -1 && (scriptStart === -1 || match < scriptStart)) {
      scriptStart = match;
    }
  }
  
  // If we found a greeting, strip everything before it
  if (scriptStart > 0) {
    script = script.substring(scriptStart);
    console.log(`[News Generator] Stripped ${scriptStart} chars of preamble`);
  }
  
  // Find where the script ends - look for sign-off
  const signOffPatterns = [
    /Drive Time Tales\.?\s*$/i,
    /see you next time on Drive Time Tales/i,
  ];
  
  for (const pattern of signOffPatterns) {
    const match = script.match(pattern);
    if (match && match.index !== undefined) {
      // Keep up to and including the sign-off
      script = script.substring(0, match.index + match[0].length);
      break;
    }
  }
  
  return script.trim();
}

async function generateStateNewsScript(
  state: string,
  apiKey: string,
  storiesCount: number,
  narratorName: string
): Promise<{ script: string; title: string }> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  const greeting = getGreeting();

  const prompt = `You are a news researcher and radio script writer for Drive Time Tales, an audio platform for drivers.

YOUR TASK:
1. Search the web for current news specifically about ${state} state
2. Find the ${storiesCount} biggest REAL news stories from ${state} covering these categories:
   - Weather conditions and forecasts for ${state}
   - Political news (state government, elections, legislation)
   - Crime and public safety
   - Sports (local teams, college sports)
   - Business and economy news specific to ${state}
3. Write a radio news briefing script reporting ONLY news from ${state} - no other states

CRITICAL REQUIREMENTS:
- Search for "${state} news today" and "${state} weather today"
- Report ONLY real, actual news stories from ${state}
- Include real names, real places, real numbers from actual news coverage
- Do NOT make up or fabricate any news - only report what you find
- Do NOT report news from other states
- Each story should be 2-3 sentences with specific factual details
- Start with weather, then cover 4-5 other stories from the categories above

IMPORTANT: Output ONLY the script text. Do NOT include any thinking, planning, or explanation. Start directly with the greeting.

SCRIPT FORMAT:
Start: "${greeting}${narratorName ? ', ' + narratorName : ''}, here is your latest news for the great state of ${state}. Today is ${dateStr}."

Then START WITH WEATHER: "Let's begin with your ${state} weather forecast..."

Then report ${storiesCount - 1} more real news stories with transitions like:
- "In political news from the state capitol..."
- "In crime news..."
- "On the sports front..."
- "In business news..."
- "Also making headlines in ${state}..."

End: "That's your ${state} news update. Stay safe out there, and we'll see you next time on Drive Time Tales."

Output the script now, starting with "${greeting}":`;

  console.log(`[News Generator] Calling Claude API with web search for ${state} news...`);

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
  
  let script = '';
  for (const block of data.content) {
    if (block.type === 'text') {
      script += block.text;
    }
  }
  
  if (!script) {
    throw new Error('No script generated from Claude');
  }

  // Clean the script to remove thinking process
  script = cleanScript(script);

  console.log(`[News Generator] State news script generated: ${script.length} chars`);
  
  return {
    script,
    title: `${state} News - ${dateStr}`
  };
}

async function generateScriptWithRealNews(
  category: string,
  apiKey: string,
  storiesCount: number = 5,
  narratorName: string = ''
): Promise<{ script: string; title: string }> {
  const categoryName = CATEGORY_NAMES[category] || category;
  const searchQuery = CATEGORY_SEARCH_QUERIES[category];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  const greeting = getGreeting();

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

IMPORTANT: Output ONLY the script text. Do NOT include any thinking, planning, or explanation. Start directly with the greeting.

SCRIPT FORMAT:
Start: "${greeting}${narratorName ? ' ' + narratorName : ''}, drivers. This is your ${categoryName} briefing for ${dateStr}..."

Then report the ${storiesCount} real news stories with transitions like:
- "Our top story..."
- "In other news..."
- "Meanwhile..."
- "Also making headlines today..."
- "And finally..."

End: "That's your ${categoryName} update. Stay safe out there, and we'll see you next time on Drive Time Tales."

Output the script now, starting with "${greeting}":`;

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
  
  let script = '';
  for (const block of data.content) {
    if (block.type === 'text') {
      script += block.text;
    }
  }
  
  if (!script) {
    throw new Error('No script generated from Claude');
  }

  // Clean the script to remove thinking process
  script = cleanScript(script);

  console.log(`[News Generator] Script generated with real news: ${script.length} chars`);
  
  return {
    script,
    title: `${categoryName} - ${dateStr}`
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
  
  const estimatedWords = script.length / 5;
  const durationSeconds = (estimatedWords / 150) * 60;
  
  console.log(`[News Generator] Audio generated: ${audioBuffer.length} bytes, ~${durationSeconds.toFixed(0)}s`);
  
  return { audioBuffer, durationSeconds };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const category = body.category || 'national';
    const voiceId = body.voiceId || 'EXAVITQu4vr4xnSDxMaL';
    const narratorName = body.narratorName || '';
    const state = body.state || null; // For state news
    const storiesCount = body.storiesCount || 5;
    
    // Validate category
    if (!CATEGORY_NAMES[category]) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    // For state news, state is required
    if (category === 'state' && !state) {
      return NextResponse.json({ error: 'State is required for state news' }, { status: 400 });
    }

    console.log(`[News Generator] ========================================`);
    console.log(`[News Generator] Starting ${category} briefing generation...`);
    if (state) console.log(`[News Generator] State: ${state}`);

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

    // Step 1: Generate script
    console.log(`[News Generator] Step 1: Generating script...`);
    let scriptResult: { script: string; title: string };
    
    if (category === 'state' && state) {
      scriptResult = await generateStateNewsScript(state, anthropicKey, storiesCount, narratorName);
    } else {
      scriptResult = await generateScriptWithRealNews(category, anthropicKey, storiesCount, narratorName);
    }

    // Step 2: Generate audio
    console.log('[News Generator] Step 2: Generating audio...');
    const { audioBuffer, durationSeconds } = await generateAudioWithElevenLabs(
      scriptResult.script, 
      voiceId, 
      elevenLabsKey
    );

    // Step 3: Upload to Supabase Storage
    console.log('[News Generator] Step 3: Uploading audio to storage...');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const audioFileName = category === 'state' && state
      ? `news/state-${state.toLowerCase().replace(/\s+/g, '-')}-${dateStr}-${timeStr}.mp3`
      : `news/${category}-${dateStr}-${timeStr}.mp3`;

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
    
    // Get current episode number for this category
    const { data: lastEpisode } = await supabase
      .from('news_episodes')
      .select('episode_number')
      .eq('category', category)
      .order('episode_number', { ascending: false })
      .limit(1)
      .single();
    
    const episodeNumber = (lastEpisode?.episode_number || 0) + 1;

    const { data: episode, error: insertError } = await supabase
      .from('news_episodes')
      .insert({
        title: scriptResult.title,
        category,
        state: state || null,
        episode_number: episodeNumber,
        script_text: scriptResult.script,
        audio_url: uploadError ? null : publicUrl.publicUrl,
        voice_id: voiceId,
        narrator_name: narratorName,
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

    // Step 6: Update category settings with last_generated and audio_url
    const { data: currentSettings } = await supabase
      .from('news_settings')
      .select('categories')
      .eq('id', 1)
      .single();

    if (currentSettings) {
      const updatedCategories = {
        ...currentSettings.categories,
        [category]: {
          ...currentSettings.categories?.[category],
          last_generated: new Date().toISOString(),
          episode_number: episodeNumber,
          audio_url: publicUrl.publicUrl
        }
      };

      await supabase
        .from('news_settings')
        .update({ categories: updatedCategories })
        .eq('id', 1);
    }

    console.log(`[News Generator] ✅ SUCCESS: ${category} briefing published!`);
    console.log(`[News Generator] Episode ID: ${episode.id}`);
    console.log(`[News Generator] Audio URL: ${publicUrl.publicUrl}`);
    console.log(`[News Generator] ========================================`);

    return NextResponse.json({
      success: true,
      episode: {
        id: episode.id,
        title: scriptResult.title,
        category,
        state,
        episodeNumber,
        audioUrl: publicUrl.publicUrl,
        durationMins: Math.ceil(durationSeconds / 60),
        storiesCount
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
