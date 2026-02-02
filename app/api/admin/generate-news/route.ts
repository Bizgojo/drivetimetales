// app/api/admin/generate-news/route.ts
// DTT News Briefings - Generate News API
// February 2026

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';
const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY || '';

// 15 Intro options
const INTRO_OPTIONS = [
  "Good {timeOfDay}, {userName}! I'm {narratorName} with your {category} briefing for {date}.",
  "Hey {userName}! {narratorName} here with today's top {category} stories.",
  "Welcome, {userName}! Let's get you caught up on {category} news.",
  "{userName}, good {timeOfDay}! Here's what's happening in {category} news.",
  "It's {date}, and I'm {narratorName}. Let's dive into {category} news, {userName}.",
  "Good {timeOfDay}, {userName}! {narratorName} here with your {category} update.",
  "Hey there, {userName}! Ready for your {category} news? Let's go!",
  "{userName}, welcome! I'm {narratorName}, and here's your {category} briefing.",
  "Good {timeOfDay}! This is {narratorName} with {category} news for {userName}.",
  "Hi {userName}! Let's get into today's {category} headlines.",
  "{userName}, it's {narratorName}. Here's what you need to know in {category} news.",
  "Welcome to your {category} briefing, {userName}! I'm {narratorName}.",
  "Good {timeOfDay}, {userName}! Big stories in {category} news today.",
  "{userName}, {narratorName} here. Let's cover today's {category} news.",
  "Hey {userName}! It's {date}, and I'm {narratorName} with your {category} update."
];

// 15 Outro options
const OUTRO_OPTIONS = [
  "That's your {category} update, {userName}. Drive safe!",
  "I'm {narratorName}. Thanks for listening, {userName}. See you next time!",
  "That's the news, {userName}. Have a great {timeOfDay}!",
  "{userName}, stay informed and drive safe. This is {narratorName}.",
  "That wraps up {category} news. Thanks for tuning in, {userName}!",
  "I'm {narratorName}. Until next time, {userName}, take care!",
  "That's all for {category} news, {userName}. Safe travels!",
  "{userName}, thanks for listening. I'm {narratorName}. Drive safe!",
  "Your {category} briefing is complete. Have a great day, {userName}!",
  "That's the latest in {category} news. I'm {narratorName}. Stay safe!",
  "{userName}, keep listening to Drive Time Tales. See you soon!",
  "This is {narratorName} signing off. Enjoy your drive, {userName}!",
  "Thanks for joining me, {userName}. Until next time!",
  "That's your {category} update. I'm {narratorName}. Stay informed, {userName}!",
  "{userName}, have a great {timeOfDay}. This is {narratorName} for Drive Time Tales!"
];

// Content labels
const PRIORITY_LABELS: Record<string, string> = {
  breaking: 'Breaking News',
  government: 'Government/Political',
  economic: 'Economic/Financial',
  trending: 'Trending/Viral Stories',
  crime: 'Crime/Public Safety',
  international: 'International Affairs',
  weather: 'Weather/Natural Disasters'
};

const AVOID_LABELS: Record<string, string> = {
  fluff: 'Fluff/Soft News',
  celebrity: 'Celebrity News',
  lifestyle: 'Lifestyle Content',
  humanInterest: 'Human Interest Stories',
  feelGood: 'Feel-Good Stories',
  analysis: 'Extended Analysis/Opinion'
};

interface NewsStory {
  headline: string;
  summary: string;
  source: string;
  url?: string;
  fullContent?: string;
}

interface PromptData {
  targetDuration: string;
  storyCount: string;
  maxSecondsPerStory: string;
  focusAreas: string[];
  contentPriority: string[];
  contentAvoid: string[];
  newsSourcePriority: string;
  specialInstructions: string;
  customPrompt?: string;
}

const DEFAULT_PROMPT: PromptData = {
  targetDuration: '3',
  storyCount: '5',
  maxSecondsPerStory: '30',
  focusAreas: ['Major breaking news', 'Government actions', 'Economic updates'],
  contentPriority: ['breaking', 'government', 'economic', 'trending'],
  contentAvoid: ['fluff', 'celebrity', 'lifestyle'],
  newsSourcePriority: 'newsapi',
  specialInstructions: ''
};

// Get time of day
function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Get formatted date
function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

// Fetch from NewsAPI
async function fetchNewsAPI(category: string, count: number): Promise<NewsStory[]> {
  if (!NEWSAPI_KEY) {
    console.log('[NewsAPI] No API key, skipping');
    return [];
  }
  
  try {
    const categoryMap: Record<string, string> = {
      national: 'general',
      world: 'general',
      business: 'business',
      sports: 'sports',
      science: 'technology'
    };
    
    const newsCategory = categoryMap[category] || 'general';
    const country = category === 'world' ? '' : 'us';
    
    let url = `https://newsapi.org/v2/top-headlines?apiKey=${NEWSAPI_KEY}&pageSize=${count * 2}`;
    if (country) url += `&country=${country}`;
    if (newsCategory !== 'general') url += `&category=${newsCategory}`;
    
    console.log('[NewsAPI] Fetching:', category);
    
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      console.log('[NewsAPI] Error response:', response.status);
      return [];
    }
    
    const data = await response.json();
    const articles = data.articles || [];
    
    const stories: NewsStory[] = [];
    const seen = new Set<string>();
    
    for (const article of articles) {
      if (stories.length >= count) break;
      if (!article.title || article.title === '[Removed]') continue;
      
      const normalized = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      
      stories.push({
        headline: article.title,
        summary: article.description || '',
        source: article.source?.name || 'News',
        url: article.url
      });
    }
    
    console.log('[NewsAPI] Got', stories.length, 'stories');
    return stories;
  } catch (error) {
    console.error('[NewsAPI] Error:', error);
    return [];
  }
}

// Fetch from World News API
async function fetchWorldNewsAPI(category: string, count: number): Promise<NewsStory[]> {
  if (!WORLD_NEWS_API_KEY) {
    console.log('[WorldNews] No API key, skipping');
    return [];
  }
  
  try {
    let url = `https://api.worldnewsapi.com/search-news?api-key=${WORLD_NEWS_API_KEY}&language=en&number=${count * 2}`;
    
    if (category === 'national') {
      url += '&source-countries=us&text=United States OR America OR Congress OR President';
    } else if (category === 'world') {
      url += '&text=international OR global OR world leaders';
    } else if (category === 'business') {
      url += '&text=business OR economy OR market OR stock';
    } else if (category === 'sports') {
      url += '&text=NFL OR NBA OR MLB OR NHL OR sports';
    } else if (category === 'science') {
      url += '&text=science OR technology OR space OR NASA OR AI';
    }
    
    console.log('[WorldNews] Fetching:', category);
    
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const articles = data.news || [];
    
    const stories: NewsStory[] = [];
    const seen = new Set<string>();
    
    for (const article of articles) {
      if (stories.length >= count) break;
      if (!article.title) continue;
      
      const normalized = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      
      stories.push({
        headline: article.title,
        summary: article.text?.substring(0, 300) || '',
        source: article.source || 'News',
        url: article.url
      });
    }
    
    console.log('[WorldNews] Got', stories.length, 'stories');
    return stories;
  } catch (error) {
    console.error('[WorldNews] Error:', error);
    return [];
  }
}

// Fetch from GDELT (for state news)
async function fetchGDELT(state: string, count: number): Promise<NewsStory[]> {
  try {
    const query = `"${state}" sourcecountry:US sourcelang:english`;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=${count * 3}&format=json&sort=DateDesc&timespan=24h`;
    
    console.log('[GDELT] Fetching:', state);
    
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const articles = data.articles || [];
    
    const stories: NewsStory[] = [];
    const seen = new Set<string>();
    
    for (const article of articles) {
      if (stories.length >= count) break;
      if (!article.title) continue;
      
      const normalized = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      
      stories.push({
        headline: article.title,
        summary: '',
        source: article.source || 'News',
        url: article.url
      });
    }
    
    console.log('[GDELT] Got', stories.length, 'stories');
    return stories;
  } catch (error) {
    console.error('[GDELT] Error:', error);
    return [];
  }
}

// Fetch full article content (best effort, skip on timeout)
async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DriveTimeTales/1.0)' }
    });
    
    if (!response.ok) return '';
    
    const html = await response.text();
    
    // Basic extraction - get text from <p> tags
    const paragraphs = html.match(/<p[^>]*>([^<]+)<\/p>/gi) || [];
    const text = paragraphs
      .map(p => p.replace(/<[^>]+>/g, '').trim())
      .filter(p => p.length > 50)
      .slice(0, 3)
      .join(' ');
    
    return text.substring(0, 500);
  } catch {
    return '';
  }
}

// Build the prompt for Claude
function buildPrompt(
  stories: NewsStory[],
  category: string,
  state: string | null,
  narratorName: string,
  promptData: PromptData
): string {
  const timeOfDay = getTimeOfDay();
  const date = getFormattedDate();
  const categoryLabel = state || category.charAt(0).toUpperCase() + category.slice(1);
  
  // Randomly select intro and outro
  const randomIntro = INTRO_OPTIONS[Math.floor(Math.random() * INTRO_OPTIONS.length)];
  const randomOutro = OUTRO_OPTIONS[Math.floor(Math.random() * OUTRO_OPTIONS.length)];
  
  const introText = randomIntro
    .replace(/{narratorName}/g, narratorName)
    .replace(/{category}/g, categoryLabel)
    .replace(/{timeOfDay}/g, timeOfDay)
    .replace(/{date}/g, date)
    .replace(/{userName}/g, 'listeners');
  
  const outroText = randomOutro
    .replace(/{narratorName}/g, narratorName)
    .replace(/{category}/g, categoryLabel)
    .replace(/{timeOfDay}/g, timeOfDay)
    .replace(/{userName}/g, 'listeners');
  
  const priorityLabels = promptData.contentPriority
    .map(id => PRIORITY_LABELS[id])
    .filter(Boolean);
  
  const avoidLabels = promptData.contentAvoid
    .map(id => AVOID_LABELS[id])
    .filter(Boolean);
  
  const storiesList = stories.map((s, i) => {
    let entry = `${i + 1}. ${s.headline}`;
    if (s.summary) entry += ` - ${s.summary}`;
    if (s.fullContent) entry += ` [More: ${s.fullContent}]`;
    return entry;
  }).join('\n');

  // Use custom prompt if provided
  if (promptData.customPrompt) {
    return promptData.customPrompt
      .replace(/{narratorName}/g, narratorName)
      .replace(/{category}/g, categoryLabel)
      .replace(/{timeOfDay}/g, timeOfDay)
      .replace(/{date}/g, date)
      .replace(/{userName}/g, 'listeners');
  }

  return `You are ${narratorName}, a professional radio news broadcaster.
Create a ${promptData.targetDuration}-minute ${categoryLabel} news briefing.

TARGET: ${promptData.storyCount} stories, maximum ${promptData.maxSecondsPerStory} seconds each.
TOTAL WORD COUNT: approximately ${parseInt(promptData.targetDuration) * 150} words.

NEWS HEADLINES TO COVER:
${storiesList}

CONTENT PRIORITY (cover these types first):
${priorityLabels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

FOCUS AREAS (in order of importance):
${promptData.focusAreas.filter(a => a).map((a, i) => `${i + 1}. ${a}`).join('\n')}

CONTENT TO AVOID:
${avoidLabels.map(l => `- ${l}`).join('\n')}

RULES:
- Lead with the most important/breaking news story
- ${promptData.maxSecondsPerStory} seconds per story MAXIMUM
- Headlines and key facts only - NO deep analysis
- Keep it fast-paced like a radio news update
- NO fluff, lifestyle, or human interest unless directly relevant
- Move quickly between stories

${promptData.specialInstructions ? `SPECIAL INSTRUCTIONS:\n${promptData.specialInstructions}\n` : ''}
SCRIPT STRUCTURE:
1. OPENING (use exactly): "${introText}"
2. NEWS STORIES: Cover the top ${promptData.storyCount} stories quickly
3. CLOSING (use exactly): "${outroText}"

Write the complete script now. Output ONLY the spoken script, no stage directions or notes.`;
}

// Generate audio with ElevenLabs
async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  console.log('[Generate] Calling ElevenLabs, script length:', script.length);
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Generate] ElevenLabs error:', response.status, errorText);
    throw new Error(`ElevenLabs error: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log('[Generate] Audio generated, size:', buffer.byteLength);
  return buffer;
}

// Calculate duration from audio buffer (estimate)
function estimateDuration(buffer: Buffer): string {
  // ~16KB per second for MP3 at 128kbps
  const seconds = buffer.byteLength / 16000;
  const minutes = seconds / 60;
  return minutes.toFixed(1);
}

// Main handler
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { category, state } = body;
    
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    
    if (category === 'state' && !state) {
      return NextResponse.json({ error: 'State is required for state news' }, { status: 400 });
    }

    console.log(`[Generate] Starting: ${category}${state ? ` (${state})` : ''}`);

    // Get settings from database
    const { data: settingsData, error: settingsError } = await supabase
      .from('news_settings')
      .select('*')
      .eq('category', category)
      .single();

    if (settingsError || !settingsData) {
      console.error('[Generate] Settings error:', settingsError);
      return NextResponse.json({ error: 'Category not found in settings' }, { status: 400 });
    }

    if (!settingsData.narrator_name || !settingsData.voice_id) {
      return NextResponse.json({ 
        error: 'Please set narrator name and voice in Admin first.' 
      }, { status: 400 });
    }

    const narratorName = settingsData.narrator_name;
    const voiceId = settingsData.voice_id;
    const promptData: PromptData = { ...DEFAULT_PROMPT, ...(settingsData.prompt_data || {}) };
    const storyCount = parseInt(promptData.storyCount) || 5;

    // Fetch news
    let stories: NewsStory[] = [];
    
    if (category === 'state' && state) {
      // State news uses GDELT
      stories = await fetchGDELT(state, storyCount);
    } else {
      // Try NewsAPI first
      if (NEWSAPI_KEY) {
        stories = await fetchNewsAPI(category, storyCount);
      }
      
      // Fall back to World News API if needed
      if (stories.length < storyCount && WORLD_NEWS_API_KEY) {
        const backup = await fetchWorldNewsAPI(category, storyCount - stories.length);
        stories = [...stories, ...backup];
      }
      
      // Last resort: GDELT
      if (stories.length === 0) {
        stories = await fetchGDELT('United States', storyCount);
      }
    }

    if (stories.length === 0) {
      return NextResponse.json({ 
        error: 'Could not fetch news stories. Please try again.' 
      }, { status: 500 });
    }

    console.log('[Generate] Got', stories.length, 'stories');

    // Try to fetch full article content for top stories (best effort, don't block)
    console.log('[Generate] Fetching article content...');
    const contentPromises = stories.slice(0, 2).map(async (story, i) => {
      if (story.url) {
        const content = await fetchArticleContent(story.url);
        if (content) {
          stories[i].fullContent = content;
        }
      }
    });
    await Promise.all(contentPromises);

    // Build prompt and generate script with Claude
    const prompt = buildPrompt(stories, category, state || null, narratorName, promptData);
    
    console.log('[Generate] Calling Claude...');
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('[Generate] Claude error:', claudeResponse.status, errorText);
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    let script = '';
    for (const block of claudeData.content) {
      if (block.type === 'text') script += block.text;
    }
    script = script.replace(/```[\s\S]*?```/g, '').replace(/\*\*/g, '').trim();
    
    console.log('[Generate] Script generated, length:', script.length);

    // Generate audio
    console.log('[Generate] Generating audio...');
    const audioBuffer = await generateAudio(script, voiceId);
    const duration = estimateDuration(audioBuffer);

    // Upload to storage - CORRECT BUCKET: audio/news/
    const timestamp = Date.now();
    const fileName = state
      ? `state-${state.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.mp3`
      : `${category}-${timestamp}.mp3`;
    const filePath = `news/${fileName}`;

    console.log('[Generate] Uploading to:', filePath);

    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(filePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

    if (uploadError) {
      console.error('[Generate] Upload error:', uploadError);
      return NextResponse.json({ 
        error: 'Failed to upload audio: ' + uploadError.message 
      }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(filePath);
    const audioUrl = urlData.publicUrl;

    console.log('[Generate] Audio URL:', audioUrl);

    // Mark previous episodes as not live
    if (state) {
      await supabase
        .from('news_episodes')
        .update({ is_live: false })
        .eq('category', category)
        .eq('state', state);
    } else {
      await supabase
        .from('news_episodes')
        .update({ is_live: false })
        .eq('category', category)
        .is('state', null);
    }

    // Save new episode
    const { data: episode, error: insertError } = await supabase
      .from('news_episodes')
      .insert({
        category,
        state: state || null,
        audio_url: audioUrl,
        script_text: script,
        narrator_name: narratorName,
        voice_id: voiceId,
        duration,
        is_live: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Generate] Insert error:', insertError);
      return NextResponse.json({ 
        error: 'Failed to save episode: ' + insertError.message 
      }, { status: 500 });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Generate] Complete in ${elapsed}ms. Duration: ${duration} min`);

    return NextResponse.json({
      success: true,
      episode: {
        id: episode.id,
        category,
        state: state || null,
        audioUrl,
        duration,
        narratorName,
        createdAt: episode.created_at
      }
    });

  } catch (error) {
    console.error('[Generate] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Generation failed' 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', version: '3.1' });
}
