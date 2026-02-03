import { NextRequest, NextResponse } from 'next/server';

interface NewsStory { title: string; url: string; source: string; date: string; fetchedContent?: string; contentSource?: string; }
interface ContentFetchResult { story: NewsStory; contentFetchMs: number; contentLength: number; contentSource: string; }

const CATEGORY_CONFIG: Record<string, { gdeltQuery: string; categoryLabel: string }> = {
  national: { gdeltQuery: 'sourcecountry:US (congress OR senate OR "white house")', categoryLabel: 'National News' },
  business: { gdeltQuery: 'sourcecountry:US (stock market OR wall street OR economy)', categoryLabel: 'Business News' },
  sports: { gdeltQuery: 'sourcecountry:US (NFL OR NBA OR MLB OR NHL)', categoryLabel: 'Sports News' },
  science: { gdeltQuery: 'sourcecountry:US (NASA OR scientists OR research)', categoryLabel: 'Science & Technology News' },
  world: { gdeltQuery: 'sourcelang:english -sourcecountry:US international', categoryLabel: 'World News' },
  state: { gdeltQuery: '', categoryLabel: 'State News' }
};

async function fetchGDELTTrending(category: string, state?: string) {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  try {
    let query = category === 'state' && state ? `sourcecountry:US "${state}"` : config.gdeltQuery;
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=25&sort=hybridrel&timespan=24h&format=json`;
    
    const response = await fetch(gdeltUrl, { 
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }, 
      signal: AbortSignal.timeout(15000) 
    });
    
    if (!response.ok) throw new Error(`GDELT returned ${response.status}`);
    
    const text = await response.text();
    
    // Debug: log first 200 chars
    console.log('GDELT response start:', text.substring(0, 200));
    
    if (text.startsWith('<!') || text.startsWith('<html') || text.startsWith('<HTML')) {
      throw new Error('GDELT returned HTML - may be rate limited. Try again in a minute.');
    }
    
    if (!text.startsWith('{')) {
      throw new Error(`GDELT returned unexpected format: ${text.substring(0, 100)}`);
    }
    
    const data = JSON.parse(text);
    const articles = data.articles || [];
    
    // Filter to English articles only
    const englishArticles = articles.filter((a: any) => 
      !a.language || a.language === 'English' || a.language === 'english'
    );
    
    const seenTitles = new Set<string>();
    const stories: NewsStory[] = [];
    
    for (const article of englishArticles) {
      const title = article.title || '';
      if (!title || title.length < 20) continue;
      
      const titleKey = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);
      
      stories.push({ 
        title, 
        url: article.url || '', 
        source: article.domain || '', 
        date: article.seendate || new Date().toISOString() 
      });
    }
    
    return { stories: stories.slice(0, 10), fetchTimeMs: Date.now() - startTime, gdeltUrl };
  } catch (error: any) {
    return { stories: [], fetchTimeMs: Date.now() - startTime, error: error.message, gdeltUrl: '' };
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
    const { content, success } = await fetchArticleContent(story.url);
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
  let prompt = `You are a radio news broadcaster.\n\nWrite a 3-minute script for ${config.categoryLabel}.\n\nSTORIES:\n`;
  stories.forEach((s, i) => { 
    prompt += `\n${i + 1}. "${s.title}" (${s.source})\n${s.fetchedContent ? `Context: ${s.fetchedContent.substring(0, 300)}...` : ''}\n`; 
  });
  return prompt;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'national';
  const state = searchParams.get('state') || 'South Carolina';
  
  if (!CATEGORY_CONFIG[category]) return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  
  const gdeltResult = await fetchGDELTTrending(category, category === 'state' ? state : undefined);
  
  if (gdeltResult.error || gdeltResult.stories.length === 0) {
    return NextResponse.json({ 
      category, 
      workflow: 'GDELT → Fetch → Claude', 
      step1_trending: { 
        source: 'GDELT', 
        storiesFound: 0, 
        fetchTimeMs: gdeltResult.fetchTimeMs, 
        error: gdeltResult.error || 'No English stories found', 
        gdeltUrl: gdeltResult.gdeltUrl, 
        topStories: [] 
      }, 
      step2_content: null, 
      finalStories: [], 
      samplePrompt: 'No stories available.' 
    });
  }
  
  const contentResults = await fetchAllArticleContent(gdeltResult.stories);
  const finalStories = contentResults.map(r => r.story);
  
  return NextResponse.json({
    category,
    timestamp: new Date().toISOString(),
    workflow: 'GDELT (trending) → Direct Fetch (content) → Claude',
    step1_trending: { 
      source: 'GDELT', 
      storiesFound: gdeltResult.stories.length, 
      fetchTimeMs: gdeltResult.fetchTimeMs, 
      gdeltUrl: gdeltResult.gdeltUrl, 
      topStories: gdeltResult.stories.slice(0, 5).map(s => ({ title: s.title, source: s.source })) 
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
