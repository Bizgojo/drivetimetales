import { NextRequest, NextResponse } from 'next/server';

interface NewsStory { title: string; url: string; source: string; date: string; fetchedContent?: string; contentSource?: string; description?: string; }
interface ContentFetchResult { story: NewsStory; contentFetchMs: number; contentLength: number; contentSource: string; }

const CATEGORY_CONFIG: Record<string, { newsApiCategory: string; categoryLabel: string }> = {
  national: { newsApiCategory: 'general', categoryLabel: 'National News' },
  business: { newsApiCategory: 'business', categoryLabel: 'Business News' },
  sports: { newsApiCategory: 'sports', categoryLabel: 'Sports News' },
  science: { newsApiCategory: 'technology', categoryLabel: 'Science & Technology News' },
  world: { newsApiCategory: 'general', categoryLabel: 'World News' },
  state: { newsApiCategory: 'general', categoryLabel: 'State News' }
};

async function fetchNewsAPITrending(category: string, state?: string) {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  const apiKey = process.env.NEWSAPI_KEY;
  
  if (!apiKey) {
    return { stories: [], fetchTimeMs: Date.now() - startTime, error: 'NEWSAPI_KEY not configured' };
  }
  
  try {
    let url: string;
    
    if (category === 'state' && state) {
      // Use everything endpoint for state-specific search
      url = `https://newsapi.org/v2/everything?q="${state}"&language=en&sortBy=publishedAt&pageSize=20&apiKey=${apiKey}`;
    } else if (category === 'world') {
      // World news - exclude US sources
      url = `https://newsapi.org/v2/top-headlines?category=${config.newsApiCategory}&language=en&pageSize=20&apiKey=${apiKey}`;
    } else {
      // US top headlines by category
      url = `https://newsapi.org/v2/top-headlines?country=us&category=${config.newsApiCategory}&pageSize=20&apiKey=${apiKey}`;
    }
    
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`NewsAPI returned ${response.status}: ${text.substring(0, 100)}`);
    }
    
    const data = await response.json();
    const articles = data.articles || [];
    
    // Filter out removed articles and duplicates
    const seenTitles = new Set<string>();
    const stories: NewsStory[] = [];
    
    for (const article of articles) {
      const title = article.title || '';
      if (!title || title === '[Removed]' || title.length < 20) continue;
      
      const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      
      stories.push({
        title,
        url: article.url || '',
        source: article.source?.name || '',
        date: article.publishedAt || new Date().toISOString(),
        description: article.description || ''
      });
    }
    
    return { stories: stories.slice(0, 10), fetchTimeMs: Date.now() - startTime };
  } catch (error: any) {
    return { stories: [], fetchTimeMs: Date.now() - startTime, error: error.message };
  }
}

async function fetchArticleContent(url: string) {
  try {
    if (!url) return { content: '', success: false };
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { content: '', success: false };
    const html = await response.text();
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([^<]+)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(html)) !== null && paragraphs.length < 5) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 80) paragraphs.push(text);
    }
    const content = paragraphs.join(' ').substring(0, 800);
    return { content, success: content.length > 100 };
  } catch { return { content: '', success: false }; }
}

async function fetchAllArticleContent(stories: NewsStory[]): Promise<ContentFetchResult[]> {
  return Promise.all(stories.map(async (story) => {
    const start = Date.now();
    // Use description from NewsAPI if available, otherwise try to fetch
    let content = story.description || '';
    let success = content.length > 50;
    
    if (!success) {
      const fetched = await fetchArticleContent(story.url);
      content = fetched.content;
      success = fetched.success;
    }
    
    return {
      story: { ...story, fetchedContent: content || undefined, contentSource: success ? 'direct' : 'failed' },
      contentFetchMs: Date.now() - start,
      contentLength: content.length,
      contentSource: success ? 'direct' : 'failed'
    } as ContentFetchResult;
  }));
}

function generateSamplePrompt(category: string, stories: NewsStory[]) {
  const config = CATEGORY_CONFIG[category];
  let prompt = `You are a professional radio news broadcaster for Drive Time Tales.

YOUR TASK: Write a 3-minute spoken news script for ${config.categoryLabel}.

RULES:
- Write for AUDIO - no visual references, spell out numbers
- Sound natural and conversational
- Cover the most important stories first
- Total length: approximately 450-500 words

STORIES TO COVER:
`;
  stories.forEach((s, i) => {
    prompt += `\n${i + 1}. "${s.title}" (${s.source})`;
    if (s.fetchedContent) {
      prompt += `\n   Context: ${s.fetchedContent.substring(0, 350)}...`;
    }
    prompt += '\n';
  });
  prompt += `\nWrite the complete script now. Start with a greeting and end with a sign-off.`;
  return prompt;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'national';
  const state = searchParams.get('state') || 'South Carolina';

  if (!CATEGORY_CONFIG[category]) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });

  const newsResult = await fetchNewsAPITrending(category, category === 'state' ? state : undefined);

  if (newsResult.error || newsResult.stories.length === 0) {
    return NextResponse.json({
      category,
      workflow: 'NewsAPI → Fetch → Claude',
      step1_trending: {
        source: 'NewsAPI',
        storiesFound: 0,
        fetchTimeMs: newsResult.fetchTimeMs,
        error: newsResult.error || 'No stories found',
        topStories: []
      },
      step2_content: null,
      finalStories: [],
      samplePrompt: 'No stories available.'
    });
  }

  const contentResults = await fetchAllArticleContent(newsResult.stories);
  const finalStories = contentResults.map(r => r.story);

  return NextResponse.json({
    category,
    timestamp: new Date().toISOString(),
    workflow: 'NewsAPI (top headlines) → Content Fetch → Claude',
    step1_trending: {
      source: 'NewsAPI',
      storiesFound: newsResult.stories.length,
      fetchTimeMs: newsResult.fetchTimeMs,
      topStories: newsResult.stories.slice(0, 5).map(s => ({ title: s.title, source: s.source }))
    },
    step2_content: {
      totalStories: contentResults.length,
      directFetchSuccess: contentResults.filter(r => r.contentSource === 'direct').length,
      directFetchFailed: contentResults.filter(r => r.contentSource === 'failed').length,
      avgContentLength: Math.round(contentResults.reduce((sum, r) => sum + r.contentLength, 0) / contentResults.length),
      fetchTimeMs: contentResults.reduce((sum, r) => sum + r.contentFetchMs, 0),
      results: contentResults
    },
    finalStories,
    samplePrompt: generateSamplePrompt(category, finalStories)
  });
}
