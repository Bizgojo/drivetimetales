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

const CATEGORY_CONFIG: Record<string, { label: string; searchInstructions: string }> = {
  national: { label: 'National News', searchInstructions: 'Search for top US national news stories from today.' },
  international: { label: 'International News', searchInstructions: 'Search for top international and world news stories from today.' },
  business: { label: 'Business & Finance', searchInstructions: 'Search for top business and finance news from today.' },
  sports: { label: 'Sports', searchInstructions: 'Search for top sports news from today.' },
  science: { label: 'Science & Technology', searchInstructions: 'Search for top science and technology news from today.' },
  state: { label: 'Local News', searchInstructions: 'Search for local news and weather for STATE_NAME.' }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, voiceId, narratorName, state, storiesCount = 5 } = body;

    if (!category) return NextResponse.json({ error: 'Category is required' }, { status: 400 });

    let config = CATEGORY_CONFIG[category];
    if (!config) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });

    if (category === 'state') {
      if (!state) return NextResponse.json({ error: 'State is required for local news' }, { status: 400 });
      config = { ...config, label: `${state} Local News`, searchInstructions: config.searchInstructions.replace('STATE_NAME', state) };
    }

    const script = await generateNewsScript(config, narratorName || 'Your Host', storiesCount);

    let audioUrl: string | null = null;
    if (voiceId) {
      try {
        const audioBuffer = await generateAudio(script, voiceId);
        const fileName = `news-${category}${state ? `-${state.toLowerCase().replace(/\s+/g, '-')}` : ''}-${Date.now()}.mp3`;
        const { error: uploadError } = await supabase.storage.from('news-audio').upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
          audioUrl = urlData.publicUrl;
        }
      } catch (audioError) {
        console.error('[Generate News] Audio error:', audioError);
      }
    }

    const { data: settingsRow } = await supabase.from('news_settings').select('settings').eq('id', '1').single();
    const currentSettings = settingsRow?.settings || {};
    const currentCategories = currentSettings.categories || {};
    const currentEpisode = currentCategories[category]?.episode_number || 0;
    const newEpisode = currentEpisode + 1;

    const updatedSettings = {
      ...currentSettings,
      categories: { ...currentCategories, [category]: { ...currentCategories[category], last_generated: new Date().toISOString(), episode_number: newEpisode, audio_url: audioUrl } }
    };

    await supabase.from('news_settings').update({ settings: updatedSettings, updated_at: new Date().toISOString() }).eq('id', '1');

    if (audioUrl) {
      await supabase.from('news_episodes').insert({ category, state: state || null, episode_number: newEpisode, script, audio_url: audioUrl, narrator_name: narratorName, voice_id: voiceId, created_at: new Date().toISOString() });
    }

    return NextResponse.json({ success: true, episode: { category, state, episodeNumber: newEpisode, script, audioUrl, generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('[Generate News] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed' }, { status: 500 });
  }
}

async function generateNewsScript(config: { label: string; searchInstructions: string }, narrator: string, storiesCount: number): Promise<string> {
  const hour = new Date().getHours();
  let timeGreeting = 'morning';
  if (hour >= 12 && hour < 17) timeGreeting = 'afternoon';
  else if (hour >= 17) timeGreeting = 'evening';

  const systemMessage = `You are a professional radio news broadcaster named ${narrator}. Output ONLY the final broadcast script - no thinking, no search methodology, no meta-commentary. Every word you output will be spoken aloud by text-to-speech.`;

  const prompt = `Search for today's top ${storiesCount} ${config.label.toLowerCase()} stories: ${config.searchInstructions}

Then output ONLY this format:

Good ${timeGreeting}, I'm ${narrator} with your ${config.label} briefing.

[${storiesCount} news stories, 3-5 sentences each, broadcast style]

That's your ${config.label} update. Thanks for listening, and have a great ${timeGreeting}. Be safe out there.

RULES:
- Start IMMEDIATELY with "Good ${timeGreeting}" - no preamble
- NO phrases like "I searched", "I found", "According to", "Here's what"
- NO URLs, citations, or source attributions
- Use Fahrenheit, US dollars, miles/feet/inches
- Broadcast style - conversational and clear`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: systemMessage,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const }],
    messages: [{ role: 'user', content: prompt }],
  });

  let rawOutput = '';
  for (const block of message.content) {
    if (block.type === 'text') rawOutput += block.text;
  }

  let script = rawOutput;
  const greetingMatch = script.match(/Good (morning|afternoon|evening)/i);
  if (greetingMatch && greetingMatch.index !== undefined) script = script.substring(greetingMatch.index);

  script = script.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/<[^>]+>/g, '').replace(/^.*?(I searched|I found|Let me search|Based on my|According to my|Here's what|I'll search).*?\n/gim, '').replace(/\[\d+\]/g, '').replace(/\(Source:.*?\)/gi, '').replace(/https?:\/\/[^\s]+/g, '').replace(/\n{3,}/g, '\n\n').trim();

  return script;
}

async function generateAudio(script: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    body: JSON.stringify({ text: script, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!response.ok) throw new Error(`ElevenLabs API error: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'generate-news' });
}
