// News Briefings - Intro/Outro Templates (MVP: 3 each, hardcoded)
// Deterministic selection based on hash of category + date + time_of_day + personalized

export interface TemplateParams {
  greetingTimeOfDay: 'morning' | 'afternoon' | 'evening';
  firstName?: string; // Only for personalized
  narratorName: string;
  category: string; // Display name like "National News" or "South Carolina"
  dateSpoken: string; // e.g., "Wednesday, February 4, 2026"
  isPersonalized: boolean;
}

// Intro templates - personalized versions
const INTRO_TEMPLATES_PERSONALIZED = [
  `Good {GREETING}, {FIRST_NAME}. I'm {NARRATOR}, bringing you your {CATEGORY} update for {DATE}.`,
  `Good {GREETING}, {FIRST_NAME}. This is {NARRATOR} with your {CATEGORY} briefing for {DATE}.`,
  `Hey {FIRST_NAME}, good {GREETING}. I'm {NARRATOR}, and here's your {CATEGORY} news for {DATE}.`,
];

// Intro templates - non-personalized versions
const INTRO_TEMPLATES_NON_PERSONALIZED = [
  `Good {GREETING}. I'm {NARRATOR}, bringing you your {CATEGORY} update for {DATE}.`,
  `Good {GREETING}. This is {NARRATOR} with your {CATEGORY} briefing for {DATE}.`,
  `Good {GREETING}, everyone. I'm {NARRATOR}, and here's your {CATEGORY} news for {DATE}.`,
];

// Outro templates - personalized versions
const OUTRO_TEMPLATES_PERSONALIZED = [
  `{FIRST_NAME}, thanks for spending a couple minutes with me. I'm {NARRATOR}. I'll be back later with your next update.`,
  `That's your {CATEGORY} update, {FIRST_NAME}. I'm {NARRATOR}, and I'll see you next time.`,
  `Thanks for listening, {FIRST_NAME}. I'm {NARRATOR}. Stay safe out there, and I'll have more for you soon.`,
];

// Outro templates - non-personalized versions
const OUTRO_TEMPLATES_NON_PERSONALIZED = [
  `Thanks for spending a couple minutes with me. I'm {NARRATOR}. I'll be back later with your next update.`,
  `That's your {CATEGORY} update. I'm {NARRATOR}, and I'll see you next time.`,
  `Thanks for listening. I'm {NARRATOR}. Stay safe out there, and I'll have more for you soon.`,
];

/**
 * Simple deterministic hash for template selection
 * Returns a number between 0 and max-1
 */
function deterministicHash(seed: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % max;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Select and render an intro template
 */
export function renderIntro(params: TemplateParams): string {
  const templates = params.isPersonalized 
    ? INTRO_TEMPLATES_PERSONALIZED 
    : INTRO_TEMPLATES_NON_PERSONALIZED;
  
  // Deterministic selection: same category + date + time_of_day + personalized = same template
  const seed = `${params.category}-${getTodayDateString()}-${params.greetingTimeOfDay}-${params.isPersonalized ? '1' : '0'}-intro`;
  const index = deterministicHash(seed, templates.length);
  
  let template = templates[index];
  
  // Replace placeholders
  template = template.replace(/{GREETING}/g, params.greetingTimeOfDay);
  template = template.replace(/{NARRATOR}/g, params.narratorName);
  template = template.replace(/{CATEGORY}/g, params.category);
  template = template.replace(/{DATE}/g, params.dateSpoken);
  if (params.isPersonalized && params.firstName) {
    template = template.replace(/{FIRST_NAME}/g, params.firstName);
  }
  
  return template;
}

/**
 * Select and render an outro template
 */
export function renderOutro(params: TemplateParams): string {
  const templates = params.isPersonalized 
    ? OUTRO_TEMPLATES_PERSONALIZED 
    : OUTRO_TEMPLATES_NON_PERSONALIZED;
  
  // Deterministic selection
  const seed = `${params.category}-${getTodayDateString()}-${params.greetingTimeOfDay}-${params.isPersonalized ? '1' : '0'}-outro`;
  const index = deterministicHash(seed, templates.length);
  
  let template = templates[index];
  
  // Replace placeholders
  template = template.replace(/{NARRATOR}/g, params.narratorName);
  template = template.replace(/{CATEGORY}/g, params.category);
  if (params.isPersonalized && params.firstName) {
    template = template.replace(/{FIRST_NAME}/g, params.firstName);
  }
  
  return template;
}

/**
 * Determine greeting time of day based on timezone
 * morning = 05:00–11:59
 * afternoon = 12:00–16:59
 * evening = 17:00–04:59
 */
export function getGreetingTimeOfDay(timezone: string): 'morning' | 'afternoon' | 'evening' {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(formatter.format(now), 10);
  
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Format date for spoken output
 * e.g., "Wednesday, February 4, 2026"
 */
export function formatSpokenDate(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return formatter.format(now);
}

/**
 * Get timezone from US state name
 * MVP: Simple mapping for common states
 */
export function getTimezoneFromState(state: string): string {
  const stateTimezones: Record<string, string> = {
    // Eastern
    'South Carolina': 'America/New_York',
    'North Carolina': 'America/New_York',
    'Georgia': 'America/New_York',
    'Florida': 'America/New_York',
    'Virginia': 'America/New_York',
    'New York': 'America/New_York',
    'Pennsylvania': 'America/New_York',
    'Ohio': 'America/New_York',
    'Michigan': 'America/New_York',
    'Massachusetts': 'America/New_York',
    'New Jersey': 'America/New_York',
    'Connecticut': 'America/New_York',
    'Maine': 'America/New_York',
    'Maryland': 'America/New_York',
    'Delaware': 'America/New_York',
    'Vermont': 'America/New_York',
    'New Hampshire': 'America/New_York',
    'Rhode Island': 'America/New_York',
    'West Virginia': 'America/New_York',
    'Kentucky': 'America/New_York',
    'Indiana': 'America/New_York',
    // Central
    'Texas': 'America/Chicago',
    'Illinois': 'America/Chicago',
    'Tennessee': 'America/Chicago',
    'Missouri': 'America/Chicago',
    'Wisconsin': 'America/Chicago',
    'Minnesota': 'America/Chicago',
    'Iowa': 'America/Chicago',
    'Kansas': 'America/Chicago',
    'Nebraska': 'America/Chicago',
    'Oklahoma': 'America/Chicago',
    'Louisiana': 'America/Chicago',
    'Arkansas': 'America/Chicago',
    'Mississippi': 'America/Chicago',
    'Alabama': 'America/Chicago',
    'North Dakota': 'America/Chicago',
    'South Dakota': 'America/Chicago',
    // Mountain
    'Colorado': 'America/Denver',
    'Arizona': 'America/Phoenix',
    'Utah': 'America/Denver',
    'New Mexico': 'America/Denver',
    'Wyoming': 'America/Denver',
    'Montana': 'America/Denver',
    'Idaho': 'America/Boise',
    // Pacific
    'California': 'America/Los_Angeles',
    'Washington': 'America/Los_Angeles',
    'Oregon': 'America/Los_Angeles',
    'Nevada': 'America/Los_Angeles',
    // Alaska/Hawaii
    'Alaska': 'America/Anchorage',
    'Hawaii': 'Pacific/Honolulu',
  };
  
  return stateTimezones[state] || 'America/New_York'; // Default to ET
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(categorySlug: string, state?: string): string {
  const names: Record<string, string> = {
    'state': state || 'State News',
    'national': 'national news',
    'world': 'world news',
    'business': 'business news',
    'sports': 'sports news',
    'science': 'science and tech news',
  };
  return names[categorySlug] || categorySlug;
}
