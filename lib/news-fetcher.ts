// lib/news-fetcher.ts
// Fetches top stories from RSS feeds for 5 categories

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'DriveTimeTales/1.0 News Aggregator'
  }
});

// News category types
export type NewsCategory = 'national' | 'international' | 'business' | 'sports' | 'science';

export const NEWS_CATEGORIES: { id: NewsCategory; label: string; icon: string; color: string }[] = [
  { id: 'national', label: 'National News', icon: '🗞️', color: 'blue' },
  { id: 'international', label: 'International News', icon: '🌍', color: 'green' },
  { id: 'business', label: 'Business & Finance', icon: '💼', color: 'yellow' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: 'red' },
  { id: 'science', label: 'Science & Technology', icon: '🔬', color: 'purple' },
];

// Default RSS Feed sources organized by category
export const DEFAULT_RSS_FEEDS: Record<NewsCategory, { name: string; url: string; enabled: boolean }[]> = {
  national: [
    { name: 'AP News - US', url: 'https://rsshub.app/apnews/topics/apf-usnews', enabled: true },
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', enabled: true },
    { name: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main', enabled: true },
    { name: 'ABC News', url: 'https://abcnews.go.com/abcnews/topstories', enabled: false },
  ],
  international: [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', enabled: true },
    { name: 'AP News - World', url: 'https://rsshub.app/apnews/topics/apf-intlnews', enabled: true },
    { name: 'Reuters World', url: 'https://www.reutersagency.com/feed/?taxonomy=best-regions&post_type=best', enabled: true },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', enabled: false },
  ],
  business: [
    { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', enabled: true },
    { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', enabled: true },
    { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', enabled: true },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', enabled: false },
  ],
  sports: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', enabled: true },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/', enabled: true },
    { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/', enabled: true },
    { name: 'Bleacher Report', url: 'https://bleacherreport.com/articles/feed', enabled: false },
  ],
  science: [
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', enabled: true },
    { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', enabled: true },
    { name: 'NPR Science', url: 'https://feeds.npr.org/1007/rss.xml', enabled: true },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/science', enabled: true },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', enabled: false },
  ]
};

export interface NewsStory {
  title: string;
  summary: string;
  source: string;
  link: string;
  pubDate: string;
  category: NewsCategory;
}

export interface CategoryFetchResult {
  category: NewsCategory;
  stories: NewsStory[];
  fetchedAt: string;
  errors: string[];
}

export interface FetchResult {
  national: NewsStory[];
  international: NewsStory[];
  business: NewsStory[];
  sports: NewsStory[];
  science: NewsStory[];
  fetchedAt: string;
  errors: string[];
}

// Fetch stories from a single RSS feed
async function fetchFeed(
  feedUrl: string, 
  feedName: string, 
  category: NewsCategory
): Promise<NewsStory[]> {
  try {
    const feed = await parser.parseURL(feedUrl);
    return feed.items.slice(0, 10).map(item => ({
      title: item.title || 'Untitled',
      summary: cleanSummary(item.contentSnippet || item.content || item.description || ''),
      source: feedName,
      link: item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      category
    }));
  } catch (error) {
    console.error(`Failed to fetch ${feedName}:`, error);
    return [];
  }
}

// Clean and truncate summary text
function cleanSummary(text: string): string {
  let clean = text.replace(/<[^>]*>/g, '');
  clean = clean.replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&nbsp;/g, ' ');
  if (clean.length > 500) {
    clean = clean.substring(0, 497) + '...';
  }
  return clean.trim();
}

// Deduplicate stories by title similarity
function deduplicateStories(stories: NewsStory[]): NewsStory[] {
  const seen = new Set<string>();
  return stories.filter(story => {
    const key = story.title.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Sort stories by recency
function sortByRecency(stories: NewsStory[]): NewsStory[] {
  return stories.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime();
    const dateB = new Date(b.pubDate).getTime();
    return dateB - dateA;
  });
}

// Fetch stories for a single category
export async function fetchCategoryStories(
  category: NewsCategory,
  feeds: { name: string; url: string; enabled: boolean }[],
  storiesCount: number = 5
): Promise<CategoryFetchResult> {
  const errors: string[] = [];
  let stories: NewsStory[] = [];

  const enabledFeeds = feeds.filter(f => f.enabled);
  
  const fetchPromises = enabledFeeds.map(feed =>
    fetchFeed(feed.url, feed.name, category)
      .then(fetchedStories => { stories = [...stories, ...fetchedStories]; })
      .catch(err => { errors.push(`${feed.name}: ${err.message}`); })
  );

  await Promise.allSettled(fetchPromises);

  stories = sortByRecency(deduplicateStories(stories)).slice(0, storiesCount);

  return {
    category,
    stories,
    fetchedAt: new Date().toISOString(),
    errors
  };
}

// Main function: fetch top stories for all categories
export async function fetchTopStories(
  storiesPerCategory: number = 5,
  customFeeds?: Partial<Record<NewsCategory, { name: string; url: string; enabled: boolean }[]>>
): Promise<FetchResult> {
  const errors: string[] = [];
  const feeds = { ...DEFAULT_RSS_FEEDS, ...customFeeds };
  
  const results = await Promise.all(
    NEWS_CATEGORIES.map(cat => 
      fetchCategoryStories(cat.id, feeds[cat.id], storiesPerCategory)
    )
  );

  // Collect all errors
  results.forEach(r => errors.push(...r.errors));

  return {
    national: results.find(r => r.category === 'national')?.stories || [],
    international: results.find(r => r.category === 'international')?.stories || [],
    business: results.find(r => r.category === 'business')?.stories || [],
    sports: results.find(r => r.category === 'sports')?.stories || [],
    science: results.find(r => r.category === 'science')?.stories || [],
    fetchedAt: new Date().toISOString(),
    errors
  };
}

// Format stories for display/logging
export function formatStoriesForLog(result: FetchResult): string {
  let output = `=== News Fetch Results (${result.fetchedAt}) ===\n\n`;
  
  const categories: { key: keyof FetchResult; label: string }[] = [
    { key: 'national', label: 'NATIONAL NEWS' },
    { key: 'international', label: 'INTERNATIONAL NEWS' },
    { key: 'business', label: 'BUSINESS & FINANCE' },
    { key: 'sports', label: 'SPORTS' },
    { key: 'science', label: 'SCIENCE & TECHNOLOGY' },
  ];

  categories.forEach(cat => {
    const stories = result[cat.key];
    if (Array.isArray(stories)) {
      output += `--- ${cat.label} ---\n`;
      stories.forEach((story, i) => {
        output += `${i + 1}. ${story.title} (${story.source})\n`;
      });
      output += '\n';
    }
  });
  
  if (result.errors.length > 0) {
    output += `--- ERRORS ---\n${result.errors.join('\n')}\n`;
  }
  
  return output;
}
