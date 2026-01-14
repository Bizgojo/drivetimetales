// app/api/admin/generate-news/route.ts
// API endpoint to generate news episodes by category
// Uses Claude with web search to get REAL current news
// Updated: Personalized intros for logged-in users, varied announcer introductions

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

/**
 * Aggressively clean the script to remove ALL Claude thinking/preamble
 * The output should be ONLY the broadcast-ready script
 */
function cleanScript(rawScript: string): string {
  let script = rawScript;
  
  // Remove markdown code blocks
  script = script.replace(/```[\s\S]*?```/g, '');
  
  // Remove bold markers
  script = script.replace(/\*\*/g, '');
  
  // Remove italic markers
  script = script.replace(/\*([^*]+)\*/g, '$1');
  
  // Remove excessive newlines
  script = script.replace(/\n{3,}/g, '\n\n');
  
  // Remove common Claude preamble patterns
  const preamblePatterns = [
    /^[\s\S]*?(?=Good morning)/i,
    /^[\s\S]*?(?=Good afternoon)/i,
    /^[\s\S]*?(?=Good evening)/i,
    /I'll search[\s\S]*?(?=Good)/i,
    /Let me search[\s\S]*?(?=Good)/i,
    /I found[\s\S]*?(?=Good)/i,
    /Here's the[\s\S]*?(?=Good)/i,
    /Here is the[\s\S]*?(?=Good)/i,
    /Based on[\s\S]*?(?=Good)/i,
    /After searching[\s\S]*?(?=Good)/i,
    /I've searched[\s\S]*?(?=Good)/i,
    /Now I'll write[\s\S]*?(?=Good)/i,
  ];
  
  for (const pattern of preamblePatterns) {
    script = script.replace(pattern, '');
  }
  
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
  
  // Remove any trailing meta-commentary
  const endPatterns = [
    /\n\n---[\s\S]*$/,
    /\n\nNote:[\s\S]*$/i,
    /\n\nSources:[\s\S]*$/i,
    /\n\nThis script[\s\S]*$/i,
    /\n\nI hope[\s\S]*$/i,
    /\n\nLet me know[\s\S]*$/i,
  ];
  
  for (const pattern of endPatterns) {
    script = script.replace(pattern, '');
  }
  
  return script.trim();
}

async function generateStateNewsScript(
  state: string,
  apiKey: string,
  storiesCount: number,
  narratorName: string,
  userName: string | null
): Promise<{ script: string; title: string }> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  const greeting = getGreeting();
  const timeOfDay = getTimeOfDay();

  // Build personalized or generic greeting
  const userGreeting = userName 
    ? `${greeting}, ${userName}.`
    : `${greeting}, and welcome.`;
  
  // Build narrator intro (varied)
  const narratorIntro = narratorName 
    ? `I'm ${narratorName}, and this is your ${timeOfDay} news brief`
    : `This is your ${timeOfDay} news brief`;

  const prompt = `You are a professional radio news broadcaster for Drive Time Tales.

CRITICAL: Output ONLY the broadcast script. NO thinking, NO preamble, NO "I'll search" text. Start DIRECTLY with the greeting.

YOUR TASK:
1. Search for current ${state} news
2. Write a radio script with ${storiesCount} real stories
3. Vary your delivery style naturally - don't be robotic

EXACT OPENING FORMAT (start with this EXACTLY, then continue naturally):
"${userGreeting} ${narratorIntro} for the great state of ${state}. Today is ${dateStr}."

After the opening, continue with weather first, then other news stories. Use natural transitions like:
- "Let's start with your weather..."
- "Turning to the forecast..."
- "First up, your local weather..."

Then cover 4-5 more stories with varied transitions.

End with something like: "That's your ${state} update. Stay safe on the roads, and we'll see you next time on Drive Time Tales."

IMPORTANT: Start your response with "${greeting}" - nothing before it. Output ONLY the script.`;

  console.log(`[News Generator] Generating ${state} news script...`);
  console.log(`[News Generator] User: ${userName || 'anonymous'}, Narrator: ${narratorName || 'none'}`);

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
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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

  script = cleanScript(script);

  console.log(`[News Generator] State news script generated: ${script.length} chars`);
  console.log(`[News Generator] Script preview: ${script.substring(0, 250)}...`);
  
  return {
    script,
    title: `${state} News - ${dateStr}`
  };
}

async function generateScriptWithRealNews(
  category: string,
  apiKey: string,
  storiesCount: number = 5,
  narratorName: string = '',
  userName: string | null = null
): Promise<{ script: string; title: string }> {
  const categoryName = CATEGORY_NAMES[category] || category;
  const searchQuery = CATEGORY_SEARCH_QUERIES[category];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  const greeting = getGreeting();
  const timeOfDay = getTimeOfDay();

  // Build personalized or generic greeting
  const userGreeting = userName 
    ? `${greeting}, ${userName}.`
    : `${greeting}, and thanks for tuning in.`;
  
  // Build narrator intro (varied)
  const narratorIntro = narratorName 
    ? `I'm ${narratorName}, bringing you your ${categoryName.toLowerCase()} briefing`
    : `This is your ${categoryName.toLowerCase()} briefing`;

  const prompt = `You are a professional radio news broadcaster for Drive Time Tales.

CRITICAL: Output ONLY the broadcast script. NO thinking, NO preamble, NO "I'll search" text. Start DIRECTLY with the greeting.

YOUR TASK:
1. Search for: "${searchQuery}"
2. Write a radio script with ${storiesCount} real stories
3. Sound like a natural broadcaster - vary your delivery

EXACT OPENING FORMAT (start with this EXACTLY, then continue naturally):
"${userGreeting} ${narratorIntro} for ${dateStr}."

After the opening, deliver the news stories with natural transitions like:
- "Our top story today..."
- "Leading the news..."
- "We begin with..."
- "In other news..."
- "Meanwhile..."
- "Also making headlines..."
- "And finally..."

End with something like: "That's your ${categoryName.toLowerCase()} update. Stay safe out there, and we'll catch you next time on Drive Time Tales."

IMPORTANT: Start your response with "${greeting}" - nothing before it. Output ONLY the script.`;

  console.log(`[News Generator] Generating ${category} news script...`);
  console.log(`[News Generator] User: ${userName || 'anonymous'}, Narrator: ${narratorName || 'none'}`);

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
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
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

  script = cleanScript(script);

  console.log(`[News Generator] Script generated: ${script.length} chars`);
  console.log(`[News Generator] Script preview: ${script.substring(0, 250)}...`);
  
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
    const state = body.state || null;
    const storiesCount = body.storiesCount || 5;
    const userName = body.userName || null; // NEW: User's first name for personalization
    
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
    if (narratorName) console.log(`[News Generator] Narrator: ${narratorName}`);
    if (userName) console.log(`[News Generator] User: ${userName}`);

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
      scriptResult = await generateStateNewsScript(state, anthropicKey, storiesCount, narratorName, userName);
    } else {
      scriptResult = await generateScriptWithRealNews(category, anthropicKey, storiesCount, narratorName, userName);
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
    
    // Include userName in filename if personalized
    const userSlug = userName ? `-${userName.toLowerCase().replace(/\s+/g, '-')}` : '';
    const audioFileName = category === 'state' && state
      ? `news/state-${state.toLowerCase().replace(/\s+/g, '-')}${userSlug}-${dateStr}-${timeStr}.mp3`
      : `news/${category}${userSlug}-${dateStr}-${timeStr}.mp3`;

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
        is_live: !userName, // Only set as live for generic (non-personalized) episodes
        published_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('[News Generator] Database insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save episode' }, { status: 500 });
    }

    // Step 5: Set this as the live episode for this category (only for non-personalized)
    if (!userName) {
      await supabase
        .from('news_episodes')
        .update({ is_live: false })
        .eq('category', category)
        .neq('id', episode.id);
    }

    // Step 6: Update category settings with last_generated and audio_url (only for non-personalized)
    if (!userName) {
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
    }

    console.log(`[News Generator] ✅ SUCCESS: ${category} briefing published!`);
    console.log(`[News Generator] Episode ID: ${episode.id}`);
    console.log(`[News Generator] Audio URL: ${publicUrl.publicUrl}`);
    console.log(`[News Generator] Personalized: ${userName ? 'Yes' : 'No'}`);
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
        storiesCount,
        personalized: !!userName,
        scriptPreview: scriptResult.script.substring(0, 300)
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
