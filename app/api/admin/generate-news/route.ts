// app/api/admin/generate-news/route.ts
// API endpoint to generate news episodes by category

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase with service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 300; // 5 minute timeout for long generation

// Category-specific RSS feeds
const CATEGORY_FEEDS: Record<string, string[]> = {
  national: [
    'https://feeds.npr.org/1001/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
  ],
  international: [
    'https://feeds.npr.org/1004/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  ],
  business: [
    'https://feeds.npr.org/1006/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  ],
  sports: [
    'https://www.espn.com/espn/rss/news',
    'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
  ],
  science: [
    'https://feeds.npr.org/1007/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  ],
};

const CATEGORY_NAMES: Record<string, string> = {
  national: 'National News',
  international: 'International News',
  business: 'Business & Finance',
  sports: 'Sports',
  science: 'Science & Technology',
};

interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
}

// Simple RSS parser
async function fetchRSSFeed(url: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(url, { 
      next: { revalidate: 0 },
      headers: { 'User-Agent': 'DriveTimeTales/1.0' }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch RSS: ${url} - ${response.status}`);
      return [];
    }
    
    const xml = await response.text();
    const items: NewsItem[] = [];
    
    // Simple XML parsing for RSS items
    const itemMatches = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
    
    for (const itemXml of itemMatches.slice(0, 10)) {
      const title = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
      const description = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim() || '';
      const link = itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
      const pubDate = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || '';
      
      if (title) {
        items.push({
          title: title.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
          description: description.replace(/<[^>]+>/g, '').substring(0, 300),
          link,
          pubDate,
          source: new URL(url).hostname
        });
      }
    }
    
    return items;
  } catch (error) {
    console.error(`Error fetching RSS ${url}:`, error);
    return [];
  }
}

async function fetchCategoryStories(category: string, maxStories: number = 5): Promise<NewsItem[]> {
  // Get custom feeds from settings or use defaults
  const { data: settings } = await supabase
    .from('news_settings')
    .select('categories')
    .eq('id', 1)
    .single();

  const feeds = settings?.categories?.[category]?.feeds || CATEGORY_FEEDS[category] || [];
  
  const allItems: NewsItem[] = [];
  
  for (const feedUrl of feeds) {
    const items = await fetchRSSFeed(feedUrl);
    allItems.push(...items);
  }
  
  // Deduplicate by title similarity and return top stories
  const seen = new Set<string>();
  const unique = allItems.filter(item => {
    const key = item.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  return unique.slice(0, maxStories);
}

async function generateScriptWithClaude(
  category: string,
  stories: NewsItem[],
  apiKey: string
): Promise<{ script: string; title: string }> {
  const categoryName = CATEGORY_NAMES[category] || category;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  const edition = now.getHours() < 12 ? 'Morning' : 'Evening';
  
  const storySummaries = stories.map((s, i) => 
    `${i + 1}. ${s.title}\n   ${s.description}`
  ).join('\n\n');

  const prompt = `You are a professional radio news anchor for Drive Time Tales, an audio platform for commuters and truckers.

Write a natural, engaging ${categoryName} briefing script for ${dateStr}, ${edition} Edition.

Here are the top ${stories.length} stories to cover:

${storySummaries}

Guidelines:
- Start with a brief intro: "Good ${edition.toLowerCase()}, drivers. This is your ${categoryName} briefing for ${dateStr}..."
- Cover each story in 2-3 sentences, conversational tone
- Use transitions between stories
- End with a brief outro: "That's your ${categoryName} update. Stay safe out there, and we'll see you next time on Drive Time Tales."
- Total length: approximately 3-4 minutes when read aloud
- Write ONLY the script text, no stage directions or notes

Write the script now:`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const script = data.content[0]?.text || '';
  
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
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  
  // Estimate duration: ~150 words per minute, ~5 characters per word
  const estimatedWords = script.length / 5;
  const durationSeconds = (estimatedWords / 150) * 60;
  
  return { audioBuffer, durationSeconds };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const category = body.category || 'national';
    
    if (!CATEGORY_NAMES[category]) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    console.log(`[News Generator] Starting ${category} briefing...`);

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
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }
    if (!elevenLabsKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    // Step 1: Fetch stories
    console.log(`[News Generator] Fetching ${category} stories...`);
    const stories = await fetchCategoryStories(category, storiesPerCategory);
    
    if (stories.length === 0) {
      return NextResponse.json({ error: 'No stories found for category' }, { status: 500 });
    }
    
    console.log(`[News Generator] Found ${stories.length} stories`);

    // Step 2: Generate script
    console.log('[News Generator] Generating script...');
    const { script, title } = await generateScriptWithClaude(category, stories, anthropicKey);
    console.log(`[News Generator] Script generated: ${script.length} chars`);

    // Step 3: Generate audio
    console.log('[News Generator] Generating audio...');
    const { audioBuffer, durationSeconds } = await generateAudioWithElevenLabs(script, voiceId, elevenLabsKey);
    console.log(`[News Generator] Audio generated: ${durationSeconds.toFixed(0)}s`);

    // Step 4: Upload to Supabase Storage
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
      // Continue without audio - save script only
    }

    const { data: publicUrl } = supabase.storage
      .from('audio')
      .getPublicUrl(audioFileName);

    // Step 5: Create episode record
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
      console.error('[News Generator] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save episode' }, { status: 500 });
    }

    // Step 6: Set this as the live episode for this category (unset others)
    await supabase
      .from('news_episodes')
      .update({ is_live: false })
      .eq('category', category)
      .neq('id', episode.id);

    console.log(`[News Generator] ✅ ${category} briefing published: ${episode.id}`);

    return NextResponse.json({
      success: true,
      episode: {
        id: episode.id,
        title,
        category,
        audioUrl: publicUrl.publicUrl,
        durationMins: Math.ceil(durationSeconds / 60),
        storiesCount: stories.length
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

// GET endpoint to check status or get live episodes
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  if (category) {
    // Get live episode for specific category
    const { data: episode } = await supabase
      .from('news_episodes')
      .select('*')
      .eq('category', category)
      .eq('is_live', true)
      .single();

    return NextResponse.json({ episode });
  }

  // Return all live episodes (one per category)
  const { data: episodes } = await supabase
    .from('news_episodes')
    .select('*')
    .eq('is_live', true)
    .order('category');

  return NextResponse.json({ episodes });
}
