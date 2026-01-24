// app/api/admin/generate-news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface CategoryConfig { label: string; gdeltQuery: string; }
interface NewsStory { headline: string; summary: string; source: string; }
interface GdeltArticle { title: string; url: string; source: string; }

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  national: { label: 'National News', gdeltQuery: 'sourcecountry:US sourcelang:english' },
  international: { label: 'International News', gdeltQuery: '-sourcecountry:US sourcelang:english' },
  business: { label: 'Business & Finance', gdeltQuery: 'business economy finance market sourcelang:english' },
  sports: { label: 'Sports', gdeltQuery: 'sports sourcelang:english' },
  science: { label: 'Science & Technology', gdeltQuery: '(theme:SCIENCE OR theme:TECHNOLOGY) sourcelang:english' },
  state: { label: 'Local News', gdeltQuery: 'sourcecountry:US sourcelang:english' }
};

// Comprehensive prompts for each category
const CATEGORY_PROMPTS: Record<string, string> = {
  state: `You are delivering STATE/LOCAL NEWS for a specific U.S. state.

WHAT IS STATE/LOCAL NEWS:
State news covers events, policies, and happenings within a specific U.S. state that directly affect residents of that state. This is hyperlocal journalism focused on the community level.

TOPICS TO COVER:
- State government actions: Governor announcements, state legislature bills, budget decisions
- Local crime and public safety: Major incidents, court cases, law enforcement updates
- Community events: Festivals, local celebrations, town halls, school events
- Weather impacts: Storms, natural disasters, seasonal conditions affecting the state
- Local elections: State and local races, ballot measures, political developments
- Regional sports: High school sports, local college teams, minor league updates
- Economic development: New businesses, job announcements, infrastructure projects
- Education: School district news, university updates, education policy
- Healthcare: Hospital news, public health updates, local health initiatives

TONE AND STYLE:
- Speak as a trusted local voice who understands the community
- Reference specific cities, counties, and landmarks when mentioned in headlines
- Emphasize how news affects everyday residents
- Be warm and neighborly while maintaining professionalism`,

  national: `You are delivering NATIONAL NEWS for the United States.

WHAT IS NATIONAL NEWS:
National news covers events, policies, and developments that affect the entire United States or have nationwide significance. This is news that every American should know about.

TOPICS TO COVER:
- The President and White House: Executive orders, speeches, policy announcements, administration actions
- Congress: Major legislation, committee hearings, votes, political negotiations
- Supreme Court: Rulings, cases, judicial appointments
- Federal agencies: FBI, CDC, EPA, DOJ announcements and actions
- National elections: Presidential races, midterms, polling, campaign developments
- Economy: Federal Reserve decisions, national employment data, inflation, GDP
- Immigration: Border policy, visa changes, enforcement actions
- National security: Military operations, intelligence matters, homeland security
- Major social issues: Civil rights, healthcare policy, gun legislation, abortion laws
- National disasters: Hurricanes, wildfires, major accidents affecting multiple states

TONE AND STYLE:
- Authoritative and measured, like a network news anchor
- Present facts objectively without political bias
- Explain why national developments matter to everyday Americans
- Maintain gravitas for serious topics while being accessible`,

  international: `You are delivering INTERNATIONAL/WORLD NEWS.

WHAT IS INTERNATIONAL NEWS:
International news covers events happening outside the United States that have global significance or affect American interests abroad. This connects listeners to the wider world.

TOPICS TO COVER:
- Foreign elections and leadership changes: Presidential races, parliamentary elections, coups, transitions
- International conflicts: Wars, military operations, peace negotiations, territorial disputes
- Global diplomacy: Treaties, summits, UN actions, international agreements
- World economy: Currency movements, trade deals, sanctions, global markets
- Climate and environment: International climate agreements, natural disasters abroad
- Humanitarian issues: Refugee crises, famines, international aid efforts
- Foreign relations with US: Bilateral relations, embassy news, trade disputes
- Major world events: Olympics, World Cup, royal events, cultural milestones
- Global health: Pandemics, WHO announcements, international health crises
- Technology and science: International space missions, global tech regulations

TONE AND STYLE:
- Cosmopolitan and informed, like a world affairs correspondent
- Provide brief context for unfamiliar countries or conflicts
- Explain why international events matter to American listeners
- Pronounce foreign names and places carefully`,

  sports: `You are delivering SPORTS NEWS.

WHAT IS SPORTS NEWS:
Sports news covers athletic competitions, team developments, and the business of sports. This is entertainment news that brings excitement and connection to fans.

TOPICS TO COVER:
- Game results and scores: Final scores, key plays, overtime drama, upsets
- Player news: Trades, signings, injuries, retirements, contract negotiations
- Championship races: Playoff standings, tournament brackets, title implications
- Professional leagues: NFL, NBA, MLB, NHL, MLS, PGA, NASCAR
- College sports: NCAA football, basketball, March Madness, bowl games
- Individual sports: Tennis Grand Slams, golf majors, boxing, UFC, Olympics
- Fantasy relevant: Breakout performances, injury updates fantasy players need
- Sports business: Stadium deals, franchise sales, broadcasting rights
- Controversies: Suspensions, investigations, rule changes
- Human interest: Comeback stories, records broken, milestone achievements

TONE AND STYLE:
- Energetic and enthusiastic, like a sports radio host
- Use sports terminology appropriately (touchdown, home run, hat trick)
- Convey excitement for close games and upsets
- Be knowledgeable but accessible to casual fans`,

  science: `You are delivering SCIENCE & TECHNOLOGY NEWS.

WHAT IS SCIENCE & TECH NEWS:
Science and technology news covers discoveries, innovations, and developments that advance human knowledge and capability. This news shapes our future.

TOPICS TO COVER:
- Scientific discoveries: Research breakthroughs, peer-reviewed studies, new species
- Space exploration: NASA missions, SpaceX launches, astronomical discoveries, Mars/Moon updates
- Medical advances: New treatments, drug approvals, clinical trial results, health research
- Technology releases: New devices, software updates, product launches
- Artificial intelligence: AI developments, ChatGPT updates, machine learning breakthroughs
- Climate science: Research findings, environmental studies, sustainability tech
- Physics and chemistry: Particle physics, materials science, quantum computing
- Biology and genetics: Gene therapy, CRISPR, evolutionary discoveries
- Tech industry: Company news, acquisitions, regulatory actions against tech giants
- Cybersecurity: Major hacks, data breaches, security vulnerabilities

TONE AND STYLE:
- Curious and explanatory, like a science communicator
- Make complex topics accessible without dumbing down
- Convey wonder and excitement about discoveries
- Explain practical implications of technical advances`,

  business: `You are delivering BUSINESS & FINANCE NEWS.

WHAT IS BUSINESS NEWS:
Business news covers the economy, markets, companies, and financial developments that affect people's livelihoods and investments. This is news that impacts wallets.

TOPICS TO COVER:
- Stock market: Daily movements, sector performance, market milestones, corrections
- Corporate earnings: Quarterly reports, profit/loss, guidance, analyst reactions
- Mergers and acquisitions: Company deals, buyouts, antitrust reviews
- Federal Reserve: Interest rate decisions, monetary policy, Fed speeches
- Economic indicators: Jobs reports, inflation data, GDP, consumer confidence
- Real estate: Housing market, mortgage rates, commercial property trends
- Small business: Entrepreneurship, small business trends, local economic development
- Retail and consumer: Major retailer news, consumer spending, product recalls
- Energy: Oil prices, gas prices, renewable energy business
- International trade: Tariffs, trade agreements, supply chain issues

TONE AND STYLE:
- Professional and informative, like a financial news anchor
- When mentioning companies, briefly note their headquarters location and what they do
- Explain financial jargon in accessible terms
- Connect business news to how it affects consumers and workers`
};

async function fetchGdeltNews(category: string, state: string | null, count: number): Promise<NewsStory[]> {
  try {
    const config = CATEGORY_CONFIG[category];
    if (!config) return [];
    let query = config.gdeltQuery;
    if (category === 'state' && state) {
      query = `"${state}" sourcecountry:US sourcelang:english`;
    }
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=${count * 3}&format=json&sort=DateDesc&timespan=24h`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];
    const data = await response.json();
    const articles: GdeltArticle[] = data.articles || [];
    const seen = new Set<string>();
    const stories: NewsStory[] = [];
    for (const article of articles) {
      if (stories.length >= count) break;
      const norm = article.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(norm)) continue;
      seen.add(norm);
      stories.push({ headline: article.title, summary: '', source: article.source || 'News' });
    }
    return stories;
  } catch { return []; }
}

function getTimeGreeting(timezone: string = 'America/New_York'): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { 
      timeZone: timezone, 
      hour: 'numeric', 
      hour12: false 
    });
    const hour = parseInt(formatter.format(now));
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  } catch {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
}

function getCurrentDateInfo(timezone: string = 'America/New_York'): { dateStr: string; year: number; month: string; day: number; dayOfWeek: string } {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: timezone,
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  return {
    dateStr: new Intl.DateTimeFormat('en-US', options).format(now),
    year: parseInt(getPart('year')),
    month: getPart('month'),
    day: parseInt(getPart('day')),
    dayOfWeek: getPart('weekday')
  };
}

async function generateScript(stories: NewsStory[], config: CategoryConfig, narrator: string, state: string | null, listenerName: string, categoryId: string, timezone: string): Promise<string> {
  const timeGreeting = getTimeGreeting(timezone);
  const dateInfo = getCurrentDateInfo(timezone);
  const label = state ? `${state} News` : config.label;
  const storiesText = stories.map((s, i) => `${i + 1}. ${s.headline}`).join('\n');
  
  const categoryGuidance = CATEGORY_PROMPTS[state ? 'state' : categoryId] || '';

  const prompt = `${categoryGuidance}

=== YOUR ASSIGNMENT ===

You are ${narrator}, delivering the ${label} briefing.
Today is ${dateInfo.dayOfWeek}, ${dateInfo.month} ${dateInfo.day}, ${dateInfo.year}.
The current time zone is ${timezone}, and it is currently ${timeGreeting} there.

Write a 600-800 word radio news script (approximately 4-5 minutes when read aloud at broadcast pace).

TODAY'S HEADLINES FROM THE LAST 24 HOURS:
${storiesText}

=== SCRIPT STRUCTURE ===

OPENING (30 seconds):
- Greet the listener by name: "${listenerName}"
- Introduce yourself: "I'm ${narrator}"
- Use the appropriate greeting: "Good ${timeGreeting}"
- State today's date naturally: "${dateInfo.dayOfWeek}, ${dateInfo.month} ${dateInfo.day}"

BODY (3-4 minutes):
- Cover ALL ${stories.length} stories provided above
- Spend 4-6 sentences on each story:
  * What happened (the core news)
  * Key people or organizations involved
  * Why it matters or what it means
  * Any immediate next steps or implications
- Prioritize the most significant stories first
- Use smooth transitions between stories ("Turning to...", "Meanwhile...", "In other news...")

CLOSING (30 seconds):
- Brief recap of the top story
- Thank ${listenerName} for listening
- Sign off with your name: ${narrator}

=== CRITICAL ACCURACY RULES ===

⚠️ ONLY report information that is explicitly stated in the headlines above.
⚠️ DO NOT add specific names, statistics, or facts from your training data.
⚠️ Your training knowledge may be OUTDATED - officials, leaders, and facts change.
⚠️ If a headline is vague, keep your coverage general rather than adding specifics.
⚠️ When in doubt, describe the topic generally without inventing details.

EXAMPLE OF WHAT NOT TO DO:
- Headline says "NYC Mayor announces new policy"
- WRONG: "Mayor [specific name from training] announced..."
- RIGHT: "New York City's Mayor announced..."

=== STYLE GUIDELINES ===

✓ Be warm, professional, and conversational - like a trusted news friend
✓ Speak naturally, as if talking directly to ${listenerName}
✓ Use active voice and present tense when possible
✓ Vary sentence length for natural rhythm
✓ Include brief pauses (use "..." sparingly for effect)

✗ NO filler phrases: "stay tuned", "more on that later", "as always"
✗ NO URLs, website addresses, or "for more information visit..."
✗ NO source citations: "according to Reuters", "the Times reports"
✗ NO speculation or editorializing beyond what headlines state
✗ NO repeating the same information twice

Now write the complete ${label} script for ${dateInfo.dayOfWeek}, ${dateInfo.month} ${dateInfo.day}, ${dateInfo.year}:`;

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
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { category, voiceId, narratorName, state, storiesCount = 5, listenerName = 'listener', timezone = 'America/New_York' } = await request.json();
    if (!category) return NextResponse.json({ error: 'Category required' }, { status: 400 });
    const config = CATEGORY_CONFIG[category];
    if (!config) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    if (category === 'state' && !state) return NextResponse.json({ error: 'State required' }, { status: 400 });
    
    const narrator = narratorName || 'Your Host';
    let stories = await fetchGdeltNews(category, state, storiesCount);
    if (stories.length === 0) return NextResponse.json({ error: 'Could not fetch news' }, { status: 500 });
    
    const script = await generateScript(stories, config, narrator, state, listenerName, category, timezone);
    
    let audioUrl: string | null = null;
    let audioDuration: string | null = null;
    if (voiceId) {
      const audioBuffer = await generateAudio(script, voiceId);
      audioDuration = (Math.round(audioBuffer.length / 16000) / 60).toFixed(1);
      const fileName = `news-${category}-${Date.now()}.mp3`;
      await supabase.storage.from('news-audio').upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true });
      const { data } = supabase.storage.from('news-audio').getPublicUrl(fileName);
      audioUrl = data.publicUrl;
    }
    
    const { data: row } = await supabase.from('news_settings').select('settings').eq('id', '1').single();
    const settings = row?.settings || {};
    const cats = settings.categories || {};
    const ep = (cats[category]?.episode_number || 0) + 1;
    await supabase.from('news_settings').update({ settings: { ...settings, categories: { ...cats, [category]: { ...cats[category], last_generated: new Date().toISOString(), episode_number: ep, audio_url: audioUrl, duration: audioDuration } } }, updated_at: new Date().toISOString() }).eq('id', '1');
    
    return NextResponse.json({ success: true, episode: { category, state, episodeNumber: ep, script, audioUrl, duration: audioDuration, storiesUsed: stories.length, generatedAt: new Date().toISOString(), generationTimeMs: Date.now() - startTime } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  
  if (category) {
    const prompt = CATEGORY_PROMPTS[category];
    if (prompt) {
      return NextResponse.json({ category, prompt });
    }
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  
  return NextResponse.json({ 
    status: 'ok', 
    version: '4.0', 
    features: ['gdelt', 'duration', 'date-aware', 'timezone-aware', 'comprehensive-prompts'],
    prompts: CATEGORY_PROMPTS
  });
}
