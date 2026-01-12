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

// Category configurations
const CATEGORY_CONFIG: Record<string, { label: string; searchInstructions: string }> = {
  local: { 
    label: 'Local News and Weather', 
    searchInstructions: '' // Built dynamically with location
  },
  national: { 
    label: 'National News', 
    searchInstructions: 'Search for the top 5 US national news stories from the last 24 hours. Focus on major stories from CNN, ABC, CBS, NBC, FOX, AP, Reuters, New York Times, Washington Post.'
  },
  international: { 
    label: 'International News', 
    searchInstructions: 'Search for the top 5 world/international news stories from the last 24 hours. Focus on major global events from BBC, Reuters, AP, Al Jazeera, and major international news sources.'
  },
  business: { 
    label: 'Business and Finance', 
    searchInstructions: 'Search for the top 5 business and finance news stories from the last 24 hours. Include stock market updates, major company news, economic indicators. Use Bloomberg, CNBC, Wall Street Journal, Financial Times.'
  },
  sports: { 
    label: 'Sports', 
    searchInstructions: 'Search for the top 5 sports news stories from the last 24 hours. Include major game results, trades, injuries, and upcoming events from ESPN, Sports Illustrated, and major sports news sources.'
  },
  science: { 
    label: 'Science and Technology', 
    searchInstructions: 'Search for the top 5 science and technology news stories from the last 24 hours. Include tech company news, scientific discoveries, space news, AI developments from TechCrunch, Wired, Ars Technica, Nature, Science.'
  },
};

function getCategoryLabel(categoryId: string): string {
  return CATEGORY_CONFIG[categoryId]?.label || categoryId;
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

// Generate news script using Claude with web search
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

  const narrator = narratorName || 'your host';
  const subscriber = subscriberName || '';
  const categoryLabel = getCategoryLabel(categoryId);

  let prompt = '';
  
  if (categoryId === 'local' && testCity) {
    const city = testCity.split(',')[0]?.trim() || testCity;
    const state = testCity.split(',')[1]?.trim() || 'North Carolina';
    
    prompt = 'You are ' + narrator + ', a professional news anchor. Create a 4-7 minute LOCAL news broadcast.\n\n' +
      'STEP 1 - WEATHER: Search for the current weather and 24-hour forecast for ' + city + ', ' + state + ' (zip code ' + zipCode + '). Write 4-5 sentences about the weather.\n\n' +
      'STEP 2 - LOCAL NEWS: Search for "' + city + ' ' + state + ' news today" and "' + city + ' local news". Find 3 stories happening IN or NEAR ' + city + ' (within 50 miles). These must be LOCAL stories - local crime, local government, local schools, local businesses, local events. NOT national news.\n\n' +
      'STEP 3 - STATE NEWS: Search for "' + state + ' news today". Find 3 news stories from the state of ' + state + '.\n\n' +
      'BROADCAST FORMAT:\n' +
      '- Opening: "Good ' + timeGreeting + (subscriber ? ' ' + subscriber : '') + ', this is ' + narrator + ' with your ' + categoryLabel + ' briefing."\n' +
      '- Weather section (4-5 sentences)\n' +
      '- Local news (3 stories, 3-5 sentences each) - always mention which town/city each story is in\n' +
      '- State news (3 stories, 3-5 sentences each)\n' +
      '- Closing: "That\'s your ' + categoryLabel + ' update. Thanks for listening' + (subscriber ? ', ' + subscriber : '') + ', and have a great ' + timeGreeting + '."\n\n' +
      'CRITICAL RULES:\n' +
      '- Use ONLY real, verified news from your web searches\n' +
      '- Do NOT make up or invent any stories\n' +
      '- Do NOT include national news in the local section\n' +
      '- Always say which town/city events are in or near\n' +
      '- Never use zip codes, only city names\n' +
      '- Do NOT explain your search methodology\n' +
      '- Write ONLY the broadcast script, nothing else';
  } else {
    prompt = 'You are ' + narrator + ', a professional news anchor. Create a 4-7 minute ' + categoryLabel + ' broadcast.\n\n' +
      'SEARCH INSTRUCTIONS: ' + config.searchInstructions + '\n\n' +
      'BROADCAST FORMAT:\n' +
      '- Opening: "Good ' + timeGreeting + (subscriber ? ' ' + subscriber : '') + ', this is ' + narrator + ' with your ' + categoryLabel + ' briefing."\n' +
      '- Cover 5 news stories (3-5 sentences each)\n' +
      '- Closing: "That\'s your ' + categoryLabel + ' update. Thanks for listening' + (subscriber ? ', ' + subscriber : '') + ', and have a great ' + timeGreeting + '."\n\n' +
      'CRITICAL RULES:\n' +
      '- Use ONLY real, verified news from your web searches\n' +
      '- Do NOT make up or invent any stories\n' +
      '- Do NOT explain your search methodology\n' +
      '- Write ONLY the broadcast script, nothing else';
  }

  console.log('[News Generator] Calling Claude with web search for ' + categoryId);

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const }],
    messages: [{ role: 'user', content: prompt }],
  });

  let script = '';
  for (const block of message.content) {
    if (block.type === 'text') {
      script += block.text;
    }
  }
  
  console.log('[News Generator] Script generated, length: ' + script.length);
  return script;
}

// Generate audio using ElevenLabs
async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  console.log('[News Generator] Calling ElevenLabs for voice ' + voiceId);
  
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
  
  console.log('[News Generator] Uploading to Supabase: ' + fileName);
  
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
    console.log('[News Generator] Narrator: ' + (narratorName || 'default') + ', Subscriber: ' + (subscriberName || 'none'));

    const episodeNumber = calculateEpisodeNumber();
    await deleteOldBriefings(categoryId);

    const script = await generateNewsScript(categoryId, subscriberName || null, narratorName || null, zipCode || null, testCity || null);

    const audioBuffer = await generateAudio(script, voiceId);

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
