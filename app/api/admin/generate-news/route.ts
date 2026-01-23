// app/api/admin/generate-news/route.ts
// FIXED: Two-phase architecture - fetch news first, then write script (eliminates thinking bug)
// NEW: GDELT integration for reliable state-specific news

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CategoryConfig {
  label: string;
  gdeltQuery: string;
  gdeltTheme?: string;
  fallbackSearchQuery: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  national: {
    label: 'National News',
    gdeltQuery: 'sourcecountry:US sourcelang:english',
    fallbackSearchQuery: 'top US national news today'
  },
  international: {
    label: 'International News',
    gdeltQuery: '-sourcecountry:US sourcelang:english',
    fallbackSearchQuery: 'top international world news today'
  },
  business: {
    label: 'Business & Finance',
    gdeltQuery: 'theme:ECON sourcelang:english',
    gdeltTheme: 'ECON_STOCKMARKET,ECON_INFLATION,BUSINESS',
    fallbackSearchQuery: 'top business finance market news today'
  },
  sports: {
    label: 'Sports',
    gdeltQuery: 'theme:SPORTS sourcelang:english',
    gdeltTheme: 'SPORTS',
    fallbackSearchQuery: 'top sports news scores today'
  },
  science: {
    label: 'Science & Technology',
    gdeltQuery: '(theme:SCIENCE OR theme:TECHNOLOGY) sourcelang:english',
    gdeltTheme: 'SCIENCE,TECHNOLOGY',
    fallbackSearchQuery: 'top science technology tech news today'
  },
  state: {
    label: 'Local News',
    gdeltQuery: 'sourcecountry:US sourcelang:english',
    fallbackSearchQuery: 'STATE_NAME news today weather politics crime sports'
  }
};

interface GdeltArticle {
  title: string;
  url: string;
  source: string;
  seendate: string;
}

interface NewsStory {
  headline: string;
  summary: string;
  source: string;
}

async function fetchGdeltNews(
  category: string,
  state: string | null,
  count: number
): Promise<NewsStory[]> {
  try {
    const config = CATEGORY_CONFIG[category];
    if (!config) throw new Error(`Unknown category: ${category}`);

    let query = config.gdeltQuery;
    
    if (category === 'state' && state) {
      query = `("${state}" OR "${state} sports" OR "${state} football" OR "${state} basketball") sourcecountry:US sourcelang:english`;
    }

    const encodedQuery = encodeURIComponent(query);
    const maxRecords = Math.min(count * 3, 75);
    
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=ArtList&maxrecords=${maxRecords}&format=json&sort=DateDesc&timespan=24h`;
    console.log('[GDELT] Fetching:', gdeltUrl);

    const response = await fetch(gdeltUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(100
cat >> ~/Projects/drivetimetales/app/api/admin/generate-news/route.ts << 'CHUNK2'

async function fetchGdeltNews(
  category: string,
  state: string | null,
  count: number
): Promise<NewsStory[]> {
  try {
    const config = CATEGORY_CONFIG[category];
    if (!config) throw new Error(`Unknown category: ${category}`);

    let query = config.gdeltQuery;
    
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
    const articles: GdeltArticle[] = data.articles || [];

    if (articles.length === 0) {
      console.log('[GDELT] No articles found, will use fallback');
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

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 1
      }],
      messages: [{
        role: 'user',
        content: `Search for: ${searchQuery}\n\nReturn ONLY a JSON array of ${count} news headlines, nothing else. Format: [{"headline": "...", "source": "..."}]`
      }]
    });

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((item: { headline: string; source?: string }) => ({
        headline: item.headline,
        summary: '',
        source: item.source || 'News'
      }));
    }
    return [];
  } catch (error) {
    console.error('[Fallback Search] Error:', error);
    return [];
  }
}

async function generateCleanScript(
  stories: NewsStory[],
  config: CategoryConfig,
  narrator: string,
  state: string | null,
  listenerName: string = 'friend',
  categoryId: string = 'national'
): Promise<string> {
  const hour = new Date().getHours();
  let timeGreeting = 'morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'afternoon';
  else if (hour >= 17) timeGreeting = 'evening';

  const label = state ? `${state} News` : config.label;

  const storiesText = stories.map((s, i) => 
    `${i + 1}. ${s.headline}${s.summary ? ` - ${s.summary}` : ''}`
  ).join('\n');

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
- Local sports teams and college athletics
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

  const prompt = `You are ${narrator}, a seasoned professional radio news broadcaster. Write a broadcast script for these ${label} stories.

NEWS DEFINITION: Information about recent events, developments, or issues that are important, relevant, or interesting to the public. News aims to inform audiences with accurate, timely, and verified facts. It should be the fresh pulse of the world - clear, concise, and grounded in verified information.

${guidance}

STORIES TO COVER:
${storiesText}

SCRIPT REQUIREMENTS:

1. OPENING (vary naturally - never sound stale or canned):
   - Greet the listener by name: "${listenerName}"
   - Introduce yourself as ${narrator}

2. STORY COVERAGE (target 3-5 minutes total):
   - Place more important and newer stories FIRST and give them MORE time
   - Each story: 3-5 sentences in conversational broadcast style
   - Add color and context - explain WHY stories matter
   - When mentioning companies: briefly note where they are located and what they do
   - Use smooth transitions between stories
   - NEVER hallucinate, exaggerate, or make up events

3. CLOSING (vary naturally):
   - Mention the listener name: "${listenerName}"
   - Sign off with your name: ${narrator}

STYLE RULES:
- Be warm, conversational, and engaging - like a trusted friend delivering the news
- NO URLs, citations, or "according to" phrases  
- NO meta-commentary about writing or searching
- Use Fahrenheit for temperatures, US measurements
- Keep it factual and grounded - never sensationalize`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  let script = '';
  for (const block of response.content) {
    if (block.type === 'text') script += block.text;
  }

  return script.trim();
}

async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { category, voiceId, narratorName, state, storiesCount = 5, listenerName = 'Marc' } = body;

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
    console.log(`[Generate News] Starting: ${category}${state ? ` (${state})` : ''}, narrator: ${narrator}`);

    // PHASE 1: Fetch news (GDELT or fallback)
    let stories = await fetchGdeltNews(category, state, storiesCount);
    
    if (stories.length < storiesCount) {
      console.log(`[Generate News] GDELT returned ${stories.length} stories, using fallback`);
      const fallbackStories = await fetchNewsViaWebSearch(category, state, storiesCount - stories.length);
      stories = [...stories, ...fallbackStories];
    }

    if (stories.length === 0) {
      return NextResponse.json({ 
        error: 'Could not fetch news stories. Please try again.',
      }, { status: 500 });
    }

    console.log(`[Generate News] Got ${stories.length} stories, generating script...`)
cat >> ~/Projects/drivetimetales/app/api/admin/generate-news/route.ts << 'CHUNK6'

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { category, voiceId, narratorName, state, storiesCount = 5, listenerName = 'Marc' } = body;

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
    console.log(`[Generate News] Starting: ${category}${state ? ` (${state})` : ''}, narrator: ${narrator}`);

    // PHASE 1: Fetch news (GDELT or fallback)
    let stories = await fetchGdeltNews(category, state, storiesCount);
    
    if (stories.length < storiesCount) {
      console.log(`[Generate News] GDELT returned ${stories.length} stories, using fallback`);
      const fallbackStories = await fetchNewsViaWebSearch(category, state, storiesCount - stories.length);
      stories = [...stories, ...fallbackStories];
    }

    if (stories.length === 0) {
      return NextResponse.json({ 
        error: 'Could not fetch news stories. Please try again.',
      }, { status: 500 });
    }

    console.log(`[Generate News] Got ${stories.length} stories, generating script...`);

    // PHASE 2: Generate clean script (no web search!)
    const script = await generateCleanScript(stories, config, narrator, state, listenerName, category);
    console.log(`[Generate News] Script generated (${script.length} chars)`);

    // PHASE 3: Generate audio (if voice selected)
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

    // PHASE 4: Save to database
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
    console.error('[Generate News] Error:', error
cat >> ~/Projects/drivetimetales/app/api/admin/generate-news/route.ts << 'CHUNK7'

    // PHASE 4: Save to database
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

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'generate-news',
    version: '2.0',
    features: ['gdelt-integration', 'two-phase-generation', 'duration-tracking']
  });
}
