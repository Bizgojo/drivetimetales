import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Initialize clients
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// TIMEZONE & DATE UTILITIES
// ============================================================

const STATE_TIMEZONES: Record<string, string> = {
  'South Carolina': 'America/New_York', 'North Carolina': 'America/New_York', 'Georgia': 'America/New_York',
  'Florida': 'America/New_York', 'Virginia': 'America/New_York', 'New York': 'America/New_York',
  'Pennsylvania': 'America/New_York', 'Ohio': 'America/New_York', 'Michigan': 'America/New_York',
  'Massachusetts': 'America/New_York', 'New Jersey': 'America/New_York', 'Connecticut': 'America/New_York',
  'Maine': 'America/New_York', 'Maryland': 'America/New_York', 'Delaware': 'America/New_York',
  'Vermont': 'America/New_York', 'New Hampshire': 'America/New_York', 'Rhode Island': 'America/New_York',
  'West Virginia': 'America/New_York', 'Kentucky': 'America/New_York', 'Indiana': 'America/New_York',
  'Tennessee': 'America/Chicago', 'Texas': 'America/Chicago', 'Illinois': 'America/Chicago',
  'Missouri': 'America/Chicago', 'Wisconsin': 'America/Chicago', 'Minnesota': 'America/Chicago',
  'Iowa': 'America/Chicago', 'Kansas': 'America/Chicago', 'Nebraska': 'America/Chicago',
  'Oklahoma': 'America/Chicago', 'Louisiana': 'America/Chicago', 'Arkansas': 'America/Chicago',
  'Mississippi': 'America/Chicago', 'Alabama': 'America/Chicago', 'North Dakota': 'America/Chicago',
  'South Dakota': 'America/Chicago', 'Colorado': 'America/Denver', 'Arizona': 'America/Phoenix',
  'Utah': 'America/Denver', 'New Mexico': 'America/Denver', 'Wyoming': 'America/Denver',
  'Montana': 'America/Denver', 'Idaho': 'America/Boise', 'California': 'America/Los_Angeles',
  'Washington': 'America/Los_Angeles', 'Oregon': 'America/Los_Angeles', 'Nevada': 'America/Los_Angeles',
  'Alaska': 'America/Anchorage', 'Hawaii': 'Pacific/Honolulu',
};

function getTimezoneFromState(state: string): string {
  return STATE_TIMEZONES[state] || 'America/New_York';
}

function getGreetingTimeOfDay(timezone: string): 'morning' | 'afternoon' | 'evening' {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
  const hour = parseInt(formatter.format(now), 10);
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

function formatSpokenDate(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
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
// INTRO / OUTRO GENERATION (FIXED TEMPLATES)
// ============================================================

function generateIntro(params: {
  greetingTimeOfDay: 'morning' | 'afternoon' | 'evening';
  firstName: string | null;
  newscasterName: string;
  categoryDisplayName: string;
  dateSpoken: string;
  isPersonalized: boolean;
}): string {
  const { greetingTimeOfDay, firstName, newscasterName, categoryDisplayName, dateSpoken, isPersonalized } = params;
  
  if (isPersonalized && firstName) {
    return `Good ${greetingTimeOfDay}, ${firstName}. I'm ${newscasterName}, bringing you the ${categoryDisplayName} for ${dateSpoken}.`;
  } else {
    return `Good ${greetingTimeOfDay}. I'm ${newscasterName}, bringing you the ${categoryDisplayName} for ${dateSpoken}.`;
  }
}

function generateOutro(params: {
  firstName: string | null;
  newscasterName: string;
  isPersonalized: boolean;
}): string {
  const { firstName, newscasterName, isPersonalized } = params;
  
  if (isPersonalized && firstName) {
    return `${firstName}, thanks for spending a few minutes with me. I'm ${newscasterName}, and I'll be back later today with your next update. Take care out there.`;
  } else {
    return `Thanks for spending a few minutes with me. I'm ${newscasterName}, and I'll be back later today with your next update. Take care out there.`;
  }
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

  const prompt = `You are a news researcher and script writer for Drive Time Tales, an audio news platform.

STEP 1: SEARCH FOR NEWS
Search the web for: "${searchQuery}"
${categoryInstructions}

STEP 2: WRITE THE SCRIPT BODY
Using ONLY the news you found from real sources, write a ${durationMinutes}-minute spoken news script body (about ${wordTarget} words).

STYLE RULES:
- Tone: ${toneStyle}
- Conversational, confident, clear. Punchy sentences for audio.
- No bullets, no headings, no "Story 1" labels.
- 5 paragraphs, one per story, each 2-4 sentences.
- Most important story first.
- Use smooth transitions like "Meanwhile..." or "In other news..." or "Turning to..."
- DO NOT include any greeting (no "Good morning/afternoon/evening") - the intro handles that.
- DO NOT mention the state name as a greeting - just start with the first news story.

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
    // Use GPT-4o with web search capability via Responses API
    const response = await openai.responses.create({
      model: 'gpt-4o',
      tools: [{ type: 'web_search' }],
      input: prompt,
    });
    
    // Extract text from response - use output_text convenience property
    let fullText = '';
    if (response.output_text) {
      fullText = response.output_text;
    } else if (response.output && Array.isArray(response.output)) {
      // Fallback: iterate through output array
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
    
    // Parse body and citations
    let body = '';
    const citations: string[] = [];
    
    const bodyMatch = fullText.match(/---BODY---\s*([\s\S]*?)\s*---CITATIONS---/);
    const citationsMatch = fullText.match(/---CITATIONS---\s*([\s\S]*?)\s*---END---/);
    
    if (bodyMatch) {
      body = bodyMatch[1].trim();
    } else {
      // Fallback: try to extract body without markers
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
    
    // Clean any stray URLs from body (safety check)
    body = body.replace(/https?:\/\/[^\s]+/g, '').replace(/\s+/g, ' ').trim();
    
    return { body, citations };
    
  } catch (error) {
    console.error('[News Generator] OpenAI API error:', error);
    throw new Error('Failed to generate script body');
  }
}

// ============================================================
// API ROUTES
// ============================================================

export async function GET() {
  return NextResponse.json({ status: 'ok', version: '3.1-openai-web-search' });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      category,
      voiceId,
      isPersonalized = false,
      firstName = 'Marc',
      state,
      narratorName,
      toneStyle = 'warm, expressive, conversational - like a trusted friend giving you the news',
      durationMinutes = 2,
    } = body;
    
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    
    if (!narratorName) {
      return NextResponse.json({ error: 'Narrator name is required' }, { status: 400 });
    }
    
    if (category === 'state' && !state) {
      return NextResponse.json({ error: 'State is required for state news' }, { status: 400 });
    }
    
    // Determine timezone and greeting
    const timezone = state ? getTimezoneFromState(state) : 'America/New_York';
    const greetingTimeOfDay = getGreetingTimeOfDay(timezone);
    const dateSpoken = formatSpokenDate(timezone);
    const categoryDisplayName = getCategoryDisplayName(category, state);
    
    // Generate INTRO
    const intro = generateIntro({
      greetingTimeOfDay,
      firstName: isPersonalized ? firstName : null,
      newscasterName: narratorName,
      categoryDisplayName,
      dateSpoken,
      isPersonalized,
    });
    
    // Generate OUTRO
    const outro = generateOutro({
      firstName: isPersonalized ? firstName : null,
      newscasterName: narratorName,
      isPersonalized,
    });
    
    // Generate BODY with web search
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
    
    // Save to database
    const { data: savedScript, error: saveError } = await supabaseAdmin
      .from('generated_scripts')
      .insert({
        category_slug: category,
        is_personalized: isPersonalized,
        generated_at: generatedAt,
        timezone_used: timezone,
        greeting_time_of_day: greetingTimeOfDay,
        intro_text: intro,
        body_text: bodyText,
        outro_text: outro,
        news_items_json: citations.map(url => ({ source_url: url })),
        status: 'draft',
      })
      .select()
      .single();
    
    if (saveError) {
      console.error('[Generate News] Save error:', saveError);
    }
    
    // Generate audio with ElevenLabs if voiceId provided - BODY ONLY (no intro/outro)
    // Intros/outros are separate pre-recorded audio files played by the client
    let audioUrl: string | null = null;
    let audioDuration: number | null = null;
    
    if (voiceId) {
      try {
        console.log(`[Generate News] Generating TTS for ${category} with voice ${voiceId}`);
        
        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY!,
          },
          body: JSON.stringify({
            text: bodyText,
            model_id: 'eleven_turbo_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });
        
        if (ttsResponse.ok) {
          const audioBuffer = await ttsResponse.arrayBuffer();
          const fileName = `news/${category}${state ? '-' + state.toLowerCase().replace(/\s/g, '-') : ''}/${Date.now()}.mp3`;
          
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('audio')
            .upload(fileName, Buffer.from(audioBuffer), {
              contentType: 'audio/mpeg',
              upsert: true,
            });
          
          if (!uploadError && uploadData) {
            const { data: urlData } = supabaseAdmin.storage.from('audio').getPublicUrl(fileName);
            audioUrl = urlData.publicUrl;
            audioDuration = Math.round(bodyText.split(/\s+/).length / 130 * 10) / 10;
            console.log(`[Generate News] Audio uploaded: ${audioUrl}`);
          } else {
            console.error('[Generate News] Upload error:', uploadError);
          }
        } else {
          console.error('[Generate News] TTS error:', ttsResponse.status, await ttsResponse.text());
        }
      } catch (ttsErr) {
        console.error('[Generate News] TTS failed:', ttsErr);
      }
    }
    
    // Save to news_episodes if audio was generated
    if (audioUrl) {
      try {
        await supabaseAdmin.from('news_episodes').insert({
          category,
          state: state || null,
          script_text: `${intro}\n\n${bodyText}\n\n${outro}`,
          audio_url: audioUrl,
          narrator_name: narratorName,
          voice_id: voiceId,
          duration: audioDuration,
          is_live: true,
          created_at: new Date().toISOString(),
        });
        console.log(`[Generate News] Saved to news_episodes: ${category}`);
      } catch (epErr) {
        console.error('[Generate News] news_episodes insert error:', epErr);
      }
    }
    
    return NextResponse.json({
      success: true,
      script: {
        id: savedScript?.id,
        intro,
        body: bodyText,
        outro,
        citations,
        metadata: {
          category,
          categoryDisplayName,
          isPersonalized,
          timezoneUsed: timezone,
          greetingTimeOfDay,
          dateSpoken,
          wordCount,
          citationsCount: citations.length,
          generatedAt,
          audioUrl,
        },
      },
    });
    
  } catch (error) {
    console.error('[Generate News] Error:', error);
    return NextResponse.json({ error: 'Failed to generate news script' }, { status: 500 });
  }
}
