// app/api/admin/generate-news/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface CategoryConfig { label: string; gdeltQuery: string; fallbackSearchQuery: string; }
interface NewsStory { headline: string; summary: string; source: string; }
interface GdeltArticle { title: string; url: string; source: string; }

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  national: { label: 'National News', gdeltQuery: 'sourcecountry:US sourcelang:english', fallbackSearchQuery: 'top US national news today' },
  international: { label: 'International News', gdeltQuery: '-sourcecountry:US sourcelang:english', fallbackSearchQuery: 'top international world news today' },
  business: { label: 'Business & Finance', gdeltQuery: 'business economy finance market sourcelang:english', fallbackSearchQuery: 'top business finance market news today' },
  sports: { label: 'Sports', gdeltQuery: 'sports NFL NBA soccer football sourcelang:english', fallbackSearchQuery: 'top sports news scores today' },
  science: { label: 'Science & Technology', gdeltQuery: '(theme:SCIENCE OR theme:TECHNOLOGY) sourcelang:english', fallbackSearchQuery: 'top science technology tech news today' },
  state: { label: 'Local News', gdeltQuery: 'sourcecountry:US sourcelang:english', fallbackSearchQuery: 'STATE_NAME news today' }
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

async function generateScript(stories: NewsStory[], config: CategoryConfig, narrator: string, state: string | null, listenerName: string, categoryId: string): Promise<string> {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const label = state ? `${state} News` : config.label;
  const storiesText = stories.map((s, i) => `${i + 1}. ${s.headline}`).join('\n');
  
  const guidance: Record<string, string> = {
    state: `Focus on ${state} state government, local crime, community events, weather, elections, sports.`,
    national: `Focus on the President, White House, Congress, Supreme Court, federal policy, national elections, social issues.`,
    international: `Focus on foreign elections, international conflicts, global economics, diplomacy.`,
    sports: `Focus on game results, player trades, championships, college sports.`,
    science: `Focus on scientific breakthroughs, space, medicine, technology, AI.`,
    business: `Focus on markets, corporate earnings, small business, real estate. Introduce companies with location and what they do.`
  };

  const prompt = `You are ${narrator}, a radio news broadcaster. Write a 600-800 word script (about 4-5 minutes when read aloud) for these ${label} stories.

${guidance[state ? 'state' : categoryId] || ''}

STORIES:
${storiesText}

REQUIREMENTS:
1. Greet listener "${listenerName}" by name and introduce yourself as ${narrator}
2. Cover each story in 3-5 sentences, most important first
3. Sign off mentioning ${listenerName} and your name ${narrator}
4. Be warm and conversational. NO URLs or citations.`;

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
    const { category, voiceId, narratorName, state, storiesCount = 5, listenerName = 'Marc' } = await request.json();
    if (!category) return NextResponse.json({ error: 'Category required' }, { status: 400 });
    const config = CATEGORY_CONFIG[category];
    if (!config) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    if (category === 'state' && !state) return NextResponse.json({ error: 'State required' }, { status: 400 });
    
    const narrator = narratorName || 'Your Host';
    let stories = await fetchGdeltNews(category, state, storiesCount);
    if (stories.length === 0) return NextResponse.json({ error: 'Could not fetch news' }, { status: 500 });
    
    const script = await generateScript(stories, config, narrator, state, listenerName, category);
    
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

export async function GET() {
  return NextResponse.json({ status: 'ok', version: '2.0', features: ['gdelt', 'duration'] });
}