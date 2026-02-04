// News Briefings - Core Generator Logic
// Takes NEWS_ITEMS and produces intro/body/outro using Claude

import Anthropic from '@anthropic-ai/sdk';
import {
  renderIntro,
  renderOutro,
  getGreetingTimeOfDay,
  formatSpokenDate,
  getTimezoneFromState,
  getCategoryDisplayName,
  TemplateParams,
} from './news-templates';

export interface NewsItem {
  title: string;
  summary?: string;
  source_name?: string;
  source_url?: string;
  published_at?: string;
}

export interface GenerateScriptParams {
  categorySlug: string;
  narratorName: string;
  state?: string; // For state news
  isPersonalized: boolean;
  firstName?: string; // For personalized mode (default: "Marc" for preview)
  newsItems: NewsItem[];
  toneStyle?: string;
  durationMinutes?: number;
  customPrompt?: string;
}

export interface GeneratedScript {
  intro: string;
  body: string;
  outro: string;
  metadata: {
    categorySlug: string;
    isPersonalized: boolean;
    timezoneUsed: string;
    greetingTimeOfDay: 'morning' | 'afternoon' | 'evening';
    dateSpoken: string;
    newsItemsCount: number;
    wordCount: number;
    generatedAt: string;
  };
}

// Default prompt template for body generation
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

/**
 * Parse news items from text input
 * Supports JSON array or plain text format
 */
export function parseNewsItems(input: string): { items: NewsItem[]; error?: string } {
  const trimmed = input.trim();
  
  if (!trimmed) {
    return { items: [], error: 'No news items provided' };
  }
  
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
    } catch {
      // Not valid JSON, try plain text parsing
    }
  }
  
  // Plain text parsing: split by blank lines
  const blocks = trimmed.split(/\n\s*\n/).filter(b => b.trim());
  const items: NewsItem[] = [];
  
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) continue;
    
    const item: NewsItem = { title: lines[0] };
    
    // Look for URL in any line
    const urlLine = lines.find(l => l.match(/https?:\/\//));
    if (urlLine) {
      const urlMatch = urlLine.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        item.source_url = urlMatch[1];
        // Extract domain as source name
        try {
          const url = new URL(item.source_url);
          item.source_name = url.hostname.replace('www.', '');
        } catch {
          // Invalid URL
        }
      }
    }
    
    // If there are lines between title and URL, use as summary
    const nonTitleNonUrlLines = lines.slice(1).filter(l => !l.match(/https?:\/\//));
    if (nonTitleNonUrlLines.length > 0) {
      item.summary = nonTitleNonUrlLines.join(' ');
    }
    
    items.push(item);
  }
  
  return { items };
}

/**
 * Generate the news briefing script
 */
export async function generateBriefingScript(params: GenerateScriptParams): Promise<GeneratedScript> {
  const {
    categorySlug,
    narratorName,
    state,
    isPersonalized,
    firstName = 'Marc', // Default for preview
    newsItems,
    toneStyle = 'warm, professional radio broadcaster',
    durationMinutes = 3,
    customPrompt,
  } = params;
  
  // Determine timezone
  const timezone = state ? getTimezoneFromState(state) : 'America/New_York';
  const greetingTimeOfDay = getGreetingTimeOfDay(timezone);
  const dateSpoken = formatSpokenDate(timezone);
  const categoryDisplayName = getCategoryDisplayName(categorySlug, state);
  
  // Calculate word count target (130 WPM)
  const wordCountTarget = Math.round(durationMinutes * 130);
  
  // Build template params for intro/outro
  const templateParams: TemplateParams = {
    greetingTimeOfDay,
    firstName: isPersonalized ? firstName : undefined,
    narratorName,
    category: categoryDisplayName,
    dateSpoken,
    isPersonalized,
  };
  
  // Generate intro and outro using templates
  const intro = renderIntro(templateParams);
  const outro = renderOutro(templateParams);
  
  // Generate body using Claude
  const body = await generateBody({
    categoryDisplayName,
    newsItems,
    toneStyle,
    durationMinutes,
    wordCountTarget,
    customPrompt,
  });
  
  // Count words in body
  const wordCount = body.split(/\s+/).length;
  
  return {
    intro,
    body,
    outro,
    metadata: {
      categorySlug,
      isPersonalized,
      timezoneUsed: timezone,
      greetingTimeOfDay,
      dateSpoken,
      newsItemsCount: newsItems.length,
      wordCount,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate the body section using Claude
 */
async function generateBody(params: {
  categoryDisplayName: string;
  newsItems: NewsItem[];
  toneStyle: string;
  durationMinutes: number;
  wordCountTarget: number;
  customPrompt?: string;
}): Promise<string> {
  const { categoryDisplayName, newsItems, toneStyle, durationMinutes, wordCountTarget, customPrompt } = params;
  
  // Use custom prompt or default
  let prompt = customPrompt || DEFAULT_BODY_PROMPT;
  
  // Replace placeholders
  prompt = prompt.replace(/{CATEGORY}/g, categoryDisplayName);
  prompt = prompt.replace(/{DURATION_MINUTES}/g, String(durationMinutes));
  prompt = prompt.replace(/{WORD_COUNT_TARGET}/g, String(wordCountTarget));
  prompt = prompt.replace(/{TONE_STYLE}/g, toneStyle);
  prompt = prompt.replace(/{NEWS_ITEMS_JSON}/g, JSON.stringify(newsItems, null, 2));
  
  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    const text = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';
    
    return text.trim();
  } catch (error) {
    console.error('[News Generator] Claude API error:', error);
    throw new Error('Failed to generate script body');
  }
}

/**
 * Get the default prompt template for a category
 */
export function getDefaultPromptTemplate(categorySlug: string): string {
  const categorySpecificRules: Record<string, string> = {
    'state': `
BODY content focus for State News:
- Cover the most important items in the specified state from the NEWS_ITEMS
- Prioritize: public safety, weather, politics, courts, education, local economy
- If sports items are included, cover college + pro + major local teams
- Each item: what happened + why it matters to people in this state`,
    
    'national': `
BODY content focus for National News:
- Cover the most important U.S. national stories from the NEWS_ITEMS
- Prioritize: government, public safety, economy, courts, major national-impact events
- Avoid celebrity/gossip unless it's a major story
- Each story: what happened + why it matters to everyday Americans`,
    
    'world': `
BODY content focus for World News:
- Cover the most important world stories from the NEWS_ITEMS that matter to Americans
- Prioritize: conflicts, diplomacy, major disasters, energy shocks, global economic impacts, major elections/leadership changes
- Each: what happened + why it matters`,
    
    'business': `
BODY content focus for Business News:
- Cover business/finance stories from the NEWS_ITEMS
- Prioritize: market-moving events, major earnings, inflation/jobs, Fed/interest rates, energy prices, major deals, big tech shifts, consumer impact
- For each: what happened + why it matters to prices, jobs, or wallets
- Avoid heavy jargon; define acronyms once if needed`,
    
    'sports': `
BODY content focus for Sports News:
- Cover sports stories from the NEWS_ITEMS trending in the U.S.
- Prioritize: major leagues (NFL/NBA/MLB/NHL/college), big games, trades, injuries, standings shifts, major events
- Keep it energetic but not shouty
- Each: what happened + why fans care right now`,
    
    'science': `
BODY content focus for Science & Tech News:
- Cover science/tech stories from the NEWS_ITEMS
- Prioritize: AI, cybersecurity, space missions, major research breakthroughs, big product/regulatory moves, climate/energy science
- Add a touch of wonder, but stay factual
- Each: what happened + why it matters + one plain-language sentence to explain the concept
- Avoid jargon; define acronyms once`,
  };
  
  const categoryRules = categorySpecificRules[categorySlug] || categorySpecificRules['national'];
  
  return DEFAULT_BODY_PROMPT.replace(
    'Each story: what happened + why it matters (1-2 sentences each)',
    categoryRules
  );
}
