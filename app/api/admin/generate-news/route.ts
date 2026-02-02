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

const INTRO_OPTIONS = [
  "Good {timeOfDay}, listeners! I'm {narratorName} with your {category} briefing for {date}.",
  "Hey there! {narratorName} here with today's top {category} stories.",
  "Welcome! Let's get you caught up on {category} news.",
  "Good {timeOfDay}! Here's what's happening in {category} news.",
  "It's {date}, and I'm {narratorName}. Let's dive into {category} news."
];

const OUTRO_OPTIONS = [
  "That's your {category} update. Drive safe!",
  "I'm {narratorName}. Thanks for listening. See you next time!",
  "That's the news. Have a great {timeOfDay}!",
  "Stay informed and drive safe. This is {narratorName}.",
  "That wraps up {category} news. Thanks for tuning in!"
];

interface NewsStory { headline: string; summary: string; source: string; }

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

async function fetchNewsAPI(category: string, count: number): Promise<NewsStory[]> {
  if (!NEWSAPI_KEY) return [];
  try {
    const catMap: Record<string, string> = { national: 'general', world: 'general', business: 'business', sports: 'sports', science: 'technology' };
    const newsCat = catMap[category] || 'general';
    const country = category === 'world' ? '' : 'us';
    let url = `https://newsapi.org/v2/top-headlines?apiKey=${NEWSAPI_KEY}&pageSize=${count * 2}`;
    if (country) url += `&country=${country}`;
    if (newsCat !== 'general') url += `&category=${newsCat}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const d = await r.json();
    const stories: NewsStory[] = [];
    const seen = new Set<string>();
    for (const a of d.articles || []) {
      if (stories.length >= count) break;
      if (!a.title || a.title === '[Removed]') continue;
      const norm = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
      if (seen.has(norm)) continue;
      seen.add(norm);
      stories.push({ headline: a.title, summary: a.description || '', source: a.source?.name || 'News' });
    }
    return stories;
  } catch { return []; }
}

async function fetchWorldNewsAPI(category: string, count: number): Promise<NewsStory[]> {
  if (!WORLD_NEWS_API_KEY) return [];
  try {
    let url = `https://api.worldnewsapi.com/search-news?api-key=${WORLD_NEWS_API_KEY}&language=en&number=${count * 2}`;
    if (category === 'national') url += '&source-countries=us&text=United States';
    else if (category === 'world') url += '&text=international global world';
    else if (category === 'business') url += '&text=business economy market';
    else if (category === 'sports') url += '&text=NFL NBA MLB NHL sports';
    else if (category === 'science') url += '&text=science technology space AI';
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const d = await r.json();
    const stories: NewsStory[] = [];
    for (const a of d.news || []) {
      if (stories.length >= count) break;
      if (!a.title) continue;
      stories.push({ headline: a.title, summary: a.text?.substring(0, 200) || '', source: a.source || 'News' });
    }
    return stories;
  } catch { return []; }
}

async function fetchGDELT(state: string, count: number): Promise<NewsStory[]> {
  try {
    const q = `"${state}" sourcecountry:US sourcelang:english`;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&maxrecords=${count * 3}&format=json&sort=DateDesc&timespan=24h`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const d = await r.json();
    const stories: NewsStory[] = [];
    for (const a of d.articles || []) {
      if (stories.length >= count) break;
      if (!a.title) continue;
      stories.push({ headline: a.title, summary: '', source: a.source || 'News' });
    }
    return stories;
  } catch { return []; }
}

export async function POST(request: NextRequest) {
  try {
    const { category, state } = await request.json();
    if (!category) return NextResponse.json({ error: 'Category required' }, { status: 400 });
    if (category === 'state' && !state) return NextResponse.json({ error: 'State required' }, { status: 400 });

    console.log(`[Generate] Starting: ${category}${state ? ` (${state})` : ''}`);

    const { data: settings, error: settingsError } = await supabase
      .from('news_settings')
      .select('*')
      .eq('category', category)
      .single();

    if (settingsError || !settings) {
      console.error('[Generate] Settings error:', settingsError);
      return NextResponse.json({ error: 'Category not found in settings' }, { status: 400 });
    }

    if (!settings.narrator_name || !settings.voice_id) {
      return NextResponse.json({ error: 'Set narrator name and voice in Admin first' }, { status: 400 });
    }

    const narratorName = settings.narrator_name;
    const voiceId = settings.voice_id;
    const promptData = settings.prompt_data || {};
    const storyCount = parseInt(promptData.storyCount) || 5;

    let stories: NewsStory[] = [];
    if (category === 'state' && state) {
      stories = await fetchGDELT(state, storyCount);
    } else {
      if (NEWSAPI_KEY) stories = await fetchNewsAPI(category, storyCount);
      if (stories.length < storyCount && WORLD_NEWS_API_KEY) {
        const backup = await fetchWorldNewsAPI(category, storyCount - stories.length);
        stories = [...stories, ...backup];
      }
      if (stories.length === 0) stories = await fetchGDELT('United States', storyCount);
    }

    if (stories.length === 0) {
      return NextResponse.json({ error: 'Could not fetch news stories' }, { status: 500 });
    }

    console.log('[Generate] Got', stories.length, 'stories');

    const timeOfDay = getTimeOfDay();
    const date = getFormattedDate();
    const catLabel = state || (category.charAt(0).toUpperCase() + category.slice(1));
    
    const intro = INTRO_OPTIONS[Math.floor(Math.random() * INTRO_OPTIONS.length)]
      .replace(/{narratorName}/g, narratorName).replace(/{category}/g, catLabel).replace(/{timeOfDay}/g, timeOfDay).replace(/{date}/g, date);
    const outro = OUTRO_OPTIONS[Math.floor(Math.random() * OUTRO_OPTIONS.length)]
      .replace(/{narratorName}/g, narratorName).replace(/{category}/g, catLabel).replace(/{timeOfDay}/g, timeOfDay);

    const storiesList = stories.map((s, i) => `${i + 1}. ${s.headline}${s.summary ? ' - ' + s.summary : ''}`).join('\n');
    const duration = promptData.targetDuration || '3';
    const maxSec = promptData.maxSecondsPerStory || '30';

    const prompt = `You are ${narratorName}, a professional radio news broadcaster.
Create a ${duration}-minute ${catLabel} news briefing.

NEWS TO COVER:
${storiesList}

RULES:
- ${maxSec} seconds per story MAXIMUM
- Headlines and key facts only - NO deep analysis
- Fast-paced like radio news
- NO fluff, celebrity, or lifestyle content

SCRIPT STRUCTURE:
1. OPENING: "${intro}"
2. NEWS: Cover the stories quickly
3. CLOSING: "${outro}"

Write the script now. Output ONLY the spoken words.`;

    console.log('[Generate] Calling Claude...');
    const claudeR = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    });

    if (!claudeR.ok) {
      console.error('[Generate] Claude error:', claudeR.status);
      throw new Error('Claude API error');
    }

    const claudeD = await claudeR.json();
    let script = '';
    for (const b of claudeD.content) if (b.type === 'text') script += b.text;
    script = script.replace(/```[\s\S]*?```/g, '').trim();
    console.log('[Generate] Script length:', script.length);

    console.log('[Generate] Generating audio...');
    const audioR = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });

    if (!audioR.ok) {
      console.error('[Generate] ElevenLabs error:', audioR.status);
      throw new Error('ElevenLabs error');
    }

    const audioBuffer = Buffer.from(await audioR.arrayBuffer());
    const durationMin = (audioBuffer.byteLength / 16000 / 60).toFixed(1);
    console.log('[Generate] Audio size:', audioBuffer.byteLength, 'Duration:', durationMin, 'min');

    const timestamp = Date.now();
    const fileName = state ? `state-${state.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.mp3` : `${category}-${timestamp}.mp3`;
    const filePath = `news/${fileName}`;

    console.log('[Generate] Uploading to:', filePath);
    const { error: uploadError } = await supabase.storage.from('audio').upload(filePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

    if (uploadError) {
      console.error('[Generate] Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from('audio').getPublicUrl(filePath);
    const audioUrl = urlData.publicUrl;
    console.log('[Generate] Audio URL:', audioUrl);

    if (state) {
      await supabase.from('news_episodes').update({ is_live: false }).eq('category', category).eq('state', state);
    } else {
      await supabase.from('news_episodes').update({ is_live: false }).eq('category', category).is('state', null);
    }

    const { data: episode, error: insertError } = await supabase.from('news_episodes').insert({
      category, state: state || null, audio_url: audioUrl, script_text: script,
      narrator_name: narratorName, voice_id: voiceId, duration: durationMin, is_live: true, created_at: new Date().toISOString()
    }).select().single();

    if (insertError) {
      console.error('[Generate] Insert error:', insertError);
      return NextResponse.json({ error: 'Save failed: ' + insertError.message }, { status: 500 });
    }

    console.log('[Generate] Complete!');
    return NextResponse.json({
      success: true,
      episode: { id: episode.id, category, state: state || null, audioUrl, duration: durationMin, narratorName, createdAt: episode.created_at }
    });

  } catch (error) {
    console.error('[Generate] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', version: '5.0-20260202' });
}
