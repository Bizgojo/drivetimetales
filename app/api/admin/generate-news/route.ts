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

// ============================================================================
// CATEGORY CONFIGURATION
// ============================================================================

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
// GDELT NEWS FETCHER
// ============================================================================

interface GdeltArticle {
  title: string;
  url: string;
  source: string;
  seendate: string;
  socialimage?: string;
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

    // Build GDELT DOC 2.0 API query
    // Documentation: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
    let query = config.gdeltQuery;
    
    // For state news, search for state name in articles from US sources
    // Include both general news and sports
    if (category === 'state' && state) {
      // GDELT searches for the state name as a keyword in US English news
      // This gives us articles that specifically mention the state, including sports
      query = `("${state}" OR "${state} sports" OR "${state} football" OR "${state} basketball") sourcecountry:US sourcelang:english`;
    }

    // Build the GDELT API URL (note: GDELT doesn't use standard URLSearchParams encoding)
    // Format: query goes first, then &mode=, &maxrecords=, etc.
    const encodedQuery = encodeURIComponent(query);
    const maxRecords = Math.min(count * 3, 75); // GDELT default max is 75, can go to 250
    
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=ArtList&maxrecords=${maxRecords}&format=json&sort=DateDesc&timespan=24h`;
    console.log('[GDELT] Fetching:', gdeltUrl);

    const response = await fetch(gdeltUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000) // 10 second timeout
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

    // Deduplicate by title similarity and convert to NewsStory format
    const seen = new Set<string>();
    const stories: NewsStory[] = [];

    for (const article of articles) {
      if (stories.length >= count) break;
      
      // Simple deduplication by normalized title
      const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(normalizedTitle)) continue;
      seen.add(normalizedTitle);

      stories.push({
        headline: article.title,
        summary: '', // GDELT doesn't provide summaries, Claude will expand
        source: article.source || 'News'
      });
    }

    return stories;

  } catch (error) {
    console.error('[GDELT] Fetch error:', error);
    return []; // Return empty to trigger fallback
  }
}

// ============================================================================
// FALLBACK: WEB SEARCH (only if GDELT fails)
// ============================================================================

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
    // Use Claude with web search just to get headlines, not to write the script
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

    // Extract JSON from response
    let jsonText = '';
    for (const block of response.content) {
      if (block.type === 'text') jsonText += block.text;
    }

    // Clean up and parse JSON
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

// ============================================================================
// SCRIPT GENERATOR (No web search = No thinking in output!)
// ============================================================================

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

  // Format stories for the prompt
  const storiesText = stories.map((s, i) => 
    `${i + 1}. ${s.headline}${s.summary ? ` - ${s.summary}` : ''}`
  ).join('\n');

  // Category-specific content guidance
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
- Federal government decisions and policies
- National elections, political debates, Supreme Court actions
- Nationwide economic trends and employment data
- Major court cases and national security updates
- Countrywide social issues
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

  // CRITICAL: This prompt does NOT use web search, so Claude outputs clean script only
  const prompt = `You are ${narrator}, a seasoned professional radio news broadcaster. Write a broadcast script for these ${label} stories.

NEWS DEFINITION: Information about recent events, developments, or issues that are important, relevant, or interesting to the public. News aims to inform audiences with accurate, timely, and verified facts. It should be the fresh pulse of the world - clear, concise, and grounded in verified information.

${guidance}

STORIES TO COVER:
${storiesText}

SCRIPT REQUIREMENTS:

1. OPENING (vary naturally - never sound stale or canned):
   - Greet the listener by name: "${listenerName}"
   - Introduce yourself as ${narrator}
   - Examples of varied openings:
     * "Good ${timeGreeting}, ${listenerName}! I'm ${narrator}, bringing you your ${label} briefing."
     * "Hey ${listenerName}, good ${timeGreeting}! ${narrator} here with your ${label} update."
     * "Welcome, ${listenerName}! I'm ${narrator}, and this is your ${label} for today."

2. STORY COVERAGE (target 3-5 minutes total):
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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
    // NO tools = NO web search = NO thinking in output!
  });

  let script = '';
  for (const block of response.content) {
    if (block.type === 'text') script += block.text;
  }

  // Minimal cleanup - should be clean already since no web search
  script = script.trim();
  
  // Ensure it starts with the greeting
  const greetingMatch = script.match(/Good (morning|afternoon|evening)/i);
  if (greetingMatch && greetingMatch.index && greetingMatch.index > 0) {
    script = script.substring(greetingMatch.index);
  }

  return script;
}

// ============================================================================
// AUDIO GENERATOR (ElevenLabs)
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
// MAIN API HANDLER
// ============================================================================

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
    console.log(`[Generate News] Starting: ${category}${state ? ` (${state})` : ''}, narrator: ${narrator}, listener: ${listenerName}, stories: ${storiesCount}`);

    // ========================================
    // PHASE 1: Fetch news (GDELT or fallback)
    // ========================================
    let stories = await fetchGdeltNews(category, state, storiesCount);
    
    if (stories.length < storiesCount) {
      console.log(`[Generate News] GDELT returned ${stories.length} stories, using fallback`);
      const fallbackStories = await fetchNewsViaWebSearch(category, state, storiesCount - stories.length);
      stories = [...stories, ...fallbackStories];
    }

    if (stories.length === 0) {
      return NextResponse.json({ 
        error: 'Could not fetch news stories. Please try again.',
        details: 'Both GDELT and fallback search returned no results.'
      }, { status: 500 });
    }

    console.log(`[Generate News] Got ${stories.length} stories, generating script...`);

    // ========================================
    // PHASE 2: Generate clean script (no web search!)
    // ========================================
    const script = await generateCleanScript(stories, config, narrator, state, listenerName, category);
    console.log(`[Generate News] Script generated (${script.length} chars)`);

    // ========================================
    // PHASE 3: Generate audio (if voice selected)
    // ========================================
    let audioUrl: string | null = null;
    
    if (voiceId) {
      try {
        console.log(`[Generate News] Generating audio with voice: ${voiceId}`);
        const audioBuffer = await generateAudio(script, voiceId);
        
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
        // Continue without audio rather than failing entirely
      }
    }

    // ========================================
    // PHASE 4: Save to database
    // ========================================
    
    // Update news_settings
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
          audio_url: audioUrl
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

    // Insert into news_episodes
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
    features: ['gdelt-integration', 'two-phase-generation', 'no-thinking-bug']
  });
}
