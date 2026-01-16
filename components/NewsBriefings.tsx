/**
 * ============================================================================
 * DTT PROTECTED MODULE - DO NOT MODIFY WITHOUT MARC'S PERMISSION
 * ============================================================================
 * 
 * FILE: 02_HomePage/c_NewsBriefings.tsx
 * VERSION: 2026-01-16 3:30pm
 * STATUS: APPROVED BY MARC
 * PROTECTED: YES
 * 
 * DESCRIPTION:
 * News Briefings section with 6 categories in specific order and colors
 * Order: State (red) → National (blue) → World (green) → Business (yellow) → Sports (orange) → Sci/Tech (purple)
 * 
 * FEATURES:
 * - Green dot = audio available
 * - Red dot = no audio yet
 * - Pulsing green dot = currently playing
 * - State category shows user's registered state name
 * 
 * PROPS:
 * - newsEpisodes: Record<string, NewsEpisode> - Available episodes by category
 * - userState: string - User's state for State News label
 * - playingCategory: string | null - Currently playing category
 * - onPlayNews: (category: string) => void - Play handler
 * 
 * DATABASE:
 * - news_episodes table: id, category, audio_url, is_live
 * - users.state from database
 * 
 * QUERY FOR NEWS EPISODES:
 * .from('news_episodes').select('id, category, audio_url, is_live').eq('is_live', true)
 * 
 * ============================================================================
 */

// News categories - FIXED ORDER AND COLORS - DO NOT CHANGE
const NEWS_CATEGORIES = [
  { id: 'state', name: 'State', icon: '🏛️', color: 'from-red-600 to-red-800' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-blue-600 to-blue-800' },
  { id: 'international', name: 'World', icon: '🌍', color: 'from-green-600 to-green-800' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-yellow-600 to-yellow-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-orange-600 to-orange-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

// State abbreviation to full name mapping
const STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
}

interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

interface NewsBriefingsProps {
  newsEpisodes: Record<string, NewsEpisode>
  userState: string
  playingCategory: string | null
  onPlayNews: (category: string) => void
}

export function NewsBriefings({ newsEpisodes, userState, playingCategory, onPlayNews }: NewsBriefingsProps) {
  
  // Get full state name from abbreviation or return as-is
  const getStateName = () => {
    if (!userState) return 'State'
    const upper = userState.toUpperCase()
    return STATE_NAMES[upper] || userState
  }

  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-4">📰 News Briefings</h2>
      <p className="text-white text-sm mb-3">News Briefings are Free!</p>
      <div className="grid grid-cols-3 gap-3">
        {NEWS_CATEGORIES.map((cat) => {
          const episode = newsEpisodes[cat.id]
          const isAvailable = episode?.audio_url
          const isPlaying = playingCategory === cat.id
          const displayName = cat.id === 'state' ? getStateName() : cat.name

          return (
            <button
              key={cat.id}
              onClick={() => isAvailable && onPlayNews(cat.id)}
              disabled={!isAvailable}
              className={`relative p-4 rounded-xl text-center transition-all ${
                isAvailable 
                  ? `bg-gradient-to-br ${cat.color} hover:scale-105 cursor-pointer` 
                  : 'bg-slate-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="text-2xl mb-1">{cat.icon}</div>
              <div className="text-white text-xs font-medium">{displayName}</div>
              {/* Status indicator */}
              <div className="absolute top-2 right-2">
                {isPlaying ? (
                  <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse inline-block"></span>
                ) : isAvailable ? (
                  <span className="w-3 h-3 bg-green-500 rounded-full inline-block"></span>
                ) : (
                  <span className="w-3 h-3 bg-red-500 rounded-full inline-block"></span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// Export categories for use elsewhere
export { NEWS_CATEGORIES }
