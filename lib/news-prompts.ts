/*
================================================================================
📰 NEWS BRIEFING PROMPTS
================================================================================
Location: ~/Projects/drivetimetales/lib/news-prompts.ts
Purpose: Stores all prompts for generating news briefings

IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all news prompts.
Edit prompts via Admin panel at /admin/news-briefings or directly in this file.

Categories:
- state: State/Local News (via GDELT)
- national: National News (via World News API)
- world: World/International News (via World News API)
- business: Business News (via World News API)
- sports: Sports News (via World News API)
- scitech: Science & Technology News (via World News API)

================================================================================
*/

export interface NewsPrompt {
  category: string
  name: string
  source: 'gdelt' | 'worldnews'
  prompt: string
  voice?: string
  tone?: string
  duration?: string
  lastUpdated: string
}

export const NEWS_PROMPTS: Record<string, NewsPrompt> = {
  state: {
    category: 'state',
    name: 'State News',
    source: 'gdelt',
    prompt: `[EDIT THIS PROMPT]

You are a news anchor for Drive Time Tales, delivering a state/local news briefing.

Using the following news headlines and summaries, write a conversational audio script.

Guidelines:
- Duration: approximately 2 minutes when read aloud
- Tone: [SET YOUR TONE]
- Style: [SET YOUR STYLE]
- Voice: [SET YOUR VOICE PREFERENCE]

News to cover:
{NEWS_CONTENT}

Write the script now:`,
    voice: '',
    tone: '',
    duration: '2 minutes',
    lastUpdated: new Date().toISOString()
  },

  national: {
    category: 'national',
    name: 'National News',
    source: 'worldnews',
    prompt: `[EDIT THIS PROMPT]

You are a news anchor for Drive Time Tales, delivering a national news briefing.

Using the following news headlines and summaries, write a conversational audio script.

Guidelines:
- Duration: approximately 2 minutes when read aloud
- Tone: [SET YOUR TONE]
- Style: [SET YOUR STYLE]
- Voice: [SET YOUR VOICE PREFERENCE]

News to cover:
{NEWS_CONTENT}

Write the script now:`,
    voice: '',
    tone: '',
    duration: '2 minutes',
    lastUpdated: new Date().toISOString()
  },

  world: {
    category: 'world',
    name: 'World News',
    source: 'worldnews',
    prompt: `[EDIT THIS PROMPT]

You are a news anchor for Drive Time Tales, delivering a world/international news briefing.

Using the following news headlines and summaries, write a conversational audio script.

Guidelines:
- Duration: approximately 2 minutes when read aloud
- Tone: [SET YOUR TONE]
- Style: [SET YOUR STYLE]
- Voice: [SET YOUR VOICE PREFERENCE]

News to cover:
{NEWS_CONTENT}

Write the script now:`,
    voice: '',
    tone: '',
    duration: '2 minutes',
    lastUpdated: new Date().toISOString()
  },

  business: {
    category: 'business',
    name: 'Business News',
    source: 'worldnews',
    prompt: `[EDIT THIS PROMPT]

You are a news anchor for Drive Time Tales, delivering a business news briefing.

Using the following news headlines and summaries, write a conversational audio script.

Guidelines:
- Duration: approximately 2 minutes when read aloud
- Tone: [SET YOUR TONE]
- Style: [SET YOUR STYLE]
- Voice: [SET YOUR VOICE PREFERENCE]

News to cover:
{NEWS_CONTENT}

Write the script now:`,
    voice: '',
    tone: '',
    duration: '2 minutes',
    lastUpdated: new Date().toISOString()
  },

  sports: {
    category: 'sports',
    name: 'Sports News',
    source: 'worldnews',
    prompt: `[EDIT THIS PROMPT]

You are a news anchor for Drive Time Tales, delivering a sports news briefing.

Using the following news headlines and summaries, write a conversational audio script.

Guidelines:
- Duration: approximately 2 minutes when read aloud
- Tone: [SET YOUR TONE]
- Style: [SET YOUR STYLE]
- Voice: [SET YOUR VOICE PREFERENCE]

News to cover:
{NEWS_CONTENT}

Write the script now:`,
    voice: '',
    tone: '',
    duration: '2 minutes',
    lastUpdated: new Date().toISOString()
  },

  scitech: {
    category: 'scitech',
    name: 'Sci/Tech News',
    source: 'worldnews',
    prompt: `[EDIT THIS PROMPT]

You are a news anchor for Drive Time Tales, delivering a science and technology news briefing.

Using the following news headlines and summaries, write a conversational audio script.

Guidelines:
- Duration: approximately 2 minutes when read aloud
- Tone: [SET YOUR TONE]
- Style: [SET YOUR STYLE]
- Voice: [SET YOUR VOICE PREFERENCE]

News to cover:
{NEWS_CONTENT}

Write the script now:`,
    voice: '',
    tone: '',
    duration: '2 minutes',
    lastUpdated: new Date().toISOString()
  }
}

// Helper function to get a prompt by category
export function getPrompt(category: string): NewsPrompt | null {
  return NEWS_PROMPTS[category] || null
}

// Helper function to get all prompts
export function getAllPrompts(): NewsPrompt[] {
  return Object.values(NEWS_PROMPTS)
}
