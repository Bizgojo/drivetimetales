/*
================================================================================
📡 NEWS SOURCES - GDELT & World News API
================================================================================
Location: ~/Projects/drivetimetales/lib/news-sources.ts
Purpose: Fetches news from GDELT (state) and World News API (national, world, etc.)

API Keys:
- GDELT: No API key required (free)
- World News API: Stored in WORLD_NEWS_API_KEY env variable

================================================================================
*/

// Types
export interface NewsArticle {
  title: string
  summary: string
  source: string
  url: string
  publishedAt: string
  image?: string
}

export interface NewsFetchResult {
  category: string
  articles: NewsArticle[]
  source: 'gdelt' | 'worldnews'
  fetchedAt: string
  error?: string
}

// World News API configuration
const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY || '061ca0eb1ffa4837aecfd2ba77a5a511'
const WORLD_NEWS_BASE_URL = 'https://api.worldnewsapi.com'

// GDELT configuration
const GDELT_BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc'

/**
 * Fetch news from World News API
 * Used for: national, world, business, sports, scitech
 */
export async function fetchWorldNews(
  category: 'national' | 'world' | 'business' | 'sports' | 'scitech',
  limit: number = 10
): Promise<NewsFetchResult> {
  try {
    // Map our categories to World News API parameters
    const categoryMap: Record<string, { text?: string; sourceCountry?: string }> = {
      national: { text: 'USA news politics government', sourceCountry: 'us' },
      world: { text: 'international global foreign affairs' },
      business: { text: 'business economy finance markets stocks' },
      sports: { text: 'sports NFL NBA MLB soccer football basketball' },
      scitech: { text: 'technology science AI artificial intelligence space' }
    }

    const params = categoryMap[category]
    const queryParams = new URLSearchParams({
      'api-key': WORLD_NEWS_API_KEY,
      'number': limit.toString(),
      'sort': 'publish-time',
      'sort-direction': 'DESC',
      'language': 'en'
    })

    if (params.text) {
      queryParams.append('text', params.text)
    }
    if (params.sourceCountry) {
      queryParams.append('source-countries', params.sourceCountry)
    }

    const response = await fetch(`${WORLD_NEWS_BASE_URL}/search-news?${queryParams}`)
    
    if (!response.ok) {
      throw new Error(`World News API error: ${response.status}`)
    }

    const data = await response.json()

    const articles: NewsArticle[] = (data.news || []).map((article: any) => ({
      title: article.title || '',
      summary: article.text?.substring(0, 500) || article.summary || '',
      source: article.source || 'Unknown',
      url: article.url || '',
      publishedAt: article.publish_date || new Date().toISOString(),
      image: article.image
    }))

    return {
      category,
      articles,
      source: 'worldnews',
      fetchedAt: new Date().toISOString()
    }
  } catch (error) {
    console.error(`[WorldNews] Error fetching ${category}:`, error)
    return {
      category,
      articles: [],
      source: 'worldnews',
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Fetch news from GDELT
 * Used for: state/local news
 */
export async function fetchGdeltNews(
  stateCode: string,
  limit: number = 10
): Promise<NewsFetchResult> {
  try {
    // State name mapping for GDELT queries
    const stateNames: Record<string, string> = {
      'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
      'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
      'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
      'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
      'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
      'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
      'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
      'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
      'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
      'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
      'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
      'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
      'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'Washington DC'
    }

    const stateName = stateNames[stateCode.toUpperCase()] || stateCode

    // GDELT DOC API query for state news
    const queryParams = new URLSearchParams({
      query: `"${stateName}" sourcelang:eng`,
      mode: 'artlist',
      maxrecords: limit.toString(),
      format: 'json',
      sort: 'datedesc',
      timespan: '6h' // Last 6 hours
    })

    const response = await fetch(`${GDELT_BASE_URL}?${queryParams}`)
    
    if (!response.ok) {
      throw new Error(`GDELT API error: ${response.status}`)
    }

    const data = await response.json()

    const articles: NewsArticle[] = (data.articles || []).map((article: any) => ({
      title: article.title || '',
      summary: article.seendate ? `Published: ${article.seendate}` : '',
      source: article.domain || 'Unknown',
      url: article.url || '',
      publishedAt: article.seendate || new Date().toISOString(),
      image: article.socialimage
    }))

    return {
      category: 'state',
      articles,
      source: 'gdelt',
      fetchedAt: new Date().toISOString()
    }
  } catch (error) {
    console.error(`[GDELT] Error fetching state news:`, error)
    return {
      category: 'state',
      articles: [],
      source: 'gdelt',
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Fetch news for any category
 * Automatically routes to correct source
 */
export async function fetchNewsForCategory(
  category: string,
  stateCode?: string,
  limit: number = 10
): Promise<NewsFetchResult> {
  if (category === 'state') {
    if (!stateCode) {
      return {
        category: 'state',
        articles: [],
        source: 'gdelt',
        fetchedAt: new Date().toISOString(),
        error: 'State code required for state news'
      }
    }
    return fetchGdeltNews(stateCode, limit)
  }

  // All other categories use World News API
  return fetchWorldNews(category as any, limit)
}

/**
 * Format articles into text for prompt injection
 */
export function formatArticlesForPrompt(articles: NewsArticle[]): string {
  if (articles.length === 0) {
    return 'No news articles available.'
  }

  return articles.map((article, index) => {
    return `${index + 1}. ${article.title}
   Source: ${article.source}
   Summary: ${article.summary || 'No summary available'}
   Published: ${article.publishedAt}`
  }).join('\n\n')
}
