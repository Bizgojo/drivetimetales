// FILE: app/api/admin/test-news-sources/route.ts
// STANDALONE - Does not touch any existing DTT code
// Safe to delete without affecting anything else

import { NextRequest, NextResponse } from 'next/server';

// ============================================
// TYPES
// ============================================

interface NewsStory {
  title: string;
  url: string;
  source: string;
  date: string;
  summary?: string;
  trendingScore?: number;
  fetchedContent?: string;
}

interface SourceResult {
  source: string;
  stories: NewsStory[];
  fetchTimeMs: number;
  error?: string;
  onTopicCount?: number;
  offTopicStories?: string[];
}

interface TestResult {
  category: string;
  timestamp: string;
  results: SourceResult[];
  comparison?: {
    source: string;
    storyCount: number;
    onTopicPercent: number;
    avgTrendingScore: number;
  }[];
}

// ============================================
// CATEGORY CONFIGURATIONS
// ============================================

const CATEGORY_CONFIG: Record<string, {
  gdeltQuery: string;
  gdeltTheme?: string;
  newsApiCategory?: string;
  worldNewsCategory?: string;
  excludeKeywords: string[];
  expectedKeywords: string[];
}> = {
  national: {
    gdeltQuery: 'congress OR "white house" OR federal OR legislation OR government',
    gdeltTheme: 'TAX_FNCACT_GOVERNMENT',
    newsApiCategory: 'general',
    worldNewsCategory: 'politics',
    excludeKeywords: ['sports', 'nfl', 'nba', 'mlb', 'celebrity', 'entertainment', 'stock', 'earnings'],
    expectedKeywords: ['congress', 'senate', 'house', 'president', 'federal', 'legislation', 'government', 'bill', 'law', 'policy']
  },
  business: {
    gdeltQuery: 'market OR stocks OR economy OR earnings OR CEO OR "wall street"',
    gdeltTheme: 'TAX_WORLDBUSINESS',
    newsApiCategory: 'business',
    worldNewsCategory: 'business',
    excludeKeywords: ['sports', 'nfl', 'nba', 'celebrity', 'entertainment'],
    expectedKeywords: ['market', 'stock', 'economy', 'earnings', 'ceo', 'company', 'business', 'trade', 'inflation', 'fed']
  },
  sports: {
    gdeltQuery: 'NFL OR NBA OR MLB OR NHL OR championship OR game OR player OR coach',
    gdeltTheme: 'SPORT',
    newsApiCategory: 'sports',
    worldNewsCategory: 'sports',
    excludeKeywords: ['politics', 'congress', 'economy', 'stock'],
    expectedKeywords: ['game', 'score', 'player', 'team', 'championship', 'nfl', 'nba', 'mlb', 'nhl', 'coach', 'win', 'loss']
  },
  science: {
    gdeltQuery: 'research OR NASA OR AI OR technology OR discovery OR scientists',
    gdeltTheme: 'TAX_SCIENCE',
    newsApiCategory: 'technology',
    worldNewsCategory: 'science',
    excludeKeywords: ['sports', 'celebrity', 'politics', 'congress'],
    expectedKeywords: ['research', 'study', 'scientists', 'nasa', 'space', 'ai', 'technology', 'discovery', 'experiment']
  },
  world: {
    gdeltQuery: 'international OR foreign OR global OR "united nations"',
    gdeltTheme: 'TAX_WORLDPOLITICS',
    newsApiCategory: 'general',
    worldNewsCategory: 'world',
    excludeKeywords: ['domestic', 'us politics', 'sports', 'celebrity'],
    expectedKeywords: ['international', 'foreign', 'global', 'country', 'minister', 'diplomatic', 'treaty']
  },
  state: {
    gdeltQuery: '', // Will be set dynamically with state name
    newsApiCategory: 'general',
    worldNewsCategory: 'politics',
    excludeKeywords: ['national', 'federal', 'international', 'sports'],
    expectedKeywords: ['governor', 'state', 'local', 'county', 'mayor', 'legislature']
  }
};

// ============================================
// GDELT FETCHER
// ============================================

async function fetchGDELT(category: string, state?: string): Promise<SourceResult> {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  
  try {
    // Build query
    let query = config.gdeltQuery;
    if (category === 'state' && state) {
      query = `"${state}"`;
    }
    
    // Add theme if available
    if (config.gdeltTheme) {
      query += ` theme:${config.gdeltTheme}`;
    }
    
    // GDELT DOC API - get articles sorted by relevance (trending)
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?` +
      `query=${encodeURIComponent(query)}&` +
      `mode=artlist&` +
      `maxrecords=20&` +
      `sort=hybridrel&` +
      `timespan=24h&` +
      `format=json`;
    
    const response = await fetch(url, { 
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    
    if (!response.ok) {
      throw new Error(`GDELT API returned ${response.status}`);
    }
    
    const data = await response.json();
    const articles = data.articles || [];
    
    // Map to our format
    const stories: NewsStory[] = articles.map((article: any) => ({
      title: article.title || 'No title',
      url: article.url || '',
      source: article.domain || 'unknown',
      date: article.seendate || new Date().toISOString(),
      trendingScore: article.socialimage ? 100 : 50 // Proxy: articles with images tend to be more prominent
    }));
    
    // Check on-topic
    const { onTopicCount, offTopicStories } = checkOnTopic(stories, config);
    
    return {
      source: 'GDELT',
      stories,
      fetchTimeMs: Date.now() - startTime,
      onTopicCount,
      offTopicStories
    };
    
  } catch (error: any) {
    return {
      source: 'GDELT',
      stories: [],
      fetchTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown error'
    };
  }
}

// ============================================
// NEWSAPI FETCHER
// ============================================

async function fetchNewsAPI(category: string): Promise<SourceResult> {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return {
      source: 'NewsAPI',
      stories: [],
      fetchTimeMs: Date.now() - startTime,
      error: 'NEWSAPI_KEY not configured'
    };
  }
  
  try {
    const url = `https://newsapi.org/v2/top-headlines?` +
      `country=us&` +
      `category=${config.newsApiCategory || 'general'}&` +
      `pageSize=20&` +
      `apiKey=${apiKey}`;
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`NewsAPI returned ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    const articles = data.articles || [];
    
    const stories: NewsStory[] = articles.map((article: any) => ({
      title: article.title || 'No title',
      url: article.url || '',
      source: article.source?.name || 'unknown',
      date: article.publishedAt || new Date().toISOString(),
      summary: article.description || ''
    }));
    
    const { onTopicCount, offTopicStories } = checkOnTopic(stories, config);
    
    return {
      source: 'NewsAPI',
      stories,
      fetchTimeMs: Date.now() - startTime,
      onTopicCount,
      offTopicStories
    };
    
  } catch (error: any) {
    return {
      source: 'NewsAPI',
      stories: [],
      fetchTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown error'
    };
  }
}

// ============================================
// WORLD NEWS API FETCHER
// ============================================

async function fetchWorldNewsAPI(category: string): Promise<SourceResult> {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  
  const apiKey = process.env.WORLD_NEWS_API_KEY;
  if (!apiKey) {
    return {
      source: 'World News API',
      stories: [],
      fetchTimeMs: Date.now() - startTime,
      error: 'WORLD_NEWS_API_KEY not configured'
    };
  }
  
  try {
    // Build query based on category
    const categoryMap: Record<string, string> = {
      national: 'politics',
      business: 'business',
      sports: 'sports',
      science: 'science',
      world: 'world',
      state: 'politics'
    };
    
    const url = `https://api.worldnewsapi.com/search-news?` +
      `source-countries=us&` +
      `language=en&` +
      `number=20&` +
      `sort=publish-time&` +
      `sort-direction=DESC&` +
      `api-key=${apiKey}`;
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`World News API returned ${response.status}`);
    }
    
    const data = await response.json();
    const articles = data.news || [];
    
    const stories: NewsStory[] = articles.map((article: any) => ({
      title: article.title || 'No title',
      url: article.url || '',
      source: article.source || 'unknown',
      date: article.publish_date || new Date().toISOString(),
      summary: article.text?.substring(0, 300) || ''
    }));
    
    const { onTopicCount, offTopicStories } = checkOnTopic(stories, config);
    
    return {
      source: 'World News API',
      stories,
      fetchTimeMs: Date.now() - startTime,
      onTopicCount,
      offTopicStories
    };
    
  } catch (error: any) {
    return {
      source: 'World News API',
      stories: [],
      fetchTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown error'
    };
  }
}

// ============================================
// REUTERS WIRE API FETCHER (Experimental)
// ============================================

async function fetchReutersWire(category: string): Promise<SourceResult> {
  const startTime = Date.now();
  const config = CATEGORY_CONFIG[category];
  
  try {
    // Map category to Reuters feed
    const feedMap: Record<string, string> = {
      national: 'politics',
      business: 'business',
      sports: 'sports',
      science: 'tech',
      world: 'world',
      state: 'wire'
    };
    
    const feed = feedMap[category] || 'wire';
    const url = `https://wireapi.reuters.com/v8/feed/rapp/us/tabbar/feeds/${feed}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Reuters Wire API returned ${response.status}`);
    }
    
    const data = await response.json();
    const articles = data.wireFeed?.story || data.story || [];
    
    const stories: NewsStory[] = articles.slice(0, 20).map((article: any) => ({
      title: article.headline || article.title || 'No title',
      url: article.url || article.canonical_url || '',
      source: 'Reuters',
      date: article.updated || article.published || new Date().toISOString()
    }));
    
    const { onTopicCount, offTopicStories } = checkOnTopic(stories, config);
    
    return {
      source: 'Reuters Wire (Experimental)',
      stories,
      fetchTimeMs: Date.now() - startTime,
      onTopicCount,
      offTopicStories
    };
    
  } catch (error: any) {
    return {
      source: 'Reuters Wire (Experimental)',
      stories: [],
      fetchTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown error'
    };
  }
}

// ============================================
// ESPN API FETCHER (Sports Only)
// ============================================

async function fetchESPN(): Promise<SourceResult> {
  const startTime = Date.now();
  
  try {
    // Fetch news from multiple sports
    const sports = ['football/nfl', 'basketball/nba', 'baseball/mlb', 'hockey/nhl'];
    const allStories: NewsStory[] = [];
    
    for (const sport of sports) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/news?limit=5`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          const data = await response.json();
          const articles = data.articles || [];
          
          for (const article of articles) {
            allStories.push({
              title: article.headline || article.title || 'No title',
              url: article.links?.web?.href || '',
              source: 'ESPN',
              date: article.published || new Date().toISOString(),
              summary: article.description || ''
            });
          }
        }
      } catch (e) {
        // Continue with other sports if one fails
      }
    }
    
    return {
      source: 'ESPN (Experimental)',
      stories: allStories.slice(0, 20),
      fetchTimeMs: Date.now() - startTime,
      onTopicCount: allStories.length,
      offTopicStories: []
    };
    
  } catch (error: any) {
    return {
      source: 'ESPN (Experimental)',
      stories: [],
      fetchTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown error'
    };
  }
}

// ============================================
// ARTICLE CONTENT FETCHER
// ============================================

async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DTTBot/1.0)',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) {
      return '';
    }
    
    const html = await response.text();
    
    // Simple extraction: find first few paragraphs
    // Look for <p> tags and extract text
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([^<]+(?:<[^>]+>[^<]+)*)<\/p>/gi;
    let match;
    
    while ((match = pRegex.exec(html)) !== null && paragraphs.length < 3) {
      // Strip HTML tags from the paragraph content
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 50) { // Only meaningful paragraphs
        paragraphs.push(text);
      }
    }
    
    return paragraphs.join(' ').substring(0, 500);
    
  } catch (error) {
    return '';
  }
}

// ============================================
// ON-TOPIC CHECKER
// ============================================

function checkOnTopic(stories: NewsStory[], config: typeof CATEGORY_CONFIG[string]): {
  onTopicCount: number;
  offTopicStories: string[];
} {
  const offTopicStories: string[] = [];
  let onTopicCount = 0;
  
  for (const story of stories) {
    const titleLower = (story.title + ' ' + (story.summary || '')).toLowerCase();
    
    // Check for excluded keywords
    const hasExcluded = config.excludeKeywords.some(kw => titleLower.includes(kw.toLowerCase()));
    
    // Check for expected keywords
    const hasExpected = config.expectedKeywords.some(kw => titleLower.includes(kw.toLowerCase()));
    
    if (hasExcluded && !hasExpected) {
      offTopicStories.push(`"${story.title.substring(0, 60)}..." - contains excluded keyword`);
    } else {
      onTopicCount++;
    }
  }
  
  return { onTopicCount, offTopicStories };
}

// ============================================
// MAIN API HANDLER
// ============================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'national';
  const sources = searchParams.get('sources')?.split(',') || ['gdelt', 'newsapi', 'worldnews'];
  const state = searchParams.get('state') || 'South Carolina';
  const fetchContent = searchParams.get('fetchContent') === 'true';
  
  // Validate category
  if (!CATEGORY_CONFIG[category]) {
    return NextResponse.json({ error: `Invalid category: ${category}` }, { status: 400 });
  }
  
  const results: SourceResult[] = [];
  
  // Fetch from selected sources in parallel
  const fetchPromises: Promise<SourceResult>[] = [];
  
  if (sources.includes('gdelt')) {
    fetchPromises.push(fetchGDELT(category, category === 'state' ? state : undefined));
  }
  if (sources.includes('newsapi')) {
    fetchPromises.push(fetchNewsAPI(category));
  }
  if (sources.includes('worldnews')) {
    fetchPromises.push(fetchWorldNewsAPI(category));
  }
  if (sources.includes('reuters')) {
    fetchPromises.push(fetchReutersWire(category));
  }
  if (sources.includes('espn') && category === 'sports') {
    fetchPromises.push(fetchESPN());
  }
  
  const fetchedResults = await Promise.all(fetchPromises);
  results.push(...fetchedResults);
  
  // Optionally fetch article content for top stories from each source
  if (fetchContent) {
    for (const result of results) {
      if (result.stories.length > 0 && !result.error) {
        // Fetch content for top 3 stories
        const contentPromises = result.stories.slice(0, 3).map(async (story) => {
          story.fetchedContent = await fetchArticleContent(story.url);
          return story;
        });
        await Promise.all(contentPromises);
      }
    }
  }
  
  // Build comparison
  const comparison = results.map(r => ({
    source: r.source,
    storyCount: r.stories.length,
    onTopicPercent: r.stories.length > 0 ? Math.round((r.onTopicCount || 0) / r.stories.length * 100) : 0,
    avgTrendingScore: r.stories.length > 0 
      ? Math.round(r.stories.reduce((sum, s) => sum + (s.trendingScore || 0), 0) / r.stories.length)
      : 0,
    error: r.error
  }));
  
  const testResult: TestResult = {
    category,
    timestamp: new Date().toISOString(),
    results,
    comparison
  };
  
  return NextResponse.json(testResult);
}
