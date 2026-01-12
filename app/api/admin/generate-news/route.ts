import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Category configurations
const CATEGORY_CONFIG: Record<string, { label: string; prompt: string }> = {
  local: {
    label: 'Local News and Weather',
    prompt: '', // Built dynamically with location
  },
  national: {
    label: 'National News',
    prompt: 'Give me the top 5 national news stories for the United States from the last 12 hours. Search CNN, ABC, CBS, NBC, FOX, and Associated Press. Write 3-5 sentences for each story.',
  },
  international: {
    label: 'International News',
    prompt: 'Give me the top 5 international news stories from around the world (excluding US domestic news) from the last 12 hours. Search major international news outlets. Write 3-5 sentences for each story.',
  },
  business: {
    label: 'Business and Finance',
    prompt: 'Give me the top 5 business and finance news stories from the last 12 hours. Include stock market updates, major corporate news, and economic developments. Search Bloomberg, CNBC, Wall Street Journal, Reuters. Write 3-5 sentences for each story.',
  },
  sports: {
    label: 'Sports',
    prompt: 'Give me the top 5 sports news stories from the last 12 hours. Cover major leagues (NFL, NBA, MLB, NHL, soccer, etc.) and significant sporting events. Search ESPN, Sports Illustrated, major sports outlets. Write 3-5 sentences for each story.',
  },
  science: {
    label: 'Science and Technology',
    prompt: 'Give me the top 5 science and technology news stories from the last 12 hours. Cover tech industry news, scientific discoveries, space exploration, AI developments. Search TechCrunch, Wired, Ars Technica, Science News. Write 3-5 sentences for each story.',
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

// Generate news script using OpenAI
async function generateNewsScript(
  categoryId: string,
  subscriberName: string | null,
  narratorName: string | null,
  zipCode: string | null,
  testCity: string | null
): Promise<string> {
  const config = CATEGORY_CONFIG[categoryId];
  if (!config) throw new Error(`Unknown category: ${categoryId}`);

  // Determine greeting based on time of day
  const hour = new Date().getHours();
  let timeGreeting = 'morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'afternoon';
  else if (hour >= 17) timeGreeting = 'evening';

  // Build the prompt based on category
  let newsPrompt = '';
  
  if (categoryId === 'local' && testCity) {
    const state = testCity.split(',')[1]?.trim() || 'North Carolina';
    newsPrompt = `I want a 4 to 7 minute news style audio broadcast by news anchor ${narratorName || 'your host'} especially for ${subscriberName || 'you'}.

Give me the 24-hour weather forecast for United States zip code ${zipCode} in 4 to 5 sentences. Do not include any other zip codes other than ${zipCode}.

Now give me the top 3 stories for LOCAL news ONLY. LOCAL news means:
- News happening IN or NEAR ${testCity} (within 50 miles)
- Local crime, local government, local schools, local businesses, local events
- News from local newspapers like the Asheville Citizen-Times, WLOS, local TV stations
- Do NOT include national news stories
- Do NOT include stories about other cities or states
Search for "${testCity} news today" and "${testCity} local news" to find these stories.

Then give 3 to 5 sentences describing each of 3 top state news stories in the last 12 hours for the state of ${state} in the United States by searching the internet and major news outlets including CNN, ABC, CBS, NBC, FOX and Associated Press. Do not include any news for any other state except ${state} in the United States of America.

Write this as one 4 to 7 minute spoken news broadcast by ${narratorName || 'your host'} leaving out your methodology for gathering the information. Never use zip code in story only the name of the closest town to that zip code. Personalize this for "${subscriberName || 'the listener'}" the listener. When you describe a place or event in the story always say what town it is in or near. Expand local stories as much as state-wide stories.`;
  } else {
    newsPrompt = `I want a 4 to 7 minute news style audio broadcast by news anchor ${narratorName || 'your host'} especially for ${subscriberName || 'you'}.

${config.prompt}

Write this as a professional spoken news broadcast by ${narratorName || 'your host'}. Personalize this for "${subscriberName || 'the listener'}" the listener.`;
  }

  // Add verification rules to all prompts
  const fullPrompt = `${newsPrompt}

CRITICAL VERIFICATION RULES:
- Use ONLY real, verified news from legitimate news outlets
- Do NOT guess, hallucinate, or make up any news stories, names, places, or events
- Do NOT invent quotes or statistics
- If you cannot find verified news, say "No major news to report at this time" rather than making something up
- Every story must be based on actual reported news
- Include the news source name when possible
- Do NOT explain your search methodology or how you gathered information
- Do NOT include any AI thinking or reasoning in your response
- Write ONLY the news script as if reading directly to the listener
- Start with a greeting like "Good ${timeGreeting} ${subscriberName || ''}, this is ${narratorName || 'your host'} with your ${getCategoryLabel(categoryId)} briefing..."
- End with a sign-off like "That's your ${getCategoryLabel(categoryId)} update. Thanks for listening, ${subscriberName || ''}, and have a great ${timeGreeting}."`;

  // Call OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: fullPrompt
      }
    ],
  });

  return completion.choices[0]?.message?.content || '';
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
    const { categoryId, voiceId, subscriberName, narratorName, zipCode, testCity } = body;

    if (!categoryId || !voiceId) {
      return NextResponse.json(
        { success: false, error: 'Missing categoryId or voiceId' },
        { status: 400 }
      );
    }

    console.log(`[News Generator] Starting generation for ${categoryId} using OpenAI`);

    const episodeNumber = calculateEpisodeNumber();

    await deleteOldBriefings(categoryId);

    console.log(`[News Generator] Generating script with OpenAI...`);
    const script = await generateNewsScript(
      categoryId,
      subscriberName || null,
      narratorName || null,
      zipCode || null,
      testCity || null
    );

    console.log(`[News Generator] Generating audio with ElevenLabs voice ${voiceId}...`);
    const audioBuffer = await generateAudio(script, voiceId);

    console.log(`[News Generator] Uploading audio...`);
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
