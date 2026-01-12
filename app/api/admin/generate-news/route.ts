import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Category configurations for news search
const CATEGORY_CONFIG: Record<string, { searchTerms: string[]; systemPrompt: string }> = {
  local: {
    searchTerms: ['local news', 'weather forecast'],
    systemPrompt: `You are a professional news anchor. Create a local news and weather briefing.
IMPORTANT: Start with the weather forecast, then cover local news.
Use real, verified news only. No speculation or made-up stories.
Format: Natural spoken news script, professional but warm.`,
  },
  national: {
    searchTerms: ['US news today', 'United States breaking news', 'American politics news'],
    systemPrompt: `You are a professional news anchor. Create a national US news briefing.
Cover the top 5 most important US news stories of the day.
Use real, verified news only. No speculation or made-up stories.
Format: Natural spoken news script, professional delivery.`,
  },
  international: {
    searchTerms: ['world news today', 'international news', 'global breaking news'],
    systemPrompt: `You are a professional news anchor. Create an international news briefing.
Cover the top 5 most important world news stories of the day.
Use real, verified news only. No speculation or made-up stories.
Format: Natural spoken news script, professional delivery.`,
  },
  business: {
    searchTerms: ['business news today', 'stock market news', 'economy news', 'corporate news'],
    systemPrompt: `You are a professional business news anchor. Create a business and finance briefing.
Cover: stock market movements, major corporate news, economic indicators.
Use real, verified news only. No speculation or made-up stories.
Format: Natural spoken news script, professional and informative.`,
  },
  sports: {
    searchTerms: ['sports news today', 'NFL news', 'NBA news', 'sports scores'],
    systemPrompt: `You are a professional sports anchor. Create a sports news briefing.
Cover the top 5 sports stories including scores, trades, and major events.
Use real, verified news only. No speculation or made-up stories.
Format: Natural spoken news script, energetic but professional.`,
  },
  science: {
    searchTerms: ['science news today', 'technology news', 'tech industry news', 'innovation news'],
    systemPrompt: `You are a professional science and technology correspondent. Create a science & tech briefing.
Cover the top 5 science and technology stories of the day.
Use real, verified news only. No speculation or made-up stories.
Format: Natural spoken news script, engaging and informative.`,
  },
};

// Calculate episode number (resets Jan 1 each year, 3 episodes per day)
function calculateEpisodeNumber(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const hour = now.getHours();
  
  // Determine which episode of the day (1, 2, or 3)
  let episodeOfDay = 1;
  if (hour >= 12 && hour < 18) episodeOfDay = 2;
  else if (hour >= 18) episodeOfDay = 3;
  
  return (dayOfYear * 3) + episodeOfDay;
}

// Generate news script using Claude
async function generateNewsScript(
  categoryId: string,
  subscriberName: string | null,
  episodeNumber: number,
  personalizeIntros: boolean,
  narratorName?: string,
  testCity?: string,
  zipCode?: string
): Promise<string> {
  const config = CATEGORY_CONFIG[categoryId];
  if (!config) throw new Error(`Unknown category: ${categoryId}`);

  // Determine greeting based on time of day
  const hour = new Date().getHours();
  let timeGreeting = 'morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'afternoon';
  else if (hour >= 17) timeGreeting = 'evening';

  // Build the intro
  let intro = '';
  if (personalizeIntros && subscriberName) {
    const intros = [
      `Good ${timeGreeting} ${subscriberName}, this is ${narratorName || "your host"} with your ${getCategoryLabel(categoryId)} briefing. Episode ${episodeNumber}.`,
      `Hello ${subscriberName}, ${narratorName || "I"} here with your ${timeGreeting} ${getCategoryLabel(categoryId)} update. This is episode ${episodeNumber}.`,
      `${subscriberName}, welcome! This is ${narratorName || "your correspondent"} bringing you ${getCategoryLabel(categoryId)}. Episode ${episodeNumber}.`,
    ];
    intro = intros[Math.floor(Math.random() * intros.length)];
  } else {
    intro = `Welcome to your ${timeGreeting} ${getCategoryLabel(categoryId)} briefing. This is episode ${episodeNumber}.`;
  }

  // Build the outro
  let outro = '';
  if (personalizeIntros && subscriberName) {
    const outros = [
      `That's your ${getCategoryLabel(categoryId)} briefing, ${subscriberName}. Have a great ${timeGreeting} and be careful out there.`,
      `That wraps up today's briefing. Stay informed, ${subscriberName}, and have a wonderful day.`,
      `Thanks for listening, ${subscriberName}. See you next time.`,
    ];
    outro = outros[Math.floor(Math.random() * outros.length)];
  } else {
    outro = `That concludes your ${getCategoryLabel(categoryId)} briefing. Thanks for listening.`;
  }

  // Use OpenAI for local news (better with locations), Claude for other categories
  let newsContent = '';

  if (categoryId === 'local' && testCity) {
    // Use OpenAI/ChatGPT for local news
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `I want a 4 to 7 minute news style audio broadcast by news anchor ${narratorName || 'your host'} especially for ${subscriberName || 'you'}.

Give me the 24-hour weather forecast for United States zip code ${zipCode} in 4 to 5 sentences. Do not include any other zip codes other than ${zipCode}.

Now give me the top 3 stories for local news as reported from searching the internet and major daily newspapers within a 50-mile radius of ${testCity} ${zipCode} for the last 24-hours.

Then give 3 to 5 sentences describing each of 3 top state news stories in the last 12 hours for the state of ${testCity.split(',')[1]?.trim() || 'North Carolina'} in the United States by searching the internet and major news outlets including CNN, ABC, CBS, NBC, FOX and Associated Press. Do not include any news for any other state except ${testCity.split(',')[1]?.trim() || 'North Carolina'} in the United States of America.

Write this as one 4 to 7 minute spoken news broadcast by ${narratorName || 'your host'} leaving out your methodology for gathering the information. Never use zip code in story only the name of the closest town to that zip code. Personalize this for "${subscriberName || 'the listener'}" the listener. When you describe a place or event in the story always say what town it is in or near. Expand local stories as much as state-wide stories.

CRITICAL VERIFICATION RULES:
- Use ONLY real, verified news from legitimate news outlets (CNN, ABC, CBS, NBC, FOX, Associated Press, local newspapers)
- Do NOT guess, hallucinate, or make up any news stories, names, places, or events
- Do NOT invent quotes or statistics
- If you cannot find verified news for an area, say "No major local news to report at this time" rather than making something up
- Every story must be based on actual reported news you found in your search
- Include the news source name when possible (e.g., "According to WLOS..." or "The Asheville Citizen-Times reports...")

${config.systemPrompt}`
        }
      ],
    });
    newsContent = completion.choices[0]?.message?.content || '';
  } else {
    // Use Claude for non-local categories
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      tools: [
        {
          type: 'web_search_20250305' as any,
          name: 'web_search',
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Search for today's top news stories using these terms: ${config.searchTerms.join(', ')}. 
Then write a professional news briefing script with exactly 5 stories.

${config.systemPrompt}`
        },
      ],
    });

    for (const block of message.content) {
      if (block.type === 'text') {
        newsContent += block.text;
      }
    }
  }

  // Combine intro + news + outro
  const fullScript = `${intro}\n\n${newsContent}\n\n${outro}`;
  
  return fullScript;
}

function getCategoryLabel(categoryId: string): string {
  const labels: Record<string, string> = {
    local: 'Local News and Weather',
    national: 'National News',
    international: 'International News',
    business: 'Business and Finance',
    sports: 'Sports',
    science: 'Science and Technology',
  };
  return labels[categoryId] || categoryId;
}

// Generate audio using ElevenLabs
async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Upload audio to Supabase Storage
async function uploadAudio(audioBuffer: Buffer, categoryId: string, episodeNumber: number): Promise<string> {
  const fileName = `news-${categoryId}-ep${episodeNumber}-${Date.now()}.mp3`;
  
  const { data, error } = await supabase.storage
    .from('news-audio')
    .upload(fileName, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('news-audio')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// Delete old briefings for this category
async function deleteOldBriefings(categoryId: string) {
  // Get old episodes
  const { data: oldEpisodes } = await supabase
    .from('news_episodes')
    .select('id, audio_url')
    .eq('category', categoryId);

  if (oldEpisodes && oldEpisodes.length > 0) {
    // Delete audio files from storage
    for (const ep of oldEpisodes) {
      if (ep.audio_url) {
        const fileName = ep.audio_url.split('/').pop();
        if (fileName) {
          await supabase.storage.from('news-audio').remove([fileName]);
        }
      }
    }

    // Delete database records
    await supabase
      .from('news_episodes')
      .delete()
      .eq('category', categoryId);
  }
}

// POST - Generate a news briefing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryId, voiceId, personalizeIntros, subscriberName, zipCode, narratorName, testCity } = body;

    if (!categoryId || !voiceId) {
      return NextResponse.json(
        { success: false, error: 'Missing categoryId or voiceId' },
        { status: 400 }
      );
    }

    console.log(`[News Generator] Starting generation for ${categoryId}`);

    // Calculate episode number
    const episodeNumber = calculateEpisodeNumber();

    // Delete old briefings for this category
    await deleteOldBriefings(categoryId);

    // Generate the news script
    console.log(`[News Generator] Generating script...`);
    const script = await generateNewsScript(
      categoryId,
      subscriberName || null,
      episodeNumber,
      personalizeIntros !== false,
      narratorName,
      testCity,
      zipCode
    );

    // Generate audio
    console.log(`[News Generator] Generating audio with voice ${voiceId}...`);
    const audioBuffer = await generateAudio(script, voiceId);

    // Upload audio
    console.log(`[News Generator] Uploading audio...`);
    const audioUrl = await uploadAudio(audioBuffer, categoryId, episodeNumber);

    // Save episode to database
    const { error: dbError } = await supabase
      .from('news_episodes')
      .insert({
        category: categoryId,
        episode_number: episodeNumber,
        script: script,
        audio_url: audioUrl,
        voice_id: voiceId,
        is_live: true,
        created_at: new Date().toISOString(),
      });

    if (dbError) throw dbError;

    console.log(`[News Generator] Success! Episode ${episodeNumber} for ${categoryId}`);

    return NextResponse.json({
      success: true,
      episodeNumber,
      audioUrl,
      message: `${getCategoryLabel(categoryId)} briefing generated successfully`,
    });
  } catch (error) {
    console.error('[News Generator] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
