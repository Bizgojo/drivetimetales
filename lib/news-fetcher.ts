// lib/news-fetcher.ts
// Fetches top stories from RSS feeds for News, Science, and Sports

import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'DriveTimeTales/1.0 News Aggregator'
  }
});

// RSS Feed sources organized by category
const RSS_FEEDS = {
  news: [
    { name: 'AP News', url: 'https://rsshub.app/apnews/topics/apf-topnews' },
    { name: 'Reuters', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best' },
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  ],
  science: [
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml' },
    { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
    { name: 'NPR Science', url: 'https://feeds.npr.org/1007/rss.xml' },
    { name: 'Ars Technica Science', url: 'https://feeds.arstechnica.com/arstechnica/science' },
  ],
  sports: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news' },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/' },
    { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/' },
  ]
};

export interface NewsStory {
  title: string;
  summary: string;
  source: string;
  link: string;
  pubDate: string;
  category: 'news' | 'science' | 'sports';
}

interface FetchResult {
  news: NewsStory[];
  science: NewsStory[];
  sports: NewsStory[];
  fetchedAt: string;
  errors: string[];
}

// Fetch stories from a single RSS feed
async function fetchFeed(
  feedUrl: string, 
  feedName: string, 
  category: 'news' | 'science' | 'sports'
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
  // Remove HTML tags
  let clean = text.replace(/<[^>]*>/g, '');
  // Decode HTML entities
  clean = clean.replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/&nbsp;/g, ' ');
  // Truncate to reasonable length
  if (clean.length > 500) {
    clean = clean.substring(0, 497) + '...';
  }
  return clean.trim();
}

// Deduplicate stories by title similarity
function deduplicateStories(stories: NewsStory[]): NewsStory[] {
  const seen = new Set<string>();
  return stories.filter(story => {
    // Create a normalized key from the title
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
    return dateB - dateA; // Newest first
  });
}

// Main function: fetch top stories for all categories
export async function fetchTopStories(storiesPerCategory: number = 5): Promise<FetchResult> {
  const errors: string[] = [];
  const results: FetchResult = {
    news: [],
    science: [],
    sports: [],
    fetchedAt: new Date().toISOString(),
    errors: []
  };

  // Fetch all feeds in parallel
  const fetchPromises: Promise<void>[] = [];

  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    for (const feed of feeds) {
      fetchPromises.push(
        fetchFeed(feed.url, feed.name, category as 'news' | 'science' | 'sports')
          .then(stories => {
            results[category as keyof typeof results] = [
              ...(results[category as keyof typeof results] as NewsStory[]),
              ...stories
            ];
          })
          .catch(err => {
            errors.push(`${feed.name}: ${err.message}`);
          })
      );
    }
  }

  await Promise.allSettled(fetchPromises);

  // Process each category: dedupe, sort, take top N
  for (const category of ['news', 'science', 'sports'] as const) {
    let stories = results[category] as NewsStory[];
    stories = deduplicateStories(stories);
    stories = sortByRecency(stories);
    results[category] = stories.slice(0, storiesPerCategory);
  }

  results.errors = errors;
  return results;
}

// Format stories for display/logging
export function formatStoriesForLog(result: FetchResult): string {
  let output = `=== News Fetch Results (${result.fetchedAt}) ===\n\n`;
  
  for (const category of ['news', 'science', 'sports'] as const) {
    output += `--- ${category.toUpperCase()} ---\n`;
    const stories = result[category] as NewsStory[];
    stories.forEach((story, i) => {
      output += `${i + 1}. ${story.title} (${story.source})\n`;
    });
    output += '\n';
  }
  
  if (result.errors.length > 0) {
    output += `--- ERRORS ---\n${result.errors.join('\n')}\n`;
  }
  
  return output;
}
