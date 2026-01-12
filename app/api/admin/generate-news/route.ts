import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const BING_API_KEY = process.env.BING_API_KEY!;
const BING_NEWS_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/news/search';

// Category configurations
const CATEGORY_CONFIG: Record<string, { label: string; searchQuery: string }> = {
  local: { label: 'Local News and Weather', searchQuery: '' },
  national: { label: 'National News', searchQuery: 'US news today' },
  international: { label: 'International News', searchQuery: 'world news today' },
  business: { label: 'Business and Finance', searchQuery: 'business finance stock market news' },
  sports: { label: 'Sports', searchQuery: 'sports news today' },
  science: { label: 'Science and Technology', searchQuery: 'technology science news today' },
};

function getCategoryLabel(categoryId: string): string {
  return CATEGORY_CONFIG[categoryId]?.label || categoryId;
}

// Fetch news from Bing News API
async function fetchBingNews(query: string, count: number = 5): Promise<any[]> {
  const params = new URLSearchParams({
    q: query,
    count: count.toString(),
    mkt: 'en-US',
    freshness: 'Day',
    textFormat: 'Raw',
  });

  const response = await fetch(BING_NEWS_ENDPOINT + '?' + params.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': BING_API_KEY },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Bing News] API error:', error);
    throw new Error('Bing News API error: ' + response.status);
  }

  const data = await response.json();
  return data.value || [];
}

// Calculate episode number
function calculateEpisodeNumber(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const hour = now.getHours();
  let episodeOfDay = 1;
  if (hour >= 12 && hour < 18) episodeOfDay = 2;
  else if (hour >= 18) episodeOfDay = 3;
  return (dayOfYear * 3) + episodeOfDay;
}

// Generate news script using Claude with real headlines from Bing
async function generateNewsScript(
  categoryId: string,
  subscriberName: string | null,
  narratorName: string | null,
  zipCode: string | null,
  testCity: string | null
): Promise<string> {
  const config = CATEGORY_CONFIG[categoryId];
  if (!config) throw new Error('Unknown category: ' + categoryId);

  const hour = new Date().getHours();
  let timeGreeting = 'morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'afternoon';
  else if (hour >= 17) timeGreeting = 'evening';

  let newsHeadlines: any[] = [];
  let stateNews: any[] = [];

  if (categoryId === 'local' && testCity) {
    const city = testCity.split(',')[0]?.trim() || testCity;
    const state = testCity.split(',')[1]?.trim() || 'North Carolina';
    console.log('[News Generator] Fetching local news for ' + city + ', ' + state);
    newsHeadlines = await fetchBingNews(city + ' ' + state + ' local news', 5);
    console.log('[News Generator] Fetching state news for ' + state);
    stateNews = await fetchBingNews(state + ' news today', 5);
  } else {
    console.log('[News Generator] Fetching ' + categoryId + ' news');
    newsHeadlines = await fetchBingNews(config.searchQuery, 7);
  }

  const formattedHeadlines = newsHeadlines.map((article, i) => 
    (i + 1) + '. "' + article.name + '" - ' + (article.description || 'No description') + ' (Source: ' + (article.provider?.[0]?.name || 'Unknown') + ')'
  ).join('\n');

  const formattedStateNews = stateNews.map((article, i) =>
    (i + 1) + '. "' + article.name + '" - ' + (article.description || 'No description') + ' (Source: ' + (article.provider?.[0]?.name || 'Unknown') + ')'
  ).join('\n');

  let prompt = '';
  const narrator = narratorName || 'a professional news anchor';
  const subscriber = subscriberName || 'the listener';
  const categoryLabel = getCategoryLabel(categoryId);
  
  if (categoryId === 'local' && testCity) {
    const city = testCity.split(',')[0]?.trim() || testCity;
    const state = testCity.split(',')[1]?.trim() || 'North Carolina';
    
    prompt = 'You are ' + narrator + ' delivering a 4-7 minute local news broadcast for ' + subscriber + '.\n\n' +
      'FIRST, search the web for the current weather forecast for ' + city + ', ' + state + ' (zip code ' + zipCode + ') and include a 4-5 sentence weather report.\n\n' +
      'Then use ONLY the following REAL news headlines to write the news portion. Do NOT make up any additional stories.\n\n' +
      'LOCAL NEWS FOR ' + city.toUpperCase() + ', ' + state.toUpperCase() + ' (within 50 miles):\n' +
      (formattedHeadlines || 'No local news found - mention this briefly and move to state news.') + '\n\n' +
      'STATE NEWS FOR ' + state.toUpperCase() + ':\n' +
      (formattedStateNews || 'No state news found.') + '\n\n' +
      'BROADCAST FORMAT:\n' +
      '1. Start with: "Good ' + timeGreeting + ' ' + (subscriberName || '') + ', this is ' + narrator + ' with your ' + categoryLabel + ' briefing."\n' +
      '2. Weather report (4-5 sentences) - search for current weather\n' +
      '3. Local news (3 stories, 3-5 sentences each)\n' +
      '4. State news (2-3 stories, 3-5 sentences each)\n' +
      '5. End with: "That\'s your ' + categoryLabel + ' update. Thanks for listening, ' + (subscriberName || '') + ', and have a great ' + timeGreeting + '."\n\n' +
      'RULES:\n' +
      '- Use ONLY the headlines provided above - do NOT invent stories\n' +
      '- Always mention the town/city name when describing local events\n' +
      '- Expand each headline into a natural spoken news story\n' +
      '- Be professional and warm\n' +
      '- Never mention "Bing" or that you got headlines from an API\n' +
      '- Never use zip codes in the broadcast, only city names';
  } else {
    prompt = 'You are ' + narrator + ' delivering a 4-7 minute ' + categoryLabel + ' broadcast for ' + subscriber + '.\n\n' +
      'Use ONLY the following REAL news headlines to write your broadcast. Do NOT make up any additional stories.\n\n' +
      categoryLabel.toUpperCase() + ' HEADLINES:\n' +
      (formattedHeadlines || 'No news found for this category.') + '\n\n' +
      'BROADCAST FORMAT:\n' +
      '1. Start with: "Good ' + timeGreeting + ' ' + (subscriberName || '') + ', this is ' + narrator + ' with your ' + categoryLabel + ' briefing."\n' +
      '2. Cover 5 stories (3-5 sentences each) from the headlines above\n' +
      '3. End with: "That\'s your ' + categoryLabel + ' update. Thanks for listening, ' + (subscriberName || '') + ', and have a great ' + timeGreeting + '."\n\n' +
      'RULES:\n' +
      '- Use ONLY the headlines provided above - do NOT invent stories\n' +
      '- Expand each headline into a natural spoken news story\n' +
      '- Be professional and warm\n' +
      '- Never mention "Bing" or that you got headlines from an API';
  }

  const toolsConfig = categoryId === 'local' ? [{ type: 'web_search_20250305' as const, name: 'web_search' as const }] : [];

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    tools: toolsConfig,
    messages: [{ role: 'user', content: prompt }],
  });

  let script = '';
  for (const block of message.content) {
    if (block.type === 'text') {
      script += block.text;
    }
  }
  return script;
}

// Generate audio using ElevenLabs
async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_monolingual_v1',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error('ElevenLabs API error: ' + error);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Upload audio to Supabase Storage
async function uploadAudio(audioBuffer: Buffer, categoryId: string, episodeNumber: number): Promise<string> {
  const fileName = 'news-' + categoryId + '-ep' + episodeNumber + '-' + Date.now() + '.mp3';
  
  const { error } = await supabase.storage
    .from('news-audio')
    .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('news-audio')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// Delete old briefings for this category
async function deleteOldBriefings(categoryId: string) {
  const { data: oldEpisodes } = await supabase
    .from('news_episodes')
    .select('id, audio_url')
    .eq('category', categoryId);

  if (oldEpisodes && oldEpisodes.length > 0) {
    for (const ep of oldEpisodes) {
      if (ep.audio_url) {
        const fileName = ep.audio_url.split('/').pop();
        if (fileName) {
          await supabase.storage.from('news-audio').remove([fileName]);
        }
      }
    }
    await supabase.from('news_episodes').delete().eq('category', categoryId);
  }
}

// POST - Generate a news briefing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryId, voiceId, subscriberName, narratorName, zipCode, testCity } = body;

    if (!categoryId || !voiceId) {
      return NextResponse.json({ success: false, error: 'Missing categoryId or voiceId' }, { status: 400 });
    }

    console.log('[News Generator] Starting generation for ' + categoryId);
    console.log('[News Generator] Location: ' + (testCity || 'N/A') + ', Zip: ' + (zipCode || 'N/A'));

    const episodeNumber = calculateEpisodeNumber();
    await deleteOldBriefings(categoryId);

    console.log('[News Generator] Fetching news from Bing and generating script...');
    const script = await generateNewsScript(categoryId, subscriberName || null, narratorName || null, zipCode || null, testCity || null);

    console.log('[News Generator] Generating audio with ElevenLabs voice ' + voiceId + '...');
    const audioBuffer = await generateAudio(script, voiceId);

    console.log('[News Generator] Uploading audio...');
    const audioUrl = await uploadAudio(audioBuffer, categoryId, episodeNumber);

    const { error: dbError } = await supabase
      .from('news_episodes')
      .insert({ 
        category: categoryId, 
        episode_number: episodeNumber, 
        script: script, 
        audio_url: audioUrl, 
        voice_id: voiceId, 
        is_live: true, 
        created_at: new Date().toISOString() 
      });

    if (dbError) throw dbError;

    console.log('[News Generator] Success! Episode ' + episodeNumber + ' for ' + categoryId);
    return NextResponse.json({ 
      success: true, 
      episodeNumber, 
      audioUrl, 
      message: getCategoryLabel(categoryId) + ' briefing generated successfully' 
    });
  } catch (error) {
    console.error('[News Generator] Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
