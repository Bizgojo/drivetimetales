/**
 * DTT Working Code Library - 02_HomePage/c_NewsBriefings.tsx
 * 
 * CURRENT VERSION: 2026-01-15 4:00pm
 * STATUS: WORKING ✓ (PROTECTED - DO NOT MODIFY WITHOUT MARC'S PERMISSION)
 * 
 * VERSION HISTORY:
 * - 2026-01-15 4:00pm - Documented and saved to library
 * - 2026-01-15 1:06pm - Colors and order finalized by Marc
 * 
 * DEPENDS ON: 
 *   - news_episodes table (id, category, audio_url, is_live)
 *   - userCredits state
 *   - userState state (for state news name)
 * 
 * PROTECTED SPECIFICATIONS:
 *   - Order: State → National → World → Business → Sports → Sci/Tech
 *   - Colors: Color wheel (60° apart) - Red → Orange → Yellow → Green → Blue → Purple
 *   - Status badges: Amber=New, Emerald=Playing, Sky=Paused, Rose=Played
 *   - "International" displays as "World"
 *   - State news shows user's registered state name
 */

// ============================================
// TYPES
// ============================================
interface NewsEpisode {
  id: string
  category: string
  audio_url: string | null
  is_live: boolean
}

type BriefingStatus = 'new' | 'playing' | 'paused' | 'played'

// ============================================
// STATE NAME MAPPING
// ============================================
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
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
}

// ============================================
// NEWS CATEGORIES - PROTECTED ORDER AND COLORS
// ============================================
const NEWS_CATEGORIES = [
  { id: 'state', name: 'State News', icon: '🏛️', color: 'from-red-600 to-red-800' },        // Red (0°)
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-orange-500 to-orange-700' }, // Orange (60°)
  { id: 'international', name: 'World', icon: '🌍', color: 'from-yellow-500 to-yellow-700' }, // Yellow (120°)
  { id: 'business', name: 'Business', icon: '💼', color: 'from-green-600 to-green-800' },    // Green (180°)
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-blue-600 to-blue-800' },          // Blue (240°)
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },   // Purple (300°)
]

// ============================================
// STATE VARIABLES (add to component)
// ============================================
const [newsEpisodes, setNewsEpisodes] = useState<Record<string, NewsEpisode>>({})
const [briefingStatuses, setBriefingStatuses] = useState<Record<string, BriefingStatus>>({})
const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null)
const audioRef = useRef<HTMLAudioElement | null>(null)

// ============================================
// LOAD NEWS EPISODES (useEffect)
// ============================================
useEffect(() => {
  async function loadNews() {
    try {
      const { data } = await supabase
        .from('news_episodes')
        .select('id, category, audio_url, is_live')
        .eq('is_live', true)
      
      if (data) {
        const episodeMap: Record<string, NewsEpisode> = {}
        data.forEach(ep => { episodeMap[ep.category] = ep })
        setNewsEpisodes(episodeMap)
        
        const initialStatuses: Record<string, BriefingStatus> = {}
        NEWS_CATEGORIES.forEach(cat => { initialStatuses[cat.id] = 'new' })
        setBriefingStatuses(initialStatuses)
      }
    } catch (err) {
      console.error('[Home] News error:', err)
    }
  }
  loadNews()
}, [])

// ============================================
// PLAYBACK HANDLER
// ============================================
const handleBriefingClick = (categoryId: string) => {
  const episode = newsEpisodes[categoryId]
  const currentStatus = briefingStatuses[categoryId]

  if (userCredits <= 0) {
    const msg = new SpeechSynthesisUtterance("You don't have enough credits to play this briefing. Please purchase more credits.")
    window.speechSynthesis.speak(msg)
    return
  }

  if (!episode?.audio_url) return

  if (currentlyPlaying && currentlyPlaying !== categoryId) {
    if (audioRef.current) audioRef.current.pause()
    setBriefingStatuses(prev => ({ ...prev, [currentlyPlaying]: 'paused' }))
  }

  if (currentStatus === 'playing') {
    if (audioRef.current) audioRef.current.pause()
    setBriefingStatuses(prev => ({ ...prev, [categoryId]: 'paused' }))
    setCurrentlyPlaying(null)
  } else {
    if (!audioRef.current || audioRef.current.src !== episode.audio_url) {
      audioRef.current = new Audio(episode.audio_url)
      audioRef.current.onended = () => {
        setBriefingStatuses(prev => ({ ...prev, [categoryId]: 'played' }))
        setCurrentlyPlaying(null)
      }
    }
    audioRef.current.play()
    setBriefingStatuses(prev => ({ ...prev, [categoryId]: 'playing' }))
    setCurrentlyPlaying(categoryId)
  }
}

// ============================================
// STATUS BADGE HELPERS
// ============================================
const getStatusBadgeStyle = (status: BriefingStatus) => {
  switch (status) {
    case 'new': return 'bg-amber-400 text-black'
    case 'playing': return 'bg-emerald-400 text-black'
    case 'paused': return 'bg-sky-400 text-black'
    case 'played': return 'bg-rose-400 text-black'
    default: return 'bg-amber-400 text-black'
  }
}

const getStatusLabel = (status: BriefingStatus) => {
  switch (status) {
    case 'new': return 'New'
    case 'playing': return 'Playing'
    case 'paused': return 'Paused'
    case 'played': return 'Played'
    default: return 'New'
  }
}

// ============================================
// JSX COMPONENT
// ============================================
<section className="mb-8">
  <h2 className="text-lg font-bold mb-1">NEWS BRIEFINGS</h2>
  <p className="text-white text-xs mb-4">Top stories updated throughout the day</p>
  <div className="grid grid-cols-3 gap-3">
    {NEWS_CATEGORIES.map((cat) => {
      const status = briefingStatuses[cat.id] || 'new'
      const catName = cat.id === 'state' ? `${userState} News` : cat.name

      return (
        <button
          key={cat.id}
          onClick={() => handleBriefingClick(cat.id)}
          className={`relative p-4 rounded-xl text-center transition bg-gradient-to-br ${cat.color} hover:opacity-90`}
        >
          <span className={`absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusBadgeStyle(status)}`}>
            {getStatusLabel(status)}
          </span>
          <div className="text-2xl mb-1">{cat.icon}</div>
          <div className="text-xs font-medium text-white">{catName}</div>
        </button>
      )
    })}
  </div>
</section>
