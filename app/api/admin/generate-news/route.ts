// app/api/admin/generate-news/route.ts
// UPDATED: Integrates with /lib/news-prompts.ts for editable prompts
// HYBRID: GDELT for state news, World News API for national/world/business/sports/scitech

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { NEWS_PROMPTS, NewsPrompt } from '@/lib/news-prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// World News API key
const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY || '';


// ============================================================================
// TIMEZONE HELPERS
// ============================================================================

function getEasternTime(): Date {
  const now = new Date();
  const easternString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(easternString);
}

function getEasternDateFormatted(): string {
  const eastern = getEasternTime();
  return eastern.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function getTimeGreeting(): string {
  const eastern = getEasternTime();
  const hour = eastern.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
// ============================================================================
// CATEGORY CONFIGURATION
// ============================================================================

interface CategoryConfig {
  label: string;
  source: 'gdelt' | 'worldnews';
  gdeltQuery?: string;
  worldNewsParams?: { text?: string; sourceCountry?: string };
  fallbackSearchQuery: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  state: {
    label: 'State News',
    source: 'gdelt',
    gdeltQuery: 'sourcecountry:US sourcelang:english',
    fallbackSearchQuery: 'STATE_NAME news today'
  },
  national: {
    label: 'National News',
    source: 'worldnews',
    worldNewsParams: { text: 'USA politics government congress president', sourceCountry: 'us' },
    fallbackSearchQuery: 'top US national news today'
  },
  world: {
    label: 'World News',
    source: 'worldnews',
    worldNewsParams: { text: 'international global foreign affairs diplomacy' },
    fallbackSearchQuery: 'top international world news today'
  },
  // Keep 'international' as alias for 'world'
  international: {
    label: 'International News',
    source: 'worldnews',
    worldNewsParams: { text: 'international global foreign affairs diplomacy' },
    fallbackSearchQuery: 'top international world news today'
  },
  business: {
    label: 'Business & Finance',
    source: 'worldnews',
    worldNewsParams: { text: 'business economy finance markets stocks earnings' },
    fallbackSearchQuery: 'top business finance market news today'
  },
  sports: {
    label: 'Sports',
    source: 'worldnews',
    worldNewsParams: { text: 'sports NFL NBA MLB soccer football basketball hockey' },
    fallbackSearchQuery: 'top sports news scores today'
  },
  science: {
    label: 'Science & Technology',
    source: 'worldnews',
    worldNewsParams: { text: 'technology science AI artificial intelligence space research' },
    fallbackSearchQuery: 'top science technology tech news today'
  },
  scitech: {
    label: 'Science & Technology',
    source: 'worldnews',
    worldNewsParams: { text: 'technology science AI artificial intelligence space research' },
    fallbackSearchQuery: 'top science technology tech news today'
  }
};

// State codes for GDELT geo filtering
const STATE_FIPS: Record<string, string> = {
  'Alabama': 'US01', 'Alaska': 'US02', 'Arizona': 'US04', 'Arkansas': 'US05',
  'California': 'US06', 'Colorado': 'US08', 'Connecticut': 'US09', 'Delaware': 'US10',
  'Florida': 'US12', 'Georgia': 'US13', 'Hawaii': 'US15', 'Idaho': 'US16',
  'Illinois': 'US17', 'Indiana': 'US18', 'Iowa': 'US19', 'Kansas': 'US20',
  'Kentucky': 'US21', 'Louisiana': 'US22', 'Maine': 'US23', 'Maryland': 'US24',
  'Massachusetts': 'US25', 'Michigan': 'US26', 'Minnesota': 'US27', 'Mississippi': 'US28',
  'Missouri': 'US29', 'Montana': 'US30', 'Nebraska': 'US31', 'Nevada': 'US32',
  'New Hampshire': 'US33', 'New Jersey': 'US34', 'New Mexico': 'US35', 'New York': 'US36',
  'North Carolina': 'US37', 'North Dakota': 'US38', 'Ohio': 'US39', 'Oklahoma': 'US40',
  'Oregon': 'US41', 'Pennsylvania': 'US42', 'Rhode Island': 'US44', 'South Carolina': 'US45',
  'South Dakota': 'US46', 'Tennessee': 'US47', 'Texas': 'US48', 'Utah': 'US49',
  'Vermont': 'US50', 'Virginia': 'US51', 'Washington': 'US53', 'West Virginia': 'US54',
  'Wisconsin': 'US55', 'Wyoming': 'US56'
};

// ============================================================================
// PROMPT MANAGEMENT
// ============================================================================

async function getPromptForCategory(category: string): Promise<{ prompt: string; defaultPrompt: string; isCustom: boolean }> {
  // Map category aliases
  const categoryKey = category === 'international' ? 'world' : category === 'science' ? 'scitech' : category;
  
  // Get default from file
  const filePrompt = NEWS_PROMPTS[categoryKey];
  const defaultPrompt = filePrompt?.prompt || '';

  // Check for database override
  try {
    const { data: dbPrompt } = await supabase
      .from('news_prompts')
      .select('prompt')
      .eq('category', categoryKey)
      .single();

    if (dbPrompt?.prompt) {
      return {
        prompt: dbPrompt.prompt,
        defaultPrompt,
        isCustom: true
      };
    }
  } catch (e) {
    // No override found, use default
  }

  return {
    prompt: defaultPrompt,
    defaultPrompt,
    isCustom: false
  };
}

async function savePromptForCategory(category: string, prompt: string): Promise<void> {
  const categoryKey = category === 'international' ? 'world' : category === 'science' ? 'scitech' : category;
  
  await supabase
    .from('news_prompts')
    .upsert({
      category: categoryKey,
      prompt,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'category'
    });
}

async function resetPromptForCategory(category: string): Promise<string> {
  const categoryKey = category === 'international' ? 'world' : category === 'science' ? 'scitech' : category;
  
  // Delete from database (reverts to file default)
  await supabase
    .from('news_prompts')
    .delete()
    .eq('category', categoryKey);

  return NEWS_PROMPTS[categoryKey]?.prompt || '';
}

// ============================================================================
// NEWS FETCHERS
// ============================================================================

interface NewsStory {
  headline: string;
  summary: string;
  source: string;
}

// GDELT for State News
async function fetchGdeltNews(
  category: string,
  state: string | null,
  count: number
): Promise<NewsStory[]> {
  try {
    const config = CATEGORY_CONFIG[category];
    if (!config) throw new Error(`Unknown category: ${category}`);

    let query = config.gdeltQuery || '';
    
    if (category === 'state' && state) {
      query = `("${state}" OR "${state} sports" OR "${state} football" OR "${state} basketball") sourcecountry:US sourcelang:english`;
    }

    const encodedQuery = encodeURIComponent(query);
    const maxRecords = Math.min(count * 3, 75);
    
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=ArtList&maxrecords=${maxRecords}&format=json&sort=DateDesc&timespan=24h`;
    console.log('[GDELT] Fetching:', gdeltUrl);

    const response = await fetch(gdeltUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`GDELT API error: ${response.status}`);
    }

    const data = await response.json();
    const articles = data.articles || [];

    if (articles.length === 0) {
      console.log('[GDELT] No articles found');
      return [];
    }

    console.log(`[GDELT] Found ${articles.length} articles`);

    const seen = new Set<string>();
    const stories: NewsStory[] = [];

    for (const article of articles) {
      if (stories.length >= count) break;
      
      const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(normalizedTitle)) continue;
      seen.add(normalizedTitle);

      stories.push({
        headline: article.title,
        summary: '',
        source: article.source || 'News'
      });
    }

    return stories;

  } catch (error) {
    console.error('[GDELT] Fetch error:', error);
    return [];
  }
}

// World News API for National, World, Business, Sports, Sci/Tech
async function fetchWorldNews(
  category: string,
  count: number
): Promise<NewsStory[]> {
  try {
    if (!WORLD_NEWS_API_KEY) {
      console.log('[WorldNews] No API key configured');
      return [];
    }

    const config = CATEGORY_CONFIG[category];
    if (!config || !config.worldNewsParams) {
      throw new Error(`No World News config for category: ${category}`);
    }

    const params = new URLSearchParams({
      'api-key': WORLD_NEWS_API_KEY,
      'number': count.toString(),
      'sort': 'publish-time',
      'sort-direction': 'DESC',
      'language': 'en'
    });

    if (config.worldNewsParams.text) {
      params.append('text', config.worldNewsParams.text);
    }
    if (config.worldNewsParams.sourceCountry) {
      params.append('source-countries', config.worldNewsParams.sourceCountry);
    }

    const url = `https://api.worldnewsapi.com/search-news?${params}`;
    console.log('[WorldNews] Fetching:', url.replace(WORLD_NEWS_API_KEY, '***'));

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`World News API error: ${response.status}`);
    }

    const data = await response.json();
    const articles = data.news || [];

    console.log(`[WorldNews] Found ${articles.length} articles`);

    return articles.slice(0, count).map((article: any) => ({
      headline: article.title || '',
      summary: article.text?.substring(0, 300) || '',
      source: article.source || 'News'
    }));

  } catch (error) {
    console.error('[WorldNews] Fetch error:', error);
    return [];
  }
}

// Fallback: Web Search
async function fetchNewsViaWebSearch(
  category: string,
  state: string | null,
  count: number
): Promise<NewsStory[]> {
  const config = CATEGORY_CONFIG[category];
  if (!config) return [];

  let searchQuery = config.fallbackSearchQuery;
  if (category === 'state' && state) {
    searchQuery = searchQuery.replace('STATE_NAME', state);
  }

  console.log('[Fallback] Using web search:', searchQuery);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are a news researcher. Output ONLY a JSON array of news stories. No commentary, no markdown, just valid JSON.`,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const }],
      messages: [{
        role: 'user',
        content: `Search for: ${searchQuery}

Return ONLY a JSON array with exactly ${count} items in this format:
[
  {"headline": "Story title", "summary": "1-2 sentence summary", "source": "Source name"},
  ...
]

Output ONLY the JSON array, nothing else.`
      }],
    });

    let jsonText = '';
    for (const block of response.content) {
      if (block.type === 'text') jsonText += block.text;
    }

    jsonText = jsonText.trim();
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[Fallback] No JSON found in response');
      return [];
    }

    const stories: NewsStory[] = JSON.parse(jsonMatch[0]);
    return stories.slice(0, count);

  } catch (error) {
    console.error('[Fallback] Web search error:', error);
    return [];
  }
}

// Main fetcher - routes to correct source
async function fetchNews(
  category: string,
  state: string | null,
  count: number
): Promise<NewsStory[]> {
  const config = CATEGORY_CONFIG[category];
  if (!config) return [];

  let stories: NewsStory[] = [];

  if (config.source === 'gdelt') {
    stories = await fetchGdeltNews(category, state, count);
  } else if (config.source === 'worldnews') {
    stories = await fetchWorldNews(category, count);
  }

  // Fallback if not enough stories
  if (stories.length < count) {
    console.log(`[FetchNews] Got ${stories.length}/${count} stories, using fallback`);
    const fallbackStories = await fetchNewsViaWebSearch(category, state, count - stories.length);
    stories = [...stories, ...fallbackStories];
  }

  return stories;
}

// ============================================================================
// SCRIPT GENERATOR
// ============================================================================

async function generateCleanScript(
  stories: NewsStory[],
  config: CategoryConfig,
  narrator: string,
  state: string | null,
  listenerName: string,
  categoryId: string,
  targetDuration: string = '3-5',
  customPrompt?: string
): Promise<string> {
  const timeGreeting = getTimeGreeting();
  const todayDate = getEasternDateFormatted();

  const label = state ? `${state} News` : config.label;

  const storiesText = stories.map((s, i) => 
    `${i + 1}. ${s.headline}${s.summary ? ` - ${s.summary}` : ''}`
  ).join('\n');

  // Use custom prompt if provided, otherwise use default structure
  let prompt: string;
  
  if (customPrompt && !customPrompt.includes('[EDIT THIS PROMPT]')) {
    // User has customized the prompt - use it with variable substitution
    prompt = customPrompt
      .replace(/{NEWS_CONTENT}/g, storiesText)
      .replace(/{NARRATOR}/g, narrator)
      .replace(/{LISTENER_NAME}/g, listenerName)
      .replace(/{LABEL}/g, label)
      .replace(/{TIME_GREETING}/g, timeGreeting)
      .replace(/{TODAY_DATE}/g, todayDate)      .replace(/{STATE}/g, state || '');
  } else {
    // Use the built-in default prompt
    const categoryGuidance: Record<string, string> = {
      state: `STATE NEWS FOCUS for ${state}:
- State government actions and legislation
- State crime reports and public safety updates  
- Community events and school happenings
- Weather impacts and emergency alerts
- Statewide elections and political updates
- Environmental and infrastructure issues
- State-level economic performance
- Public health updates and state agency reports
- State college sports: Basketball and Football scores, game results, rankings, and team news
- Major incidents affecting the state`,
      
      national: `NATIONAL NEWS FOCUS:
- President of the United States: actions, statements, executive orders, travel
- White House announcements and administration updates
- Congress: legislation, debates, hearings, votes
- National elections, political campaigns, polling
- Supreme Court decisions and federal court rulings
- National political controversies and social movements
- Federal government policies affecting Americans
- National security and defense updates
- Nationwide economic trends and employment data
- Major social issues and cultural debates
- Weather ONLY if it covers multiple states and is unusual or dangerous`,
      
      world: `INTERNATIONAL NEWS FOCUS:
- Foreign elections and geopolitical developments
- International conflicts or peace agreements
- Global economic trends and diplomatic relations
- Worldwide health, climate, and humanitarian issues
- Major cultural or scientific events abroad`,

      international: `INTERNATIONAL NEWS FOCUS:
- Foreign elections and geopolitical developments
- International conflicts or peace agreements
- Global economic trends and diplomatic relations
- Worldwide health, climate, and humanitarian issues
- Major cultural or scientific events abroad`,
      
      sports: `SPORTS NEWS FOCUS:
- Game results and highlights
- Player trades, injuries, and profiles
- Tournament standings and championship coverage
- College sports updates
- Analysis and commentary on performance and strategy`,
      
      science: `SCIENCE & TECH NEWS FOCUS:
- New scientific studies and breakthroughs
- Space exploration updates
- Advances in medicine and health research
- Consumer technology announcements
- Artificial intelligence and cybersecurity updates
- Climate and environmental science reports`,

      scitech: `SCIENCE & TECH NEWS FOCUS:
- New scientific studies and breakthroughs
- Space exploration updates
- Advances in medicine and health research
- Consumer technology announcements
- Artificial intelligence and cybersecurity updates
- Climate and environmental science reports`,
      
      business: `BUSINESS NEWS FOCUS:
- Stock market movement and economic indicators
- Corporate earnings and leadership changes
- Small-business trends
- Real estate and housing market updates
- Consumer spending and product shifts
- Global trade and industry analysis
When mentioning companies, briefly introduce them (location + what they do).`
    };

    const guidance = categoryGuidance[state ? 'state' : categoryId] || '';

    prompt = `You are ${narrator}, a seasoned professional radio news broadcaster. Write a broadcast script for these ${label} stories.

NEWS DEFINITION: Information about recent events, developments, or issues that are important, relevant, or interesting to the public. News aims to inform audiences with accurate, timely, and verified facts. It should be the fresh pulse of the world - clear, concise, and grounded in verified information.

${guidance}

STORIES TO COVER:
${storiesText}

SCRIPT REQUIREMENTS:

1. OPENING (vary naturally - never sound stale or canned):
   - Greet the listener by name: "${listenerName}"
   - Introduce yourself as ${narrator}
   - Examples of varied openings:
     * "Good ${timeGreeting}, ${listenerName}! I'm ${narrator}, and it's ${todayDate}. Here's your ${label} briefing."
     * "Hey ${listenerName}, good ${timeGreeting}! ${narrator} here on this ${todayDate} with your ${label} update."
     * "Welcome, ${listenerName}! I'm ${narrator}. Today is ${todayDate}, and this is your ${label}."

2. STORY COVERAGE (target ${targetDuration} minutes total):
   - Place more important and newer stories FIRST and give them MORE time
   - Each story: 3-5 sentences in conversational broadcast style
   - Add color and context - explain WHY stories matter
   - When mentioning companies: briefly note where they're located and what they do
   - Use smooth transitions between stories
   - NEVER hallucinate, exaggerate, or make up events

3. CLOSING (vary naturally):
   - Mention the listener's name: "${listenerName}"
   - Sign off with your name: ${narrator}
   - Examples:
     * "That's your ${label} update, ${listenerName}. I'm ${narrator}. Thanks for listening, and drive safe!"
     * "And that's the latest, ${listenerName}. ${narrator} here, wishing you a great ${timeGreeting}."
     * "That wraps up your briefing, ${listenerName}. I'm ${narrator}. We'll catch you next time!"

STYLE RULES:
- Be warm, conversational, and engaging - like a trusted friend delivering the news
- NO URLs, citations, or "according to" phrases  
- NO meta-commentary about writing or searching
- Use Fahrenheit for temperatures, US measurements
- Keep it factual and grounded - never sensationalize`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  let script = '';
  for (const block of response.content) {
    if (block.type === 'text') script += block.text;
  }

  script = script.trim();
  
  const greetingMatch = script.match(/Good (morning|afternoon|evening)/i);
  if (greetingMatch && greetingMatch.index && greetingMatch.index > 0) {
    script = script.substring(greetingMatch.index);
  }

  return script;
}

// ============================================================================
// AUDIO GENERATOR
// ============================================================================

async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY!
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================================================
// GET HANDLER - Returns prompt for Admin modal
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');

  // If no category, return API status
  if (!category) {
    return NextResponse.json({
      status: 'ok',
      endpoint: 'generate-news',
      version: '3.0',
      features: ['gdelt-state-news', 'worldnews-api', 'editable-prompts', 'hybrid-sources']
    });
  }

  // Return prompt for the requested category
  try {
    const { prompt, defaultPrompt, isCustom } = await getPromptForCategory(category);
    
    return NextResponse.json({
      category,
      prompt,
      defaultPrompt,
      isCustom
    });
  } catch (error) {
    console.error('[GET] Error fetching prompt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST HANDLER - Generate news OR save/reset prompts
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    
    // Handle prompt save/reset actions
    if (body.action === 'save-prompt') {
      const { category, prompt } = body;
      if (!category || !prompt) {
        return NextResponse.json({ error: 'Category and prompt required' }, { status: 400 });
      }
      await savePromptForCategory(category, prompt);
      return NextResponse.json({ success: true, message: 'Prompt saved' });
    }

    if (body.action === 'reset-prompt') {
      const { category } = body;
      if (!category) {
        return NextResponse.json({ error: 'Category required' }, { status: 400 });
      }
      const defaultPrompt = await resetPromptForCategory(category);
      return NextResponse.json({ success: true, defaultPrompt });
    }

    // Handle news generation
    const { category, voiceId, narratorName, state, storiesCount = 5, listenerName = 'Marc', targetDuration = '3-5' } = body;

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    const config = CATEGORY_CONFIG[category];
    if (!config) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    if (category === 'state' && !state) {
      return NextResponse.json({ error: 'State is required for local news' }, { status: 400 });
    }

    const narrator = narratorName || 'Your Host';
    console.log(`[Generate News] Starting: ${category}${state ? ` (${state})` : ''}, source: ${config.source}`);

    // Fetch news from appropriate source
    const stories = await fetchNews(category, state, storiesCount);

    if (stories.length === 0) {
      return NextResponse.json({ 
        error: 'Could not fetch news stories. Please try again.',
        details: 'All news sources returned no results.'
      }, { status: 500 });
    }

    console.log(`[Generate News] Got ${stories.length} stories, generating script...`);

    // Get custom prompt if set
    const { prompt: customPrompt } = await getPromptForCategory(category);

    // Generate script
    const script = await generateCleanScript(stories, config, narrator, state, listenerName, category, targetDuration, customPrompt);
    console.log(`[Generate News] Script generated (${script.length} chars)`);

    // Generate audio if voice selected
    let audioUrl: string | null = null;
    let audioDuration: string | null = null;
    
    if (voiceId) {
      try {
        console.log(`[Generate News] Generating audio with voice: ${voiceId}`);
        const audioBuffer = await generateAudio(script, voiceId);
        
        const durationSeconds = Math.round(audioBuffer.length / 16000);
        const durationMinutes = (durationSeconds / 60).toFixed(1);
        audioDuration = durationMinutes;
        
        const fileName = `news-${category}${state ? `-${state.toLowerCase().replace(/\s+/g, '-')}` : ''}-${Date.now()}.mp3`;
        
        const { error: uploadError } = await supabase.storage
          .from('news-audio')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          console.error('[Generate News] Upload error:', uploadError);
        } else {
          const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
          audioUrl = urlData.publicUrl;
          console.log(`[Generate News] Audio uploaded: ${audioUrl}`);
        }
      } catch (audioError) {
        console.error('[Generate News] Audio generation error:', audioError);
      }
    }

    // Save to database
    const { data: settingsRow } = await supabase
      .from('news_settings')
      .select('settings')
      .eq('id', '1')
      .single();

    const currentSettings = settingsRow?.settings || {};
    const currentCategories = currentSettings.categories || {};
    const currentEpisode = currentCategories[category]?.episode_number || 0;
    const newEpisode = currentEpisode + 1;

    const updatedSettings = {
      ...currentSettings,
      categories: {
        ...currentCategories,
        [category]: {
          ...currentCategories[category],
          last_generated: new Date().toISOString(),
          episode_number: newEpisode,
          audio_url: audioUrl,
          duration: audioDuration
        }
      }
    };

    await supabase
      .from('news_settings')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .eq('id', '1');

    if (audioUrl) {
      await supabase.from('news_episodes').insert({
        category,
        state: state || null,
        episode_number: newEpisode,
        script_text: script,
        audio_url: audioUrl,
        narrator_name: narratorName,
        voice_id: voiceId,
        is_live: true,
        created_at: new Date().toISOString()
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Generate News] Complete in ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      episode: {
        category,
        state,
        episodeNumber: newEpisode,
        script,
        audioUrl,
        duration: audioDuration,
        storiesUsed: stories.length,
        generatedAt: new Date().toISOString(),
        generationTimeMs: elapsed
      }
    });

  } catch (error) {
    console.error('[Generate News] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
