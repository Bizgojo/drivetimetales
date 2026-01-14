// lib/briefing-announcer-script.ts
// ============================================================================
// PROTECTED FILE - DO NOT MODIFY WITHOUT CAREFUL CONSIDERATION
// This file contains the announcer script templates for Drive Time Tales
// news briefings. Changes here affect how all news briefings sound.
// Last updated: January 14, 2026
// ============================================================================

/**
 * Get time-appropriate greeting (morning/afternoon/evening)
 */
export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function getGreeting(): string {
  return `Good ${getTimeOfDay()}`;
}

/**
 * Build the personalized user greeting
 * @param userName - User's first name (null for anonymous/welcome page visitors)
 */
export function buildUserGreeting(userName: string | null): string {
  const greeting = getGreeting();
  if (userName) {
    return `${greeting}, ${userName}.`;
  }
  return `${greeting}, and welcome.`;
}

/**
 * Build the narrator introduction
 * @param narratorName - Narrator's name from admin settings
 * @param categoryName - The news category being presented
 * @param timeOfDay - morning/afternoon/evening
 */
export function buildNarratorIntro(
  narratorName: string | null,
  categoryName: string,
  timeOfDay: 'morning' | 'afternoon' | 'evening'
): string {
  if (narratorName) {
    return `I'm ${narratorName}, and this is your ${timeOfDay} ${categoryName.toLowerCase()} briefing`;
  }
  return `This is your ${timeOfDay} ${categoryName.toLowerCase()} briefing`;
}

/**
 * Build the complete opening for a STATE news briefing
 */
export function buildStateNewsOpening(
  userName: string | null,
  narratorName: string | null,
  stateName: string,
  dateStr: string
): string {
  const greeting = getGreeting();
  const timeOfDay = getTimeOfDay();
  
  const userGreeting = userName 
    ? `${greeting}, ${userName}.`
    : `${greeting}, and welcome.`;
  
  const narratorIntro = narratorName 
    ? `I'm ${narratorName}, and this is your ${timeOfDay} news brief`
    : `This is your ${timeOfDay} news brief`;

  return `${userGreeting} ${narratorIntro} for the great state of ${stateName}. Today is ${dateStr}.`;
}

/**
 * Build the complete opening for a CATEGORY news briefing (national, sports, etc.)
 */
export function buildCategoryNewsOpening(
  userName: string | null,
  narratorName: string | null,
  categoryName: string,
  dateStr: string
): string {
  const greeting = getGreeting();
  const timeOfDay = getTimeOfDay();
  
  const userGreeting = userName 
    ? `${greeting}, ${userName}.`
    : `${greeting}, and thanks for tuning in.`;
  
  const narratorIntro = narratorName 
    ? `I'm ${narratorName}, bringing you your ${categoryName.toLowerCase()} briefing`
    : `This is your ${categoryName.toLowerCase()} briefing`;

  return `${userGreeting} ${narratorIntro} for ${dateStr}.`;
}

/**
 * Standard closing for all briefings
 */
export function buildClosing(categoryName: string): string {
  const closings = [
    `That's your ${categoryName.toLowerCase()} update. Stay safe out there, and we'll see you next time on Drive Time Tales.`,
    `That's your ${categoryName.toLowerCase()} update. Stay safe on the roads, and we'll catch you next time on Drive Time Tales.`,
    `That wraps up your ${categoryName.toLowerCase()} briefing. Drive safe, and we'll see you next time on Drive Time Tales.`,
  ];
  
  // Return a consistent closing (first one) - can be randomized if desired
  return closings[0];
}

/**
 * Standard closing for state news
 */
export function buildStateClosing(stateName: string): string {
  return `That's your ${stateName} news update. Stay safe out there, and we'll see you next time on Drive Time Tales.`;
}

// ============================================================================
// PROMPT TEMPLATES
// These are used by the generate-news API to instruct Claude
// ============================================================================

export const STATE_NEWS_PROMPT_TEMPLATE = `You are a professional radio news broadcaster for Drive Time Tales.

CRITICAL: Output ONLY the broadcast script. NO thinking, NO preamble, NO "I'll search" text. Start DIRECTLY with the greeting.

YOUR TASK:
1. Search for current {STATE} news
2. Write a radio script with {STORIES_COUNT} real stories
3. Vary your delivery style naturally - don't be robotic

EXACT OPENING FORMAT (start with this EXACTLY, then continue naturally):
"{OPENING}"

After the opening, continue with weather first, then other news stories. Use natural transitions like:
- "Let's start with your weather..."
- "Turning to the forecast..."
- "First up, your local weather..."

Then cover 4-5 more stories with varied transitions.

End with: "{CLOSING}"

IMPORTANT: Start your response with "Good" - nothing before it. Output ONLY the script.`;

export const CATEGORY_NEWS_PROMPT_TEMPLATE = `You are a professional radio news broadcaster for Drive Time Tales.

CRITICAL: Output ONLY the broadcast script. NO thinking, NO preamble, NO "I'll search" text. Start DIRECTLY with the greeting.

YOUR TASK:
1. Search for: "{SEARCH_QUERY}"
2. Write a radio script with {STORIES_COUNT} real stories
3. Sound like a natural broadcaster - vary your delivery

EXACT OPENING FORMAT (start with this EXACTLY, then continue naturally):
"{OPENING}"

After the opening, deliver the news stories with natural transitions like:
- "Our top story today..."
- "Leading the news..."
- "We begin with..."
- "In other news..."
- "Meanwhile..."
- "Also making headlines..."
- "And finally..."

End with: "{CLOSING}"

IMPORTANT: Start your response with "Good" - nothing before it. Output ONLY the script.`;

// ============================================================================
// SCRIPT CLEANING
// Removes Claude's thinking process from generated scripts
// ============================================================================

/**
 * Aggressively clean the script to remove ALL Claude thinking/preamble
 * The output should be ONLY the broadcast-ready script
 */
export function cleanScript(rawScript: string): string {
  let script = rawScript;
  
  // Remove markdown code blocks
  script = script.replace(/```[\s\S]*?```/g, '');
  
  // Remove bold markers
  script = script.replace(/\*\*/g, '');
  
  // Remove italic markers
  script = script.replace(/\*([^*]+)\*/g, '$1');
  
  // Remove excessive newlines
  script = script.replace(/\n{3,}/g, '\n\n');
  
  // Remove common Claude preamble patterns
  const preamblePatterns = [
    /^[\s\S]*?(?=Good morning)/i,
    /^[\s\S]*?(?=Good afternoon)/i,
    /^[\s\S]*?(?=Good evening)/i,
    /I'll search[\s\S]*?(?=Good)/i,
    /Let me search[\s\S]*?(?=Good)/i,
    /I found[\s\S]*?(?=Good)/i,
    /Here's the[\s\S]*?(?=Good)/i,
    /Here is the[\s\S]*?(?=Good)/i,
    /Based on[\s\S]*?(?=Good)/i,
    /After searching[\s\S]*?(?=Good)/i,
    /I've searched[\s\S]*?(?=Good)/i,
    /Now I'll write[\s\S]*?(?=Good)/i,
  ];
  
  for (const pattern of preamblePatterns) {
    script = script.replace(pattern, '');
  }
  
  // Find where the actual script starts - look for greeting patterns
  const greetingPatterns = [
    /Good morning/i,
    /Good afternoon/i,
    /Good evening/i,
  ];
  
  let scriptStart = -1;
  for (const pattern of greetingPatterns) {
    const match = script.search(pattern);
    if (match !== -1 && (scriptStart === -1 || match < scriptStart)) {
      scriptStart = match;
    }
  }
  
  // If we found a greeting, strip everything before it
  if (scriptStart > 0) {
    script = script.substring(scriptStart);
    console.log(`[Briefing Script] Stripped ${scriptStart} chars of preamble`);
  }
  
  // Remove any trailing meta-commentary
  const endPatterns = [
    /\n\n---[\s\S]*$/,
    /\n\nNote:[\s\S]*$/i,
    /\n\nSources:[\s\S]*$/i,
    /\n\nThis script[\s\S]*$/i,
    /\n\nI hope[\s\S]*$/i,
    /\n\nLet me know[\s\S]*$/i,
  ];
  
  for (const pattern of endPatterns) {
    script = script.replace(pattern, '');
  }
  
  return script.trim();
}
