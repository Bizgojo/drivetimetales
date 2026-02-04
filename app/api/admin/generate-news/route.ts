import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// NEWS TEMPLATES (MVP: Hardcoded 3 intro + 3 outro variants)
// ============================================================

interface TemplateParams {
  greetingTimeOfDay: 'morning' | 'afternoon' | 'evening';
  firstName?: string;
  narratorName: string;
  category: string;
  dateSpoken: string;
  isPersonalized: boolean;
}

const INTRO_TEMPLATES_PERSONALIZED = [
  `Good {GREETING}, {FIRST_NAME}. I'm {NARRATOR}, bringing you your {CATEGORY} update for {DATE}.`,
  `Good {GREETING}, {FIRST_NAME}. This is {NARRATOR} with your {CATEGORY} briefing for {DATE}.`,
  `Hey {FIRST_NAME}, good {GREETING}. I'm {NARRATOR}, and here's your {CATEGORY} news for {DATE}.`,
];

const INTRO_TEMPLATES_NON_PERSONALIZED = [
  `Good {GREETING}. I'm {NARRATOR}, bringing you your {CATEGORY} update for {DATE}.`,
  `Good {GREETING}. This is {NARRATOR} with your {CATEGORY} briefing for {DATE}.`,
  `Good {GREETING}, everyone. I'm {NARRATOR}, and here's your {CATEGORY} news for {DATE}.`,
];

const OUTRO_TEMPLATES_PERSONALIZED = [
  `{FIRST_NAME}, thanks for spending a couple minutes with me. I'm {NARRATOR}. I'll be back later with your next update.`,
  `That's your {CATEGORY} update, {FIRST_NAME}. I'm {NARRATOR}, and I'll see you next time.`,
  `Thanks for listening, {FIRST_NAME}. I'm {NARRATOR}. Stay safe out there, and I'll have more for you soon.`,
];

const OUTRO_TEMPLATES_NON_PERSONALIZED = [
  `Thanks for spending a couple minutes with me. I'm {NARRATOR}. I'll be back later with your next update.`,
  `That's your {CATEGORY} update. I'm {NARRATOR}, and I'll see you next time.`,
  `Thanks for listening. I'm {NARRATOR}. Stay safe out there, and I'll have more for you soon.`,
];

function deterministicHash(seed: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % max;
}

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function renderIntro(params: TemplateParams): string {
  const templates = params.isPersonalized ? INTRO_TEMPLATES_PERSONALIZED : INTRO_TEMPLATES_NON_PERSONALIZED;
  const seed = `${params.category}-${getTodayDateString()}-${params.greetingTimeOfDay}-${params.isPersonalized ? '1' : '0'}-intro`;
  const index = deterministicHash(seed, templates.length);
  
  let template = templates[index];
  template = template.replace(/{GREETING}/g, params.greetingTimeOfDay);
  template = template.replace(/{NARRATOR}/g, params.narratorName);
  template = template.replace(/{CATEGORY}/g, params.category);
  template = template.replace(/{DATE}/g, params.dateSpoken);
  if (params.isPersonalized && params.firstName) {
    template = template.replace(/{FIRST_NAME}/g, params.firstName);
  }
  return template;
}

function renderOutro(params: TemplateParams): string {
  const templates = params.isPersonalized ? OUTRO_TEMPLATES_PERSONALIZED : OUTRO_TEMPLATES_NON_PERSONALIZED;
  const seed = `${params.category}-${getTodayDateString()}-${params.greetingTimeOfDay}-${params.isPersonalized ? '1' : '0'}-outro`;
  const index = deterministicHash(seed, templates.length);
  
  let template = templates[index];
  template = template.replace(/{NARRATOR}/g, params.narratorName);
  template = template.replace(/{CATEGORY}/g, params.category);
  if (params.isPersonalized && params.firstName) {
    template = template.replace(/{FIRST_NAME}/g, params.firstName);
  }
  return template;
}

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
  'Texas': 'America/Chicago', 'Illinois': 'America/Chicago', 'Tennessee': 'America/Chicago',
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
    'state': state || 'state news',
    'national': 'national news',
    'world': 'world news',
    'business': 'business news',
    'sports': 'sports news',
    'science': 'science and tech news',
  };
  return names[categorySlug] || categorySlug;
}

// ============================================================
// NEWS ITEMS PARSING
// ============================================================

interface NewsItem {
  title: string;
  summary?: string;
  source_name?: string;
  source_url?: string;
  published_at?: string;
}

function parseNewsItems(input: string): { items: NewsItem[]; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { items: [], error: 'No news items provided' };
  
  // Try JSON first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const items: NewsItem[] = parsed.map((item: unknown) => {
          if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>;
            return {
              title: String(obj.title || ''),
              summary: obj.summary ? String(obj.summary) : undefined,
              source_name: obj.source_name ? String(obj.source_name) : undefined,
              source_url: obj.source_url ? String(obj.source_url) : undefined,
              published_at: obj.published_at ? String(obj.published_at) : undefined,
            };
          }
          return { title: String(item) };
        }).filter(item => item.title);
        return { items };
      }
    } catch { /* Not valid JSON, try plain text */ }
  }
  
  // Plain text parsing: split by blank lines
  const blocks = trimmed.split(/\n\s*\n/).filter(b => b.trim());
  const items: NewsItem[] = [];
  
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) continue;
    
    const item: NewsItem = { title: lines[0] };
    const urlLine = lines.find(l => l.match(/https?:\/\//));
    if (urlLine) {
      const urlMatch = urlLine.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        item.source_url = urlMatch[1];
        try {
          const url = new URL(item.source_url);
          item.source_name = url.hostname.replace('www.', '');
        } catch { /* Invalid URL */ }
      }
    }
    const nonTitleNonUrlLines = lines.slice(1).filter(l => !l.match(/https?:\/\//));
    if (nonTitleNonUrlLines.length > 0) {
      item.summary = nonTitleNonUrlLines.join(' ');
    }
    items.push(item);
  }
  
  return { items };
}

// ============================================================
// BODY GENERATION WITH CLAUDE
// ============================================================

const DEFAULT_BODY_PROMPT = `You are writing the BODY section of a news briefing script for Drive Time Tales, an audio platform for drivers and commuters.

Context:
- Category: {CATEGORY}
- Duration target: {DURATION_MINUTES} minutes (about {WORD_COUNT_TARGET} words)
- Tone/style: {TONE_STYLE}

GROUNDING AND SAFETY RULES (MUST FOLLOW):
- You will be given NEWS_ITEMS below. Use ONLY these items as facts.
- Do NOT add or invent any events, details, names, numbers, or claims beyond NEWS_ITEMS.
- If NEWS_ITEMS are empty or insufficient, say: "No verified updates were available in the last 6 hours for this category," and fill remaining time with evergreen, non-factual content only (commuting/safety reminder, "check local alerts"), without referencing any specific event.
- No rumors, no speculation, no unverified social media claims.
- Keep language broadcast-safe.

STYLE RULES:
- Write in a conversational, radio broadcaster style
- No bullet lists, no segment numbering, no headings
- Short paragraphs only (2-3 sentences each)
- Use smooth transitions between stories like "In other news..." or "Meanwhile..." or "Turning to..."
- Each story: what happened + why it matters (1-2 sentences each)
- Keep it factual; avoid speculation and rumors

NEWS_ITEMS:
{NEWS_ITEMS_JSON}

Write ONLY the body section now. Do not include any intro or outro - just the news content.
Start directly with the first story. End after the last story.`;

async function generateBody(params: {
  categoryDisplayName: string;
  newsItems: NewsItem[];
  toneStyle: string;
  durationMinutes: number;
  wordCountTarget: number;
  customPrompt?: string;
}): Promise<string> {
  const { categoryDisplayName, newsItems, toneStyle, durationMinutes, wordCountTarget, customPrompt } = params;
  
  let prompt = customPrompt || DEFAULT_BODY_PROMPT;
  prompt = prompt.replace(/{CATEGORY}/g, categoryDisplayName);
  prompt = prompt.replace(/{DURATION_MINUTES}/g, String(durationMinutes));
  prompt = prompt.replace(/{WORD_COUNT_TARGET}/g, String(wordCountTarget));
  prompt = prompt.replace(/{TONE_STYLE}/g, toneStyle);
  prompt = prompt.replace(/{NEWS_ITEMS_JSON}/g, JSON.stringify(newsItems, null, 2));
  
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return text.trim();
  } catch (error) {
    console.error('[News Generator] Claude API error:', error);
    throw new Error('Failed to generate script body');
  }
}

// ============================================================
// API ROUTES
// ============================================================

export async function GET() {
  return NextResponse.json({ status: 'ok', version: '1.0-news-generator' });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      category,
      newsItemsRaw,
      isPersonalized = false,
      firstName = 'Marc',
      state,
      narratorName,
      toneStyle = 'warm, professional radio broadcaster',
      durationMinutes = 3,
      customPrompt,
    } = body;
    
    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    
    if (!narratorName) {
      return NextResponse.json({ error: 'Narrator name is required' }, { status: 400 });
    }
    
    // Parse news items
    const { items: newsItems, error: parseError } = parseNewsItems(newsItemsRaw || '');
    
    // Determine timezone and greeting
    const timezone = state ? getTimezoneFromState(state) : 'America/New_York';
    const greetingTimeOfDay = getGreetingTimeOfDay(timezone);
    const dateSpoken = formatSpokenDate(timezone);
    const categoryDisplayName = getCategoryDisplayName(category, state);
    const wordCountTarget = Math.round(durationMinutes * 130);
    
    // Generate intro and outro
    const templateParams: TemplateParams = {
      greetingTimeOfDay,
      firstName: isPersonalized ? firstName : undefined,
      narratorName,
      category: categoryDisplayName,
      dateSpoken,
      isPersonalized,
    };
    
    const intro = renderIntro(templateParams);
    const outro = renderOutro(templateParams);
    
    // Generate body
    let bodyText: string;
    try {
      bodyText = await generateBody({
        categoryDisplayName,
        newsItems,
        toneStyle,
        durationMinutes,
        wordCountTarget,
        customPrompt,
      });
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
        news_items_json: newsItems,
        status: 'draft',
      })
      .select()
      .single();
    
    if (saveError) {
      console.error('[Generate News] Save error:', saveError);
      // Continue anyway - script was generated
    }
    
    return NextResponse.json({
      success: true,
      script: {
        id: savedScript?.id,
        intro,
        body: bodyText,
        outro,
        metadata: {
          category,
          isPersonalized,
          timezoneUsed: timezone,
          greetingTimeOfDay,
          dateSpoken,
          newsItemsCount: newsItems.length,
          newsItemsParsed: newsItems,
          wordCount,
          generatedAt,
          parseError,
        },
      },
    });
    
  } catch (error) {
    console.error('[Generate News] Error:', error);
    return NextResponse.json({ error: 'Failed to generate news script' }, { status: 500 });
  }
}
