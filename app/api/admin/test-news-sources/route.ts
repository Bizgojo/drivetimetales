import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

interface NewsStory { title: string; url: string; source: string; date: string; description?: string; fetchedContent?: string; contentSource?: string; contentNote?: string; }
interface ContentFetchResult { story: NewsStory; contentFetchMs: number; contentLength: number; }

const CATEGORY_CONFIG: Record<string, { newsApiCategory: string; categoryLabel: string }> = {
  national: { newsApiCategory: 'general', categoryLabel: 'National News' },
  business: { newsApiCategory: 'business', categoryLabel: 'Business News' },
  sports: { newsApiCategory: 'sports', categoryLabel: 'Sports News' },
  science: { newsApiCategory: 'technology', categoryLabel: 'Science & Technology News' },
  world: { newsApiCategory: 'general', categoryLabel: 'World News' },
  state: { newsApiCategory: 'general', categoryLabel: 'State News' }
};

// ============================================
// GDELT - Used for STATE news (works from Vercel)
// ============================================
async function fetchGDELT(state: string): Promise<{ stories: NewsStory[]; fetchTimeMs: number; error?: string }> {
  const startTime = Date.now();
  try {
    // Simple query with just the state name - this works!
    const query = encodeURIComponent(state);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=15&sort=datedesc&timespan=24h&format=json`;
    
    console.log('[GDELT] Fetching:', url);
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    
    if (!response.ok) throw new Error(`GDELT returned ${response.status}`);
    
    const text = await response.text();
    if (text.startsWith('<!') || text.startsWith('<html') || text.includes('Queries co')) {
      throw new Error('GDELT returned HTML instead of JSON');
    }
    
    const data = JSON.parse(text);
    const articles = data.articles || [];
    
    const seenTitles = new Set<string>();
    const stories: NewsStory[] = [];
    
    for (const article of articles) {
      const title = article.title || '';
      if (!title || title.length < 20) continue;
      
      // Filter to English only
      if (article.language && article.language !== 'English') continue;
      
      const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      
      stories.push({
        title,
        url: article.url || '',
        source: article.domain || article.source || 'News',
        date: article.seendate || new Date().toISOString(),
        description: ''
      });
    }
    
    return { stories: stories.slice(0, 10), fetchTimeMs: Date.now() - startTime };
  } catch (error: any) {
    console.error('[GDELT] Error:', error.message);
    return { stories: [], fetchTimeMs: Date.now() - startTime, error: error.message };
  }
}

// ============================================
// NewsAPI - Used for National, Business, Sports, Science, World
// ============================================
async function fetchNewsAPI(category: string): Promise<{ stories: NewsStory[]; fetchTimeMs: number; error?: string }> {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  const apiKey = process.env.NEWSAPI_KEY;
  
  if (!apiKey) return { stories: [], fetchTimeMs: Date.now() - startTime, error: 'NEWSAPI_KEY not configured' };

  try {
    let url: string;
    if (category === 'world') {
      url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=15&apiKey=${apiKey}`;
    } else {
      url = `https://newsapi.org/v2/top-headlines?country=us&category=${config.newsApiCategory}&pageSize=15&apiKey=${apiKey}`;
    }
    
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`NewsAPI ${response.status}`);
    
    const data = await response.json();
    const seenTitles = new Set<string>();
    const stories: NewsStory[] = [];
    
    for (const article of data.articles || []) {
      const title = article.title || '';
      if (!title || title === '[Removed]' || title.length < 20) continue;
      const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      stories.push({ title, url: article.url || '', source: article.source?.name || 'News', date: article.publishedAt || new Date().toISOString(), description: article.description || '' });
    }
    
    return { stories: stories.slice(0, 10), fetchTimeMs: Date.now() - startTime };
  } catch (error: any) {
    return { stories: [], fetchTimeMs: Date.now() - startTime, error: error.message };
  }
}

// ============================================
// Content Fetching
// ============================================
async function fetchArticleContent(url: string): Promise<{ content: string; success: boolean }> {
  try {
    if (!url) return { content: '', success: false };
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return { content: '', success: false };
    const html = await response.text();
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([^<]{50,})<\/p>/gi;
    let match;
    while ((match = pRegex.exec(html)) !== null && paragraphs.length < 4) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 80 && !text.toLowerCase().includes('cookie') && !text.toLowerCase().includes('subscribe')) paragraphs.push(text);
    }
    const content = paragraphs.join(' ').substring(0, 600);
    return { content, success: content.length > 100 };
  } catch { return { content: '', success: false }; }
}

async function fetchAllContent(stories: NewsStory[]): Promise<{ results: ContentFetchResult[]; source: string; note: string }> {
  const results = await Promise.all(stories.map(async (story) => {
    const start = Date.now();
    const fetched = await fetchArticleContent(story.url);
    if (fetched.success && fetched.content.length > 100) {
      return { story: { ...story, fetchedContent: fetched.content, contentSource: 'direct_fetch', contentNote: `Fetched from ${new URL(story.url).hostname}` }, contentFetchMs: Date.now() - start, contentLength: fetched.content.length };
    }
    if (story.description && story.description.length > 50) {
      return { story: { ...story, fetchedContent: story.description, contentSource: 'newsapi_desc', contentNote: 'Using NewsAPI description' }, contentFetchMs: Date.now() - start, contentLength: story.description.length };
    }
    return { story: { ...story, fetchedContent: '', contentSource: 'headline_only', contentNote: 'Headline only' }, contentFetchMs: Date.now() - start, contentLength: 0 };
  }));
  return { results, source: 'Direct URL Fetch + NewsAPI Description Fallback', note: 'We fetch article text from URLs. If blocked, we use the NewsAPI description.' };
}

// ============================================
// Claude Script Generation
// ============================================
async function generateClaudeScript(category: string, stories: NewsStory[], state?: string): Promise<{ script: string; generateTimeMs: number; error?: string; source: string; note: string }> {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  const source = 'Claude claude-sonnet-4-20250514';
  const note = 'Claude writes a natural radio script from the headlines and content.';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { script: '', generateTimeMs: 0, error: 'ANTHROPIC_API_KEY not configured', source, note };

  try {
    const anthropic = new Anthropic({ apiKey });
    const categoryLabel = category === 'state' && state ? `${state} News` : config.categoryLabel;
    const storiesList = stories.map((s, i) => `${i + 1}. "${s.title}" (${s.source})${s.fetchedContent ? `\n   Context: ${s.fetchedContent.substring(0, 300)}` : ''}`).join('\n\n');
    
    const prompt = `You are a professional radio news broadcaster for Drive Time Tales.

Write a 2-minute spoken news script for ${categoryLabel}.

RULES:
- Write for AUDIO - no visual references
- Sound natural and conversational
- Cover the top 3-4 stories only
- Spell out numbers
- Start with: "Good morning, I'm [Name] with your ${categoryLabel} briefing for today."
- End with a brief sign-off

STORIES:
${storiesList}

Write the complete script now:`;

    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] });
    let script = '';
    for (const block of response.content) { if (block.type === 'text') script += block.text; }
    return { script: script.trim(), generateTimeMs: Date.now() - startTime, source, note };
  } catch (error: any) {
    return { script: '', generateTimeMs: Date.now() - startTime, error: error.message, source, note };
  }
}

// ============================================
// Main Handler
// ============================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'national';
  const state = searchParams.get('state') || 'South Carolina';
  const generateScript = searchParams.get('generate') === 'true';

  if (!CATEGORY_CONFIG[category]) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });

  // STEP 1: Get trending stories
  let trendingResult;
  let trendingSource: string;
  let trendingNote: string;

  if (category === 'state') {
    // Use GDELT for state news
    trendingResult = await fetchGDELT(state);
    trendingSource = 'GDELT (Free, Real-time)';
    trendingNote = `Searches all news mentioning "${state}" from the last 24 hours, sorted by date.`;
  } else {
    // Use NewsAPI for other categories
    trendingResult = await fetchNewsAPI(category);
    trendingSource = 'NewsAPI Top Headlines';
    trendingNote = 'Top headlines from major US news sources, sorted by relevance.';
  }

  if (trendingResult.error || trendingResult.stories.length === 0) {
    return NextResponse.json({
      category,
      step1_trending: { source: trendingSource, note: trendingNote, storiesFound: 0, fetchTimeMs: trendingResult.fetchTimeMs, error: trendingResult.error || 'No stories found', stories: [] },
      step2_content: null,
      step3_claude: null
    });
  }

  // STEP 2: Fetch content
  const contentResult = await fetchAllContent(trendingResult.stories);

  // STEP 3: Optionally generate script
  let claudeResult = null;
  if (generateScript) {
    const storiesWithContent = contentResult.results.map(r => r.story);
    claudeResult = await generateClaudeScript(category, storiesWithContent, category === 'state' ? state : undefined);
  }

  return NextResponse.json({
    category,
    timestamp: new Date().toISOString(),
    step1_trending: {
      source: trendingSource,
      note: trendingNote,
      storiesFound: trendingResult.stories.length,
      fetchTimeMs: trendingResult.fetchTimeMs,
      stories: trendingResult.stories.map((s, i) => ({ rank: i + 1, title: s.title, source: s.source, url: s.url }))
    },
    step2_content: {
      source: contentResult.source,
      note: contentResult.note,
      totalStories: contentResult.results.length,
      directFetchCount: contentResult.results.filter(r => r.story.contentSource === 'direct_fetch').length,
      newsapiDescCount: contentResult.results.filter(r => r.story.contentSource === 'newsapi_desc').length,
      headlineOnlyCount: contentResult.results.filter(r => r.story.contentSource === 'headline_only').length,
      totalFetchTimeMs: contentResult.results.reduce((sum, r) => sum + r.contentFetchMs, 0),
      stories: contentResult.results.map(r => ({ title: r.story.title, source: r.story.source, contentSource: r.story.contentSource, contentNote: r.story.contentNote, contentLength: r.contentLength, contentPreview: r.story.fetchedContent ? r.story.fetchedContent.substring(0, 150) + '...' : null }))
    },
    step3_claude: claudeResult ? { source: claudeResult.source, note: claudeResult.note, generateTimeMs: claudeResult.generateTimeMs, error: claudeResult.error, script: claudeResult.script } : { source: 'Claude claude-sonnet-4-20250514', note: 'Click "Generate Script" to have Claude write a sample briefing', script: null }
  });
}
