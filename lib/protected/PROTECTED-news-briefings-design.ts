// ============================================================================
// PROTECTED FILE - DO NOT MODIFY WITHOUT EXPLICIT USER REQUEST
// File: PROTECTED-news-briefings-design.ts
// Purpose: News briefings button design specification and functionality
// Last updated: January 15, 2026
// Status: LOCKED - Do not change without Marc's explicit permission
// ============================================================================

/**
 * NEWS BRIEFINGS DESIGN SPECIFICATION
 * ====================================
 * 
 * This file documents the exact design requirements for the news briefings
 * buttons on the DTT home page. These specifications are LOCKED and should
 * not be modified unless explicitly requested by Marc.
 */

// ============================================================================
// CATEGORY ORDER (DO NOT CHANGE)
// ============================================================================

/**
 * The six news categories must appear in this exact order:
 * 
 * Row 1: State News | National | World
 * Row 2: Business   | Sports   | Sci/Tech
 */

export const NEWS_CATEGORIES_ORDER = [
  'state',        // Position 1 - User's registered state
  'national',     // Position 2
  'international', // Position 3 - Displayed as "World"
  'business',     // Position 4
  'sports',       // Position 5
  'science',      // Position 6 - Displayed as "Sci/Tech"
]

// ============================================================================
// COLOR WHEEL COLORS (DO NOT CHANGE)
// ============================================================================

/**
 * Button colors are evenly distributed on the color wheel (60° apart)
 * These use darker gradient shades for the main buttons.
 */

export const NEWS_CATEGORY_COLORS = {
  state: 'from-red-600 to-red-800',           // Red (0°)
  national: 'from-orange-600 to-orange-800',  // Orange (60°)
  international: 'from-yellow-500 to-yellow-700', // Yellow (120°)
  business: 'from-green-600 to-green-800',    // Green (180°)
  sports: 'from-blue-600 to-blue-800',        // Blue (240°)
  science: 'from-purple-600 to-purple-800',   // Purple (300°)
}

// ============================================================================
// STATUS BADGE COLORS (DO NOT CHANGE)
// ============================================================================

/**
 * Status badges use lighter/contrasting colors from the main buttons.
 * These indicate the playback state of each briefing.
 */

export const STATUS_BADGE_COLORS = {
  new: 'bg-amber-400 text-black',      // Orange/Amber - New briefing available
  playing: 'bg-emerald-400 text-black', // Green - Currently playing
  paused: 'bg-sky-400 text-black',      // Blue - Paused by user
  played: 'bg-rose-400 text-white',     // Red - Finished playing
}

// ============================================================================
// CATEGORY DISPLAY NAMES (DO NOT CHANGE)
// ============================================================================

/**
 * How each category should be displayed to the user.
 * Note: "state" shows the user's registered state name from their profile.
 */

export const CATEGORY_DISPLAY_NAMES = {
  state: '{UserState} News',  // e.g., "South Carolina News"
  national: 'National',
  international: 'World',     // NOT "International"
  business: 'Business',
  sports: 'Sports',
  science: 'Sci/Tech',        // NOT "Science & Tech"
}

// ============================================================================
// CATEGORY ICONS (DO NOT CHANGE)
// ============================================================================

export const CATEGORY_ICONS = {
  state: '🏛️',
  national: '🇺🇸',
  international: '🌍',
  business: '💼',
  sports: '⚽',
  science: '🔬',
}

// ============================================================================
// PLAYBACK BEHAVIOR (DO NOT CHANGE)
// ============================================================================

/**
 * Button press behavior:
 * 
 * 1. Status "New" + Press → Starts playing, status → "Playing"
 * 2. Status "Playing" + Press → Pauses, status → "Paused"
 * 3. Status "Paused" + Press → Resumes from paused position, status → "Playing"
 * 4. Status "Played" + Press → Starts from beginning, status → "Playing"
 * 5. When audio ends naturally → status → "Played"
 * 6. When new briefing is generated → status resets to "New"
 * 
 * Additional behaviors:
 * - Playing one briefing pauses any other currently playing briefing
 * - Audio plays directly on home page (no navigation to another page)
 * - "▶ Now Playing" text shows below category name when playing
 */

export const PLAYBACK_STATES = {
  NEW: 'new',
  PLAYING: 'playing', 
  PAUSED: 'paused',
  PLAYED: 'played',
}

// ============================================================================
// STATE NAME HANDLING (DO NOT CHANGE)
// ============================================================================

/**
 * The State News button shows the user's registered state name.
 * 
 * - If state is an abbreviation (e.g., "SC"), convert to full name ("South Carolina")
 * - If state is already full name, use as-is
 * - If state is empty/null, show "State"
 * 
 * State is read from: users.state column in database
 * Set during: User registration (signup page)
 */

export const STATE_ABBREVIATIONS: Record<string, string> = {
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
  'WI': 'Wisconsin', 'WY': 'Wyoming'
}

// ============================================================================
// NO CREDITS BEHAVIOR (DO NOT CHANGE)
// ============================================================================

/**
 * When user has 0 credits and clicks a news briefing:
 * - Do NOT lock/gray out the buttons
 * - Play a spoken message using speech synthesis:
 * 
 * "Hi {userName}, this is your news briefing host. I'm glad you're back, 
 * but I'm sorry to inform you that you must have at least one credit in 
 * your account to hear the recent news briefings. Please buy more credits 
 * or upgrade your subscription. I look forward to seeing you soon. Goodbye!"
 */

// ============================================================================
// COMPLETE REACT COMPONENT REFERENCE
// ============================================================================

/**
 * This is the exact NEWS_CATEGORIES array to use in the home page:
 */

export const NEWS_CATEGORIES = [
  { id: 'state', name: 'State News', icon: '🏛️', color: 'from-red-600 to-red-800' },
  { id: 'national', name: 'National', icon: '🇺🇸', color: 'from-orange-600 to-orange-800' },
  { id: 'international', name: 'World', icon: '🌍', color: 'from-yellow-500 to-yellow-700' },
  { id: 'business', name: 'Business', icon: '💼', color: 'from-green-600 to-green-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-blue-600 to-blue-800' },
  { id: 'science', name: 'Sci/Tech', icon: '🔬', color: 'from-purple-600 to-purple-800' },
]

/**
 * This is the exact getStatusBadge function to use:
 */

export const getStatusBadgeCode = `
const getStatusBadge = (status: BriefingStatus | undefined, hasEpisode: boolean) => {
  if (!hasEpisode) return null
  
  switch (status) {
    case 'playing':
      return <span className="absolute top-1 right-1 bg-emerald-400 text-black text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-md">Playing</span>
    case 'paused':
      return <span className="absolute top-1 right-1 bg-sky-400 text-black text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-md">Paused</span>
    case 'played':
      return <span className="absolute top-1 right-1 bg-rose-400 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-md">Played</span>
    default:
      return <span className="absolute top-1 right-1 bg-amber-400 text-black text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-md">New</span>
  }
}
`

// ============================================================================
// END OF PROTECTED SPECIFICATION
// ============================================================================

export default {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_COLORS,
  STATUS_BADGE_COLORS,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_ICONS,
  PLAYBACK_STATES,
  STATE_ABBREVIATIONS,
}
