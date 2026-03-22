import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Initialize clients
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// v4.0 - GENERIC NEWS BRIEFINGS (No Personalization)
// ============================================================
// Each briefing cycle generates 3 complete audio files per category:
//   morning, afternoon, evening
// Each audio file is self-contained: greeting + announcer + date + news + outro
// Client picks the right one based on device local time
// ============================================================

// ============================================================
// DATE UTILITY
// ============================================================

function formatSpokenDate(): string {
  // Use ET as the canonical date (most US listeners)
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return formatter.format(now);
}

function getCategoryDisplayName(categorySlug: string, state?: string): string {
  const names: Record<string, string> = {
    'state': state ? `${state} news` : 'state news',
    'national': 'national news',
    'world': 'world news',
    'business': 'business news',
    'sports': 'sports news',
    'science': 'science and tech news',
  };
  return names[categorySlug] || categorySlug;
}

// ============================================================
// SEARCH QUERIES BY CATEGORY
// ============================================================

function getSearchQuery(category: string, state?: string): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  switch (category) {
    case 'state':
      return `${state} news today ${today} breaking news weather sports`;
    case 'national':
      return `US national news today ${today} breaking news politics economy`;
    case 'world':
      return `world news today ${today} international breaking news`;
    case 'business':
      return `business news today ${today} stock market economy finance`;
    case 'sports':
      return `sports news today ${today} NFL NBA MLB scores trades`;
    case 'science':
      return `science technology news today ${today} AI tech innovation`;
    default:
      return `news today ${today}`;
  }
}

function getCategoryInstructions(category: string, state?: string): string {
  switch (category) {
    case 'state':
      return `Find the 5 most important news stories about ${state} from the last 6 hours:
- 3 hard news stories (public safety, weather, government, courts, schools, local economy)
- 2 sports stories (college teams, pro teams relevant to ${state})
Lead with emergencies or major breaking news if present.`;
    case 'national':
      return `Find the 5 most important US national news stories from the last 6 hours:
- Focus on: government, politics, economy, public safety, major national events
- Avoid celebrity gossip unless it's a major national story`;
    case 'world':
      return `Find the 5 most important world news stories from the last 6 hours that matter to Americans:
- Focus on: conflicts, diplomacy, disasters, global economy, major elections`;
    case 'business':
      return `Find the 5 most important business/finance news stories from the last 6 hours:
- Focus on: stock market moves, major earnings, Fed/interest rates, jobs, major deals`;
    case 'sports':
      return `Find the 5 most important sports news stories from the last 6 hours:
- Focus on: NFL, NBA, MLB, NHL, college sports, major trades, game results`;
    case 'science':
      return `Find the 5 most important science/tech news stories from the last 6 hours:
- Focus on: AI, cybersecurity, space, research breakthroughs, major tech announcements`;
    default:
      return `Find the 5 most important news stories from the last 6 hours.`;
  }
}

// ============================================================
// FULL SCRIPT ASSEMBLY (greeting + intro + body + outro)
// ============================================================

function assembleFullScript(params: {
  timePeriod: 'morning' | 'afternoon' | 'evening';
  narratorName: string;
  categoryDisplayName: string;
  dateSpoken: string;
  bodyText: string;
}): string {
  const { timePeriod, narratorName, categoryDisplayName, dateSpoken, bodyText } = params;

  const intro = `Good ${timePeriod}. I'm ${narratorName}, bringing you the ${categoryDisplayName} for ${dateSpoken}.`;
  const outro = `Thanks for spending a few minutes with me. I'm ${narratorName}, and I'll be back later today with your next update. Take care out there.`;

  return `${intro}\n\n${bodyText}\n\n${outro}`;
}

// ============================================================
// BODY GENERATION WITH OPENAI WEB SEARCH
// ============================================================

async function generateBodyWithSearch(params: {
  category: string;
  categoryDisplayName: string;
  state?: string;
  toneStyle: string;
  durationMinutes: number;
}): Promise<{ body: string; citations: string[] }> {
  const { category, categoryDisplayName, state, toneStyle, durationMinutes } = params;

  const wordTarget = durationMinutes * 130;
  const searchQuery = getSearchQuery(category, state);
  const categoryInstructions = getCategoryInstructions(category, state);

  const spokenDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const prompt = `You are a news researcher and script writer for Drive Time Tales, an audio news platform.

STEP 1: SEARCH FOR NEWS
Search the web for: "${searchQuery}"
${categoryInstructions}

STEP 2: WRITE THE SCRIPT BODY
Using ONLY the news you found from real sources, write a ${durationMinutes}-minute spoken news script body (about ${wordTarget} words).

IMPORTANT: Start the body with the spoken date "${spokenDate}." as the very first words, followed immediately by the first news story. For example: "${spokenDate}. A major development today..."

STYLE RULES:
- Tone: ${toneStyle}
- Conversational, confident, clear. Punchy sentences for audio.
- No bullets, no headings, no "Story 1" labels.
- 5 paragraphs, one per story, each 2-4 sentences.
- Most important story first.
- Use smooth transitions like "Meanwhile..." or "In other news..." or "Turning to..."
- DO NOT include any greeting (no "Good morning/afternoon/evening") - a separate intro handles that.
- DO NOT include any sign-off or outro - a separate outro handles that.
- DO NOT mention the state name as a greeting - start with the date then the first news story.

CRITICAL: 
- The body text must be CLEAN for audio - NO URLs or citations in the spoken text.
- Only include facts you found from real news sources.
- If you cannot find 5 credible stories, say so and include fewer.

STEP 3: LIST CITATIONS
After the body, list all source URLs you used, one per line.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
---BODY---
[Your spoken script body here - no URLs]

---CITATIONS---
[List each source URL on its own line]
---END---`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create({
      model: 'gpt-4o',
      tools: [{ type: 'web_search' }],
      input: prompt,
    });

    let fullText = '';
    if (response.output_text) {
      fullText = response.output_text;
    } else if (response.output && Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' && content.text) {
              fullText += content.text;
            }
          }
        }
      }
    }

    // Log GPT usage (responses API doesn't return token counts reliably — estimate)
    try {
      const { logGptCall } = await import('@/app/lib/openai-logger')
      const inTok = (response as any).usage?.input_tokens ?? Math.ceil(prompt.length / 4)
      const outTok = (response as any).usage?.output_tokens ?? Math.ceil(fullText.length / 4)
      logGptCall({ route: '/api/admin/generate-news', purpose: 'news-briefing', model: 'gpt-4o', inputTokens: inTok, outputTokens: outTok }).catch(() => {})
    } catch { /* never break */ }

    let body = '';
    const citations: string[] = [];

    const bodyMatch = fullText.match(/---BODY---\s*([\s\S]*?)\s*---CITATIONS---/);
    const citationsMatch = fullText.match(/---CITATIONS---\s*([\s\S]*?)\s*---END---/);

    if (bodyMatch) {
      body = bodyMatch[1].trim();
    } else {
      body = fullText.replace(/---BODY---|---CITATIONS---|---END---/g, '').trim();
    }

    if (citationsMatch) {
      const citationLines = citationsMatch[1].trim().split('\n');
      for (const line of citationLines) {
        const url = line.trim().match(/https?:\/\/[^\s]+/);
        if (url) {
          citations.push(url[0]);
        }
      }
    }

    body = body.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();

    return { body, citations };

  } catch (error) {
    console.error('[News Generator] OpenAI API error:', error);
    throw new Error('Failed to generate script body');
  }
}

// ============================================================
// TTS: Generate audio with ElevenLabs
// ============================================================

async function generateAndUploadAudio(params: {
  text: string;
  voiceId: string;
  storagePath: string;
}): Promise<{ audioUrl: string; duration: number } | null> {
  const { text, voiceId, storagePath } = params;

  try {
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!ttsResponse.ok) {
      console.error(`[TTS] Error: ${ttsResponse.status}`, await ttsResponse.text());
      return null;
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('audio')
      .upload(storagePath, Buffer.from(audioBuffer), {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError || !uploadData) {
      console.error('[TTS] Upload error:', uploadError);
      return null;
    }

    const { data: urlData } = supabaseAdmin.storage.from('audio').getPublicUrl(storagePath);
    const duration = Math.round(text.split(/\s+/).length / 130 * 10) / 10;

    return { audioUrl: urlData.publicUrl, duration };

  } catch (err) {
    console.error('[TTS] Failed:', err);
    return null;
  }
}

// ============================================================
// API ROUTES
// ============================================================

export async function GET() {
  return NextResponse.json({ status: 'ok', version: '4.0-generic-3-versions' });
}

export async function POST(request: NextRequest) {
  try {
    const reqBody = await request.json();
    const {
      category,
      voiceId,
      state,
      narratorName,
      toneStyle = 'warm, expressive, conversational - like a trusted friend giving you the news',
      durationMinutes = 2,
    } = reqBody;

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    if (!narratorName) {
      return NextResponse.json({ error: 'Narrator name is required' }, { status: 400 });
    }
    if (category === 'state' && !state) {
      return NextResponse.json({ error: 'State is required for state news' }, { status: 400 });
    }

    const dateSpoken = formatSpokenDate();
    const categoryDisplayName = getCategoryDisplayName(category, state);

    // ========================================
    // STEP 1: Generate news body (one time)
    // ========================================
    console.log(`[Generate News v4] Generating body for ${category}...`);

    let bodyText: string;
    let citations: string[] = [];

    try {
      const result = await generateBodyWithSearch({
        category,
        categoryDisplayName,
        state,
        toneStyle,
        durationMinutes,
      });
      bodyText = result.body;
      citations = result.citations;
    } catch (error) {
      console.error('[Generate News] Body generation failed:', error);
      return NextResponse.json({ error: 'Failed to generate script body' }, { status: 500 });
    }

    const wordCount = bodyText.split(/\s+/).length;
    const generatedAt = new Date().toISOString();

    // ========================================
    // STEP 2: Generate 3 complete audio files
    // ========================================
    const timePeriods: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening'];
    const results: Array<{
      timePeriod: string;
      audioUrl: string | null;
      duration: number | null;
      fullScript: string;
    }> = [];

    for (const timePeriod of timePeriods) {
      const fullScript = assembleFullScript({
        timePeriod,
        narratorName,
        categoryDisplayName,
        dateSpoken,
        bodyText,
      });

      let audioUrl: string | null = null;
      let duration: number | null = null;

      if (voiceId) {
        console.log(`[Generate News v4] TTS: ${category} / ${timePeriod}...`);
        const storagePath = `news/${category}${state ? '-' + state.toLowerCase().replace(/\s/g, '-') : ''}/${timePeriod}-${Date.now()}.mp3`;

        const audioResult = await generateAndUploadAudio({
          text: fullScript,
          voiceId,
          storagePath,
        });

        if (audioResult) {
          audioUrl = audioResult.audioUrl;
          duration = audioResult.duration;
        }

        // Small delay between TTS calls to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      results.push({ timePeriod, audioUrl, duration, fullScript });
    }

    // ========================================
    // STEP 3: Save to database
    // ========================================

    // Save script to generated_scripts
    const { data: savedScript, error: saveError } = await supabaseAdmin
      .from('generated_scripts')
      .insert({
        category_slug: category,
        is_personalized: false,
        generated_at: generatedAt,
        timezone_used: 'America/New_York',
        greeting_time_of_day: 'all',
        intro_text: '',
        body_text: bodyText,
        outro_text: '',
        news_items_json: citations.map(url => ({ source_url: url })),
        status: 'published',
      })
      .select()
      .single();

    if (saveError) {
      console.error('[Generate News] Save script error:', saveError);
    }

    // Save each time-period version to news_episodes
    for (const result of results) {
      if (result.audioUrl) {
        try {
          await supabaseAdmin.from('news_episodes').insert({
            category,
            state: state || null,
            script_text: result.fullScript,
            audio_url: result.audioUrl,
            narrator_name: narratorName,
            voice_id: voiceId,
            duration: result.duration,
            is_live: true,
            time_period: result.timePeriod,
            created_at: new Date().toISOString(),
          });
          console.log(`[Generate News v4] Saved: ${category} / ${result.timePeriod}`);
        } catch (epErr) {
          console.error(`[Generate News] news_episodes insert error (${result.timePeriod}):`, epErr);
        }
      }
    }

    // ========================================
    // STEP 4: Mark older episodes as not live
    // ========================================
    try {
      const newIds = results.filter(r => r.audioUrl).map(r => r.audioUrl);
      if (newIds.length > 0) {
        // Get IDs of just-inserted episodes
        const { data: newEpisodes } = await supabaseAdmin
          .from('news_episodes')
          .select('id')
          .eq('category', category)
          .eq('is_live', true)
          .order('created_at', { ascending: false })
          .limit(3);

        const keepIds = (newEpisodes || []).map(e => e.id);

        if (keepIds.length > 0) {
          // Mark all older episodes of this category as not live
          let archiveQuery = supabaseAdmin
            .from('news_episodes')
            .update({ is_live: false })
            .eq('category', category)
            .eq('is_live', true)
            .not('id', 'in', `(${keepIds.join(',')})`);

          if (state) {
            archiveQuery = archiveQuery.eq('state', state);
          }

          await archiveQuery;
          console.log(`[Generate News v4] Archived old ${category} episodes, keeping ${keepIds.length} new`);
        }
      }
    } catch (archiveErr) {
      console.error('[Generate News] Archive error:', archiveErr);
    }

    const successCount = results.filter(r => r.audioUrl).length;

    return NextResponse.json({
      success: true,
      script: {
        id: savedScript?.id,
        body: bodyText,
        citations,
        versions: results.map(r => ({
          timePeriod: r.timePeriod,
          audioUrl: r.audioUrl,
          duration: r.duration,
        })),
        metadata: {
          category,
          categoryDisplayName,
          dateSpoken,
          wordCount,
          citationsCount: citations.length,
          generatedAt,
          audioVersions: successCount,
        },
      },
    });

  } catch (error) {
    console.error('[Generate News] Error:', error);
    return NextResponse.json({ error: 'Failed to generate news script' }, { status: 500 });
  }
}
