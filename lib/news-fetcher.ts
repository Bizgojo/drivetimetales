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
    { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  ],
  science: [
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml' },
    { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
    { name: 'NPR Science', url: 'https://feeds.npr.org/1007/rss.xml' },
  ],
  sports: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news' },
    { name: 'CBS Sports', url: 'https://www.cbssports.com/rss/headlines/' },
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

export interface FetchResult {
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

// Main function: fetch top stories for all categories
export async function fetchTopStories(storiesPerCategory: number = 5): Promise<FetchResult> {
  const errors: string[] = [];
  
  // Use separate arrays to collect stories
  let newsStories: NewsStory[] = [];
  let scienceStories: NewsStory[] = [];
  let sportsStories: NewsStory[] = [];

  // Fetch all feeds in parallel
  const fetchPromises: Promise<void>[] = [];

  for (const feed of RSS_FEEDS.news) {
    fetchPromises.push(
      fetchFeed(feed.url, feed.name, 'news')
        .then(stories => { newsStories = [...newsStories, ...stories]; })
        .catch(err => { errors.push(`${feed.name}: ${err.message}`); })
    );
  }

  for (const feed of RSS_FEEDS.science) {
    fetchPromises.push(
      fetchFeed(feed.url, feed.name, 'science')
        .then(stories => { scienceStories = [...scienceStories, ...stories]; })
        .catch(err => { errors.push(`${feed.name}: ${err.message}`); })
    );
  }

  for (const feed of RSS_FEEDS.sports) {
    fetchPromises.push(
      fetchFeed(feed.url, feed.name, 'sports')
        .then(stories => { sportsStories = [...sportsStories, ...stories]; })
        .catch(err => { errors.push(`${feed.name}: ${err.message}`); })
    );
  }

  await Promise.allSettled(fetchPromises);

  // Process each category: dedupe, sort, take top N
  newsStories = sortByRecency(deduplicateStories(newsStories)).slice(0, storiesPerCategory);
  scienceStories = sortByRecency(deduplicateStories(scienceStories)).slice(0, storiesPerCategory);
  sportsStories = sortByRecency(deduplicateStories(sportsStories)).slice(0, storiesPerCategory);

  return {
    news: newsStories,
    science: scienceStories,
    sports: sportsStories,
    fetchedAt: new Date().toISOString(),
    errors
  };
}

// Format stories for display/logging
export function formatStoriesForLog(result: FetchResult): string {
  let output = `=== News Fetch Results (${result.fetchedAt}) ===\n\n`;
  
  output += `--- NEWS ---\n`;
  result.news.forEach((story, i) => {
    output += `${i + 1}. ${story.title} (${story.source})\n`;
  });
  output += '\n';

  output += `--- SCIENCE ---\n`;
  result.science.forEach((story, i) => {
    output += `${i + 1}. ${story.title} (${story.source})\n`;
  });
  output += '\n';

  output += `--- SPORTS ---\n`;
  result.sports.forEach((story, i) => {
    output += `${i + 1}. ${story.title} (${story.source})\n`;
  });
  output += '\n';
  
  if (result.errors.length > 0) {
    output += `--- ERRORS ---\n${result.errors.join('\n')}\n`;
  }
  
  return output;
}
